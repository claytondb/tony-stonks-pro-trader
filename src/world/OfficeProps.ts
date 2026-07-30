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
  /**
   * ADDITIVE: force this prop onto a saturated accent body colour instead of office beige.
   * Used at roughly 1-in-6 density along the skate line so every frame carries one high-chroma
   * note, which is what the refs have and the neutral-only build did not.
   */
  accent?: boolean;
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
  /**
   * THE GRIND SURFACE — the primary skate line in the level. Left on the library default on
   * purpose: `cubicleTrim` binds a dedicated `grindCap` surface whose map already carries the
   * caster-polished stripe down the centre of V, at roughness ~0.14 against ~0.52 shoulders.
   * Authoring that stripe as geometry here as well would double it and fight the UVs.
   */
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
  /**
   * Ramp deck. Office laminate, not floorboard: the ramps in this game are improvised out of
   * office furniture, and — more practically — ExtrudeGeometry emits UVs in METRES, so the
   * library's woodFloor plank map tiled across a 3 m wedge as a saturated orange
   * chequerboard. deskLaminate at ~one tile per 2 m gives a fine warm grain that holds up at
   * the distance the player actually looks at a kicker from.
   */
  plywood: ['deskLaminate', { color: 0xd8c49a, roughness: 0.52, repeat: [0.55, 0.42] }] as [MaterialId, MaterialOptions],
  /**
   * Rail steel. POWDER-COATED, not bare metal: a metalness-1 shaft in a dim interior has
   * nothing but a dark IBL to reflect, so bare-metal rails render as black bars. The polished
   * caster strip on top is the only true metal on the prop, and it is the brighter for it.
   */
  railSteel: PAINT(0xc6ccd2, 0.34),

  // ---- SATURATED ACCENT FAMILY ---------------------------------------------
  // The refs get their production value from a handful of high-chroma notes against the
  // neutral office (navy uniforms, red tie, orange sparks, gold coins). The greige office
  // supplies the neutral; these supply the note. Used sparsely and on purpose — roughly one
  // accent object every 8 m of skate line — never as a field colour.
  accentRed: PAINT(0xc0392b, 0.40),
  accentOrange: PAINT(0xe8722a, 0.46),
  accentTeal: PAINT(0x2f6f7d, 0.48),
  accentNavy: PAINT(0x2a3c68, 0.50),
  accentYellow: PAINT(0xe7b428, 0.44),
} as const;

/** Accent tints applied to the odd filing cabinet / bin / box so the aisle has colour rhythm. */
const ACCENT_BODIES: readonly MatRef[] = [
  MAT.accentRed,
  MAT.accentOrange,
  MAT.accentTeal,
  MAT.accentNavy,
];

/**
 * Per-POD fabric variation (never per panel — a pod is a unit, and mixing panel colours
 * inside one pod reads as an error rather than as variety).
 *
 * These are TINTS OVER AN ALREADY-COOL MAP: MaterialLibrary's cubicleFabric surface is
 * authored as a genuine blue-slate weave, so the job here is to vary VALUE and WARMTH, not to
 * add more blue. Tinting cool over cool is what turns a slate office into a denim one.
 */
export const POD_FABRIC_TINTS: readonly number[] = [
  0xafaeac, // the house slate — matches the library default exactly
  0xafaeac,
  0xafaeac,
  0x8e8d8b, // a darker, older run
  0x9fb3a6, // the green-grey panels somebody ordered by mistake in 1998
  0xc3ab8e, // the warm beige run — the value break that stops the field reading as one wall
];

type MatRef = readonly [MaterialId, MaterialOptions | undefined];

function mat(ref: MatRef): THREE.MeshStandardMaterial {
  return MaterialLibrary.get(ref[0], ref[1]);
}

/** Screen tints seen in the refs: cool blue, terminal green, and a warm amber spreadsheet. */
const SCREEN_TINTS: readonly number[] = [0x4f9ee8, 0x3fcf78, 0xf0a02a, 0x54c6d8];
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

const CUBE_WALL_H = 1.32;   // default fabric panel height
const CUBE_CAP_H = 0.08;    // cap rail thickness
const CUBE_WALL_T = 0.075;  // panel thickness
export const CUBE_TOP = CUBE_WALL_H + CUBE_CAP_H; // 1.40 — default grind height

/** The three panel heights a real office floorplate mixes. Varying these is what stops the
 *  cubicle field reading as a machine-regular lattice from the establishing shot. */
export const PANEL_HEIGHTS: readonly number[] = [1.02, 1.32, 1.32, 1.60];

export interface CubicleWallOptions extends PropOptions {
  /** Fabric panel height. Grind edge lands at height + CUBE_CAP_H. */
  height?: number;
  /** Per-pod fabric tint (see POD_FABRIC_TINTS). Applied to the fabric only, never the cap. */
  fabricTint?: number;
}

