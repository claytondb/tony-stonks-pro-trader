/**
 * ProceduralTextures.ts
 * ---------------------------------------------------------------------------
 * Fully procedural, deterministic PBR texture generator for Tony Stonks Pro
 * Trader.  Everything is authored into a canvas (OffscreenCanvas where
 * available, HTMLCanvasElement otherwise) — no network fetches, no binary
 * assets, no external dependencies beyond three.
 *
 * For every SurfaceId we build:
 *   - a height field  (Float32, 0..1, tileable)
 *   - an albedo field (RGBA bytes, sRGB)
 *   - a roughness field (Float32, 0..1, linear)
 *   - optionally AO + metalness fields
 * and then derive a tangent-space normal map from the height field with a
 * wrapping Sobel operator.
 *
 * Colour space rules (the #1 cause of washed-out WebGL):
 *   albedo -> THREE.SRGBColorSpace
 *   normal / roughness / metalness / ao -> left at the three.js default
 *   (NoColorSpace / linear).  We never touch .colorSpace on those.
 *
 * Tiling: every noise primitive in this file is periodic, so every generated
 * map tiles seamlessly with RepeatWrapping.
 *
 * Determinism: a small mulberry32 PRNG plus an integer hash.  Same input ->
 * byte-identical output on every run, every machine.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SurfaceId =
  | 'officeCarpet' | 'ceilingTile' | 'cubicleFabric' | 'deskLaminate' | 'drywall' | 'concreteFloor'
  | 'asphalt' | 'sidewalk' | 'brushedMetal' | 'darkPlastic' | 'rubber' | 'whiteboard' | 'paper'
  | 'brick' | 'cardboard' | 'woodFloor' | 'ceilingGridMetal' | 'fabricSeat' | 'officeGlass' | 'noise';

export interface TextureSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  aoMap?: THREE.Texture;
  metalnessMap?: THREE.Texture;
}

/** Every SurfaceId, in contact-sheet order. Useful for warmup + debug. */
export const SURFACE_IDS: readonly SurfaceId[] = [
  'officeCarpet', 'ceilingTile', 'cubicleFabric', 'deskLaminate', 'drywall',
  'concreteFloor', 'asphalt', 'sidewalk', 'brushedMetal', 'darkPlastic',
  'rubber', 'whiteboard', 'paper', 'brick', 'cardboard',
  'woodFloor', 'ceilingGridMetal', 'fabricSeat', 'officeGlass', 'noise',
] as const;

// ---------------------------------------------------------------------------
// Deterministic PRNG + hashes
// ---------------------------------------------------------------------------

/** mulberry32 — tiny, fast, good enough, and fully deterministic. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over a string -> stable 32-bit seed. */
function strSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Integer lattice hash -> [0,1). Wraps naturally when cell indices wrap. */
function ihash(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// Small math helpers
// ---------------------------------------------------------------------------

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => t * t * (3 - 2 * t);
const smoothstepR = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0 || 1e-6));
  return t * t * (3 - 2 * t);
};
const fract = (v: number): number => v - Math.floor(v);

function rgbOf(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

// ---------------------------------------------------------------------------
// Tileable noise primitives
// ---------------------------------------------------------------------------

/**
 * Periodic value noise on an integer lattice with independent X/Y periods.
 * `periodX` / `periodY` are the number of lattice cells across the texture,
 * so the result is seamlessly tileable for any integer period.
 */
function latticeNoise(size: number, periodX: number, periodY: number, seed: number): Float32Array {
  const px = Math.max(1, Math.min(size, Math.round(periodX)));
  const py = Math.max(1, Math.min(size, Math.round(periodY)));
  const rnd = mulberry32(seed);
  const g = new Float32Array(px * py);
  for (let i = 0; i < g.length; i++) g[i] = rnd();

  const out = new Float32Array(size * size);
  const sx = px / size;
  const sy = py / size;

  for (let y = 0; y < size; y++) {
    const fy = y * sy;
    const y0 = Math.floor(fy);
    const ty = smooth(fy - y0);
    const r0 = ((y0 % py) + py) % py;
    const r1 = (r0 + 1) % py;
    const rowA = r0 * px;
    const rowB = r1 * px;
    const o = y * size;
    for (let x = 0; x < size; x++) {
      const fx = x * sx;
      const x0 = Math.floor(fx);
      const tx = smooth(fx - x0);
      const c0 = ((x0 % px) + px) % px;
      const c1 = (c0 + 1) % px;
      const a = g[rowA + c0];
      const b = g[rowA + c1];
      const c = g[rowB + c0];
      const d = g[rowB + c1];
      const top = a + (b - a) * tx;
      const bot = c + (d - c) * tx;
      out[o + x] = top + (bot - top) * ty;
    }
  }
  return out;
}

/** Fractal sum of periodic value noise. Result normalised to [0,1]. */
function fbm(
  size: number, periodX: number, periodY: number,
  octaves: number, gain: number, seed: number,
): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const m = 1 << o;
    const layer = latticeNoise(size, periodX * m, periodY * m, seed + o * 7919);
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amp;
    total += amp;
    amp *= gain;
  }
  const inv = 1 / total;
  for (let i = 0; i < out.length; i++) out[i] *= inv;
  return out;
}

/** Ridged variant — sharp creases, good for fissures / cracks / grain. */
function ridged(
  size: number, periodX: number, periodY: number,
  octaves: number, gain: number, seed: number,
): Float32Array {
  const f = fbm(size, periodX, periodY, octaves, gain, seed);
  for (let i = 0; i < f.length; i++) f[i] = 1 - Math.abs(f[i] * 2 - 1);
  return f;
}

/**
 * Tileable Worley / cellular F1 distance field, normalised to roughly [0,1].
 * `cells` is the cell count across the texture (so it wraps for any integer).
 */
function worley(size: number, cells: number, seed: number, jitter = 0.85): Float32Array {
  const n = Math.max(1, Math.round(cells));
  const rnd = mulberry32(seed);
  const pts = new Float32Array(n * n * 2);
  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      const i = (cy * n + cx) * 2;
      pts[i] = (cx + 0.5 + (rnd() - 0.5) * jitter) / n;
      pts[i + 1] = (cy + 0.5 + (rnd() - 0.5) * jitter) / n;
    }
  }
  const out = new Float32Array(size * size);
  const inv = 1 / size;
  const norm = n * 1.42;
  for (let y = 0; y < size; y++) {
    const fy = (y + 0.5) * inv;
    const cy = Math.floor(fy * n);
    const o = y * size;
    for (let x = 0; x < size; x++) {
      const fx = (x + 0.5) * inv;
      const cx = Math.floor(fx * n);
      let best = 1e9;
      for (let oy = -1; oy <= 1; oy++) {
        let gy = cy + oy;
        let wy = 0;
        if (gy < 0) { gy += n; wy = -1; } else if (gy >= n) { gy -= n; wy = 1; }
        for (let ox = -1; ox <= 1; ox++) {
          let gx = cx + ox;
          let wx = 0;
          if (gx < 0) { gx += n; wx = -1; } else if (gx >= n) { gx -= n; wx = 1; }
          const i = (gy * n + gx) * 2;
          const dx = pts[i] + wx - fx;
          const dy = pts[i + 1] + wy - fy;
          const d = dx * dx + dy * dy;
          if (d < best) best = d;
        }
      }
      out[o + x] = clamp01(Math.sqrt(best) * norm);
    }
  }
  return out;
}

interface CellField {
  dist: Float32Array;   // F1 distance, 0..1
  idA: Float32Array;    // stable hash of the winning cell, 0..1
  idB: Float32Array;    // second, independent hash of the winning cell
}

/**
 * Worley variant that also reports which cell won, so callers can give every
 * cell its own colour. This is what turns "grey noise" into "a carpet made of
 * individually dyed yarn loops".
 */
