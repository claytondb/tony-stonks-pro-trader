/**
 * ChairModel — the player's "skateboard".
 *
 * A fully procedural, chunky-faceted office chair built to the project's stylised low-poly
 * art direction (Monument Valley geometry, Unreal-Engine lighting). This is the single most
 * looked-at object in the game, so every silhouette-defining edge is chamfered: there is not a
 * single raw BoxGeometry in here. All shading comes from MaterialLibrary, which owns the PBR
 * tuning and the env-map binding.
 *
 * SCALE / ORIGIN CONTRACT (read this before wiring it up)
 * ------------------------------------------------------
 *  - Real-world metres. Seat top sits at y ~= 0.43..0.49, overall height 0.95 m (tier 0) to 1.35 m (tier 3).
 *  - The root Group's origin is on the FLOOR, dead centre of the caster ring: the five caster
 *    contact points are all at y = 0. Nothing dips below y = 0.
 *  - The chair faces -Z. The backrest is at +Z, the seat nose at -Z. This matches the existing
 *    fallback chair in Game.createChairMesh().
 *  - Game.ts drives `this.chair` (a Group) straight from the Rapier capsule (halfHeight 0.3,
 *    radius 0.4 => the body centre is 0.7 above the contact point). So:
 *        chairParts.root.position.y = -0.70;   chair.add(chairParts.root);
 *    puts the wheels exactly on the floor. Do NOT scale the root; it is already correct.
 *
 * TIERS
 * -----
 *  0  battered typist chair   — low vinyl back, no headrest, one snapped-off armrest stub,
 *                               painted-steel column, grey nylon base, mismatched grey wheels.
 *  1  standard task chair     — mid back, fixed loop armrests, charcoal fabric, nylon base.
 *  2  ergonomic mesh chair    — high mesh back + headrest, T-arms, polished aluminium base.
 *  3  chrome-and-carbon exec  — tall carbon shell + mesh, headrest, cantilever chrome arms,
 *                               leather cushions, gold accents, chrome star base + chrome forks.
 * The silhouette changes per tier (seat size, back height, spoke length, arm style, presence of
 * a headrest and of a mesh panel), not just the colour.
 *
 * BUDGET: tier 0 / 1 / 2 / 3 = 2792 / 2924 / 3308 / 3484 triangles (root.userData.triangles).
 * Draw calls: everything static is merged per material, so a chair is 12 static meshes plus
 * 3 per caster (1 fork + 2 wheel-pair, which must stay separate to animate) => 27 meshes total.
 * If that is too many for a crowded scene, the cheapest saving is to drop the wheel hub-caps into
 * the tyre material (-5) — do it in `paletteFor`, not by editing the builders.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MaterialLibrary, type MaterialId, type MaterialOptions } from '../materials/MaterialLibrary';
import { applyRimLight } from '../player/LowPolyKit';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ChairParts {
  root: THREE.Group;
  seat: THREE.Object3D;
  back: THREE.Object3D;
  column: THREE.Object3D;
  base: THREE.Object3D;
  /** Five caster forks, in ring order starting at the front. Each swivels about its own Y. */
  casters: THREE.Object3D[];
  /** Root-local floor contact point under each caster, index-matched to `casters`. y === 0. */
  wheelContactPoints: THREE.Vector3[];
}

export type ChairTier = 0 | 1 | 2 | 3;

export interface ChairOptions {
  tier?: ChairTier;
  seed?: number;
}

// ---------------------------------------------------------------------------
// Deterministic RNG
// ---------------------------------------------------------------------------

function makeRng(seed: number): () => number {
  let s = (seed | 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13; s |= 0;
    s ^= s >>> 17;
    s ^= s << 5; s |= 0;
    return ((s >>> 0) % 100000) / 100000;
  };
}

// ---------------------------------------------------------------------------
// Geometry primitives — everything here is chamfered, non-indexed and carries uv + uv1
// ---------------------------------------------------------------------------

/** Corner index bits: 1 = +x, 2 = +y, 4 = +z. */
function cornerIndex(sx: number, sy: number, sz: number): number {
  return (sx > 0 ? 1 : 0) | (sy > 0 ? 2 : 0) | (sz > 0 ? 4 : 0);
}

/**
 * A box with all 12 edges and 8 corners chamfered: 6 face quads + 12 edge quads + 8 corner
 * triangles = 44 triangles. Reads as a solid chunky volume under flat shading, which a plain
 * BoxGeometry never does because it has no edge facets to catch the key light.
 */
