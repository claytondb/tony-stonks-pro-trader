#!/usr/bin/env node
/**
 * PLAY harness for Tony Stonks Pro Trader.
 *
 * Screenshots cannot measure flow. This drives the game with a scripted input
 * sequence, samples the player's state from inside the game's own frame loop,
 * and reports the mechanical signatures of flow that a Tony Hawk game lives or
 * dies by — sustained speed, unbroken line duration, dead time, bail rate.
 *
 * It also dumps the level's skateable-feature graph so level design can be
 * analysed as connectivity rather than eyeballed from a screenshot.
 *
 * IMPORTANT: this runs under software WebGL, where a full-quality frame can take
 * seconds. A simulation stepping at 1fps tells you nothing about a game meant to
 * run at 60. --fast (default ON) drops the viewport to 320x180 and disables
 * post-processing so the sim steps fast enough for the telemetry to mean
 * something. Always check `meanFrameMs` in the report before trusting the
 * numbers: above ~120ms the physics is being integrated in lumps and the flow
 * metrics are unreliable.
 *
 * Usage:
 *   node tools/play.mjs --level ch1_office --script "W:0-20" --duration 20
 *   node tools/play.mjs --script "W:0-30,Space:3@tap,L:5-9,Space:12@tap,J:12.2@tap" --json
 *   node tools/play.mjs --features-only          # just dump the level feature graph
 *   node tools/play.mjs --script "W:0-16" --strip 8 --out shots/line   # 8-frame contact strip
 *
 * Script syntax: comma-separated KEY:START-END (hold) or KEY:T@tap (120ms tap).
 *   Keys: W A S D Space Shift J K L Q E Up Down Left Right
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
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

const LEVEL = String(arg('level', 'ch1_office'));
const SCRIPT = String(arg('script', 'W:0-20'));
const DURATION = Number(arg('duration', 0)) || null;
const FAST = !has('quality');
const W = Number(arg('w', FAST ? 320 : 1280));
const H = Number(arg('h', FAST ? 180 : 720));
const STRIP = Number(arg('strip', 0));
const OUT = String(arg('out', 'shots/play'));
const FEATURES_ONLY = has('features-only');
const WANT_JSON = has('json');
const SAVE = arg('save', null);
/** Seed for the in-page PRNG so runs are reproducible. --seed 0 restores real Math.random. */
const SEED = Number(arg('seed', 12345)) === 0 ? null : Number(arg('seed', 12345));
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

const KEYMAP = {
  W: 'KeyW', A: 'KeyA', S: 'KeyS', D: 'KeyD', Space: 'Space',
  Shift: 'ShiftLeft', Ctrl: 'ControlLeft', J: 'KeyJ', K: 'KeyK', L: 'KeyL',
  E: 'KeyE', Q: 'KeyQ', Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight',
};

/** "W:0-20,Space:3@tap" -> [{key,down,up}] in seconds of SIMULATED game time. */
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
  return out.sort((x, y) => x.down - y.down);
}

const freePort = () => new Promise((res) => {
  const s = net.createServer();
  s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); });
});

