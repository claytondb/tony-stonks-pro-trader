#!/usr/bin/env node
/**
 * Screenshot harness for Tony Stonks Pro Trader.
 *
 * Boots the built game in headless Chromium (SwiftShader WebGL), loads a level,
 * optionally simulates gameplay input, positions the camera, and writes a PNG.
 *
 * Usage:
 *   node tools/shoot.mjs --level ch1_office --out shots/office.png
 *   node tools/shoot.mjs --level ch1_office --shot orbit --pos 10,6,14 --look 0,1,0 --out shots/a.png
 *   node tools/shoot.mjs --level ch1_office --play 3 --keys W,Space --out shots/b.png
 *
 * Flags:
 *   --level <id>     level id (default ch1_office). story_* ids load via loadStoryLevel.
 *   --out <path>     output png path (default shots/shot.png)
 *   --w --h          viewport size (default 1600x900)
 *   --shot <mode>    follow | orbit    (default follow)
 *   --pos x,y,z      orbit camera position (world space)
 *   --look x,y,z     orbit camera target
 *   --fov <n>        orbit camera fov (default 50)
 *   --play <sec>     simulate this many seconds of gameplay before capture
 *   --keys <list>    comma list of keys held during --play (W,A,S,D,Space,Shift,J,K,L)
 *   --hud            keep the HUD/UI overlay visible (default: hidden)
 *   --settle <ms>    extra wait before capture (default 900)
 *   --json           also print a JSON report (console errors, fps, drawcalls, tris)
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import net from 'node:net';

const argv = process.argv.slice(2);
const arg = (name, def = null) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const has = (name) => argv.includes(`--${name}`);
const vec = (s, def) => (s ? s.split(',').map(Number) : def);

const LEVEL = String(arg('level', 'ch1_office'));
const OUT = resolve(String(arg('out', 'shots/shot.png')));
const W = Number(arg('w', 1600));
const H = Number(arg('h', 900));
const SHOT = String(arg('shot', 'follow'));
const POS = vec(arg('pos'), null);
const LOOK = vec(arg('look'), [0, 1, 0]);
const FOV = Number(arg('fov', 50));
const PLAY = Number(arg('play', 0));
const KEYS = String(arg('keys', '')).split(',').map((s) => s.trim()).filter(Boolean);
const SHOW_HUD = has('hud');
const SETTLE = Number(arg('settle', 900));
const WANT_JSON = has('json');
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

const freePort = () =>
  new Promise((res) => {
    const s = net.createServer();
    s.listen(0, () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });

const waitForServer = async (url, timeoutMs = 30000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server never came up at ${url}`);
};

const KEYMAP = {
  W: 'KeyW', A: 'KeyA', S: 'KeyS', D: 'KeyD',
  Space: 'Space', Shift: 'ShiftLeft', Ctrl: 'ControlLeft',
  J: 'KeyJ', K: 'KeyK', L: 'KeyL', E: 'KeyE', Q: 'KeyQ',
  Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight',
};

async function main() {
  if (!existsSync(`${ROOT}/dist/index.html`)) {
    console.error('dist/ missing — run `npm run build` first');
    process.exit(2);
  }
  mkdirSync(dirname(OUT), { recursive: true });

  const port = await freePort();
  const server = spawn(
    'npx',
    ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore' }
  );
  const url = `http://127.0.0.1:${port}/`;

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--disable-dev-shm-usage',
      '--no-sandbox',
    ],
  });

  const report = { level: LEVEL, errors: [], warnings: [], out: OUT };
  let exitCode = 0;

  try {
    await waitForServer(url);
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();

    page.on('console', (m) => {
      const t = m.type();
      if (t === 'error') report.errors.push(m.text().slice(0, 400));
      else if (t === 'warning') report.warnings.push(m.text().slice(0, 300));
    });
    page.on('pageerror', (e) => report.errors.push(`PAGEERROR: ${String(e).slice(0, 400)}`));

    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Wait for the game object to exist and finish init.
    await page.waitForFunction(() => !!window.game, null, { timeout: 90000 });
    await page.waitForTimeout(500);

    // Load the requested level and start.
    await page.evaluate(async ({ level }) => {
      const g = window.game;
      window.gameState?.setState?.('playing');
      if (level.startsWith('story_')) {
        const mod = await import('/src/story/StoryLevels.ts').catch(() => null);
        if (mod?.getStoryLevel) g.loadStoryLevel(mod.getStoryLevel(level));
        else g.loadLevel(level);
      } else {
        g.loadLevel(level);
      }
      g.start();
      g.resume?.();
    }, { level: LEVEL });

    await page.waitForTimeout(1200);

    if (!SHOW_HUD) {
      await page.evaluate(() => {
        const o = document.getElementById('ui-overlay');
        if (o) o.style.visibility = 'hidden';
        document.getElementById('loading')?.classList.add('hidden');
      });
    }

    // Simulate gameplay
    if (PLAY > 0) {
      for (const k of KEYS) {
        const code = KEYMAP[k] || k;
        await page.keyboard.down(code);
      }
      await page.waitForTimeout(PLAY * 1000);
      for (const k of KEYS) {
        const code = KEYMAP[k] || k;
        await page.keyboard.up(code).catch(() => {});
      }
    }

    // Orbit / fixed-camera mode: take over the camera after the game has updated it.
    if (SHOT === 'orbit' && POS) {
      await page.evaluate(({ pos, look, fov }) => {
        const g = window.game;
        const cam = g.camera;
        // Neutralise the follow controller so it can't fight us.
        if (g.cameraController) g.cameraController.enabled = false;
        const orig = cam.updateMatrixWorld.bind(cam);
        cam.position.set(pos[0], pos[1], pos[2]);
        cam.fov = fov;
        cam.lookAt(look[0], look[1], look[2]);
        cam.updateProjectionMatrix();
        // Re-pin every frame in case the game overwrites it.
        window.__pin = setInterval(() => {
          cam.position.set(pos[0], pos[1], pos[2]);
          cam.fov = fov;
          cam.lookAt(look[0], look[1], look[2]);
          cam.updateProjectionMatrix();
          orig();
        }, 8);
      }, { pos: POS, look: LOOK, fov: FOV });
      await page.waitForTimeout(400);
    }

    await page.waitForTimeout(SETTLE);

    // Perf + scene stats
    report.stats = await page.evaluate(() => {
      const g = window.game;
      const r = g?.renderer;
      let tris = 0, meshes = 0, mats = new Set(), texs = new Set();
      g?.scene?.traverse?.((o) => {
        if (o.isMesh) {
          meshes++;
          const gm = o.geometry;
          if (gm?.index) tris += gm.index.count / 3;
          else if (gm?.attributes?.position) tris += gm.attributes.position.count / 3;
          const m = o.material;
          (Array.isArray(m) ? m : [m]).forEach((mm) => mm && mats.add(mm.uuid));
        }
      });
      return {
        drawCalls: r?.info?.render?.calls ?? null,
        triangles: Math.round(tris),
        meshes,
        materials: mats.size,
        programs: r?.info?.programs?.length ?? null,
        textures: r?.info?.memory?.textures ?? null,
        pixelRatio: r?.getPixelRatio?.() ?? null,
        toneMapping: r?.toneMapping ?? null,
        exposure: r?.toneMappingExposure ?? null,
        shadowType: r?.shadowMap?.type ?? null,
      };
    });

    await page.screenshot({ path: OUT });
  } catch (e) {
    report.errors.push(`HARNESS: ${String(e).slice(0, 600)}`);
    exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    server.kill('SIGKILL');
  }

  if (WANT_JSON) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`wrote ${OUT}`);
    if (report.stats) console.log('stats:', JSON.stringify(report.stats));
    if (report.errors.length) console.log(`ERRORS (${report.errors.length}):\n  ` + report.errors.slice(0, 8).join('\n  '));
  }
  process.exit(exitCode);
}

main();