function chamferBox(w: number, h: number, d: number, chamfer: number): THREE.BufferGeometry {
  const c = Math.max(0.001, Math.min(chamfer, Math.min(w, h, d) * 0.45));
  const hx = w * 0.5, hy = h * 0.5, hz = d * 0.5;

  // 3 vertices per corner: one pushed out along each axis.
  const v: THREE.Vector3[] = [];
  for (let ci = 0; ci < 8; ci++) {
    const sx = (ci & 1) ? 1 : -1;
    const sy = (ci & 2) ? 1 : -1;
    const sz = (ci & 4) ? 1 : -1;
    v.push(new THREE.Vector3(sx * hx, sy * (hy - c), sz * (hz - c)));
    v.push(new THREE.Vector3(sx * (hx - c), sy * hy, sz * (hz - c)));
    v.push(new THREE.Vector3(sx * (hx - c), sy * (hy - c), sz * hz));
  }
  const vi = (ci: number, axis: number) => ci * 3 + axis;

  const quads: number[][] = [];

  // Six axis-aligned faces.
  const ring: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let axis = 0; axis < 3; axis++) {
    const a1 = (axis + 1) % 3;
    const a2 = (axis + 2) % 3;
    for (const s of [-1, 1]) {
      const q: number[] = [];
      for (const [s1, s2] of ring) {
        const sgn = [0, 0, 0];
        sgn[axis] = s; sgn[a1] = s1; sgn[a2] = s2;
        q.push(vi(cornerIndex(sgn[0], sgn[1], sgn[2]), axis));
      }
      quads.push(q);
    }
  }

  // Twelve edge chamfers.
  for (let a = 0; a < 3; a++) {
    for (let b = a + 1; b < 3; b++) {
      const cAxis = 3 - a - b;
      for (const sa of [-1, 1]) {
        for (const sb of [-1, 1]) {
          const q: number[] = [];
          for (const sc of [-1, 1]) {
            const sgn = [0, 0, 0];
            sgn[a] = sa; sgn[b] = sb; sgn[cAxis] = sc;
            const ci = cornerIndex(sgn[0], sgn[1], sgn[2]);
            if (sc < 0) q.push(vi(ci, a), vi(ci, b));
            else q.push(vi(ci, b), vi(ci, a));
          }
          quads.push(q);
        }
      }
    }
  }

  const tris: number[][] = [];
  for (let ci = 0; ci < 8; ci++) tris.push([vi(ci, 0), vi(ci, 1), vi(ci, 2)]);
  for (const q of quads) {
    tris.push([q[0], q[1], q[2]]);
    tris.push([q[0], q[2], q[3]]);
  }

  const pos: number[] = [];
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();
  const g = new THREE.Vector3();
  for (const t of tris) {
    const a = v[t[0]], b = v[t[1]], cc = v[t[2]];
    ab.subVectors(b, a);
    ac.subVectors(cc, a);
    n.crossVectors(ab, ac);
    g.copy(a).add(b).add(cc).multiplyScalar(1 / 3);
    // The solid is convex about the origin, so the outward face is the one whose normal
    // agrees with its own centroid. Flip anything that came out inside-out.
    if (n.dot(g) < 0) pos.push(a.x, a.y, a.z, cc.x, cc.y, cc.z, b.x, b.y, b.z);
    else pos.push(a.x, a.y, a.z, b.x, b.y, b.z, cc.x, cc.y, cc.z);
  }

  return finalise(pos);
}

/** Build the final BufferGeometry from a flat triangle-soup, with box-projected UVs. */
function finalise(pos: number[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  applyBoxUVs(geo);
  return geo;
}

/**
 * Per-triangle planar projection onto the dominant axis of the face normal, in metres, so
 * MaterialLibrary's texture repeat behaves consistently across parts of different sizes.
 */
function applyBoxUVs(geo: THREE.BufferGeometry): void {
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const nAttr = geo.getAttribute('normal') as THREE.BufferAttribute;
  const uv = new Float32Array((p.count) * 2);
  for (let i = 0; i < p.count; i += 3) {
    const nx = Math.abs(nAttr.getX(i));
    const ny = Math.abs(nAttr.getY(i));
    const nz = Math.abs(nAttr.getZ(i));
    let uAxis = 0, vAxis = 1;
    if (nx >= ny && nx >= nz) { uAxis = 2; vAxis = 1; }
    else if (ny >= nx && ny >= nz) { uAxis = 0; vAxis = 2; }
    else { uAxis = 0; vAxis = 1; }
    for (let k = 0; k < 3; k++) {
      const j = i + k;
      const c = [p.getX(j), p.getY(j), p.getZ(j)];
      uv[j * 2] = c[uAxis];
      uv[j * 2 + 1] = c[vAxis];
    }
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // three r152+ reads aoMap from the `uv1` attribute; without it every aoMap silently no-ops.
  geo.setAttribute('uv1', new THREE.Float32BufferAttribute(uv.slice(), 2));
}

/** Normalise anything three hands us (indexed, no uv1) into the merge-compatible layout. */
function prep(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = src.index ? src.toNonIndexed() : src;
  if (geo !== src) src.dispose();
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  if (!geo.getAttribute('uv')) applyBoxUVs(geo);
  if (!geo.getAttribute('uv1')) {
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    geo.setAttribute('uv1', new THREE.Float32BufferAttribute((uv.array as Float32Array).slice(), 2));
  }
  geo.deleteAttribute('tangent');
  return geo;
}

/** Faceted cylinder. `openEnded` for anything whose caps are buried inside another part. */
function cylinder(rTop: number, rBottom: number, h: number, seg: number, openEnded = false): THREE.BufferGeometry {
  return prep(new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, openEnded));
}

/** A disc/wheel with chamfered rim shoulders — lathed, so the tread reads as a real volume. */
function chamferDisc(r: number, h: number, chamferR: number, seg: number): THREE.BufferGeometry {
  const c = Math.min(chamferR, h * 0.4, r * 0.4);
  const hh = h * 0.5;
  // Four-point profile on purpose: 3 lathe segments instead of 5 saves ~320 triangles across the
  // ten wheels, and under flat shading the coned sidewall reads better than a flat one anyway.
  const profile = [
    new THREE.Vector2(0, -hh),
    new THREE.Vector2(r, -hh + c),
    new THREE.Vector2(r, hh - c),
    new THREE.Vector2(0, hh),
  ];
  const geo = new THREE.LatheGeometry(profile, seg);
  geo.rotateZ(Math.PI * 0.5); // lathe spins about Y; a wheel spins about its X axle
  return prep(geo);
}

/**
 * Taper a geometry along `axis`, scaling the other two axes from `s0` at the low end to `s1` at
 * the high end. Used for the base spokes, which must thin out toward the caster like a real
 * five-star base rather than being a slab.
 */
function taper(geo: THREE.BufferGeometry, axis: 'x' | 'y' | 'z', s0: number, s1: number): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const lo = bb.min[axis];
  const span = Math.max(1e-5, bb.max[axis] - lo);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const other: Array<'x' | 'y' | 'z'> = (['x', 'y', 'z'] as const).filter((a) => a !== axis) as Array<'x' | 'y' | 'z'>;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getComponent(i, axisIndex(axis)) - lo) / span;
    const s = s0 + (s1 - s0) * t;
    for (const o of other) p.setComponent(i, axisIndex(o), p.getComponent(i, axisIndex(o)) * s);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function axisIndex(a: 'x' | 'y' | 'z'): number {
  return a === 'x' ? 0 : a === 'y' ? 1 : 2;
}

