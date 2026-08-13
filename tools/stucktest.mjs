#!/usr/bin/env node
/**
 * STUCK TEST — can the player get trapped anywhere in the level?
 *
 * A pocket of geometry you can enter and not escape ends the run, which is the
 * worst class of level bug. This teleports the chair to a dense grid across the
 * whole floorplate, gives it a few seconds of forward input at several headings,
 * and reports every position that never reaches usable speed.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
const ROOT = '/home/claude/work/game';
const LEVEL = process.argv.includes('--level') ? process.argv[process.argv.indexOf('--level')+1] : 'ch1_office';
const port = await new Promise(r=>{const s=net.createServer();s.listen(0,()=>{const p=s.address().port;s.close(()=>r(p))})});
const server = spawn('npx',['vite','preview','--port',String(port),'--strictPort','--host','127.0.0.1'],{cwd:ROOT,stdio:'ignore'});
const url = `http://127.0.0.1:${port}/`;
for(let i=0;i<80;i++){try{if((await fetch(url)).ok)break}catch{};await new Promise(r=>setTimeout(r,200));}
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const pg = await (await b.newContext({viewport:{width:320,height:180}})).newPage();
await pg.goto(url,{waitUntil:'domcontentloaded'});
await pg.waitForFunction(()=>!!window.game,null,{timeout:90000});
await pg.waitForTimeout(400);
const out = await pg.evaluate(async ({level}) => {
  const g = window.game; const DT = 1/60;
  window.gameState?.setState?.('playing'); g.loadLevel(level); g.start(); g.resume?.();
  await new Promise(r=>setTimeout(r,900));
  g.isRunning = false;
  const V = Object.getPrototypeOf(g.chair.position).constructor;
  const fire=(t,c)=>window.dispatchEvent(new KeyboardEvent(t,{code:c,key:c,bubbles:true}));
  const step=n=>{for(let i=0;i<n;i++) g.fixedUpdate(DT);};
  const spd=()=>{const v=g.physics.getVelocity(g.chairBody);return Math.hypot(v.x,v.z);};
  const bounds = 24; const STEPGRID = 3;
  const trapped = []; let tested = 0, escaped = 0;
  for (let x=-bounds; x<=bounds; x+=STEPGRID) {
    for (let z=-bounds; z<=bounds; z+=STEPGRID) {
      let best = 0;
      for (const yawDeg of [0,90,180,270]) {
        g.physics.setPosition(g.chairBody, new V(x, 1.2, z));
        g.physics.setVelocity(g.chairBody, new V(0,0,0));
        g.physics.setAngularVelocity(g.chairBody, new V(0,0,0));
        g.physics.setRotationY(g.chairBody, yawDeg*Math.PI/180);
        step(20);
        fire('keydown','KeyW'); step(150); fire('keyup','KeyW');
        best = Math.max(best, spd());
        if (best >= 4) break;
      }
      tested++;
      if (best >= 4) escaped++; else trapped.push({x, z, best:+best.toFixed(2)});
    }
  }
  g.isRunning = true;
  return { tested, escaped, trappedCount: trapped.length,
           pctTrapped: +(100*trapped.length/tested).toFixed(1),
           worst: trapped.slice(0,20) };
}, {level: LEVEL});
console.log(JSON.stringify(out,null,1));
await b.close(); server.kill('SIGKILL');