export function makeCubicleWall(lengthMetres: number, o?: CubicleWallOptions): THREE.Group {
  const ctx = begin('cubicleWall', o, 23);
  const L = Math.max(0.3, lengthMetres);
  const uv: [number, number] = [Math.max(1, Math.round(L / 1.6)), 1];
  const wallH = o?.height ?? CUBE_WALL_H;
  const top = wallH + CUBE_CAP_H;
  const fabric: MatRef = o?.fabricTint ? ['cubicleFabric', { color: o.fabricTint }] : MAT.panelFabric;

  // Fabric panel
  ctx.root.add(
    mesh(cbox(L, wallH, CUBE_WALL_T, 0.012, uv), fabric, {
      pos: [0, wallH / 2, 0],
    }),
  );

  // Cap rail — deliberately wider than the panel so it overhangs and reads as a lip, and
  // deliberately a low-roughness laminate so the grind sparks have something to bounce off.
  ctx.root.add(
    mesh(cbox(L + 0.02, CUBE_CAP_H, CUBE_WALL_T + 0.05, 0.02, uv), MAT.panelCap, {
      pos: [0, wallH + CUBE_CAP_H / 2, 0],
    }),
  );

  if (ctx.variant === 0) {
    // End posts + feet: what stops the wall reading as a floating slab.
    for (const s of [-1, 1]) {
      ctx.root.add(
        mesh(cbox(0.055, wallH, CUBE_WALL_T + 0.03, 0.012), MAT.pedestal, {
          pos: [s * (L / 2 - 0.028), wallH / 2, 0],
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
      ctx.root.add(mesh(sbox(0.055, wallH, CUBE_WALL_T + 0.03), MAT.pedestal, {
        pos: [s * (L / 2 - 0.028), wallH / 2, 0],
      }));
    }
  }

  ctx.grinds.push({ start: [-L / 2, top, 0], end: [L / 2, top, 0] });
  collide(ctx, [L, top, CUBE_WALL_T + 0.05], [0, top / 2, 0]);

  return finish(ctx, o, { size: [L, top, CUBE_WALL_T + 0.05], offset: [0, top / 2, 0] });
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

  const body: MatRef = o?.accent
    ? ACCENT_BODIES[r.int(0, ACCENT_BODIES.length - 1)]
    : r.chance(0.55)
      ? MAT.cabinetBeige
      : MAT.cabinetGrey;
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
    // MAIN RUNNERS ONLY, on a 2-tile pitch.
    //
    // A 4 cm bar on every 1.22 m module converges into sub-pixel 1 px dark lines toward the
    // vanishing point and shimmers — that moire was the single worst aliasing artifact in the
    // gameplay camera. The cross-tee pattern belongs in the ceilingTile map (which carries it);
    // what needs to exist as geometry is the primary runner grid, which is half as dense and
    // deep enough to hold a shaded face. Halving the count also halves the instance cost.
    const step = 2;
    const barsX = Math.floor(nx / step);
    const barsZ = Math.floor(nz / step);
    const barMat = mat(['ceilingGrid', { repeat: [4, 1] }]);
    const barX = new THREE.InstancedMesh(sbox(0.055, 0.05, depth), barMat, barsX + 1);
    const barZ = new THREE.InstancedMesh(sbox(width, 0.05, 0.055), barMat, barsZ + 1);
    barX.castShadow = false;
    barX.receiveShadow = true;
    barZ.castShadow = false;
    barZ.receiveShadow = true;

    const m = new THREE.Matrix4();
    for (let i = 0; i <= barsX; i++) {
      m.makeTranslation(-width / 2 + (i * width) / barsX, 0, 0);
      barX.setMatrixAt(i, m);
    }
    for (let i = 0; i <= barsZ; i++) {
      m.makeTranslation(0, 0, -depth / 2 + (i * depth) / barsZ);
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
  // Bulb.
  //
  // This used to be emissiveIntensity 3.0 sitting at the open bottom rim of the shade, which
  // put a single unclamped white blob at a completely different exposure to every other
  // fixture in the room and gave it a huge bloom skirt in any wide shot. It is now (a) dimmer
  // than the reflector cone it sits in and (b) recessed well up inside the shade, so it only
  // reads from directly underneath — which is the only place a bulb in a shade should read.
  ctx.root.add(
    mesh(blob(0.046), ['fluorescentDiffuser', { emissiveIntensity: 0.9 }], {
      pos: [0, topY - shadeH * 0.52, 0],
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
  const shell: MatRef = o?.accent ? MAT.accentTeal : MAT.binDark;
  ctx.root.add(mesh(cyl(0.155, 0.115, h, 10, true), shell, { pos: [0, h / 2, 0] }));
  ctx.root.add(mesh(disc(0.115, 10), shell, { pos: [0, 0.004, 0], cast: false }));
  ctx.root.add(mesh(cyl(0.165, 0.165, 0.035, 10), shell, { pos: [0, h - 0.017, 0] }));

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

export interface ScatterPaperOptions extends PropOptions {
  /**
   * Cluster seeds in world space. Paper does not fall uniformly across a 50 m floorplate —
   * it piles where it was dropped: at the base of a cubicle run, at an aisle corner, at the
   * foot of a ramp. Supply seeds and the sheets are drawn in a 1.2 m disc around each.
   * Omit and the old uniform scatter is used (kept for other levels).
   */
  clusters?: readonly { x: number; z: number; radius?: number }[];
}

/**
 * A single sheet of A4 with a shallow S-bend baked into it.
 *
 * A flat 2-triangle quad lit by a near-vertical key is a constant-value white rectangle with
 * no contact shadow — which is exactly why 220 of them read as broken projected light decals
 * rather than as paperwork. The bend gives every sheet two tonal values and a lifted corner
 * that catches the key differently, and the geometry is thick enough in Z to throw a real
 * contact shadow.
 */
function paperSheet(): THREE.BufferGeometry {
  return cached('paperSheet', () => {
    const g = new THREE.PlaneGeometry(0.21, 0.297, 3, 3);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // ±8 mm of curl: one axis sine, the other a lifted-corner tilt.
      pos.setZ(i, Math.sin((y / 0.297) * Math.PI * 1.15) * 0.008 + (x / 0.21) * (y / 0.297) * 0.010);
    }
    pos.needsUpdate = true;
    return finalize(g, true);
  });
}

export function makeScatterPaper(
  count: number,
  areaX: number,
  areaZ: number,
  o?: ScatterPaperOptions,
): THREE.Object3D {
  const r = rngFrom(o?.seed, 163);
  const n = Math.max(0, Math.floor(count));
  const s = o?.scale ?? 1;
  const clusters = o?.clusters ?? [];

  const geo = paperSheet();
  // Tinted DOWN from the library's near-white. A sheet of copier paper on a mid-brown carpet
  // under a 3.6-intensity key clips to 255 white and out-reads the ceiling troffers; this
  // lands it a stop and a half below the cap rails, which is where paper belongs.
  const paperMat = MaterialLibrary.get('paper', { color: 0xc7c1b1, roughness: 0.95 });
  const im = new THREE.InstancedMesh(geo, paperMat, Math.max(1, n));
  im.name = 'scatterPaper';
  // A sheet with a visible contact shadow stops reading as a decal. This is the single
  // cheapest fix for the loudest artifact in the gameplay camera.
  im.castShadow = true;
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
    e.set(-Math.PI / 2 + r.range(-0.10, 0.10), r.range(-0.10, 0.10), r.range(0, Math.PI * 2), 'XYZ');
    q.setFromEuler(e);

    if (clusters.length) {
      const c = clusters[i % clusters.length];
      const rad = (c.radius ?? 1.2) * Math.sqrt(r());
      const a = r.range(0, Math.PI * 2);
      p.set(c.x + Math.cos(a) * rad, 0.005 + r.range(0, 0.008), c.z + Math.sin(a) * rad);
    } else {
      p.set(r.range(-areaX / 2, areaX / 2), 0.005 + r.range(0, 0.008), r.range(-areaZ / 2, areaZ / 2));
    }

    sc.setScalar(r.range(0.85, 1.15) * s);
    m.compose(p, q, sc);
    im.setMatrixAt(i, m);
  }
  if (n === 0) im.count = 0;
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();

  im.userData.collider = { type: 'none', size: [0, 0, 0] };
  im.userData.triangles = 18 * n;
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

export interface CubiclePodOptions extends PropOptions {
  /** Fabric panel height for THIS pod. Mixing these across the floorplate is what gives the
   *  cubicle field a skyline instead of a machine-regular lattice. Default 1.32. */
  panelHeight?: number;
  /** Per-pod cool-slate / teal / rust tint. See POD_FABRIC_TINTS. */
  fabricTint?: number;
  /** This pod has been cleared out: panels and boxes, no desks. ~1-in-20 in the real world. */
  cleared?: boolean;
}

export function makeCubiclePod(o?: CubiclePodOptions): THREE.Group {
  const ctx = begin('cubiclePod', o, 173);
  const r = ctx.rng;
  const v = ctx.variant;
  const seed = o?.seed ?? 1;
  const panelH = o?.panelHeight ?? CUBE_WALL_H;
  const podTop = panelH + CUBE_CAP_H;

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
    const wall = makeCubicleWall(w.len, {
      variant: wallVariant,
      seed,
      merge: false,
      height: panelH,
      fabricTint: o?.fabricTint,
    });
    wall.position.set(w.pos[0], w.pos[1], w.pos[2]);
    wall.rotation.y = w.rotY;
    ctx.root.add(wall);

    const c = Math.cos(w.rotY);
    const s = Math.sin(w.rotY);
    const hx = (w.len / 2) * c;
    const hz = -(w.len / 2) * s;
    ctx.grinds.push({
      start: [w.pos[0] - hx, podTop, w.pos[2] - hz],
      end: [w.pos[0] + hx, podTop, w.pos[2] + hz],
    });
    collide(
      ctx,
      [w.len, podTop, CUBE_WALL_T + 0.05],
      [w.pos[0], podTop / 2, w.pos[2]],
      w.rotY || undefined,
    );
  }

  // A cleared-out pod: the panels are still up, the desks are gone, the contents are in
  // boxes on the floor. One in twenty pods, and it is the single cheapest thing that stops
  // the floorplate reading as a procedurally generated lattice.
  if (o?.cleared) {
    const stack = makeBoxStack({ seed: seed * 37, merge: false });
    stack.position.set(r.range(-0.7, 0.7), 0, r.range(-0.7, 0.7));
    ctx.root.add(stack);
    for (const c of stack.userData.colliders as PropCollider[]) {
      collide(ctx, c.size, [stack.position.x + c.offset[0], c.offset[1], stack.position.z + c.offset[2]]);
    }
    if (r.chance(0.7)) {
      const chair = makeTrashCan({ variant: 1, seed: seed * 41, merge: false });
      chair.position.set(r.range(-1.6, 1.6), 0, r.range(-1.6, 1.6));
      ctx.root.add(chair);
    }
    return finish(ctx, o, { size: [POD_HALF * 2, podTop, POD_HALF * 2], offset: [0, podTop / 2, 0] });
  }

  if (v >= 2) {
    // Far LOD: panels plus four desk-sized slabs and four monitor blocks. Silhouette only.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        ctx.root.add(mesh(sbox(1.9, 0.05, 1.3), MAT.deskTop, { pos: [sx * 1.1, DESK_TOP_Y, sz * 1.05] }));
        ctx.root.add(mesh(sbox(0.5, 0.34, 0.16), MAT.plastic, { pos: [sx * 1.1, DESK_TOP_Y + 0.2, sz * 0.55] }));
      }
    }
    return finish(ctx, o, { size: [POD_HALF * 2, podTop, POD_HALF * 2], offset: [0, podTop / 2, 0] });
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

  return finish(ctx, o, { size: [POD_HALF * 2, podTop, POD_HALF * 2], offset: [0, podTop / 2, 0] });
}

// ===========================================================================
// SKATE FURNITURE
//
// These are the objects the player stares at for the whole duration of a trick, so they get
// the most authoring attention in the library. The previous versions — a bare ExtrudeGeometry
// wedge with 90-degree corners and a grey cylinder on two pins — were the most obviously
// prototype-grade geometry in the level.
// ===========================================================================

/** A beveled triangular prism: flat edge at -Z, full height at +Z. */
function wedge(w: number, d: number, h: number, bevel = 0.02): THREE.BufferGeometry {
  return cached(`wg|${w}|${d}|${h}|${bevel}`, () => {
    const shape = new THREE.Shape();
    shape.moveTo(-d / 2 + bevel, bevel);
    shape.lineTo(d / 2 - bevel, bevel);
    shape.lineTo(d / 2 - bevel, h - bevel);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: w - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
      steps: 1,
    });
    // ExtrudeGeometry builds the profile in XY and extrudes along +Z, so we have
    //   X = ramp depth, Y = height, Z = ramp width
    // and we want X = width, Z = depth (rising toward +Z).
    //
    // rotateY(-90) maps old Z -> -X and old X -> +Z, which gets the axes right AND keeps the
    // tall end of the profile at +Z. The bevel puts the extrusion range at [-bevel, w-bevel]
    // on the new X axis, so the recentring translation is along X, by +(w/2 - bevel).
    // (Translating along Z instead — which is what this did originally — leaves the deck
    // offset by half its width in BOTH axes, and the parts bolted to it with chamferBox,
    // which is correctly centred, come off in a different direction. The ramp comes apart.)
    g.rotateY(-Math.PI / 2);
    g.translate(w / 2 - bevel, 0, 0);
    return finalize(g);
  });
}

export interface KickerOptions extends PropOptions {
  width?: number;
  depth?: number;
  height?: number;
}

/**
 * KICKER RAMP — plywood deck, steel coping lip, transition plate, ribs and bolts.
 * Grind edge along the coping. ~420 tris at variant 0.
 */
export function makeKickerRamp(o?: KickerOptions): THREE.Group {
  const ctx = begin('kickerRamp', o, 181);
  const w = o?.width ?? 3.4;
  const d = o?.depth ?? 1.8;
  const h = o?.height ?? 0.85;
  const slope = Math.atan2(h, d);
  const surfaceY = (z: number) => (h * (z + d / 2)) / d;

  // Deck
  ctx.root.add(mesh(wedge(w, d, h, 0.022), MAT.plywood, { pos: [0, 0, 0] }));

  // Side cheek plates, proud of the deck by 8 mm so the silhouette gets a stepped edge
  // instead of a single unbroken triangle.
  for (const s of [-1, 1]) {
    const cheek = new THREE.Mesh(wedge(0.03, d - 0.08, h - 0.05, 0.008), mat(MAT.deskFrame));
    cheek.position.set(s * (w / 2 + 0.006), 0.02, 0);
    cheek.castShadow = true;
    cheek.receiveShadow = true;
    ctx.root.add(cheek);
  }

  // Transverse deck battens: the seams between plywood sheets, laid on the ride surface.
  if (ctx.variant === 0) {
    for (let i = 1; i <= 2; i++) {
      const z = -d / 2 + (i * d) / 3;
      ctx.root.add(
        mesh(sbox(w - 0.1, 0.012, 0.035), MAT.deskFrame, {
          pos: [0, surfaceY(z) + 0.008, z],
          rot: [-slope, 0, 0],
          cast: false,
        }),
      );
    }
    // Bolt heads along the coping.
    for (let i = 0; i < 5; i++) {
      ctx.root.add(
        mesh(cyl(0.014, 0.014, 0.01, 6), MAT.chrome, {
          pos: [-w / 2 + 0.28 + (i * (w - 0.56)) / 4, h + 0.012, d / 2 - 0.10],
          cast: false,
        }),
      );
    }
  }

  // Steel coping lip along the top edge — this is what the chair actually hits.
  ctx.root.add(
    mesh(cbox(w + 0.05, 0.055, 0.13, 0.018), ['grindMetal', { repeat: [10, 1] }], {
      pos: [0, h - 0.012, d / 2 - 0.055],
    }),
  );

  // Transition plate at the floor: a kicker with a hard 90-degree bottom edge reads as a
  // block someone dropped, not as something you can ride onto.
  ctx.root.add(
    mesh(sbox(w, 0.012, 0.16), MAT.deskFrame, {
      pos: [0, 0.006, -d / 2 - 0.07],
      cast: false,
    }),
  );

  ctx.grinds.push({ start: [-w / 2, h + 0.02, d / 2 - 0.055], end: [w / 2, h + 0.02, d / 2 - 0.055] });
  // The collider is a thin slab lying ON the slope, not the whole prism: the chair rides the
  // surface, it does not need the volume underneath.
  collide(ctx, [w, 0.18, Math.hypot(d, h)], [0, h / 2, 0], undefined);
  ctx.colliders[0].rotationY = undefined;
  return finish(ctx, o, { size: [w, h, d], offset: [0, h / 2, 0] });
}

/**
 * GRIND RAIL — round steel shaft with a polished contact strip, welded base plates and a
 * mid-brace. `length` metres along X, top of the shaft at y = 0.80.
 * ~340 tris.
 */
export function makeGrindRail(length: number, o?: PropOptions): THREE.Group {
  const ctx = begin('grindRail', o, 191);
  const L = Math.max(1, length);
  const topY = 0.80;
  const rad = 0.045;
  const shaftY = topY - rad;

  // Shaft: a duller steel than the contact strip, so the strip reads as worn.
  const shaft = mesh(cyl(rad, rad, L, 10), MAT.railSteel, {
    pos: [0, shaftY, 0],
    rot: [0, 0, Math.PI / 2],
  });
  ctx.root.add(shaft);

  // The strip the casters have polished mirror-bright. Free storytelling, and it is the only
  // thing in the frame that tells the player this cylinder is a rail and not a pipe.
  ctx.root.add(
    mesh(sbox(L - 0.02, 0.004, 0.032), ['grindMetal', { repeat: [16, 1], roughness: 0.11 }], {
      pos: [0, topY + 0.001, 0],
      cast: false,
    }),
  );

  // End caps so the shaft is not an open tube in the silhouette.
  for (const s of [-1, 1]) {
    ctx.root.add(mesh(disc(rad, 10), MAT.chrome, { pos: [s * L / 2, shaftY, 0], rot: [0, 0, s * Math.PI / 2], cast: false }));
  }

  // Legs + welded base plates. A rail on bare pins looks like it is floating; the plate is
  // what plants it on the carpet.
  const legs = L > 9 ? 3 : 2;
  for (let i = 0; i < legs; i++) {
    const lx = -L / 2 + 0.35 + (i * (L - 0.7)) / (legs - 1);
    ctx.root.add(mesh(cyl(0.026, 0.032, shaftY, 8), MAT.railSteel, { pos: [lx, shaftY / 2, 0] }));
    ctx.root.add(mesh(cbox(0.15, 0.022, 0.15, 0.006), MAT.deskFrame, { pos: [lx, 0.011, 0] }));
    // Weld collar.
    ctx.root.add(mesh(cyl(0.042, 0.05, 0.03, 8), MAT.railSteel, { pos: [lx, 0.036, 0], cast: false }));
  }
  if (legs > 2) {
    ctx.root.add(mesh(sbox(L - 0.7, 0.03, 0.03), MAT.railSteel, { pos: [0, 0.22, 0] }));
  }

  ctx.grinds.push({ start: [-L / 2, topY, 0], end: [L / 2, topY, 0] });
  collide(ctx, [L, 0.09, 0.12], [0, topY - 0.045, 0]);
  return finish(ctx, o, { size: [L, topY, 0.2], offset: [0, topY / 2, 0] });
}

// ===========================================================================
// SATURATED SET DRESSING
// The refs carry navy, red and orange against the neutral office. These are the objects that
// put a high-chroma note in frame, and they are placed at roughly one per 8 m of skate line.
// ===========================================================================

/** FIRE EXTINGUISHER — the cheapest pure-red note in an office. ~150 tris. */
export function makeFireExtinguisher(o?: PropOptions): THREE.Group {
  const ctx = begin('fireExtinguisher', o, 197);
  const bodyH = 0.42;
  const rad = 0.072;

  ctx.root.add(mesh(cyl(rad, rad, bodyH, 10), MAT.accentRed, { pos: [0, 0.03 + bodyH / 2, 0] }));
  ctx.root.add(mesh(cyl(rad * 0.96, rad * 0.5, 0.08, 10), MAT.accentRed, { pos: [0, 0.03 + bodyH + 0.04, 0] }));
  ctx.root.add(mesh(cyl(rad, rad * 0.86, 0.035, 10), MAT.accentRed, { pos: [0, 0.016, 0], cast: false }));
  // valve + handle + gauge
  ctx.root.add(mesh(cyl(0.022, 0.022, 0.055, 6), MAT.metal, { pos: [0, 0.03 + bodyH + 0.10, 0] }));
  ctx.root.add(mesh(sbox(0.03, 0.016, 0.11), MAT.plastic, { pos: [0, 0.03 + bodyH + 0.13, 0.03] }));
  ctx.root.add(mesh(cyl(0.021, 0.021, 0.012, 8), MAT.chrome, { pos: [0.03, 0.03 + bodyH + 0.10, 0.035], rot: [Math.PI / 2, 0, 0], cast: false }));
  // hose
  ctx.root.add(mesh(cyl(0.009, 0.009, 0.26, 5), MAT.plastic, { pos: [rad + 0.012, 0.03 + bodyH * 0.55, 0.03], rot: [0.15, 0, 0.25] }));
  // label
  ctx.root.add(mesh(quad(0.085, 0.11), MAT.paper, { pos: [0, 0.03 + bodyH * 0.55, rad + 0.002], cast: false }));

  const total = 0.03 + bodyH + 0.16;
  collide(ctx, [rad * 2, total, rad * 2], [0, total / 2, 0]);
  return finish(ctx, o, { size: [rad * 2.2, total, rad * 2.2], offset: [0, total / 2, 0] });
}

/**
 * VENDING MACHINE — a 1.9 m landmark with a big saturated emissive front. Reads from across
 * the floorplate, which is exactly what a level full of identical cubicles needs.
 * ~380 tris.
 */
export function makeVendingMachine(o?: PropOptions): THREE.Group {
  const ctx = begin('vendingMachine', o, 199);
  const r = ctx.rng;
  const w = 0.94;
  const h = 1.9;
  const d = 0.78;
  const cold = r.chance(0.5);
  const body: MatRef = cold ? MAT.accentNavy : MAT.accentRed;

  ctx.root.add(mesh(cbox(w, h, d, 0.02), body, { pos: [0, h / 2, 0] }));
  // Illuminated product window. Low emissive intensity on purpose — this is a lit panel in
  // the room, not a light source, and it must not compete with the ceiling troffers.
  ctx.root.add(
    mesh(quad(w - 0.16, h - 0.62), ['screenOn', { emissive: cold ? 0x4f9ee8 : 0xf0a02a, emissiveIntensity: 0.85 }], {
      pos: [0, h * 0.60, d / 2 + 0.006],
      cast: false,
      receive: false,
    }),
  );
  // Shelf bars across the window so it is not a flat glowing rectangle.
  for (let i = 0; i < 4; i++) {
    ctx.root.add(
      mesh(sbox(w - 0.18, 0.02, 0.02), MAT.plastic, {
        pos: [0, h * 0.60 - (h - 0.62) / 2 + 0.1 + i * ((h - 0.82) / 4), d / 2 + 0.012],
        cast: false,
      }),
    );
  }
  ctx.root.add(mesh(cbox(w - 0.16, 0.32, 0.06, 0.012), MAT.plastic, { pos: [0, 0.30, d / 2 + 0.008] }));
  ctx.root.add(mesh(sbox(0.16, 0.5, 0.05), MAT.plastic, { pos: [w / 2 - 0.16, h * 0.62, d / 2 + 0.02] }));
  ctx.root.add(mesh(sbox(w - 0.14, 0.06, d - 0.08), MAT.plastic, { pos: [0, 0.03, 0], cast: false }));

  ctx.lights.push({ kind: 'point', offset: [0, h * 0.6, d / 2 + 0.45], color: cold ? 0x6fb4ee : 0xffb24a, intensity: 0.9, distance: 4.5 });
  collide(ctx, [w, h, d], [0, h / 2, 0]);
  return finish(ctx, o, { size: [w, h, d], offset: [0, h / 2, 0] });
}

/**
 * COPIER — the big shared multifunction unit. Placed in threes as a landmark "copier bank".
 * ~300 tris.
 */
export function makeCopier(o?: PropOptions): THREE.Group {
  const ctx = begin('copier', o, 211);
  const w = 0.82;
  const h = 1.02;
  const d = 0.72;

  ctx.root.add(mesh(cbox(w, h * 0.62, d, 0.018), MAT.applianceGrey, { pos: [0, h * 0.31, 0] }));
  ctx.root.add(mesh(cbox(w - 0.04, h * 0.30, d - 0.06, 0.018), MAT.plastic, { pos: [0, h * 0.62 + h * 0.15, -0.01] }));
  // document feeder lid
  ctx.root.add(mesh(cbox(w - 0.10, 0.08, d - 0.16, 0.014), MAT.applianceGrey, { pos: [0, h - 0.03, -0.02] }));
  // output tray with a fanned stack
  ctx.root.add(mesh(sbox(w - 0.18, 0.02, 0.24), MAT.plastic, { pos: [0, h * 0.62 + 0.02, d / 2 - 0.07] }));
  ctx.root.add(mesh(sbox(0.21, 0.022, 0.29), MAT.paper, { pos: [0, h * 0.62 + 0.04, d / 2 - 0.09], rot: [0, 0.06, 0], cast: false }));
  // paper drawers
  for (let i = 0; i < 3; i++) {
    ctx.root.add(mesh(sbox(w - 0.06, 0.15, 0.02), MAT.applianceGrey, { pos: [0, 0.10 + i * 0.18, d / 2 + 0.006] }));
    ctx.root.add(mesh(sbox(0.24, 0.018, 0.022), MAT.chrome, { pos: [0, 0.16 + i * 0.18, d / 2 + 0.016], cast: false }));
  }
  // control panel, angled, with a live screen
  ctx.root.add(mesh(cbox(0.30, 0.03, 0.20, 0.008), MAT.plastic, { pos: [0.20, h * 0.62 + 0.10, d / 2 - 0.20], rot: [-0.45, 0, 0] }));
  ctx.root.add(
    mesh(quad(0.20, 0.11), ['screenOn', { emissive: 0x3fcf78, emissiveIntensity: 1.1 }], {
      pos: [0.20, h * 0.62 + 0.125, d / 2 - 0.175],
      rot: [-2.02, 0, 0],
      cast: false,
    }),
  );

  collide(ctx, [w, h, d], [0, h / 2, 0]);
  return finish(ctx, o, { size: [w, h, d], offset: [0, h / 2, 0] });
}

/**
 * BOX STACK — the "this pod got cleared out" dressing. 4-7 cardboard boxes on a ~2 m
 * footprint, stacked two high. ~350 tris.
 */
export function makeBoxStack(o?: PropOptions): THREE.Group {
  const ctx = begin('boxStack', o, 223);
  const r = ctx.rng;
  const n = r.int(4, 7);
  for (let i = 0; i < n; i++) {
    const b = makeCardboardBox({ variant: 1, seed: (o?.seed ?? 1) * 31 + i, merge: false });
    const second = i >= 3 && r.chance(0.55);
    const x = r.range(-0.75, 0.75);
    const z = r.range(-0.75, 0.75);
    b.position.set(x, second ? 0.40 : 0, z);
    b.rotation.y = r.range(0, Math.PI);
    ctx.root.add(b);
    if (!second) collide(ctx, [0.5, 0.4, 0.45], [x, 0.2, z]);
  }
  return finish(ctx, o, { size: [2.0, 0.8, 2.0], offset: [0, 0.4, 0] });
}

/**
 * WHITEBOARD — wall prop, faces +Z. Frame, gloss board, marker tray, and a few saturated
 * marker strokes so it is not a blank white rectangle. ~120 tris.
 */
export function makeWhiteboard(o?: PropOptions): THREE.Group {
  const ctx = begin('whiteboard', o, 227);
  ctx.root.userData.mount = 'wall';
  const r = ctx.rng;
  const w = 1.8;
  const h = 1.05;

  ctx.root.add(mesh(cbox(w, h, 0.05, 0.012), MAT.metal, { pos: [0, 0, 0] }));
  ctx.root.add(mesh(quad(w - 0.08, h - 0.08), ['whiteboard', { color: 0xf6f7f8 }], { pos: [0, 0, 0.027], cast: false }));
  ctx.root.add(mesh(sbox(w - 0.2, 0.03, 0.07), MAT.metal, { pos: [0, -h / 2 + 0.04, 0.05] }));

  const inkTints: readonly number[] = [0xc0392b, 0x2a55a8, 0x2f8a4a];
  for (let i = 0; i < 7; i++) {
    const ink = MaterialLibrary.get('darkPlastic', { color: inkTints[r.int(0, 2)], roughness: 0.7 });
    ctx.root.add(
      mesh(quad(r.range(0.14, 0.55), 0.018), ink, {
        pos: [r.range(-w / 2 + 0.35, w / 2 - 0.35), r.range(-h / 2 + 0.25, h / 2 - 0.16), 0.03],
        rot: [0, 0, r.range(-0.06, 0.06)],
        cast: false,
      }),
    );
  }
  // markers on the tray
  for (let i = 0; i < 3; i++) {
    const ink = MaterialLibrary.get('darkPlastic', { color: inkTints[i], roughness: 0.5 });
    ctx.root.add(mesh(cyl(0.011, 0.011, 0.12, 6), ink, { pos: [-0.4 + i * 0.16, -h / 2 + 0.062, 0.062], rot: [0, 0, Math.PI / 2], cast: false }));
  }

  return finish(ctx, o, { size: [w, h, 0.09], offset: [0, 0, 0.045] });
}

/**
 * CONFERENCE BOX — a glazed meeting room. THE landmark prop: it is the only transparent
 * volume on the floorplate, so it reads instantly from any distance and gives the player
 * something to navigate by. The 0.95 m solid base wall is grindable all the way round.
 * ~1400 tris.
 */
export function makeConferenceBox(width = 5.2, depth = 4.2, o?: PropOptions): THREE.Group {
  const ctx = begin('conferenceBox', o, 229);
  const W = width;
  const D = depth;
  const baseH = 0.95;
  const capH = 0.07;
  const glassTop = 2.45;
  const doorW = 1.1;

  const sides: { len: number; cx: number; cz: number; rotY: number; door: boolean }[] = [
    { len: W, cx: 0, cz: -D / 2, rotY: 0, door: false },
    { len: W, cx: 0, cz: D / 2, rotY: 0, door: true },
    { len: D, cx: -W / 2, cz: 0, rotY: Math.PI / 2, door: false },
    { len: D, cx: W / 2, cz: 0, rotY: Math.PI / 2, door: false },
  ];

  for (const s of sides) {
    // A doorway splits the run into two shorter segments.
    const runs: { len: number; off: number }[] = s.door
      ? [
          { len: (s.len - doorW) / 2, off: -(s.len + doorW) / 4 },
          { len: (s.len - doorW) / 2, off: (s.len + doorW) / 4 },
        ]
      : [{ len: s.len, off: 0 }];

    for (const run of runs) {
      const c = Math.cos(s.rotY);
      const sn = Math.sin(s.rotY);
      const px = s.cx + run.off * c;
      const pz = s.cz - run.off * sn;

      // Solid base + cap (the grind line)
      const base = mesh(cbox(run.len, baseH, 0.09, 0.014, [Math.max(1, Math.round(run.len / 1.6)), 1]), MAT.panelFabric);
      base.position.set(px, baseH / 2, pz);
      base.rotation.y = s.rotY;
      ctx.root.add(base);

      const cap = mesh(cbox(run.len + 0.02, capH, 0.14, 0.018), MAT.panelCap);
      cap.position.set(px, baseH + capH / 2, pz);
      cap.rotation.y = s.rotY;
      ctx.root.add(cap);

      // Glazing above
      const glass = mesh(cbox(run.len - 0.06, glassTop - baseH - capH, 0.02, 0.006), MAT.glass, {
        cast: false,
        receive: false,
      });
      glass.position.set(px, (baseH + capH + glassTop) / 2, pz);
      glass.rotation.y = s.rotY;
      glass.renderOrder = 2;
      ctx.root.add(glass);

      const hx = (run.len / 2) * c;
      const hz = -(run.len / 2) * sn;
      ctx.grinds.push({
        start: [px - hx, baseH + capH, pz - hz],
        end: [px + hx, baseH + capH, pz + hz],
      });
      collide(ctx, [run.len, glassTop, 0.14], [px, glassTop / 2, pz], s.rotY || undefined);
    }
  }

  // Mullions at the corners and the head rail: what stops the glass reading as a floating pane.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      ctx.root.add(mesh(cbox(0.07, glassTop, 0.07, 0.01), MAT.metal, { pos: [sx * W / 2, glassTop / 2, sz * D / 2] }));
    }
  }
  ctx.root.add(mesh(sbox(W + 0.07, 0.06, 0.07), MAT.metal, { pos: [0, glassTop, -D / 2] }));
  ctx.root.add(mesh(sbox(W + 0.07, 0.06, 0.07), MAT.metal, { pos: [0, glassTop, D / 2] }));
  ctx.root.add(mesh(sbox(0.07, 0.06, D), MAT.metal, { pos: [-W / 2, glassTop, 0] }));
  ctx.root.add(mesh(sbox(0.07, 0.06, D), MAT.metal, { pos: [W / 2, glassTop, 0] }));

  if (ctx.variant === 0) {
    // Boardroom table + chairs, visible through the glazing.
    const tw = Math.min(W - 1.6, 3.0);
    const td = Math.min(D - 1.8, 1.3);
    ctx.root.add(mesh(cbox(tw, 0.05, td, 0.012, [2, 1]), MAT.deskTop, { pos: [0, 0.735, 0] }));
    ctx.root.add(mesh(cbox(0.5, 0.71, 0.5, 0.02), MAT.plastic, { pos: [0, 0.355, 0] }));
    ctx.root.add(mesh(cyl(0.34, 0.36, 0.03, 10), MAT.metal, { pos: [0, 0.015, 0], cast: false }));
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1;
      const cx = -tw / 2 + 0.45 + (i % 3) * (tw - 0.9) / 2;
      const cz = side * (td / 2 + 0.42);
      ctx.root.add(mesh(cbox(0.42, 0.05, 0.42, 0.012), MAT.plastic, { pos: [cx, 0.45, cz] }));
      ctx.root.add(mesh(cbox(0.40, 0.42, 0.05, 0.012), MAT.panelFabric, { pos: [cx, 0.69, cz + side * 0.19] }));
      ctx.root.add(mesh(cyl(0.03, 0.03, 0.42, 6), MAT.metal, { pos: [cx, 0.21, cz], cast: false }));
      ctx.root.add(mesh(cyl(0.19, 0.19, 0.02, 8), MAT.metal, { pos: [cx, 0.01, cz], cast: false }));
    }
    // A projector screen / whiteboard on the far wall of the box.
    ctx.root.add(mesh(quad(Math.min(W - 1.4, 2.4), 1.0), ['whiteboard', { color: 0xf6f7f8 }], {
      pos: [0, 1.55, -D / 2 + 0.06],
      cast: false,
    }));
  }

  return finish(ctx, o, { size: [W, glassTop, D], offset: [0, glassTop / 2, 0] });
}

