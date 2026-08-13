#!/usr/bin/env node
/**
 * TEMPORARY judging probe — delete after use.
 *
 * Answers four questions the flow/feel harnesses cannot:
 *   1. CRUISE RUN     from a point, at cruise, holding a heading with no steering input:
 *                     how far do you get before the world takes the line off you?
 *   2. DEFLECTION     during ordinary directed play, what share of frames is the player's
 *                     course being changed by something other than his own steering?
 *   3. CIRCUIT        can a lap of the perimeter be held at speed?
 *   4. REVERSE        share of frames with velocity opposing the chair's facing.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import net from 'node:net';

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); if (i === -1) return d; const v = argv[i + 1]; return v === undefined || v.startsWith('--') ? true : v; };
const LEVEL = String(arg('level', 'ch1_office'));
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const waitForServer = async (url, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if ((await fetch(url)).ok) return true; } catch {} await new Promise((r) => setTimeout(r, 200)); } throw new Error('no server'); };
const KEYMAP = { W: 'KeyW', A: 'KeyA', S: 'KeyS', D: 'KeyD', Space: 'Space', L: 'KeyL', Shift: 'ShiftLeft' };

async function main() {
  if (!existsSync(`${ROOT}/dist/index.html`)) { console.error('dist/ missing'); process.exit(2); }
  const port = await freePort();
  const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'],
  });
  const out = { level: LEVEL };
  try {
    await waitForServer(url);
    const ctx = await browser.newContext({ viewport: { width: 320, height: 180 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.game, null, { timeout: 90000 });
    await page.waitForTimeout(400);
    await page.evaluate(async (level) => {
      const g = window.game;
      window.gameState?.setState?.('playing');
      g.loadLevel(level); g.start(); g.resume?.();
      g.postFX?.setQuality?.('off');
      if (g.renderer?.shadowMap) g.renderer.shadowMap.enabled = false;
      g.isRunning = false;
    }, LEVEL);
    await page.waitForTimeout(800);

    if (!argv.includes('--no-cruise'))
    // ---- 1. CRUISE RUNS: teleport, point, hold W, no steering, until deflected -------
    out.cruise = await page.evaluate(async ({ level }) => {
      const g = window.game;
      const THREE = g.chair.position.constructor;
      const proto = Object.getPrototypeOf(g);
      if (!proto.__origResolve) proto.__origResolve = proto.resolveObstacles;
      let fired = false;
      proto.resolveObstacles = function (...a) { const v = proto.__origResolve.apply(this, a); if (v) fired = true; return v; };
      const fire = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c, bubbles: true }));
      const results = [];
      const starts = [
        ['spawn', 0, 0], ['spine-n', 0, 12], ['spine-s', 0, -12],
        ['arm-e', 12, 0], ['arm-w', -12, 0],
        ['plaza', 12, -12], ['plaza2', 13, -6], ['loop-n', 8, 19.5], ['loop-e', 19.5, 8],
        ['loop-s', -8, -19.5], ['loop-w', -19.5, -8], ['spawn-n', 0, 5], ['spawn-e', 5, 0],
      ];
      for (const [name, sx, sz] of starts) {
        const dirs = [];
        for (let i = 0; i < 16; i++) {
          const yaw = (i / 16) * Math.PI * 2;
          g.physics.setPosition(g.chairBody, new THREE(sx, 1.22, sz));
          g.chair.position.set(sx, 1.22, sz);
          g.physics.setRotationY(g.chairBody, yaw);
          g.physics.setVelocity(g.chairBody, new THREE(Math.sin(yaw) * 13, 0, Math.cos(yaw) * 13));
          g.carriedSpeed = 13;
          fired = false;
          fire('keydown', 'KeyW');
          let dist = 0; let prev = { x: sx, z: sz }; let t = 0; let stopDist = null;
          while (t < 6) {
            g.fixedUpdate(1 / 60); t += 1 / 60;
            const p = g.chair.position;
            const d = Math.hypot(p.x - prev.x, p.z - prev.z);
            prev = { x: p.x, z: p.z };
            if (t < 0.12) continue;             // let the first frame settle
            dist += d;
            const v = g.physics.getVelocity(g.chairBody);
            const sp = Math.hypot(v.x, v.z);
            let off = Math.atan2(v.x, v.z) - yaw;
            while (off > Math.PI) off -= Math.PI * 2;
            while (off < -Math.PI) off += Math.PI * 2;
            // The line is over when the world has bent the course more than 15 degrees off
            // the heading the player chose, or taken more than a third of his speed.
            if (Math.abs(off) > 15 * Math.PI / 180 || sp < 8.5) { stopDist = dist; break; }
          }
          fire('keyup', 'KeyW');
          dirs.push(+(stopDist ?? dist).toFixed(1));
        }
        dirs.sort((a, b) => a - b);
        results.push({ from: name, best: dirs[15], median: dirs[8], worst: dirs[0],
          nOver25: dirs.filter((v) => v >= 25).length });
      }
      proto.resolveObstacles = proto.__origResolve;
      return results;
    }, { level: LEVEL });

    // ---- 2/3/4. DIRECTED PLAY -------------------------------------------------------
    const SCRIPTS = [
      { name: 'grind-line', script: 'W:0-30,L:0-30,Space:1.9@tap,Space:6@tap,Space:12@tap' },
      { name: 'spine-north-and-back', script: 'W:0-30,A:8.4-9.3,A:9.9-10.8' },
      { name: 'east-arm-out-and-lap', script: 'A:0-0.45,W:0-30,A:9-9.5,A:16-16.5' },
      { name: 'perimeter-lap-cw', script: 'W:0-30,D:1.9-2.35,D:7.5-8.0,D:13.6-14.1,D:19.6-20.1,D:25.6-26.1' },
      { name: 'perimeter-lap-ccw', script: 'A:0-0.9,W:0-30,A:7.6-8.1,A:13.8-14.3,A:20.0-20.5,A:26.0-26.5' },
      { name: 'plaza-figure-8', script: 'A:0-0.45,W:0-30,D:4-5,A:10-11,D:16-17,A:22-23' },
    ];
    out.play = [];
    for (const s of (argv.includes('--no-play') ? [] : SCRIPTS)) {
      const r = await page.evaluate(async ({ level, script, keymap }) => {
        const g = window.game;
        g.loadLevel(level); g.start(); g.resume?.(); g.isRunning = false;
        let a = 12345 >>> 0;
        Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        const proto = Object.getPrototypeOf(g);
        if (!proto.__origResolve) proto.__origResolve = proto.resolveObstacles;
        let recov = 0; let recovThisFrame = false;
        proto.resolveObstacles = function (...args) {
          const v = proto.__origResolve.apply(this, args);
          if (v) { recov++; recovThisFrame = true; }
          return v;
        };
        const events = [];
        for (const partRaw of script.split(',')) {
          const [key, spec] = partRaw.trim().split(':');
          if (!spec) continue;
          if (spec.endsWith('@tap')) { const t = Number(spec.slice(0, -4)); events.push({ key, down: t, up: t + 0.12 }); }
          else { const [x, y] = spec.split('-').map(Number); events.push({ key, down: x, up: y }); }
        }
        const fire = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
        const held = new Set();
        const yawOf = (q) => Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
        const wrap = (x) => { let v = x; while (v > Math.PI) v -= Math.PI * 2; while (v < -Math.PI) v += Math.PI * 2; return v; };
        const DT = 1 / 60; let t = 0; const RUN = 30;
        let frames = 0, dist = 0, prev = null, prevCourse = null, prevSpeed = null;
        let deflect = 0, deflectSteering = 0, reverse = 0, hardHit = 0, moving = 0, dead = 0;
        let worstReverse = 0; let maxDeflect = 0; let deflectIn = 0, movingIn = 0; const bigEvents = [];
        const deflectXZ = [];
        while (t < RUN) {
          for (const e of events) {
            const code = keymap[e.key] || e.key;
            if (t >= e.down && t < e.up && !held.has(code)) { fire('keydown', code); held.add(code); }
            if (t >= e.up && held.has(code)) { fire('keyup', code); held.delete(code); }
          }
          const steering = held.has('KeyA') || held.has('KeyD');
          recovThisFrame = false;
          g.fixedUpdate(DT); frames++; t += DT;
          const p = g.chair.position;
          const v = g.physics.getVelocity(g.chairBody);
          const sp = Math.hypot(v.x, v.z);
          if (prev) dist += Math.hypot(p.x - prev.x, p.z - prev.z);
          prev = { x: p.x, z: p.z };
          if (sp < 2) dead++;
          if (sp > 3) {
            moving++;
            const course = Math.atan2(v.x, v.z);
            const interior = Math.abs(p.x) < 15.5 && Math.abs(p.z) < 15.5;
            if (prevCourse !== null) {
              // course change per second, degrees. With no steering key held and on the
              // ground, anything beyond a few deg/s is the world redirecting the player.
              const rate = Math.abs(wrap(course - prevCourse)) / DT * (180 / Math.PI);
              if (!steering && !g.playerState.isAirborne && rate > 25) {
                deflect++; if (rate > maxDeflect) maxDeflect = rate;
                if (interior) deflectIn++;
                deflectXZ.push([Math.round(p.x), Math.round(p.z)]);
              }
              if (!steering && !g.playerState.isAirborne && rate > 600) {
                bigEvents.push([+p.x.toFixed(1), +p.z.toFixed(1), +sp.toFixed(1), Math.round(rate), recovThisFrame ? 'R' : '-']);
              }
              if (interior) movingIn++;
              if (steering && rate > 240) deflectSteering++;
            }
            prevCourse = course;
            const q = g.chairBody.rotation();
            const fx = Math.sin(yawOf(q)), fz = Math.cos(yawOf(q));
            const along = (v.x * fx + v.z * fz);
            if (along < 0) { reverse++; if (along < worstReverse) worstReverse = along; }
          } else { prevCourse = null; }
          if (prevSpeed !== null && prevSpeed - sp > 2.0) hardHit++;
          prevSpeed = sp;
        }
        for (const c of held) fire('keyup', c);
        proto.resolveObstacles = proto.__origResolve;
        return {
          frames, distance: +dist.toFixed(0), meanSpeed: +(dist / RUN).toFixed(1),
          recoveryPct: +(recov / frames * 100).toFixed(1),
          deflectFrames: deflect, deflectPctOfMoving: +(deflect / Math.max(1, moving) * 100).toFixed(1),
          maxDeflectDegPerSec: +maxDeflect.toFixed(0),
          hardHits: hardHit, deadPct: +(dead / frames * 100).toFixed(1),
          reversePctOfMoving: +(reverse / Math.max(1, moving) * 100).toFixed(1),
          worstReverse: +worstReverse.toFixed(1),
          deflectInterior: deflectIn, movingInterior: movingIn,
          deflectPctInterior: +(deflectIn / Math.max(1, movingIn) * 100).toFixed(1),
          bigEvents: bigEvents.slice(0, 14), bigEventCount: bigEvents.length,
          deflectZones: Object.entries(deflectXZ.reduce((m, [x, z]) => { const k = x + ',' + z; m[k] = (m[k] || 0) + 1; return m; }, {}))
            .sort((x, y) => y[1] - x[1]).slice(0, 6),
        };
      }, { level: LEVEL, script: s.script, keymap: KEYMAP });
      out.play.push({ name: s.name, ...r });
    }
    out.errors = errs;
  } catch (e) {
    out.error = String(e).slice(0, 500);
  } finally {
    await browser.close(); server.kill('SIGKILL');
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}
main();
