/**
 * LEVELSIM — a fast, offline model of how a THPS-style player moves through a floorplan,
 * for scoring and optimising level layouts without booting the game.
 *
 * WHY THIS EXISTS. The owner's brief: "run simulations to figure out the best level design —
 * if the player were to move in swerving lines around the level, what's the optimal placement
 * for rails, obstacles, etc.? More spacious, and invite the user to do tricks off of things."
 * The in-browser harnesses cost seconds per run and need a rebuilt level for every candidate.
 * This model costs ~10 ms per layout, so thousands of candidate layouts can be compared.
 *
 * THE MODEL IS CALIBRATED TO THE GAME, not invented (tools/feel.mjs, tools/ramp-probe.mjs):
 *   cruise 13 m/s, steady turn 2.48 rad/s (5.6 m radius), ollie 0.7 s airtime,
 *   kicker 0.72 s air keeping 82% of speed, quarter pipe ~1.0 s air and back out at ~78%,
 *   grinds keep their speed, anything under 0.42 m is rolled onto (Game.STEP_HEIGHT),
 *   floor rails have no collider (you pass through them), grind capture 1.5 m lateral.
 *
 * WORLD. Units are metres, the game's own axes (x across, z along, yaw = atan2(dx, dz)).
 * A layout is { bounds, items[] }. Every item is an oriented rectangle:
 *   { type, x, z, yaw, hw, hd, h }   hw = half-width along local x, hd = half-depth along local z
 * Local +z is the item's "forward": the direction you ride OFF a kicker, ALONG a rail, and INTO
 * a quarter pipe (its vertical side is at local +z).
 *
 *   type      collides?          interaction
 *   wall      yes (tall)         none — a collision is a chaos event
 *   block     yes if h > 0.42    ollie over it if h <= 1.45 (agents sometimes don't)
 *   ledge     no (rolled onto)   both long edges grind
 *   rail      no (ghost)         grind along local z
 *   pad       no (rolled onto)   manual when crossed along local z
 *   kicker    sides/back         launch when entered from local -z
 *   qp        yes from behind    air + 180 when ridden into from local -z
 *   stairs    yes from sides     gap (ollie the set) when ridden along local ±z; rails on it
 */

// ------------------------------------------------------------------ constants ---
export const CFG = {
  dt: 1 / 30,
  cruise: 13.0,
  maxTurn: 2.48,
  turnChase: 8,           // 1/s — how fast the commanded rate is reached
  stepH: 0.42,
  ollieMaxH: 1.45,
  ollieAir: 0.70,
  kickerAir: 0.72, kickerKeep: 0.82,
  qpAir: 1.0, qpKeep: 0.8,
  // Calibrated to GrindSystem.tryStartGrind: 1.5 m capture, no approach-angle test at all.
  grindLateral: 1.5, grindAngle: 80 * Math.PI / 180, grindMinLeft: 1.2,
  kickerAngle: 55 * Math.PI / 180,     // the wedge's low flank is rideable too
  qpAngle: 55 * Math.PI / 180,
  padAngle: 35 * Math.PI / 180,
  comboWindow: 2.6,       // s between tricks that still reads as one line
  radius: 0.4,            // chair capsule
};

const TAU = Math.PI * 2;
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

// ------------------------------------------------------------------ geometry ----
/** World point -> item-local (lx along local x, lz along local z). */
function toLocal(it, x, z) {
  const dx = x - it.x, dz = z - it.z;
  const c = Math.cos(it.yaw), s = Math.sin(it.yaw);
  // local z axis in world = (sin yaw, cos yaw); local x axis = (cos yaw, -sin yaw)
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}
function inside(it, x, z, pad = 0) {
  const p = toLocal(it, x, z);
  return Math.abs(p.lx) <= it.hw + pad && Math.abs(p.lz) <= it.hd + pad;
}
/** Distance from a point to an item's rectangle (0 inside). */
export function rectDist(it, x, z) {
  const p = toLocal(it, x, z);
  const ex = Math.max(0, Math.abs(p.lx) - it.hw), ez = Math.max(0, Math.abs(p.lz) - it.hd);
  return Math.hypot(ex, ez);
}
/** Ray (x,z,dir) vs item rectangle inflated by r: distance to hit or Infinity. */
function rayRect(it, x, z, dx, dz, maxD, r) {
  const p = toLocal(it, x, z);
  const c = Math.cos(it.yaw), s = Math.sin(it.yaw);
  const ldx = dx * c - dz * s, ldz = dx * s + dz * c;
  let t0 = 0, t1 = maxD;
  for (const [o, d, h] of [[p.lx, ldx, it.hw + r], [p.lz, ldz, it.hd + r]]) {
    if (Math.abs(d) < 1e-9) { if (Math.abs(o) > h) return Infinity; continue; }
    let a = (-h - o) / d, b = (h - o) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return Infinity;
  }
  return t0;
}

