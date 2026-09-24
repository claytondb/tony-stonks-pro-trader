/**
 * Evolve a ground-floor feature layout for Cubicle Chaos against the levelsim objective.
 *
 * usage: node tools/levelsim/optimize.mjs --gens 120 --pop 48 --seed 1 --out best.json
 *
 * FIXED (architecture the level keeps): the 46 m plate, the stair flight up to the mezzanine
 * and the lift. EVERYTHING ELSE on the ground floor is up for grabs.
 *
 * The genome is a list of features. Hard constraints are enforced by rejection (a mutation
 * that breaks one is simply discarded), so every candidate the objective ever sees is a
 * layout that could be built:
 *   - every feature sits >= 1 m inside the walls (quarter pipes sit flush against one)
 *   - no two features closer than MIN_GAP (the "spacious" requirement, as a number)
 *   - every kicker has a clear run-up and a clear 11 m landing lane
 *   - every rail/ledge/pad has 3 m of clear approach off both ends
 *   - every quarter pipe has 7 m of clear floor in front of it
 *   - total feature footprint <= FOOTPRINT_MAX of the floor
 */
import { writeFileSync } from 'node:fs';
import { evaluate, rectDist } from './sim.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
const GENS = +arg('gens', 120), POP = +arg('pop', 48), SEED = +arg('seed', 1);
const OUT = arg('out', 'best.json');
const MIN_GAP = +arg('gap', 3.0);
const FOOTPRINT_MAX = +arg('footprint', 0.10);
const MIN_FEATURES = +arg('minFeatures', 0);
let MIN_FEATURES_ACTIVE = true;

