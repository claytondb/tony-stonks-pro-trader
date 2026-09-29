/**
 * WRAP TRANSITION — a quarter-pipe transition swept along a COPING PATH instead of a straight
 * line, so a ramp can turn a corner and fade out along the next wall.
 *
 * Why: a straight quarter pipe that ends a metre short of a side wall is a trap. You carve
 * along it (the most natural thing to do on a QP) and ride straight into the wall at speed.
 * Sweeping the same profile round a corner and tapering it to nothing down the side wall turns
 * that carve into a line: up the end wall, round the corner, and off down the aisle.
 *
 * The profile is the one every QP in the game uses (see transitionShell): at parameter
 * t in [0, pi/2], distance in from the coping d = D(1 - sin t), height y = H(1 - cos t).
 * Both H and D scale with a smoothstep taper at either end of the path.
 */
import * as THREE from 'three';

/** A coping point and the unit horizontal normal pointing INTO the room (down the ramp). */
export interface CopingPt { x: number; z: number; nx: number; nz: number }

export function pathStraight(x0: number, z0: number, x1: number, z1: number, nx: number, nz: number, steps: number, skipFirst = false): CopingPt[] {
  const out: CopingPt[] = [];
  for (let i = skipFirst ? 1 : 0; i <= steps; i++) {
    const u = i / steps;
    out.push({ x: x0 + (x1 - x0) * u, z: z0 + (z1 - z0) * u, nx, nz });
  }
  return out;
}

/** Arc round (cx, cz) radius r from angle a0 to a1 (radians, x = cos, z = sin); normal toward the centre. */
export function pathArc(cx: number, cz: number, r: number, a0: number, a1: number, steps: number, skipFirst = true): CopingPt[] {
  const out: CopingPt[] = [];
  for (let i = skipFirst ? 1 : 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    out.push({ x: cx + r * Math.cos(a), z: cz + r * Math.sin(a), nx: -Math.cos(a), nz: -Math.sin(a) });
  }
  return out;
}

export interface WrapOptions {
  height: number;
  depth: number;
  /** Metres over which the ramp grows from nothing at the path's start / end (0 = full size). */
  taperStart?: number;
  taperEnd?: number;
  /** How far behind the coping (along -n) the flat deck runs; 0 for no deck. */
  deck?: (p: CopingPt) => number;
  segments?: number;
  uvScale?: number;
}

export interface WrapTransition {
  geometry: THREE.BufferGeometry;
  trimesh: { vertices: Float32Array; indices: Uint32Array };
  /** Coping top points (world), for a pipe mesh or grind rails. */
  coping: THREE.Vector3[];
  /** Scale factor (0..1) at each coping point. */
  size: number[];
}

export function buildWrapTransition(path: CopingPt[], o: WrapOptions): WrapTransition {
  const SEG = o.segments ?? 12, us = o.uvScale ?? 1.2;
  const acc = [0];
  for (let i = 1; i < path.length; i++) acc.push(acc[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
  const tot = acc[acc.length - 1];
  const ss = (u: number) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
  const size = path.map((_, i) => {
    let f = 1;
    if (o.taperStart) f = Math.min(f, ss(acc[i] / o.taperStart));
    if (o.taperEnd) f = Math.min(f, ss((tot - acc[i]) / o.taperEnd));
    return Math.max(0.03, f);                 // never fully degenerate: Rapier dislikes zero-area triangles
  });
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const hasDeck = !!o.deck;
  const row = SEG + 1 + (hasDeck ? 1 : 0);
  path.forEach((p, i) => {
    const H = o.height * size[i], D = o.depth * size[i];
    for (let k = 0; k <= SEG; k++) {
      const t = (k / SEG) * Math.PI / 2;      // 0 = floor edge, pi/2 = coping
      const d = D * (1 - Math.sin(t));
      pos.push(p.x + p.nx * d, H * (1 - Math.cos(t)), p.z + p.nz * d);
      uv.push(acc[i] / us, (t * Math.max(H, 0.2)) / us);
    }
    if (hasDeck) {
      const w = o.deck!(p);
      pos.push(p.x - p.nx * w, H, p.z - p.nz * w);
      uv.push(acc[i] / us, (Math.PI / 2 * Math.max(H, 0.2) + w) / us);
    }
  });
  // Winding so the faces point up/into the room, whichever way round the path runs.
  const tx = path[1].x - path[0].x, tz = path[1].z - path[0].z;
  const flip = tx * path[0].nz - tz * path[0].nx > 0;
  for (let i = 0; i < path.length - 1; i++) for (let k = 0; k < row - 1; k++) {
    const a = i * row + k, b = a + 1, c = a + row, e = c + 1;
    if (flip) idx.push(a, c, b, b, c, e); else idx.push(a, b, c, b, e, c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // uv1 too: library materials bind an aoMap, which three samples from the second UV set.
  geometry.setAttribute('uv1', geometry.getAttribute('uv'));
  geometry.setIndex(idx); geometry.computeVertexNormals();
  return {
    geometry,
    trimesh: { vertices: new Float32Array(pos), indices: new Uint32Array(idx) },
    coping: path.map((p, i) => new THREE.Vector3(p.x, o.height * size[i] + 0.02, p.z)),
    size,
  };
}