/**
 * MANAGER OFFICE — a double-footprint hard-walled room dropped into the cubicle grid.
 *
 * Real offices are accreted, not generated: somebody got promoted and two pods became one
 * room with a door. This is the prop that breaks the lattice. Walls are 1.98 m (well above
 * the 1.40 m grind line, so it reads as a solid mass in the skyline) with a glazed clerestory
 * strip, and it carries the only wood-topped desk on the floor.
 * ~1600 tris.
 */
export function makeManagerOffice(width = 9.4, depth = 4.4, o?: PropOptions): THREE.Group {
  const ctx = begin('managerOffice', o, 233);
  const r = ctx.rng;
  const W = width;
  const D = depth;
  const wallH = 1.98;
  const glazeH = 0.52;
  const doorW = 1.0;
  const t = 0.11;

  const runs: { len: number; cx: number; cz: number; rotY: number }[] = [];
  const addSide = (len: number, cx: number, cz: number, rotY: number, door: boolean) => {
    if (!door) {
      runs.push({ len, cx, cz, rotY });
      return;
    }
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    const seg = (len - doorW) / 2;
    for (const off of [-(len + doorW) / 4, (len + doorW) / 4]) {
      runs.push({ len: seg, cx: cx + off * c, cz: cz - off * s, rotY });
    }
  };
  addSide(W, 0, -D / 2, 0, false);
  addSide(W, 0, D / 2, 0, true);          // door faces the aisle
  addSide(D, -W / 2, 0, Math.PI / 2, false);
  addSide(D, W / 2, 0, Math.PI / 2, false);

  for (const run of runs) {
    const uv: [number, number] = [Math.max(1, Math.round(run.len / 2.2)), 1];
    const wall = mesh(cbox(run.len, wallH, t, 0.016, uv), ['drywall', { repeat: [3, 2] }]);
    wall.position.set(run.cx, wallH / 2, run.cz);
    wall.rotation.y = run.rotY;
    ctx.root.add(wall);

    // Clerestory glazing strip + head trim: this is what stops a 2 m drywall box reading as
    // a shipping container.
    const glaze = mesh(cbox(run.len - 0.08, glazeH, 0.02, 0.006), MAT.glass, { cast: false, receive: false });
    glaze.position.set(run.cx, wallH + glazeH / 2, run.cz);
    glaze.rotation.y = run.rotY;
    glaze.renderOrder = 2;
    ctx.root.add(glaze);

    const trim = mesh(cbox(run.len + 0.03, 0.07, t + 0.05, 0.014), MAT.panelCap);
    trim.position.set(run.cx, wallH + glazeH + 0.035, run.cz);
    trim.rotation.y = run.rotY;
    ctx.root.add(trim);

    const skirt = mesh(sbox(run.len, 0.13, t + 0.04), MAT.panelCap);
    skirt.position.set(run.cx, 0.065, run.cz);
    skirt.rotation.y = run.rotY;
    ctx.root.add(skirt);

    collide(ctx, [run.len, wallH + glazeH, t + 0.06], [run.cx, (wallH + glazeH) / 2, run.cz], run.rotY || undefined);
  }

  if (ctx.variant === 0) {
    // Contents, readable through the clerestory and the doorway.
    const desk = makeDesk({ variant: 0, seed: (o?.seed ?? 1) * 7, merge: false });
    desk.position.set(-W / 4, 0, -0.5);
    desk.rotation.y = Math.PI;
    ctx.root.add(desk);

    const monitor = makeMonitor({ variant: 1, seed: (o?.seed ?? 1) * 11, merge: false });
    monitor.position.set(-W / 4 + 0.2, DESK_TOP_Y, -0.1);
    monitor.rotation.y = Math.PI + r.range(-0.2, 0.2);
    ctx.root.add(monitor);

    const cab = makeFilingCabinet({ variant: 1, seed: (o?.seed ?? 1) * 13, merge: false });
    cab.position.set(W / 2 - 0.7, 0, -D / 2 + 0.5);
    ctx.root.add(cab);

    const plant = makePottedPlant({ variant: 0, seed: (o?.seed ?? 1) * 17, merge: false });
    plant.position.set(W / 2 - 0.6, 0, D / 2 - 0.8);
    ctx.root.add(plant);

    const board = makeWhiteboard({ seed: (o?.seed ?? 1) * 19, merge: false });
    board.position.set(W / 4, 1.35, -D / 2 + 0.09);
    ctx.root.add(board);
  }

  return finish(ctx, o, { size: [W, wallH + glazeH, D], offset: [0, (wallH + glazeH) / 2, 0] });
}
