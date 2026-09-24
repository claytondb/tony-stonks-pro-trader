/**
 * THE WELLNESS WING — a hallway off Cubicle Chaos into the company's drained lap pool.
 *
 * Owner: "it would be cool if there was a hallway the user could go down to connect to
 * another room with a drastically different layout of objects." The main floor is street:
 * rails, ledges, a kicker, flat carpet. This room is the opposite — it is ONE feature, a
 * rounded-rectangle bowl, the classic THPS drained pool, and everything you do in it is
 * transition: carve the walls, air the deep end, grind the coping all the way round.
 *
 * And it is a thing an office really has: the corporate wellness centre, pool drained for
 * "maintenance". You reach it along a corridor off the atrium's east wall that ramps up
 * 2.4 m to the pool deck, because the pool is sunk below the deck, not below the ground —
 * the whole building sits on one physics ground slab at y = 0, so the POOL FLOOR is the
 * slab and the DECK is raised around it.
 *
 * Geometry is analytic and collided exactly as drawn:
 *   bowl  — rings of offset rounded rectangles, inset d = R(1 - cos t), y = H - R sin t:
 *           vertical at the coping, flat at the bottom, one closed-form curve all round
 *           (corners included, because every ring is the same shape inset)
 *   deck  — a flat ring from the coping out to the room walls
 *   ramp  — a wedge up the corridor
 */
import * as THREE from 'three';
import { wedgeShell } from './OfficeProps';

/** Named gaps in the wing, for GoalSystem: the drop-in off the corridor deck, and vert at the deep end. */
export const WELLNESS_GAPS = [
  { id: 'pool_drop_in', name: 'Pool Drop-In', bonus: 900, from: [34.0, 0, -3.5] as [number, number, number], to: [39.0, 0, -3.5] as [number, number, number], radius: 3.0 },
  { id: 'deep_end_air', name: 'Deep End Air', bonus: 1000, from: [41.0, 0, -15.0] as [number, number, number], to: [41.0, 0, -15.0] as [number, number, number], radius: 4.0 },
];

export interface WingCollider {
  position: THREE.Vector3;
  halfExtents: THREE.Vector3;
  rotationY: number;
  trimesh?: { vertices: Float32Array; indices: Uint32Array };
}

export interface WellnessWing {
  root: THREE.Group;
  colliders: WingCollider[];
  rails: { start: THREE.Vector3; end: THREE.Vector3 }[];
  /** The gap to cut in the office's east wall, world z range. */
  door: { z0: number; z1: number; height: number };
  /** Extent of the wing, for the building shell and the ground slab. */
  maxX: number;
}

// ------------------------------------------------------------------ dimensions ---
const OFFICE_EAST = 23.0;
const DOOR_Z0 = -6.5, DOOR_Z1 = -0.5;          // 6 m corridor
const DOOR_H = 3.6;
const RAMP_X0 = 24.5, RAMP_X1 = 33.0;          // 8.5 m ramp, 2.4 m rise (~16 degrees)
const DECK_Y = 2.4;                             // deck top = pool depth
const ROOM_X0 = 33.0, ROOM_X1 = 49.0, ROOM_Z0 = -20.0, ROOM_Z1 = 14.0;
const ROOM_CEIL = DECK_Y + 5.4;
const POOL_CX = 41.0, POOL_CZ = -4.0;
const POOL_AX = 6.0, POOL_AZ = 12.0;           // half sizes at the coping
const POOL_RC = 3.6;                            // corner radius at the coping
const POOL_R = DECK_Y;                          // transition radius = depth: vert at the lip
const WALL_T = 0.3;

// ------------------------------------------------------------------ materials ----
function tileTexture(base: string, grout: string, px: number, lanes = false): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = grout; g.fillRect(0, 0, 256, 256);
  const n = 256 / px;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = ((i * 7 + j * 13) % 5) * 3;
    g.fillStyle = shade(base, v - 6);
    g.fillRect(i * px + 1, j * px + 1, px - 2, px - 2);
  }
  if (lanes) { g.fillStyle = '#123a6b'; g.fillRect(118, 0, 20, 256); }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function shade(hex: string, d: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, ((n >> s) & 255) + d));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}
