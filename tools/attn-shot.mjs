#!/usr/bin/env node
/**
 * TEMPORARY AUDIT harness — attention contact sheet + controlled steering probe.
 *
 * Same freeze-then-shoot technique as tools/camshot.mjs, but the chair is PLACED so that
 * all three captures are the same instant in the same place, differing only in speed:
 * the start point is offset backwards by v * settle so every run arrives at the identical
 * target point with the identical heading and a fully settled effect chain.
 *
 *   node tools/attn-shot.mjs
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import net from 'node:net';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const LEVEL = 'ch1_office';
const SPEEDS = [0, 13, 15];

const freePort = () => new Promise((res) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});
const waitForServer = async (url) => {
  for (let i = 0; i < 160; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server never came up');
};

async function main() {
  if (!existsSync(`${ROOT}/dist/index.html`)) { console.error('run npm run build'); process.exit(2); }
  mkdirSync(`${ROOT}/shots`, { recursive: true });
  const port = await freePort();
  const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--enable-webgl', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'],
  });
  const report = { scout: null, steer: null, shots: [] };
  try {
    await waitForServer(url);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.game, null, { timeout: 120000 });
    await page.waitForTimeout(400);
    await page.evaluate(async ({ level }) => {
      const g = window.game;
      window.gameState?.setState?.('playing');
      g.loadLevel(level); g.start(); g.resume?.();
      document.getElementById('loading')?.classList.add('hidden');
    }, { level: LEVEL });
    await page.waitForTimeout(1200);

    // ---- 1. scout an open lane by DRIVING (guarantees real, grounded floor) ----
    report.scout = await page.evaluate(() => {
      const g = window.game;
      const DT = 1 / 60;
      g.isRunning = false;
      const fire = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c, bubbles: true }));
      const held = new Set();
      const setKeys = (codes) => {
        for (const c of Array.from(held)) if (!codes.includes(c)) { fire('keyup', c); held.delete(c); }
        for (const c of codes) if (!held.has(c)) { fire('keydown', c); held.add(c); }
      };
      const probe = (o, dx, dz, maxD) => {
        const h = g.physics.probeDirection(o, { x: dx, y: 0, z: dz }, maxD, g.chairBody);
        return h ? h.distance : maxD;
      };
      const yawOf = () => { const q = g.physics.getRotation(g.chairBody); return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x)); };
      const cands = [];
      const drive = (keys, frames) => {
        setKeys(keys);
        for (let i = 0; i < frames; i++) {
          g.fixedUpdate(DT);
          if (!g.playerState.isGrounded) continue;
          const p = g.physics.getPosition(g.chairBody);
          const yaw = yawOf();
          const dx = Math.sin(yaw), dz = Math.cos(yaw);
          const o = { x: p.x, y: p.y - 0.5, z: p.z };
          const f = probe(o, dx, dz, 40);
          const b = probe(o, -dx, -dz, 30);
          if (f < 12 || b < 12) continue;
          const rt = probe(o, dz, -dx, 8), lf = probe(o, -dz, dx, 8);
          let content = 0;
          for (let s2 = 3; s2 <= 12; s2 += 3) {
            const px = p.x + dx * s2, pz = p.z + dz * s2;
            const oo = { x: px, y: p.y - 0.5, z: pz };
            if (probe(oo, dz, -dx, 7) < 7) content++;
            if (probe(oo, -dz, dx, 7) < 7) content++;
          }
          cands.push({ x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), floorY: +(p.y - 1.0).toFixed(2), yaw: +yaw.toFixed(4),
            fwd: +f.toFixed(1), back: +b.toFixed(1), side: +Math.min(rt, lf).toFixed(2), content,
            score: +(Math.min(f, 30) + Math.min(b, 20) + Math.min(rt, lf) * 2 + content * 4).toFixed(1) });
        }
        setKeys([]);
      };
      drive(['KeyW'], 60 * 12);
      drive(['KeyW', 'KeyD'], 60 * 4);
      drive(['KeyW'], 60 * 10);
      drive(['KeyW', 'KeyA'], 60 * 4);
      drive(['KeyW'], 60 * 10);
      cands.sort((a, b) => b.score - a.score);
      return cands[0] || null;
    });
    console.error('scout:', JSON.stringify(report.scout));
    if (!report.scout) throw new Error('no open lane found');

    // ---- 2. controlled steering probe -----------------------------------------
    report.steer = await page.evaluate(({ lane }) => {
      const g = window.game;
      const DT = 1 / 60;
      g.isRunning = false;
      const fire = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c, bubbles: true }));
      const held = new Set();
      const setKeys = (codes) => {
        for (const c of Array.from(held)) if (!codes.includes(c)) { fire('keyup', c); held.delete(c); }
        for (const c of codes) if (!held.has(c)) { fire('keydown', c); held.add(c); }
      };
      const inst = { blocked: 0, calls: 0, escYaw: 0, pin: 0 };
      const proto = Object.getPrototypeOf(g);
      if (!proto.__wrapped) {
        const orig = proto.resolveObstacles;
        proto.resolveObstacles = function (dt, dir, speed, pushing) {
          const q0 = g.physics.getRotation(g.chairBody);
          const y0 = Math.atan2(2 * (q0.w * q0.y + q0.x * q0.z), 1 - 2 * (q0.y * q0.y + q0.x * q0.x));
          inst.calls++;
          const r = orig.call(this, dt, dir, speed, pushing);
          if (r) {
            const q1 = g.physics.getRotation(g.chairBody);
            const y1 = Math.atan2(2 * (q1.w * q1.y + q1.x * q1.z), 1 - 2 * (q1.y * q1.y + q1.x * q1.x));
            let d = y1 - y0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
            inst.blocked++; inst.escYaw += Math.abs(d);
          }
          return r;
        };
        proto.__wrapped = true;
        window.__inst = inst;
      }
      const I = window.__inst;
      const V3 = g.chair.position.constructor;
      const yawOf = () => { const q = g.physics.getRotation(g.chairBody); return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x)); };
      const wrap = (d) => { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
      const place = (v, yaw) => {
        g.physics.setPosition(g.chairBody, new V3(lane.x, (lane.floorY ?? 0) + 1.0, lane.z));
        g.physics.setRotationY(g.chairBody, yaw);
        g.physics.setVelocity(g.chairBody, new V3(Math.sin(yaw) * v, 0, Math.cos(yaw) * v));
        g.physics.setAngularVelocity(g.chairBody, new V3(0, 0, 0));
        g.carriedSpeed = v; g.turnRate = 0; g.turnCommand = 0;
        g.pinnedFor = 0; g.failedKicks = 0;
      };
      const results = [];
      for (const v of [4, 8, 11.8, 13.5, 15, 18]) {
        setKeys([]);
        place(v, lane.yaw);
        for (let i = 0; i < 4; i++) g.fixedUpdate(DT);   // settle contacts
        const b0 = I.blocked, e0 = I.escYaw, c0 = I.calls;
        setKeys(['KeyA']);
        const yaws = [yawOf()], spds = [], pts = [];
        for (let i = 0; i < 60; i++) {
          g.fixedUpdate(DT);
          const p = g.physics.getPosition(g.chairBody);
          const vel = g.physics.getVelocity(g.chairBody);
          yaws.push(yawOf()); spds.push(Math.hypot(vel.x, vel.z)); pts.push([p.x, p.z]);
        }
        setKeys([]);
        const rates = [];
        for (let i = 1; i < yaws.length; i++) rates.push(wrap(yaws[i] - yaws[i - 1]) / DT);
        const steady = rates.slice(20, 60);
        const steadyRate = Math.abs(steady.reduce((a, x) => a + x, 0) / steady.length);
        const meanSpeed = spds.slice(20, 60).reduce((a, x) => a + x, 0) / 40;
        let ramp = -1;
        for (let i = 0; i < rates.length; i++) if (Math.abs(rates[i]) >= 0.9 * steadyRate) { ramp = i + 1; break; }
        // path curvature radius: chord/heading over frames 20..60
        const a = pts[19], bp = pts[59];
        const chord = Math.hypot(bp[0] - a[0], bp[1] - a[1]);
        const dtheta = Math.abs(wrap(yaws[60] - yaws[20]));
        const radiusPath = dtheta > 1e-3 ? chord / (2 * Math.sin(dtheta / 2)) : Infinity;
        results.push({
          v, meanSpeed: +meanSpeed.toFixed(2),
          steadyYawRate: +steadyRate.toFixed(3),
          rampFrames: ramp,
          radiusKinematic: +(meanSpeed / Math.max(1e-3, steadyRate)).toFixed(2),
          radiusPath: +radiusPath.toFixed(2),
          headingDeg: +(Math.abs(wrap(yaws[60] - yaws[0])) * 180 / Math.PI).toFixed(1),
          speedKept: +(spds[spds.length - 1] / Math.max(0.01, v)).toFixed(3),
          escapeCalls: I.calls - c0,
          escapeBlockedFrames: I.blocked - b0,
          escapeYawDeg: +((I.escYaw - e0) * 180 / Math.PI).toFixed(1),
        });
      }
      // straight-line hold at each speed: how much yaw does the WORLD apply with no steer?
      const straight = [];
      for (const v of [8, 11.8, 13.5, 15, 18]) {
        setKeys([]);
        place(v, lane.yaw);
        for (let i = 0; i < 4; i++) g.fixedUpdate(DT);
        const b0 = I.blocked, e0 = I.escYaw;
        let last = yawOf(); let acc = 0;
        const spds = [];
        for (let i = 0; i < 60; i++) {
          g.fixedUpdate(DT);
          const y = yawOf(); acc += Math.abs(wrap(y - last)); last = y;
          const vel = g.physics.getVelocity(g.chairBody); spds.push(Math.hypot(vel.x, vel.z));
        }
        straight.push({
          v, uncommandedYawDeg: +(acc * 180 / Math.PI).toFixed(2),
          escapeBlockedFrames: I.blocked - b0,
          escapeYawDeg: +((I.escYaw - e0) * 180 / Math.PI).toFixed(1),
          endSpeed: +spds[spds.length - 1].toFixed(2),
        });
      }
      return { turning: results, straight };
    }, { lane: report.scout });
    console.error('steer done');

    // ---- 3. contact sheet -----------------------------------------------------
    for (const v of SPEEDS) {
      const st = await page.evaluate(({ lane, v }) => {
        const g = window.game;
        const DT = 1 / 60;
        g.isRunning = false; g.isPaused = false;
        const V3 = g.chair.position.constructor;
        // Clean slate: no accumulated heat, no dialogue, no score, no stray paper.
        g.loadLevel('ch1_office');
        for (let i = 0; i < 40; i++) g.fixedUpdate(1 / 60);
        document.querySelectorAll('.dialogue-box, .hud-dialogue, [class*="dialogue"]').forEach((e) => { e.style.display = 'none'; });
        const SETTLE = 0.55;              // seconds of run-up
        const yaw = lane.yaw;
        const sx = lane.x - Math.sin(yaw) * v * SETTLE;
        const sz = lane.z - Math.cos(yaw) * v * SETTLE;
        g.physics.setPosition(g.chairBody, new V3(sx, (lane.floorY ?? 0) + 1.0, sz));
        g.physics.setRotationY(g.chairBody, yaw);
        g.physics.setVelocity(g.chairBody, new V3(Math.sin(yaw) * v, 0, Math.cos(yaw) * v));
        g.physics.setAngularVelocity(g.chairBody, new V3(0, 0, 0));
        g.carriedSpeed = v; g.turnRate = 0; g.turnCommand = 0; g.pinnedFor = 0;
        const n = Math.round(SETTLE / DT);
        for (let i = 0; i < n; i++) {
          g.fixedUpdate(DT);
          // hold the speed exactly so the arrival point and the effect drive are locked
          const q = g.physics.getRotation(g.chairBody);
          const yy = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
          const vel = g.physics.getVelocity(g.chairBody);
          g.physics.setVelocity(g.chairBody, new V3(Math.sin(yy) * v, vel.y, Math.cos(yy) * v));
          g.carriedSpeed = v;
        }
        const p = g.physics.getPosition(g.chairBody);
        const cc = g.cameraController;
        const sl = g.speedLines;
        const drive = sl ? sl.getBlurDrive() : 0;
        const state = {
          v,
          arrivedAt: [+p.x.toFixed(2), +p.z.toFixed(2)],
          targetAt: [lane.x, lane.z],
          fov: +g.camera.fov.toFixed(2),
          speedRatio: +(cc.speedRatio ?? 0).toFixed(3),
          roll: +(cc.rollCurrent ?? 0).toFixed(4),
          boomLen: +Math.hypot(g.camera.position.x - g.chair.position.x, g.camera.position.z - g.chair.position.z).toFixed(2),
          camAbove: +(g.camera.position.y - g.chair.position.y).toFixed(2),
          slIntensity: +(sl?.getIntensity() ?? 0).toFixed(3),
          slCount: sl?.count ?? 0,
          blurDrive: +drive.toFixed(3),
          radialBlurUV: +(Math.pow(drive, 1.25) * 0.16).toFixed(4),
          caUV: +(drive * drive * 0.0055).toFixed(5),
          vignetteAdd: +(drive * 0.18).toFixed(3),
          paperActive: g.paperStorm?.activeCount ?? 0,
          paperAir: g.paperStorm?.airborneCount ?? 0,
          shakeAmp: +(0.012 * (cc.speedRatio ?? 0) * (cc.speedRatio ?? 0)).toFixed(5),
          bailBlend: +(cc.bailBlend ?? 0).toFixed(3),
          grounded: !!g.playerState.isGrounded,
          heat: +(g.police?.heatLevel ?? 0).toFixed(2),
        };
        g.isPaused = true; g.isRunning = true; g.start?.();
        return state;
      }, { lane: report.scout, v });
      await page.waitForTimeout(3000);
      const out = `${ROOT}/shots/attn-v${v}.png`;
      await page.screenshot({ path: out, timeout: 300000 });
      st.out = out;
      report.shots.push(st);
      console.error('shot', v, JSON.stringify(st));
      await page.evaluate(() => { window.game.isPaused = false; });
    }

    console.log(JSON.stringify({ report, errors }, null, 2));
  } catch (e) {
    console.error(String(e));
    console.log(JSON.stringify({ report }, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    server.kill('SIGKILL');
  }
}
main();
