#!/usr/bin/env node
/**
 * FEEL harness — measures the micro-level control qualities that separate a AAA
 * skater from a merely functional one.
 *
 * play.mjs measures MACRO flow: is the player moving, grinding, comboing across a
 * whole run. That can look healthy while the game still feels wrong in the hand.
 * This measures the things a player feels within a few frames:
 *
 *   - input latency        frames between pressing a key and the world responding
 *   - acceleration curve   how long to reach cruise, and the SHAPE of getting there
 *   - deceleration/coast   speed should bleed slowly; instant stop kills flow
 *   - ollie consistency    the same input must give the same hop, every time
 *   - landing retention    how much speed survives a landing (THPS keeps nearly all)
 *   - turn response        yaw rate, ramp-in time, and turn radius at cruise
 *   - coyote / buffer      the forgiveness windows that make a game feel fair
 *
 * Each probe runs as an isolated deterministic experiment: reset the level, step
 * fixedUpdate() at exactly 1/60 with rendering off, dispatch synthetic key events on
 * exact simulated frames, and sample. No wall-clock anywhere, so results are exact and
 * reproducible rather than dependent on machine load.
 *
 * Usage:
 *   node tools/feel.mjs                      # all probes, human-readable
 *   node tools/feel.mjs --json               # machine-readable
 *   node tools/feel.mjs --level story_3_lobby
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import net from 'node:net';

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  if (i === -1) return d;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const WANT_JSON = argv.includes('--json');
const LEVEL = String(arg('level', 'ch1_office'));
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

const freePort = () => new Promise((r) => {
  const s = net.createServer();
  s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); });
});
const waitForServer = async (url, ms = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server never came up');
};

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
      '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const report = { level: LEVEL, errors: [] };
  let code = 0;

  try {
    await waitForServer(url);
    const page = await (await browser.newContext({ viewport: { width: 320, height: 180 } })).newPage();
    page.on('pageerror', (e) => report.errors.push(String(e).slice(0, 200)));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.game, null, { timeout: 90000 });
    await page.waitForTimeout(400);

    report.probes = await page.evaluate(async ({ level }) => {
      const g = window.game;
      const DT = 1 / 60;
      window.gameState?.setState?.('playing');
      g.loadLevel(level); g.start(); g.resume?.();
      await new Promise((r) => setTimeout(r, 900));
      g.isRunning = false;                       // we own the clock

      const fire = (t, code) => window.dispatchEvent(
        new KeyboardEvent(t, { code, key: code, bubbles: true }));
      const held = new Set();
      const down = (c) => { if (!held.has(c)) { fire('keydown', c); held.add(c); } };
      const up = (c) => { if (held.delete(c)) fire('keyup', c); };
      const releaseAll = () => { for (const c of [...held]) up(c); };
      const step = (n = 1) => { for (let i = 0; i < n; i++) g.fixedUpdate(DT); };
      const spd = () => { try { const v = g.physics.getVelocity(g.chairBody); return Math.hypot(v.x, v.z); } catch { return 0; } };
      const vy = () => { try { return g.physics.getVelocity(g.chairBody).y; } catch { return 0; } };
      const y = () => g.chair?.position?.y ?? 0;
      const yaw = () => { const e = new (Object.getPrototypeOf(g.chair.rotation).constructor)(); e.setFromQuaternion(g.chair.quaternion, 'YXZ'); return e.y; };
      const grounded = () => !!g.playerState?.isGrounded;
      const reset = async () => { releaseAll(); g.loadLevel(level); step(30); };

      const out = {};

      // ---- 1. input latency: frames from keydown to the world responding -------
      await reset();
      {
        const before = spd();
        down('KeyW');
        let frames = null;
        for (let i = 1; i <= 30; i++) { step(); if (spd() > before + 0.05) { frames = i; break; } }
        up('KeyW');
        out.inputLatencyFrames = frames;
        out.inputLatencyMs = frames === null ? null : +(frames * DT * 1000).toFixed(1);
      }

      // ---- 2. acceleration curve ----------------------------------------------
      await reset();
      {
        down('KeyW');
        const marks = {}; const curve = [];
        for (let i = 1; i <= 600; i++) {
          step();
          const s = spd();
          if (i % 6 === 0) curve.push(+s.toFixed(2));
          for (const t of [4, 8, 12, 16]) if (marks[`to${t}`] === undefined && s >= t) marks[`to${t}`] = +(i * DT).toFixed(2);
        }
        out.topSpeed = +spd().toFixed(2);
        out.accelSeconds = marks;
        out.accelCurveSampled = curve.slice(0, 30);
        up('KeyW');
      }

      // ---- 3. coast / deceleration --------------------------------------------
      {
        const s0 = spd(); const decel = {};
        for (let i = 1; i <= 900; i++) {
          step();
          const s = spd();
          for (const f of [0.75, 0.5, 0.25]) {
            const k = `to${Math.round(f * 100)}pct`;
            if (decel[k] === undefined && s <= s0 * f) decel[k] = +(i * DT).toFixed(2);
          }
          if (s < 0.5) break;
        }
        out.coastFromSpeed = +s0.toFixed(2);
        out.coastSeconds = decel;
      }

      // ---- 4. ollie: height, airtime, and consistency across repeats -----------
      {
        const hops = [];
        for (let rep = 0; rep < 5; rep++) {
          await reset();
          down('KeyW'); step(150);                       // get to cruise
          const takeoffSpeed = spd(); const groundY = y();
          down('Space'); step(8); up('Space');           // short charge, then pop
          let peak = groundY, air = 0;
          for (let i = 0; i < 200; i++) {
            step(); air++;
            peak = Math.max(peak, y());
            if (i > 6 && grounded()) break;
          }
          const landSpeed = spd();
          hops.push({
            peakHeight: +(peak - groundY).toFixed(3),
            airtime: +(air * DT).toFixed(3),
            takeoffSpeed: +takeoffSpeed.toFixed(2),
            landSpeed: +landSpeed.toFixed(2),
            retention: takeoffSpeed > 0.1 ? +(landSpeed / takeoffSpeed).toFixed(3) : null,
          });
          up('KeyW');
        }
        const hs = hops.map((h) => h.peakHeight);
        const ats = hops.map((h) => h.airtime);
        const rets = hops.map((h) => h.retention).filter((v) => v !== null);
        const mean = (a) => a.reduce((x, y2) => x + y2, 0) / (a.length || 1);
        out.ollie = {
          hops,
          meanHeight: +mean(hs).toFixed(3),
          heightSpread: +(Math.max(...hs) - Math.min(...hs)).toFixed(3),
          meanAirtime: +mean(ats).toFixed(3),
          airtimeSpread: +(Math.max(...ats) - Math.min(...ats)).toFixed(3),
          meanLandingRetention: rets.length ? +mean(rets).toFixed(3) : null,
        };
      }

      // ---- 5. hold-to-charge: does a longer hold give a bigger hop? ------------
      {
        const charge = [];
        for (const holdFrames of [2, 10, 20, 35]) {
          await reset();
          down('KeyW'); step(150);
          const groundY = y();
          down('Space'); step(holdFrames); up('Space');
          let peak = groundY;
          for (let i = 0; i < 200; i++) { step(); peak = Math.max(peak, y()); if (i > 6 && grounded()) break; }
          charge.push({ holdFrames, peakHeight: +(peak - groundY).toFixed(3) });
          up('KeyW');
        }
        out.ollieCharge = charge;
        const hs = charge.map((c) => c.peakHeight);
        out.chargeScalesHeight = +(Math.max(...hs) - Math.min(...hs)).toFixed(3);
      }

      // ---- 6. turn response: ramp-in, steady rate, and radius at cruise --------
      await reset();
      {
        down('KeyW'); step(150);
        const cruise = spd();
        const y0 = yaw(); let rampFrames = null; const rates = [];
        down('KeyA');
        let prev = y0;
        for (let i = 1; i <= 120; i++) {
          step();
          const cur = yaw();
          let d = cur - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
          const rate = Math.abs(d) / DT;
          rates.push(rate);
          if (rampFrames === null && rate > 0.9 * 3.6) rampFrames = i;   // 3.6 rad/s is the configured max
          prev = cur;
        }
        up('KeyA'); up('KeyW');
        const steady = rates.slice(30).reduce((a, b) => a + b, 0) / Math.max(1, rates.length - 30);
        out.turn = {
          cruiseSpeed: +cruise.toFixed(2),
          rampToFullRateFrames: rampFrames,
          steadyYawRate: +steady.toFixed(2),
          turnRadiusMetres: steady > 0.01 ? +(cruise / steady).toFixed(2) : null,
        };
      }

      // ---- 7. coyote time: can you still jump just after leaving ground? -------
      // Measured indirectly: how many frames after isGrounded goes false does a
      // Space press still produce upward velocity.
      out.coyoteFrames = await (async () => {
        for (const delay of [0, 2, 4, 6, 8, 12, 16]) {
          await reset();
          down('KeyW'); step(200);
          // find an airborne moment by ollie-ing off, then test a second jump
          down('Space'); step(6); up('Space');
          let left = 0;
          for (let i = 0; i < 120; i++) { step(); if (!grounded()) { left = i; break; } }
          step(delay);
          const before = vy();
          down('Space'); step(3); up('Space');
          const after = vy();
          up('KeyW');
          if (after <= before + 0.5) return delay;   // first delay where the jump no longer fires
        }
        return null;
      })();

      releaseAll();
      g.isRunning = true;
      return out;
    }, { level: LEVEL });
  } catch (e) {
    report.errors.push(`HARNESS: ${String(e).slice(0, 400)}`);
    code = 1;
  } finally {
    await browser.close().catch(() => {});
    server.kill('SIGKILL');
  }

  // ---- blunt verdicts against THPS-ish expectations --------------------------
  const p = report.probes || {};
  const v = [];
  if (p.inputLatencyFrames > 3) v.push(`SLUGGISH: ${p.inputLatencyFrames} frames (${p.inputLatencyMs}ms) before pushing does anything; AAA is 1-2`);
  if (p.accelSeconds && p.accelSeconds.to12 === undefined) v.push('CANNOT REACH CRUISE: never hit 12 speed while pushing');
  else if (p.accelSeconds && p.accelSeconds.to12 > 3) v.push(`SLOW OFF THE MARK: ${p.accelSeconds.to12}s to reach 12`);
  if (p.coastSeconds && p.coastSeconds.to50pct !== undefined && p.coastSeconds.to50pct < 2)
    v.push(`SPEED DIES: half your speed gone in ${p.coastSeconds.to50pct}s of coasting; THPS carries speed for many seconds`);
  if (p.ollie) {
    if (p.ollie.heightSpread > 0.08) v.push(`INCONSISTENT OLLIE: same input varies ${p.ollie.heightSpread}m in height — the player cannot learn it`);
    if (p.ollie.meanLandingRetention !== null && p.ollie.meanLandingRetention < 0.85)
      v.push(`LANDINGS KILL SPEED: only ${Math.round(p.ollie.meanLandingRetention * 100)}% retained; THPS keeps ~95%+`);
    if (p.ollie.meanAirtime < 0.45) v.push(`NOT ENOUGH AIRTIME: ${p.ollie.meanAirtime}s leaves no room for a trick`);
  }
  if (p.chargeScalesHeight !== undefined && p.chargeScalesHeight < 0.05)
    v.push(`HOLD-TO-CHARGE DOES NOTHING: height varies only ${p.chargeScalesHeight}m between a tap and a full hold`);
  if (p.turn) {
    if (p.turn.rampToFullRateFrames === null) v.push('TURN NEVER REACHES FULL RATE');
    else if (p.turn.rampToFullRateFrames > 12) v.push(`TURN FEELS HEAVY: ${p.turn.rampToFullRateFrames} frames to reach full rate`);
    if (p.turn.turnRadiusMetres > 6) v.push(`WIDE TURNS: ${p.turn.turnRadiusMetres}m radius at cruise makes tight lines impossible`);
  }
  if (p.coyoteFrames === 0) v.push('NO COYOTE TIME: leaving a ledge one frame early eats the jump — a classic unfairness');
  report.verdicts = v;

  if (WANT_JSON) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(JSON.stringify(report.probes, null, 2));
    if (v.length) console.log('\nFEEL VERDICTS:\n  ' + v.join('\n  '));
    else console.log('\nFEEL VERDICTS: none — all measured qualities within AAA expectations');
    if (report.errors.length) console.log('errors:', report.errors.slice(0, 3).join(' | '));
  }
  process.exit(code);
}

main();
