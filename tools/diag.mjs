#!/usr/bin/env node
/**
 * Throwaway diagnostic: load a level and dump physics-world facts that the play
 * harness cannot see — collider extents, what is under the spawn point, and the
 * grind rails' actual world heights.
 *
 *   node tools/diag.mjs --level story_1_office
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import net from 'node:net';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const LEVEL = String(arg('level', 'story_1_office'));
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

const freePort = () => new Promise((res) => {
  const s = net.createServer();
  s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); });
});
const waitForServer = async (url, ms = 30000) => {
  const start = Date.now();
  while (Date.now() - start < ms) { try { if ((await fetch(url)).ok) return true; } catch {} await new Promise(r => setTimeout(r, 200)); }
  throw new Error('no server');
};

const port = await freePort();
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
const url = `http://127.0.0.1:${port}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'],
});
try {
  await waitForServer(url);
  const ctx = await browser.newContext({ viewport: { width: 320, height: 180 } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
  page.on('pageerror', (e) => logs.push(`PAGEERROR ${String(e).slice(0, 300)}`));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.game, null, { timeout: 90000 });
  await page.waitForTimeout(400);
  const out = await page.evaluate((level) => {
    const g = window.game;
    window.gameState?.setState?.('playing');
    g.loadLevel(level);
    g.start(); g.resume?.();
    const w = g.physics.world;
    const cols = [];
    w.forEachCollider((c) => {
      const t = c.translation();
      let shape = c.shapeType?.() ?? '?';
      let half = null;
      try { half = c.halfExtents ? c.halfExtents() : null; } catch {}
      cols.push({ shape: String(shape), t: [+t.x.toFixed(1), +t.y.toFixed(1), +t.z.toFixed(1)], half: half ? [+half.x.toFixed(1), +half.y.toFixed(1), +half.z.toFixed(1)] : null });
    });
    g.renderer?.render?.(g.scene, g.camera);
    const info = g.renderer?.info?.render ? { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles } : null;
    let meshes = 0; g.scene?.traverse?.(() => meshes++);
    const chair = g.chair?.position;
    const rails = (g.grindSystem?.rails || []).map(r => ({ id: r.id, s: [+r.start.x.toFixed(1), +r.start.y.toFixed(1), +r.start.z.toFixed(1)], e: [+r.end.x.toFixed(1), +r.end.y.toFixed(1), +r.end.z.toFixed(1)] }));
    return { info, meshes, chair: chair ? [chair.x, chair.y, chair.z] : null, colliderCount: cols.length, cols: cols.slice(0, 40), rails };
  }, LEVEL);
  console.log(JSON.stringify(out, null, 2));
  console.log('LOGS:', logs.slice(-20).join('\n'));
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGKILL');
}
process.exit(0);