function signTexture(text: string, sub: string): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#0e5f73'; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = '#ffffff'; g.font = 'bold 110px Arial'; g.textAlign = 'center';
  g.fillText(text, 512, 140);
  g.font = '44px Arial'; g.fillStyle = '#bff3ff';
  g.fillText(sub, 512, 215);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ geometry -----
/** A rounded rectangle (half sizes ax, az, corner radius rc) sampled at a fixed N points,
 *  starting at +x mid-edge and going round counter-clockwise. Same N for every inset, so
 *  consecutive rings can be stitched point to point. */
function roundedRect(ax: number, az: number, rc: number, perSide: number, perArc: number): [number, number][] {
  const pts: [number, number][] = [];
  const sx = ax - rc, sz = az - rc;
  const corners: [number, number, number][] = [[sx, sz, 0], [-sx, sz, Math.PI / 2], [-sx, -sz, Math.PI], [sx, -sz, 1.5 * Math.PI]];
  // Walk: +x edge upward (z from -sz to sz), NE arc, top edge (x sx -> -sx), NW arc, ...
  const edges: [number, number, number, number][] = [
    [ax, -sz, ax, sz], [sx, az, -sx, az], [-ax, sz, -ax, -sz], [-sx, -az, sx, -az],
  ];
  for (let e = 0; e < 4; e++) {
    const [x0, z0, x1, z1] = edges[e];
    for (let i = 0; i < perSide; i++) { const t = i / perSide; pts.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]); }
    const [cx, cz, a0] = corners[e];
    for (let i = 0; i < perArc; i++) {
      const a = a0 + (i / perArc) * Math.PI / 2;
      pts.push([cx + Math.cos(a) * rc, cz + Math.sin(a) * rc]);
    }
  }
  return pts;
}

function meshFrom(pos: number[], uv: number[], idx: number[], mat: THREE.Material): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

