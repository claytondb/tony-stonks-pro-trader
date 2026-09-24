import type { SkateItem } from './CubicleChaosLayout';

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
