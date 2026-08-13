#!/usr/bin/env node
/**
 * SPACE harness — how much ROOM does this level actually give the player?
 *
 * play.mjs measures flow and feel.mjs measures control. Neither can see the thing
 * the owner complained about: "the office space level is too crowded and not a lot
 * of place to skate around." Both were green on the build he was playing, because
 * a narrow corridor lined wall to wall with grindable furniture maximises
 * features-touched-per-second — which is what those harnesses count.
 *
 * This one counts SPACE instead. It loads a level, reads every static collider
 * straight out of Rapier, and reports:
 *
 *   occupancy   how much of the plate stands proud of Game.STEP_HEIGHT (0.42 m).
 *               Anything at or under that is rolled over, not hit, so ledges and
 *               kerbs are correctly counted as floor.
 *   reachable   flood fill from the spawn: the floor the player can actually get
 *               onto. Cubicles behind a 1.32 m wall are scenery, not level.
 *   runs        for every open square metre, the longest straight line through it
 *               in any of 24 directions, swept with the chair's 0.45 m radius, so
 *               a gap narrower than the chair is not counted as a lane. THE
 *               HEADLINE NUMBER IS `pctPointsWith25m`: a Tony Hawk park should let
 *               you build speed for 25-30 m from most places you can stand.
 *   recovery    how often Game.resolveObstacles() — the anti-stall that shoves the
 *               player off geometry and swings the heading to escape — fires on
 *               plain cruise scripts, and where. If it is firing on more than a
 *               few percent of frames, or firing anywhere except the perimeter
 *               chamfers, the level is too tight and the player will feel the
 *               chair steering itself.
 *
 * It also prints an ASCII floor plan (0.5 m cells, +Z up, +X right), which is the
 * fastest way to see what shape the level actually is.
 *
 *   node tools/space.mjs --level ch1_office
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
const LEVEL = String(arg('level', 'ch1_office'));
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const waitForServer = async (url, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if ((await fetch(url)).ok) return true; } catch {} await new Promise((r) => setTimeout(r, 200)); } throw new Error('no server'); };

const KEYMAP = { W: 'KeyW', A: 'KeyA', S: 'KeyS', D: 'KeyD', Space: 'Space', L: 'KeyL' };

async function main() {
  if (!existsSync(`${ROOT}/dist/index.html`)) { console.error('dist/ missing'); process.exit(2); }
  const port = await freePort();
  const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'],
  });
  const out = { level: LEVEL };
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

    // ---- static geometry census + occupancy ---------------------------------
    out.geometry = await page.evaluate(() => {
      const g = window.game;
      const world = g.physics.world;
      const chairCol = new Set();
      // ignore the player's own body
      const boxes = [];
      world.forEachCollider((c) => {
        const parent = c.parent();
        if (parent && !parent.isFixed()) return;           // dynamic (the chair)
        const t = c.translation();
        const q = c.rotation();
        let hx = 0, hy = 0, hz = 0, kind = 'other';
        try {
          const h = c.halfExtents?.();
          if (h) { hx = h.x; hy = h.y; hz = h.z; kind = 'cuboid'; }
        } catch {}
        if (kind !== 'cuboid') {
          try { const r = c.radius?.(); const hh = c.halfHeight?.(); if (r != null) { hx = hz = r; hy = hh != null ? hh : r; kind = 'round'; } } catch {}
        }
        // yaw from quaternion
        const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
        boxes.push({ x: t.x, y: t.y, z: t.z, hx, hy, hz, yaw, kind });
      });
      const sp = g.chair.position;
      return { boxes, count: boxes.length, spawn: [+sp.x.toFixed(2), +sp.y.toFixed(2), +sp.z.toFixed(2)] };
    });
    out.spawn = out.geometry.spawn;

    const B = out.geometry.boxes;
    // Play area: the interior floorplate. Derive from the boxes that sit low.
    const HALF = 23;                     // building shell inner face
    const CELL = 0.5;
    // Game.STEP_HEIGHT is 0.42: anything whose TOP is at or under that is rolled
    // over, not hit. Only geometry standing proud of it can stop the player.
    const BAND_LO = 0.47, BAND_HI = 1.15;   // what a seated rider's capsule sweeps
    const N = Math.floor((HALF * 2) / CELL);
    const grid = new Uint8Array(N * N);
    let blockedCells = 0;
    for (const b of B) {
      if (b.y + b.hy < BAND_LO || b.y - b.hy > BAND_HI) continue;   // floor slab / ceiling
      if (b.hx > 20 && b.hz > 20) continue;                          // ground plane
      const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
      // conservative AABB of the rotated box
      const ex = Math.abs(b.hx * c) + Math.abs(b.hz * s);
      const ez = Math.abs(b.hx * s) + Math.abs(b.hz * c);
      const x0 = b.x - ex, x1 = b.x + ex, z0 = b.z - ez, z1 = b.z + ez;
      for (let ix = Math.max(0, Math.floor((x0 + HALF) / CELL)); ix <= Math.min(N - 1, Math.floor((x1 + HALF) / CELL)); ix++) {
        for (let iz = Math.max(0, Math.floor((z0 + HALF) / CELL)); iz <= Math.min(N - 1, Math.floor((z1 + HALF) / CELL)); iz++) {
          const k = iz * N + ix;
          if (!grid[k]) { grid[k] = 1; blockedCells++; }
        }
      }
    }
    const total = N * N;
    out.occupancy = {
      cellSize: CELL, areaM2: +(total * CELL * CELL).toFixed(0),
      blockedM2: +(blockedCells * CELL * CELL).toFixed(0),
      openPct: +((1 - blockedCells / total) * 100).toFixed(1),
      colliders: B.length,
    };

    // ---- straight-line runs, ray-marched in Node against the collider set ----
    // A CHAIR_HALF-radius cylinder is swept along the ray: a gap narrower than the
    // chair is not a lane the player can take.
    const CHAIR_HALF = 0.45;
    const blocks = B.filter((b) => !(b.y + b.hy < BAND_LO || b.y - b.hy > BAND_HI) && !(b.hx > 20 && b.hz > 20));
    const hitAt = (x, z) => {
      if (Math.abs(x) > HALF || Math.abs(z) > HALF) return true;
      for (const b of blocks) {
        const c = Math.cos(-b.yaw), s = Math.sin(-b.yaw);
        const dx = x - b.x, dz = z - b.z;
        const lx = dx * c + dz * s, lz = -dx * s + dz * c;
        if (Math.abs(lx) <= b.hx + CHAIR_HALF && Math.abs(lz) <= b.hz + CHAIR_HALF) return true;
      }
      return false;
    };
    const MAX = 60, STEP = 0.25;
    const cast = (x, z, dx, dz) => {
      for (let d = STEP; d <= MAX; d += STEP) if (hitAt(x + dx * d, z + dz * d)) return d - STEP;
      return MAX;
    };
    const spawn = out.spawn;
    const fromSpawn = [];
    for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2; fromSpawn.push(+cast(spawn[0], spawn[2], Math.sin(a), Math.cos(a)).toFixed(1)); }
    const best = [];
    let openPts = 0;
    for (let x = -22; x <= 22; x += 1.0) {
      for (let z = -22; z <= 22; z += 1.0) {
        if (hitAt(x, z)) continue;
        openPts++;
        let b = 0;
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI;   // half turn: fwd+back covers the rest
          const f = cast(x, z, Math.sin(a), Math.cos(a));
          const r = cast(x, z, -Math.sin(a), -Math.cos(a));
          if (f + r > b) b = f + r;
        }
        best.push(+b.toFixed(1));
      }
    }
    best.sort((a, b2) => a - b2);
    const pct = (p) => best[Math.floor(best.length * p)] ?? 0;
    out.runs = {
      spawnBestDir: Math.max(...fromSpawn), spawnMedianDir: [...fromSpawn].sort((a, b2) => a - b2)[36],
      openSamplePoints: openPts,
      runP10: pct(0.10), runMedian: pct(0.5), runP90: pct(0.9), runMax: best[best.length - 1],
      pctPointsWith25m: +(best.filter((v) => v >= 25).length / best.length * 100).toFixed(1),
      pctPointsWith30m: +(best.filter((v) => v >= 30).length / best.length * 100).toFixed(1),
    };

    // ---- reachable floor: flood fill from spawn at 0.5 m, chair-clearance aware ----
    // The only floor that counts is the floor the player can actually get onto. A cubicle
    // bay behind a 1.32 m wall is scenery, however open it looks on a plan.
    {
      const FC = 0.5;
      const M = Math.round((HALF * 2) / FC);
      const idx = (ix, iz) => iz * M + ix;
      const free = new Uint8Array(M * M);
      for (let ix = 0; ix < M; ix++) {
        for (let iz = 0; iz < M; iz++) {
          const x = -HALF + (ix + 0.5) * FC, z = -HALF + (iz + 0.5) * FC;
          free[idx(ix, iz)] = hitAt(x, z) ? 0 : 1;
        }
      }
      const seen = new Uint8Array(M * M);
      const sx0 = Math.floor((spawn[0] + HALF) / FC), sz0 = Math.floor((spawn[2] + HALF) / FC);
      const q = [[sx0, sz0]];
      seen[idx(sx0, sz0)] = 1;
      let n = 0;
      while (q.length) {
        const [cx, cz] = q.pop(); n++;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= M || nz >= M) continue;
          if (seen[idx(nx, nz)] || !free[idx(nx, nz)]) continue;
          seen[idx(nx, nz)] = 1; q.push([nx, nz]);
        }
      }
      out.reachable = {
        m2: +(n * FC * FC).toFixed(0),
        pctOfPlate: +(n * FC * FC / (HALF * 2 * HALF * 2) * 100).toFixed(1),
      };
    }

    // ---- ASCII floor plan ----------------------------------------------------
    // '#' blocks the chair, '.' is rollable/clear, 'S' spawn. North (+Z) at top.
    {
      const rows = [];
      for (let iz = N - 1; iz >= 0; iz--) {
        let line = '';
        for (let ix = 0; ix < N; ix++) line += grid[iz * N + ix] ? '#' : '.';
        rows.push(line);
      }
      const sx = Math.floor((spawn[0] + HALF) / CELL), sz = Math.floor((spawn[2] + HALF) / CELL);
      const ri = N - 1 - sz;
      rows[ri] = rows[ri].slice(0, sx) + 'S' + rows[ri].slice(sx + 1);
      out.planAscii = rows;
    }

    // ---- obstacle recovery firings across scripted cruise runs ---------------
    const SCRIPTS = [
      { name: 'north', script: 'W:0-18' },
      { name: 'south', script: 'S:0-0.6,A:0-1.55,W:0.6-18' },
      { name: 'east-carve', script: 'A:0-0.75,W:0-18' },
      { name: 'west-carve', script: 'D:0-0.75,W:0-18' },
      { name: 'wander', script: 'W:0-24,A:3-4,D:8-9,A:14-15,D:19-20' },
    ];
    out.recovery = [];
    for (const s of SCRIPTS) {
      const r = await page.evaluate(async ({ level, script, keymap }) => {
        const g = window.game;
        g.loadLevel(level); g.start(); g.resume?.(); g.isRunning = false;
        let a = 12345 >>> 0;
        Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        const proto = Object.getPrototypeOf(g);
        if (!proto.__origResolve) proto.__origResolve = proto.resolveObstacles;
        let hits = 0, frames = 0, pins = 0; const hitAtXZ = [];
        proto.resolveObstacles = function (...args) {
          const before = this.pinnedFor;
          const v = proto.__origResolve.apply(this, args);
          if (v) { hits++; const pp = g.chair.position; hitAtXZ.push([Math.round(pp.x), Math.round(pp.z)]); }
          if (before >= this.PIN_SECONDS) pins++;
          return v;
        };
        const events = [];
        for (const partRaw of script.split(',')) {
          const [key, spec] = partRaw.trim().split(':');
          if (!spec) continue;
          if (spec.endsWith('@tap')) { const t = Number(spec.slice(0, -4)); events.push({ key, down: t, up: t + 0.12 }); }
          else { const [x, y] = spec.split('-').map(Number); events.push({ key, down: x, up: y }); }
        }
        const fire = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
        const held = new Set();
        const DT = 1 / 60; let t = 0; const runFor = 20;
        const slow = []; let dist = 0; let prev = null; const speeds = [];
        while (t < runFor) {
          for (const e of events) {
            const code = keymap[e.key] || e.key;
            if (t >= e.down && t < e.up && !held.has(code)) { fire('keydown', code); held.add(code); }
            if (t >= e.up && held.has(code)) { fire('keyup', code); held.delete(code); }
          }
          g.fixedUpdate(DT); frames++; t += DT;
          const p = g.chair.position;
          if (prev) dist += Math.hypot(p.x - prev.x, p.z - prev.z);
          prev = { x: p.x, z: p.z };
          const v = g.physics.getVelocity(g.chairBody);
          const sp2 = Math.hypot(v.x, v.z);
          speeds.push(sp2);
          if (sp2 < 6 && frames % 6 === 0) slow.push([+p.x.toFixed(1), +p.z.toFixed(1), +sp2.toFixed(1), +t.toFixed(1)]);
        }
        for (const c of held) fire('keyup', c);
        proto.resolveObstacles = proto.__origResolve;
        const sorted2 = [...speeds].sort((x, y) => x - y);
        return { hits, frames, pins, hitPct: +(hits / frames * 100).toFixed(1), distance: +dist.toFixed(0),
          medSpeed: +sorted2[Math.floor(sorted2.length / 2)].toFixed(1), slow,
          hitZones: Object.entries(hitAtXZ.reduce((m, [a, b]) => { const k = a + ',' + b; m[k] = (m[k] || 0) + 1; return m; }, {}))
            .sort((a, b) => b[1] - a[1]).slice(0, 8) };
      }, { level: LEVEL, script: s.script, keymap: KEYMAP });
      out.recovery.push({ name: s.name, ...r });
    }
    out.errors = errs;
  } catch (e) {
    out.error = String(e).slice(0, 400);
  } finally {
    await browser.close(); server.kill('SIGKILL');
  }
  if (out.geometry) delete out.geometry.boxes;
  const plan = out.planAscii; delete out.planAscii;
  console.log(JSON.stringify(out, null, 2));
  if (plan) { console.log('\nPLAN (0.5 m cells, +Z up, +X right):'); for (const r of plan) console.log(r); }
  process.exit(0);
}
main();
