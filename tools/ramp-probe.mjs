#!/usr/bin/env node
/**
 * RAMP PROBE — measures what a transition actually DOES to the player.
 *
 * The flow harness (tools/play.mjs) measures a whole run; it cannot tell you whether a
 * quarter pipe launched you up its own exit tangent or shoved you sideways along the floor.
 * This drives the chair at a single feature at a known cruise speed and reports the four
 * numbers that decide whether a transition feels like a transition:
 *
 *   launchAngleDeg  — atan2(vy, planar speed) on the frame the wheels leave the lip.
 *                     A quarter pipe should read 45-80 deg. A flat kicker reads ~25.
 *                     A box pretending to be a quarter pipe reads ~0 and just blocks you.
 *   peakHeight      — metres gained above the take-off point.
 *   airTime         — seconds between take-off and touchdown. A FLAT OLLIE IS 0.70 s;
 *                     anything a transition gives you has to beat that to be worth riding.
 *   speedRetained   — planar speed at touchdown / planar speed at the moment of contact.
 *
 * Usage:
 *   node tools/ramp-probe.mjs                    # all cases, human readable
 *   node tools/ramp-probe.mjs --json
 *   node tools/ramp-probe.mjs --case qp_med      # one case
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import net from 'node:net';

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  if (i === -1) return d;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const has = (n) => argv.includes(`--${n}`);
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const WANT_JSON = has('json');
const ONLY = arg('case', null);
const TRACE = arg('trace', null) === true ? ONLY : arg('trace', null);
const WINDOW = arg('window', null) ? String(arg('window')).split(',').map(Number) : null;
/** --shot <seconds> freezes the case at that instant and renders it to --out. */
const SHOT = arg('shot', null) === null ? null : Number(arg('shot'));
const SHOT_OUT = String(arg('out', 'shots/ramp-probe.png'));

/**
 * Every case spawns ONE feature into an otherwise empty patch of floor, drops the chair
 * `runup` metres in front of it at `speed` m/s, and holds W. Nothing else is in the way,
 * so the numbers are about the feature and not about the level.
 */
// The player always runs at the feature travelling +Z. `rot` is the feature's authored
// yaw in degrees: a kicker's yaw is the direction it LAUNCHES you (so 0), a transition's is
// the direction it FACES — the side you ride in from — so a quarter pipe met head-on
// travelling +Z is authored at 180.
// The chair is dropped `runup` metres short of the feature already rolling at `speed` and
// then COASTS into it — holding the push through the run-up dragged every case to within a
// whisker of MAX_SPEED, so "8 m/s" and "17 m/s" both arrived at 19 and the numbers said
// nothing about speed at all.
const CASES = [
  { id: 'flat_ollie', feature: null,               rot: 0,   speed: 13, runup: 8, ollieAt: 0.55 },
  { id: 'kicker',     feature: { type: 'ramp' },   rot: 0,   speed: 13, runup: 8 },
  { id: 'qp_small',   feature: { type: 'quarter_pipe_small' }, rot: 180, speed: 13, runup: 9 },
  { id: 'qp_med',     feature: { type: 'quarter_pipe' },       rot: 180, speed: 13, runup: 9 },
  { id: 'qp_med_fast',feature: { type: 'quarter_pipe' },       rot: 180, speed: 18, runup: 11 },
  { id: 'qp_med_slow',feature: { type: 'quarter_pipe' },       rot: 180, speed: 8,  runup: 7 },
  { id: 'qp_large',   feature: { type: 'quarter_pipe_large' }, rot: 180, speed: 15, runup: 10 },
  // A half pipe cannot be entered from outside — the outside of a transition is its back.
  // Drop in on the flat, as a player would after rolling in over the deck.
  { id: 'halfpipe',   feature: { type: 'half_pipe', params: { width: 15, length: 20 } },
    rot: 90, speed: 14, runup: 2.5, duration: 7 },
];