/** Does this item physically stop a chair travelling in `heading` at (x,z)? */
function blocks(it, heading) {
  switch (it.type) {
    case 'rail': case 'pad': case 'ledge': return false;
    case 'block': case 'wall': return it.h > CFG.stepH;
    case 'kicker': {
      // Ridden up from the low end it is a ramp, anything else is a 0.85 m box.
      const d = Math.abs(wrap(heading - it.yaw));
      return d > CFG.kickerAngle + 0.25;
    }
    case 'qp': {
      const d = Math.abs(wrap(heading - it.yaw));
      return d > CFG.qpAngle + 0.3;
    }
    case 'stairs': {
      const d = Math.abs(wrap(heading - it.yaw));
      return Math.min(d, Math.PI - d) > 0.6;
    }
    default: return it.h > CFG.stepH;
  }
}

// ------------------------------------------------------------------ layout prep --
/** Expand an item list into the pieces the agent loop needs. */
export function prepare(layout) {
  const items = layout.items.map((it, i) => ({ ...it, id: i }));
  const grinds = [];   // {it, ax, az (start), dx, dz (unit), len, y}
  for (const it of items) {
    const zx = Math.sin(it.yaw), zz = Math.cos(it.yaw);     // local z in world
    const xx = Math.cos(it.yaw), xz = -Math.sin(it.yaw);    // local x in world
    const addLine = (ox, h, len) => {
      const cx = it.x + xx * ox, cz = it.z + xz * ox;
      grinds.push({ it, ax: cx - zx * len / 2, az: cz - zz * len / 2, dx: zx, dz: zz, len, y: h });
    };
    if (it.type === 'rail') addLine(0, it.h ?? 0.8, it.hd * 2);
    if (it.type === 'ledge') { addLine(-it.hw, it.h, it.hd * 2); addLine(it.hw, it.h, it.hd * 2); }
    if (it.grindEdges) for (const g of it.grindEdges) grinds.push({ it, ...g });
  }
  if (layout.rails) for (const r of layout.rails) {
    const dx = r.e[0] - r.s[0], dz = r.e[2] - r.s[2]; const len = Math.hypot(dx, dz);
    if (len < 1) continue;
    grinds.push({ it: null, ax: r.s[0], az: r.s[2], dx: dx / len, dz: dz / len, len, y: r.s[1] });
  }
  return { bounds: layout.bounds ?? 23, items, grinds, solids: items.filter((it) => it.type !== 'rail') };
}

// ------------------------------------------------------------------ the agent ---
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * One simulated player for `seconds`. `seek` 0 = pure swerving (holds W and wanders the stick);
 * 1 = lines up features it can see ahead. Returns the event log and per-frame positions.
 */