function worleyCells(size: number, cells: number, seed: number, jitter = 0.9): CellField {
  const n = Math.max(1, Math.round(cells));
  const rnd = mulberry32(seed);
  const pts = new Float32Array(n * n * 2);
  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      const i = (cy * n + cx) * 2;
      pts[i] = (cx + 0.5 + (rnd() - 0.5) * jitter) / n;
      pts[i + 1] = (cy + 0.5 + (rnd() - 0.5) * jitter) / n;
    }
  }
  const dist = new Float32Array(size * size);
  const idA = new Float32Array(size * size);
  const idB = new Float32Array(size * size);
  const inv = 1 / size;
  const norm = n * 1.42;
  for (let y = 0; y < size; y++) {
    const fy = (y + 0.5) * inv;
    const cy = Math.floor(fy * n);
    const o = y * size;
    for (let x = 0; x < size; x++) {
      const fx = (x + 0.5) * inv;
      const cx = Math.floor(fx * n);
      let best = 1e9;
      let bx = 0;
      let by = 0;
      for (let oy = -1; oy <= 1; oy++) {
        let gy = cy + oy;
        let wy = 0;
        if (gy < 0) { gy += n; wy = -1; } else if (gy >= n) { gy -= n; wy = 1; }
        for (let ox = -1; ox <= 1; ox++) {
          let gx = cx + ox;
          let wx = 0;
          if (gx < 0) { gx += n; wx = -1; } else if (gx >= n) { gx -= n; wx = 1; }
          const i = (gy * n + gx) * 2;
          const dx = pts[i] + wx - fx;
          const dy = pts[i + 1] + wy - fy;
          const d = dx * dx + dy * dy;
          if (d < best) { best = d; bx = gx; by = gy; }
        }
      }
      const k = o + x;
      dist[k] = clamp01(Math.sqrt(best) * norm);
      idA[k] = ihash(bx, by, seed + 5501);
      idB[k] = ihash(bx, by, seed + 9907);
    }
  }
  return { dist, idA, idB };
}

// ---------------------------------------------------------------------------
// Canvas plumbing
// ---------------------------------------------------------------------------

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

function createCanvas(w: number, h: number): AnyCanvas {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  throw new Error('[ProceduralTextures] no canvas implementation available');
}

function ctx2d(canvas: AnyCanvas): CanvasRenderingContext2D {
  const c = (canvas as HTMLCanvasElement).getContext('2d', { willReadFrequently: true });
  if (!c) throw new Error('[ProceduralTextures] could not acquire a 2D context');
  return c as CanvasRenderingContext2D;
}

/**
 * Runs a deterministic draw callback nine times (3x3 offsets) so that anything
 * spilling over an edge reappears on the opposite side — the cheap, reliable
 * way to get seamless hand-drawn detail layers. Returns the red channel as a
 * 0..1 Float32 field.
 */
function drawWrappedField(size: number, draw: (c: CanvasRenderingContext2D) => void): Float32Array {
  const cv = createCanvas(size, size);
  const c = ctx2d(cv);
  c.fillStyle = '#000';
  c.fillRect(0, 0, size, size);
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      c.save();
      c.translate(ox * size, oy * size);
      draw(c);
      c.restore();
    }
  }
  const img = c.getImageData(0, 0, size, size).data;
  const out = new Float32Array(size * size);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) out[i] = img[p] / 255;
  return out;
}

// ---------------------------------------------------------------------------
// Map assembly (height -> normal, float -> greyscale texture, etc.)
// ---------------------------------------------------------------------------

interface RawMaps {
  albedo: Uint8ClampedArray;   // RGBA, sRGB encoded
  height: Float32Array;        // 0..1
  rough: Float32Array;         // 0..1 linear
  ao?: Float32Array;           // 0..1 linear
  metal?: Float32Array;        // 0..1 linear
  normalStrength: number;      // bump slope multiplier
}

/**
 * Wrapping Sobel -> tangent-space normal map (OpenGL / +Y convention).
 *
 * Derivation: for H(u,v) the geometric normal is (-dH/du, -dH/dv, 1).
 * CanvasTexture has flipY = true, so image row `iy` maps to v = 1 - iy/size,
 * hence dH/dv = -dH/d(iy) and the green channel ends up as +gradY.
 */
function heightToNormalBytes(height: Float32Array, size: number, strength: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const idx = (x: number, y: number): number => ((y & (size - 1)) * size + (x & (size - 1)));
  const usePow2 = (size & (size - 1)) === 0;
  const at = usePow2
    ? (x: number, y: number): number => height[idx(x, y)]
    : (x: number, y: number): number => height[(((y % size) + size) % size) * size + (((x % size) + size) % size)];

  // Sobel returns 8x the per-texel gradient, so scale = strength/8 * gain.
  // Resolution independent, because every generator defines its feature sizes
  // relative to `size`. strength ~1 => a 0.1-per-texel step tilts ~30 degrees.
  const scale = strength * 0.72;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = at(x - 1, y - 1), tc = at(x, y - 1), tr = at(x + 1, y - 1);
      const ml = at(x - 1, y), mr = at(x + 1, y);
      const bl = at(x - 1, y + 1), bc = at(x, y + 1), br = at(x + 1, y + 1);
      const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
      const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
      let nx = -gx * scale;
      let ny = gy * scale;
      const nz = 1;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= inv;
      ny *= inv;
      const p = (y * size + x) * 4;
      out[p] = (nx * 0.5 + 0.5) * 255;
      out[p + 1] = (ny * 0.5 + 0.5) * 255;
      out[p + 2] = (nz * inv * 0.5 + 0.5) * 255;
      out[p + 3] = 255;
    }
  }
  return out;
}

function bytesToTexture(bytes: Uint8ClampedArray, size: number, srgb: boolean): THREE.CanvasTexture {
  const cv = createCanvas(size, size);
  const c = ctx2d(cv);
  const img = c.createImageData(size, size);
  img.data.set(bytes);
  c.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv as HTMLCanvasElement);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Standard ORM packing: R = ambient occlusion, G = roughness, B = metalness.
 * three.js reads aoMap.r / roughnessMap.g / metalnessMap.b, so a single texture
 * can serve all three slots — one upload, one third of the VRAM, and the
 * material still compiles to exactly the same shader.
 */
function ormToTexture(
  size: number, rough: Float32Array,
  ao: Float32Array | undefined, metal: Float32Array | undefined,
): THREE.CanvasTexture {
  const bytes = new Uint8ClampedArray(size * size * 4);
  for (let i = 0, p = 0; i < rough.length; i++, p += 4) {
    bytes[p] = ao ? clamp01(ao[i]) * 255 : 255;
    bytes[p + 1] = clamp01(rough[i]) * 255;
    bytes[p + 2] = metal ? clamp01(metal[i]) * 255 : 0;
    bytes[p + 3] = 255;
  }
  return bytesToTexture(bytes, size, false);
}

// ---------------------------------------------------------------------------
// Surface generators
// ---------------------------------------------------------------------------

type SurfaceGenerator = (size: number, seed: number) => RawMaps;

/** Convenience: allocate the three mandatory buffers. */
function buffers(size: number): { a: Uint8ClampedArray; h: Float32Array; r: Float32Array } {
  return {
    a: new Uint8ClampedArray(size * size * 4),
    h: new Float32Array(size * size),
    r: new Float32Array(size * size),
  };
}

