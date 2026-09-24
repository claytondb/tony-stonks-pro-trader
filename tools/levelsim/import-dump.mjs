/**
 * Convert a physics dump of the live level (tools/probe.mjs + a dump snippet) into a levelsim
 * layout, so the CURRENT level can be scored on exactly the same terms as candidate layouts.
 *
 * usage: node tools/levelsim/import-dump.mjs dump.json > layout.json
 */
import { readFileSync } from 'node:fs';

const d = JSON.parse(readFileSync(process.argv[2], 'utf8')).probes;
const items = [];

// Kickers come from LevelData (their colliders are pitched slabs, not boxes on the floor).
const KICKERS = [[2.4, -8.5, 180], [2.4, -13.0, 0], [20.0, -8.0, 90], [20.0, -13.0, 270]];
for (const [x, z, deg] of KICKERS) {
  // LevelData yaw convention for ramps: rotation[1] degrees, launch direction = (sin, cos).
  items.push({ type: 'kicker', x, z, yaw: deg * Math.PI / 180, hw: 1.7, hd: 0.9, h: 0.85 });
}
// Boardroom kicker (OfficeLevel), faces +z.
items.push({ type: 'kicker', x: 13.6, z: 6.4, yaw: 0, hw: 1.5, hd: 0.9, h: 0.82 });
// Stairs.
items.push({ type: 'stairs', x: -5.3, z: 11.0, yaw: 0, hw: 2.7, hd: 5.0, h: 4.2 });

for (const b of d.bodies) {
  if (b.type === 2) continue;                          // the lift car
  if (b.shape === 6) {                                 // quarter pipe trimesh
    const [x, , z] = b.cp;
    const south = z < -15, north = z > 15;
    const w = south ? 9.0 : north ? 7.0 : 6.4, dep = south ? 2.3 : 2.1;
    items.push({ type: 'qp', x, z, yaw: b.yaw, hw: w / 2, hd: dep / 2, h: 1.6 });
    continue;
  }
  if (b.shape !== 1 || !b.he) continue;
  const [x, y, z] = b.cp; const [hx, hy, hz] = b.he;
  const top = y + hy, bot = y - hy;
  if (bot > 1.0 || top < 0.05) continue;               // upper floor / floor slab
  if (hx > 15 && hz > 15) continue;
  if (Math.abs(hy - 0.09) < 1e-3) continue;            // kicker slab (replaced above)
  if (x > -8.3 && x < -2.3 && z > 5.5 && z < 16.5) continue;   // stair treads (replaced above)
  if (Math.abs(x) > 23.2 || Math.abs(z) > 23.2) continue;      // perimeter walls: sim bounds
  items.push({ type: top > 1.45 ? 'wall' : 'block', x, z, yaw: b.yaw, hw: hx, hd: hz, h: top });
}
for (const b of d.bodies) {
  if (b.shape === 10 && b.r && b.cp[1] < 1) items.push({ type: 'block', x: b.cp[0], z: b.cp[2], yaw: 0, hw: b.r, hd: b.r, h: b.cp[1] * 2 });
}
const rails = d.rails.filter((r) => r.s[1] < 3.5 && r.e[1] < 3.5);
process.stdout.write(JSON.stringify({ bounds: 23, items, rails }, null, 1));