export function runAgent(W, seed, seconds, seek, trace = false) {
  const rnd = mulberry32(seed);
  const B = W.bounds - 0.6;
  // Spawn on free floor.
  let x = 0, z = 0;
  for (let k = 0; k < 200; k++) {
    x = (rnd() * 2 - 1) * B; z = (rnd() * 2 - 1) * B;
    if (!W.solids.some((it) => inside(it, x, z, 1.0))) break;
  }
  let heading = rnd() * TAU - Math.PI;
  let speed = CFG.cruise * (0.7 + 0.3 * rnd());
  let turn = 0, turnTarget = 0, segLeft = 0;
  let air = 0, airKind = null;
  let grind = null, grindS = 0, grindDir = 1;
  let lastTrick = -99, lastFeature = null, lastFeatureT = -99;
  const ev = { tricks: 0, byType: {}, collisions: 0, hardHits: 0, avoid: 0, badLand: 0, comboTime: 0,
    longestCombo: 0, featuresUsed: new Set(), stopTime: 0, dist: 0 };
  let comboStart = -1;
  const padTried = new Set();
  let inContact = 0, wasContact = false, wasAvoid = false;
  const contact = (hard) => {
    if (!wasContact) { ev.collisions++; if (hard) ev.hardHits++; }
    wasContact = true; inContact += dt;
  };
  const path = trace ? [] : null;
  const dt = CFG.dt;
  const trick = (t, kind, featureId) => {
    // The same feature twice inside a second is one trick, not two.
    if (featureId === lastFeature && t - lastFeatureT < 1.0) return;
    lastFeature = featureId; lastFeatureT = t;
    ev.tricks++; ev.byType[kind] = (ev.byType[kind] ?? 0) + 1;
    if (featureId != null) ev.featuresUsed.add(featureId);
    if (t - lastTrick > CFG.comboWindow) comboStart = t;
    ev.longestCombo = Math.max(ev.longestCombo, t - comboStart);
    lastTrick = t;
  };

  for (let t = 0; t < seconds; t += dt) {
    if (t - lastTrick <= CFG.comboWindow) ev.comboTime += dt;
    if (trace && Math.round(t / dt) % 3 === 0) path.push([x, z, air > 0 ? 1 : grind ? 2 : 0]);

    // ---- in the air: ballistic, no steering, land and check what is under you
    if (air > 0) {
      x += Math.sin(heading) * speed * dt; z += Math.cos(heading) * speed * dt;
      air -= dt;
      if (Math.abs(x) > B || Math.abs(z) > B) {
        x = Math.max(-B, Math.min(B, x)); z = Math.max(-B, Math.min(B, z));
        ev.collisions++; ev.hardHits++; speed *= 0.3; air = 0;
      }
      if (air <= 0) {
        const under = W.solids.find((it) => inside(it, x, z, CFG.radius * 0.5) && blocks(it, heading) && it.h > CFG.stepH);
        if (under) { ev.badLand++; ev.collisions++; speed *= 0.35; heading = wrap(heading + Math.PI * (rnd() - 0.5)); }
      }
      ev.dist += speed * dt;
      continue;
    }

    // ---- grinding: glued to the line until it ends or the player lets go
    if (grind) {
      grindS += speed * dt * grindDir;
      x = grind.ax + grind.dx * grindS; z = grind.az + grind.dz * grindS;
      if (grindS < 0 || grindS > grind.len) {
        grind = null; air = 0.35; // pop off the end
      }
      ev.dist += speed * dt;
      continue;
    }

    // ---- steering: the swerve
    segLeft -= dt;
    if (segLeft <= 0) {
      const r = rnd();
      turnTarget = r < 0.3 ? 0 : (rnd() * 2 - 1);
      segLeft = 0.5 + rnd() * 1.6;
    }
    let want = turnTarget;

    // Seek: line up with a feature ahead. The target is a point on the feature's approach
    // axis, 3 m before its entry, so the agent arrives aligned rather than side-on.
    if (seek > 0) {
      let best = null, bestScore = 0;
      for (const it of W.items) {
        const ent = entryOf(it, heading);
        if (!ent) continue;
        const dx = ent.x - x, dz = ent.z - z, d = Math.hypot(dx, dz);
        if (d < 2 || d > 18) continue;
        const bearing = wrap(Math.atan2(dx, dz) - heading);
        if (Math.abs(bearing) > 0.8) continue;
        if (Math.abs(wrap(ent.dir - heading)) > 1.0) continue;
        const sc = (1 - d / 18) * (1 - Math.abs(bearing) / 0.8);
        if (sc > bestScore) { bestScore = sc; best = bearing; }
      }
      if (best !== null) want = want * (1 - seek) + Math.max(-1, Math.min(1, best * 2.2)) * seek;
    }

    // Roam: left alone, a player drifts toward open floor rather than along the walls —
    // people ride INTO the space they can see, not around its edge. Mild, and only between
    // swerves, so the line still wanders.
    if (want === turnTarget && rnd() < 0.5) {
      let bestH = 0, bestD = -1;
      for (const off of [-1.0, -0.5, 0, 0.5, 1.0]) {
        const dd = castDist(W, x, z, heading + off, 30, B);
        if (dd > bestD + 0.5) { bestD = dd; bestH = off; }
      }
      want = want * 0.6 + Math.max(-1, Math.min(1, bestH * 1.5)) * 0.4;
    }

    // Avoid: a player who can see a wall coming turns away from it. Rays fan the look-ahead.
    const look = speed * 0.9 + 2;
    const fwd = castDist(W, x, z, heading, look, B);
    if (fwd < look) {
      const l = castDist(W, x, z, heading - 0.6, look, B), r = castDist(W, x, z, heading + 0.6, look, B);
      // heading + is turning right? yaw = atan2(dx,dz): +yaw rotates toward +x. Positive `turn` adds to heading.
      want = r > l ? 1 : -1;
      if (fwd < look * 0.5 && !wasAvoid) ev.avoid++;
      wasAvoid = fwd < look * 0.5;
    } else wasAvoid = false;

    turn += (want * CFG.maxTurn - turn) * (1 - Math.exp(-CFG.turnChase * dt));
    heading = wrap(heading + turn * dt);
    speed += (CFG.cruise - speed) * (1 - Math.exp(-0.9 * dt));

    // ---- move, then resolve what we rode into
    const nx = x + Math.sin(heading) * speed * dt, nz = z + Math.cos(heading) * speed * dt;
    // Perimeter walls.
    if (Math.abs(nx) > B || Math.abs(nz) > B) {
      const hitX = Math.abs(nx) > B;
      const along = hitX ? Math.cos(heading) : Math.sin(heading);
      const angle = Math.abs(hitX ? Math.sin(heading) : Math.cos(heading));
      contact(angle > 0.6);
      // Slide along the wall, keeping the tangential speed.
      heading = hitX ? (along >= 0 ? 0 : Math.PI) : (along >= 0 ? Math.PI / 2 : -Math.PI / 2);
      speed *= Math.max(0.25, 1 - angle);
      x = Math.max(-B, Math.min(B, x + Math.sin(heading) * speed * dt));
      z = Math.max(-B, Math.min(B, z + Math.cos(heading) * speed * dt));
      if (inContact > 1.0) { heading = wrap(heading + Math.PI * (0.6 + 0.8 * rnd())); inContact = 0; ev.stuck = (ev.stuck ?? 0) + 1; }
      continue;
    }
    // Items.
    let hit = null;
    for (const it of W.solids) {
      if (!inside(it, nx, nz, CFG.radius)) continue;
      if (inside(it, x, z, CFG.radius)) continue;              // already on/in it
      const interact = featureAt(it, x, z, heading);
      if (interact) { hit = { it, interact }; break; }
      if (blocks(it, heading)) { hit = { it, interact: null }; break; }
    }
    if (hit && hit.interact) {
      const k = hit.interact;
      if (k === 'kicker') { air = CFG.kickerAir; speed *= CFG.kickerKeep; trick(t, 'kicker', hit.it.id); }
      else if (k === 'qp') {
        // Up the wall, air, back down facing the other way.
        air = CFG.qpAir * 0.5; heading = wrap(2 * hit.it.yaw + Math.PI - heading);
        speed *= CFG.qpKeep; trick(t, 'qp', hit.it.id);
      } else if (k === 'stairs') { air = 0.9; trick(t, 'gap', hit.it.id); }
      x = nx; z = nz;
    } else if (hit) {
      const it = hit.it;
      if (it.h <= CFG.ollieMaxH && rnd() < 0.65) {
        air = CFG.ollieAir; trick(t, 'ollie', it.id); x = nx; z = nz;
      } else {
        // Deflect along the face.
        const p = toLocal(it, x, z);
        const faceZ = Math.abs(p.lz) - it.hd > Math.abs(p.lx) - it.hw;
        const axis = faceZ ? it.yaw + Math.PI / 2 : it.yaw;   // tangent of the face hit
        const d = wrap(heading - axis);
        const angle = Math.abs(Math.sin(d));
        contact(angle > 0.6);
        heading = Math.abs(d) < Math.PI / 2 ? axis : wrap(axis + Math.PI);
        speed *= Math.max(0.25, 1 - angle);
      }
    } else {
      x = nx; z = nz;
    }
    if (!hit || hit.interact) { wasContact = false; inContact = 0; }
    if (inContact > 1.0) { heading = wrap(heading + Math.PI * (0.6 + 0.8 * rnd())); inContact = 0; ev.stuck = (ev.stuck ?? 0) + 1; }
    ev.dist += speed * dt;

    // Manual pads: crossing one lengthwise is a manual.
    for (const id of padTried) if (!inside(W.items[id], x, z, 0.5)) padTried.delete(id);
    for (const it of W.items) {
      if (it.type !== 'pad') continue;
      if (padTried.has(it.id)) continue;
      if (inside(it, x, z) && Math.min(Math.abs(wrap(heading - it.yaw)), Math.PI - Math.abs(wrap(heading - it.yaw))) < CFG.padAngle) {
        padTried.add(it.id);
        // A manual is an input (S then W), not something that happens to you: only some
        // crossings are manualled, and only by players who meant to line the pad up.
        if (rnd() < (seek > 0 ? 0.55 : 0.25)) trick(t, 'manual', it.id);
      }
    }
    // Grind capture: the E prompt is on screen, the player presses it.
    for (const g of W.grinds) {
      const rx = x - g.ax, rz = z - g.az;
      const s = rx * g.dx + rz * g.dz;
      if (s < 0 || s > g.len) continue;
      const lat = Math.abs(rx * g.dz - rz * g.dx);
      if (lat > CFG.grindLateral) continue;
      const dAng = wrap(heading - Math.atan2(g.dx, g.dz));
      const fwd = Math.abs(dAng) < CFG.grindAngle, back = Math.abs(dAng) > Math.PI - CFG.grindAngle;
      if (!fwd && !back) continue;
      const left = fwd ? g.len - s : s;
      if (left < CFG.grindMinLeft) continue;
      if (g.y > 1.7) continue;          // out of reach even with the assisted hop
      grind = g; grindS = s; grindDir = fwd ? 1 : -1;
      heading = fwd ? Math.atan2(g.dx, g.dz) : Math.atan2(-g.dx, -g.dz);
      trick(t, 'grind', g.it ? g.it.id : 1000 + W.grinds.indexOf(g));
      break;
    }
    if (speed < 2) ev.stopTime += dt;
  }
  ev.featuresUsed = [...ev.featuresUsed];
  return { ev, path };
}

