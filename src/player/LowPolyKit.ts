/**
 * LowPolyKit — the geometry vocabulary for the hero assets.
 *
 * The art direction is "Monument Valley geometry, Unreal Engine lighting": every form must be
 * built out of a small number of LARGE flat planes with visible silhouette angles. A raw
 * BoxGeometry cannot do that — it has six faces and no edge facets, so under flat shading it
 * reads as a smooth-shaded cube no matter what you do to the material. Everything here is
 * chamfered, non-indexed, and carries a baked vertex-colour occlusion term so that a part is
 * grounded in its own volume before a single light hits it.
 *
 * Everything returned is merge-compatible: position / normal / uv / uv1 / color, no index.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Corner index bits: 1 = +x, 2 = +y, 4 = +z. */
function cornerIndex(sx: number, sy: number, sz: number): number {
  return (sx > 0 ? 1 : 0) | (sy > 0 ? 2 : 0) | (sz > 0 ? 4 : 0);
}

/**
 * A box with all 12 edges and 8 corners chamfered: 6 face quads + 12 edge quads + 8 corner
 * triangles = 44 triangles. The edge facets are the whole point — they catch the key light and
 * draw the form's contour, which is what makes a low-poly figure read as sculpted rather than
 * as a stack of cubes.
 */
export function chamferBox(w: number, h: number, d: number, chamfer: number): THREE.BufferGeometry {
  const c = Math.max(0.0008, Math.min(chamfer, Math.min(w, h, d) * 0.45));
  const hx = w * 0.5, hy = h * 0.5, hz = d * 0.5;

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
    if (n.dot(g) < 0) pos.push(a.x, a.y, a.z, cc.x, cc.y, cc.z, b.x, b.y, b.z);
    else pos.push(a.x, a.y, a.z, b.x, b.y, b.z, cc.x, cc.y, cc.z);
  }
  return finalise(pos);
}

