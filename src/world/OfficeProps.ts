/**
 * OfficeProps — the set-dressing library for the office levels.
 *
 * Everything here is authored to the same rules, derived from refs/scene-office2.png and
 * refs/scene-office3.png:
 *
 *  1. CHUNKY LOW-POLY, BUT NEVER A RAW BOX. Every silhouette-forming volume goes through
 *     `chamferBox()`, which produces a 44-triangle box with all 12 edges and 8 corners
 *     chamfered. That chamfer is what catches the key light and draws the bright edge line
 *     you see on every surface in the refs. Unbevelled `BoxGeometry` is used ONLY for parts
 *     that are too small or too occluded for the chamfer to read (drawer fronts, handles,
 *     desk legs, seams) — there it would just be wasted triangles.
 *
 *  2. FACETED SHADING FROM GEOMETRY, NOT FROM THE MATERIAL. All geometry is de-indexed with
 *     per-face normals (`finalize()`), so props render faceted even though MaterialLibrary
 *     hands out shared smooth materials. This means we never need a per-prop `flatShading`
 *     material variant, which would fragment the material cache and cost draw calls.
 *
 *  3. NO INLINE MATERIALS. Every surface comes from `MaterialLibrary.get()`. Where a prop
 *     needs a colour the library does not name (beige filing cabinet, navy lamp shade), it
 *     is expressed as a TINT over a light-albedo library surface — tinting DOWN from a light
 *     map is safe, tinting UP from a dark map (e.g. `darkPlastic`, base 0x25282c) is not and
 *     is never done here.
 *
 *  4. ONE MESH PER MATERIAL. Composite props are merged by material before being returned
 *     (`mergeGroup`), so a 60-mesh cubicle pod ships as ~12 meshes. See the note on
 *     `mergePropsByMaterial()` below — the integration agent MUST use it, or 30 pods will
 *     cost ~360 draw calls on their own.
 *
 * ---------------------------------------------------------------------------------------
 * ADDITIONS TO THE AGREED CONTRACT (all backward compatible — nothing was removed):
 *   - `PropOptions.merge?: boolean` (default true) — opt out of the internal per-material merge.
 *   - `chamferBox()` and `mergePropsByMaterial()` and `disposePropCache()` are exported.
 *     `mergePropsByMaterial()` is NOT optional for the office level: read its docstring.
 *   - Extra `userData` keys: `colliders`, `grindEdges`, `lightHints`, `mount`, `triangles`,
 *     `colliderOffset`, and (on desks) `deskSurface`.
 *   - ORIGIN EXCEPTION: `makeCeilingTileGrid`, `makeFluorescentPanel` and `makePendantLamp`
 *     have their origin at the CEILING plane and hang downward (negative Y); `makeWallClock`,
 *     `makeCorkBoard` and `makeExitSign` are centred on their mounting face and face +Z.
 *     Everything else follows the contract: centred on x/z, base at y = 0.
 *     `userData.mount` is 'floor' | 'wall' | 'ceiling' so this is queryable at runtime.
 * ---------------------------------------------------------------------------------------
 *
 * Conventions every builder honours:
 *   - centred on x/z, base at y = 0 (except the wall/ceiling props above), +Z is the front
 *   - `castShadow` on anything off the floor, `receiveShadow` on horizontal surfaces
 *   - `userData.collider = { type, size }`  (the contract)
 *   - `userData.colliders: PropCollider[]`  (additive: precise per-part boxes in local space)
 *   - `userData.grindEdges: GrindEdge[]`    (additive: where a chair can grind this prop)
 *   - `userData.lightHints: LightHint[]`    (additive: where a light belongs, if the caller wants one)
 *   - `userData.triangles: number`          (additive: measured triangle count)
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MaterialLibrary, type MaterialId, type MaterialOptions } from '../materials/MaterialLibrary';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PropOptions {
  /** Uniform scale applied to the returned root (colliders/grind edges are scaled to match). */
  scale?: number;
  /** Deterministic variation seed. Same seed ⇒ byte-identical prop. */
  seed?: number;
  /** 0 = hero detail (default), 1 = mid, 2 = far LOD. Also selects styling variants. */
  variant?: number;
  /**
   * ADDITIVE (not in the original contract): set false to keep the raw per-part mesh
   * hierarchy instead of merging by material. Only needed if you want to animate a sub-part.
   */
  merge?: boolean;
}

/** A single physics box in prop-local space (base at y=0, centred on x/z). */
export interface PropCollider {
  type: 'box';
  size: [number, number, number];
  offset: [number, number, number];
  /** Yaw in radians, applied about the collider centre. Absent ⇒ 0. */
  rotationY?: number;
}

/** A grindable edge in prop-local space. Feed straight into `grindSystem.addRail()`. */
export interface GrindEdge {
  start: [number, number, number];
  end: [number, number, number];
}

/** Where a prop wants a light, if the caller has budget for one. Props never create lights. */
export interface LightHint {
  kind: 'point';
  offset: [number, number, number];
  color: number;
  intensity: number;
  distance: number;
}

// ---------------------------------------------------------------------------
// Deterministic RNG
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Rng {
  (): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
}

function rngFrom(seed: number | undefined, salt: number): Rng {
  const base = mulberry32(((seed ?? 1) * 2654435761 + salt) >>> 0);
  const r = (() => base()) as Rng;
  r.range = (min, max) => min + base() * (max - min);
  r.int = (min, max) => Math.floor(min + base() * (max - min + 1));
  r.pick = <T,>(arr: readonly T[]) => arr[Math.floor(base() * arr.length) % arr.length];
  r.chance = (p) => base() < p;
  return r;
}

// ---------------------------------------------------------------------------
// Geometry core
// ---------------------------------------------------------------------------

const geoCache = new Map<string, THREE.BufferGeometry>();

function cached(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const hit = geoCache.get(key);
  if (hit) return hit;
  const g = build();
  geoCache.set(key, g);
  return g;
}

/**
 * De-index, give every triangle a hard face normal, guarantee a `uv` and a `uv1`.
 *
 * `uv1` matters: three r152+ samples `aoMap` from the second UV set, and several
 * MaterialLibrary surfaces ship a packed ORM with an aoMap bound. Geometry without `uv1`
 * would sample AO at a constant texel and darken the whole prop by a flat amount.
 */
function finalize(geo: THREE.BufferGeometry, smooth = false): THREE.BufferGeometry {
  let g = geo;
  if (g.index) {
    const nonIndexed = g.toNonIndexed();
    g.dispose();
    g = nonIndexed;
  }
  if (!smooth) g.computeVertexNormals();
  if (!g.getAttribute('uv')) {
    const count = g.getAttribute('position').count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  g.setAttribute('uv1', g.getAttribute('uv'));
  g.computeBoundingSphere();
  return g;
}

/**
 * Emit one convex, planar polygon as a triangle fan with a hard face normal and a planar
 * UV projection. Winding is derived, not assumed: the polygon normal is computed with
 * Newell's method and flipped if it points at the origin, which is correct for every
 * origin-centred convex hull (which is exactly what `chamferBox` builds).
 */
function addPoly(
  pos: number[],
  nor: number[],
  uvs: number[],
  pts: readonly (readonly number[])[],
  half: readonly [number, number, number],
  size: readonly [number, number, number],
  uvScale: readonly [number, number],
): void {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    nx += (p[1] - q[1]) * (p[2] + q[2]);
    ny += (p[2] - q[2]) * (p[0] + q[0]);
    nz += (p[0] - q[0]) * (p[1] + q[1]);
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;

  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const p of pts) {
    cx += p[0];
    cy += p[1];
    cz += p[2];
  }
  cx /= pts.length;
  cy /= pts.length;
  cz /= pts.length;

  let ordered = pts;
  if (nx * cx + ny * cy + nz * cz < 0) {
    ordered = pts.slice().reverse();
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }

  // Planar UV projection off the dominant normal axis.
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  let i0 = 0;
  let i1 = 1;
  if (ax >= ay && ax >= az) {
    i0 = 2;
    i1 = 1;
  } else if (ay >= ax && ay >= az) {
    i0 = 0;
    i1 = 2;
  }

  for (let t = 1; t < ordered.length - 1; t++) {
    const tri = [ordered[0], ordered[t], ordered[t + 1]];
    for (const p of tri) {
      pos.push(p[0], p[1], p[2]);
      nor.push(nx, ny, nz);
      uvs.push(
        ((p[i0] + half[i0]) / size[i0]) * uvScale[0],
        ((p[i1] + half[i1]) / size[i1]) * uvScale[1],
      );
    }
  }
}

/**
 * A box with every edge and corner chamfered: 26 faces, 44 triangles, 132 vertices.
 *
 * This is THE workhorse of the library. The chamfer is small (1–3 cm on a desk-sized part)
 * but it is the difference between "programmer art cube" and "modelled prop": it puts a
 * bright specular sliver along every edge and stops the silhouette from aliasing into a
 * hard black line.
 *
 * @param chamfer chamfer width in metres, clamped to 45% of the smallest dimension
 * @param uvScale multiplier over the per-face normalised (0..1) UVs, for elongated parts
 */