/** Where to ride into an item from, if it is a feature approached roughly along `heading`. */
function entryOf(it, heading) {
  const zx = Math.sin(it.yaw), zz = Math.cos(it.yaw);
  if (it.type === 'kicker' || it.type === 'qp') {
    return { x: it.x - zx * (it.hd + 3), z: it.z - zz * (it.hd + 3), dir: it.yaw };
  }
  if (it.type === 'rail' || it.type === 'ledge' || it.type === 'pad' || it.type === 'stairs') {
    const f = Math.abs(wrap(heading - it.yaw)) < Math.PI / 2 ? 1 : -1;
    return { x: it.x - zx * (it.hd + 3) * f, z: it.z - zz * (it.hd + 3) * f, dir: f > 0 ? it.yaw : wrap(it.yaw + Math.PI) };
  }
  return null;
}

/** Is riding into `it` from (x,z) at `heading` a feature interaction? */
function featureAt(it, x, z, heading) {
  const d = Math.abs(wrap(heading - it.yaw));
  const p = toLocal(it, x, z);
  if (it.type === 'kicker' && d < CFG.kickerAngle && p.lz < -it.hd * 0.5) return 'kicker';
  if (it.type === 'qp' && d < CFG.qpAngle && p.lz < -it.hd * 0.3) return 'qp';
  if (it.type === 'stairs' && Math.min(d, Math.PI - d) < 0.6) return 'stairs';
  return null;
}