// ---- officeCarpet ---------------------------------------------------------
// Commercial low-pile loop carpet. This is the single most visible surface in
// the whole game so it gets the most attention: two greys plus a faint warm
// fleck, a real loop structure in the height field, large-scale traffic
// mottling, and near-total roughness with subtle variation.
const genOfficeCarpet: SurfaceGenerator = (size, seed) => {
  const { a, h, r } = buffers(size);
  const ao = new Float32Array(size * size);

  // One cell per yarn loop. ~7px at 1024 -> reads as texture, not as static.
  const loop = worleyCells(size, Math.round(size / 7.0), seed + 11, 0.95);
  const loopFine = worley(size, Math.round(size / 3.0), seed + 12, 0.95);
  const fine = fbm(size, size / 4, size / 4, 2, 0.55, seed + 21);
  const mottle = fbm(size, 6, 6, 4, 0.55, seed + 31);
  const soil = fbm(size, 2, 2, 3, 0.6, seed + 41);   // very large traffic pattern
  // Loop carpet is tufted in rows: a faint directional beat across V.
  const rowPeriod = Math.max(2, size / 72);

  // Light commercial grey-taupe. Keep the values high — under the warm/cool
  // interior rig this is the surface that sets the whole scene's key.
  const cDark = rgbOf(0x716e68);
  const cMid = rgbOf(0x8d8a82);
  const cLight = rgbOf(0xa5a196);
  const cWarm = rgbOf(0x93866d);

  for (let y = 0; y < size; y++) {
    const rowBeat = 0.5 + 0.5 * Math.cos((y / rowPeriod) * Math.PI * 2);
    for (let x = 0; x < size; x++) {
      const i = y * size + x;

      // --- loop structure: inverted cell distance = a rounded dome per loop
      const dome = Math.pow(1 - loop.dist[i], 1.5);
      const domeFine = Math.pow(1 - loopFine[i], 2.4) * 0.30;
      const height = clamp01(dome * 0.70 + domeFine + fine[i] * 0.14 + rowBeat * 0.05);
      h[i] = height;

      // --- one yarn colour per loop; carpet is a heather of a few dyes
      const pick = loop.idA[i];
      const shade = loop.idB[i];
      let cr: number, cg: number, cb: number;
      if (pick < 0.40) {
        const t = 0.25 + shade * 0.6;
        cr = lerp(cDark[0], cMid[0], t); cg = lerp(cDark[1], cMid[1], t); cb = lerp(cDark[2], cMid[2], t);
      } else if (pick < 0.88) {
        const t = shade;
        cr = lerp(cMid[0], cLight[0], t); cg = lerp(cMid[1], cLight[1], t); cb = lerp(cMid[2], cLight[2], t);
      } else {
        // faint warm fleck — the thing that stops it reading as dead grey
        const t = 0.30 + shade * 0.45;
        cr = lerp(cMid[0], cWarm[0], t); cg = lerp(cMid[1], cWarm[1], t); cb = lerp(cMid[2], cWarm[2], t);
      }

      // --- shading: loops catch light on top, go dark in the gaps between
      const occl = 0.80 + 0.20 * Math.pow(height, 0.85);
      const traffic = 0.95 + 0.11 * mottle[i] - 0.08 * soil[i];
      const k = occl * traffic;

      const p = i * 4;
      a[p] = cr * k;
      a[p + 1] = cg * k;
      a[p + 2] = cb * k;
      a[p + 3] = 255;

      // --- roughness: carpet is basically fully rough; polished traffic lanes
      // are marginally smoother, which reads as a sheen under the strip lights
      r[i] = clamp01(0.965 - 0.055 * soil[i] - 0.020 * fine[i] + 0.015 * dome);
      ao[i] = clamp01(0.58 + 0.42 * Math.pow(height, 0.7));
    }
  }
  return { albedo: a, height: h, rough: r, ao, normalStrength: 1.15 };
};

// ---- ceilingTile ----------------------------------------------------------
// 2x2 arrangement of 2ft acoustic mineral-fibre tiles: pinholes, fissures,
// bevelled edges and a slight per-tile tint drift.
const genCeilingTile: SurfaceGenerator = (size, seed) => {
  const { a, h, r } = buffers(size);
  const ao = new Float32Array(size * size);

  const grain = fbm(size, size / 6, size / 6, 2, 0.5, seed + 3);
  const blotch = fbm(size, 8, 8, 3, 0.55, seed + 5);

  // Hand-drawn fissures, wrapped so they tile.
  const rnd = mulberry32(seed + 909);
  const strokes: { x: number; y: number; a: number; len: number; w: number; bend: number }[] = [];
  const strokeCount = Math.round(size / 3.2);
  for (let i = 0; i < strokeCount; i++) {
    strokes.push({
      x: rnd() * size,
      y: rnd() * size,
      a: rnd() * Math.PI * 2,
      len: size * (0.02 + rnd() * 0.085),
      w: 0.9 + rnd() * 1.8,
      bend: (rnd() - 0.5) * 1.5,
    });
  }
  const fissures = drawWrappedField(size, (c) => {
    c.strokeStyle = '#fff';
    c.lineCap = 'round';
    for (const s of strokes) {
      c.lineWidth = s.w;
      const ex = s.x + Math.cos(s.a) * s.len;
      const ey = s.y + Math.sin(s.a) * s.len;
      const mx = (s.x + ex) * 0.5 - Math.sin(s.a) * s.len * s.bend * 0.4;
      const my = (s.y + ey) * 0.5 + Math.cos(s.a) * s.len * s.bend * 0.4;
      c.beginPath();
      c.moveTo(s.x, s.y);
      c.quadraticCurveTo(mx, my, ex, ey);
      c.stroke();
    }
  });

  const base = rgbOf(0xe8e5db);
  const tilePx = size / 2;           // 2x2 tiles per texture
  const holeCell = Math.max(3, Math.round(size / 110));
  const bevel = 0.050;
  const gap = 0.010;

  for (let y = 0; y < size; y++) {
    const lvRaw = (y % tilePx) / tilePx;
    const tileY = (y / tilePx) | 0;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const luRaw = (x % tilePx) / tilePx;
      const tileX = (x / tilePx) | 0;

      const de = Math.min(luRaw, 1 - luRaw, lvRaw, 1 - lvRaw);
      // bevelled reveal around the tile edge
      const bev = de < bevel ? Math.pow(1 - de / bevel, 1.4) : 0;
      // dark seam right at the join
      const seam = de < gap ? 1 - de / gap : 0;

      // pinholes
      const hx = (x / holeCell) | 0;
      const hy = (y / holeCell) | 0;
      const hp = ihash(hx, hy, seed + 401);
      let hole = 0;
      if (hp < 0.34) {
        const jx = (hx + 0.5 + (ihash(hx, hy, seed + 402) - 0.5) * 0.7) * holeCell;
        const jy = (hy + 0.5 + (ihash(hx, hy, seed + 403) - 0.5) * 0.7) * holeCell;
        const dx = x + 0.5 - jx;
        const dy = y + 0.5 - jy;
        const d = Math.sqrt(dx * dx + dy * dy);
        hole = 1 - smoothstepR(holeCell * 0.16, holeCell * 0.34, d);
      }

      const fis = fissures[i];
      const height = clamp01(0.80 + grain[i] * 0.08 - fis * 0.26 - hole * 0.30 - bev * 0.55 - seam * 0.7);
      h[i] = height;

      // per-tile tint drift + age blotching
      const tint = 0.975 + ihash(tileX, tileY, seed + 88) * 0.035;
      const age = 0.965 + blotch[i] * 0.06;
      const k = tint * age * (1 - fis * 0.085) * (1 - hole * 0.16) * (1 - seam * 0.30) * (1 - bev * 0.06);

      const p = i * 4;
      a[p] = base[0] * k;
      a[p + 1] = base[1] * k * 0.998;
      a[p + 2] = base[2] * k * 0.99;
      a[p + 3] = 255;

      r[i] = clamp01(0.90 + fis * 0.06 + hole * 0.05 - blotch[i] * 0.04);
      ao[i] = clamp01(1 - fis * 0.35 - hole * 0.45 - bev * 0.30 - seam * 0.45);
    }
  }
  return { albedo: a, height: h, rough: r, ao, normalStrength: 1.1 };
};

// ---- cubicleFabric --------------------------------------------------------
// Coarse plain-weave partition fabric, muted grey-blue/teal. The weave has to
// be readable in the normal map at grazing angles — that is the whole point.
const genCubicleFabric: SurfaceGenerator = (size, seed) => {
  const { a, h, r } = buffers(size);
  const ao = new Float32Array(size * size);

  const threads = 68;                              // threads across the tile
  const T = size / threads;
  const fuzz = fbm(size, size / 2.2, size / 2.2, 2, 0.5, seed + 7);
  const dye = fbm(size, 6, 6, 3, 0.55, seed + 9);

  // Reference cubicle panels are a light blue-grey, not a dark teal — leave
  // headroom so MaterialLibrary can tint downward with `color` if it wants.
  const cBase = rgbOf(0x76858a);
  const cLift = rgbOf(0x94a3a6);
  const cDeep = rgbOf(0x5b6a6e);

  for (let y = 0; y < size; y++) {
    const wy = y / T;
    const iy = Math.floor(wy);
    const fy = wy - iy;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const wx = x / T;
      const ix = Math.floor(wx);
      const fx = wx - ix;

      // plain weave: warp over on even parity, weft over on odd
      const warpOver = ((ix + iy) & 1) === 0;
      // rounded thread cross-sections
      const warpProfile = Math.sin(Math.PI * fx);
      const weftProfile = Math.sin(Math.PI * fy);
      const over = warpOver ? warpProfile : weftProfile;
      const under = warpOver ? weftProfile : warpProfile;
      const height = clamp01(0.30 + over * 0.55 + under * 0.14 + fuzz[i] * 0.16);
      h[i] = height;

      // per-thread colour jitter so it doesn't read as a printed pattern
      const tv = warpOver ? ihash(ix, 0, seed + 51) : ihash(0, iy, seed + 52);
      const shade = 0.42 + 0.34 * over;
      const t = clamp01(shade * (0.85 + tv * 0.3) * (0.94 + dye[i] * 0.14));

      let cr: number, cg: number, cb: number;
      if (t < 0.5) {
        const u = t * 2;
        cr = lerp(cDeep[0], cBase[0], u); cg = lerp(cDeep[1], cBase[1], u); cb = lerp(cDeep[2], cBase[2], u);
      } else {
        const u = (t - 0.5) * 2;
        cr = lerp(cBase[0], cLift[0], u); cg = lerp(cBase[1], cLift[1], u); cb = lerp(cBase[2], cLift[2], u);
      }
      const fuzzLift = 1 + (fuzz[i] - 0.5) * 0.07;

      const p = i * 4;
      a[p] = cr * fuzzLift;
      a[p + 1] = cg * fuzzLift;
      a[p + 2] = cb * fuzzLift;
      a[p + 3] = 255;

      r[i] = clamp01(0.90 - over * 0.07 + fuzz[i] * 0.05);
      ao[i] = clamp01(0.5 + 0.5 * Math.pow(height, 0.6));
    }
  }
  return { albedo: a, height: h, rough: r, ao, normalStrength: 1.25 };
};