export function chamferBox(
  w: number,
  h: number,
  d: number,
  chamfer = 0.015,
  uvScale: readonly [number, number] = [1, 1],
): THREE.BufferGeometry {
  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;
  const c = Math.max(0, Math.min(chamfer, Math.min(w, h, d) * 0.45));

  if (c < 1e-4) {
    return finalize(new THREE.BoxGeometry(w, h, d));
  }

  const half: [number, number, number] = [hw, hh, hd];
  const size: [number, number, number] = [w, h, d];
  const ix = hw - c;
  const iy = hh - c;
  const iz = hd - c;

  // Three families of vertices: the one with the full extent on X, on Y, on Z.
  const X = (sx: number, sy: number, sz: number) => [sx * hw, sy * iy, sz * iz];
  const Y = (sx: number, sy: number, sz: number) => [sx * ix, sy * hh, sz * iz];
  const Z = (sx: number, sy: number, sz: number) => [sx * ix, sy * iy, sz * hd];

  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const poly = (pts: number[][]) => addPoly(pos, nor, uvs, pts, half, size, uvScale);

  const S = [-1, 1];

  // 6 main faces
  for (const s of S) {
    poly([X(s, -1, -1), X(s, 1, -1), X(s, 1, 1), X(s, -1, 1)]);
    poly([Y(-1, s, -1), Y(1, s, -1), Y(1, s, 1), Y(-1, s, 1)]);
    poly([Z(-1, -1, s), Z(1, -1, s), Z(1, 1, s), Z(-1, 1, s)]);
  }

  // 12 edge chamfers
  for (const a of S) {
    for (const b of S) {
      poly([X(a, b, -1), X(a, b, 1), Y(a, b, 1), Y(a, b, -1)]); // edges along Z
      poly([X(a, -1, b), X(a, 1, b), Z(a, 1, b), Z(a, -1, b)]); // edges along Y
      poly([Y(-1, a, b), Y(1, a, b), Z(1, a, b), Z(-1, a, b)]); // edges along X
    }
  }

  // 8 corner triangles
  for (const sx of S) {
    for (const sy of S) {
      for (const sz of S) {
        poly([X(sx, sy, sz), Y(sx, sy, sz), Z(sx, sy, sz)]);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('uv1', g.getAttribute('uv'));
  g.computeBoundingSphere();
  return g;
}

/** Cached chamfered box. 44 tris. */
function cbox(w: number, h: number, d: number, ch = 0.015, uvScale?: [number, number]): THREE.BufferGeometry {
  const k = `cb|${w}|${h}|${d}|${ch}|${uvScale?.[0] ?? 1}|${uvScale?.[1] ?? 1}`;
  return cached(k, () => chamferBox(w, h, d, ch, uvScale ?? [1, 1]));
}

/** Plain box. 12 tris. Only for parts too small for a chamfer to read. */
function sbox(w: number, h: number, d: number): THREE.BufferGeometry {
  return cached(`sb|${w}|${h}|${d}`, () => finalize(new THREE.BoxGeometry(w, h, d)));
}

/** Faceted cylinder / cone / drum. `seg*2 + caps` tris. */
function cyl(rTop: number, rBot: number, h: number, seg = 10, open = false): THREE.BufferGeometry {
  return cached(`cy|${rTop}|${rBot}|${h}|${seg}|${open}`, () =>
    finalize(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open)),
  );
}

/**
 * Open cone/cylinder turned inside out — the INSIDE is the front face.
 *
 * You cannot see the interior of an open cone by rotating it: rotation never flips winding.
 * Mirroring on X does, and `finalize()`'s `computeVertexNormals()` then derives inward
 * normals to match. This is how the pendant lamp gets a glowing interior without needing a
 * DoubleSide material (which MaterialLibrary, correctly, does not hand out).
 */
function cylInner(rTop: number, rBot: number, h: number, seg = 10): THREE.BufferGeometry {
  return cached(`ci|${rTop}|${rBot}|${h}|${seg}`, () => {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, true);
    g.scale(-1, 1, 1);
    return finalize(g);
  });
}

/** Flat disc facing +Y. `seg` tris. */
function disc(r: number, seg = 10): THREE.BufferGeometry {
  return cached(`dc|${r}|${seg}`, () => {
    const g = new THREE.CircleGeometry(r, seg);
    g.rotateX(-Math.PI / 2);
    return finalize(g);
  });
}

/** Flat quad facing +Z. 2 tris. */
function quad(w: number, h: number): THREE.BufferGeometry {
  return cached(`qd|${w}|${h}`, () => finalize(new THREE.PlaneGeometry(w, h)));
}

/** Faceted low-poly blob — foliage, crumpled paper. 20 tris at detail 0. */
function blob(r: number, detail = 0): THREE.BufferGeometry {
  return cached(`bl|${r}|${detail}`, () => finalize(new THREE.IcosahedronGeometry(r, detail)));
}

/** Low-poly torus — mug handles. `rSeg*tSeg*2` tris. */
function ring(r: number, tube: number, rSeg = 5, tSeg = 8): THREE.BufferGeometry {
  return cached(`rg|${r}|${tube}|${rSeg}|${tSeg}`, () =>
    finalize(new THREE.TorusGeometry(r, tube, rSeg, tSeg)),
  );
}

// ---------------------------------------------------------------------------
// Material shorthands
//
// Every entry is a MaterialLibrary id plus, where needed, a tint. Tints only ever go
// DOWNWARD from a light-albedo surface (`ceilingGrid`'s map is 0xdfdedb painted metal,
// `drywall`'s and `paper`'s are near-white). Tinting a dark map upward produces mud.
// ---------------------------------------------------------------------------

/** Painted sheet metal / moulded office beige — filing cabinets, printers, coolers, pedestals. */
const PAINT = (color: number, roughness = 0.5): [MaterialId, MaterialOptions] => [
  'ceilingGrid',
  { color, roughness },
];

const MAT = {
  deskTop: ['deskLaminate', undefined] as [MaterialId, MaterialOptions | undefined],
  deskFrame: ['brushedMetal', { color: 0xa9aeb5, roughness: 0.42 }] as [MaterialId, MaterialOptions],
  pedestal: PAINT(0xb4b9bf, 0.52),
  panelFabric: ['cubicleFabric', undefined] as [MaterialId, MaterialOptions | undefined],
  panelCap: ['cubicleTrim', undefined] as [MaterialId, MaterialOptions | undefined],
  plastic: ['darkPlastic', undefined] as [MaterialId, MaterialOptions | undefined],
  plasticLight: ['darkPlastic', { color: 0xb9c0c8 }] as [MaterialId, MaterialOptions],
  metal: ['brushedMetal', undefined] as [MaterialId, MaterialOptions | undefined],
  chrome: ['chrome', undefined] as [MaterialId, MaterialOptions | undefined],
  cabinetBeige: PAINT(0xd6ccb4, 0.48),
  cabinetGrey: PAINT(0xc3c7cb, 0.48),
  applianceGrey: PAINT(0xdedbd4, 0.42),
  lampShade: PAINT(0x2c3646, 0.55),
  binDark: PAINT(0x4a5059, 0.6),
  ceramic: ['whiteboard', { color: 0xf2f0ec, roughness: 0.18 }] as [MaterialId, MaterialOptions],
  paper: ['paper', undefined] as [MaterialId, MaterialOptions | undefined],
  cork: ['cardboard', { color: 0xa89070, roughness: 0.95 }] as [MaterialId, MaterialOptions],
  cardboard: ['cardboard', undefined] as [MaterialId, MaterialOptions | undefined],
  glass: ['glass', undefined] as [MaterialId, MaterialOptions | undefined],
  plant: ['plantGreen', undefined] as [MaterialId, MaterialOptions | undefined],
  pot: ['terracotta', undefined] as [MaterialId, MaterialOptions | undefined],
  wood: ['woodFloor', { color: 0x7d6042, roughness: 0.55 }] as [MaterialId, MaterialOptions],
} as const;

type MatRef = readonly [MaterialId, MaterialOptions | undefined];

function mat(ref: MatRef): THREE.MeshStandardMaterial {
  return MaterialLibrary.get(ref[0], ref[1]);
}

/** Screen tints seen in the refs: cool blue, terminal green, and a warm amber spreadsheet. */
const SCREEN_TINTS: readonly number[] = [0x6fa8d8, 0x63c07d, 0xd8a24f, 0x8fb8e8];
const STICKY_TINTS: readonly number[] = [0xffd34d, 0xff9a52, 0x7fd4f0, 0xf28fb0, 0xbfe986];

// ---------------------------------------------------------------------------
// Mesh / group plumbing
// ---------------------------------------------------------------------------

interface MeshOpts {
  cast?: boolean;
  receive?: boolean;
  pos?: [number, number, number];
  rot?: [number, number, number];
}

function mesh(geo: THREE.BufferGeometry, m: MatRef | THREE.MeshStandardMaterial, o?: MeshOpts): THREE.Mesh {
  const material = m instanceof THREE.Material ? m : mat(m as MatRef);
  const me = new THREE.Mesh(geo, material);
  me.castShadow = o?.cast ?? true;
  me.receiveShadow = o?.receive ?? true;
  if (o?.pos) me.position.set(o.pos[0], o.pos[1], o.pos[2]);
  if (o?.rot) me.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
  return me;
}

function countTriangles(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const g = m.geometry;
    const tris = g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
    const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
    n += tris * inst;
  });
  return n;
}

