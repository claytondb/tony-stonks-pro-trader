/**
 * STAIRWELL DESCENT (story chapter 2) — a real downhill.
 *
 * The old level was a 52 m flat plate with a grid of handrails and a story about 50 floors.
 * This one actually goes down: eight switchback flights in a service core, each dropping
 * 2.3 m over 24 m, stacked the way a real stairwell is — so the flight you are on runs under
 * the one you just came down. Every landing has a U-bank across its end wall that turns you
 * round onto the next flight, so the whole descent is one line if you can hold it:
 *
 *        north landings (odd)          z = 12 … 19      ╭──── U-bank ────╮
 *        west lane  x -7 … -1.2   flights 0,2,4,6 go north (downhill)  │ well │  east lane x 1.2 … 7
 *        east lane                  flights 1,3,5,7 go south          │ 2.4 m│
 *        south landings (even)         z = -19 … -12    ╰──── U-bank ────╯
 *
 * Top landing (spawn) is 18.4 m up; the bottom landing is the lobby door. Down each flight:
 * a handrail on the wall and a railing over the well (both grind), and the well itself is a
 * gap — ollie the railing, drop 2.3 m onto the flight below.
 */
import * as THREE from 'three';
import { MaterialLibrary } from '../materials/MaterialLibrary';
import { LevelKit, signMat, hazardTex, type V3 } from './LevelKit';
import { pathArc, pathStraight, type CopingPt } from './WrapTransition';
import type { OfficeInterior } from './OfficeLevel';

export const STAIR = {
  XW: 7.0, WELL: 1.2, ZF: 12, ZL: 19, DY: 2.3, NF: 8,
  BANK_H: 1.3, BANK_D: 2.0, GAP: 0.6, RC: 2.6, LEG: 1.4,
} as const;
const S = STAIR;
export const STAIR_TOP = S.DY * S.NF;                    // 18.4
const landingY = (i: number) => STAIR_TOP - i * S.DY;
const landingSide = (i: number) => (i % 2 === 0 ? -1 : 1);   // -1 south, +1 north
/** Flight i: lane centre x, start z, end z, start y, end y. */
export function flight(i: number): { x0: number; x1: number; cx: number; zA: number; zB: number; yA: number; yB: number } {
  const west = i % 2 === 0;
  const x0 = west ? -S.XW : S.WELL, x1 = west ? -S.WELL : S.XW;
  const zA = west ? -S.ZF : S.ZF, zB = -zA;
  return { x0, x1, cx: (x0 + x1) / 2, zA, zB, yA: landingY(i), yB: landingY(i + 1) };
}
const flightY = (i: number, z: number) => { const f = flight(i); return f.yA + (f.yB - f.yA) * ((z - f.zA) / (f.zB - f.zA)); };

export const STAIR_SPAWN = { position: [-4.1, STAIR_TOP + 0.6, -15.5] as V3, rotationDeg: 0 };
export const STAIR_LETTERS: V3[] = [
  [flight(0).cx, flightY(0, 0) + 1.3, 0],
  [flight(1).cx, flightY(1, 4) + 1.3, 4],
  [0, landingY(1) + 2.6, 18.0],              // up the floor-49 north bank
  [-S.WELL - 0.1, flightY(4, -3) + 1.6, -3],  // on the well railing, flight 4
  [0, landingY(4) + 2.6, -18.0],             // up the floor-46 south bank
  [flight(7).cx, flightY(7, -4) + 1.3, -4],
];
/** One fire bucket per landing 1-5, on the landing over the well, where the U-bank line passes. */
export const STAIR_BUCKETS: V3[] = [1, 2, 3, 4, 5].map((i) => [0, landingY(i), landingSide(i) * 13.2] as V3);
export const STAIR_HIDDEN: V3 = [5.7, landingY(3) + 2.4, 17.6];
export const STAIR_EXIT_ZONE = { center: [0, 1.0, -17.5] as V3, radius: 3.2, height: 4 };
/** Well drops: off the west flight over the railing onto the east flight below. */
export const STAIR_GAPS = [0, 2, 4].map((i, k) => ({
  id: `well_drop_${k}`, name: k === 0 ? 'Well Drop' : `Well Drop ${k + 1}`, bonus: 900 + 300 * k,
  from: [-2.6, flightY(i, 0) + 0.8, 0] as V3, to: [3.2, flightY(i + 1, 1.5) + 0.7, 1.5] as V3, radius: 4,
})).concat([
  { id: 'landing_gap', name: 'Landing Gap', bonus: 700, from: [flight(1).cx, landingY(2) + 1.2, -10.5] as V3, to: [0, landingY(2) + 0.7, -15.5] as V3, radius: 3.5 },
]);