// ---- deskLaminate ---------------------------------------------------------
// Light maple/beech melamine with a fine open grain and a low-roughness
// clearcoat. Grain runs along U.
const genDeskLaminate: SurfaceGenerator = (size, seed) => {
  const { a, h, r } = buffers(size);

  // long-in-U, tight-in-V noise = wood grain
  const grain = fbm(size, 4, size / 3.0, 4, 0.55, seed + 13);
  const fibre = fbm(size, 3, size / 1.4, 2, 0.5, seed + 14);
  const warp = fbm(size, 2, 4, 3, 0.5, seed + 15);
  const scratch = fbm(size, 2, size / 1.2, 2, 0.45, seed + 16);
  const patch = fbm(size, 4, 4, 3, 0.55, seed + 17);

  const cLight = rgbOf(0xe3c79c);
  const cMid = rgbOf(0xc9a677);
  const cDark = rgbOf(0x9d7a4e);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      // growth-ring banding, warped so it isn't a sine. Beech/maple laminate
      // has a straight, tight, low-contrast grain — not knotty pine.
      const band = fract(y / size * 13 + warp[i] * 0.35 + grain[i] * 0.20);
      const ring = Math.pow(1 - Math.abs(band * 2 - 1), 4.0);
      const g = clamp01(0.12 + grain[i] * 0.58 + fibre[i] * 0.20 + ring * 0.26);

      let cr: number, cg: number, cb: number;
      if (g < 0.55) {
        const u = g / 0.55;
        cr = lerp(cLight[0], cMid[0], u); cg = lerp(cLight[1], cMid[1], u); cb = lerp(cLight[2], cMid[2], u);
      } else {
        const u = (g - 0.55) / 0.45;
        cr = lerp(cMid[0], cDark[0], u); cg = lerp(cMid[1], cDark[1], u); cb = lerp(cMid[2], cDark[2], u);
      }
      const k = 0.95 + patch[i] * 0.10;

      const p = i * 4;
      a[p] = cr * k;
      a[p + 1] = cg * k;
      a[p + 2] = cb * k;
      a[p + 3] = 255;

      // laminate is physically flat — only the pores dip
      h[i] = clamp01(0.75 - ring * 0.30 - fibre[i] * 0.12);
      // clearcoat: glossy, with hazier micro-scratch lanes
      r[i] = clamp01(0.26 + scratch[i] * 0.14 + patch[i] * 0.07 + ring * 0.06);
    }
  }
  return { albedo: a, height: h, rough: r, normalStrength: 0.32 };
};

// ---- drywall --------------------------------------------------------------
// Painted orange-peel. Almost no albedo variation — it lives entirely in the
// normal map, which is exactly what makes big flat walls read as real.
const genDrywall: SurfaceGenerator = (size, seed) => {
  const { a, h, r } = buffers(size);

  const peelA = worley(size, Math.round(size / 12), seed + 23, 1.0);
  const peelB = worley(size, Math.round(size / 26), seed + 24, 1.0);
  const micro = fbm(size, size / 3, size / 3, 2, 0.5, seed + 25);
  const tone = fbm(size, 3, 3, 3, 0.55, seed + 26);
  const roller = fbm(size, 2, size / 7, 2, 0.5, seed + 27);   // faint roller streaks

  const base = rgbOf(0xd9d4ca);

  for (let i = 0; i < size * size; i++) {
    const peel = Math.pow(1 - peelA[i], 2.4) * 0.6 + Math.pow(1 - peelB[i], 2.0) * 0.4;
    h[i] = clamp01(0.45 + peel * 0.45 + micro[i] * 0.10);
    const k = 0.975 + tone[i] * 0.045 + (roller[i] - 0.5) * 0.020;
    const p = i * 4;
    a[p] = base[0] * k;
    a[p + 1] = base[1] * k;
    a[p + 2] = base[2] * k * 0.995;
    a[p + 3] = 255;
    r[i] = clamp01(0.88 + micro[i] * 0.05 - peel * 0.04);
  }
  return { albedo: a, height: h, rough: r, normalStrength: 0.55 };
};

// ---- concreteFloor --------------------------------------------------------
const genConcreteFloor: SurfaceGenerator = (size, seed) => {
  const { a, h, r } = buffers(size);
  const ao = new Float32Array(size * size);

  const mottle = fbm(size, 5, 5, 5, 0.55, seed + 33);
  const agg = worley(size, Math.round(size / 9), seed + 34, 1.0);
  const aggBig = worley(size, Math.round(size / 26), seed + 35, 1.0);
  const pores = worley(size, Math.round(size / 5), seed + 36, 1.0);
  // High-frequency ridged noise + a sparse mask = hairline cracks, not camo.
  const cracks = ridged(size, 14, 14, 3, 0.6, seed + 37);
  const crackMask = fbm(size, 3, 3, 2, 0.5, seed + 39);
  const stain = fbm(size, 2, 2, 3, 0.6, seed + 38);

  const base = rgbOf(0x8d8a84);

  for (let i = 0; i < size * size; i++) {
    const pore = Math.pow(1 - pores[i], 7.0);
    const crack = smoothstepR(0.955, 0.995, cracks[i]) * smoothstepR(0.35, 0.65, crackMask[i]);
    const stone = Math.pow(1 - agg[i], 3.0) * 0.5 + Math.pow(1 - aggBig[i], 2.4) * 0.5;

    h[i] = clamp01(0.72 + stone * 0.10 + mottle[i] * 0.10 - pore * 0.55 - crack * 0.5);

    const k = (0.88 + mottle[i] * 0.22) * (1 - pore * 0.30) * (1 - crack * 0.30) * (0.95 + stain[i] * 0.10);
    const warm = 1 + (stain[i] - 0.5) * 0.05;
    const p = i * 4;
    a[p] = base[0] * k * warm;
    a[p + 1] = base[1] * k;
    a[p + 2] = base[2] * k * (2 - warm);
    a[p + 3] = 255;

    // part-sealed slab: broad polished patches, rough where it's worn through
    r[i] = clamp01(0.46 + mottle[i] * 0.34 + pore * 0.20 + crack * 0.15);
    ao[i] = clamp01(1 - pore * 0.5 - crack * 0.45 - (1 - mottle[i]) * 0.06);
  }
  return { albedo: a, height: h, rough: r, ao, normalStrength: 0.85 };
};

// ---- asphalt --------------------------------------------------------------
const genAsphalt: SurfaceGenerator = (size, seed) => {
  const { a, h, r } = buffers(size);

  const agg = worley(size, Math.round(size / 7), seed + 43, 1.0);
  const aggFine = worley(size, Math.round(size / 3.2), seed + 44, 1.0);
  const grit = fbm(size, size / 2.5, size / 2.5, 2, 0.5, seed + 45);
  const wear = fbm(size, 3, 3, 4, 0.6, seed + 46);
  const patchN = fbm(size, 2, 2, 3, 0.55, seed + 47);

  const dark = rgbOf(0x2f3134);
  const mid = rgbOf(0x4a4c50);
  const stone = rgbOf(0x8b8a86);

  for (let i = 0; i < size * size; i++) {
    const bigStone = Math.pow(1 - agg[i], 3.2);
    const smallStone = Math.pow(1 - aggFine[i], 4.0);
    const s = clamp01(bigStone * 0.75 + smallStone * 0.55);

    h[i] = clamp01(0.4 + bigStone * 0.45 + smallStone * 0.25 + grit[i] * 0.15);

    // stones peek out of the bitumen where it's worn
    const exposure = clamp01(s * (0.45 + wear[i] * 0.9));
    let cr = lerp(dark[0], mid[0], patchN[i]);
    let cg = lerp(dark[1], mid[1], patchN[i]);
    let cb = lerp(dark[2], mid[2], patchN[i]);
    cr = lerp(cr, stone[0], exposure * 0.8);
    cg = lerp(cg, stone[1], exposure * 0.8);
    cb = lerp(cb, stone[2], exposure * 0.8);
    const k = 0.88 + grit[i] * 0.22;

    const p = i * 4;
    a[p] = cr * k;
    a[p + 1] = cg * k;
    a[p + 2] = cb * k;
    a[p + 3] = 255;

    r[i] = clamp01(0.94 - wear[i] * 0.16 - exposure * 0.08);
  }
  return { albedo: a, height: h, rough: r, normalStrength: 1.5 };
};