/**
 * Collapse a hierarchy into one mesh per material, baking local transforms into the
 * vertices. InstancedMeshes are re-parented untouched (they are already one draw call).
 */
function mergeGroup(root: THREE.Group): THREE.Group {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();

  const buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean; receive: boolean }>();
  const keep: { obj: THREE.Object3D; rel: THREE.Matrix4 }[] = [];

  root.traverse((o) => {
    if (o === root) return;
    const m = o as THREE.Mesh;
    if ((m as THREE.InstancedMesh).isInstancedMesh) {
      keep.push({ obj: o, rel: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) });
      return;
    }
    if (!m.isMesh || Array.isArray(m.material) || !m.geometry) return;
    const material = m.material as THREE.Material;
    const g = m.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    let bucket = buckets.get(material);
    if (!bucket) {
      bucket = { geos: [], cast: false, receive: false };
      buckets.set(material, bucket);
    }
    bucket.geos.push(g);
    bucket.cast = bucket.cast || m.castShadow;
    bucket.receive = bucket.receive || m.receiveShadow;
  });

  const out = new THREE.Group();
  out.name = root.name;
  out.userData = root.userData;

  for (const [material, bucket] of buckets) {
    const merged = bucket.geos.length === 1 ? bucket.geos[0] : mergeGeometries(bucket.geos, false);
    if (!merged) continue;
    if (bucket.geos.length > 1) for (const g of bucket.geos) g.dispose();
    merged.computeBoundingSphere();
    const me = new THREE.Mesh(merged, material);
    me.name = material.name || 'merged';
    me.castShadow = bucket.cast;
    me.receiveShadow = bucket.receive;
    out.add(me);
  }

  for (const k of keep) {
    k.obj.removeFromParent();
    k.rel.decompose(k.obj.position, k.obj.quaternion, k.obj.scale);
    out.add(k.obj);
  }

  return out;
}

/**
 * ADDITIVE, AND THE INTEGRATION AGENT NEEDS THIS.
 *
 * Merge a whole batch of already-placed props into one mesh per material. A single cubicle
 * pod is ~12 draw calls after its internal merge; thirty of them placed individually is
 * ~360 draw calls, which is the entire frame budget. Run every static prop in a level
 * through this once at load and the whole office costs ~15 draw calls.
 *
 * Inputs must already be positioned/rotated/scaled in world space. The returned Group sits
 * at the origin; the sources are consumed (detached from their parents).
 */
export function mergePropsByMaterial(objects: readonly THREE.Object3D[]): THREE.Group {
  const holder = new THREE.Group();
  for (const o of objects) {
    o.updateMatrixWorld(true);
    holder.add(o);
  }
  holder.updateMatrixWorld(true);
  const merged = mergeGroup(holder);
  merged.name = 'mergedProps';
  merged.userData = {};
  return merged;
}

/** Free every cached geometry. Call alongside `MaterialLibrary.disposeAll()`. */
export function disposePropCache(): void {
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
}

// ---------------------------------------------------------------------------
// Build context — collects colliders/grind edges while a prop is assembled
// ---------------------------------------------------------------------------

interface Ctx {
  root: THREE.Group;
  colliders: PropCollider[];
  grinds: GrindEdge[];
  lights: LightHint[];
  rng: Rng;
  variant: number;
}

function begin(name: string, o: PropOptions | undefined, salt: number): Ctx {
  const root = new THREE.Group();
  root.name = name;
  return {
    root,
    colliders: [],
    grinds: [],
    lights: [],
    rng: rngFrom(o?.seed, salt),
    variant: o?.variant ?? 0,
  };
}

function collide(ctx: Ctx, size: [number, number, number], offset: [number, number, number], rotationY?: number): void {
  const c: PropCollider = { type: 'box', size, offset };
  if (rotationY) c.rotationY = rotationY;
  ctx.colliders.push(c);
}

function finish(ctx: Ctx, o: PropOptions | undefined, fallback: { size: [number, number, number]; offset: [number, number, number] }): THREE.Group {
  const s = o?.scale ?? 1;
  let root = ctx.root;
  if ((o?.merge ?? true) && root.children.length > 1) root = mergeGroup(root);

  const scaleTriple = (t: [number, number, number]): [number, number, number] => [t[0] * s, t[1] * s, t[2] * s];

  const colliders = ctx.colliders.length
    ? ctx.colliders.map((c) => ({ ...c, size: scaleTriple(c.size), offset: scaleTriple(c.offset) }))
    : [{ type: 'box' as const, size: scaleTriple(fallback.size), offset: scaleTriple(fallback.offset) }];

  root.userData.collider = {
    type: fallback.size[0] > 0 ? ('box' as const) : ('none' as const),
    size: scaleTriple(fallback.size),
  };
  root.userData.colliderOffset = scaleTriple(fallback.offset);
  root.userData.colliders = colliders;
  root.userData.grindEdges = ctx.grinds.map((g) => ({
    start: scaleTriple(g.start as [number, number, number]),
    end: scaleTriple(g.end as [number, number, number]),
  }));
  root.userData.lightHints = ctx.lights.map((l) => ({ ...l, offset: scaleTriple(l.offset) }));
  root.userData.triangles = countTriangles(root);
  if (!root.userData.mount) root.userData.mount = 'floor';

  if (s !== 1) root.scale.setScalar(s);
  return root;
}

// ---------------------------------------------------------------------------
// DESK  —  L-shaped laminate top, steel frame, drawer pedestal, modesty panel
// variant 0: 288 tris · variant 1: 116 tris · variant 2: 56 tris
// ---------------------------------------------------------------------------

const DESK_TOP_Y = 0.76; // working surface height, metres. Everything desk-borne uses this.

export function makeDesk(o?: PropOptions): THREE.Group {
  const ctx = begin('desk', o, 11);
  const g = new THREE.Group();
  ctx.root.add(g);

  // Natural (uncentred) layout: main run along X, return leg at the +X end running to +Z.
  const mainW = 1.4;
  const mainD = 0.68;
  const retW = 0.62;
  const retD = 1.38;
  const retX = 1.01;
  const retZ = 0.35;
  const topT = 0.045;
  const topY = DESK_TOP_Y - topT / 2;

  const bboxMinX = -mainW / 2;
  const bboxMaxX = retX + retW / 2;
  const bboxMinZ = -mainD / 2;
  const bboxMaxZ = retZ + retD / 2;
  const cx = (bboxMinX + bboxMaxX) / 2;
  const cz = (bboxMinZ + bboxMaxZ) / 2;
  g.position.set(-cx, 0, -cz);

  const W = bboxMaxX - bboxMinX;
  const D = bboxMaxZ - bboxMinZ;

  if (ctx.variant >= 2) {
    g.add(mesh(cbox(mainW, topT, mainD, 0.01), MAT.deskTop, { pos: [0, topY, 0] }));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.add(mesh(sbox(0.05, DESK_TOP_Y - topT, 0.05), MAT.deskFrame, {
          pos: [sx * 0.63, (DESK_TOP_Y - topT) / 2, sz * 0.26],
          cast: true,
          receive: false,
        }));
      }
    }
    collide(ctx, [mainW, DESK_TOP_Y, mainD], [0 - cx, DESK_TOP_Y / 2, 0 - cz]);
    return finish(ctx, o, { size: [W, DESK_TOP_Y, D], offset: [0, DESK_TOP_Y / 2, 0] });
  }

  // --- tops -----------------------------------------------------------------
  g.add(mesh(cbox(mainW, topT, mainD, 0.012, [2, 1]), MAT.deskTop, { pos: [0, topY, 0] }));
  if (ctx.variant === 0) {
    g.add(mesh(cbox(retW, topT, retD, 0.012, [1, 2]), MAT.deskTop, { pos: [retX, topY, retZ] }));
  } else {
    g.add(mesh(sbox(retW, topT, retD), MAT.deskTop, { pos: [retX, topY, retZ] }));
  }

  // --- legs -----------------------------------------------------------------
  const legH = DESK_TOP_Y - topT;
  const legGeo = sbox(0.05, legH, 0.05);
  const legPositions: [number, number][] = [
    [-0.63, -0.26],
    [-0.63, 0.26],
    [0.63, -0.26],
    [0.63, 0.26],
    [retX - 0.24, retZ + retD / 2 - 0.08],
    [retX + 0.24, retZ + retD / 2 - 0.08],
  ];
  for (const [lx, lz] of legPositions) {
    g.add(mesh(legGeo, MAT.deskFrame, { pos: [lx, legH / 2, lz], receive: false }));
  }

  // --- modesty panel (the grey sheet the refs show under every desk front) ---
  g.add(mesh(sbox(mainW - 0.06, 0.34, 0.022), MAT.pedestal, { pos: [0, 0.50, -mainD / 2 + 0.05] }));

  // --- drawer pedestal ------------------------------------------------------
  if (ctx.variant === 0) {
    const pw = 0.4;
    const ph = 0.62;
    const pd = 0.58;
    const px = -0.42;
    const pz = 0.02;
    g.add(mesh(cbox(pw, ph, pd, 0.014), MAT.pedestal, { pos: [px, ph / 2, pz] }));
    for (let i = 0; i < 3; i++) {
      const y = 0.13 + i * 0.19;
      g.add(mesh(sbox(pw - 0.05, 0.15, 0.018), MAT.pedestal, { pos: [px, y, pz + pd / 2 + 0.004] }));
      g.add(mesh(sbox(0.15, 0.018, 0.02), MAT.chrome, { pos: [px, y + 0.05, pz + pd / 2 + 0.018] }));
    }
    collide(ctx, [pw, ph, pd], [px - cx, ph / 2, pz - cz]);
  }

  // Desk body collider: the top slab plus the volume under it (you can't ride through it).
  collide(ctx, [mainW, DESK_TOP_Y, mainD], [0 - cx, DESK_TOP_Y / 2, 0 - cz]);
  if (ctx.variant === 0) collide(ctx, [retW, DESK_TOP_Y, retD], [retX - cx, DESK_TOP_Y / 2, retZ - cz]);

  // Where you may legally put a mug. Local, post-centring, so callers never have to
  // rediscover the L-shape's offset. The user sits at +Z looking down -Z.
  ctx.root.userData.deskSurface = {
    y: DESK_TOP_Y,
    main: { minX: -mainW / 2 - cx, maxX: mainW / 2 - cx, minZ: -mainD / 2 - cz, maxZ: mainD / 2 - cz },
    return: { minX: retX - retW / 2 - cx, maxX: retX + retW / 2 - cx, minZ: retZ - retD / 2 - cz, maxZ: retZ + retD / 2 - cz },
  };

  return finish(ctx, o, { size: [W, DESK_TOP_Y, D], offset: [0, DESK_TOP_Y / 2, 0] });
}

