// usage: node tools/levelsim/eval.mjs layout.json [--trace out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { evaluate, prepare, runAgent } from './sim.mjs';
const L = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const t0 = Date.now();
const m = evaluate(L, { agents: 48, seconds: 60, seed: 3 });
console.log(JSON.stringify(m, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v, 1), `\n${Date.now() - t0} ms`);
const ti = process.argv.indexOf('--trace');
if (ti > 0) {
  const W = prepare(L); const paths = [];
  for (let a = 0; a < 6; a++) paths.push(runAgent(W, 11 + a * 31, 30, a % 2 ? 0.6 : 0, true).path);
  writeFileSync(process.argv[ti + 1], JSON.stringify({ layout: L, paths }));
}