// ---------------------------------------------------------------------------
// Per-material accumulator: many chamfered parts collapse into one draw call
// ---------------------------------------------------------------------------

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

interface Placement {
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
}

class PartBuilder {
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  triangles = 0;

  add(geo: THREE.BufferGeometry, mat: THREE.Material, at?: Placement): this {
    if (at) {
      const p = at.pos ?? [0, 0, 0];
      const r = at.rot ?? [0, 0, 0];
      const s = at.scale ?? [1, 1, 1];
      _e.set(r[0], r[1], r[2]);
      _q.setFromEuler(_e);
      _m.compose(new THREE.Vector3(p[0], p[1], p[2]), _q, new THREE.Vector3(s[0], s[1], s[2]));
      geo.applyMatrix4(_m);
    }
    this.triangles += geo.getAttribute('position').count / 3;
    const list = this.buckets.get(mat);
    if (list) list.push(geo);
    else this.buckets.set(mat, [geo]);
    return this;
  }

  /** One merged Mesh per material, parented to `target`. Returns the triangle count added. */
  flushInto(target: THREE.Object3D, name: string): number {
    let i = 0;
    for (const [mat, geos] of this.buckets) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) continue;
      if (geos.length > 1) for (const g of geos) g.dispose();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `${name}_${i++}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      target.add(mesh);
    }
    this.buckets.clear();
    return this.triangles;
  }
}

// ---------------------------------------------------------------------------
// Tier definitions
// ---------------------------------------------------------------------------

type ArmStyle = 'stub' | 'loop' | 'tee' | 'cantilever';

interface TierSpec {
  label: string;
  seatW: number; seatD: number; seatT: number; seatY: number;
  backW: number; backH: number; backTilt: number; lumbarGap: number;
  headrest: boolean;
  meshBack: boolean;
  arms: ArmStyle;
  spokeLen: number;
  spokeTaper: number;
  wheelR: number; wheelW: number;
  wheelSeg: number;
  chromeSleeve: boolean;
  accents: boolean;
}

const TIERS: Record<ChairTier, TierSpec> = {
  0: {
    label: 'battered typist chair',
    seatW: 0.42, seatD: 0.40, seatT: 0.090, seatY: 0.430,
    backW: 0.36, backH: 0.210, backTilt: 0.10, lumbarGap: 0.115,
    headrest: false, meshBack: false, arms: 'stub',
    spokeLen: 0.25, spokeTaper: 0.55,
    wheelR: 0.026, wheelW: 0.020, wheelSeg: 8,
    chromeSleeve: false, accents: false,
  },
  1: {
    label: 'standard task chair',
    seatW: 0.46, seatD: 0.44, seatT: 0.105, seatY: 0.455,
    backW: 0.405, backH: 0.315, backTilt: 0.13, lumbarGap: 0.100,
    headrest: false, meshBack: false, arms: 'loop',
    spokeLen: 0.275, spokeTaper: 0.50,
    wheelR: 0.028, wheelW: 0.022, wheelSeg: 8,
    chromeSleeve: true, accents: false,
  },
  2: {
    label: 'ergonomic mesh chair',
    seatW: 0.49, seatD: 0.46, seatT: 0.115, seatY: 0.470,
    backW: 0.435, backH: 0.400, backTilt: 0.15, lumbarGap: 0.095,
    headrest: true, meshBack: true, arms: 'tee',
    spokeLen: 0.30, spokeTaper: 0.45,
    wheelR: 0.030, wheelW: 0.024, wheelSeg: 10,
    chromeSleeve: true, accents: false,
  },
  3: {
    label: 'chrome-and-carbon executive',
    seatW: 0.52, seatD: 0.48, seatT: 0.125, seatY: 0.485,
    backW: 0.460, backH: 0.430, backTilt: 0.17, lumbarGap: 0.090,
    headrest: true, meshBack: true, arms: 'cantilever',
    spokeLen: 0.325, spokeTaper: 0.40,
    wheelR: 0.032, wheelW: 0.026, wheelSeg: 10,
    chromeSleeve: true, accents: true,
  },
};

// ---------------------------------------------------------------------------
// Per-tier material palette
// ---------------------------------------------------------------------------

/**
 * MEASURED map means (sRGB) from ProceduralTextures, because this drives every choice below:
 *   cubicleFabric 127,142,146 (lin .26)   brushedMetal 190,193,196 (lin .51)
 *   darkPlastic    35, 38, 42 (lin .017)  rubber        29,30,32   (lin .012)
 *
 * On a textured id `color` is a multiplicative TINT over that map, so darkPlastic and rubber can
 * only ever go DARKER than linear 0.017 — they are near-black by construction and are used here
 * only where near-black is right (tyres). Every structural surface that needs a specific mid
 * value instead uses an UNTEXTURED id (shoeBlack / chrome / copBadgeGold), where `color` is the
 * albedo outright and we get exact control. `shoeBlack` is simply the library's generic smooth
 * dielectric — the name is about its default colour, not a restriction.
 *
 * Cushion tints are solved against the fabric map: target_linear / 0.26 -> tint.
 */
interface Palette {
  cushion: THREE.MeshStandardMaterial;   // seat + back padding
  shell: THREE.MeshStandardMaterial;     // structural plastic / carbon shell
  mesh: THREE.MeshStandardMaterial;      // back mesh panel
  frame: THREE.MeshStandardMaterial;     // column, spokes, arm posts
  bright: THREE.MeshStandardMaterial;    // chrome sleeve, caster forks, highlights
  tyre: THREE.MeshStandardMaterial;      // wheel tread
  hubcap: THREE.MeshStandardMaterial;    // wheel hub / axle
  accent: THREE.MeshStandardMaterial;    // trim strip, lever
}

/**
 * Chair materials are PRIVATE CLONES of the library entries, not the shared instances.
 *
 * The chair is a hero asset: it needs a camera-relative Fresnel rim so its near-black mass
 * separates from a mid-tone carpet at follow-camera distance (the panel's "the hero silhouette
 * dies against the environment"). Patching a shared MaterialLibrary entry would push that rim
 * onto every cubicle and bin in the level, so the chair owns its own copies instead.
 *
 * The clone drops its material-level envMap and inherits the source's envMapIntensity, which
 * makes three fall back to `scene.environment` — set by EnvironmentRig for exactly this reason,
 * so the clones keep receiving the IBL without being in the library's rebind list.
 */
const RIM_CLONES = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();

function heroise(src: THREE.MeshStandardMaterial, rimStrength: number): THREE.MeshStandardMaterial {
  const hit = RIM_CLONES.get(src);
  if (hit) return hit;
  const clone = src.clone();
  clone.name = `${src.name}#hero`;
  clone.envMapIntensity = src.envMapIntensity;
  clone.envMap = null;
  applyRimLight(clone, { color: 0xd6e2f4, power: 3.0, strength: rimStrength });
  RIM_CLONES.set(src, clone);
  return clone;
}