// ---------------------------------------------------------------------------
// CUBICLE WALL  —  fabric panel, light laminate cap rail (this is the grind edge)
// variant 0: 200 tris · variant 1: 112 tris · variant 2: 44 tris
// ---------------------------------------------------------------------------

const CUBE_WALL_H = 1.32;   // fabric panel height
const CUBE_CAP_H = 0.08;    // cap rail thickness
const CUBE_WALL_T = 0.075;  // panel thickness
const CUBE_TOP = CUBE_WALL_H + CUBE_CAP_H; // 1.40 — grind height

export function makeCubicleWall(lengthMetres: number, o?: PropOptions): THREE.Group {
  const ctx = begin('cubicleWall', o, 23);
  const L = Math.max(0.3, lengthMetres);
  const uv: [number, number] = [Math.max(1, Math.round(L / 1.6)), 1];

  // Fabric panel
  ctx.root.add(
    mesh(cbox(L, CUBE_WALL_H, CUBE_WALL_T, 0.012, uv), MAT.panelFabric, {
      pos: [0, CUBE_WALL_H / 2, 0],
    }),
  );

  // Cap rail — deliberately wider than the panel so it overhangs and reads as a lip, and
  // deliberately a low-roughness laminate so the grind sparks have something to bounce off.
  ctx.root.add(
    mesh(cbox(L + 0.02, CUBE_CAP_H, CUBE_WALL_T + 0.05, 0.02, uv), MAT.panelCap, {
      pos: [0, CUBE_WALL_H + CUBE_CAP_H / 2, 0],
    }),
  );

  if (ctx.variant === 0) {
    // End posts + feet: what stops the wall reading as a floating slab.
    for (const s of [-1, 1]) {
      ctx.root.add(
        mesh(cbox(0.055, CUBE_WALL_H, CUBE_WALL_T + 0.03, 0.012), MAT.pedestal, {
          pos: [s * (L / 2 - 0.028), CUBE_WALL_H / 2, 0],
        }),
      );
      ctx.root.add(
        mesh(sbox(0.09, 0.035, 0.34), MAT.deskFrame, {
          pos: [s * (L / 2 - 0.09), 0.0175, 0],
        }),
      );
    }
  } else if (ctx.variant === 1) {
    for (const s of [-1, 1]) {
      ctx.root.add(mesh(sbox(0.055, CUBE_WALL_H, CUBE_WALL_T + 0.03), MAT.pedestal, {
        pos: [s * (L / 2 - 0.028), CUBE_WALL_H / 2, 0],
      }));
    }
  }

  ctx.grinds.push({ start: [-L / 2, CUBE_TOP, 0], end: [L / 2, CUBE_TOP, 0] });
  collide(ctx, [L, CUBE_TOP, CUBE_WALL_T + 0.05], [0, CUBE_TOP / 2, 0]);

  return finish(ctx, o, { size: [L, CUBE_TOP, CUBE_WALL_T + 0.05], offset: [0, CUBE_TOP / 2, 0] });
}

// ---------------------------------------------------------------------------
// MONITOR  —  chunky bezel, glowing screen, stalk + foot
// variant 0: 146 tris · variant 1: 102 tris · variant 2: 46 tris
// ---------------------------------------------------------------------------

export function makeMonitor(o?: PropOptions): THREE.Group {
  const ctx = begin('monitor', o, 31);
  const r = ctx.rng;

  const w = 0.52;
  const h = 0.36;
  const tilt = -0.13;
  const baseH = 0.028;
  const stalkH = 0.17;
  const screenY = baseH + stalkH + h / 2;

  const head = new THREE.Group();
  head.position.set(0, screenY, 0);
  head.rotation.x = tilt;
  ctx.root.add(head);

  // Screen tint is picked from a fixed palette and the intensity is FIXED, not randomised:
  // every randomised material parameter is a new cache entry and therefore a new draw call.
  // Four tints across the whole level is four draw calls; four tints times a random
  // intensity would be one draw call per monitor.
  const screenMat = MaterialLibrary.get('screenOn', {
    emissive: SCREEN_TINTS[r.int(0, SCREEN_TINTS.length - 1)],
  });

  if (ctx.variant >= 2) {
    head.add(mesh(sbox(w, h, 0.05), MAT.plastic));
    head.add(mesh(quad(w - 0.05, h - 0.05), screenMat, { pos: [0, 0, 0.026], cast: false }));
  } else {
    head.add(mesh(cbox(w, h, 0.045, 0.01), MAT.plastic));
    head.add(mesh(quad(w - 0.055, h - 0.055), screenMat, { pos: [0, 0, 0.024], cast: false }));
    if (ctx.variant === 0) {
      // Shallow CRT-ish rear bulge — the refs' monitors are deep, not thin panels.
      head.add(mesh(cbox(w - 0.12, h - 0.1, 0.13, 0.02), MAT.plastic, { pos: [0, -0.01, -0.086] }));
    }
  }

  // stalk + foot
  ctx.root.add(mesh(sbox(0.055, stalkH, 0.05), MAT.plastic, { pos: [0, baseH + stalkH / 2, -0.02] }));
  ctx.root.add(
    mesh(ctx.variant === 0 ? cbox(0.24, baseH, 0.17, 0.008) : sbox(0.24, baseH, 0.17), MAT.plastic, {
      pos: [0, baseH / 2, -0.01],
    }),
  );

  const totalH = baseH + stalkH + h;
  collide(ctx, [w, totalH, 0.2], [0, totalH / 2, 0]);
  return finish(ctx, o, { size: [w, totalH, 0.22], offset: [0, totalH / 2, 0] });
}

// ---------------------------------------------------------------------------
// KEYBOARD + MOUSE
// variant 0: 148 tris · variant 1+: 68 tris
// ---------------------------------------------------------------------------

export function makeKeyboardMouse(o?: PropOptions): THREE.Group {
  const ctx = begin('keyboardMouse', o, 43);

  const kw = 0.44;
  const kd = 0.15;
  const kh = 0.022;

  ctx.root.add(
    mesh(ctx.variant === 0 ? cbox(kw, kh, kd, 0.006) : sbox(kw, kh, kd), MAT.plastic, {
      pos: [0, kh / 2, 0],
      rot: [-0.05, 0, 0],
    }),
  );

  // Key field: suggested with a recessed slab plus row bars rather than 100 key boxes.
  ctx.root.add(mesh(sbox(kw - 0.03, 0.006, kd - 0.03), MAT.plasticLight, { pos: [0, kh, 0], rot: [-0.05, 0, 0] }));
  if (ctx.variant === 0) {
    for (let i = 0; i < 4; i++) {
      const z = -kd / 2 + 0.032 + i * 0.028;
      ctx.root.add(
        mesh(sbox(kw - 0.05, 0.007, 0.018), MAT.plastic, { pos: [0, kh + 0.004, z], rot: [-0.05, 0, 0], receive: false }),
      );
    }
  }

  // Mouse
  ctx.root.add(
    mesh(ctx.variant === 0 ? cbox(0.062, 0.03, 0.105, 0.014) : sbox(0.062, 0.03, 0.105), MAT.plastic, {
      pos: [kw / 2 + 0.09, 0.015, 0.01],
    }),
  );

  return finish(ctx, o, { size: [kw + 0.24, 0.05, kd], offset: [0.06, 0.025, 0] });
}