// ---- sidewalk -------------------------------------------------------------
// One slab per texture tile: score joints split across the UV boundary so that
// tiling produces a continuous grid, plus a broom finish running along U.
const genSidewalk: SurfaceGenerator = (size, seed) => {
  const { a, h, r } = buffers(size);
  const ao = new Float32Array(size * size);

  const broom = latticeNoise(size, 6, Math.round(size / 3.0), seed + 53);
  const mottle = fbm(size, 6, 6, 4, 0.55, seed + 54);
  const agg = worley(size, Math.round(size / 12), seed + 55, 1.0);
  const chips = worley(size, Math.round(size / 4), seed + 56, 1.0);
  const grime = fbm(size, 2, 2, 3, 0.6, seed + 57);

  const base = rgbOf(0xb6b2a9);
  const jointW = 0.030;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const dv = Math.min(v, 1 - v);
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const du = Math.min(u, 1 - u);
      const dj = Math.min(du, dv);
      // hard-edged tooled joint with a rounded lip either side of it
      const joint = dj < jointW ? Math.pow(1 - dj / jointW, 0.65) : 0;

      const stone = Math.pow(1 - agg[i], 3.0);
      const chip = Math.pow(1 - chips[i], 8.0);
      const broomLine = broom[i];

      h[i] = clamp01(0.78 + stone * 0.06 + broomLine * 0.14 - chip * 0.4 - joint * 0.9);

      const k = (0.92 + mottle[i] * 0.16 + (broomLine - 0.5) * 0.05)
        * (1 - joint * 0.34) * (1 - chip * 0.22) * (0.96 + grime[i] * 0.07);
      const p = i * 4;
      a[p] = base[0] * k;
      a[p + 1] = base[1] * k;
      a[p + 2] = base[2] * k * (0.98 + grime[i] * 0.04);
      a[p + 3] = 255;

      r[i] = clamp01(0.86 + broomLine * 0.06 + joint * 0.06 - mottle[i] * 0.06);
      ao[i] = clamp01(1 - joint * 0.75 - chip * 0.3);
    }
  }
  return { albedo: a, height: h, rough: r, ao, normalStrength: 1.0 };
};

// ---- brushedMetal ---------------------------------------------------------
// Anisotropic streaks along U. Ships a metalness map so it can be dropped onto
// rails / handles without the caller guessing.
const genBrushedMetal: SurfaceGenerator = (size, seed) => {
  const { a, h, r } = buffers(size);
  const metal = new Float32Array(size * size);

  const streakA = latticeNoise(size, 2, Math.round(size / 1.15), seed + 63);
  const streakB = fbm(size, 3, size / 5, 3, 0.55, seed + 64);
  const broad = fbm(size, 4, 10, 3, 0.55, seed + 65);
  const dings = worley(size, Math.round(size / 40), seed + 66, 1.0);

  const base = rgbOf(0xbcbfc2);

  for (let i = 0; i < size * size; i++) {
    const s = clamp01(streakA[i] * 0.55 + streakB[i] * 0.45);
    const ding = Math.pow(1 - dings[i], 9.0);
    h[i] = clamp01(0.55 + s * 0.4 - ding * 0.5);
    const k = 0.94 + s * 0.10 + broad[i] * 0.04 - ding * 0.10;
    const p = i * 4;
    a[p] = base[0] * k;
    a[p + 1] = base[1] * k;
    a[p + 2] = base[2] * k;
    a[p + 3] = 255;
    r[i] = clamp01(0.20 + s * 0.26 + broad[i] * 0.06 + ding * 0.20);
    metal[i] = clamp01(1 - ding * 0.25);
  }
  return { albedo: a, height: h, rough: r, metal, normalStrength: 0.40 };
};

// ---- darkPlastic ----------------------------------------------------------
// Fine pebble/leatherette grain — monitors, keyboards, chair shells, casters.
const genDarkPlastic: SurfaceGenerator = (size, seed) => {
  const { a, h, r } = buffers(size);

  const pebble = worley(size, Math.round(size / 4.5), seed + 73, 1.0);
  const pebbleB = worley(size, Math.round(size / 9), seed + 74, 1.0);
  const micro = fbm(size, size / 2, size / 2, 2, 0.5, seed + 75);
  const sheen = fbm(size, 5, 5, 3, 0.55, seed + 76);

  const base = rgbOf(0x25282c);

  for (let i = 0; i < size * size; i++) {
    const g = Math.pow(1 - pebble[i], 2.2) * 0.65 + Math.pow(1 - pebbleB[i], 2.0) * 0.35;
    h[i] = clamp01(0.4 + g * 0.5 + micro[i] * 0.1);
    const k = 0.86 + g * 0.24 + sheen[i] * 0.06;
    const p = i * 4;
    a[p] = base[0] * k;
    a[p + 1] = base[1] * k;
    a[p + 2] = base[2] * k * 1.02;
    a[p + 3] = 255;
    // grain tips catch a little specular, valleys stay matte
    r[i] = clamp01(0.62 - g * 0.20 + micro[i] * 0.08 - sheen[i] * 0.05);
  }
  return { albedo: a, height: h, rough: r, normalStrength: 0.9 };
};

// ---- rubber ---------------------------------------------------------------
const genRubber: SurfaceGenerator = (size, seed) => {
  const { a, h, r } = buffers(size);

  const micro = fbm(size, size / 2.2, size / 2.2, 3, 0.5, seed + 83);
  const dimple = worley(size, Math.round(size / 14), seed + 84, 1.0);
  const dust = fbm(size, 6, 6, 3, 0.6, seed + 85);

  const base = rgbOf(0x1c1d1f);

  for (let i = 0; i < size * size; i++) {
    const d = Math.pow(1 - dimple[i], 5.0);
    h[i] = clamp01(0.55 + micro[i] * 0.3 - d * 0.35);
    const k = 0.88 + micro[i] * 0.22 + dust[i] * 0.10;
    const p = i * 4;
    a[p] = base[0] * k;
    a[p + 1] = base[1] * k;
    a[p + 2] = base[2] * k;
    a[p + 3] = 255;
    r[i] = clamp01(0.92 + micro[i] * 0.06 - d * 0.06);
  }
  return { albedo: a, height: h, rough: r, normalStrength: 0.7 };
};

// ---- whiteboard -----------------------------------------------------------
// Near-mirror melamine with ghosted marker residue. Reads as a bright specular
// slab under the strip lights, which is exactly what the refs show.
const genWhiteboard: SurfaceGenerator = (size, seed) => {
  const { a, h, r } = buffers(size);

  const rnd = mulberry32(seed + 606);
  const ghosts: { x: number; y: number; a: number; len: number; w: number; alpha: number }[] = [];
  for (let i = 0; i < 26; i++) {
    ghosts.push({
      x: rnd() * size,
      y: rnd() * size,
      a: (rnd() - 0.5) * 0.5 + (rnd() < 0.5 ? 0 : Math.PI * 0.5),
      len: size * (0.06 + rnd() * 0.3),
      w: 2 + rnd() * 7,
      alpha: 0.05 + rnd() * 0.13,
    });
  }
  const ghost = drawWrappedField(size, (c) => {
    c.lineCap = 'round';
    for (const g of ghosts) {
      c.strokeStyle = `rgba(255,255,255,${g.alpha})`;
      c.lineWidth = g.w;
      c.beginPath();
      c.moveTo(g.x, g.y);
      c.lineTo(g.x + Math.cos(g.a) * g.len, g.y + Math.sin(g.a) * g.len);
      c.stroke();
    }
  });

  const wipe = fbm(size, 3, size / 5, 2, 0.5, seed + 93);
  const micro = fbm(size, size / 3, size / 3, 2, 0.5, seed + 94);
  const base = rgbOf(0xf3f4f2);

  for (let i = 0; i < size * size; i++) {
    h[i] = clamp01(0.6 + micro[i] * 0.15 - ghost[i] * 0.05);
    const k = 1 - ghost[i] * 0.10 - wipe[i] * 0.015;
    const p = i * 4;
    a[p] = base[0] * k;
    a[p + 1] = base[1] * k;
    a[p + 2] = base[2] * k;
    a[p + 3] = 255;
    r[i] = clamp01(0.08 + ghost[i] * 0.22 + wipe[i] * 0.06);
  }
  return { albedo: a, height: h, rough: r, normalStrength: 0.16 };
};

