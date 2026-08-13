#!/usr/bin/env node
/**
 * fx-budget — VISUAL NOISE budget probe for the effect chain.
 *
 * Same freeze-then-shoot technique as tools/camshot.mjs and tools/attn-shot.mjs, but with
 * the lane PINNED (env FXLANE, or the default below) so that a before/after pair is a true
 * A/B: identical point, identical heading, differing only in speed and in the build.
 * attn-shot.mjs scouts by DRIVING, which means a change to the obstacle path moves the
 * lane and destroys the comparison; that is why this one does not scout unless asked.
 *
 *   node tools/fx-budget.mjs                       # default pinned lane
 *   FXSCOUT=1 node tools/fx-budget.mjs             # find a lane and print it
 *   FXLANE='{"x":..,"z":..,"yaw":..,"floorY":..}' node tools/fx-budget.mjs
 *   FXTAG=before node tools/fx-budget.mjs          # writes shots/fx-before-v{0,13,15}.png
 *
 * The metrics are chosen to be FORMULA-INDEPENDENT wherever possible, so the same tool
 * measures an old build and a new one:
 *   - slMinNdc   : closest any live speed streak gets to the centre of the frame, in NDC
 *                  (0 = dead centre, 1 = frame edge). This is "is the effect in the play
 *                  space", measured rather than argued.
 *   - slCount    : live streaks.
 *   - uSpeed     : the actual drive uniform on the post material.
 *   - paperAir   : sheets airborne.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import net from 'node:net';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const LEVEL = 'ch1_office';
const SPEEDS = [0, 13, 15];
const TAG = process.env.FXTAG || 'fx';
const DEFAULT_LANE = { x: -12, z: 18, yaw: 1.5708, floorY: -0.3 };

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
  const report = { lane: null, shots: [] };
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

    let lane = process.env.FXLANE ? JSON.parse(process.env.FXLANE) : DEFAULT_LANE;
    if (process.env.FXSCOUT) {
      lane = await page.evaluate(() => {
        const g = window.game;
        g.isRunning = false;
        const probe = (o, dx, dz, maxD) => {
          const h = g.physics.probeDirection(o, { x: dx, y: 0, z: dz }, maxD, g.chairBody);
          return h ? h.distance : maxD;
        };
        // Static sweep: no driving, so the obstacle path cannot move the answer.
        const V3 = g.chair.position.constructor;
        let best = null;
        for (let x = -18; x <= 18; x += 3) {
          for (let z = -18; z <= 18; z += 3) {
            for (let k = 0; k < 8; k++) {
              const yaw = (k / 8) * Math.PI * 2;
              g.physics.setPosition(g.chairBody, new V3(x, 1.0, z));
              g.physics.setRotationY(g.chairBody, yaw);
              g.physics.setVelocity(g.chairBody, new V3(0, 0, 0));
              for (let i = 0; i < 6; i++) g.fixedUpdate(1 / 60);
              if (!g.playerState.isGrounded) continue;
              const p = g.physics.getPosition(g.chairBody);
              const dx = Math.sin(yaw), dz = Math.cos(yaw);
              const o = { x: p.x, y: p.y - 0.5, z: p.z };
              const f = probe(o, dx, dz, 40), b = probe(o, -dx, -dz, 30);
              if (f < 14 || b < 10) continue;
              let content = 0;
              for (let s2 = 4; s2 <= 16; s2 += 4) {
                const oo = { x: p.x + dx * s2, y: p.y - 0.5, z: p.z + dz * s2 };
                if (probe(oo, dz, -dx, 8) < 8) content++;
                if (probe(oo, -dz, dx, 8) < 8) content++;
              }
              const score = Math.min(f, 34) + Math.min(b, 14) + content * 5;
              if (!best || score > best.score) {
                best = { x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +yaw.toFixed(4),
                  floorY: +(p.y - 1.0).toFixed(2), fwd: +f.toFixed(1), back: +b.toFixed(1),
                  content, score: +score.toFixed(1) };
              }
            }
          }
        }
        return best;
      });
      console.error('LANE', JSON.stringify(lane));
    }
    report.lane = lane;

    for (const v of SPEEDS) {
      const st = await page.evaluate(({ lane, v }) => {
        const g = window.game;
        const DT = 1 / 60;
        g.isRunning = false; g.isPaused = false;
        const V3 = g.chair.position.constructor;
        g.loadLevel('ch1_office');
        for (let i = 0; i < 40; i++) g.fixedUpdate(DT);
        document.querySelectorAll('.dialogue-box, .hud-dialogue, [class*="dialogue"]').forEach((e) => { e.style.display = 'none'; });

        // 1.6 s of run-up: long enough for the streak pool, the paper wake and the smoothed
        // post drive to all reach steady state, and started far enough back that every
        // speed ARRIVES at the same point.
        const SETTLE = 1.6;
        const yaw = lane.yaw;
        const n = Math.round(SETTLE / DT);
        const place = () => {
          g.physics.setPosition(g.chairBody, new V3(
            lane.x - Math.sin(yaw) * v * SETTLE, (lane.floorY ?? 0) + 1.0, lane.z - Math.cos(yaw) * v * SETTLE));
          g.physics.setRotationY(g.chairBody, yaw);
          g.physics.setVelocity(g.chairBody, new V3(Math.sin(yaw) * v, 0, Math.cos(yaw) * v));
          g.physics.setAngularVelocity(g.chairBody, new V3(0, 0, 0));
          g.carriedSpeed = v; g.turnRate = 0; g.turnCommand = 0; g.pinnedFor = 0;
        };
        const step = () => {
          g.fixedUpdate(DT);
          const q = g.physics.getRotation(g.chairBody);
          const yy = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
          const vel = g.physics.getVelocity(g.chairBody);
          g.physics.setVelocity(g.chairBody, new V3(Math.sin(yy) * v, vel.y, Math.cos(yy) * v));
          g.carriedSpeed = v;
          return g.physics.getPosition(g.chairBody);
        };

        // PASS 1 — record the actual path so the litter can be laid down ON it. The lane is
        // straight on paper; the obstacle path may still deflect the chair, and litter the
        // chair never drives over measures nothing.
        place();
        const path = [];
        for (let i = 0; i < n; i++) { const q = step(); path.push([q.x, q.y, q.z]); }

        // PASS 2 — same run, but over a known, dense, reproducible carpet of paper.
        const ps = g.paperStorm;
        if (ps) {
          ps.reset();
          for (let i = 0; i < path.length; i += 6) {
            ps.addFloorLitter(new V3(path[i][0], (lane.floorY ?? 0), path[i][2]), 1.6, 14);
          }
        }
        place();
        let paperPeak = 0, paperHighest = 0, paperWidest = 0;
        for (let i = 0; i < n; i++) {
          const cp = step();
          if (!ps) continue;
          paperPeak = Math.max(paperPeak, ps.airborneCount);
          // Highest sheet above the floor and furthest sheet from the chair, over airborne
          // sheets only — "does the paper stay in the wake, or cross the view".
          const st2 = ps.state, hw = ps.highWater ?? 0;
          for (let k = 0; k < hw; k++) {
            if (st2[k] !== 1 && st2[k] !== 2) continue;   // FLYING / SETTLING
            const dy = ps.py[k] - (lane.floorY ?? 0);
            if (dy > paperHighest) paperHighest = dy;
            const d = Math.hypot(ps.px[k] - cp.x, ps.pz[k] - cp.z);
            if (d > paperWidest) paperWidest = d;
          }
        }

        const p = g.physics.getPosition(g.chairBody);
        const sl = g.speedLines;
        const cam = g.camera;

        // Closest approach of any live streak to the centre of the frame, in NDC.
        // The streak geometry holds WORLD positions, so this needs no knowledge of the
        // effect's internals and reads the same on any build.
        let minNdc = Infinity, maxNdc = 0;
        if (sl) {
          const geo = sl.getMesh().geometry;
          const pos = geo.attributes.position.array;
          const nVerts = geo.drawRange.count;
          const V = g.chair.position.constructor;
          const tmp = new V(0, 0, 0);
          cam.updateMatrixWorld(true);
          for (let i = 0; i < nVerts; i++) {
            tmp.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).project(cam);
            if (tmp.z < -1 || tmp.z > 1) continue;
            const r = Math.hypot(tmp.x, tmp.y);
            if (r < minNdc) minNdc = r;
            if (r > maxNdc) maxNdc = r;
          }
        }

        // Ground truth from the post material rather than a re-derived formula.
        let uSpeed = null, uChromaSpeed = null, uVignette = null;
        try {
          const fx = g.postFX;
          const u = fx?.speedPass?.uniforms ?? fx?.gradePass?.uniforms ?? null;
          if (u) {
            uSpeed = u.uSpeed?.value ?? null;
            uChromaSpeed = u.uChromaSpeed?.value ?? null;
            uVignette = u.uVignette?.value ?? null;
          }
        } catch (e) { /* reported as null */ }

        const state = {
          v,
          arrivedAt: [+p.x.toFixed(2), +p.z.toFixed(2)],
          grounded: !!g.playerState.isGrounded,
          fov: +cam.fov.toFixed(2),
          slIntensity: +(sl?.getIntensity() ?? 0).toFixed(3),
          slCount: sl?.count ?? 0,
          slMinNdc: Number.isFinite(minNdc) ? +minNdc.toFixed(3) : null,
          slMaxNdc: maxNdc ? +maxNdc.toFixed(3) : null,
          blurDrive: +(sl?.getBlurDrive() ?? 0).toFixed(3),
          uSpeed: uSpeed === null ? null : +uSpeed.toFixed(4),
          uChromaSpeed,
          uVignette,
          paperActive: g.paperStorm?.activeCount ?? 0,
          paperAir: g.paperStorm?.airborneCount ?? 0,
          paperAirPeak: paperPeak,
          paperHighestM: +paperHighest.toFixed(2),
          paperWidestM: +paperWidest.toFixed(2),
          heat: +(g.police?.heatLevel ?? 0).toFixed(2),
        };
        g.isPaused = true; g.isRunning = true; g.start?.();
        return state;
      }, { lane, v });
      await page.waitForTimeout(3000);
      const out = `${ROOT}/shots/${TAG}-v${v}.png`;
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