function freePort() {
  return new Promise((res) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
async function waitForServer(url, ms = 30000) {
  const t0 = Date.now();
  for (;;) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    if (Date.now() - t0 > ms) throw new Error(`server never came up at ${url}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function main() {
  if (!existsSync(`${ROOT}/dist/index.html`)) {
    console.error('dist/ missing — run `npm run build` first');
    process.exit(2);
  }
  const port = await freePort();
  const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--enable-webgl', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'],
  });

  const out = { cases: [], errors: [] };
  try {
    await waitForServer(url);
    const ctx = await browser.newContext({ viewport: { width: 320, height: 180 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => out.errors.push(`PAGEERROR: ${String(e).slice(0, 240)}`));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.game, null, { timeout: 90000 });
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      const g = window.game;
      window.gameState?.setState?.('playing');
      // ch1_garage: 90x90 of empty floor with room to run at a feature from any side.
      g.loadLevel('ch1_garage');
      g.start(); g.resume?.();
      g.postFX?.setQuality?.('off');
      if (g.renderer?.shadowMap) g.renderer.shadowMap.enabled = false;
      document.getElementById('ui-overlay')?.style.setProperty('visibility', 'hidden');
      g.isRunning = false;   // we own the clock
    });
    await page.waitForTimeout(1500);

    for (const c of CASES) {
      if (ONLY && c.id !== ONLY) continue;
      await page.evaluate(([id, w]) => { window.__rampTrace = id; window.__rampWindow = w; }, [TRACE, WINDOW]);
      const r = await page.evaluate((c) => {
        const g = window.game;
        const DT = 1 / 60;
        // Deterministic: BalanceSystem reads Math.random and a bail would end the sample.
        let a = 0x51ed270b;
        Math.random = () => {
          a = (a + 0x6d2b79f5) >>> 0;
          let t = a;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };

        // BARE FLOOR. Every static collider the level authored is torn out and a single
        // flat ground slab put back, so the only thing the chair can touch is the feature
        // under test. (The meshes stay in the scene; only their physics is gone. A probe
        // that measured a quarter pipe AND whatever car was parked behind it would be
        // measuring the level, not the ramp.)
        g.physics.clearStaticBodies();
        g.physics.createGround(60);
        const FX = 0, FZ = 0;
        // Feature faces -Z (rotation 180 launches you toward -Z in this game's convention
        // for kickers; quarter pipes are built rising toward their own +Z, so a player
        // travelling +Z rides up a feature with rotation 0).
        if (c.feature) {
          const mesh = g.createLevelObject({
            type: c.feature.type, position: [FX, 0, FZ], rotation: [0, c.rot || 0, 0],
            params: c.feature.params,
          });
          if (mesh) { g.scene.add(mesh); g.levelObjects.push(mesh); }
        }

        // Drop the chair `runup` metres short of the feature, already at speed, facing +Z.
        const startZ = FZ - c.runup;
        g.physics.setPosition(g.chairBody, { x: FX, y: 0.70, z: startZ });
        g.physics.setRotationY(g.chairBody, 0);           // +Z is the chair's forward
        g.physics.setVelocity(g.chairBody, { x: 0, y: 0, z: c.speed });
        g.chair.position.set(FX, 0.70, startZ);
        g.carriedSpeed = c.speed;
        g.score?.reset?.();

        const fire = (type, code) => window.dispatchEvent(
          new KeyboardEvent(type, { code, key: code, bubbles: true }));

        const samples = [];
        const dur = c.shotAt || c.duration || 4.0;
        let t = 0;
        let ollieDone = false;
        while (t < dur) {
          if (c.ollieAt && !ollieDone && t >= c.ollieAt) {
            fire('keydown', 'Space');
            ollieDone = 1;
          }
          if (ollieDone === 1 && t >= c.ollieAt + 0.12) { fire('keyup', 'Space'); ollieDone = 2; }
          g.fixedUpdate(DT);
          const p = g.physics.getPosition(g.chairBody);
          const v = g.physics.getVelocity(g.chairBody);
          samples.push({
            t: +t.toFixed(4),
            x: p.x, y: p.y, z: p.z,
            vx: v.x, vz: v.z,
            yaw: Math.atan2(g.chair.quaternion.y, g.chair.quaternion.w) * 2 * 180 / Math.PI,
            carried: g.carriedSpeed,
            vy: v.y, spd: Math.hypot(v.x, v.z),
            gnd: !!g.playerState.isGrounded,
            ang: g.surfaceAngle || 0,
            pitch: g.chairTilt ? g.chairTilt.rotation.x : 0,
          });
          t += DT;
        }
        g.isRunning = false;

        // ---- reduce -------------------------------------------------------------
        // THE FIRST hop off the feature, not the longest. A transition pays speed back on
        // the way down, so by the third cycle of a half pipe the chair is at MAX_SPEED and
        // every case converges on the same numbers — which measures the speed ceiling, not
        // the ramp. Runs shorter than four frames are contact chatter, not air.
        let best = null, run = null;
        // The first hop OFF THE FEATURE: an airborne stretch of at least four frames whose
        // take-off frame was on a ramp. Blips at the coping and the one frame of settle at
        // spawn are not hops, and a later cycle of a half pipe is a different measurement.
        const SETTLE = 4;
        const offFeature = (i) => !c.feature || (samples[i - 1] && samples[i - 1].ang >= 8);
        for (let i = SETTLE; i < samples.length && !best; i++) {
          if (!samples[i].gnd) { if (run === null) run = i; }
          else {
            if (run !== null && i - run >= 4 && offFeature(run)) best = [run, i];
            run = null;
          }
        }
        if (!best && run !== null && samples.length - run >= 4) best = [run, samples.length];
        const upto = best ? best[0] : samples.length;
        const maxAngle = Math.max(...samples.slice(0, upto + 1).map((s) => s.ang));
        const maxPitchDeg = Math.max(...samples.slice(0, Math.min(samples.length, upto + 40))
          .map((s) => Math.abs(s.pitch))) * 180 / Math.PI;
        if (window.__rampTrace === c.id) {
          const w = window.__rampWindow;
          window.__rampTraceOut = samples.filter((s, i) => w ? (s.t >= w[0] && s.t <= w[1]) : i % 3 === 0).map((s) =>
            [s.t.toFixed(2), s.x.toFixed(2), s.z.toFixed(2), s.y.toFixed(2),
              s.vx.toFixed(1), s.vy.toFixed(1), s.vz.toFixed(1),
              s.gnd ? 'G' : 'A', s.ang.toFixed(0), s.yaw.toFixed(0),
              s.carried.toFixed(1)].join(' '));
        }
        if (!best) {
          return { id: c.id, airborne: false, maxAngle: +maxAngle.toFixed(1),
            maxPitchDeg: +maxPitchDeg.toFixed(1),
            endSpeed: +samples[samples.length - 1].spd.toFixed(2) };
        }
        const [i0, i1] = best;
        const lift = samples[i0];
        const before = samples[Math.max(0, i0 - 1)];
        const land = samples[Math.min(i1, samples.length - 1)];
        const seg = samples.slice(i0, Math.min(i1 + 1, samples.length));
        const peak = Math.max(...seg.map((s) => s.y));
        // Contact speed = fastest planar speed in the second before take-off (i.e. what
        // the player arrived with, before the feature took its cut).
        const preWindow = samples.slice(Math.max(0, i0 - 90), i0 + 1);
        const contactSpeed = Math.max(...preWindow.map((s) => s.spd));
        const airFrames = Math.min(i1, samples.length) - i0;
        return {
          id: c.id,
          airborne: true,
          contactSpeed: +contactSpeed.toFixed(2),
          launchVy: +lift.vy.toFixed(2),
          launchSpeed: +lift.spd.toFixed(2),
          launchAngleDeg: +(Math.atan2(Math.max(0, lift.vy), Math.max(0.01, lift.spd)) * 180 / Math.PI).toFixed(1),
          takeoffY: +lift.y.toFixed(2),
          peakHeight: +(peak - before.y).toFixed(2),
          airTime: +(airFrames / 60).toFixed(3),
          landSpeed: +land.spd.toFixed(2),
          speedRetained: +(land.spd / Math.max(0.01, contactSpeed)).toFixed(3),
          maxAngle: +maxAngle.toFixed(1),
          maxPitchDeg: +maxPitchDeg.toFixed(1),
          landedBack: land.gnd,
        };
      }, { ...c, shotAt: SHOT }).catch((e) => ({ id: c.id, error: String(e).slice(0, 300) }));
      out.cases.push(r);
      if (SHOT !== null) {
        await page.evaluate(() => {
          const g = window.game;
          g.start?.();          // restarts the rAF chain (and clears isPaused)
          g.isPaused = true;    // ...so freeze it again, AFTER
          g.isRunning = true;
          document.getElementById('ui-overlay')?.style.setProperty('visibility', 'hidden');
        });
        await page.setViewportSize({ width: 960, height: 540 });
        await page.waitForTimeout(8000);
        mkdirSync(dirname(resolve(SHOT_OUT)), { recursive: true });
        await page.screenshot({ path: resolve(SHOT_OUT), timeout: 300000 });
        console.log('shot ->', SHOT_OUT);
      }
      if (TRACE && TRACE === c.id) {
        const tr = await page.evaluate(() => window.__rampTraceOut || []);
        console.log(`--- trace ${c.id}   t  x  z  y  vx  vy  vz  gnd  surfAngle  yaw  carried`);
        for (const line of tr) console.log('   ', line);
      }
      await page.waitForTimeout(300);
    }
  } catch (e) {
    out.errors.push(String(e).slice(0, 400));
  } finally {
    await browser.close().catch(() => {});
    server.kill('SIGKILL');
  }

  if (WANT_JSON) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    const pad = (s, n) => String(s).padEnd(n);
    console.log(pad('case', 13), pad('launch°', 8), pad('peakH', 7), pad('airTime', 8),
      pad('spdKeep', 8), pad('maxAng°', 8), pad('pitch°', 7), 'contact->land');
    for (const c of out.cases) {
      if (c.error) { console.log(pad(c.id, 13), 'ERROR', c.error); continue; }
      if (!c.airborne) {
        console.log(pad(c.id, 13), pad('-', 8), pad('-', 7), pad('NO AIR', 8), pad('-', 8),
          pad(c.maxAngle, 8), pad(c.maxPitchDeg, 7), `end ${c.endSpeed}`);
        continue;
      }
      console.log(pad(c.id, 13), pad(c.launchAngleDeg, 8), pad(c.peakHeight, 7),
        pad(c.airTime, 8), pad(c.speedRetained, 8), pad(c.maxAngle, 8), pad(c.maxPitchDeg, 7),
        `${c.contactSpeed} -> ${c.landSpeed}${c.landedBack ? '' : ' (still airborne)'}`);
    }
    if (out.errors.length) console.log('\nerrors:', out.errors.join('\n  '));
  }
  process.exit(0);
}
main();