function castDist(W, x, z, h, maxD, B) {
  const dx = Math.sin(h), dz = Math.cos(h);
  let best = maxD;
  // Perimeter.
  if (dx > 1e-6) best = Math.min(best, (B - x) / dx); else if (dx < -1e-6) best = Math.min(best, (-B - x) / dx);
  if (dz > 1e-6) best = Math.min(best, (B - z) / dz); else if (dz < -1e-6) best = Math.min(best, (-B - z) / dz);
  for (const it of W.solids) {
    if (!blocks(it, h)) continue;
    if (it.h <= CFG.ollieMaxH && it.type !== 'wall') continue;   // low stuff: they ollie it or ride it
    const t = rayRect(it, x, z, dx, dz, best, CFG.radius);
    if (t < best) best = t;
  }
  return best;
}

// ------------------------------------------------------------------ scoring -----
/** Floor openness: sample a grid, measure clearance to anything you can hit. */
export function openness(W, step = 1.0) {
  const B = W.bounds;
  let n = 0, open3 = 0, sumClear = 0, lines = 0, lineHits = 0;
  const solids = W.solids.filter((it) => it.type !== 'pad' && !(it.type === 'ledge' && it.h <= CFG.stepH));
  for (let x = -B + step / 2; x < B; x += step) for (let z = -B + step / 2; z < B; z += step) {
    if (solids.some((it) => inside(it, x, z))) continue;
    n++;
    let c = Math.min(B - Math.abs(x), B - Math.abs(z));
    for (const it of solids) c = Math.min(c, rectDist(it, x, z));
    sumClear += Math.min(c, 8);
    if (c >= 3) open3++;
  }
  return { floorFree: n * step * step / (4 * B * B), open3: open3 / n, meanClear: sumClear / n };
}

