#!/usr/bin/env node
/**
 * TEMPORARY camera-verification harness.
 *
 * play.mjs measures feel but only screenshots the final frame; shoot.mjs renders at
 * quality but cannot hold a mid-air or mid-grind state, because a software-WebGL frame
 * costs seconds and the state has moved on by the time the shutter opens.
 *
 * This steps fixedUpdate() deterministically to an exact simulated time, then FREEZES the
 * sim (isPaused) and hands rendering back, so the frame captured is exactly the state at
 * that instant. Usage mirrors play.mjs:
 *
 *   node tools/camshot.mjs --script "W:0-12,L:2-9" --at 5.0 --out shots/cam-grind.png
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import net from 'node:net';

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  if (i === -1) return d;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};

const LEVEL = String(arg('level', 'ch1_office'));
const SCRIPT = String(arg('script', 'W:0-12'));
const AT = Number(arg('at', 5));
const OUT = resolve(String(arg('out', 'shots/cam.png')));
const TRACE = argv.includes('--trace');
const W = Number(arg('w', 1280));
const H = Number(arg('h', 720));
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

const KEYMAP = {
  W: 'KeyW', A: 'KeyA', S: 'KeyS', D: 'KeyD', Space: 'Space',
  Shift: 'ShiftLeft', J: 'KeyJ', K: 'KeyK', L: 'KeyL',
  E: 'KeyE', Q: 'KeyQ', Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight',
};

function parseScript(s) {
  const out = [];
  for (const partRaw of s.split(',')) {
    const part = partRaw.trim();
    if (!part) continue;
    const [key, spec] = part.split(':');
    if (!spec) continue;
    if (spec.endsWith('@tap')) {
      const t = Number(spec.slice(0, -4));
      out.push({ key, down: t, up: t + 0.12 });
    } else {
      const [a, b] = spec.split('-').map(Number);
      out.push({ key, down: a, up: b });
    }
  }
  return out;
}

const freePort = () => new Promise((res) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});

const waitForServer = async (url) => {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server never came up at ${url}`);
};

async function main() {
  if (!existsSync(`${ROOT}/dist/index.html`)) {
    console.error('dist/ missing — run `npm run build` first');
    process.exit(2);
  }
  const events = parseScript(SCRIPT);
  const port = await freePort();
  const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/`;

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--enable-webgl', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'],
  });

  const errors = [];
  try {
    await waitForServer(url);
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => errors.push(`PAGEERROR: ${String(e).slice(0, 300)}`));

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.game, null, { timeout: 90000 });
    await page.waitForTimeout(400);

    await page.evaluate(async ({ level }) => {
      const g = window.game;
      window.gameState?.setState?.('playing');
      if (level.startsWith('story_')) {
        const m = await import('/src/story/StoryLevels.ts').catch(() => null);
        if (m?.getStoryLevel) g.loadStoryLevel(m.getStoryLevel(level)); else g.loadLevel(level);
      } else g.loadLevel(level);
      g.start(); g.resume?.();
      document.getElementById('ui-overlay')?.style.setProperty('visibility', 'hidden');
      document.getElementById('loading')?.classList.add('hidden');
    }, { level: LEVEL });

    await page.waitForTimeout(1200);

    const state = await page.evaluate(({ events, runFor, keymap, trace }) => {
      const g = window.game;
      const DT = 1 / 60;
      g.isRunning = false;
      const fire = (type, code) => window.dispatchEvent(
        new KeyboardEvent(type, { code, key: code, bubbles: true }));
      const held = new Set();
      if (trace) window.__trace = { minBoom: 1, sumBoom: 0, n: 0, pulledFrames: 0, occludedFrames: 0, minCamY: 1e9 };
      let t = 0;
      while (t < runFor) {
        for (const e of events) {
          const code = keymap[e.key] || e.key;
          if (t >= e.down && t < e.up && !held.has(code)) { fire('keydown', code); held.add(code); }
          if (t >= e.up && held.has(code)) { fire('keyup', code); held.delete(code); }
        }
        g.fixedUpdate(DT);
        t += DT;
        if (window.__trace) {
          const cc = g.cameraController;
          const tr = window.__trace;
          tr.minBoom = Math.min(tr.minBoom, cc.boomScale);
          if (cc.boomScale < 0.995) tr.pulledFrames++;
          tr.sumBoom += cc.boomScale; tr.n++;
          // Is there world between the pivot and the lens RIGHT NOW?
          const piv = cc._pivot;
          const dx = g.camera.position.x - piv.x, dy = g.camera.position.y - piv.y, dz = g.camera.position.z - piv.z;
          const d = Math.hypot(dx, dy, dz);
          if (d > 0.05) {
            const hit = g.physics.probeDirection(
              piv, { x: dx / d, y: dy / d, z: dz / d, normalize() { return this; }, clone() { return this; } }, d, g.chairBody);
            if (hit && hit.distance > 0.15 && hit.distance < d - 0.05) tr.occludedFrames++;
          }
          tr.minCamY = Math.min(tr.minCamY, g.camera.position.y);
        }
      }
      const s = g.playerState || {};
      let vel = { x: 0, y: 0, z: 0 };
      try { vel = g.physics.getVelocity(g.chairBody); } catch {}
      // Freeze: paused means loop() renders but never steps, so the shutter sees THIS frame.
      g.isPaused = true;
      g.isRunning = true;
      g.start?.();
      return {
        t: +t.toFixed(2),
        chair: [+g.chair.position.x.toFixed(2), +g.chair.position.y.toFixed(2), +g.chair.position.z.toFixed(2)],
        cam: [+g.camera.position.x.toFixed(2), +g.camera.position.y.toFixed(2), +g.camera.position.z.toFixed(2)],
        fov: +g.camera.fov.toFixed(1),
        boomLen: +Math.hypot(g.camera.position.x - g.chair.position.x,
                             g.camera.position.z - g.chair.position.z).toFixed(2),
        camAboveChair: +(g.camera.position.y - g.chair.position.y).toFixed(2),
        speed: +Math.hypot(vel.x, vel.z).toFixed(2),
        air: !!s.isAirborne, grind: !!s.isGrinding, man: !!s.isManualing, gnd: !!s.isGrounded,
        boomScale: +(g.cameraController?.boomScale ?? -1).toFixed(3),
        bailBlend: +(g.cameraController?.bailBlend ?? -1).toFixed(3),
        roll: +(g.cameraController?.rollCurrent ?? 0).toFixed(4),
        trace: window.__trace ? {
          frames: window.__trace.n,
          minBoomScale: +window.__trace.minBoom.toFixed(3),
          meanBoomScale: +(window.__trace.sumBoom / window.__trace.n).toFixed(4),
          framesBoomPulledIn: window.__trace.pulledFrames,
          framesWithWorldBetweenPivotAndLens: window.__trace.occludedFrames,
          minCameraY: +window.__trace.minCamY.toFixed(2),
        } : null,
      };
    }, { events, runFor: AT, keymap: KEYMAP, trace: TRACE });

    await page.waitForTimeout(2500);
    mkdirSync(dirname(OUT), { recursive: true });
    await page.screenshot({ path: OUT, timeout: 300000 });
    console.log(JSON.stringify({ out: OUT, state, errors }, null, 2));
  } catch (e) {
    console.error(String(e));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    server.kill('SIGKILL');
  }
}

main();
