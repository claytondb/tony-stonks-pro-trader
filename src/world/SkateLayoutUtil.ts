import { CUBICLE_CHAOS_LAYOUT, type SkateItem } from './CubicleChaosLayout';

/**
 * True if (x, z) is somewhere a loose prop should NOT be left: within `margin` of a skate
 * feature, or in a kicker's run-up / landing lane or in front of a quarter pipe. Used to keep
 * the knockable clutter off the lines levelsim chose the layout for.
 */
export function inSkateLane(items: readonly SkateItem[], x: number, z: number, margin = 2.5): boolean {
  for (const it of items) {
    const dx = x - it.x, dz = z - it.z;
    const c = Math.cos(it.yaw), s = Math.sin(it.yaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;       // item-local
    let back = 0, front = 0;
    if (it.type === 'kicker') { back = 5; front = 11; }
    else if (it.type === 'qp') { back = 7; }
    else if (it.type === 'rail' || it.type === 'ledge' || it.type === 'pad') { back = 3; front = 3; }
    const inX = Math.abs(lx) <= it.hw + margin;
    const inZ = lz >= -it.hd - back - margin && lz <= it.hd + front + margin;
    if (inX && inZ) return true;
  }
  return false;
}

/**
 * Minimap footprints for Cubicle Chaos: the skate features (rails drawn as rails), the two
 * corridors and the rooms off them, so the map shows where the wings ARE. Axis-aligned
 * boxes of each feature's rotated rectangle, in world coordinates.
 */
export function officeMinimapFootprints(): { x: number; z: number; w: number; d: number; rail: boolean }[] {
  const out: { x: number; z: number; w: number; d: number; rail: boolean }[] = [];
  for (const it of CUBICLE_CHAOS_LAYOUT) {
    const c = Math.abs(Math.cos(it.yaw)), s = Math.abs(Math.sin(it.yaw));
    const w = 2 * (it.hw * c + it.hd * s), d = 2 * (it.hw * s + it.hd * c);
    const grind = it.type === 'rail' || it.type === 'ledge';
    if (grind && it.hd > 1.5) {
      // A diagonal rail as an AABB is a big square; draw it as a dotted line of small squares.
      const n = Math.ceil(it.hd * 2 / 1.2);
      for (let k = 0; k <= n; k++) {
        const t = -it.hd + (k * 2 * it.hd) / n;
        out.push({ x: it.x + Math.sin(it.yaw) * t, z: it.z + Math.cos(it.yaw) * t, w: 0.9, d: 0.9, rail: true });
      }
    } else {
      out.push({ x: it.x, z: it.z, w, d, rail: false });
    }
  }
  // The stairs and the lift.
  out.push({ x: -5.3, z: 11, w: 5.4, d: 10, rail: false });
  out.push({ x: 5, z: 13.3, w: 3.6, d: 3.6, rail: false });
  // The building outline, as four thin walls, and the two wings.
  for (const [x, z, w, d] of [[0, -23, 46, 0.4], [0, 23, 46, 0.4], [-23, 11, 0.4, 23], [-23, -15, 0.4, 17], [23, 11, 0.4, 23], [23, -15, 0.4, 17]]) {
    out.push({ x, z, w, d, rail: false });
  }
  out.push({ x: 28, z: -3.5, w: 10, d: 6, rail: false });      // corridor to the pool
  out.push({ x: 41, z: -4, w: 12, d: 24, rail: false });       // the pool
  out.push({ x: -28, z: -3.5, w: 10, d: 6, rail: false });     // corridor to the server room
  for (const x of [-38.5, -43.5]) for (const [z0, z1] of [[-15.2, -8.3], [1.3, 9.2]]) {
    out.push({ x, z: (z0 + z1) / 2, w: 1.1, d: z1 - z0, rail: false });
  }
  return out;
}