function mat(id: MaterialId, opts: MaterialOptions & { rim?: number }): THREE.MeshStandardMaterial {
  const { rim, ...rest } = opts;
  return heroise(MaterialLibrary.get(id, { flatShading: true, ...rest }), rim ?? 0.30);
}

/** Generic untextured dielectric with an exact albedo. */
function solid(color: number, roughness: number, rim = 0.34): THREE.MeshStandardMaterial {
  return mat('shoeBlack', { color, roughness, rim });
}

function paletteFor(tier: ChairTier): Palette {
  switch (tier) {
    case 0:
      // Worn beige vinyl over grey painted steel and grey nylon. Nothing matches, everything
      // is a half-shade off — that is the whole point of the starter chair.
      return {
        cushion: mat('cubicleFabric', { color: 0xb2a078, roughness: 0.96, repeat: [2, 2] }),
        shell: solid(0x6f6a5f, 0.72),
        mesh: solid(0x635e55, 0.80),
        frame: solid(0x5a5d61, 0.58),
        bright: mat('brushedMetal', { color: 0xa8adb2, roughness: 0.56 }),
        tyre: solid(0x55534e, 0.72),
        hubcap: solid(0x7a766d, 0.60),
        accent: solid(0x4e5155, 0.55),
      };
    case 1:
      return {
        cushion: mat('cubicleFabric', { color: 0x8d8a8a, roughness: 0.94, repeat: [2, 2] }),
        shell: solid(0x3d3f44, 0.52),
        mesh: mat('cubicleFabric', { color: 0x757272, roughness: 0.80, repeat: [2, 2] }),
        frame: solid(0x2c2f35, 0.44),
        bright: mat('brushedMetal', { color: 0xdfe3e8, roughness: 0.30 }),
        tyre: mat('rubber', { color: 0xffffff, roughness: 0.88, repeat: [2, 1] }),
        hubcap: solid(0x44484f, 0.40),
        accent: solid(0x44484f, 0.40),
      };
    case 2:
      return {
        cushion: mat('cubicleFabric', { color: 0x847f7d, roughness: 0.92, repeat: [2, 2] }),
        shell: solid(0x2e3238, 0.46),
        mesh: mat('cubicleFabric', { color: 0x6e6b6b, roughness: 0.74, repeat: [2, 2] }),
        frame: mat('brushedMetal', { color: 0xffffff, roughness: 0.30 }),
        bright: mat('chrome', {}),
        tyre: mat('rubber', { color: 0xffffff, roughness: 0.84, repeat: [2, 1] }),
        hubcap: mat('brushedMetal', { color: 0xf0f3f6, roughness: 0.24 }),
        accent: solid(0x585d66, 0.34),
      };
    case 3:
    default:
      // Black leather + woven carbon + chrome, with a gold pinstripe. Reads almost black in
      // silhouette but the chrome frame draws the whole shape for you.
      return {
        cushion: solid(0x33363d, 0.62),
        shell: solid(0x1f2228, 0.32),
        mesh: mat('cubicleFabric', { color: 0x646161, roughness: 0.66, repeat: [2, 2] }),
        frame: mat('chrome', {}),
        bright: mat('chrome', {}),
        tyre: mat('rubber', { color: 0xffffff, roughness: 0.80, repeat: [2, 1] }),
        hubcap: mat('chrome', {}),
        accent: mat('copBadgeGold', {}),
      };
  }
}

// ---------------------------------------------------------------------------
// Sub-assemblies
// ---------------------------------------------------------------------------

/** Five-star base: hub + tapered spokes, plus the caster sockets. Origin on the floor. */
function buildBase(spec: TierSpec, pal: Palette, rng: () => number): {
  group: THREE.Group;
  casters: THREE.Object3D[];
  contacts: THREE.Vector3[];
  triangles: number;
} {
  const group = new THREE.Group();
  group.name = 'chairBase';

  const forkPivotY = spec.wheelR * 2.05;          // top of the caster stem
  const spokeY = forkPivotY + 0.020;              // spoke centreline
  const b = new PartBuilder();

  // Hub — the column socket. Slightly conical so it catches a highlight on top.
  b.add(cylinder(0.052, 0.062, 0.072, 10), pal.frame, { pos: [0, spokeY + 0.014, 0] });
  b.add(cylinder(0.062, 0.074, 0.028, 10), pal.shell, { pos: [0, spokeY + 0.050, 0] });

  const casters: THREE.Object3D[] = [];
  const contacts: THREE.Vector3[] = [];

  for (let i = 0; i < 5; i++) {
    // Spoke 0 points dead ahead (-Z); the rest are spread evenly around the ring.
    const a = Math.PI + (i / 5) * Math.PI * 2;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const len = spec.spokeLen;

    // Tapered spoke, modelled along +Z then rotated into place.
    const spoke = chamferBox(0.072, 0.048, len, 0.014);
    taper(spoke, 'z', 1.0, spec.spokeTaper);
    spoke.translate(0, 0, len * 0.5 + 0.030);
    b.add(spoke, pal.frame, { pos: [0, spokeY, 0], rot: [0, a, 0] });

    // Caster socket boss where the fork stem enters the spoke.
    const tipX = dx * (len - 0.005);
    const tipZ = dz * (len - 0.005);
    b.add(cylinder(0.026, 0.030, 0.030, 6), pal.shell, { pos: [tipX, spokeY - 0.004, tipZ] });

    const caster = buildCaster(spec, pal, rng);
    caster.name = `caster_${i}`;
    caster.position.set(tipX, forkPivotY, tipZ);
    group.add(caster);
    casters.push(caster);
    contacts.push(new THREE.Vector3(tipX, 0, tipZ));
  }

  const tris = b.flushInto(group, 'base');
  return { group, casters, contacts, triangles: tris };
}