// ---------------------------------------------------------------------------
// MUG  —  ceramic body, coffee surface, handle
// 98 tris (variant 0), 50 tris (variant 1+)
// ---------------------------------------------------------------------------

const MUG_TINTS: readonly number[] = [0xf2f0ec, 0xd8574a, 0x4f79b5, 0xe8dcc0];

export function makeMug(o?: PropOptions): THREE.Group {
  const ctx = begin('mug', o, 57);
  const r = ctx.rng;
  const body = MaterialLibrary.get('whiteboard', {
    color: MUG_TINTS[r.int(0, MUG_TINTS.length - 1)],
    roughness: 0.2,
  });

  const rad = 0.042;
  const h = 0.095;
  ctx.root.add(mesh(cyl(rad, rad * 0.92, h, 10), body, { pos: [0, h / 2, 0] }));
  ctx.root.add(
    mesh(disc(rad - 0.006, 10), MaterialLibrary.get('darkPlastic', { color: 0x7a5334, roughness: 0.25 }), {
      pos: [0, h - 0.012, 0],
      cast: false,
    }),
  );
  if (ctx.variant === 0) {
    ctx.root.add(mesh(ring(0.028, 0.008, 3, 6), body, { pos: [rad + 0.014, h * 0.58, 0], rot: [0, Math.PI / 2, 0] }));
  }

  return finish(ctx, o, { size: [rad * 2.4, h, rad * 2], offset: [0, h / 2, 0] });
}

// ---------------------------------------------------------------------------
// POTTED PLANT  —  terracotta pot, soil, faceted succulent blobs
// variant 0: ~128 tris · variant 1+: ~68 tris
// ---------------------------------------------------------------------------

export function makePottedPlant(o?: PropOptions): THREE.Group {
  const ctx = begin('pottedPlant', o, 61);
  const r = ctx.rng;

  const big = ctx.variant === 0 && r.chance(0.35);
  const s = big ? 1.9 : 1.0;
  const potH = 0.13 * s;
  const potR = 0.105 * s;

  ctx.root.add(mesh(cyl(potR, potR * 0.74, potH, 8), MAT.pot, { pos: [0, potH / 2, 0] }));
  if (ctx.variant === 0) {
    ctx.root.add(mesh(cyl(potR * 1.06, potR * 1.06, 0.022 * s, 8), MAT.pot, { pos: [0, potH - 0.011 * s, 0] }));
  }
  ctx.root.add(
    mesh(disc(potR * 0.92, 8), MaterialLibrary.get('darkPlastic', { color: 0x6b5340 }), {
      pos: [0, potH - 0.03 * s, 0],
      cast: false,
    }),
  );

  const leaves = ctx.variant === 0 ? (big ? 5 : 4) : 2;
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + r.range(-0.3, 0.3);
    const rad = r.range(0.035, 0.062) * s;
    const dist = i === 0 ? 0 : r.range(0.03, 0.062) * s;
    const m = mesh(blob(rad), MAT.plant, {
      pos: [Math.cos(a) * dist, potH + r.range(0.02, 0.075) * s, Math.sin(a) * dist],
      receive: false,
    });
    m.scale.set(1, r.range(1.15, 1.7), 1);
    m.rotation.set(r.range(-0.4, 0.4), a, r.range(-0.4, 0.4));
    ctx.root.add(m);
  }

  const totalH = potH + 0.18 * s;
  return finish(ctx, o, { size: [potR * 2.2, totalH, potR * 2.2], offset: [0, totalH / 2, 0] });
}

// ---------------------------------------------------------------------------
// FILING CABINET  —  beige four-drawer, chrome pulls, label holders
// variant 0: 198 tris · variant 1: 92 tris · variant 2: 44 tris
// ---------------------------------------------------------------------------

export function makeFilingCabinet(o?: PropOptions): THREE.Group {
  const ctx = begin('filingCabinet', o, 71);
  const r = ctx.rng;

  const w = 0.46;
  const d = 0.62;
  const drawers = ctx.variant === 0 ? r.int(3, 4) : 3;
  const drawerH = 0.32;
  const h = drawers * drawerH + 0.1;

  const body = r.chance(0.55) ? MAT.cabinetBeige : MAT.cabinetGrey;
  ctx.root.add(mesh(cbox(w, h, d, 0.014), body, { pos: [0, h / 2, 0] }));

  if (ctx.variant < 2) {
    for (let i = 0; i < drawers; i++) {
      const y = 0.06 + drawerH / 2 + i * drawerH;
      ctx.root.add(mesh(sbox(w - 0.04, drawerH - 0.02, 0.016), body, { pos: [0, y, d / 2 + 0.004] }));
      ctx.root.add(mesh(sbox(0.17, 0.022, 0.024), MAT.chrome, { pos: [0, y + 0.075, d / 2 + 0.018] }));
      if (ctx.variant === 0) {
        ctx.root.add(mesh(sbox(0.11, 0.035, 0.008), MAT.paper, { pos: [0, y - 0.055, d / 2 + 0.014], cast: false }));
      }
    }
    // toe kick
    ctx.root.add(mesh(sbox(w - 0.06, 0.055, d - 0.04), MAT.pedestal, { pos: [0, 0.028, -0.01] }));
  }

  collide(ctx, [w, h, d], [0, h / 2, 0]);
  return finish(ctx, o, { size: [w, h, d], offset: [0, h / 2, 0] });
}

// ---------------------------------------------------------------------------
// CARDBOARD BOX  —  closed with tape, or open with splayed flaps
// variant 0: ~92 tris · variant 1+: 46 tris
// ---------------------------------------------------------------------------

export function makeCardboardBox(o?: PropOptions): THREE.Group {
  const ctx = begin('cardboardBox', o, 83);
  const r = ctx.rng;

  const w = r.range(0.42, 0.58);
  const d = r.range(0.38, 0.5);
  const h = r.range(0.3, 0.46);
  const open = ctx.variant === 0 && r.chance(0.45);

  ctx.root.add(mesh(cbox(w, h, d, 0.012), MAT.cardboard, { pos: [0, h / 2, 0] }));

  if (open) {
    // Four flaps folded outward — reads instantly as "someone is moving out".
    const fl = 0.19;
    const tilt = 0.95;
    ctx.root.add(mesh(sbox(w, 0.012, fl), MAT.cardboard, { pos: [0, h + 0.07, d / 2 + 0.05], rot: [-tilt, 0, 0] }));
    ctx.root.add(mesh(sbox(w, 0.012, fl), MAT.cardboard, { pos: [0, h + 0.07, -d / 2 - 0.05], rot: [tilt, 0, 0] }));
    ctx.root.add(mesh(sbox(fl, 0.012, d), MAT.cardboard, { pos: [w / 2 + 0.05, h + 0.07, 0], rot: [0, 0, tilt] }));
    ctx.root.add(mesh(sbox(fl, 0.012, d), MAT.cardboard, { pos: [-w / 2 - 0.05, h + 0.07, 0], rot: [0, 0, -tilt] }));
    ctx.root.add(mesh(quad(w - 0.06, d - 0.06), MAT.paper, { pos: [0, h - 0.01, 0], rot: [-Math.PI / 2, 0, 0], cast: false }));
  } else {
    // Packing tape down the seam.
    ctx.root.add(
      mesh(quad(0.075, d - 0.02), MaterialLibrary.get('paper', { color: 0xd9c69b, roughness: 0.4 }), {
        pos: [0, h + 0.002, 0],
        rot: [-Math.PI / 2, 0, 0],
        cast: false,
      }),
    );
  }

  collide(ctx, [w, h, d], [0, h / 2, 0]);
  return finish(ctx, o, { size: [w, h + (open ? 0.16 : 0), d], offset: [0, h / 2, 0] });
}

// ---------------------------------------------------------------------------
// WATER COOLER  —  moulded body, inverted glass jug, taps, drip tray
// variant 0: ~168 tris
// ---------------------------------------------------------------------------

export function makeWaterCooler(o?: PropOptions): THREE.Group {
  const ctx = begin('waterCooler', o, 97);

  const bw = 0.34;
  const bh = 0.98;
  const bd = 0.34;

  ctx.root.add(mesh(cbox(bw, bh, bd, 0.018), MAT.applianceGrey, { pos: [0, bh / 2, 0] }));
  // recessed dispensing alcove
  ctx.root.add(mesh(sbox(bw - 0.12, 0.24, 0.05), MAT.plastic, { pos: [0, 0.6, bd / 2 - 0.02] }));
  for (const s of [-1, 1]) {
    ctx.root.add(mesh(sbox(0.05, 0.05, 0.08), s < 0 ? MAT.plastic : MAT.plasticLight, { pos: [s * 0.07, 0.72, bd / 2 + 0.005] }));
  }
  ctx.root.add(mesh(sbox(bw - 0.1, 0.02, 0.09), MAT.chrome, { pos: [0, 0.5, bd / 2 + 0.01] }));

  if (ctx.variant < 2) {
    const jugH = 0.42;
    const water = MaterialLibrary.get('glass', { color: 0x9fd2e2, roughness: 0.06 });
    const jug = mesh(cyl(0.155, 0.105, jugH, 10), water, { pos: [0, bh + jugH / 2 - 0.04, 0], receive: false });
    jug.renderOrder = 1;
    ctx.root.add(jug);
    ctx.root.add(mesh(cyl(0.062, 0.062, 0.06, 8), water, { pos: [0, bh - 0.05, 0], receive: false }));
    ctx.root.add(mesh(cyl(0.09, 0.09, 0.03, 8), MAT.plasticLight, { pos: [0, bh + 0.005, 0] }));
  }

  const total = bh + 0.42;
  collide(ctx, [bw, bh, bd], [0, bh / 2, 0]);
  return finish(ctx, o, { size: [0.34, total, 0.34], offset: [0, total / 2, 0] });
}

