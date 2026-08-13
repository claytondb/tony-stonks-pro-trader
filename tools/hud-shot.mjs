#!/usr/bin/env node
/**
 * HUD ATTENTION harness.
 *
 * camshot.mjs hides the UI overlay, so it cannot answer the question this agent
 * owns: how many things is the HUD showing AT SPEED, and do any of them sit on
 * top of each other or on top of the direction of travel?
 *
 * Same freeze-then-shoot technique as camshot: step fixedUpdate() to an exact
 * simulated instant, pause the sim, leave the HUD VISIBLE, optionally stage the
 * transient popups (they run on wall-clock timers, so a normal capture never
 * catches one), then screenshot and dump a DOM census.
 *
 * The census is the measurement:
 *   - every visible HUD element, its computed opacity and its screen rect
 *   - total "ink": sum of visible element area as a % of the viewport
 *   - centre-stage overlaps: any two transient popups sharing screen space
 *   - sightline: does any text box intersect the travel-direction band
 *     (the middle 34% column, 30%..62% of frame height) where the player reads
 *     where the chair is going
 *
 * Usage:
 *   node tools/hud-shot.mjs --script "W:0-9,Down:7@tap,Up:7.12@tap" --at 8.4 \
 *        --stage trick --out shots/hud-fast.png
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
const SCRIPT = String(arg('script', 'W:0-9'));
const AT = Number(arg('at', 8));
const OUT = resolve(String(arg('out', 'shots/hud.png')));
const STAGE = String(arg('stage', 'none'));   // none | trick | storm
const DIST = String(arg('dist', 'dist-hud'));
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
  for (let i = 0; i < 160; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server never came up at ${url}`);
};

async function main() {
  if (!existsSync(`${ROOT}/${DIST}/index.html`)) {
    console.error(`${DIST}/ missing — run \`npx vite build --outDir ${DIST}\` first`);
    process.exit(2);
  }
  const events = parseScript(SCRIPT);
  const port = await freePort();
  const server = spawn('npx', ['vite', 'preview', '--outDir', DIST, '--port', String(port),
    '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
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
      document.getElementById('loading')?.classList.add('hidden');
      // HUD stays visible on purpose. Kill only the dialogue/story overlays.
      window.__hideOther = () => {
        for (const sel of ['.dialogue-box', '.chase-hud', '#pause-menu']) {
          for (const el of document.querySelectorAll(sel)) el.style.setProperty('display', 'none');
        }
      };
      window.__hideOther();
      // A SwiftShader frame costs ~1 s, so CSS transitions barely advance between
      // captures and every faded-in widget photographs at opacity 0. Freezing the
      // transitions makes the census read the SETTLED value, which is the thing
      // the player actually looks at.
      const st = document.createElement('style');
      st.textContent = '.hud-container, .hud-container * { transition: none !important; animation: none !important; }';
      document.head.appendChild(st);
    }, { level: LEVEL });

    await page.waitForTimeout(1200);

    const state = await page.evaluate(({ events, runFor, keymap }) => {
      const g = window.game;
      const DT = 1 / 60;
      g.isRunning = false;
      const fire = (type, code) => window.dispatchEvent(
        new KeyboardEvent(type, { code, key: code, bubbles: true }));
      const held = new Set();
      let t = 0;
      while (t < runFor) {
        for (const e of events) {
          const code = keymap[e.key] || e.key;
          if (t >= e.down && t < e.up && !held.has(code)) { fire('keydown', code); held.add(code); }
          if (t >= e.up && held.has(code)) { fire('keyup', code); held.delete(code); }
        }
        g.fixedUpdate(DT);
        t += DT;
      }
      const s = g.playerState || {};
      let vel = { x: 0, y: 0, z: 0 };
      try { vel = g.physics.getVelocity(g.chairBody); } catch { /* pre-spawn */ }
      g.isPaused = true;
      g.isRunning = true;
      g.start?.();
      let combo = null;
      try { combo = g.score?.state || null; } catch { /* none */ }
      return {
        t: +t.toFixed(2),
        speed: +Math.hypot(vel.x, vel.z).toFixed(2),
        air: !!s.isAirborne, grind: !!s.isGrinding, man: !!s.isManualing,
        comboOpen: !!combo?.open, mult: +(g.score?.multiplier ?? 1).toFixed(2),
        heat: +(g.police?.heatLevel ?? 0).toFixed(3),
      };
    }, { events, runFor: AT, keymap: KEYMAP });

    // Let the frozen frame actually render before touching the DOM.
    await page.waitForTimeout(2500);

    // Stage the transient popups: they run on wall-clock timers and a SwiftShader
    // frame costs ~1 s, so a plain capture never catches one alive. Timers are
    // neutralised first so the staged state survives to the shutter. This is the
    // worst-case simultaneity test.
    if (STAGE !== 'none') {
      await page.evaluate(({ stage }) => {
        const g = window.game;
        const hud = g?.hud;
        if (!hud) return;
        window.__hideOther?.();
        window.setTimeout = () => 0;
        // The render loop keeps calling setComboState(null) even while paused, which
        // would wipe the staged line before the shutter. Detach it; the DOM stays.
        window.__hud = hud;
        g.hud = null;
        const speed = hud.attentionSpeed ?? -1;
        hud.setSpinCounter(540);
        hud.setComboState({
          open: true,
          tricks: [
            { name: 'Kickflip' }, { name: '50-50' }, { name: 'Nosegrind' }, { name: 'Manual' },
            { name: '360 Spin' }, { name: 'Indy Grab' }, { name: 'Kickflip Indy Nosebone' },
          ],
          base: 5200, multiplier: 8.4, unrealised: 43680, timeRemaining: 1600,
          inGrind: false, inManual: true, duration: 14000, grindTime: 4, manualTime: 3,
          airTime: 2, distinctTricks: 7, comboString: '', formattedUnrealised: '$43,680',
          formattedMultiplier: 'x 8.4', timeFraction: 0.42, atRisk: 51200, marginCall: 7520,
        });
        hud.showTrick('Kickflip Indy Nosebone', 1450, 8.4, 'flip');
        if (stage === 'storm') {
          hud.showGoalComplete?.({
            id: 'x', description: 'Grind the whole mezzanine rail', reward: 25000,
            complete: true, failed: false, fraction: 1, kind: 'objective', detail: '', secret: false,
          });
        }
        // A SwiftShader frame costs seconds, so a real popup hold expires between
        // staging and the shutter. Push the arbiter's deadlines out instead of
        // faking the clock, then re-arbitrate.
        if (stage === 'storm') hud.bannerUntil = performance.now() + 6e5;
        else hud.trickUntil = performance.now() + 6e5;
        hud.stageOwner = 'none';
        hud.renderStage();
        return speed;
      }, { stage: STAGE });
      await page.waitForTimeout(120);
    }

    const census = await page.evaluate(() => {
      const vw = window.innerWidth, vh = window.innerHeight;
      const root = document.querySelector('.hud-container');
      const out = [];
      if (root) {
        const walk = (el) => {
          for (const c of el.children) {
            // .hud-stage is a zero-size anchor; its tenants are the widgets.
            if (typeof c.className === 'string' && c.className.includes('hud-stage')) { walk(c); continue; }
            const cs = getComputedStyle(c);
            const r = c.getBoundingClientRect();
            const visible = cs.display !== 'none' && cs.visibility !== 'hidden' &&
              parseFloat(cs.opacity) > 0.02 && r.width > 2 && r.height > 2;
            if (visible && c.className && typeof c.className === 'string') {
              out.push({
                cls: c.className,
                op: +parseFloat(cs.opacity).toFixed(3),
                x: Math.round(r.x), y: Math.round(r.y),
                w: Math.round(r.width), h: Math.round(r.height),
                areaPct: +((r.width * r.height) / (vw * vh) * 100).toFixed(2),
                text: (c.textContent || '').trim().slice(0, 40),
              });
            }
          }
        };
        walk(root);
      }
      // Effective ink: area x opacity, summed over top-level widgets.
      const ink = +out.reduce((a, e) => a + e.areaPct * e.op, 0).toFixed(2);
      // Sightline band: middle 34% column, 30%..62% of height. Text here sits on
      // top of where the chair is going.
      const bx0 = vw * 0.33, bx1 = vw * 0.67, by0 = vh * 0.30, by1 = vh * 0.62;
      const inSightline = out.filter((e) =>
        e.x < bx1 && e.x + e.w > bx0 && e.y < by1 && e.y + e.h > by0 && e.text.length > 0);
      // Pairwise overlaps between visible widgets.
      const overlaps = [];
      for (let i = 0; i < out.length; i++) {
        for (let j = i + 1; j < out.length; j++) {
          const a = out[i], b = out[j];
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          if (ox > 4 && oy > 4) overlaps.push(`${a.cls} ∩ ${b.cls} (${ox}x${oy}px)`);
        }
      }
      const all = [];
      if (root) {
        const kids = [];
        for (const c of root.children) {
          if (typeof c.className === 'string' && c.className.includes('hud-stage')) {
            for (const k of c.children) kids.push(k);
          } else kids.push(c);
        }
        for (const c of kids) {
          const cs = getComputedStyle(c);
          const r = c.getBoundingClientRect();
          all.push(`${c.className} op=${(+parseFloat(cs.opacity)).toFixed(2)} disp=${cs.display} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      }
      return {
        hudBound: !!(window.__hud ?? window.game?.hud),
        hudSpeed: (window.__hud ?? window.game?.hud)?.attentionSpeed ?? null,
        stage: (() => { const h = window.__hud ?? window.game?.hud; if (!h) return null;
          return { owner: h.stageOwner, spinWanted: h.spinWanted,
            bannerIn: Math.round(h.bannerUntil - performance.now()),
            trickIn: Math.round(h.trickUntil - performance.now()) }; })(),
        hudCalm: (window.__hud ?? window.game?.hud)?.attentionCalm ?? null,
        allChildren: all,
        viewport: [vw, vh],
        visibleWidgets: out.length,
        inkPctOfScreen: ink,
        sightlineHits: inSightline.map((e) => `${e.cls} "${e.text}"`),
        overlaps,
        widgets: out.sort((a, b) => b.areaPct * b.op - a.areaPct * a.op),
      };
    });

    mkdirSync(dirname(OUT), { recursive: true });
    await page.screenshot({ path: OUT, timeout: 300000 });
    console.log(JSON.stringify({ out: OUT, state, census, errors }, null, 2));
  } catch (e) {
    console.error(String(e));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    server.kill('SIGKILL');
  }
}

main();
