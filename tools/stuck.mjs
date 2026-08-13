#!/usr/bin/env node
/**
 * STUCK harness — can the player ALWAYS get moving again?
 *
 * The owner's report on the cross-corridor build was, verbatim: "it's easy to get stuck
 * inside of a cubicle." A cubicle you can enter and not escape is not a rough edge, it is a
 * hard defect: it ends the run, and no amount of flow anywhere else in the level compensates.
 *
 * Neither play.mjs nor space.mjs can see it. play.mjs drives one scripted line and reports
 * what happened on it. space.mjs measures the plate in 2D from the collider set, so it cannot
 * see a mezzanine at all and cannot tell "surrounded by geometry" from "surrounded by
 * geometry with a way out over the top".
 *
 * This one is brute force, which is the only honest way to answer the question. It teleports
 * the chair to every point of a grid across BOTH FLOORS, drops it, holds forward for a couple
 * of seconds in four different headings, and asks how far it got. A point where all four
 * headings travel less than THRESHOLD metres is a place the player can be put and not leave —
 * and every one of them is printed with its coordinates so it can be fixed, not just counted.
 *
 *   node tools/stuck.mjs --level ch1_office
 *   node tools/stuck.mjs --level ch1_office --step 1.0 --json
 *
 * Requires `npm run build` first, like every other harness here.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import net from 'node:net';

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); if (i === -1) return d; const v = argv[i + 1]; return v === undefined || v.startsWith('--') ? true : v; };
const has = (n) => argv.includes(`--${n}`);
const LEVEL = String(arg('level', 'ch1_office'));
const STEP = Number(arg('step', 1.5));
const HALF = Number(arg('half', 22.0));
/** Metres travelled in the test window under which a drop point counts as STUCK. */
const THRESHOLD = Number(arg('threshold', 3.0));
/**
 * RAY-CAST CEILINGS, one per storey — not drop heights. Each entry is the height the probe
 * looks DOWN from to find the surface under a grid point; the chair is then placed 0.7 m over
 * whatever it found. 3.85 is just under the mezzanine soffit, so the ground-floor pass finds
 * carpet, stair treads and ledges; 7.5 is just under the upper ceiling, so the upper pass
 * finds the deck.
 */
const FLOORS = String(arg('floors', '3.85,7.5')).split(',').map(Number);
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const waitForServer = async (url, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if ((await fetch(url)).ok) return true; } catch {} await new Promise((r) => setTimeout(r, 200)); } throw new Error('no server'); };

async function main() {
  if (!existsSync(`${ROOT}/dist/index.html`)) { console.error('dist/ missing — run npm run build'); process.exit(2); }
  const port = await freePort();
  const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'],
  });
  const out = { level: LEVEL, step: STEP, threshold: THRESHOLD, floors: FLOORS };
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

    const res = await page.evaluate(async ({ step, half, threshold, floors }) => {
      const g = window.game;
      const V3 = g.chair.position.constructor;
      // Deterministic in-page RNG so a failure list reproduces.
      let a = 20260813 >>> 0;
      Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

      const fire = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
      const DT = 1 / 60;
      const SETTLE = 42;     // frames to let the drop land before the test window opens
      const WINDOW = 132;    // 2.2 s of holding forward

      /**
       * Find the surface under (x, z) BELOW `from`, and return a drop height 0.7 m above it.
       *
       * Dropping from a fixed height is what the first two runs of this probe did, and both
       * times every "stuck" point it reported was simply a spot where the level's own geometry
       * is taller than the drop height — the middle of the staircase — so the chair was
       * teleported INSIDE a collider. That measures the probe, not the level. Raycasting first
       * means the chair always starts standing on whatever is actually there: carpet, a tread,
       * a ledge, the mezzanine deck.
       */
      const surfaceAt = (x, z, from) => {
        const hit = g.physics.probeDirection(new V3(x, from, z), new V3(0, -1, 0), from + 1.0, g.chairBody);
        const top = hit ? from - hit.distance : 0;
        return top + 0.7;
      };

      // One trial: put the chair at (x, y, z) facing `yaw`, hold W, return metres travelled.
      const trial = (x, y, z, yaw) => {
        g.physics.setPosition(g.chairBody, new V3(x, y, z));
        g.physics.setRotationY(g.chairBody, yaw);
        g.physics.setVelocity(g.chairBody, new V3(0, 0, 0));
        for (let i = 0; i < SETTLE; i++) g.fixedUpdate(DT);
        const p0 = g.chair.position.clone();
        fire('keydown', 'KeyW');
        let best = 0;
        for (let i = 0; i < WINDOW; i++) {
          g.fixedUpdate(DT);
          const p = g.chair.position;
          const d = Math.hypot(p.x - p0.x, p.z - p0.z);
          if (d > best) best = d;
        }
        fire('keyup', 'KeyW');
        return { moved: best, endY: g.chair.position.y };
      };

      const YAWS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      const failures = [];
      const worst = [];
      let tested = 0;
      let fell = 0;

      for (const from of floors) {
        for (let x = -half; x <= half; x += step) {
          for (let z = -half; z <= half; z += step) {
            // The upper floor only exists over the north half; skip drops that would just
            // be a 4 m fall onto the atrium carpet, which is not a stuck test.
            if (from > 5 && z < 5.6) continue;
            const y = surfaceAt(x, z, from);
            // An upper-floor probe that finds the ground floor is looking through the stair
            // void or the lift shaft; the ground-floor pass already covers that column.
            if (from > 5 && y < 3.0) continue;
            tested++;
            let best = 0;
            let bestEndY = 0;
            for (const yaw of YAWS) {
              const r = trial(x, y, z, yaw);
              if (r.moved > best) { best = r.moved; bestEndY = r.endY; }
              if (best >= threshold) break;   // already proven escapable, stop early
            }
            if (from > 5 && bestEndY < 2.0) fell++;
            worst.push([+x.toFixed(1), +z.toFixed(1), +y.toFixed(1), +best.toFixed(2)]);
            if (best < threshold) failures.push({ x: +x.toFixed(1), z: +z.toFixed(1), y: +y.toFixed(1), moved: +best.toFixed(2) });
          }
        }
      }
      worst.sort((p, q) => p[3] - q[3]);
      return { tested, failures, tightest: worst.slice(0, 14), fellToGround: fell };
    }, { step: STEP, half: HALF, threshold: THRESHOLD, floors: FLOORS });

    out.tested = res.tested;
    out.stuckPoints = res.failures.length;
    out.stuckPct = +(res.failures.length / Math.max(1, res.tested) * 100).toFixed(2);
    out.failures = res.failures.slice(0, 60);
    out.tightest = res.tightest;
    out.mezzanineDropsToGround = res.fellToGround;
    out.errors = errs;
  } catch (e) {
    out.error = String(e).slice(0, 400);
  } finally {
    await browser.close(); server.kill('SIGKILL');
  }
  if (has('json')) console.log(JSON.stringify(out));
  else console.log(JSON.stringify(out, null, 2));
  process.exit(out.error || out.stuckPoints > 0 ? 1 : 0);
}
main();