// ---------------------------------------------------------------------------
// PRINTER  —  the big shared workgroup unit from the refs
// variant 0: ~160 tris
// ---------------------------------------------------------------------------

export function makePrinter(o?: PropOptions): THREE.Group {
  const ctx = begin('printer', o, 103);

  const w = 0.62;
  const h = 0.44;
  const d = 0.54;

  ctx.root.add(mesh(cbox(w, h, d, 0.016), MAT.applianceGrey, { pos: [0, h / 2, 0] }));
  ctx.root.add(mesh(cbox(w - 0.06, 0.07, d - 0.08, 0.014), MAT.plastic, { pos: [0, h + 0.035, -0.01] }));
  // output slot + a half-printed sheet
  ctx.root.add(mesh(sbox(w - 0.14, 0.03, 0.05), MAT.plastic, { pos: [0, h - 0.09, d / 2 + 0.002] }));
  ctx.root.add(mesh(quad(0.21, 0.16), MAT.paper, { pos: [0, h - 0.075, d / 2 + 0.09], rot: [-1.25, 0, 0], cast: false }));

  if (ctx.variant === 0) {
    // paper drawer + control panel with a live LCD
    ctx.root.add(mesh(sbox(w - 0.08, 0.09, 0.02), MAT.plasticLight, { pos: [0, 0.13, d / 2 + 0.006] }));
    ctx.root.add(mesh(sbox(0.2, 0.014, 0.02), MAT.chrome, { pos: [0, 0.175, d / 2 + 0.014] }));
    ctx.root.add(mesh(sbox(0.2, 0.02, 0.13), MAT.plastic, { pos: [0.16, h + 0.075, d / 2 - 0.13], rot: [-0.35, 0, 0] }));
    ctx.root.add(
      mesh(quad(0.12, 0.055), MaterialLibrary.get('screenOn', { emissive: 0x63c07d, emissiveIntensity: 1.4 }), {
        pos: [0.16, h + 0.09, d / 2 - 0.115],
        rot: [-1.92, 0, 0],
        cast: false,
      }),
    );
    // stack of paper on top
    ctx.root.add(mesh(sbox(0.21, 0.03, 0.29), MAT.paper, { pos: [-0.16, h + 0.085, 0.05], rot: [0, 0.14, 0] }));
  }

  const total = h + 0.11;
  collide(ctx, [w, total, d], [0, total / 2, 0]);
  return finish(ctx, o, { size: [w, total, d], offset: [0, total / 2, 0] });
}

// ---------------------------------------------------------------------------
// CEILING TILE GRID  —  one plane of tiles + two instanced T-bar runs
// tris: 2 + 12 * (bars). A 40×40 m ceiling is 3 draw calls, ~800 tris.
// NOTE: this is the ONLY builder whose origin is the ceiling plane itself (y = 0),
// so place it at the ceiling height. Everything else has its base at y = 0.
// ---------------------------------------------------------------------------

const TILE = 1.22; // 4-foot ceiling module, the real-world dimension

export function makeCeilingTileGrid(width: number, depth: number, o?: PropOptions): THREE.Group {
  const ctx = begin('ceilingTileGrid', o, 109);
  ctx.root.userData.mount = 'ceiling';
  const nx = Math.max(1, Math.round(width / TILE));
  const nz = Math.max(1, Math.round(depth / TILE));

  const tiles = mesh(quad(width, depth), MaterialLibrary.get('ceilingTile', { repeat: [nx, nz] }), {
    rot: [Math.PI / 2, 0, 0],
    cast: false,
  });
  tiles.position.y = -0.02;
  ctx.root.add(tiles);

  if (ctx.variant < 2) {
    const barMat = mat(['ceilingGrid', { repeat: [4, 1] }]);
    const barX = new THREE.InstancedMesh(sbox(0.04, 0.035, depth), barMat, nx + 1);
    const barZ = new THREE.InstancedMesh(sbox(width, 0.035, 0.04), barMat, nz + 1);
    barX.castShadow = false;
    barX.receiveShadow = true;
    barZ.castShadow = false;
    barZ.receiveShadow = true;

    const m = new THREE.Matrix4();
    for (let i = 0; i <= nx; i++) {
      m.makeTranslation(-width / 2 + (i * width) / nx, 0, 0);
      barX.setMatrixAt(i, m);
    }
    for (let i = 0; i <= nz; i++) {
      m.makeTranslation(0, 0, -depth / 2 + (i * depth) / nz);
      barZ.setMatrixAt(i, m);
    }
    barX.instanceMatrix.needsUpdate = true;
    barZ.instanceMatrix.needsUpdate = true;
    ctx.root.add(barX, barZ);
  }

  return finish(ctx, o, { size: [width, 0.06, depth], offset: [0, 0, 0] });
}

// ---------------------------------------------------------------------------
// FLUORESCENT PANEL  —  recessed troffer. Origin at the ceiling plane, hangs down.
// 100 tris. Emits nothing by itself: see userData.lightHints.
// ---------------------------------------------------------------------------

export function makeFluorescentPanel(o?: PropOptions): THREE.Group {
  const ctx = begin('fluorescentPanel', o, 113);
  ctx.root.userData.mount = 'ceiling';

  const w = TILE - 0.05;
  const d = TILE / 2 - 0.05;

  ctx.root.add(mesh(cbox(w, 0.1, d, 0.012), MAT.applianceGrey, { pos: [0, -0.05, 0], cast: false }));
  // The diffuser sits proud of the housing so bloom sees a clean, unoccluded emissive slab.
  ctx.root.add(
    mesh(cbox(w - 0.07, 0.035, d - 0.07, 0.01), ['fluorescentDiffuser', undefined], {
      pos: [0, -0.098, 0],
      cast: false,
      receive: false,
    }),
  );
  if (ctx.variant === 0) {
    for (const s of [-1, 1]) {
      ctx.root.add(mesh(sbox(w - 0.07, 0.012, 0.02), MAT.chrome, { pos: [0, -0.078, s * (d / 2 - 0.05)], cast: false }));
    }
  }

  ctx.lights.push({ kind: 'point', offset: [0, -0.16, 0], color: 0xffeedd, intensity: 1.6, distance: 9 });
  return finish(ctx, o, { size: [w, 0.12, d], offset: [0, -0.06, 0] });
}

// ---------------------------------------------------------------------------
// PENDANT LAMP  —  the dark navy cones over the walkways in the refs.
// Origin at the ceiling plane, hangs down by `cordLength`.
// ~110 tris
// ---------------------------------------------------------------------------

export function makePendantLamp(o?: PropOptions): THREE.Group {
  const ctx = begin('pendantLamp', o, 127);
  ctx.root.userData.mount = 'ceiling';
  const r = ctx.rng;

  const cord = ctx.variant === 0 ? r.range(0.55, 1.0) : 0.7;
  const shadeH = 0.3;
  const shadeR = 0.24;

  ctx.root.add(mesh(sbox(0.09, 0.03, 0.09), MAT.plastic, { pos: [0, -0.015, 0], cast: false }));
  ctx.root.add(mesh(cyl(0.009, 0.009, cord, 4, true), MAT.plastic, { pos: [0, -0.03 - cord / 2, 0], receive: false }));

  const topY = -0.03 - cord;
  // Outer shade
  ctx.root.add(mesh(cyl(0.055, shadeR, shadeH, 12, true), MAT.lampShade, { pos: [0, topY - shadeH / 2, 0] }));
  ctx.root.add(mesh(disc(0.055, 12), MAT.lampShade, { pos: [0, topY - 0.001, 0], cast: false }));
  // Inner reflector — warm and slightly emissive so the cone interior glows like the refs
  ctx.root.add(
    mesh(cylInner(0.05, shadeR - 0.012, shadeH - 0.02, 12), ['fluorescentDiffuser', { emissiveIntensity: 0.55 }], {
      pos: [0, topY - shadeH / 2, 0],
      cast: false,
      receive: false,
    }),
  );
  // Bulb
  ctx.root.add(
    mesh(blob(0.052), ['fluorescentDiffuser', { emissiveIntensity: 3.0 }], {
      pos: [0, topY - shadeH + 0.05, 0],
      cast: false,
      receive: false,
    }),
  );

  ctx.lights.push({ kind: 'point', offset: [0, topY - shadeH - 0.05, 0], color: 0xffdaa8, intensity: 2.2, distance: 8 });
  const total = 0.03 + cord + shadeH;
  return finish(ctx, o, { size: [shadeR * 2, total, shadeR * 2], offset: [0, -total / 2, 0] });
}