// ---- paper ----------------------------------------------------------------
// Plain office bond — the scattered A4 sheets flying around in the refs.
const genPaper: SurfaceGenerator = (size, seed) => {
  const { a, h, r } = buffers(size);

  const fibreA = fbm(size, size / 2, size / 2.4, 2, 0.5, seed + 103);
  const fibreB = fbm(size, size / 3.2, size / 2, 2, 0.5, seed + 104);
  const cockle = fbm(size, 7, 7, 3, 0.55, seed + 105);   // gentle waviness
  const tone = fbm(size, 3, 3, 3, 0.6, seed + 106);

  const base = rgbOf(0xf4f2ec);

  for (let i = 0; i < size * size; i++) {
    const fib = (fibreA[i] * 0.55 + fibreB[i] * 0.45);
    h[i] = clamp01(0.4 + cockle[i] * 0.45 + fib * 0.15);
    // rare darker flecks (recycled pulp)
    const fleck = fib < 0.14 ? (0.14 - fib) * 1.6 : 0;
    const k = (0.985 + tone[i] * 0.022 + (fib - 0.5) * 0.020) * (1 - fleck * 0.35);
    const p = i * 4;
    a[p] = base[0] * k;
    a[p + 1] = base[1] * k;
    a[p + 2] = base[2] * k * (0.995 + tone[i] * 0.01);
    a[p + 3] = 255;
    r[i] = clamp01(0.80 + fib * 0.10 - cockle[i] * 0.05);
  }
  return { albedo: a, height: h, rough: r, normalStrength: 0.42 };
};

// ---- brick ----------------------------------------------------------------
const genBrick: SurfaceGenerator = (size, seed) => {
  const { a, h, r } = buffers(size);
  const ao = new Float32Array(size * size);

  const rows = 8;
  const cols = 4;
  const rowH = size / rows;
  const colW = size / cols;
  const mortarV = 0.10;   // fraction of a row height
  const mortarH = 0.030;  // fraction of a column width

  const face = fbm(size, size / 8, size / 8, 3, 0.55, seed + 113);
  const grit = fbm(size, size / 2.5, size / 2.5, 2, 0.5, seed + 114);
  const wearN = fbm(size, 5, 5, 4, 0.6, seed + 115);
  const chip = worley(size, Math.round(size / 6), seed + 116, 1.0);

  const brickPal: [number, number, number][] = [
    rgbOf(0x8c4736), rgbOf(0xa05b41), rgbOf(0x743a30),
    rgbOf(0x96543f), rgbOf(0x6d4038), rgbOf(0xa9694a),
    rgbOf(0x7e4a3c),
  ];
  const mortar = rgbOf(0xb3ada1);

  for (let y = 0; y < size; y++) {
    const ry = y / rowH;
    const row = Math.floor(ry);
    const fy = ry - row;
    const stagger = (row & 1) === 0 ? 0 : 0.5;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const rx = x / colW + stagger;
      const col = Math.floor(rx);
      const fx = rx - col;

      const dV = Math.min(fy, 1 - fy);
      const dH = Math.min(fx, 1 - fx);
      const inMortar = dV < mortarV || dH < mortarH;
      const edge = Math.min(dV / mortarV, dH / mortarH);   // 0 at joint, 1 well inside

      const brickIdx = Math.floor(ihash(col, row, seed + 121) * brickPal.length) % brickPal.length;
      const bc = brickPal[brickIdx];
      const bVar = 0.86 + ihash(col, row, seed + 122) * 0.28;

      const chipMask = Math.pow(1 - chip[i], 6.0) * (1 - smoothstepR(0.0, 0.35, edge)) * 1.2;

      if (inMortar || chipMask > 0.5) {
        const k = 0.86 + face[i] * 0.20 + grit[i] * 0.10;
        const p = i * 4;
        a[p] = mortar[0] * k;
        a[p + 1] = mortar[1] * k;
        a[p + 2] = mortar[2] * k;
        a[p + 3] = 255;
        h[i] = clamp01(0.28 + grit[i] * 0.16 + smoothstepR(0, 1, edge) * 0.12);
        r[i] = clamp01(0.94 + grit[i] * 0.05);
        ao[i] = clamp01(0.35 + smoothstepR(0, 0.8, edge) * 0.45);
      } else {
        const k = bVar * (0.88 + face[i] * 0.22) * (0.95 + wearN[i] * 0.10);
        const p = i * 4;
        a[p] = bc[0] * k;
        a[p + 1] = bc[1] * k;
        a[p + 2] = bc[2] * k;
        a[p + 3] = 255;
        const bevel = smoothstepR(0, 0.30, edge);
        h[i] = clamp01(0.55 + bevel * 0.40 + face[i] * 0.08 + grit[i] * 0.05);
        r[i] = clamp01(0.88 + face[i] * 0.08 - wearN[i] * 0.06);
        ao[i] = clamp01(0.45 + bevel * 0.55);
      }
    }
  }
  return { albedo: a, height: h, rough: r, ao, normalStrength: 1.6 };
};

// ---- cardboard ------------------------------------------------------------
const genCardboard: SurfaceGenerator = (size, seed) => {
  const { a, h, r } = buffers(size);

  const fibre = fbm(size, size / 2, size / 2.6, 2, 0.5, seed + 123);
  const blotch = fbm(size, 5, 5, 3, 0.6, seed + 124);
  const speck = fbm(size, size / 1.4, size / 1.4, 1, 0.5, seed + 125);

  const base = rgbOf(0xb98f5d);
  const fluteP = Math.max(4, Math.round(size / 26));   // corrugation showing through

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const flute = 0.5 + 0.5 * Math.cos((x / fluteP) * Math.PI * 2 + blotch[i] * 1.2);
      h[i] = clamp01(0.45 + flute * 0.14 + fibre[i] * 0.34 + speck[i] * 0.10);
      const dark = speck[i] < 0.13 ? (0.13 - speck[i]) * 2.2 : 0;
      const k = (0.88 + fibre[i] * 0.20 + blotch[i] * 0.14 + flute * 0.015) * (1 - dark * 0.35);
      const p = i * 4;
      a[p] = base[0] * k;
      a[p + 1] = base[1] * k * (0.985 + blotch[i] * 0.02);
      a[p + 2] = base[2] * k * 0.96;
      a[p + 3] = 255;
      r[i] = clamp01(0.90 + fibre[i] * 0.07 - blotch[i] * 0.04);
    }
  }
  return { albedo: a, height: h, rough: r, normalStrength: 0.55 };
};