/**
 * One twin-wheel caster. The returned Group is the swivel fork: it rotates about its own Y to
 * trail the direction of travel. Its `userData.wheels` mesh spins about X.
 * The pivot is at the top of the stem, so the wheel contact lands exactly on the parent's y = 0.
 */
function buildCaster(spec: TierSpec, pal: Palette, rng: () => number): THREE.Group {
  const fork = new THREE.Group();
  const r = spec.wheelR;
  const w = spec.wheelW;
  const pivotY = r * 2.05;
  const trail = r * 0.42;             // caster offset — what makes a caster self-align

  const fb = new PartBuilder();

  // Vertical stem into the spoke socket.
  fb.add(cylinder(0.011, 0.013, 0.040, 6), pal.bright, { pos: [0, 0.006, 0] });
  // Shoulder plate. Deliberately the same material as the stem and legs: the fork cannot be
  // merged into the base (it swivels), so every extra material on it is a whole extra draw call.
  fb.add(chamferBox(0.048, 0.016, 0.052, 0.006), pal.bright, { pos: [0, -0.019, 0] });
  // Two fork legs straddling the twin wheels, offset behind the pivot by `trail`.
  // Legs run from the underside of the shoulder plate down past the axle, so the fork reads as
  // a single U rather than as two loose blocks beside the wheels.
  const legTop = -0.014;
  const legBot = -(pivotY - r) - r * 0.30;
  const legX = w * 0.60 + 0.004 + w * 0.5 + 0.009;
  for (const s of [-1, 1]) {
    fb.add(chamferBox(0.013, legTop - legBot, 0.034, 0.005), pal.bright, {
      pos: [s * legX, (legTop + legBot) * 0.5, trail],
    });
  }
  // Axle.
  fb.add(cylinder(0.006, 0.006, w * 2 + 0.030, 6), pal.bright, {
    pos: [0, -(pivotY - r), trail], rot: [0, 0, Math.PI * 0.5],
  });
  fb.flushInto(fork, 'casterFork');

  // Twin wheels — merged into one mesh so the pair is a single draw call, but kept out of the
  // fork's static merge so it can spin independently.
  const wb = new PartBuilder();
  for (const s of [-1, 1]) {
    wb.add(chamferDisc(r, w, r * 0.30, spec.wheelSeg), pal.tyre, { pos: [s * (w * 0.60 + 0.004), 0, 0] });
    wb.add(cylinder(r * 0.34, r * 0.34, w * 1.30, 6), pal.hubcap, {
      pos: [s * (w * 0.60 + 0.004), 0, 0], rot: [0, 0, Math.PI * 0.5],
    });
  }
  const wheels = new THREE.Group();
  wheels.name = 'casterWheels';
  wheels.position.set(0, -(pivotY - r), trail);
  wb.flushInto(wheels, 'casterWheel');
  fork.add(wheels);

  fork.userData.wheels = wheels;
  fork.userData.wheelRadius = r;
  fork.userData.trail = trail;
  // A battered chair's casters do not sit square.
  fork.rotation.y = (rng() - 0.5) * 0.6;
  fork.userData.triangles = fb.triangles + wb.triangles;
  return fork;
}

/** Gas-lift column: piston, chrome sleeve, bellows collar, height lever. Origin at the hub top. */
function buildColumn(spec: TierSpec, pal: Palette, baseTopY: number): { group: THREE.Group; triangles: number } {
  const group = new THREE.Group();
  group.name = 'chairColumn';
  group.position.y = baseTopY;

  const b = new PartBuilder();
  const rise = spec.seatY - baseTopY - 0.100;    // stop inside the seat mechanism housing

  // Outer sleeve (the fat lower half) — a hard chrome tube on tier 1+.
  const sleeveH = rise * 0.55;
  b.add(cylinder(0.030, 0.036, sleeveH, 10, true), spec.chromeSleeve ? pal.bright : pal.frame, {
    pos: [0, sleeveH * 0.5, 0],
  });
  // Bellows collar hiding the joint.
  b.add(cylinder(0.032, 0.040, 0.030, 10), pal.shell, { pos: [0, sleeveH + 0.006, 0] });
  // Inner piston.
  const pistonH = rise - sleeveH + 0.02;
  b.add(cylinder(0.024, 0.026, pistonH, 8), spec.chromeSleeve ? pal.bright : pal.frame, {
    pos: [0, sleeveH + pistonH * 0.5, 0],
  });
  // Height-adjust paddle sticking out to the right — a real silhouette cue at gameplay distance.
  b.add(chamferBox(0.016, 0.012, 0.085, 0.004), pal.bright, {
    pos: [0.048, rise - 0.026, -0.016], rot: [0, Math.PI * 0.5, 0.12],
  });

  const tris = b.flushInto(group, 'column');
  return { group, triangles: tris };
}