// ---------------------------------------------------------------------------
// WALL CLOCK  —  faces +Z, mount it flush to a wall. ~120 tris
// ---------------------------------------------------------------------------

export function makeWallClock(o?: PropOptions): THREE.Group {
  const ctx = begin('wallClock', o, 131);
  ctx.root.userData.mount = 'wall';
  const r = ctx.rng;

  const rad = 0.17;
  const g = new THREE.Group();
  g.rotation.x = Math.PI / 2; // build in the XZ plane, stand it up
  ctx.root.add(g);

  g.add(mesh(cyl(rad, rad, 0.05, 14), MAT.plastic, { pos: [0, -0.025, 0] }));
  g.add(mesh(disc(rad - 0.018, 14), MAT.ceramic, { pos: [0, 0.001, 0], cast: false }));

  if (ctx.variant < 2) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      g.add(
        mesh(sbox(0.016, 0.006, 0.032), MAT.plastic, {
          pos: [Math.sin(a) * (rad - 0.038), 0.006, Math.cos(a) * (rad - 0.038)],
          rot: [0, a, 0],
          cast: false,
        }),
      );
    }
    const t = r.range(0, Math.PI * 2);
    const hour = mesh(sbox(0.014, 0.006, 0.085), MAT.plastic, { pos: [0, 0.011, 0], cast: false });
    hour.rotation.y = t;
    hour.position.set(Math.sin(t) * 0.042, 0.011, Math.cos(t) * 0.042);
    g.add(hour);
    const t2 = r.range(0, Math.PI * 2);
    const min = mesh(sbox(0.011, 0.006, 0.125), MAT.plastic, { pos: [0, 0.016, 0], cast: false });
    min.rotation.y = t2;
    min.position.set(Math.sin(t2) * 0.062, 0.016, Math.cos(t2) * 0.062);
    g.add(min);
  }

  return finish(ctx, o, { size: [rad * 2, rad * 2, 0.06], offset: [0, 0, 0.03] });
}

// ---------------------------------------------------------------------------
// CORK BOARD  —  faces +Z. Frame, cork, pinned memos and sticky notes. ~120 tris
// ---------------------------------------------------------------------------

export function makeCorkBoard(o?: PropOptions): THREE.Group {
  const ctx = begin('corkBoard', o, 137);
  ctx.root.userData.mount = 'wall';
  const r = ctx.rng;

  const w = 1.15;
  const h = 0.85;

  ctx.root.add(mesh(cbox(w, h, 0.05, 0.012), MAT.wood, { pos: [0, 0, 0] }));
  ctx.root.add(mesh(sbox(w - 0.09, h - 0.09, 0.02), MAT.cork, { pos: [0, 0, 0.021], cast: false }));

  if (ctx.variant < 2) {
    const sheets = ctx.variant === 0 ? 7 : 3;
    for (let i = 0; i < sheets; i++) {
      const sticky = r.chance(0.45);
      const sw = sticky ? r.range(0.09, 0.12) : r.range(0.13, 0.18);
      const sh = sticky ? sw : sw * 1.35;
      const m = sticky
        ? MaterialLibrary.get('paper', { color: STICKY_TINTS[r.int(0, STICKY_TINTS.length - 1)] })
        : mat(MAT.paper);
      ctx.root.add(
        mesh(quad(sw, sh), m, {
          pos: [r.range(-w / 2 + 0.14, w / 2 - 0.14), r.range(-h / 2 + 0.14, h / 2 - 0.14), 0.033],
          rot: [0, 0, r.range(-0.14, 0.14)],
          cast: false,
        }),
      );
    }
  }

  return finish(ctx, o, { size: [w, h, 0.06], offset: [0, 0, 0.03] });
}

// ---------------------------------------------------------------------------
// EXIT SIGN  —  double-sided emissive green. Ceiling- or wall-mounted. ~62 tris
// ---------------------------------------------------------------------------

export function makeExitSign(o?: PropOptions): THREE.Group {
  const ctx = begin('exitSign', o, 149);
  ctx.root.userData.mount = 'wall';

  const w = 0.42;
  const h = 0.2;
  const face = MaterialLibrary.get('fluorescentDiffuser', {
    color: 0x0e2a18,
    emissive: 0x35e07a,
    emissiveIntensity: 2.6,
  });

  ctx.root.add(mesh(cbox(w, h, 0.07, 0.012), MAT.plastic, { pos: [0, 0, 0], cast: false }));
  for (const s of [-1, 1]) {
    ctx.root.add(
      mesh(quad(w - 0.06, h - 0.05), face, {
        pos: [0, 0, s * 0.037],
        rot: [0, s > 0 ? 0 : Math.PI, 0],
        cast: false,
        receive: false,
      }),
    );
  }
  if (ctx.variant === 0) {
    ctx.root.add(mesh(sbox(0.05, 0.1, 0.03), MAT.chrome, { pos: [0, h / 2 + 0.05, 0], cast: false }));
  }

  ctx.lights.push({ kind: 'point', offset: [0, -0.06, 0], color: 0x35e07a, intensity: 0.8, distance: 4 });
  return finish(ctx, o, { size: [w, h, 0.08], offset: [0, 0, 0] });
}

// ---------------------------------------------------------------------------
// TRASH CAN  —  tapered bin, rim, crumpled paper. ~92 tris
// ---------------------------------------------------------------------------

export function makeTrashCan(o?: PropOptions): THREE.Group {
  const ctx = begin('trashCan', o, 151);
  const r = ctx.rng;

  const h = 0.4;
  ctx.root.add(mesh(cyl(0.155, 0.115, h, 10, true), MAT.binDark, { pos: [0, h / 2, 0] }));
  ctx.root.add(mesh(disc(0.115, 10), MAT.binDark, { pos: [0, 0.004, 0], cast: false }));
  ctx.root.add(mesh(cyl(0.165, 0.165, 0.035, 10), MAT.binDark, { pos: [0, h - 0.017, 0] }));

  if (ctx.variant === 0) {
    for (let i = 0; i < 2; i++) {
      const m = mesh(blob(r.range(0.045, 0.065)), MAT.paper, {
        pos: [r.range(-0.05, 0.05), h - r.range(0.03, 0.09), r.range(-0.05, 0.05)],
        receive: false,
      });
      m.rotation.set(r.range(0, 3), r.range(0, 3), r.range(0, 3));
      ctx.root.add(m);
    }
  }

  collide(ctx, [0.32, h, 0.32], [0, h / 2, 0]);
  return finish(ctx, o, { size: [0.33, h, 0.33], offset: [0, h / 2, 0] });
}

// ---------------------------------------------------------------------------
// SCATTER PAPER  —  a single InstancedMesh of A4 quads. 2 tris each, 1 draw call.
// Returns an InstancedMesh (an Object3D), per the contract.
// ---------------------------------------------------------------------------

export function makeScatterPaper(count: number, areaX: number, areaZ: number, o?: PropOptions): THREE.Object3D {
  const r = rngFrom(o?.seed, 163);
  const n = Math.max(0, Math.floor(count));
  const s = o?.scale ?? 1;

  const geo = quad(0.21, 0.297);
  const im = new THREE.InstancedMesh(geo, mat(MAT.paper), Math.max(1, n));
  im.name = 'scatterPaper';
  im.castShadow = false;   // a sheet of paper on the floor casts nothing worth a shadow texel
  im.receiveShadow = true;
  im.frustumCulled = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    // Mostly flat on the floor, with a couple of degrees of curl so they don't read as decals.
    //
    // ORDER MATTERS. three's default 'XYZ' Euler composes as RX·RY·RZ, so the LAST angle is
    // applied to the vector FIRST. The in-plane spin therefore has to go in Z (spin the quad
    // in its own plane) and the lay-flat in X. Putting the spin in Y stands every sheet on
    // its edge — which is exactly what the first version of this function did.
    e.set(-Math.PI / 2 + r.range(-0.07, 0.07), r.range(-0.07, 0.07), r.range(0, Math.PI * 2), 'XYZ');
    q.setFromEuler(e);
    p.set(r.range(-areaX / 2, areaX / 2), 0.004 + r.range(0, 0.006), r.range(-areaZ / 2, areaZ / 2));
    sc.setScalar(r.range(0.85, 1.15) * s);
    m.compose(p, q, sc);
    im.setMatrixAt(i, m);
  }
  if (n === 0) im.count = 0;
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();

  im.userData.collider = { type: 'none', size: [0, 0, 0] };
  im.userData.triangles = 2 * n;
  return im;
}

// ---------------------------------------------------------------------------
// PHONE  —  small but it is the detail that sells a desk. ~80 tris
// (internal: shipped as part of the pod rather than as its own contract entry)
// ---------------------------------------------------------------------------