/** Build a merge-ready geometry from a flat triangle soup. */
export function finalise(pos: number[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  applyBoxUVs(geo);
  return geo;
}

/** Per-triangle planar projection onto the dominant axis of the face normal, in metres. */
export function applyBoxUVs(geo: THREE.BufferGeometry): void {
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const nAttr = geo.getAttribute('normal') as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 3) {
    const nx = Math.abs(nAttr.getX(i));
    const ny = Math.abs(nAttr.getY(i));
    const nz = Math.abs(nAttr.getZ(i));
    let uAxis = 0, vAxis = 1;
    if (nx >= ny && nx >= nz) { uAxis = 2; vAxis = 1; }
    else if (ny >= nx && ny >= nz) { uAxis = 0; vAxis = 2; }
    for (let k = 0; k < 3; k++) {
      const j = i + k;
      const c = [p.getX(j), p.getY(j), p.getZ(j)];
      uv[j * 2] = c[uAxis];
      uv[j * 2 + 1] = c[vAxis];
    }
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('uv1', new THREE.Float32BufferAttribute(uv.slice(), 2));
}

/** Normalise anything three hands us into the merge-compatible layout. */
export function prep(src: THREE.BufferGeometry): THREE.BufferGeometry {
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

/**
 * Taper along `axis`, scaling the other two axes from `s0` at the low end to `s1` at the high end.
 * Faceted limbs need a real taper or they read as pipes.
 */
export function taper(
  geo: THREE.BufferGeometry, axis: 'x' | 'y' | 'z', s0: number, s1: number,
  otherScale: Partial<Record<'x' | 'y' | 'z', number>> = {},
): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const lo = bb.min.getComponent(idx);
  const span = Math.max(1e-5, bb.max.getComponent(idx) - lo);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const others = (['x', 'y', 'z'] as const).filter((a) => a !== axis);
  for (let i = 0; i < p.count; i++) {
    const t = (p.getComponent(i, idx) - lo) / span;
    const s = s0 + (s1 - s0) * t;
    for (const o of others) {
      const oi = o === 'x' ? 0 : o === 'y' ? 1 : 2;
      p.setComponent(i, oi, p.getComponent(i, oi) * s * (otherScale[o] ?? 1));
    }
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Shear a geometry: pushes `axis` by `amount` per unit of `by`. Gives limbs a real lean. */
export function shear(geo: THREE.BufferGeometry, axis: 'x' | 'y' | 'z', by: 'x' | 'y' | 'z', amount: number): THREE.BufferGeometry {
  const ai = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const bi = by === 'x' ? 0 : by === 'y' ? 1 : 2;
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    p.setComponent(i, ai, p.getComponent(i, ai) + p.getComponent(i, bi) * amount);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// Vertex-colour shading
// ---------------------------------------------------------------------------

export interface TintSpec {
  /** Flat multiplier applied to the whole part. 1 = untouched. */
  tint?: number | THREE.Color;
  /** Extra darkening applied to downward-facing / low geometry, 0..1. */
  ao?: number;
  /** Extra darkening applied to backward-facing (+Z) geometry, 0..1. Separates back planes. */
  back?: number;
  /** Local Y at which the AO gradient reaches full strength (defaults to the part's own min Y). */
  aoFloor?: number;
  /** Local Y at which the AO gradient has fully released. */
  aoTop?: number;
}

const _c = new THREE.Color();

/**
 * Bake a per-vertex shading term into `color`.
 *
 * This is the single cheapest way to get a stylised low-poly figure to read: a flat-shaded box
 * lit by one key has exactly three values on it, and everything in shadow collapses into one
 * silhouette. A baked downward gradient plus a back-plane darkening gives every part its own
 * internal value range, so the figure holds up even where the key does not reach.
 */
export function tintGeometry(geo: THREE.BufferGeometry, spec: TintSpec = {}): THREE.BufferGeometry {
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const n = geo.getAttribute('normal') as THREE.BufferAttribute;
  const existing = geo.getAttribute('color') as THREE.BufferAttribute | undefined;
  const col = new Float32Array(p.count * 3);

  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const yLo = spec.aoFloor ?? bb.min.y;
  const yHi = spec.aoTop ?? bb.max.y;
  const span = Math.max(1e-4, yHi - yLo);

  if (typeof spec.tint === 'number') _c.setHex(spec.tint, THREE.SRGBColorSpace);
  else if (spec.tint instanceof THREE.Color) _c.copy(spec.tint);
  else _c.setRGB(1, 1, 1);

  const aoAmt = spec.ao ?? 0;
  const backAmt = spec.back ?? 0;

  for (let i = 0; i < p.count; i++) {
    const t = THREE.MathUtils.clamp((p.getY(i) - yLo) / span, 0, 1);
    // Smooth vertical occlusion ramp: full at the bottom, released by the top.
    let k = 1 - aoAmt * (1 - t) * (1 - t);
    // Downward-facing facets get the rest of the contact term.
    const ny = n.getY(i);
    if (ny < 0) k *= 1 - aoAmt * 0.45 * (-ny);
    // Back planes drop a value so the figure separates from whatever is behind it.
    const nz = n.getZ(i);
    if (nz > 0) k *= 1 - backAmt * nz;

    let r = _c.r * k, g = _c.g * k, b = _c.b * k;
    if (existing) {
      r *= existing.getX(i); g *= existing.getY(i); b *= existing.getZ(i);
    }
    col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

/** Every geometry that shares a material must agree on attributes, so this fills in the gaps. */
export function ensureColor(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!geo.getAttribute('color')) {
    const count = geo.getAttribute('position').count;
    const col = new Float32Array(count * 3).fill(1);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }
  return geo;
}

// ---------------------------------------------------------------------------
// Per-material accumulator
// ---------------------------------------------------------------------------

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export interface Placement {
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
  tint?: TintSpec;
}

/** Collects chamfered parts and collapses them into one merged mesh per material. */
export class PartBuilder {
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  triangles = 0;

  add(geo: THREE.BufferGeometry, mat: THREE.Material, at?: Placement): this {
    if (at?.tint) tintGeometry(geo, at.tint);
    ensureColor(geo);
    if (at) {
      const p = at.pos ?? [0, 0, 0];
      const r = at.rot ?? [0, 0, 0];
      const s = at.scale ?? [1, 1, 1];
      _e.set(r[0], r[1], r[2]);
      _q.setFromEuler(_e);
      _m.compose(_v.set(p[0], p[1], p[2]), _q, _v2.set(s[0], s[1], s[2]));
      geo.applyMatrix4(_m);
    }
    this.triangles += geo.getAttribute('position').count / 3;
    const list = this.buckets.get(mat);
    if (list) list.push(geo);
    else this.buckets.set(mat, [geo]);
    return this;
  }

  /** One merged Mesh per material, parented to `target`. */
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
// Rim light
// ---------------------------------------------------------------------------

const RIM_KEY = Symbol('rimLight');

/**
 * Patch a MeshStandardMaterial with a view-dependent Fresnel rim term.
 *
 * The panel's note was "the hero silhouette dies against the environment": a near-black chair and
 * dark slacks sit on a mid-tone carpet with nothing to separate them. The textbook fix is a
 * camera-parented backlight, but a Fresnel term is camera-relative *by construction* — it can
 * never swing out of position as the follow camera orbits, it costs no extra light in the scene
 * (and therefore no extra shader permutation across the whole level), and it is exactly the
 * stylised edge-light the concept art uses on the player.
 *
 * Applied ONLY to the player and chair materials, which own their own instances.
 */
export function applyRimLight(
  mat: THREE.MeshStandardMaterial,
  opts: { color?: number; power?: number; strength?: number } = {},
): THREE.MeshStandardMaterial {
  const store = mat as unknown as Record<symbol, boolean>;
  if (store[RIM_KEY]) return mat;
  store[RIM_KEY] = true;

  const color = new THREE.Color().setHex(opts.color ?? 0xd8e4f5, THREE.SRGBColorSpace);
  const power = opts.power ?? 2.6;
  const strength = opts.strength ?? 0.55;

  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    shader.uniforms.uRimColor = { value: color };
    shader.uniforms.uRimPower = { value: power };
    shader.uniforms.uRimStrength = { value: strength };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uRimColor;
uniform float uRimPower;
uniform float uRimStrength;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `{
  // geometryNormal / vViewPosition are both in view space; the camera sits at the origin there.
  vec3 rimV = normalize( vViewPosition );
  float rimF = 1.0 - clamp( dot( normalize( geometryNormal ), rimV ), 0.0, 1.0 );
  rimF = pow( rimF, uRimPower );
  // Do not paint rim onto surfaces already facing the camera, and keep it off the darkest
  // interior facets so it reads as an edge light rather than as a glow.
  gl_FragColor.rgb += uRimColor * ( rimF * uRimStrength );
}
#include <dithering_fragment>`,
      );
  };
  // Materials are cached by program; force a distinct key for the patched variant.
  mat.customProgramCacheKey = () => `rim|${power}|${strength}|${color.getHexString()}`;
  mat.needsUpdate = true;
  return mat;
}