/**
 * Seat pan with a waterfall front edge, plus the tilt mechanism and the armrests.
 * The cushion is the dominant volume and OVERHANGS the shell on every side — the shell reads as
 * a dark recess under a padded slab, which is what sells "cushion" rather than "tray".
 */
function buildSeat(spec: TierSpec, pal: Palette): { group: THREE.Group; triangles: number } {
  const group = new THREE.Group();
  group.name = 'chairSeat';
  group.position.y = spec.seatY;

  const b = new PartBuilder();
  const w = spec.seatW, d = spec.seatD, t = spec.seatT;

  // NOTHING in this assembly may leave a vertical gap: every slab overlaps its neighbour, or the
  // chair reads as a stack of floating plates instead of one padded object.
  // Cushion occupies y in [0, t]. Everything structural hangs off the bottom of it.
  const shellY1 = 0.004;
  const shellY0 = -0.052;
  const mechY0 = -0.118;

  // Tilt mechanism housing, tucked under and inboard so it never breaks the silhouette.
  b.add(chamferBox(w * 0.34, shellY0 - mechY0 + 0.010, d * 0.40, 0.014), pal.shell, {
    pos: [0, (mechY0 + shellY0 + 0.010) * 0.5, 0.012],
  });
  // Rigid seat shell: smaller than the cushion in plan, so the cushion overhangs it all round.
  b.add(chamferBox(w * 0.84, shellY1 - shellY0, d * 0.84, 0.015), pal.shell, {
    pos: [0, (shellY0 + shellY1) * 0.5, 0],
  });

  // Main cushion, rear-biased.
  const mainD = d * 0.78;
  b.add(chamferBox(w, t, mainD, t * 0.34), pal.cushion, { pos: [0, t * 0.5, d * 0.5 - mainD * 0.5] });
  // Waterfall front: rolls down and away so the front edge is round, not a cut.
  b.add(chamferBox(w * 0.97, t * 0.90, d * 0.34, t * 0.40), pal.cushion, {
    pos: [0, t * 0.42, -d * 0.5 + d * 0.150], rot: [0.30, 0, 0],
  });
  // Side bolsters: a raised lip along the top outer edges, tilted inboard. This is the contour.
  for (const s of [-1, 1]) {
    b.add(chamferBox(0.056, t * 0.60, d * 0.70, t * 0.24), pal.cushion, {
      pos: [s * (w * 0.5 - 0.026), t * 0.78, d * 0.06], rot: [0, 0, -s * 0.24],
    });
  }
  if (spec.accents) {
    // Gold piping down the side seam of the cushion itself.
    for (const s of [-1, 1]) {
      b.add(chamferBox(0.008, 0.009, d * 0.62, 0.003), pal.accent, {
        pos: [s * (w * 0.5 - 0.002), t * 0.34, d * 0.04],
      });
    }
  }

  buildArms(spec, pal, b);

  const tris = b.flushInto(group, 'seat');
  return { group, triangles: tris };
}

/**
 * Armrests. Every style roots into the seat shell BELOW the cushion line (y < 0) so the riser
 * visibly grows out of the chair instead of floating beside it.
 */
function buildArms(spec: TierSpec, pal: Palette, b: PartBuilder): void {
  const w = spec.seatW, d = spec.seatD, t = spec.seatT;
  const padTop = 0.205;                 // pad top, above the seat top
  const padY = padTop - 0.017;          // pad centre
  const sparY = padTop - 0.046;         // spar centre, tucked under the pad
  const armX = w * 0.5 + 0.020;
  const rootY = -t * 0.5 - 0.030;       // buried inside the seat shell

  /** Vertical member spanning [y0, y1] — guarantees the riser meets both ends. */
  const riser = (bw: number, bd: number, y0: number, y1: number, ch: number) =>
    chamferBox(bw, y1 - y0, bd, ch);
  const midY = (y0: number, y1: number) => (y0 + y1) * 0.5;

  switch (spec.arms) {
    case 'stub': {
      // Battered chair: the left arm snapped off years ago; only the right stub and the bare
      // left bracket survive. Asymmetry is a free silhouette cue at 30 m.
      const y1 = padTop - 0.055;
      b.add(riser(0.034, 0.042, rootY, y1, 0.010), pal.frame, {
        pos: [armX - 0.008, midY(rootY, y1), d * 0.14], rot: [0, 0, -0.07],
      });
      b.add(chamferBox(0.042, 0.030, 0.150, 0.012), pal.frame, {
        pos: [armX - 0.016, y1 + 0.006, d * 0.02], rot: [0.10, 0, -0.16],
      });
      b.add(riser(0.030, 0.048, rootY, rootY + 0.055, 0.009), pal.frame, {
        pos: [-armX + 0.010, midY(rootY, rootY + 0.055), d * 0.14],
      });
      break;
    }
    case 'loop': {
      for (const s of [-1, 1]) {
        b.add(riser(0.032, 0.040, rootY, sparY + 0.015, 0.010), pal.frame, {
          pos: [s * armX, midY(rootY, sparY + 0.015), d * 0.24],
        });
        b.add(riser(0.028, 0.034, rootY + 0.020, sparY + 0.010, 0.009), pal.frame, {
          pos: [s * armX, midY(rootY + 0.020, sparY + 0.010), -d * 0.06], rot: [-0.30, 0, 0],
        });
        b.add(chamferBox(0.054, 0.034, d * 0.70, 0.014), pal.shell, {
          pos: [s * armX, padY, d * 0.06],
        });
      }
      break;
    }
    case 'tee': {
      for (const s of [-1, 1]) {
        const kneeY = rootY + 0.105;
        b.add(riser(0.040, 0.052, rootY, kneeY, 0.012), pal.shell, {
          pos: [s * (armX - 0.008), midY(rootY, kneeY), d * 0.20], rot: [0, 0, -s * 0.09],
        });
        b.add(riser(0.030, 0.036, kneeY - 0.014, sparY + 0.012, 0.009), pal.bright, {
          pos: [s * armX, midY(kneeY - 0.014, sparY + 0.012), d * 0.18],
        });
        b.add(chamferBox(0.064, 0.034, d * 0.60, 0.015), pal.cushion, {
          pos: [s * armX, padY, d * 0.05],
        });
      }
      break;
    }
    case 'cantilever': {
      for (const s of [-1, 1]) {
        // Chrome arc: riser out of the seat shell, swept spar forward, leather pad on top.
        b.add(riser(0.034, 0.050, rootY, sparY + 0.014, 0.012), pal.bright, {
          pos: [s * (armX - 0.004), midY(rootY, sparY + 0.014), d * 0.26], rot: [0, 0, -s * 0.10],
        });
        b.add(chamferBox(0.032, 0.036, d * 0.68, 0.012), pal.bright, {
          pos: [s * armX, sparY, d * 0.04], rot: [-0.04, 0, 0],
        });
        b.add(chamferBox(0.068, 0.036, d * 0.58, 0.016), pal.cushion, {
          pos: [s * armX, padY, d * 0.04],
        });
        b.add(chamferBox(0.072, 0.008, 0.028, 0.003), pal.accent, {
          pos: [s * armX, padTop - 0.006, -d * 0.18],
        });
      }
      break;
    }
  }
}

