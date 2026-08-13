#!/usr/bin/env node
/**
 * TEMPORARY player-judgement probe — delete after use.
 *
 * Plays a scripted line like play.mjs, but samples EVERY fixed step and records the
 * things a human notices rather than the things a combo counter notices:
 *
 *   - facing vs travel        does the chair go where I am pointing it?
 *   - unasked heading change  did the game steer for me while I held no key?
 *   - speed shocks            did I lose speed for a reason I could see coming?
 *   - contacts                how often does the anti-stall obstacle resolver fire?
 *   - stalls                  how long am I below walking pace?
 *
 * Usage: node tools/pj.mjs --level ch1_office --script "W:0-4,A:5-7" --duration 20 [--dump path]
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import net from 'node:net';

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); if (i === -1) return d; const v = argv[i + 1]; return v === undefined || v.startsWith('--') ? true : v; };
const LEVEL = String(arg('level', 'ch1_office'));
const SCRIPT = String(arg('script', 'W:0-4'));
const DURATION = Number(arg('duration', 20));
const SEED = Number(arg('seed', 12345));
const DUMP = arg('dump', null);
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const KEYMAP = {
  W: 'KeyW', A: 'KeyA', S: 'KeyS', D: 'KeyD', Space: 'Space',
  Shift: 'ShiftLeft', J: 'KeyJ', K: 'KeyK', L: 'KeyL', E: 'KeyE', Q: 'KeyQ',
  Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight',
};
function parseScript(s) {
  const out = [];
  for (const partRaw of s.split(',')) {
    const part = partRaw.trim(); if (!part) continue;
    const [key, spec] = part.split(':'); if (!spec) continue;
    if (spec.endsWith('@tap')) { const t = Number(spec.slice(0, -4)); out.push({ key, down: t, up: t + 0.12 }); }
    else { const [a, b] = spec.split('-').map(Number); out.push({ key, down: a, up: b }); }
  }
  return out.sort((x, y) => x.down - y.down);
}
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const waitForServer = async (url, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if ((await fetch(url)).ok) return true; } catch {} await new Promise((r) => setTimeout(r, 200)); } throw new Error('no server'); };

async function main() {
  if (!existsSync(`${ROOT}/dist/index.html`)) { console.error('dist/ missing — npm run build'); process.exit(2); }
  const events = parseScript(SCRIPT);
  const port = await freePort();
  const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'],
  });
  const out = { level: LEVEL, script: SCRIPT, errors: [] };
  try {
    await waitForServer(url);
    const ctx = await browser.newContext({ viewport: { width: 320, height: 180 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => out.errors.push(String(e).slice(0, 200)));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.game, null, { timeout: 90000 });
    await page.waitForTimeout(400);
    await page.evaluate(async ({ level }) => {
      const g = window.game;
      window.gameState?.setState?.('playing');
      g.loadLevel(level); g.start(); g.resume?.();
      g.postFX?.setQuality?.('off');
      if (g.renderer?.shadowMap) g.renderer.shadowMap.enabled = false;
      document.getElementById('ui-overlay')?.style.setProperty('visibility', 'hidden');
    }, { level: LEVEL });
    await page.waitForTimeout(1000);

    await page.evaluate(({ events, runFor, keymap, seed }) => {
      const g = window.game;
      const DT = 1 / 60;
      if (seed) {
        let a = (seed >>> 0) || 0x9e3779b9;
        Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      }
      window.__pj = { t: 0, rows: [], done: false, contacts: 0 };
      const tel = window.__pj;
      g.isRunning = false;
      // Count anti-stall obstacle resolutions: the game steering itself out of geometry.
      const proto = Object.getPrototypeOf(g);
      if (proto.resolveObstacles && !proto.__pjWrapped) {
        const orig = proto.resolveObstacles;
        proto.resolveObstacles = function (...a) { const r = orig.apply(this, a); if (r) window.__pj.contacts++; window.__pj.lastContact = !!r; return r; };
        proto.__pjWrapped = true;
      }
      const fire = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
      const held = new Set();
      const yawOf = (q) => Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
      const CHUNK = 240;
      const runChunk = () => {
        let n = 0;
        while (tel.t < runFor && n < CHUNK) {
          for (const e of events) {
            const code = keymap[e.key] || e.key;
            if (tel.t >= e.down && tel.t < e.up && !held.has(code)) { fire('keydown', code); held.add(code); }
            if (tel.t >= e.up && held.has(code)) { fire('keyup', code); held.delete(code); }
          }
          tel.lastContact = false;
          const c0 = tel.contacts;
          try { g.fixedUpdate(DT); } catch (err) { tel.error = String(err).slice(0, 300); tel.done = true; return; }
          tel.t += DT; n++;
          const s = g.playerState || {};
          let v = { x: 0, y: 0, z: 0 };
          try { v = g.physics.getVelocity(g.chairBody); } catch {}
          const q = g.chair.quaternion;
          const yaw = yawOf(q);
          // Visual yaw the player actually sees (chair group * tilt group world quaternion).
          let visYaw = yaw;
          try { const wq = new (g.chair.constructor)().quaternion; } catch {}
          tel.rows.push({
            t: +tel.t.toFixed(4),
            x: +g.chair.position.x.toFixed(3), z: +g.chair.position.z.toFixed(3), y: +g.chair.position.y.toFixed(3),
            yaw: +yaw.toFixed(4),
            vx: +v.x.toFixed(3), vz: +v.z.toFixed(3),
            spd: +Math.hypot(v.x, v.z).toFixed(3),
            gnd: s.isGrounded ? 1 : 0, air: s.isAirborne ? 1 : 0, gr: s.isGrinding ? 1 : 0,
            ct: tel.contacts > c0 ? 1 : 0,
            A: held.has('KeyA') ? 1 : 0, D: held.has('KeyD') ? 1 : 0, W: held.has('KeyW') ? 1 : 0,
            S: held.has('KeyS') ? 1 : 0,
          });
        }
        if (tel.t >= runFor) { for (const c of held) fire('keyup', c); tel.done = true; g.isRunning = true; }
        else setTimeout(runChunk, 0);
      };
      runChunk();
    }, { events, runFor: DURATION, keymap: KEYMAP, seed: SEED || null });

    await page.waitForFunction(() => window.__pj?.done === true, null, { timeout: 900000 });
    const tel = await page.evaluate(() => window.__pj);
    if (tel.error) out.errors.push('SIM: ' + tel.error);
    const R = tel.rows;
    const wrap = (a) => { let x = a; while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
    const D2R = 180 / Math.PI;
    let rev = 0, moving = 0, worstRev = 0, sideways = 0;
    let unasked = 0, unaskedFrames = 0, worstUnasked = 0;
    let shocks = 0, worstShock = 0;
    const misHist = [0, 0, 0, 0, 0]; // <15, <45, <90, <135, >=135
    const revEvents = [];
    let inRev = false;
    for (let i = 0; i < R.length; i++) {
      const r = R[i];
      if (r.spd > 1.0) {
        moving++;
        const fwd = { x: Math.sin(r.yaw), z: Math.cos(r.yaw) };
        const dot = (r.vx * fwd.x + r.vz * fwd.z) / r.spd;
        const ang = Math.abs(Math.acos(Math.max(-1, Math.min(1, dot))) * D2R);
        if (ang < 15) misHist[0]++; else if (ang < 45) misHist[1]++; else if (ang < 90) misHist[2]++; else if (ang < 135) misHist[3]++; else misHist[4]++;
        if (dot < 0) { rev++; worstRev = Math.max(worstRev, ang); if (!inRev) { revEvents.push({ t: r.t, spd: r.spd, ang: +ang.toFixed(0) }); inRev = true; } }
        else inRev = false;
        if (ang > 45) sideways++;
      }
      if (i > 0) {
        const p = R[i - 1];
        // Unasked heading change: no steer key, grounded, not grinding, moving.
        if (!r.A && !r.D && !p.A && !p.D && r.gnd && !r.gr && r.spd > 1.0) {
          unaskedFrames++;
          const dy = Math.abs(wrap(r.yaw - p.yaw)) * D2R * 60; // deg/s
          if (dy > 20) { unasked++; worstUnasked = Math.max(worstUnasked, dy); }
        }
        // Speed shock: lost >20% of speed in one frame while above cruise.
        if (p.spd > 6 && r.spd < p.spd * 0.8) { shocks++; worstShock = Math.max(worstShock, p.spd - r.spd); }
      }
    }
    // STEERING IGNORED: a steer key is held, the chair is grounded and moving, and the
    // heading barely moves. This is the thing a player feels as "I am fighting the controls".
    const steerDead = [];
    {
      let start = null, held = 0;
      for (let i = 1; i < R.length; i++) {
        const r = R[i], p = R[i - 1];
        const steering = (r.A || r.D) && r.gnd && !r.gr && r.spd > 3;
        const dy = Math.abs(wrap(r.yaw - p.yaw)) * D2R * 60;
        if (steering && dy < 15) { if (start === null) start = r.t; held = r.t; }
        else { if (start !== null && held - start >= 0.4) steerDead.push({ from: +start.toFixed(2), to: +held.toFixed(2), secs: +(held - start).toFixed(2) }); start = null; }
      }
      if (start !== null && held - start >= 0.4) steerDead.push({ from: +start.toFixed(2), to: +held.toFixed(2), secs: +(held - start).toFixed(2) });
    }
    // WALL GLUE: travel direction frozen to <2 deg over >=0.5s while moving above 4 m/s and
    // more than 30 deg off the nose — the chair sliding along geometry on rails.
    const glue = [];
    {
      let start = null, held = 0, ref = 0;
      for (const r of R) {
        const fwd = { x: Math.sin(r.yaw), z: Math.cos(r.yaw) };
        const ang = r.spd > 0.01 ? Math.acos(Math.max(-1, Math.min(1, (r.vx * fwd.x + r.vz * fwd.z) / r.spd))) * D2R : 0;
        const dirNow = Math.atan2(r.vx, r.vz);
        const ok = r.spd > 4 && ang > 30 && r.gnd && !r.gr;
        if (ok && start !== null && Math.abs(wrap(dirNow - ref)) * D2R < 2) { held = r.t; }
        else { if (start !== null && held - start >= 0.5) glue.push({ from: +start.toFixed(2), secs: +(held - start).toFixed(2) }); start = ok ? r.t : null; ref = dirNow; held = r.t; }
      }
      if (start !== null && held - start >= 0.5) glue.push({ from: +start.toFixed(2), secs: +(held - start).toFixed(2) });
    }
    out.steeringIgnored = { episodes: steerDead.length, totalSeconds: +steerDead.reduce((a, b) => a + b.secs, 0).toFixed(2), worst: steerDead.sort((a, b) => b.secs - a.secs).slice(0, 5) };
    out.wallGlue = { episodes: glue.length, totalSeconds: +glue.reduce((a, b) => a + b.secs, 0).toFixed(2), worst: glue.sort((a, b) => b.secs - a.secs).slice(0, 5) };
    const pct = (n, d) => +(100 * n / Math.max(1, d)).toFixed(1);
    out.frames = R.length;
    out.contacts = tel.contacts;
    out.contactPct = pct(R.filter((r) => r.ct).length, R.length);
    out.reverse = { pctFramesMoving: pct(rev, moving), worstAngleDeg: +worstRev.toFixed(0), events: revEvents.slice(0, 20), eventCount: revEvents.length };
    out.sidewaysPct = pct(sideways, moving);
    out.misalignHistogram = { lt15: pct(misHist[0], moving), lt45: pct(misHist[1], moving), lt90: pct(misHist[2], moving), lt135: pct(misHist[3], moving), gte135: pct(misHist[4], moving) };
    out.unaskedTurn = { pctFrames: pct(unasked, unaskedFrames), worstDegPerSec: +worstUnasked.toFixed(0), sampleFrames: unaskedFrames };
    out.speedShocks = { count: shocks, perMinute: +(shocks / (DURATION / 60)).toFixed(1), worstDrop: +worstShock.toFixed(2) };
    const spds = R.map((r) => r.spd);
    out.speed = {
      mean: +(spds.reduce((a, b) => a + b, 0) / spds.length).toFixed(2),
      max: +Math.max(...spds).toFixed(2),
      pctBelow3: pct(spds.filter((s) => s < 3).length, spds.length),
    };
    if (DUMP) { const p = resolve(String(DUMP)); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(R)); out.dump = p; }
  } catch (e) {
    out.errors.push('HARNESS: ' + String(e).slice(0, 300));
  } finally { await browser.close().catch(() => {}); server.kill('SIGKILL'); }
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}
main();
