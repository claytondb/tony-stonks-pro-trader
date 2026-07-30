/**
 * FloorDecals — localised carpet wear: coffee stains, scuff patches, worn corners.
 *
 * A floorplate with no wear is the clearest single tell that a level was generated rather
 * than dressed. MaterialLibrary's carpet shader already supplies the LARGE-scale traffic
 * darkening and the fluorescent light-pool pattern (see LIGHT_POOL_OFFICE); what it cannot
 * supply is a specific stain in a specific place — at the foot of the coffee machine, in the
 * corner a chair has been dragged over for ten years. That is what this is for.
 *
 * WHY THIS IS NOT A MaterialLibrary ENTRY: it needs unlit alpha-over-albedo blending, which
 * the library deliberately does not express, and it is not a PBR surface — it is dirt sitting
 * on one. Running it through the PBR path would have the key light modulate the stain, which
 * is backwards.
 *
 * One InstancedMesh: 1 draw call, 2 × N triangles, no shadow-map cost.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Canvas texture generation (no network, no binary assets)
// ---------------------------------------------------------------------------

const texCache = new Map<string, THREE.Texture>();

function canvas(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void): HTMLCanvasElement {
  const el = document.createElement('canvas');
  el.width = size;
  el.height = size;
  const ctx = el.getContext('2d');
  if (ctx) draw(ctx, size);
  return el;
}

function toTexture(key: string, el: HTMLCanvasElement): THREE.Texture {
  const t = new THREE.CanvasTexture(el);
  // Albedo-ish colour data on both of these, so sRGB.
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  t.name = key;
  return t;
}

/** Irregular dirt/scuff blob: several overlapping soft lobes with a fibrous speckle. */
function wearTexture(): THREE.Texture {
  const hit = texCache.get('floorWear');
  if (hit) return hit;
  const el = canvas(256, (c, s) => {
    c.clearRect(0, 0, s, s);
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    c.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 9; i++) {
      const cx = s * (0.3 + rnd() * 0.4);
      const cy = s * (0.3 + rnd() * 0.4);
      const rad = s * (0.14 + rnd() * 0.20);
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, 'rgba(58,44,30,0.55)');
      g.addColorStop(0.55, 'rgba(58,44,30,0.22)');
      g.addColorStop(1, 'rgba(58,44,30,0)');
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(cx, cy, rad, rad * (0.6 + rnd() * 0.7), rnd() * Math.PI, 0, Math.PI * 2);
      c.fill();
    }
    // Fibre speckle so the stain does not read as an airbrushed blur.
    for (let i = 0; i < 900; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const d = Math.hypot(x - s / 2, y - s / 2) / (s / 2);
      if (d > 0.92 || rnd() < d) continue;
      c.fillStyle = `rgba(42,32,22,${(0.18 * (1 - d)).toFixed(3)})`;
      c.fillRect(x, y, 1 + rnd() * 2, 1 + rnd());
    }
  });
  const t = toTexture('floorWear', el);
  texCache.set('floorWear', t);
  return t;
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export interface DecalPlacement {
  x: number;
  z: number;
  /** World size along X. */
  width: number;
  /** World size along Z. Defaults to `width`. */
  depth?: number;
  rotation?: number;
  /** 0..1 multiplier baked into the instance colour. */
  strength?: number;
}

function buildDecalBatch(
  name: string,
  placements: readonly DecalPlacement[],
  material: THREE.MeshBasicMaterial,
  y: number,
  colorFor: (strength: number, out: THREE.Color) => THREE.Color,
): THREE.InstancedMesh {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const n = Math.max(1, placements.length);
  const im = new THREE.InstancedMesh(geo, material, n);
  im.name = name;
  im.castShadow = false;
  im.receiveShadow = false;
  im.frustumCulled = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const c = new THREE.Color();

  placements.forEach((d, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.rotation ?? 0);
    p.set(d.x, y, d.z);
    sc.set(d.width, 1, d.depth ?? d.width);
    m.compose(p, q, sc);
    im.setMatrixAt(i, m);
    im.setColorAt(i, colorFor(d.strength ?? 1, c));
  });
  if (!placements.length) im.count = 0;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.computeBoundingSphere();
  return im;
}

/** Traffic-lane wear, coffee stains and scuffs. Alpha-over, so it darkens the carpet. */
export function makeFloorWear(placements: readonly DecalPlacement[]): THREE.InstancedMesh {
  const material = new THREE.MeshBasicMaterial({
    map: wearTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.85,
    toneMapped: true,
    fog: true,
  });
  material.name = 'floorWear';
  // Alpha-over: the texture already carries the alpha, so `strength` cannot ride on it.
  // Instead it lightens the stain's RGB toward the carpet, which weakens it perceptually.
  return buildDecalBatch('floorWear', placements, material, 0.006, (s, out) => {
    const k = 1 + (1 - Math.max(0, Math.min(1, s))) * 1.4;
    return out.setRGB(k, k, k);
  });
}

/** Free the canvas textures these decals own. */
export function disposeFloorDecals(): void {
  for (const t of texCache.values()) t.dispose();
  texCache.clear();
}