export function buildWellnessWing(): WellnessWing {
  const root = new THREE.Group();
  root.name = 'wellnessWing';
  const colliders: WingCollider[] = [];
  const rails: { start: THREE.Vector3; end: THREE.Vector3 }[] = [];

  const poolTileMat = new THREE.MeshStandardMaterial({ map: tileTexture('#3f93c0', '#9fb8c2', 32), roughness: 0.35 });
  poolTileMat.map!.repeat.set(1, 1);
  const floorTileMat = new THREE.MeshStandardMaterial({ map: tileTexture('#2a6f99', '#9fb8c2', 32, true), roughness: 0.4 });
  const deckTileMat = new THREE.MeshStandardMaterial({ map: tileTexture('#9a9487', '#7b7569', 64), roughness: 0.7 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6fa9b0, roughness: 0.9 });
  const corridorWallMat = new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.9 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0xc9cfd1, roughness: 0.95 });
  const copingMat = new THREE.MeshStandardMaterial({ color: 0xcfc8b8, roughness: 0.6 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xc9ced4, metalness: 0.8, roughness: 0.3 });
  const carpetMat = new THREE.MeshStandardMaterial({ color: 0x8f7a5a, roughness: 1.0 });

  // =================================================================== THE BOWL ====
  const perSide = 14, perArc = 10;
  const RINGS = 14;
  const ringPts: [number, number][][] = [];
  const ringY: number[] = [];
  const ringD: number[] = [];
  for (let k = 0; k <= RINGS; k++) {
    const t = (k / RINGS) * Math.PI / 2;
    const d = POOL_R * (1 - Math.cos(t));
    ringD.push(d); ringY.push(DECK_Y - POOL_R * Math.sin(t));
    ringPts.push(roundedRect(POOL_AX - d, POOL_AZ - d, POOL_RC - d, perSide, perArc));
  }
  const N = ringPts[0].length;
  {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let perim = 0; const along: number[] = [0];
    for (let i = 1; i <= N; i++) {
      const a = ringPts[0][i - 1], b = ringPts[0][i % N];
      perim += Math.hypot(b[0] - a[0], b[1] - a[1]); along.push(perim);
    }
    for (let k = 0; k <= RINGS; k++) {
      for (let i = 0; i <= N; i++) {
        const p = ringPts[k][i % N];
        pos.push(POOL_CX + p[0], ringY[k], POOL_CZ + p[1]);
        // Tiles ~0.5 m: u along the wall, v down it (arc length ~ R * t).
        uv.push(along[i] / 2.0, (k / RINGS) * (Math.PI / 2) * POOL_R / 2.0);
      }
    }
    for (let k = 0; k < RINGS; k++) for (let i = 0; i < N; i++) {
      const a = k * (N + 1) + i, b = a + 1, c = a + (N + 1), e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
    poolTileMat.map!.wrapS = poolTileMat.map!.wrapT = THREE.RepeatWrapping;
    root.add(meshFrom(pos, uv, idx, poolTileMat));
    // Collider: the same surface. (Sheet trimesh: the chair only ever meets it from inside.)
    const cpos: number[] = [], cidx: number[] = [];
    for (let k = 0; k <= RINGS; k++) for (let i = 0; i < N; i++) {
      const p = ringPts[k][i]; cpos.push(p[0], ringY[k], p[1]);
    }
    for (let k = 0; k < RINGS; k++) for (let i = 0; i < N; i++) {
      const a = k * N + i, b = k * N + ((i + 1) % N), c = (k + 1) * N + i, e = (k + 1) * N + ((i + 1) % N);
      cidx.push(a, c, b, b, c, e);
    }
    colliders.push({
      position: new THREE.Vector3(POOL_CX, 0, POOL_CZ), halfExtents: new THREE.Vector3(POOL_AX, DECK_Y / 2, POOL_AZ), rotationY: 0,
      trimesh: { vertices: new Float32Array(cpos), indices: new Uint32Array(cidx) },
    });
  }
  // Pool floor: tiles with lane stripes, just above the ground slab.
  {
    const w = 2 * (POOL_AX - POOL_R) + 0.2, d = 2 * (POOL_AZ - POOL_R) + 0.2;
    const tex = floorTileMat.map!; tex.repeat.set(w / 3, d / 3);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorTileMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(POOL_CX, 0.012, POOL_CZ); floor.receiveShadow = true;
    root.add(floor);
  }
  // Coping: a rounded cap round the lip, and grind rails on it (straights, and the arcs in
  // short chords so the corners carve round rather than ending the grind).
  {
    const lip = ringPts[0];
    for (let i = 0; i < N; i++) {
      const a = lip[i], b = lip[(i + 1) % N];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len + 0.02, 8), copingMat);
      cap.position.set(POOL_CX + (a[0] + b[0]) / 2, DECK_Y + 0.02, POOL_CZ + (a[1] + b[1]) / 2);
      cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]).normalize());
      cap.castShadow = true; cap.receiveShadow = true;
      root.add(cap);
    }
    // Grinds: the four straights as single long rails, each corner as one chord-rail per arc step.
    const outward = 0.02;
    const railY = DECK_Y + 0.1;
    for (let e = 0; e < 4; e++) {
      const s = e * (perSide + perArc);
      const a = lip[s], b = lip[s + perSide];
      rails.push({ start: new THREE.Vector3(POOL_CX + a[0] * (1 + outward / POOL_AX), railY, POOL_CZ + a[1]), end: new THREE.Vector3(POOL_CX + b[0] * (1 + outward / POOL_AX), railY, POOL_CZ + b[1]) });
      for (let j = 0; j < perArc; j += 2) {
        const p = lip[s + perSide + j], q = lip[(s + perSide + j + 2) % N];
        rails.push({ start: new THREE.Vector3(POOL_CX + p[0], railY, POOL_CZ + p[1]), end: new THREE.Vector3(POOL_CX + q[0], railY, POOL_CZ + q[1]) });
      }
    }
  }

  // =================================================================== THE DECK ====
  // A flat ring from the coping out to the room rectangle. Each coping point is paired with a
  // point on the room wall: straights project square onto their wall, and a whole corner arc
  // fans to its room corner.
  {
    const lip = ringPts[0];
    const outer: [number, number][] = [];
    const rx0 = ROOM_X0 - POOL_CX, rx1 = ROOM_X1 - POOL_CX, rz0 = ROOM_Z0 - POOL_CZ, rz1 = ROOM_Z1 - POOL_CZ;
    for (let e = 0; e < 4; e++) {
      const s = e * (perSide + perArc);
      for (let i = 0; i < perSide + perArc; i++) {
        const p = lip[s + i];
        if (i < perSide) {
          outer.push(e === 0 ? [rx1, p[1]] : e === 1 ? [p[0], rz1] : e === 2 ? [rx0, p[1]] : [p[0], rz0]);
        } else {
          outer.push(e === 0 ? [rx1, rz1] : e === 1 ? [rx0, rz1] : e === 2 ? [rx0, rz0] : [rx1, rz0]);
        }
      }
    }
    // The first point of each straight projects onto a z (or x) the previous corner does not
    // reach: stitch the corner explicitly by also emitting a triangle to the next point.
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i < N; i++) {
      pos.push(POOL_CX + lip[i][0], DECK_Y, POOL_CZ + lip[i][1]); uv.push((POOL_CX + lip[i][0]) / 2, (POOL_CZ + lip[i][1]) / 2);
      pos.push(POOL_CX + outer[i][0], DECK_Y, POOL_CZ + outer[i][1]); uv.push((POOL_CX + outer[i][0]) / 2, (POOL_CZ + outer[i][1]) / 2);
    }
    for (let i = 0; i < N; i++) {
      const a = 2 * i, b = 2 * i + 1, c = 2 * ((i + 1) % N), e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
    deckTileMat.map!.repeat.set(1, 1);
    const deck = meshFrom(pos, uv, idx, deckTileMat);
    root.add(deck);
    // Collider: the deck top as a trimesh plus a solid block under it round the outside, so
    // nothing can ever get beneath the deck surface.
    const cpos: number[] = [];
    for (let i = 0; i < N; i++) {
      cpos.push(lip[i][0], DECK_Y, lip[i][1]);
      cpos.push(outer[i][0], DECK_Y, outer[i][1]);
    }
    colliders.push({
      position: new THREE.Vector3(POOL_CX, 0, POOL_CZ), halfExtents: new THREE.Vector3(8, 1, 17), rotationY: 0,
      trimesh: { vertices: new Float32Array(cpos), indices: new Uint32Array(idx) },
    });
  }

  // =================================================================== THE ROOM ====
  const roomW = ROOM_X1 - ROOM_X0, roomD = ROOM_Z1 - ROOM_Z0;
  const rcx = (ROOM_X0 + ROOM_X1) / 2, rcz = (ROOM_Z0 + ROOM_Z1) / 2;
  const wall = (x: number, z: number, w: number, h: number, y: number, rotY: number, mat: THREE.Material, collide = true) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y + h / 2, z); m.rotation.y = rotY; m.receiveShadow = true;
    root.add(m);
    if (collide) {
      const nx = Math.sin(rotY), nz = Math.cos(rotY);
      colliders.push({
        position: new THREE.Vector3(x - nx * WALL_T, y + h / 2, z - nz * WALL_T),
        halfExtents: new THREE.Vector3(w / 2, h / 2 + 1, WALL_T), rotationY: rotY,
      });
    }
  };
  const wallH = ROOM_CEIL;
  wall(rcx, ROOM_Z0, roomW, wallH, 0, 0, wallMat);                    // south, faces +z
  wall(rcx, ROOM_Z1, roomW, wallH, 0, Math.PI, wallMat);              // north
  wall(ROOM_X1, rcz, roomD, wallH, 0, -Math.PI / 2, wallMat);         // east
  // West wall with the corridor opening in it.
  const wz0 = ROOM_Z0, wz1 = ROOM_Z1;
  wall(ROOM_X0, (wz0 + DOOR_Z0) / 2, DOOR_Z0 - wz0, wallH, 0, Math.PI / 2, wallMat);
  wall(ROOM_X0, (DOOR_Z1 + wz1) / 2, wz1 - DOOR_Z1, wallH, 0, Math.PI / 2, wallMat);
  wall(ROOM_X0, (DOOR_Z0 + DOOR_Z1) / 2, DOOR_Z1 - DOOR_Z0, wallH - (DECK_Y + DOOR_H), DECK_Y + DOOR_H, Math.PI / 2, wallMat, false);
  // Ceiling + lights.
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomD), ceilMat);
  ceil.rotation.x = Math.PI / 2; ceil.position.set(rcx, ROOM_CEIL, rcz); root.add(ceil);
  for (const [lx, lz] of [[POOL_CX, POOL_CZ - 7], [POOL_CX, POOL_CZ + 3], [POOL_CX, POOL_CZ + 12]]) {
    const l = new THREE.PointLight(0xdff6ff, 0.7, 16, 2);
    l.position.set(lx, ROOM_CEIL - 0.6, lz); root.add(l);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 1.2), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf8ff, emissiveIntensity: 0.9 }));
    panel.position.set(lx, ROOM_CEIL - 0.04, lz); root.add(panel);
  }
  // Sign over the deep end.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshStandardMaterial({ map: signTexture('WELLNESS CENTER', 'Pool closed for maintenance  •  Skate at own risk'), emissive: 0xffffff, emissiveIntensity: 0.25 }));
  sign.material.emissiveMap = sign.material.map;
  sign.position.set(POOL_CX, DECK_Y + 3.6, ROOM_Z0 + 0.05); root.add(sign);

  // Deck dressing that is ALSO the room's street features: a lifeguard bench run as a ledge
  // on the north deck, and the diving board over the deep end as a grindable plank.
  {
    // Bench ledge: collider box + a rail on each long top edge.
    const bx = POOL_CX, bz = ROOM_Z1 - 3.0, bw = 8, bd = 0.9, bh = 0.45;
    const bench = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), new THREE.MeshStandardMaterial({ color: 0x3f6f7a, roughness: 0.6 }));
    bench.position.set(bx, DECK_Y + bh / 2, bz); bench.castShadow = bench.receiveShadow = true; root.add(bench);
    colliders.push({ position: new THREE.Vector3(bx, DECK_Y + bh / 2, bz), halfExtents: new THREE.Vector3(bw / 2, bh / 2, bd / 2), rotationY: 0 });
    for (const s of [-1, 1]) rails.push({ start: new THREE.Vector3(bx - bw / 2 + 0.3, DECK_Y + bh + 0.02, bz + s * bd / 2), end: new THREE.Vector3(bx + bw / 2 - 0.3, DECK_Y + bh + 0.02, bz + s * bd / 2) });
    // Diving board: out from the south deck over the deep end.
    const dz0 = ROOM_Z0 + 1.0, len = 4.2, dy = DECK_Y + 0.55;
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, len), new THREE.MeshStandardMaterial({ color: 0xf0f0ea, roughness: 0.5 }));
    board.position.set(POOL_CX + 2.5, dy, dz0 + len / 2); board.castShadow = true; root.add(board);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.9), steelMat);
    stand.position.set(POOL_CX + 2.5, DECK_Y + 0.275, dz0 + 0.5); root.add(stand);
    rails.push({ start: new THREE.Vector3(POOL_CX + 2.5, dy + 0.05, dz0 + 0.2), end: new THREE.Vector3(POOL_CX + 2.5, dy + 0.05, dz0 + len - 0.1) });
    // Pool ladders (visual) at the shallow end.
    for (const lx of [POOL_CX - 3, POOL_CX + 3]) {
      for (const s of [-0.3, 0.3]) {
        const rail = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 12, Math.PI), steelMat);
        rail.position.set(lx + s, DECK_Y + 0.05, POOL_CZ + POOL_AZ - 0.2); rail.rotation.y = Math.PI / 2; root.add(rail);
      }
    }
  }

  // ================================================================ THE CORRIDOR ===
  // Office carpet, office walls, a ramp up to the deck, and a view down it into a room that is
  // turquoise instead of beige. The ramp is a wedge 6 m wide rising toward +x.
  {
    const cw = DOOR_Z1 - DOOR_Z0, cz = (DOOR_Z0 + DOOR_Z1) / 2, clen = ROOM_X0 - OFFICE_EAST;
    const flat = new THREE.Mesh(new THREE.PlaneGeometry(RAMP_X0 - OFFICE_EAST + 0.05, cw), carpetMat);
    flat.rotation.x = -Math.PI / 2; flat.position.set((OFFICE_EAST + RAMP_X0) / 2, 0.01, cz); root.add(flat);
    const rlen = RAMP_X1 - RAMP_X0, slope = Math.hypot(rlen, DECK_Y);
    void slope;
    const rampTop = meshFrom([
      RAMP_X0, 0.01, DOOR_Z0, RAMP_X0, 0.01, DOOR_Z1, RAMP_X1, DECK_Y + 0.01, DOOR_Z0, RAMP_X1, DECK_Y + 0.01, DOOR_Z1,
    ], [0, 0, cw / 2, 0, 0, rlen / 2, cw / 2, rlen / 2], [0, 1, 2, 2, 1, 3], carpetMat);
    root.add(rampTop);
    // The ramp's open sides: two triangles of wall so it reads as a built ramp, not a sheet.
    for (const z of [DOOR_Z0 + 0.01, DOOR_Z1 - 0.01]) {
      root.add(meshFrom([RAMP_X0, 0, z, RAMP_X1, 0, z, RAMP_X1, DECK_Y, z], [0, 0, 1, 0, 1, 1], [0, 1, 2, 0, 2, 1], corridorWallMat));
    }
    const ramp = wedgeShell(cw, DECK_Y, rlen);
    colliders.push({
      position: new THREE.Vector3((RAMP_X0 + RAMP_X1) / 2, 0, cz), halfExtents: new THREE.Vector3(cw / 2, DECK_Y / 2, rlen / 2),
      rotationY: Math.PI / 2, trimesh: ramp,
    });
    // Handrails up both sides of the ramp: a grind that climbs.
    for (const s of [-1, 1]) {
      const z = cz + s * (cw / 2 - 0.35);
      const a = new THREE.Vector3(RAMP_X0 - 0.2, 0.85, z), b = new THREE.Vector3(RAMP_X1, DECK_Y + 0.85, z);
      const len = a.distanceTo(b);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len, 8), steelMat);
      bar.position.copy(a).add(b).multiplyScalar(0.5);
      bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      root.add(bar);
      for (let k = 0; k <= 3; k++) {
        const p = a.clone().lerp(b, k / 3);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 6), steelMat);
        post.position.set(p.x, p.y - 0.425, p.z); root.add(post);
      }
      rails.push({ start: a, end: b });
    }
    // Corridor walls (full height, collide) and ceiling.
    const ch = DECK_Y + DOOR_H;
    for (const [z, rot] of [[DOOR_Z0, 0], [DOOR_Z1, Math.PI]] as [number, number][]) {
      wall((OFFICE_EAST + ROOM_X0) / 2, z, clen, ch, 0, rot, corridorWallMat);
    }
    const cc = new THREE.Mesh(new THREE.PlaneGeometry(clen, cw), ceilMat);
    cc.rotation.x = Math.PI / 2; cc.position.set((OFFICE_EAST + ROOM_X0) / 2, ch, cz); root.add(cc);
    const cl = new THREE.PointLight(0xfff1dc, 0.9, 14, 1.8);
    cl.position.set((OFFICE_EAST + ROOM_X0) / 2, ch - 0.5, cz); root.add(cl);
    // "To the pool" sign by the office-side door.
    const s2 = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshStandardMaterial({ map: signTexture('WELLNESS →', 'Pool • Gym • Showers'), emissive: 0xffffff, emissiveIntensity: 0.3 }));
    (s2.material as THREE.MeshStandardMaterial).emissiveMap = (s2.material as THREE.MeshStandardMaterial).map;
    s2.position.set(OFFICE_EAST - 0.05, DOOR_H + 0.55, cz); s2.rotation.y = -Math.PI / 2; root.add(s2);
  }

  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.castShadow === undefined) m.castShadow = false; });
  return { root, colliders, rails, door: { z0: DOOR_Z0, z1: DOOR_Z1, height: DOOR_H }, maxX: ROOM_X1 };
}