/**
 * Score a layout. Many agents, fixed seeds (common random numbers), half pure swervers and
 * half that line things up. Everything returned is per minute of riding.
 */
export function evaluate(layout, { agents = 24, seconds = 40, seed = 1 } = {}) {
  const W = prepare(layout);
  let stuck = 0, tricks = 0, coll = 0, hard = 0, avoid = 0, bad = 0, combo = 0, time = 0, stop = 0, dist = 0;
  let longest = 0;
  const byType = {}; const used = new Set();
  for (let a = 0; a < agents; a++) {
    const seek = a % 2 === 0 ? 0 : 0.6;
    const { ev } = runAgent(W, seed * 7919 + a * 104729, seconds, seek);
    stuck += ev.stuck ?? 0; tricks += ev.tricks; coll += ev.collisions; hard += ev.hardHits; avoid += ev.avoid; bad += ev.badLand;
    combo += ev.comboTime; time += seconds; stop += ev.stopTime; dist += ev.dist;
    longest += ev.longestCombo;
    for (const [k, v] of Object.entries(ev.byType)) byType[k] = (byType[k] ?? 0) + v;
    for (const f of ev.featuresUsed) used.add(f);
  }
  const perMin = (v) => v / (time / 60);
  const featureIds = W.items.filter((it) => ['kicker', 'qp', 'rail', 'ledge', 'pad', 'stairs'].includes(it.type)).map((it) => it.id);
  const usedFrac = featureIds.length ? featureIds.filter((id) => used.has(id)).length / featureIds.length : 0;
  const kinds = Object.values(byType); const tot = kinds.reduce((a, b) => a + b, 0) || 1;
  const entropy = -kinds.reduce((a, v) => a + (v / tot) * Math.log(v / tot), 0) / Math.log(5);
  const open = openness(W, 1.5);
  const m = {
    tricksPerMin: perMin(tricks),
    comboShare: combo / time,
    collisionsPerMin: perMin(coll),
    hardHitsPerMin: perMin(hard),
    avoidPerMin: perMin(avoid),
    badLandPerMin: perMin(bad),
    stopShare: stop / time,
    stuckPerMin: perMin(stuck),
    meanLongestCombo: longest / agents,
    variety: entropy,
    featureUse: usedFrac,
    byTypePerMin: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, +perMin(v).toFixed(2)])),
    ...open,
  };
  // THE OBJECTIVE. Flow first (tricks you chain), calm second (no collisions, room to breathe).
  const bt = m.byTypePerMin;
  const w = { grind: 1, kicker: 1.6, qp: 1.6, gap: 1.6, manual: 0.7, ollie: 0.5 };
  m.weightedTricksPerMin = Object.entries(bt).reduce((a, [k, v]) => a + (w[k] ?? 1) * v, 0);
  m.airPerMin = (bt.kicker ?? 0) + (bt.qp ?? 0) + (bt.gap ?? 0);
  m.score =
      1.2 * Math.min(m.weightedTricksPerMin, 32) / 32
    + 0.8 * Math.min(m.airPerMin, 8) / 8
    + 1.0 * m.comboShare
    + 0.5 * m.variety
    + 0.4 * m.featureUse
    + 0.8 * m.open3
    - 1.2 * Math.min(m.collisionsPerMin, 12) / 12
    - 0.8 * Math.min(m.hardHitsPerMin, 6) / 6
    - 0.6 * Math.min(m.badLandPerMin, 3) / 3;
  return m;
}
