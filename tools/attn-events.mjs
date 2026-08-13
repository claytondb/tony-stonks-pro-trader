#!/usr/bin/env node
/**
 * TEMPORARY AUDIT harness — attention EVENT RATE vs speed on a realistic run.
 * Counts, per speed bucket: camera shakes, postFX pulses, trick popups, paper bursts,
 * escape frames, uncommanded yaw, live particle counts.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import net from 'node:net';
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const waitForServer = async (u) => { for (let i = 0; i < 160; i++) { try { const r = await fetch(u); if (r.ok) return; } catch {} await new Promise((r) => setTimeout(r, 250)); } throw new Error('x'); };
const port = await freePort();
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
const url = `http://127.0.0.1:${port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'] });
try {
  await waitForServer(url);
  const page = await (await browser.newContext({ viewport: { width: 800, height: 450 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.game, null, { timeout: 120000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const g = window.game; window.gameState?.setState?.('playing'); g.loadLevel('ch1_office'); g.start(); g.resume?.(); });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const g = window.game;
    const DT = 1 / 60;
    g.isRunning = false;
    const fire = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c, bubbles: true }));
    const held = new Set();
    const setKeys = (codes) => {
      for (const c of Array.from(held)) if (!codes.includes(c)) { fire('keyup', c); held.delete(c); }
      for (const c of codes) if (!held.has(c)) { fire('keydown', c); held.add(c); }
    };
    const ev = { shake: 0, pulse: 0, popup: 0, burst: 0, esc: 0, escYaw: 0 };
    const cc = g.cameraController;
    const oShake = cc.shake.bind(cc); cc.shake = (i, d) => { ev.shake++; return oShake(i, d); };
    const pf = g.postFX; if (pf) { const op = pf.pulse.bind(pf); pf.pulse = (s) => { ev.pulse++; return op(s); }; }
    const hud = g.hud; if (hud) { const ot = hud.showTrick.bind(hud); hud.showTrick = (...a) => { ev.popup++; return ot(...a); }; }
    const ps = g.paperStorm; if (ps) { const ob = ps.burst.bind(ps); ps.burst = (...a) => { ev.burst++; return ob(...a); }; }
    const yawOf = () => { const q = g.physics.getRotation(g.chairBody); return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x)); };
    const wrap = (d) => { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
    const proto = Object.getPrototypeOf(g);
    const orig = proto.resolveObstacles;
    proto.resolveObstacles = function (dt, dir, speed, pushing) {
      const y0 = yawOf();
      const r = orig.call(this, dt, dir, speed, pushing);
      if (r) { ev.esc++; ev.escYaw += Math.abs(wrap(yawOf() - y0)); }
      return r;
    };

    // a plausible 70 s line: push, carve both ways, ollie, grind attempts, spins
    const script = [
      ['KeyW', 300], ['KeyW KeyD', 40], ['KeyW', 120], ['Space', 8], ['KeyW KeyJ', 20],
      ['KeyW', 100], ['KeyW KeyA', 45], ['KeyW', 90], ['KeyW KeyL', 60], ['KeyW', 120],
      ['KeyW KeyD', 50], ['KeyW', 150], ['Space', 10], ['KeyW KeyK', 25], ['KeyW', 130],
      ['KeyW KeyA', 60], ['KeyW', 200], ['KeyW KeyE', 30], ['KeyW', 180],
      ['KeyW KeyD', 40], ['KeyW', 250], ['KeyW KeyA', 40], ['KeyW', 300],
      ['KeyW', 300], ['KeyW KeyD', 60], ['KeyW', 400],
    ];
    const buckets = {};
    let lastYaw = yawOf();
    let prev = { ...ev };
    for (const [keys, frames] of script) {
      setKeys(keys.split(' ').filter(Boolean));
      for (let i = 0; i < frames; i++) {
        g.fixedUpdate(DT);
        const v = g.physics.getVelocity(g.chairBody);
        const sp = Math.hypot(v.x, v.z);
        const y = yawOf();
        const dyaw = Math.abs(wrap(y - lastYaw)); lastYaw = y;
        const cmdYaw = Math.abs(g.turnCommand ?? 0) * DT;
        const b = sp < 4 ? '0-4' : sp < 8 ? '4-8' : sp < 11 ? '8-11' : sp < 13 ? '11-13' : sp < 14.5 ? '13-14.5' : '14.5+';
        const o = (buckets[b] ||= { frames: 0, shake: 0, pulse: 0, popup: 0, burst: 0, esc: 0, escYaw: 0, yaw: 0, cmdYaw: 0, slCount: 0, paperAir: 0, sparks: 0, fov: 0, blur: 0 });
        o.frames++;
        o.shake += ev.shake - prev.shake; o.pulse += ev.pulse - prev.pulse;
        o.popup += ev.popup - prev.popup; o.burst += ev.burst - prev.burst;
        o.esc += ev.esc - prev.esc; o.escYaw += ev.escYaw - prev.escYaw;
        prev = { ...ev };
        o.yaw += dyaw; o.cmdYaw += cmdYaw;
        o.slCount += g.speedLines?.count ?? 0;
        o.paperAir += g.paperStorm?.airborneCount ?? 0;
        o.sparks += g.grindParticles?.sparkCount ?? 0;
        o.fov += g.camera.fov;
        o.blur += g.speedLines?.getBlurDrive() ?? 0;
      }
    }
    setKeys([]);
    const out = {};
    for (const k of Object.keys(buckets)) {
      const o = buckets[k];
      const secs = o.frames / 60;
      out[k] = {
        seconds: +secs.toFixed(1),
        shakesPerSec: +(o.shake / secs).toFixed(2),
        pulsesPerSec: +(o.pulse / secs).toFixed(2),
        trickPopupsPerSec: +(o.popup / secs).toFixed(2),
        paperBurstsPerSec: +(o.burst / secs).toFixed(2),
        escapeFramesPct: +(100 * o.esc / o.frames).toFixed(2),
        escapeYawDegPerSec: +((o.escYaw * 180 / Math.PI) / secs).toFixed(1),
        totalYawDegPerSec: +((o.yaw * 180 / Math.PI) / secs).toFixed(1),
        commandedYawDegPerSec: +((o.cmdYaw * 180 / Math.PI) / secs).toFixed(1),
        meanStreaks: +(o.slCount / o.frames).toFixed(1),
        meanAirbornePaper: +(o.paperAir / o.frames).toFixed(1),
        meanSparks: +(o.sparks / o.frames).toFixed(1),
        meanFOV: +(o.fov / o.frames).toFixed(1),
        meanBlurDrive: +(o.blur / o.frames).toFixed(3),
      };
    }
    return { buckets: out, totals: ev };
  });
  console.log(JSON.stringify({ r, errors }, null, 2));
} finally { await browser.close().catch(() => {}); server.kill('SIGKILL'); }
