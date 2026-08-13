#!/usr/bin/env node
/**
 * TEMPORARY AUDIT harness — per-frame steering diagnostic at a range of speeds.
 * node tools/attn-steer.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import net from 'node:net';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const waitForServer = async (url) => { for (let i = 0; i < 160; i++) { try { const r = await fetch(url); if (r.ok) return; } catch {} await new Promise((r) => setTimeout(r, 250)); } throw new Error('no server'); };

async function main() {
  if (!existsSync(`${ROOT}/dist/index.html`)) { console.error('build first'); process.exit(2); }
  const port = await freePort();
  const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'],
  });
  try {
    await waitForServer(url);
    const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.game, null, { timeout: 120000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => { const g = window.game; window.gameState?.setState?.('playing'); g.loadLevel('ch1_office'); g.start(); g.resume?.(); });
    await page.waitForTimeout(1200);

    const out = await page.evaluate(() => {
      const g = window.game;
      const DT = 1 / 60;
      g.isRunning = false;
      const fire = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c, bubbles: true }));
      const held = new Set();
      const setKeys = (codes) => {
        for (const c of Array.from(held)) if (!codes.includes(c)) { fire('keyup', c); held.delete(c); }
        for (const c of codes) if (!held.has(c)) { fire('keydown', c); held.add(c); }
      };
      const V3 = g.chair.position.constructor;
      const yawOf = () => { const q = g.physics.getRotation(g.chairBody); return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x)); };
      const wrap = (d) => { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

      // instrument resolveObstacles
      const inst = { blocked: 0, calls: 0, escYaw: 0, lastBlocked: false };
      const proto = Object.getPrototypeOf(g);
      const orig = proto.resolveObstacles;
      proto.resolveObstacles = function (dt, dir, speed, pushing) {
        const y0 = yawOf(); inst.calls++;
        const r = orig.call(this, dt, dir, speed, pushing);
        inst.lastBlocked = !!r;
        if (r) { inst.blocked++; inst.escYaw += Math.abs(wrap(yawOf() - y0)); }
        return r;
      };

      // spawn point of the level
      const home = { x: g.chair.position.x, y: g.chair.position.y, z: g.chair.position.z };

      const runAt = (v, yaw, keys) => {
        setKeys([]);
        g.physics.setPosition(g.chairBody, new V3(home.x, home.y + 0.2, home.z));
        g.physics.setRotationY(g.chairBody, yaw);
        g.physics.setVelocity(g.chairBody, new V3(Math.sin(yaw) * v, 0, Math.cos(yaw) * v));
        g.physics.setAngularVelocity(g.chairBody, new V3(0, 0, 0));
        g.carriedSpeed = v; g.turnRate = 0; g.turnCommand = 0; g.pinnedFor = 0; g.failedKicks = 0;
        for (let i = 0; i < 6; i++) g.fixedUpdate(DT);
        setKeys(keys);
        const rows = [];
        let last = yawOf();
        for (let i = 0; i < 75; i++) {
          const bBefore = inst.blocked;
          g.fixedUpdate(DT);
          const y = yawOf();
          const vel = g.physics.getVelocity(g.chairBody);
          const sp = Math.hypot(vel.x, vel.z);
          const travel = Math.atan2(vel.x, vel.z);
          rows.push({
            f: i,
            rate: +(wrap(y - last) / DT).toFixed(3),
            cmd: +(g.turnCommand ?? 0).toFixed(3),
            intent: +(g.intent?.turn ?? 0).toFixed(3),
            sp: +sp.toFixed(2),
            gnd: g.playerState.isGrounded ? 1 : 0,
            air: g.playerState.isAirborne ? 1 : 0,
            surf: +(g.surfaceAngle ?? 0).toFixed(1),
            mis: +(wrap(travel - y) * 180 / Math.PI).toFixed(1),
            esc: inst.blocked - bBefore,
          });
          last = y;
        }
        setKeys([]);
        return rows;
      };

      const summary = [];
      const raw = {};
      for (const v of [8, 11.8, 13.5, 15, 18]) {
        const rows = runAt(v, 0, ['KeyA']);
        raw[v] = rows;
        const steady = rows.slice(20, 70);
        const meanRate = steady.reduce((a, r) => a + Math.abs(r.rate), 0) / steady.length;
        const meanCmd = steady.reduce((a, r) => a + Math.abs(r.cmd), 0) / steady.length;
        const meanSp = steady.reduce((a, r) => a + r.sp, 0) / steady.length;
        summary.push({
          v,
          meanAbsYawRate: +meanRate.toFixed(3),
          meanAbsTurnCommand: +meanCmd.toFixed(3),
          meanSpeed: +meanSp.toFixed(2),
          radius: +(meanSp / Math.max(1e-3, meanRate)).toFixed(2),
          groundedFrames: steady.filter((r) => r.gnd).length,
          airFrames: steady.filter((r) => r.air).length,
          escapeFrames: steady.reduce((a, r) => a + r.esc, 0),
          meanMisalignDeg: +(steady.reduce((a, r) => a + Math.abs(r.mis), 0) / steady.length).toFixed(1),
        });
      }
      return { summary, sample15: raw[15].slice(0, 40), sample11: raw[11.8].slice(0, 25), home };
    });
    console.log(JSON.stringify({ out, errors }, null, 2));
  } catch (e) { console.error(String(e)); process.exitCode = 1; }
  finally { await browser.close().catch(() => {}); server.kill('SIGKILL'); }
}
main();