// ---- woodFloor ------------------------------------------------------------
const genWoodFloor: SurfaceGenerator = (size, seed) => {
  const { a, h, r } = buffers(size);
  const ao = new Float32Array(size * size);

  const planks = 5;
  const plankH = size / planks;
  const grain = fbm(size, 4, size / 2.4, 4, 0.55, seed + 133);
  const fibre = fbm(size, 3, size / 1.3, 2, 0.5, seed + 134);
  const warpN = fbm(size, 4, 5, 3, 0.55, seed + 135);
  const wear = fbm(size, 3, 3, 4, 0.6, seed + 136);

  const cLight = rgbOf(0xb98a58);
  const cMid = rgbOf(0x93643c);
  const cDark = rgbOf(0x63412a);

  const seamW = 0.035;   // fraction of plank height
  const endW = 0.006;    // fraction of texture width

  for (let y = 0; y < size; y++) {
    const py = y / plankH;
    const plank = Math.floor(py);
    const fy = py - plank;
    const dSeam = Math.min(fy, 1 - fy);
    // two end joints per plank, offset per plank so it staggers, wraps in U
    const off = ihash(plank, 0, seed + 141);
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const e1 = Math.abs(fract(u - off + 0.5) - 0.5);
      const e2 = Math.abs(fract(u - off - 0.5 + 0.5) - 0.5);
      const dEnd = Math.min(e1, e2);

      const seam = dSeam < seamW ? Math.pow(1 - dSeam / seamW, 1.1) : 0;
      const end = dEnd < endW ? Math.pow(1 - dEnd / endW, 1.1) : 0;
      const joint = Math.max(seam, end);

      // board index for per-board colour: which end-segment of which plank
      const boardX = fract(u - off) < 0.5 ? 0 : 1;
      const bTint = 0.84 + ihash(plank, boardX, seed + 142) * 0.34;

      const band = fract(y / plankH * 5 + warpN[i] * 0.6 + grain[i] * 0.3);
      const ring = Math.pow(1 - Math.abs(band * 2 - 1), 2.6);
      const g = clamp01(grain[i] * 0.6 + fibre[i] * 0.2 + ring * 0.5);

      let cr: number, cg: number, cb: number;
      if (g < 0.5) {
        const t = g * 2;
        cr = lerp(cLight[0], cMid[0], t); cg = lerp(cLight[1], cMid[1], t); cb = lerp(cLight[2], cMid[2], t);
      } else {
        const t = (g - 0.5) * 2;
        cr = lerp(cMid[0], cDark[0], t); cg = lerp(cMid[1], cDark[1], t); cb = lerp(cMid[2], cDark[2], t);
      }
      const k = bTint * (0.94 + wear[i] * 0.12) * (1 - joint * 0.55);

      const p = i * 4;
      a[p] = cr * k;
      a[p + 1] = cg * k;
      a[p + 2] = cb * k;
      a[p + 3] = 255;

      h[i] = clamp01(0.78 - ring * 0.18 - fibre[i] * 0.10 - joint * 0.7);
      // satin varnish, worn matte in the traffic lanes
      r[i] = clamp01(0.34 + wear[i] * 0.22 + ring * 0.08 + joint * 0.30);
      ao[i] = clamp01(1 - joint * 0.65 - ring * 0.10);
    }
  }
  return { albedo: a, height: h, rough: r, ao, normalStrength: 0.95 };
};

// ---- ceilingGridMetal -----------------------------------------------------
// Painted white aluminium T-bar. Low metalness, satin roughness, faint
// lengthwise brush lines and grubby edges.
const genCeilingGridMetal: SurfaceGenerator = (size, seed) => {
  const { a, h, r } = buffers(size);
  const metal = new Float32Array(size * size);

  const brush = fbm(size, 2, size / 2.0, 2, 0.5, seed + 153);
  const dirt = fbm(size, 5, 5, 4, 0.6, seed + 154);
  const specks = worley(size, Math.round(size / 20), seed + 155, 1.0);

  const base = rgbOf(0xdfdedb);

  for (let i = 0; i < size * size; i++) {
    const chip = Math.pow(1 - specks[i], 10.0);
    h[i] = clamp01(0.6 + brush[i] * 0.25 - chip * 0.4);
    const k = (0.95 + brush[i] * 0.06) * (0.97 + dirt[i] * 0.05) * (1 - chip * 0.22);
    const p = i * 4;
    a[p] = base[0] * k;
    a[p + 1] = base[1] * k;
    a[p + 2] = base[2] * k;
    a[p + 3] = 255;
    r[i] = clamp01(0.44 + brush[i] * 0.14 + dirt[i] * 0.10 + chip * 0.2);
    // paint over aluminium: mostly dielectric, metal shows through the chips
    metal[i] = clamp01(0.04 + chip * 0.85);
  }
  return { albedo: a, height: h, rough: r, metal, normalStrength: 0.35 };
};

// ---- fabricSeat -----------------------------------------------------------
// Dense charcoal office-chair upholstery — much finer weave than the cubicle
// panels, with a bit of fuzz.
const genFabricSeat: SurfaceGenerator = (size, seed) => {
  const { a, h, r } = buffers(size);
  const ao = new Float32Array(size * size);

  const threads = 96;
  const T = size / threads;
  const fuzz = fbm(size, size / 1.8, size / 1.8, 2, 0.5, seed + 163);
  const shade = fbm(size, 6, 6, 3, 0.55, seed + 164);

  const base = rgbOf(0x35383c);
  const lift = rgbOf(0x5e656b);

  for (let y = 0; y < size; y++) {
    const wy = y / T;
    const iy = Math.floor(wy);
    const fy = wy - iy;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const wx = x / T;
      const ix = Math.floor(wx);
      const fx = wx - ix;

      const warpOver = ((ix + ((iy / 2) | 0)) & 1) === 0;   // 2/2 twill-ish
      const over = warpOver ? Math.sin(Math.PI * fx) : Math.sin(Math.PI * fy);
      const under = warpOver ? Math.sin(Math.PI * fy) : Math.sin(Math.PI * fx);
      const height = clamp01(0.32 + over * 0.5 + under * 0.16 + fuzz[i] * 0.2);
      h[i] = height;

      const t = clamp01(over * 0.55 + fuzz[i] * 0.35 + shade[i] * 0.15);
      const k = 0.9 + shade[i] * 0.14;
      const p = i * 4;
      a[p] = lerp(base[0], lift[0], t) * k;
      a[p + 1] = lerp(base[1], lift[1], t) * k;
      a[p + 2] = lerp(base[2], lift[2], t) * k;
      a[p + 3] = 255;

      r[i] = clamp01(0.90 - over * 0.06 + fuzz[i] * 0.06);
      ao[i] = clamp01(0.5 + 0.5 * Math.pow(height, 0.6));
    }
  }
  return { albedo: a, height: h, rough: r, ao, normalStrength: 1.0 };
};

// ---- officeGlass ----------------------------------------------------------
// Nearly flat, nearly white, nearly mirror. The value here is the smudges:
// they break up the reflection so glazing doesn't read as a hole in the wall.
const genOfficeGlass: SurfaceGenerator = (size, seed) => {
  const { a, h, r } = buffers(size);

  const smudge = fbm(size, 4, 4, 4, 0.6, seed + 173);
  const streak = fbm(size, 3, size / 6, 2, 0.5, seed + 174);
  const dust = fbm(size, size / 2.5, size / 2.5, 1, 0.5, seed + 175);
  const ripple = fbm(size, 6, 3, 2, 0.5, seed + 176);

  const base = rgbOf(0xdfe9ec);

  for (let i = 0; i < size * size; i++) {
    const sm = smudge[i] * 0.6 + streak[i] * 0.4;
    h[i] = clamp01(0.5 + ripple[i] * 0.4 + sm * 0.1);
    const k = 0.985 + sm * 0.02 + dust[i] * 0.01;
    const p = i * 4;
    a[p] = base[0] * k;
    a[p + 1] = base[1] * k;
    a[p + 2] = base[2] * k;
    a[p + 3] = 255;
    r[i] = clamp01(0.035 + Math.pow(sm, 2.0) * 0.16 + dust[i] * 0.03);
  }
  return { albedo: a, height: h, rough: r, normalStrength: 0.10 };
};