function makeDeskPhone(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(cbox(0.19, 0.045, 0.21, 0.01), MAT.plastic, { pos: [0, 0.022, 0], rot: [-0.12, 0, 0] }));
  g.add(mesh(sbox(0.055, 0.04, 0.2), MAT.plastic, { pos: [-0.08, 0.062, 0] }));
  g.add(mesh(sbox(0.05, 0.032, 0.062), MAT.plastic, { pos: [-0.08, 0.088, 0.07] }));
  g.add(mesh(sbox(0.05, 0.032, 0.062), MAT.plastic, { pos: [-0.08, 0.088, -0.07] }));
  g.add(mesh(sbox(0.09, 0.006, 0.075), MAT.plasticLight, { pos: [0.035, 0.048, 0.02], cast: false }));
  return g;
}

// ---------------------------------------------------------------------------
// CUBICLE POD  —  THE HERO PROP. Four workstations, back-to-back around a cross of
// panels, with a perimeter wall on two sides. 4.4 × 4.4 m footprint, grind edges on
// every panel top at y = 1.40.
//
// variant 0: ~2870 tris, ~12 draw calls after the internal merge
// variant 1: ~1350 tris
// variant 2: ~420 tris (far LOD)
// ---------------------------------------------------------------------------

const POD_HALF = 2.2;

export function makeCubiclePod(o?: PropOptions): THREE.Group {
  const ctx = begin('cubiclePod', o, 173);
  const r = ctx.rng;
  const v = ctx.variant;
  const seed = o?.seed ?? 1;

  // --- panels ---------------------------------------------------------------
  // A cross (spine + divider) plus two perimeter runs, leaving the ±X sides open as aisles.
  const wallVariant = 2; // in-pod walls skip the end posts and feet: they are fully occluded
  const wallSpecs: { len: number; pos: [number, number, number]; rotY: number }[] = [
    { len: POD_HALF * 2, pos: [0, 0, 0], rotY: 0 },                     // spine, desks back onto it
    { len: POD_HALF * 2, pos: [0, 0, 0], rotY: Math.PI / 2 },           // divider
    { len: POD_HALF * 2, pos: [0, 0, POD_HALF], rotY: 0 },              // perimeter +Z
    { len: POD_HALF * 2, pos: [0, 0, -POD_HALF], rotY: 0 },             // perimeter -Z
    // Side returns with an 0.8 m doorway in the middle of each: this is what turns four
    // desks in a field into four CUBICLES, and it doubles the number of grind lines.
    { len: 1.8, pos: [POD_HALF, 0, 1.3], rotY: Math.PI / 2 },
    { len: 1.8, pos: [POD_HALF, 0, -1.3], rotY: Math.PI / 2 },
    { len: 1.8, pos: [-POD_HALF, 0, 1.3], rotY: Math.PI / 2 },
    { len: 1.8, pos: [-POD_HALF, 0, -1.3], rotY: Math.PI / 2 },
  ];
  if (v >= 2) wallSpecs.length = 4; // far LOD keeps the cross and the perimeter only

  for (const w of wallSpecs) {
    const wall = makeCubicleWall(w.len, { variant: wallVariant, seed, merge: false });
    wall.position.set(w.pos[0], w.pos[1], w.pos[2]);
    wall.rotation.y = w.rotY;
    ctx.root.add(wall);

    const c = Math.cos(w.rotY);
    const s = Math.sin(w.rotY);
    const hx = (w.len / 2) * c;
    const hz = -(w.len / 2) * s;
    ctx.grinds.push({
      start: [w.pos[0] - hx, CUBE_TOP, w.pos[2] - hz],
      end: [w.pos[0] + hx, CUBE_TOP, w.pos[2] + hz],
    });
    collide(
      ctx,
      [w.len, CUBE_TOP, CUBE_WALL_T + 0.05],
      [w.pos[0], CUBE_TOP / 2, w.pos[2]],
      w.rotY || undefined,
    );
  }

  if (v >= 2) {
    // Far LOD: panels plus four desk-sized slabs and four monitor blocks. Silhouette only.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        ctx.root.add(mesh(sbox(1.9, 0.05, 1.3), MAT.deskTop, { pos: [sx * 1.1, DESK_TOP_Y, sz * 1.05] }));
        ctx.root.add(mesh(sbox(0.5, 0.34, 0.16), MAT.plastic, { pos: [sx * 1.1, DESK_TOP_Y + 0.2, sz * 0.55] }));
      }
    }
    return finish(ctx, o, { size: [POD_HALF * 2, CUBE_TOP, POD_HALF * 2], offset: [0, CUBE_TOP / 2, 0] });
  }

  // --- four workstations ----------------------------------------------------
  // Desk local frame: user sits at +Z, monitors at -Z against the spine wall.
  // Desk local frame after centring: main run spans x[-1.01..0.39], z[-0.69..-0.01]; the
  // return wraps to x[0.39..1.01], z[-0.69..0.69]. Back edge z = -0.69, so a station at
  // |z| = 0.75 parks the desk 6 cm off the spine panel.
  const stations: { pos: [number, number, number]; rotY: number }[] = [
    { pos: [-1.08, 0, 0.75], rotY: 0 },
    { pos: [1.08, 0, 0.75], rotY: 0 },
    { pos: [-1.08, 0, -0.75], rotY: Math.PI },
    { pos: [1.08, 0, -0.75], rotY: Math.PI },
  ];

  const deskVariant = v === 0 ? 0 : 1;
  const monitorVariant = v === 0 ? 1 : 2;

  // Hard caps, not just probabilities: the pod is instanced ~30 times and the triangle
  // budget has to hold for the WORST seed, not the average one.
  let mugs = 0;
  let plants = 0;
  let phones = 0;

  stations.forEach((st, i) => {
    const station = new THREE.Group();
    station.position.set(st.pos[0], st.pos[1], st.pos[2]);
    station.rotation.y = st.rotY;
    ctx.root.add(station);

    const desk = makeDesk({ variant: deskVariant, seed: seed + i, merge: false });
    station.add(desk);
    for (const c of desk.userData.colliders as PropCollider[]) {
      const cs = Math.cos(st.rotY);
      const sn = Math.sin(st.rotY);
      collide(
        ctx,
        c.size,
        [
          st.pos[0] + c.offset[0] * cs + c.offset[2] * sn,
          c.offset[1],
          st.pos[2] - c.offset[0] * sn + c.offset[2] * cs,
        ],
        st.rotY || undefined,
      );
    }

    // monitor at the back of the main run, facing the user at +Z
    const monitor = makeMonitor({ variant: monitorVariant, seed: seed * 7 + i, merge: false });
    monitor.position.set(-0.31 + r.range(-0.14, 0.14), DESK_TOP_Y, -0.5);
    monitor.rotation.y = r.range(-0.2, 0.2);
    station.add(monitor);

    const kbd = makeKeyboardMouse({ variant: 1, seed: seed * 11 + i, merge: false });
    kbd.position.set(-0.34, DESK_TOP_Y, -0.22);
    kbd.rotation.y = r.range(-0.1, 0.1);
    station.add(kbd);

    if (v === 0) {
      if (mugs < 2 && r.chance(0.75)) {
        mugs++;
        const mug = makeMug({ seed: seed * 13 + i, merge: false });
        mug.position.set(r.range(0.05, 0.28), DESK_TOP_Y, r.range(-0.5, -0.2));
        station.add(mug);
      }
      if (plants < 2 && r.chance(0.7)) {
        plants++;
        const plant = makePottedPlant({ variant: 1, seed: seed * 17 + i, merge: false });
        plant.position.set(r.range(0.55, 0.85), DESK_TOP_Y, r.range(0.05, 0.5));
        station.add(plant);
      }
      if (phones < 2 && r.chance(0.6)) {
        phones++;
        const phone = makeDeskPhone();
        phone.position.set(-0.86, DESK_TOP_Y, -0.42);
        phone.rotation.y = r.range(0.1, 0.5);
        station.add(phone);
      }
      // Loose paperwork. Spin in Z (in-plane) and lay flat in X — see makeScatterPaper.
      const sheets = r.int(1, 3);
      for (let s = 0; s < sheets; s++) {
        station.add(
          mesh(quad(0.21, 0.297), MAT.paper, {
            pos: [r.range(-0.9, -0.55), DESK_TOP_Y + 0.002 + s * 0.0015, r.range(-0.5, -0.12)],
            rot: [-Math.PI / 2, 0, r.range(0, Math.PI)],
            cast: false,
          }),
        );
      }
    }
  });

  if (v === 0) {
    // Pod-edge clutter: a box someone never unpacked, and a bin.
    if (r.chance(0.6)) {
      const box = makeCardboardBox({ variant: 1, seed: seed * 19, merge: false });
      box.position.set(r.range(-1.6, 1.6), 0, POD_HALF - 0.45);
      box.rotation.y = r.range(0, Math.PI);
      ctx.root.add(box);
    }
    if (r.chance(0.6)) {
      // In the aisle behind a desk, never under one.
      const bin = makeTrashCan({ variant: 1, seed: seed * 23, merge: false });
      bin.position.set(r.range(1.5, 2.0) * (r.chance(0.5) ? 1 : -1), 0, r.range(1.6, 2.0) * (r.chance(0.5) ? 1 : -1));
      ctx.root.add(bin);
    }
  }

  return finish(ctx, o, { size: [POD_HALF * 2, CUBE_TOP, POD_HALF * 2], offset: [0, CUBE_TOP / 2, 0] });
}