/**
 * The backrest. Built as a child of the seat so reclining the seat carries the back with it.
 * Attached by a visible spine bracket at the rear, leaving a real lumbar gap you can see
 * daylight (and grind sparks) through.
 */
function buildBack(spec: TierSpec, pal: Palette): { group: THREE.Group; triangles: number } {
  const group = new THREE.Group();
  group.name = 'chairBack';
  group.position.set(0, spec.seatT * 0.5, spec.seatD * 0.5 - 0.015);
  group.rotation.x = spec.backTilt;

  const b = new PartBuilder();
  const bw = spec.backW;
  const bh = spec.backH;
  const gap = spec.lumbarGap;

  // Spine bracket(s) rising out of the seat, through the lumbar gap.
  if (spec.meshBack) {
    for (const s of [-1, 1]) {
      b.add(chamferBox(0.034, gap + 0.075, 0.030, 0.010), pal.frame, {
        pos: [s * bw * 0.36, gap * 0.5 + 0.010, 0.012], rot: [-0.06, 0, -s * 0.05],
      });
    }
  } else {
    b.add(chamferBox(bw * 0.30, gap + 0.070, 0.032, 0.011), pal.frame, {
      pos: [0, gap * 0.5 + 0.008, 0.012], rot: [-0.06, 0, 0],
    });
  }

  const panelY0 = gap;

  if (spec.meshBack) {
    // Frame: two tapered uprights + a top rail, with a taut mesh membrane inside and a lumbar
    // bar bowing forward through it. Deep enough (48–60 mm) to read as a frame, not as card.
    for (const s of [-1, 1]) {
      const upright = chamferBox(0.044, bh, 0.068, 0.015);
      taper(upright, 'y', 1.0, 0.74);
      b.add(upright, pal.shell, {
        pos: [s * (bw * 0.5 - 0.018), panelY0 + bh * 0.5, 0.008], rot: [0, 0, -s * 0.045],
      });
    }
    const railT = 0.042;
    b.add(chamferBox(bw * 0.92, railT, 0.072, 0.016), pal.shell, {
      pos: [0, panelY0 + bh - railT * 0.4, 0.008],
    });
    // Lumbar support bar — bows forward, the signature of an ergonomic mesh chair.
    b.add(chamferBox(bw * 0.84, 0.054, 0.048, 0.017), pal.shell, {
      pos: [0, panelY0 + bh * 0.20, -0.030],
    });
    // Mesh membrane in two dished panels (upper leans back, lower bows forward).
    b.add(chamferBox(bw * 0.86, bh * 0.58, 0.038, 0.011), pal.mesh, {
      pos: [0, panelY0 + bh * 0.68, 0.016], rot: [-0.05, 0, 0],
    });
    b.add(chamferBox(bw * 0.86, bh * 0.42, 0.038, 0.011), pal.mesh, {
      pos: [0, panelY0 + bh * 0.22, -0.008], rot: [0.07, 0, 0],
    });
  } else {
    // Solid padded back: shell + two cushion panels split by a horizontal seam.
    b.add(chamferBox(bw, bh, 0.072, 0.020), pal.shell, { pos: [0, panelY0 + bh * 0.5, 0.024] });
    // Two cushion panels with a real gap between them: the dark shell shows through as a seam,
    // which is the only thing stopping a padded back from reading as one featureless brick.
    const lowH = bh * 0.40;
    const upH = bh * 0.46;
    b.add(chamferBox(bw * 0.94, lowH, 0.078, 0.026), pal.cushion, {
      pos: [0, panelY0 + lowH * 0.5 + 0.006, -0.028], rot: [-0.08, 0, 0],
    });
    b.add(chamferBox(bw * 0.88, upH, 0.070, 0.026), pal.cushion, {
      pos: [0, panelY0 + bh - upH * 0.5 - 0.006, -0.016], rot: [0.06, 0, 0],
    });
  }

  if (spec.headrest) {
    // Headrest on a pair of visible stalks, tipped forward — the lip in the refs.
    const hy = panelY0 + bh + 0.070;
    for (const s of [-1, 1]) {
      b.add(chamferBox(0.022, 0.090, 0.026, 0.007), pal.bright, {
        pos: [s * bw * 0.21, panelY0 + bh + 0.034, 0.010],
      });
    }
    b.add(chamferBox(bw * 0.62, 0.125, 0.082, 0.028), pal.cushion, {
      pos: [0, hy + 0.040, -0.002], rot: [0.16, 0, 0],
    });
  } else {
    // No headrest, but still a rolled top lip so the back does not end on a flat cut.
    b.add(chamferBox(bw * 0.94, 0.050, 0.082, 0.024), pal.cushion, {
      pos: [0, panelY0 + bh + 0.008, -0.012], rot: [-0.14, 0, 0],
    });
  }

  const tris = b.flushInto(group, 'back');
  return { group, triangles: tris };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Build a complete office chair. Origin on the floor, facing -Z, real-world metres.
 *
 * The returned root also carries:
 *   root.userData.swivel    — Group holding column + seat; rotate its .y to spin the chair top
 *   root.userData.tier      — the tier that was built
 *   root.userData.triangles — exact triangle count
 */
export function buildOfficeChair(opts?: ChairOptions): ChairParts {
  const tier = (opts?.tier ?? 1) as ChairTier;
  const spec = TIERS[tier] ?? TIERS[1];
  const rng = makeRng(opts?.seed ?? 1337 + tier * 7919);
  const pal = paletteFor(tier);

  const root = new THREE.Group();
  root.name = `officeChair_t${tier}`;

  const baseBuilt = buildBase(spec, pal, rng);
  root.add(baseBuilt.group);

  // Everything above the gas lift swivels as one unit.
  const swivel = new THREE.Group();
  swivel.name = 'chairSwivel';
  root.add(swivel);

  const baseTopY = spec.wheelR * 2.05 + 0.020 + 0.060;
  const columnBuilt = buildColumn(spec, pal, baseTopY);
  swivel.add(columnBuilt.group);

  const seatBuilt = buildSeat(spec, pal);
  swivel.add(seatBuilt.group);

  const backBuilt = buildBack(spec, pal);
  seatBuilt.group.add(backBuilt.group);

  root.userData.swivel = swivel;
  root.userData.tier = tier;
  root.userData.triangles =
    baseBuilt.triangles + columnBuilt.triangles + seatBuilt.triangles + backBuilt.triangles +
    baseBuilt.casters.reduce((n, c) => n + ((c.userData.triangles as number) ?? 0), 0);

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return {
    root,
    seat: seatBuilt.group,
    back: backBuilt.group,
    column: columnBuilt.group,
    base: baseBuilt.group,
    casters: baseBuilt.casters,
    wheelContactPoints: baseBuilt.contacts,
  };
}

// ---------------------------------------------------------------------------
// Caster animation
// ---------------------------------------------------------------------------

interface CasterState {
  spin: number;
  yaw: number[];
  prevPos: THREE.Vector3;
  hasPrev: boolean;
}

const CASTER_STATE = new WeakMap<THREE.Object3D, CasterState>();

const _worldPos = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _localDir = new THREE.Vector3();
const _invQuat = new THREE.Quaternion();

/**
 * Spin the caster wheels and swivel the forks so they trail the direction of travel.
 *
 * `speed` is the chair's ground speed in metres/second (unsigned magnitude is fine — the sign is
 * recovered from the root's actual motion when it is moving). Call once per frame with the frame
 * delta, after the chair's transform has been written.
 *
 * The trail direction is derived from the root's own world-space displacement between calls, so
 * this works whether the chair is driven by physics, by an animation, or dragged in an editor.
 */
export function spinCasters(parts: ChairParts, speed: number, dt: number): void {
  if (!parts || dt <= 0) return;
  const root = parts.root;

  let st = CASTER_STATE.get(root);
  if (!st) {
    st = { spin: 0, yaw: parts.casters.map((c) => c.rotation.y), prevPos: new THREE.Vector3(), hasPrev: false };
    CASTER_STATE.set(root, st);
  }
  while (st.yaw.length < parts.casters.length) st.yaw.push(0);

  root.updateWorldMatrix(true, false);
  _worldPos.setFromMatrixPosition(root.matrixWorld);

  // World displacement -> chair-local direction of travel.
  let moving = false;
  if (st.hasPrev) {
    _vel.subVectors(_worldPos, st.prevPos).divideScalar(dt);
    if (_vel.lengthSq() > 1e-6) {
      root.getWorldQuaternion(_invQuat).invert();
      _localDir.copy(_vel).applyQuaternion(_invQuat);
      _localDir.y = 0;
      moving = _localDir.lengthSq() > 1e-6;
      if (moving) _localDir.normalize();
    }
  }
  st.prevPos.copy(_worldPos);
  st.hasPrev = true;

  const measured = moving ? _vel.length() : 0;
  const v = Math.abs(speed) > 1e-4 ? Math.abs(speed) : measured;

  if (!moving) {
    // No usable heading (spinning on the spot, or first frame): assume forward, which is -Z.
    _localDir.set(0, 0, -1);
  }

  // A trailing caster points its wheels AWAY from the direction of travel: the fork's local -Z
  // (where the wheels sit, offset by `trail`) ends up behind the pivot.
  const targetYaw = Math.atan2(-_localDir.x, -_localDir.z);

  // Faster = snappier alignment, exactly like a real caster.
  const align = 1 - Math.exp(-dt * (2.5 + Math.min(v, 12) * 2.2));

  for (let i = 0; i < parts.casters.length; i++) {
    const fork = parts.casters[i];
    const r = (fork.userData.wheelRadius as number) || 0.03;

    let yaw = st.yaw[i];
    let delta = targetYaw - yaw;
    // Shortest way round.
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    yaw += delta * align;
    st.yaw[i] = yaw;
    fork.rotation.y = yaw;

    const wheels = fork.userData.wheels as THREE.Object3D | undefined;
    if (wheels) {
      // Rolling without slipping: omega = v / r. Signed by whether we are going forward.
      wheels.rotation.x += (v / r) * dt;
      if (wheels.rotation.x > Math.PI * 2) wheels.rotation.x -= Math.PI * 2;
    }
  }

  st.spin += v * dt;
}

/** Free every geometry the chair owns. Materials belong to MaterialLibrary — left alone. */
export function disposeChair(parts: ChairParts): void {
  parts.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
  CASTER_STATE.delete(parts.root);
}