// ---- noise ----------------------------------------------------------------
// Generic utility fBm. Handy as a detail/dirt layer or a mask.
const genNoise: SurfaceGenerator = (size, seed) => {
  const { a, h, r } = buffers(size);
  const n = fbm(size, 4, 4, 6, 0.55, seed + 183);
  for (let i = 0; i < size * size; i++) {
    const v = n[i];
    h[i] = v;
    const c = v * 255;
    const p = i * 4;
    a[p] = c;
    a[p + 1] = c;
    a[p + 2] = c;
    a[p + 3] = 255;
    r[i] = v;
  }
  return { albedo: a, height: h, rough: r, normalStrength: 1.0 };
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const GENERATORS: Record<SurfaceId, SurfaceGenerator> = {
  officeCarpet: genOfficeCarpet,
  ceilingTile: genCeilingTile,
  cubicleFabric: genCubicleFabric,
  deskLaminate: genDeskLaminate,
  drywall: genDrywall,
  concreteFloor: genConcreteFloor,
  asphalt: genAsphalt,
  sidewalk: genSidewalk,
  brushedMetal: genBrushedMetal,
  darkPlastic: genDarkPlastic,
  rubber: genRubber,
  whiteboard: genWhiteboard,
  paper: genPaper,
  brick: genBrick,
  cardboard: genCardboard,
  woodFloor: genWoodFloor,
  ceilingGridMetal: genCeilingGridMetal,
  fabricSeat: genFabricSeat,
  officeGlass: genOfficeGlass,
  noise: genNoise,
};

/** Per-surface default resolution. Carpet + ceiling are what you stare at. */
const DEFAULT_SIZES: Partial<Record<SurfaceId, number>> = {
  officeCarpet: 1024,
  ceilingTile: 1024,
};
const DEFAULT_SIZE = 512;

export function defaultSizeFor(id: SurfaceId): number {
  return DEFAULT_SIZES[id] ?? DEFAULT_SIZE;
}

// ---------------------------------------------------------------------------
// Anisotropy
// ---------------------------------------------------------------------------

let maxAnisotropy = 16;

/**
 * Set the anisotropy applied to every texture. three clamps this to the
 * hardware maximum at upload time, so 16 is a safe default; call this with
 * `renderer.capabilities.getMaxAnisotropy()` if you want it exact.
 * Applies retroactively to already-generated textures.
 */
export function setMaxAnisotropy(n: number): void {
  maxAnisotropy = Math.max(1, Math.floor(n));
  for (const cache of [baseCache, repeatCache]) {
    for (const set of cache.values()) {
      for (const t of uniqueTextures(set)) {
        t.anisotropy = maxAnisotropy;
        t.needsUpdate = true;
      }
    }
  }
}

/** Convenience wrapper so callers don't have to remember the capability path. */
export function configureFromRenderer(renderer: THREE.WebGLRenderer): void {
  setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());
}

/** Distinct textures in a set (ao/rough/metal are usually one packed ORM map). */
function uniqueTextures(set: TextureSet): THREE.Texture[] {
  const seen = new Set<THREE.Texture>();
  const add = (t: THREE.Texture | undefined): void => { if (t) seen.add(t); };
  add(set.map);
  add(set.normalMap);
  add(set.roughnessMap);
  add(set.aoMap);
  add(set.metalnessMap);
  return [...seen];
}

// ---------------------------------------------------------------------------
// Cache + public API
// ---------------------------------------------------------------------------

const baseCache = new Map<string, TextureSet>();
const repeatCache = new Map<string, TextureSet>();

function buildSet(id: SurfaceId, size: number): TextureSet {
  const seed = strSeed(id) ^ 0x9e3779b9;
  const raw = GENERATORS[id](size, seed);

  const orm = ormToTexture(size, raw.rough, raw.ao, raw.metal);
  orm.name = `proc:${id}:orm`;

  const set: TextureSet = {
    map: bytesToTexture(raw.albedo, size, true),
    normalMap: bytesToTexture(heightToNormalBytes(raw.height, size, raw.normalStrength), size, false),
    roughnessMap: orm,
  };
  // Same texture object in every slot — three samples the channel it needs.
  if (raw.ao) set.aoMap = orm;
  if (raw.metal) set.metalnessMap = orm;

  set.map.name = `proc:${id}:albedo`;
  set.normalMap.name = `proc:${id}:normal`;

  return set;
}

function cloneWithRepeat(set: TextureSet, rx: number, ry: number): TextureSet {
  // Memoised by source texture so a shared ORM map stays shared in the clone.
  const made = new Map<THREE.Texture, THREE.Texture>();
  const c = (t: THREE.Texture): THREE.Texture => {
    const hit = made.get(t);
    if (hit) return hit;
    // Texture.clone() shares the underlying Source, so three reuses the same
    // WebGLTexture on the GPU — repeat variants cost VRAM nothing.
    const n = t.clone();
    n.name = t.name;
    n.wrapS = THREE.RepeatWrapping;
    n.wrapT = THREE.RepeatWrapping;
    n.repeat.set(rx, ry);
    n.needsUpdate = true;
    made.set(t, n);
    return n;
  };
  const out: TextureSet = {
    map: c(set.map),
    normalMap: c(set.normalMap),
    roughnessMap: c(set.roughnessMap),
  };
  if (set.aoMap) out.aoMap = c(set.aoMap);
  if (set.metalnessMap) out.metalnessMap = c(set.metalnessMap);
  return out;
}

/**
 * Get a matched albedo/normal/roughness(/ao/metalness) set for a surface.
 *
 * Cached by (id, size); repeat variants are cached by (id, size, rx, ry) and
 * are Texture clones that share GPU memory with the base set.
 *
 * The returned textures are shared — do NOT mutate them (except via
 * setMaxAnisotropy). Ask for a different repeat instead of setting .repeat.
 */
export function getTextureSet(
  id: SurfaceId,
  repeat: [number, number] = [1, 1],
  size?: number,
): TextureSet {
  const px = normaliseSize(size ?? defaultSizeFor(id));
  const baseKey = `${id}|${px}`;
  let base = baseCache.get(baseKey);
  if (!base) {
    base = buildSet(id, px);
    baseCache.set(baseKey, base);
  }

  const rx = repeat[0];
  const ry = repeat[1];
  if (rx === 1 && ry === 1) return base;

  const rKey = `${baseKey}|${rx}|${ry}`;
  let variant = repeatCache.get(rKey);
  if (!variant) {
    variant = cloneWithRepeat(base, rx, ry);
    repeatCache.set(rKey, variant);
  }
  return variant;
}

/** Round to a sane power of two in [64, 2048]. Mipmaps and wrapping need it. */
function normaliseSize(n: number): number {
  const clamped = Math.max(64, Math.min(2048, Math.floor(n)));
  return 1 << Math.round(Math.log2(clamped));
}

/**
 * Pre-generate a set of surfaces (e.g. during a loading screen) so the first
 * frame after a level load isn't stalled by texture synthesis.
 */
export function warmup(ids: readonly SurfaceId[] = SURFACE_IDS): void {
  for (const id of ids) getTextureSet(id);
}

/** Dispose every generated texture and empty the cache. */
export function disposeTextureCache(): void {
  for (const set of repeatCache.values()) {
    for (const t of uniqueTextures(set)) t.dispose();
  }
  repeatCache.clear();
  for (const set of baseCache.values()) {
    for (const t of uniqueTextures(set)) t.dispose();
  }
  baseCache.clear();
}

/** Rough diagnostic: how much GPU texture memory we've synthesised so far. */
export function cacheStats(): { sets: number; variants: number; textures: number; bytes: number } {
  let bytes = 0;
  let textures = 0;
  for (const [key, set] of baseCache) {
    const px = parseInt(key.split('|')[1], 10);
    const n = uniqueTextures(set).length;
    textures += n;
    bytes += px * px * 4 * n * 1.33;   // +33% for the mip chain
  }
  return {
    sets: baseCache.size,
    variants: repeatCache.size,
    textures,
    bytes: Math.round(bytes),
  };
}

// ---------------------------------------------------------------------------
// Debug contact sheet
// ---------------------------------------------------------------------------

/**
 * Generates every surface and tiles its albedo into a labelled contact sheet.
 * Purely a development aid — call it from the console:
 *   document.body.appendChild(__debugRenderAllToCanvas())
 */
export function __debugRenderAllToCanvas(): HTMLCanvasElement {
  const cell = 200;
  const label = 22;
  const cols = 5;
  const rows = Math.ceil(SURFACE_IDS.length / cols);
  const w = cols * cell;
  const hgt = rows * (cell + label);

  const canvas = (typeof document !== 'undefined'
    ? (() => { const c = document.createElement('canvas'); c.width = w; c.height = hgt; return c; })()
    : createCanvas(w, hgt)) as HTMLCanvasElement;
  const c = ctx2d(canvas);

  c.fillStyle = '#111';
  c.fillRect(0, 0, w, hgt);
  c.textBaseline = 'middle';
  c.font = '13px system-ui, sans-serif';

  for (let i = 0; i < SURFACE_IDS.length; i++) {
    const id = SURFACE_IDS[i];
    const set = getTextureSet(id);
    const img = set.map.image as CanvasImageSource;
    const cx = (i % cols) * cell;
    const cy = Math.floor(i / cols) * (cell + label);
    try {
      c.drawImage(img, cx, cy + label, cell, cell);
    } catch {
      c.fillStyle = '#500';
      c.fillRect(cx, cy + label, cell, cell);
    }
    c.fillStyle = '#eee';
    c.fillText(id, cx + 6, cy + label * 0.5);
    c.strokeStyle = '#000';
    c.strokeRect(cx + 0.5, cy + label + 0.5, cell - 1, cell - 1);
  }
  return canvas;
}
