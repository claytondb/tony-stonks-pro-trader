#!/usr/bin/env node
/* probe.mjs — run an ad-hoc snippet inside the game page with the judge-reverse helpers.
   Usage: node tools/probe.mjs --snippet tools/probes/reverse-multiseed.js  (needs `npm run build`) */
/**
 * JUDGE-REVERSE — an independent probe for one question only:
 *
 *   Does the chair travel backwards relative to the way it is pointing?
 *
 * Written from scratch for the judgement pass. It does NOT import or reuse any of the
 * game's own harnesses, so a bug that hides the reversal inside feel.mjs/play.mjs cannot
 * hide it here.
 *
 * DEFINITION OF THE DEFECT. For every simulated frame:
 *     f  = the chair's forward in world space  = (sin yaw, 0, cos yaw), yaw read off the
 *          rigid body's quaternion with atan2(2(wy+xz), 1-2(yy+zz)) — never Euler.y,
 *          which folds past +/-90 degrees.
 *     v  = planar velocity (vx, 0, vz)
 *   A frame is BACKWARDS when |v| >= MOVING (0.5 m/s, below which a heading is noise)
 *   and dot(v, f) < 0, i.e. the chair is travelling more than 90 degrees off its nose.
 *   Reported: % of moving frames backwards, the worst dot(v,f) in m/s (how fast it was
 *   going backwards), and the longest unbroken backwards streak in frames — because a
 *   player feels duration, not percentage.
 *
 * Both the BODY yaw (what gameplay uses) and the VISUAL group yaw (what the player sees)
 * are measured, so a divergence between them shows up as its own number.
 *
 * Scenarios: pure coast, coast + turning, collision run through props, grind entry+exit,
 * landing from a big drop, brake tap, and brake-from-standstill (is S a reverse gear?).
 *
 * Usage: node tools/judge-reverse.mjs [--json] [--level ch1_office]
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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

async function runPass({ level, snippet }) {
  const g = window.game;
  const DT = 1 / 60;
  const MOVING = 0.5;          // m/s below which "which way am I going" is meaningless

  window.gameState?.setState?.('playing');
  g.loadLevel(level);
  g.start(); g.resume?.();
  await new Promise((r) => setTimeout(r, 900));
  g.isRunning = false;         // we own the clock

  const fire = (t, code) => window.dispatchEvent(
    new KeyboardEvent(t, { code, key: code, bubbles: true }));
  const held = new Set();
  const down = (c) => { if (!held.has(c)) { fire('keydown', c); held.add(c); } };
  const up = (c) => { if (held.delete(c)) fire('keyup', c); };
  const releaseAll = () => { for (const c of [...held]) up(c); };
  const step = (n = 1) => { for (let i = 0; i < n; i++) g.fixedUpdate(DT); };

  const pos = () => g.physics.getPosition(g.chairBody);
  const vel = () => g.physics.getVelocity(g.chairBody);
  const spd = () => { const v = vel(); return Math.hypot(v.x, v.z); };
  const grounded = () => !!g.playerState?.isGrounded;
  const round = (v, n = 3) => (v === null || v === undefined || !isFinite(v) ? null : +v.toFixed(n));
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const yawQ = (q) => Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
  const bodyYaw = () => yawQ(g.physics.getRotation(g.chairBody));
  const visYaw = () => yawQ(g.chair.quaternion);

  // ---- reset primitives (the confounds feel.mjs documents apply here too) --
  const clearPlayerState = () => {
    releaseAll();
    step(1);
    try { if (g.grindSystem?.isGrinding?.()) g.grindSystem.forceEndGrind(); } catch {}
    try { g.balance?.reset?.(); } catch {}
    try { g.destructibles?.reset?.(); } catch {}
    try { g.police?.reset?.(); } catch {}
    g.carriedSpeed = 0; g.prevSpeed = 0; g.pinnedFor = 0; g.bailRecovery = 0;
    g.spinRotation = 0; g.turnRate = 0; g.turnCommand = 0;
    g.ollieLiftLeft = 0; g.ollieBufferedAt = -Infinity; g.ollieCoyoteUsed = false;
    g.activeTrick = null; g.heldGrabId = null; g.grindTrick = null;
    g.cumulativeSpinDegrees = 0;
    if (g.playerState) {
      g.playerState.isGrounded = true; g.playerState.isAirborne = false;
      g.playerState.isGrinding = false; g.playerState.isManualing = false;
      g.playerState.airTime = 0;
    }
    if (g.chairTilt) g.chairTilt.rotation.set(0, 0, 0);
  };
  const ZERO = { x: 0, y: 0, z: 0 };
  const place = (x, y, z, heading) => {
    g.physics.setPosition(g.chairBody, { x, y, z });
    g.physics.setRotationY(g.chairBody, heading);
    g.physics.setVelocity(g.chairBody, ZERO);
    g.physics.setAngularVelocity(g.chairBody, ZERO);
  };
  return await (new Function('ctx', snippet))({g,step,down,up,releaseAll,pos,vel,spd,grounded,round,wrap,bodyYaw,visYaw,clearPlayerState,place,ZERO});
}

async function main() {
  if (!existsSync(`${ROOT}/dist/index.html`)) {
    console.error('dist/ missing — run `npm run build` first');
    process.exit(2);
  }
  const port = await freePort();
  const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore', detached: true });
  const url = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--no-sandbox', '--disable-dev-shm-usage', ...(process.env.CHROME_EXTRA ? process.env.CHROME_EXTRA.split(' ') : [])],
    dumpio: !!process.env.CHROME_DUMPIO,
  });
  const report = { level: LEVEL, errors: [] };
  let code = 0;
  try {
    await waitForServer(url);
    const page = await (await browser.newContext({ viewport: arg('shot') ? (arg('square') ? { width: 1000, height: 1000 } : { width: 1280, height: 720 }) : { width: 320, height: 180 } })).newPage();
    page.on('pageerror', (e) => report.errors.push(String(e).slice(0, 200)));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.game, null, { timeout: 90000 });
    await page.waitForTimeout(400);
    report.probes = await page.evaluate(runPass, { level: LEVEL, snippet: readFileSync(arg('snippet'),'utf8') });
    if (arg('shot')) {
      await page.evaluate(() => { const g = window.game; g.render?.(1); });
      await page.waitForTimeout(400);
      await page.screenshot({ path: arg('shot') });
    }
    await page.context().close().catch(() => {});
  } catch (e) {
    report.errors.push(`HARNESS: ${String(e).slice(0, 400)}`);
    code = 1;
  } finally {
    await browser.close().catch(() => {});
    try { process.kill(-server.pid, 'SIGKILL'); } catch { server.kill('SIGKILL'); }
  }

  console.log(JSON.stringify(report, null, 1)); process.exit(code);
}
main();