const waitForServer = async (url, ms = 30000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try { if ((await fetch(url)).ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server never came up at ${url}`);
};

async function main() {
  if (!existsSync(`${ROOT}/dist/index.html`)) {
    console.error('dist/ missing — run `npm run build` first');
    process.exit(2);
  }
  const events = parseScript(SCRIPT);
  const runFor = DURATION || Math.max(8, ...events.map((e) => e.up)) + 2;

  const port = await freePort();
  const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/`;

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--enable-webgl', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'],
  });

  const report = { level: LEVEL, script: SCRIPT, errors: [] };
  let code = 0;

  try {
    await waitForServer(url);
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') report.errors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => report.errors.push(`PAGEERROR: ${String(e).slice(0, 300)}`));

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.game, null, { timeout: 90000 });
    await page.waitForTimeout(400);

    await page.evaluate(async ({ level, fast }) => {
      const g = window.game;
      window.gameState?.setState?.('playing');
      if (level.startsWith('story_')) {
        const m = await import('/src/story/StoryLevels.ts').catch(() => null);
        if (m?.getStoryLevel) g.loadStoryLevel(m.getStoryLevel(level)); else g.loadLevel(level);
      } else g.loadLevel(level);
      g.start(); g.resume?.();
      // Strip the frame cost that software WebGL cannot afford, so the SIM runs
      // at a rate where dt is small enough for the physics to be representative.
      if (fast) {
        g.postFX?.setQuality?.('off');
        g.renderer?.shadowMap && (g.renderer.shadowMap.enabled = false);
      }
      document.getElementById('ui-overlay')?.style.setProperty('visibility', 'hidden');
    }, { level: LEVEL, fast: FAST });

    await page.waitForTimeout(1000);

    // ---- level feature graph -------------------------------------------------
    report.features = await page.evaluate(() => {
      const g = window.game;
      const rails = (g.grindSystem?.rails || []).map((r) => ({
        id: r.id,
        start: [+r.start.x.toFixed(2), +r.start.y.toFixed(2), +r.start.z.toFixed(2)],
        end: [+r.end.x.toFixed(2), +r.end.y.toFixed(2), +r.end.z.toFixed(2)],
        length: +(r.length ?? 0).toFixed(2),
        height: +(r.height ?? 0).toFixed(2),
      }));
      const ramps = [];
      g.scene?.traverse?.((o) => {
        const t = o.userData?.objectType || o.userData?.type;
        if (t && /ramp|quarter|kicker|ledge|rail|halfpipe|funbox|spine/i.test(String(t))) {
          const p = o.getWorldPosition(new window.THREE_V3());
          ramps.push({ type: String(t), pos: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)] });
        }
      });
      const spawn = g.chair?.position ? [+g.chair.position.x.toFixed(2), +g.chair.position.y.toFixed(2), +g.chair.position.z.toFixed(2)] : null;
      return { rails, ramps, spawn, railCount: rails.length };
    }).catch((e) => ({ error: String(e).slice(0, 200) }));

    if (FEATURES_ONLY) {
      console.log(JSON.stringify({ features: report.features }, null, 2));
      await browser.close(); server.kill('SIGKILL'); process.exit(0);
    }

    // ---- drive the SIMULATION directly, decoupled from rendering -------------
    //
    // The game runs a fixed timestep (1/60) behind a MAX_FRAME_SKIP of 5. Under
    // software WebGL a rendered frame costs ~750ms, so the accumulator can only
    // ever retire 5 steps per frame — the simulation advances ~83ms per 750ms of
    // wall clock, roughly 9x slower than real time, and the accumulator grows
    // without bound. Sampling against wall clock in that regime measures the
    // harness, not the game.
    //
    // So we stop rendering and step the simulation ourselves. fixedUpdate() IS
    // the game: physics, input, tricks, scoring, goals and police all live inside
    // it. Calling it in a tight loop gives exact, deterministic 60Hz simulated
    // time at thousands of steps per second, and makes the run reproducible
    // rather than dependent on how loaded the machine was.
    const stripPlan = [];
    if (STRIP > 0) for (let i = 0; i < STRIP; i++) stripPlan.push((runFor / STRIP) * i);

    await page.evaluate(({ events, runFor, keymap, stripPlan, seed }) => {
      const g = window.game;
      const DT = 1 / 60;

      // Determinism. Stepping fixedUpdate at a fixed 1/60 makes the INTEGRATION exact, but the
      // simulation still reads Math.random in ~130 places — and the ones that matter are in
      // BalanceSystem, whose random walk decides whether a grind or manual bails. That is the
      // direct cause of longestComboSeconds swinging between 18.45 and 25.25 on byte-identical
      // code, which makes the metric useless for telling a real improvement from noise.
      // Seeding makes a run reproducible; --seed 0 opts out and restores stochastic behaviour.
      if (seed !== null) {
        let a = (seed >>> 0) || 0x9e3779b9;
        Math.random = () => {           // mulberry32
          a = (a + 0x6d2b79f5) >>> 0;
          let t = a;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }
      window.__tel = { t: 0, samples: [], stripAt: [], done: false };
      const tel = window.__tel;

      // Stop the rAF loop from also stepping the sim — we own the clock now.
      g.isRunning = false;

      const fire = (type, code) => window.dispatchEvent(
        new KeyboardEvent(type, { code, key: code, bubbles: true }));

      const held = new Set();
      const pending = [...stripPlan];
      let steps = 0;

      const sample = () => {
        const s = g.playerState || {};
        let vel = { x: 0, y: 0, z: 0 };
        try { vel = g.physics.getVelocity(g.chairBody); } catch {}
        let combo = null;
        try { combo = g.score?.state || null; } catch {}
        tel.samples.push({
          t: +tel.t.toFixed(3),
          x: +(g.chair?.position?.x ?? 0).toFixed(2),
          y: +(g.chair?.position?.y ?? 0).toFixed(2),
          z: +(g.chair?.position?.z ?? 0).toFixed(2),
          spd: +Math.hypot(vel.x, vel.z).toFixed(2),
          gnd: !!s.isGrounded, air: !!s.isAirborne,
          grind: !!s.isGrinding, man: !!s.isManualing,
          comboOpen: !!combo?.open, comboTricks: combo?.tricks?.length ?? 0,
          unrealised: Math.round(combo?.unrealised ?? 0),
          mult: +(combo?.multiplier ?? 1).toFixed(2),
          bal: (() => { try { return +(g.balance?.state?.value ?? 0).toFixed(3); } catch { return 0; } })(),
          bmode: (() => { try { return g.balance?.state?.mode ?? 'none'; } catch { return 'none'; } })(),
          bails: (() => { try { return g.score?.getRunSummary?.().bails ?? 0; } catch { return 0; } })(),
          landed: (() => { try { return g.score?.getRunSummary?.().landedCombos ?? 0; } catch { return 0; } })(),
          stonks: (() => { try { return Math.round(g.score?.balance ?? 0); } catch { return 0; } })(),
        });
      };

      // Chunked so the page stays responsive and a hang cannot wedge the browser.
      const CHUNK = 240; // 4 simulated seconds per turn of the event loop
      const runChunk = () => {
        let n = 0;
        while (tel.t < runFor && n < CHUNK) {
          for (const e of events) {
            const code = keymap[e.key] || e.key;
            if (tel.t >= e.down && tel.t < e.up && !held.has(code)) { fire('keydown', code); held.add(code); }
            if (tel.t >= e.up && held.has(code)) { fire('keyup', code); held.delete(code); }
          }
          try { g.fixedUpdate(DT); } catch (err) {
            tel.error = String(err).slice(0, 300); tel.done = true; return;
          }
          tel.t += DT; steps++; n++;
          if (steps % 3 === 0) sample();               // ~20Hz series
          if (pending.length && tel.t >= pending[0]) { tel.stripAt.push(+tel.t.toFixed(2)); pending.shift(); }
        }
        if (tel.t >= runFor) {
          for (const c of held) fire('keyup', c);
          tel.done = true;
          g.isRunning = true;                           // hand rendering back
        } else setTimeout(runChunk, 0);
      };
      runChunk();
    }, { events, runFor, keymap: KEYMAP, stripPlan, seed: SEED });

    await page.waitForFunction(() => window.__tel?.done === true, null, { timeout: 600000 });
    const tel = await page.evaluate(() => window.__tel);
    if (tel.error) report.errors.push(`SIM: ${tel.error}`);

    // The contact strip is captured after the fact — the sim is deterministic, so
    // rendering during it would only have cost time without changing the result.
    const strips = [];
    if (STRIP > 0) {
      await page.evaluate(() => { window.game.isRunning = true; window.game.start?.(); });
      const p = resolve(`${OUT}-final.png`);
      mkdirSync(dirname(p), { recursive: true });
      await page.screenshot({ path: p, timeout: 240000 }).catch(() => {});
      strips.push(p);
    }
    report.stripFrames = strips;

    // ---- flow metrics --------------------------------------------------------
    const S = tel.samples;
    if (!S.length) throw new Error('no telemetry samples captured');
    const dur = S[S.length - 1].t;
    const spds = S.map((s) => s.spd);
    const sorted = [...spds].sort((a, b) => a - b);

    const DEAD = 3.0;      // below this you are not skating, you are shuffling
    const CRUISE = 8.0;    // THPS-ish "carrying speed"
    const frac = (pred) => S.filter(pred).length / S.length;

    // longest run of consecutive samples satisfying pred, in seconds
    const longestRun = (pred) => {
      let best = 0, runStart = null;
      for (const s of S) {
        if (pred(s)) { if (runStart === null) runStart = s.t; best = Math.max(best, s.t - runStart); }
        else runStart = null;
      }
      return +best.toFixed(2);
    };
    // count of distinct episodes satisfying pred
    const episodes = (pred) => {
      let n = 0, inRun = false;
      for (const s of S) { if (pred(s)) { if (!inRun) { n++; inRun = true; } } else inRun = false; }
      return n;
    };

    const distance = S.reduce((acc, s, i) => i ? acc + Math.hypot(s.x - S[i - 1].x, s.z - S[i - 1].z) : 0, 0);
    const comboEpisodes = episodes((s) => s.comboOpen);
    const maxTricksInCombo = Math.max(0, ...S.map((s) => s.comboTricks));

    report.telemetry = {
      simSeconds: +dur.toFixed(2), samples: S.length,
      // Simulation is stepped directly at a fixed 1/60, decoupled from rendering,
      // so these numbers are exact simulated time and reproducible run to run.
      fixedStepHz: 60, decoupledFromRender: true,
    };
    report.flow = {
      meanSpeed: +(spds.reduce((a, b) => a + b, 0) / spds.length).toFixed(2),
      medianSpeed: +sorted[Math.floor(sorted.length / 2)].toFixed(2),
      maxSpeed: +Math.max(...spds).toFixed(2),
      pctTimeDead: +(frac((s) => s.spd < DEAD) * 100).toFixed(1),
      pctTimeCruising: +(frac((s) => s.spd >= CRUISE) * 100).toFixed(1),
      pctTimeGrounded: +(frac((s) => s.gnd && !s.grind) * 100).toFixed(1),
      pctTimeAirborne: +(frac((s) => s.air) * 100).toFixed(1),
      pctTimeGrinding: +(frac((s) => s.grind) * 100).toFixed(1),
      pctTimeManualing: +(frac((s) => s.man) * 100).toFixed(1),
      pctTimeInCombo: +(frac((s) => s.comboOpen) * 100).toFixed(1),
      longestComboSeconds: longestRun((s) => s.comboOpen),
      longestCruiseSeconds: longestRun((s) => s.spd >= CRUISE),
      longestDeadSeconds: longestRun((s) => s.spd < DEAD),
      deadEpisodes: episodes((s) => s.spd < DEAD),
      comboEpisodes,
      maxTricksInOneCombo: maxTricksInCombo,
      grindEpisodes: episodes((s) => s.grind),
      airEpisodes: episodes((s) => s.air),
      distanceTravelled: +distance.toFixed(1),
      finalStonks: S[S.length - 1].stonks,
      peakUnrealised: Math.max(...S.map((s) => s.unrealised)),
      peakMultiplier: Math.max(...S.map((s) => s.mult ?? 1)),
      bails: S[S.length - 1].bails ?? 0,
      landedCombos: S[S.length - 1].landed ?? 0,
      bailsPerMinute: +(((S[S.length - 1].bails ?? 0) / Math.max(0.001, dur)) * 60).toFixed(2),
      maxAbsBalance: +Math.max(...S.map((s) => Math.abs(s.bal ?? 0))).toFixed(3),
      pctTimeBalancing: +(frac((s) => (s.bmode ?? 'none') !== 'none') * 100).toFixed(1),
    };
    // Coarse verdicts against THPS-ish expectations. Deliberately blunt.
    const f = report.flow;
    report.verdicts = [
      f.pctTimeDead > 25 ? `FLOW BREAK: ${f.pctTimeDead}% of the session below walking pace — a THPS run almost never stalls` : null,
      f.longestDeadSeconds > 3 ? `FLOW BREAK: stalled for ${f.longestDeadSeconds}s in one go` : null,
      f.longestComboSeconds < 5 ? `NO LINES: longest combo only ${f.longestComboSeconds}s — THPS lines run 15-60s` : null,
      f.pctTimeGrinding < 5 ? `RAILS UNUSED: only ${f.pctTimeGrinding}% of the session grinding` : null,
      f.grindEpisodes === 0 ? 'RAILS UNREACHABLE: never grinded once during the run' : null,
      f.maxTricksInOneCombo < 3 ? `SHALLOW COMBOS: best combo was ${f.maxTricksInOneCombo} tricks` : null,
      f.medianSpeed < CRUISE ? `SLOW: median speed ${f.medianSpeed} — the player is not carrying speed` : null,
    ].filter(Boolean);

    if (SAVE) {
      const p = resolve(String(SAVE));
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, JSON.stringify({ ...report, series: S }, null, 2));
      report.seriesSavedTo = p;
    }
  } catch (e) {
    report.errors.push(`HARNESS: ${String(e).slice(0, 400)}`);
    code = 1;
  } finally {
    await browser.close().catch(() => {});
    server.kill('SIGKILL');
  }

  if (WANT_JSON) console.log(JSON.stringify(report, null, 2));
  else {
    console.log('flow:', JSON.stringify(report.flow, null, 2));
    console.log('features:', report.features?.railCount, 'rails');
    if (report.verdicts?.length) console.log('VERDICTS:\n  ' + report.verdicts.join('\n  '));
    if (report.errors.length) console.log('errors:', report.errors.slice(0, 5).join(' | '));
  }
  process.exit(code);
}

main();