export function buildStairwellInterior(): OfficeInterior {
  const kit = new LevelKit('stairwell');
  const W = S.XW, L = S.ZL, TOP = STAIR_TOP;
  const concrete = MaterialLibrary.get('concreteFloor', { repeat: [1, 1], color: 0x9d9a92 });
  const slabMat = concrete.clone(); slabMat.side = THREE.DoubleSide; slabMat.flatShading = false;
  const wallMat = MaterialLibrary.get('concreteFloor', { repeat: [4, 2], color: 0xbab6aa });
  const paintMat = new THREE.MeshStandardMaterial({ color: 0x2f5f8a, roughness: 0.75 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc23b2b, metalness: 0.4, roughness: 0.45 });   // red stair rails
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf2c230, metalness: 0.3, roughness: 0.5 });
  const hazMat = new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.7 });
  const bankMat = concrete.clone(); bankMat.flatShading = false;
  const nosing = new THREE.MeshStandardMaterial({ color: 0xe0b52c, roughness: 0.6 });

  // ---- the shaft --------------------------------------------------------------------------
  const H = TOP + 4.5;
  kit.wall(wallMat, -W - 0.15, -L, -W - 0.15, L, H + 1, -1);
  kit.wall(wallMat, W + 0.15, -L, W + 0.15, L, H + 1, -1);
  kit.wall(wallMat, -W, L + 0.15, W, L + 0.15, H + 1, -1);
  kit.wall(wallMat, -W, -L - 0.15, -1.6, -L - 0.15, H + 1, -1);
  kit.wall(wallMat, 1.6, -L - 0.15, W, -L - 0.15, H + 1, -1);
  kit.wall(wallMat, -1.6, -L - 0.15, 1.6, -L - 0.15, H + 1 - 3.2, 2.2);        // over the lobby door
  // Blue dado band on every wall, all the way up (one tall strip per wall reads as paint).
  for (const [x0, z0, x1, z1, nx, nz] of [[-W, -L, -W, L, 1, 0], [W, -L, W, L, -1, 0], [-W, L, W, L, 0, -1]] as number[][]) {
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(z1 - z0, x1 - x0);
    for (let i = 0; i <= S.NF; i++) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.02), paintMat);
      band.rotation.y = -yaw; band.position.set((x0 + x1) / 2 + nx * 0.01, landingY(i) + 0.45, (z0 + z1) / 2 + nz * 0.01); kit.add(band);
    }
  }
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, 2 * L), wallMat);
  roof.rotation.x = Math.PI / 2; roof.position.set(0, H, 0); kit.addCeil(roof);
  // Bottom of the well: floor.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, 2 * L), concrete);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.002, 0); floor.receiveShadow = true; kit.add(floor);

  // ---- landings ------------------------------------------------------------------------------
  const deckTo = (zWall: number) => (p: CopingPt) => {
    const tx = p.nx > 1e-3 ? (p.x + W) / p.nx : p.nx < -1e-3 ? (W - p.x) / -p.nx : 1e9;
    const tz = Math.abs(p.nz) > 1e-3 ? Math.abs(zWall - p.z) / Math.abs(p.nz) : 1e9;
    return Math.min(tx, tz);
  };
  for (let i = 0; i <= S.NF; i++) {
    const y = landingY(i), side = landingSide(i);
    const z0 = side > 0 ? S.ZF : -L, z1 = side > 0 ? L : -S.ZF;
    if (i < S.NF) {
      kit.mesh(new THREE.BoxGeometry(2 * W, 0.3, z1 - z0), concrete, 0, y - 0.15, (z0 + z1) / 2, { cast: true });
      kit.box(0, y - 0.15, (z0 + z1) / 2, W, 0.15, (z1 - z0) / 2);
    }
    // Edge stripe where the landing meets the flight going down.
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2 * W - 0.2, 0.01, 0.15), nosing);
    stripe.position.set(0, y + 0.005, side > 0 ? S.ZF + 0.08 : -S.ZF - 0.08); kit.add(stripe);
    // The U-bank across the end wall (not on the bottom landing, which is the lobby door).
    if (i < S.NF && i > 0) {
      const zWall = side > 0 ? L : -L, zc = zWall - side * S.GAP;
      // Legs flush with the side walls (no deck strip a wall-hugger can ride up onto); the run
      // across the end wall keeps the 0.6 m gap that lets a vert air leave the coping.
      const xa = -W + 0.05, xb = W - 0.05, rc = S.RC;
      const aMid = side > 0 ? Math.PI / 2 : 1.5 * Math.PI;
      const path = [
        ...pathStraight(xa, zc - side * (rc + S.LEG), xa, zc - side * rc, 1, 0, 5),
        ...pathArc(xa + rc, zc - side * rc, rc, Math.PI, aMid, 10),
        ...pathStraight(xa + rc, zc, xb - rc, zc, 0, -side, 6, true),
        ...pathArc(xb - rc, zc - side * rc, rc, aMid, side > 0 ? 0 : 2 * Math.PI, 10),
        ...pathStraight(xb, zc - side * rc, xb, zc - side * (rc + S.LEG), -1, 0, 5, true),
      ];
      kit.bank(path, { height: S.BANK_H, depth: S.BANK_D, taperStart: 2.2, taperEnd: 2.2, deck: deckTo(zWall), y }, bankMat, yellow,
        [[xa + rc, y + S.BANK_H + 0.07, zc - side * 0.05], [xb - rc, y + S.BANK_H + 0.07, zc - side * 0.05]]);
    }
    // Floor number on the end wall, an exit sign and a light per landing.
    const zWall = side > 0 ? L - 0.17 : -L + 0.17;
    const floorNo = i === S.NF ? 'LOBBY' : `${50 - i}`;
    const num = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.75), signMat(i === S.NF ? 'LOBBY' : `FLOOR ${floorNo}`, i === 0 ? 'Roof access above' : '', '#2f5f8a'));
    num.position.set(side > 0 ? -3.6 : 3.6, y + 2.9, zWall); if (side > 0) num.rotation.y = Math.PI; kit.addLoose(num);
    kit.light(0, y + 3.4, side > 0 ? 16 : -16, i === S.NF ? 0xfff1dc : 0xe6f2ff, 0.85, 14);
  }
  // The lobby door at the bottom: bright glass under the green sign.
  {
    const door = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.15), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 1.4 }));
    door.position.set(0, 1.08, -L + 0.02); kit.addLoose(door);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.55), signMat('EXIT', 'Lobby', '#0d6b3a'));
    sign.position.set(0, 2.6, -L + 0.05); kit.addLoose(sign);
  }

  // ---- flights ---------------------------------------------------------------------------------
  for (let i = 0; i < S.NF; i++) {
    const f = flight(i);
    kit.slab(slabMat, f.x0, f.x1, f.zA, f.yA, f.zB, f.yB, 0.3);
    // Anti-slip nosing stripes every 1.2 m (visual): reads as a stair, rides as a ramp.
    const n = Math.floor(Math.abs(f.zB - f.zA) / 1.2);
    for (let k = 1; k < n; k++) {
      const z = f.zA + (f.zB - f.zA) * (k / n), y = flightY(i, z);
      const st = new THREE.Mesh(new THREE.BoxGeometry(f.x1 - f.x0 - 0.3, 0.012, 0.1), nosing);
      st.position.set(f.cx, y + 0.01, z); st.rotation.x = Math.atan2(f.yA - f.yB, Math.abs(f.zB - f.zA)) * Math.sign(f.zB - f.zA); kit.add(st);
    }
    // Railing over the well and a handrail on the wall, both grind.
    const wellX = i % 2 === 0 ? -S.WELL - 0.06 : S.WELL + 0.06;
    const wallX = i % 2 === 0 ? -W + 0.32 : W - 0.32;
    const za = f.zA + Math.sign(f.zB - f.zA) * 0.4, zb = f.zB - Math.sign(f.zB - f.zA) * 0.4;
    kit.railing(steel, wellX, za, flightY(i, za), zb, flightY(i, zb), 1.0, true, true);
    // Collided: it keeps the line off the wall, so the rider arrives at the next landing in
    // front of the bank's leg rather than riding up onto the deck strip behind its coping.
    kit.railing(steel, wallX, za, flightY(i, za), zb, flightY(i, zb), 0.9, true, true, 2.4);   // tall: nobody rides along its top
    // Hazard strip on the slab edge over the well.
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, Math.hypot(f.zB - f.zA, f.yB - f.yA)), hazMat);
    edge.position.set(i % 2 === 0 ? -S.WELL + 0.02 : S.WELL - 0.02, (f.yA + f.yB) / 2 - 0.15, 0);
    edge.rotation.x = Math.atan2(f.yA - f.yB, f.zB - f.zA) * -1; kit.add(edge);
  }
  // Pipes running down the shaft corner, and an emergency light strip at each landing.
  for (const [x, z] of [[-W + 0.35, L - 0.35], [W - 0.35, -L + 0.35]]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, H, 10), new THREE.MeshStandardMaterial({ color: 0xb02a1e, roughness: 0.5 }));
    pipe.position.set(x, H / 2, z); kit.add(pipe);
  }

  return kit.finish({ width: 2 * W, depth: 2 * L, height: H }, Math.max(W, L) + 3);
}

export function stairwellMinimapFootprints(): { x: number; z: number; w: number; d: number; rail: boolean }[] {
  const out: { x: number; z: number; w: number; d: number; rail: boolean }[] = [];
  const W = S.XW, L = S.ZL;
  out.push({ x: -W - 0.15, z: 0, w: 0.3, d: 2 * L, rail: false }, { x: W + 0.15, z: 0, w: 0.3, d: 2 * L, rail: false });
  out.push({ x: 0, z: L + 0.15, w: 2 * W, d: 0.3, rail: false }, { x: 0, z: -L - 0.15, w: 2 * W, d: 0.3, rail: false });
  out.push({ x: -S.WELL, z: 0, w: 0.15, d: 2 * S.ZF, rail: true }, { x: S.WELL, z: 0, w: 0.15, d: 2 * S.ZF, rail: true });
  out.push({ x: 0, z: L - 1.6, w: 2 * W, d: 1.6, rail: false }, { x: 0, z: -L + 1.6, w: 2 * W, d: 1.6, rail: false });
  return out;
}