const B = 23;
let s0 = SEED * 2654435761 >>> 0;
const rnd = () => { s0 = (s0 + 0x6d2b79f5) | 0; let t = Math.imul(s0 ^ (s0 >>> 15), 1 | s0); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const SNAP = Math.PI / 12;                       // 15 degrees: layouts people can read
const snap = (a) => Math.round(a / SNAP) * SNAP;

const FIXED = [
  { type: 'stairs', x: -5.3, z: 11.0, yaw: 0, hw: 2.7, hd: 5.0, h: 4.2, fixed: true },
  { type: 'block', x: 5.0, z: 13.3, yaw: 0, hw: 1.8, hd: 1.8, h: 1.4, fixed: true, name: 'lift' },
];

// ---------------------------------------------------------------- feature kinds ---
function make(type) {
  const x = (rnd() * 2 - 1) * (B - 4), z = (rnd() * 2 - 1) * (B - 4), yaw = snap(rnd() * 2 * Math.PI - Math.PI);
  switch (type) {
    case 'kicker': return { type, x, z, yaw, hw: 1.7, hd: 0.9, h: 0.85 };
    case 'rail': return { type, x, z, yaw, hw: 0.08, hd: 2 + rnd() * 5, h: 0.8 };
    case 'ledge': return { type, x, z, yaw, hw: 0.6, hd: 1.5 + rnd() * 4, h: 0.42 };
    case 'pad': return { type, x, z, yaw, hw: 1.0, hd: 1.5 + rnd() * 2, h: 0.3 };
    case 'qp': return wallQP();
    case 'block': return { type, x, z, yaw, hw: 1 + rnd(), hd: 0.5 + rnd() * 0.5, h: 0.75 };
  }
}
// Quarter pipes only where the ceiling is high: the south wall, and the south (atrium) half of
// the east and west walls. North of z = 5 the mezzanine soffit is at 3.95 m and a vert air off
// a 1.75 m quarter pipe would put the rider's head through it.
function wallQP(side = pick([0, 2, 3]), off = (rnd() * 2 - 1) * 14, w = 6 + rnd() * 4) {
  const d = 2.3;
  if (side === 1) side = 0;
  if (side >= 2) off = Math.min(off, 5 - w / 2 - 0.5);
  // yaw points INTO the wall (the vertical side is local +z).
  const P = [[off, -B + d / 2, Math.PI], [off, B - d / 2, 0], [-B + d / 2, off, -Math.PI / 2], [B - d / 2, off, Math.PI / 2]][side];
  return { type: 'qp', x: P[0], z: P[1], yaw: P[2], hw: w / 2, hd: d / 2, h: 1.6, side, off };
}
const KINDS = ['kicker', 'kicker', 'rail', 'rail', 'rail', 'ledge', 'ledge', 'pad', 'qp', 'block'];

// ---------------------------------------------------------------- constraints ----
function corners(it, pad = 0) {
  const c = Math.cos(it.yaw), s = Math.sin(it.yaw), hw = it.hw + pad, hd = it.hd + pad;
  const out = [];
  for (const [a, b] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [0, -hd], [0, hd], [-hw, 0], [hw, 0]]) out.push([it.x + a * c + b * s, it.z - a * s + b * c]);
  return out;
}
function rectGap(a, b) {
  let d = Infinity;
  for (const [x, z] of corners(a)) d = Math.min(d, rectDist(b, x, z));
  for (const [x, z] of corners(b)) d = Math.min(d, rectDist(a, x, z));
  return d;
}
/** A clear-zone rectangle in front of (dir=+1) or behind (dir=-1) an item. */
function zone(it, dir, length, halfW) {
  const zx = Math.sin(it.yaw), zz = Math.cos(it.yaw);
  const off = it.hd + length / 2;
  return { x: it.x + zx * off * dir, z: it.z + zz * off * dir, yaw: it.yaw, hw: halfW, hd: length / 2 };
}
const blocking = (it) => !(it.type === 'rail' || it.type === 'pad' || it.type === 'ledge');
function zonesOf(it) {
  switch (it.type) {
    case 'kicker': return [zone(it, -1, 5, 1.6), zone(it, 1, 11, 1.8)];
    case 'rail': case 'ledge': case 'pad': return [zone(it, -1, 3, it.hw + 0.8), zone(it, 1, 3, it.hw + 0.8)];
    case 'qp': return [zone(it, -1, 7, it.hw)];
    case 'stairs': return [zone(it, -1, 6, it.hw)];
    default: return [];
  }
}
function valid(items) {
  if (MIN_FEATURES_ACTIVE && items.filter((it) => !it.fixed).length < MIN_FEATURES) return false;
  let area = 0;
  for (const it of items) {
    if (!it.fixed) area += 4 * it.hw * it.hd;
    for (const [x, z] of corners(it)) if (Math.abs(x) > B + 0.01 || Math.abs(z) > B + 0.01) return false;
    if (it.type !== 'qp') for (const [x, z] of corners(it)) if (Math.abs(x) > B - 1 || Math.abs(z) > B - 1) return false;
  }
  if (area > FOOTPRINT_MAX * 4 * B * B) return false;
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.fixed && b.fixed) continue;
    const gap = (a.type === 'qp' && b.type === 'qp') ? 0.5 : MIN_GAP;
    if (rectGap(a, b) < gap) return false;
  }
  // Clear zones must be free of anything that blocks the chair, and must stay on the floor.
  for (const it of items) for (const zn of zonesOf(it)) {
    for (const [x, z] of corners(zn)) if (Math.abs(x) > B || Math.abs(z) > B) return false;
    for (const o of items) {
      if (o === it || !blocking(o)) continue;
      if (rectGap(zn, o) < 0.3) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------- mutation -------
function clone(g) { return g.map((it) => ({ ...it })); }
function mutate(g) {
  for (let tries = 0; tries < 40; tries++) {
    const c = clone(g);
    const free = c.filter((it) => !it.fixed);
    const r = rnd();
    if (r < 0.15 || free.length === 0) c.push(make(pick(KINDS)));
    else if (r < 0.25 && free.length > Math.max(4, MIN_FEATURES)) c.splice(c.indexOf(pick(free)), 1);
    else {
      const it = pick(free);
      const m = rnd();
      if (it.type === 'qp') {
        const q = m < 0.5 ? wallQP(it.side, it.off + gauss() * 3, it.hw * 2) : m < 0.8 ? wallQP(it.side, it.off, Math.max(5, Math.min(11, it.hw * 2 + gauss()))) : wallQP();
        Object.assign(it, q);
      } else if (m < 0.45) { it.x += gauss() * 2.5; it.z += gauss() * 2.5; }
      else if (m < 0.7) it.yaw = snap(it.yaw + pick([-1, 1]) * SNAP * (1 + Math.floor(rnd() * 3)));
      else if (m < 0.85 && (it.type === 'rail' || it.type === 'ledge' || it.type === 'pad')) it.hd = Math.max(1.5, Math.min(8, it.hd + gauss()));
      else { const n = make(pick(KINDS)); if (n.type !== 'qp') { n.x = it.x; n.z = it.z; n.yaw = it.yaw; } Object.assign(it, n); }
    }
    if (valid(c)) return c;
  }
  return g;
}
function crossover(a, b) {
  // Spatial crossover: take a's features on one side of a random line, b's on the other.
  const ang = rnd() * Math.PI, nx = Math.cos(ang), nz = Math.sin(ang), off = (rnd() * 2 - 1) * 8;
  const side = (it) => it.x * nx + it.z * nz > off;
  const c = [...FIXED.map((it) => ({ ...it })),
    ...a.filter((it) => !it.fixed && side(it)).map((it) => ({ ...it })),
    ...b.filter((it) => !it.fixed && !side(it)).map((it) => ({ ...it }))];
  return valid(c) ? c : null;
}

// ---------------------------------------------------------------- search ---------
let evalSeed = 1;
const score = (g) => evaluate({ bounds: B, items: g }, { agents: 16, seconds: 30, seed: evalSeed }).score;

function randomGenome() {
  for (;;) {
    let g = FIXED.map((it) => ({ ...it }));
    const n = Math.max(MIN_FEATURES, 8 + Math.floor(rnd() * 10));
    const saveMin = MIN_FEATURES_ACTIVE; MIN_FEATURES_ACTIVE = false;
    for (let k = 0; k < n * 8 && g.length < n + FIXED.length; k++) {
      const c = [...g, make(pick(KINDS))];
      if (valid(c)) g = c;
    }
    MIN_FEATURES_ACTIVE = saveMin;
    if (g.length >= FIXED.length + Math.max(5, MIN_FEATURES)) return g;
  }
}

let pop = [];
for (let i = 0; i < POP; i++) { const g = randomGenome(); pop.push({ g, f: score(g) }); }
const t0 = Date.now();
for (let gen = 0; gen < GENS; gen++) {
  // Fresh agent seeds every 10 generations, and the survivors are re-scored on them, so the
  // search cannot overfit one set of 16 wandering players.
  if (gen % 10 === 0 && gen > 0) { evalSeed++; for (const p of pop) p.f = score(p.g); }
  pop.sort((a, b) => b.f - a.f);
  const elite = pop.slice(0, Math.ceil(POP / 4));
  const next = [...elite];
  while (next.length < POP) {
    let child;
    if (rnd() < 0.3) child = crossover(pick(elite).g, pick(elite).g);
    if (!child) child = pick(elite).g;
    child = mutate(mutate(child));
    next.push({ g: child, f: score(child) });
  }
  pop = next;
  if (gen % 5 === 0 || gen === GENS - 1) {
    pop.sort((a, b) => b.f - a.f);
    const b = pop[0];
    console.log(`gen ${gen} best ${b.f.toFixed(3)} n=${b.g.length - FIXED.length} ` +
      `${Object.entries(b.g.reduce((m, it) => (m[it.type] = (m[it.type] ?? 0) + 1, m), {})).map(([k, v]) => k + v).join(' ')} ` +
      `${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
}
pop.sort((a, b) => b.f - a.f);
// Final: the top 6 on a big, fresh evaluation; keep the winner.
const finals = pop.slice(0, 6).map((p) => ({ g: p.g, m: evaluate({ bounds: B, items: p.g }, { agents: 64, seconds: 60, seed: 999 }) }));
finals.sort((a, b) => b.m.score - a.m.score);
writeFileSync(OUT, JSON.stringify({ bounds: B, items: finals[0].g, metrics: finals[0].m }, null, 1));
console.log('FINAL', JSON.stringify(finals[0].m, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v));
