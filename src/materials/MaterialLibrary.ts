/**
 * MaterialLibrary — the single source of truth for every surface in the game.
 *
 * Design rules (do not violate when adding entries):
 *  - Metals: metalness = 1.0, albedo IS the specular reflectance colour, roughness low-but-never-zero.
 *  - Dielectrics: metalness = 0.0 (never a "half metal"), albedo is diffuse colour.
 *  - Nothing is pure black (0x000000) or pure white (0xffffff) — both kill form under ACES.
 *  - Emissives are tuned so that emissive * emissiveIntensity lands just above 1.0 in linear space,
 *    which is exactly where UnrealBloomPass with threshold ~0.85 starts to glow without clipping.
 *  - Every material is cached and shared. Callers MUST NOT mutate the returned material; pass
 *    overrides through `get(id, opts)` instead, which produces a separate cache entry.
 *
 * `color` MEANS TWO DIFFERENT THINGS, and getting this wrong is how you end up with mud:
 *  - On a spec with NO `surface`, `color` is the albedo outright.
 *  - On a spec WITH a `surface`, ProceduralTextures' `map` already carries the full albedo, and
 *    three multiplies `color` over it. So there `color` is a TINT and is near-white by default.
 *    The tints below were solved in linear space as `targetAlbedo / mean(map)` against the real
 *    generated textures, so the lit result lands on the reference palette either way.
 *
 * Palette was sampled directly from refs/scene-office2.png and refs/scene-office3.png
 * (see the SAMPLED block below); albedos are the sampled pixel de-tinted for the refs' warm key
 * light, so that re-lighting with a warm sun reproduces the reference on screen.
 */

import * as THREE from 'three';
import { getTextureSet, type SurfaceId, type TextureSet } from './ProceduralTextures';

export type MaterialId =
  | 'officeCarpet' | 'ceilingTile' | 'ceilingGrid' | 'cubicleFabric' | 'cubicleTrim' | 'deskLaminate'
  | 'drywall' | 'concreteFloor' | 'asphalt' | 'sidewalk' | 'brushedMetal' | 'chrome' | 'darkPlastic'
  | 'rubber' | 'glass' | 'whiteboard' | 'paper' | 'screenOn' | 'screenOff' | 'brick' | 'cardboard'
  | 'woodFloor' | 'fluorescentDiffuser' | 'grindMetal' | 'skinLight' | 'shirtWhite' | 'trousersCharcoal'
  | 'tieRed' | 'hairBrown' | 'copNavy' | 'copBadgeGold' | 'shoeBlack' | 'plantGreen' | 'terracotta'
  // Saturated set-dressing accents. The refs get their production value from a
  // handful of high-chroma notes (red tie, orange sparks, gold coins, navy uniforms)
  // punched into an otherwise neutral office. Use these on ~1 prop every 8 m of the
  // skate line: folders, extinguishers, safety signage, a repainted filing cabinet.
  | 'accentOrange' | 'accentRed' | 'accentTeal' | 'accentGold';

export interface MaterialOptions {
  repeat?: [number, number];
  /** Albedo for untextured ids; a multiplicative tint over the map for textured ids. */
  color?: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  flatShading?: boolean;
}

/** Every valid MaterialId, in declaration order. Handy for debug swatch grids. */
export const MATERIAL_IDS: readonly MaterialId[] = [
  'officeCarpet', 'ceilingTile', 'ceilingGrid', 'cubicleFabric', 'cubicleTrim', 'deskLaminate',
  'drywall', 'concreteFloor', 'asphalt', 'sidewalk', 'brushedMetal', 'chrome', 'darkPlastic',
  'rubber', 'glass', 'whiteboard', 'paper', 'screenOn', 'screenOff', 'brick', 'cardboard',
  'woodFloor', 'fluorescentDiffuser', 'grindMetal', 'skinLight', 'shirtWhite', 'trousersCharcoal',
  'tieRed', 'hairBrown', 'copNavy', 'copBadgeGold', 'shoeBlack', 'plantGreen', 'terracotta',
  'accentOrange', 'accentRed', 'accentTeal', 'accentGold',
];

// ---------------------------------------------------------------------------
// Spec table
// ---------------------------------------------------------------------------

interface SheenSpec {
  sheen: number;
  sheenColor: number;
  sheenRoughness: number;
}

interface PhysicalSpec {
  clearcoat?: number;
  clearcoatRoughness?: number;
  ior?: number;
  specularIntensity?: number;
  specularColor?: number;
  sheen?: SheenSpec;
  /**
   * Real refraction. OFF for every stock entry: three allocates a half-res transmission render
   * target and re-renders the scene once per frame the moment any visible material has
   * transmission > 0, which costs ~30% of the frame at 1080p. See the note in the header of
   * the `glass` spec before turning this on.
   */
  transmission?: number;
  thickness?: number;
}

interface MaterialSpec {
  /** Procedural texture set to bind (map / normalMap / roughnessMap / aoMap / metalnessMap). */
  surface?: SurfaceId;
  /** Default texture repeat when the caller does not supply one. */
  repeat?: [number, number];
  /**
   * Multiplier applied to whatever repeat is finally used — the spec's or the
   * caller's. This is how texel density gets calibrated to gameplay scale WITHOUT
   * every call site having to know the real-world size of one texture tile.
   * Level code says "one tile per 2.6 m of floor"; the library says "and that tile
   * is actually 0.9 m of carpet, because a 3 mm loop has to survive".
   */
  repeatScale?: number;
  /**
   * Canvas size handed to ProceduralTextures. Left unset on every stock entry on purpose:
   * ProceduralTextures has its own per-surface tuned defaults (carpet/ceiling are 1024, the rest
   * 512) and its cache is keyed on `id|size`, so overriding the size here would silently
   * synthesise a *second* copy of a texture any direct getTextureSet() caller already built.
   */
  textureSize?: number;
  /** Albedo when `surface` is unset; a multiplicative TINT over the map when `surface` is set. */
  color: number;
  roughness: number;
  metalness: number;
  emissive?: number;
  emissiveIntensity?: number;
  /**
   * Hard ceiling on emissiveIntensity, INCLUDING caller overrides.
   *
   * The bloom threshold is 0.85 with a 0.6 radius; a single small sphere at
   * emissiveIntensity 3.0 does not read as a brighter lamp, it reads as a
   * rendering bug — a white hole with a bloom skirt sitting at a completely
   * different exposure to every other fixture in the same room. Emissive tuning is
   * this library's job, so the ceiling is enforced here rather than trusted to
   * every prop author.
   */
  emissiveClamp?: number;
  /** Per-material scale on the global envMapIntensity set by setEnvironment(). */
  env?: number;
  normalScale?: number;
  aoIntensity?: number;
  flatShading?: boolean;
  /**
   * Opt this surface into the world-space interior light-pool + traffic-wear shader
   * injection (see `setInteriorLightPool`). Only worth it on large floor planes.
   */
  lightPool?: boolean;
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  /** Present => build a MeshPhysicalMaterial instead of a MeshStandardMaterial. */
  physical?: PhysicalSpec;
}

/**
 * SAMPLED reference colours (raw pixels, i.e. already lit by the refs' warm key):
 *   carpet #8e7a5d/#877157   cubicle side #686865/#32363d   cubicle cap #c8c4bc
 *   desk laminate #d5924d    ceiling tile #a78e78 (shadow)  fluoro panel #f7e9d0
 *   monitor bezel #151823    screen (on) #6c7c55            filing cabinet #c1a07b
 *   cardboard #d5b99c        back wall #7d6757              chair plastic #3a3939
 *   shirt #dad3cd/#f1e1d4    tie #961c17                    trousers #1f2027
 *   skin #e08946/#f7ab5f     hair #764c39/#5d391f
 *   cop navy #0f2043/#16213a badge gold #e69213             plant #a9ba58 / pot #874412
 */
const SPECS: Record<MaterialId, MaterialSpec> = {
  // ---- architecture -------------------------------------------------------
  officeCarpet: {
    // The single largest surface on screen. Deliberately a desaturated greige so the warm key
    // light supplies the tan seen in the refs rather than the albedo double-counting it.
    //
    // repeatScale 2.9: level code asks for one tile per 2.6 m, which put the loop pile at
    // ~18 mm — visible 5-8 cm blobs on screen, i.e. terrazzo. 2.6 / 2.9 = one tile per
    // 0.9 m, a real carpet module, which lands the loop at ~6 mm.
    // normalScale doubled to compensate for the albedo contrast the generator gave up.
    surface: 'officeCarpet', repeat: [16, 16], repeatScale: 2.9,
    color: 0xffffff, roughness: 0.95, metalness: 0.0,
    env: 0.40, normalScale: 1.15, aoIntensity: 1.0, lightPool: true,
  },
  ceilingTile: {
    // A suspended ceiling only ever sees the floor bounce, which indoors is a dim
    // warm brown — left untouched the whole ceiling renders tan. Cool the albedo
    // and add a small self-emission so it reads as the bright neutral acoustic
    // tile of the refs. Kept well under the 0.85 bloom threshold.
    // repeatScale 2.0: the ceiling grid asks for one tile per ~2 m; acoustic tile is a
    // 0.6 m module and its fissured surface is one of the most recognisable textures in
    // an office. normalScale up so it actually catches the troffer grazing light.
    surface: 'ceilingTile', repeat: [8, 8], repeatScale: 2.0,
    color: 0xc2ccd6, roughness: 0.96, metalness: 0.0,
    emissive: 0xb0bece, emissiveIntensity: 0.13, emissiveClamp: 0.3,
    env: 0.50, normalScale: 0.9, aoIntensity: 1.0,
  },
  ceilingGrid: {
    // Painted aluminium T-bar: paint is a dielectric, so this is NOT metalness 1.
    surface: 'ceilingGridMetal', repeat: [4, 4],
    color: 0xb9bcc0, roughness: 0.55, metalness: 0.12,
    env: 0.85, normalScale: 0.4,
  },
  cubicleFabric: {
    // Cool blue-grey against the warm carpet — that warm/cool split is the whole look.
    // Tinted slightly grey-down: at full white the panels read as saturated denim
    // rather than the desaturated slate-grey of the refs.
    // Kept as MeshStandardMaterial on purpose: it has the largest screen coverage of any
    // prop surface and sheen would cost more than it returns here.
    // normalScale 0.9 -> 0.22 and roughness 0.93 -> 0.975: at 0.9 every weave crown
    // caught a specular and the panel read as corrugated plastic siding. Woven felt has
    // essentially no gloss. flatShading so the chamfered panel hulls read as authored
    // planes rather than smooth-shaded boxes.
    surface: 'cubicleFabric', repeat: [4, 3], repeatScale: 2.2,
    color: 0xafaeac, roughness: 0.975, metalness: 0.0,
    env: 0.30, normalScale: 0.34, aoIntensity: 1.0, flatShading: true,
  },
  cubicleTrim: {
    // The cap rail the player grinds — the primary skate surface in the level, so it
    // gets a dedicated map with a polished contact stripe down the centre of V. That
    // stripe is at roughness ~0.14 against ~0.52 shoulders, which makes it the one
    // surface in the room that throws a bright specular streak under the troffers.
    surface: 'grindCap', repeat: [6, 1],
    color: 0xe4e2dc, roughness: 0.40, metalness: 0.0,
    env: 0.85, normalScale: 0.55, aoIntensity: 1.0, flatShading: true,
    physical: { clearcoat: 0.35, clearcoatRoughness: 0.22 },
  },
  deskLaminate: {
    // Warmer and more saturated: the desks are the warm note that the cool cubicle
    // fabric plays against, and at 0xf2deb5 they were washing out to bone.
    surface: 'deskLaminate', repeat: [3, 2],
    color: 0xe8c98d, roughness: 0.35, metalness: 0.0,
    env: 0.90, normalScale: 0.35, flatShading: true,
    physical: { clearcoat: 0.45, clearcoatRoughness: 0.22, ior: 1.5 },
  },
  drywall: {
    // Painted commercial partition. Tinted down from white: a pure-white albedo
    // clips against a 3.6-intensity key and destroys the read of the cubicle line.
    surface: 'drywall', repeat: [8, 4],
    color: 0xc8c4bc, roughness: 0.96, metalness: 0.0,
    env: 0.50, normalScale: 0.45, flatShading: true,
  },
  concreteFloor: {
    surface: 'concreteFloor', repeat: [12, 12],
    color: 0xf4f9ff, roughness: 0.90, metalness: 0.03,
    env: 0.60, normalScale: 0.7, aoIntensity: 0.9,
  },
  asphalt: {
    surface: 'asphalt', repeat: [20, 20],
    color: 0xe6efff, roughness: 0.95, metalness: 0.0,
    env: 0.40, normalScale: 0.8, aoIntensity: 0.8,
  },
  sidewalk: {
    surface: 'sidewalk', repeat: [10, 10],
    color: 0xd5d9dc, roughness: 0.88, metalness: 0.02,
    env: 0.55, normalScale: 0.7, aoIntensity: 1.0,
  },
  brick: {
    surface: 'brick', repeat: [6, 4],
    color: 0xc4a094, roughness: 0.92, metalness: 0.0,
    env: 0.45, normalScale: 1.0, aoIntensity: 1.0, flatShading: true,
  },
  woodFloor: {
    surface: 'woodFloor', repeat: [8, 8],
    color: 0xffffff, roughness: 0.42, metalness: 0.0,
    env: 0.75, normalScale: 0.5, aoIntensity: 0.8,
  },

  // ---- metals (metalness = 1, albedo = reflectance) -----------------------
  brushedMetal: {
    surface: 'brushedMetal', repeat: [2, 2],
    color: 0xffffff, roughness: 0.38, metalness: 1.0,
    env: 1.00, normalScale: 0.35,
  },
  chrome: {
    // Deliberately MeshStandardMaterial: clearcoat over a bare metal is physically meaningless
    // and only costs a shader permutation. Sharp mirror = metalness 1 + very low roughness + env.
    color: 0xf1f3f6, roughness: 0.06, metalness: 1.0,
    env: 1.15,
  },
  grindMetal: {
    // The rail/edge the chair grinds on. Slightly worn steel so the sparks read against it.
    surface: 'brushedMetal', repeat: [8, 1],
    color: 0xffffff, roughness: 0.22, metalness: 1.0,
    env: 1.15, normalScale: 0.25,
  },
  copBadgeGold: {
    // SAMPLED #e69213 / #e19a06. Gold reflectance, not a yellow paint.
    color: 0xf0a81e, roughness: 0.27, metalness: 1.0,
    env: 1.25,
  },

  // ---- plastics / misc dielectrics ----------------------------------------
  darkPlastic: {
    surface: 'darkPlastic', repeat: [2, 2],
    color: 0xffffff, roughness: 0.48, metalness: 0.0,
    env: 0.80, normalScale: 0.5,
  },
  rubber: {
    surface: 'rubber', repeat: [3, 3],
    color: 0xffffff, roughness: 0.86, metalness: 0.0,
    env: 0.40, normalScale: 0.8,
  },
  glass: {
    // NOTE: no `transmission`. Real refraction forces three to allocate a half-res transmission
    // target and re-render the scene each frame (~30% of the frame at 1080p). This is a
    // transparent, high-IOR, strongly env-reflective pane instead — visually equivalent for
    // stylised office glazing at zero extra passes. To opt in anyway (single line, integration
    // agent's call): mat.transmission = 0.9; mat.thickness = 0.05; mat.transparent = false;
    surface: 'officeGlass', repeat: [2, 2],
    color: 0xedf5f9, roughness: 0.05, metalness: 0.0,
    env: 1.60, normalScale: 0.15,
    transparent: true, opacity: 0.22, depthWrite: false,
    physical: { ior: 1.5, specularIntensity: 1.0, specularColor: 0xffffff, clearcoat: 0.6, clearcoatRoughness: 0.03 },
  },
  whiteboard: {
    surface: 'whiteboard', repeat: [1, 1],
    color: 0xffffff, roughness: 0.10, metalness: 0.0,
    env: 1.00, normalScale: 0.1,
    physical: { clearcoat: 1.0, clearcoatRoughness: 0.04, ior: 1.5 },
  },
  paper: {
    // Thin planes — DoubleSide is mandatory or half the scattered sheets vanish.
    //
    // Albedo pulled well off white (0xf8f8f7 -> 0xd6d1c4) and env cut to 0.15. Against a
    // 3.5-intensity key a near-white sheet with no thickness and no contact shadow
    // clips to 255 and reads as a broken projected light decal on the carpet — three
    // separate reviewers called the old scatter paper the loudest cheapness tell in the
    // build. Real office paper sits around 0.72-0.78 reflectance, not 0.97.
    surface: 'paper', repeat: [1, 1],
    color: 0xd6d1c4, roughness: 0.95, metalness: 0.0,
    env: 0.15, normalScale: 0.3, side: THREE.DoubleSide,
  },
  cardboard: {
    surface: 'cardboard', repeat: [2, 2],
    color: 0xffffff, roughness: 0.95, metalness: 0.0,
    env: 0.45, normalScale: 0.7, aoIntensity: 1.0, flatShading: true,
  },
  terracotta: {
    color: 0x7d3f20, roughness: 0.85, metalness: 0.0,
    env: 0.50, flatShading: true,
  },
  plantGreen: {
    // Leaf cards / faceted foliage blobs.
    color: 0x5d8c3a, roughness: 0.68, metalness: 0.0,
    env: 0.45, side: THREE.DoubleSide, flatShading: true,
  },

  // ---- emissive -----------------------------------------------------------
  screenOn: {
    // Cool CRT/LCD glow. 0x6fa8d8 * 1.8 = (0.79, 1.18, 1.53) linear — over the bloom threshold
    // on the blue channel, under it on red, so it glows blue-white instead of clipping to a
    // white blob. Callers vary the tint per monitor via opts.emissive (refs show green + blue).
    color: 0x0f151c, roughness: 0.22, metalness: 0.0,
    emissive: 0x6fa8d8, emissiveIntensity: 1.8, emissiveClamp: 2.2,
    env: 0.30,
  },
  screenOff: {
    // A dead screen is a near-black mirror; it earns its keep entirely off the env map.
    color: 0x14181f, roughness: 0.11, metalness: 0.0,
    env: 1.35,
  },
  fluorescentDiffuser: {
    // SAMPLED #f7e9d0 / #faead0 — warm white, not neutral. 2.6x lands it in bloom territory
    // while ACES still holds a hint of the panel's own colour instead of pure white.
    // emissiveClamp: a lamp is not allowed to be brighter than a lamp. The 3.0 the
    // pendant bulbs ask for lands them a full stop above every other fixture in the
    // room and UnrealBloomPass turns them into a white hole; 2.2 keeps every fixture in
    // the room inside one exposure family.
    color: 0xfff6e4, roughness: 0.60, metalness: 0.0,
    emissive: 0xfff1d6, emissiveIntensity: 2.2, emissiveClamp: 2.2,
    env: 0.25,
  },

  // ---- characters (stylised, flat-ish, low roughness variance) -------------
  skinLight: {
    // SAMPLED #e08946 (mid) / #f7ab5f (lit). Warm tan; kept a touch less saturated than the
    // sample so the warm key does not push it to orange.
    color: 0xd48050, roughness: 0.62, metalness: 0.0,
    env: 0.50,
  },
  shirtWhite: {
    // Neutral-cool white albedo: the refs' shirt looks warm ONLY because of the key light.
    // Sheen gives the office-shirt cotton its soft grazing-angle falloff — this is the single
    // biggest readability win on the hero character.
    color: 0xf1f2f4, roughness: 0.76, metalness: 0.0,
    env: 0.60,
    physical: { sheen: { sheen: 0.45, sheenColor: 0xffffff, sheenRoughness: 0.5 } },
  },
  trousersCharcoal: {
    // SAMPLED #1f2027. Never black: a cool sheen is what separates the legs from the chair
    // in the refs, where both are near-black.
    color: 0x24272c, roughness: 0.82, metalness: 0.0,
    env: 0.50,
    physical: { sheen: { sheen: 0.30, sheenColor: 0x8fa4c0, sheenRoughness: 0.55 } },
  },
  tieRed: {
    // SAMPLED #961c17. Slightly brighter albedo because ACES desaturates saturated highlights.
    color: 0x7d2a24, roughness: 0.44, metalness: 0.0,
    env: 0.60,
  },
  hairBrown: {
    // SAMPLED #764c39 / #5d391f.
    color: 0x5e4331, roughness: 0.66, metalness: 0.0,
    env: 0.55,
  },
  copNavy: {
    // SAMPLED #0f2043 / #16213a / #242f4e. Lifted off the sample so it does not crush to black,
    // plus a cool sheen for the uniform's rim — that rim is how the cops read in the refs.
    color: 0x1a2a4e, roughness: 0.72, metalness: 0.0,
    env: 0.55,
    physical: { sheen: { sheen: 0.35, sheenColor: 0x7690c6, sheenRoughness: 0.5 } },
  },
  shoeBlack: {
    color: 0x1e2023, roughness: 0.30, metalness: 0.0,
    env: 1.05,
  },

  // ---- saturated accents ---------------------------------------------------
  // These exist so that EVERY frame has at least one high-chroma note. The office
  // itself is deliberately a narrow warm/cool neutral band; without accents that band
  // is the whole palette and the frame reads as a beige call centre. Chroma is set a
  // little below the target because ACES desaturates as it approaches the shoulder.
  accentOrange: {
    // Safety orange — cones, hazard signage, a repainted cabinet, box tape.
    color: 0xc9581a, roughness: 0.50, metalness: 0.0,
    env: 0.60, flatShading: true,
  },
  accentRed: {
    // Fire extinguisher / emergency red. The single most useful accent indoors: one
    // of these on a wall pins the eye and gives the neutrals something to be neutral
    // against.
    color: 0xa81f1c, roughness: 0.36, metalness: 0.0,
    env: 0.80, flatShading: true,
    physical: { clearcoat: 0.5, clearcoatRoughness: 0.2 },
  },
  accentTeal: {
    // The cool counterweight — a repainted pod, a recycling bin, a locker bank.
    color: 0x1f6270, roughness: 0.52, metalness: 0.0,
    env: 0.65, flatShading: true,
  },
  accentGold: {
    // Coin / star / reward language, matched to the HUD's warm gold. Metal, so it
    // catches the troffers and reads as a pickup rather than a yellow box.
    color: 0xd9a52c, roughness: 0.28, metalness: 1.0,
    env: 1.25,
  },
};

const FALLBACK_SPEC: MaterialSpec = {
  color: 0xff00ff, roughness: 0.8, metalness: 0.0, env: 0.5,
};

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  material: THREE.MeshStandardMaterial;
  /** Per-material multiplier applied on top of the global env intensity. */
  envScale: number;
}

const OPT_KEYS = [
  'repeat', 'color', 'roughness', 'metalness', 'emissive', 'emissiveIntensity', 'flatShading',
] as const;

function cacheKey(id: string, opts?: MaterialOptions): string {
  if (!opts) return id;
  let key = id;
  for (const k of OPT_KEYS) {
    const v = (opts as Record<string, unknown>)[k];
    if (v === undefined) continue;
    key += `|${k}=${Array.isArray(v) ? v.join(',') : String(v)}`;
  }
  return key;
}

/** Assign colorSpace defensively without forcing a needless GPU re-upload. */
function ensureColorSpace(tex: THREE.Texture | undefined, cs: THREE.ColorSpace): void {
  if (!tex) return;
  if (tex.colorSpace !== cs) {
    tex.colorSpace = cs;
    tex.needsUpdate = true;
  }
}

function loadTextures(spec: MaterialSpec, repeat: [number, number] | undefined): TextureSet | null {
  if (!spec.surface) return null;
  let r = repeat ?? spec.repeat;
  const s = spec.repeatScale;
  if (r && s !== undefined && s !== 1) r = [r[0] * s, r[1] * s];
  try {
    return getTextureSet(spec.surface, r, spec.textureSize);
  } catch (err) {
    // ProceduralTextures may not know this surface yet (parallel development). Degrade to an
    // untextured but correctly-tuned material rather than taking the whole level down.
    if (typeof console !== 'undefined') {
      console.warn(`[MaterialLibrary] texture set "${spec.surface}" unavailable:`, err);
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Interior light pools
//
// A fluorescent grid does NOT light a floor evenly — it lays down a repeating
// pattern of soft-edged elliptical pools with dim gaps between them, and that
// pattern is a huge part of why an office reads as an office. Baking the troffers
// into the IBL (which is what EnvironmentRig does) gets the *colour* of that light
// right and the *shape* of it completely wrong: the carpet comes out as a
// perfectly uniform ambient wash with no falloff anywhere.
//
// Forty real PointLights would fix it and cost the frame. Instead this injects a
// tiny world-space term into the floor shader that
//   (a) modulates the indirect diffuse by a periodic pool function phase-locked to
//       the real troffer grid, and
//   (b) adds a low-frequency, NON-TILING traffic-wear term, so a floor tiled every
//       0.9 m does not read as a 0.9 m blotch grid across a 68 m plate.
//
// All injected materials share one set of uniform objects, so `setInteriorLightPool`
// retunes every floor in the scene without recompiling a single shader.
// ---------------------------------------------------------------------------

export interface LightPoolSpec {
  /** World-space pitch of the fixture grid, in metres. */
  pitch: number;
  /** World-space XZ phase of the grid, in metres. */
  offset: [number, number];
  /** Normalised cell distance at which the pool starts to fall off (0 = centre). */
  inner: number;
  /** Normalised cell distance at which the pool has fully fallen off (~1.41 = corner). */
  outer: number;
  /** Floor multiplier midway between fixtures. 1 = no pooling at all. */
  min: number;
  /** Multiplier directly under a fixture. */
  max: number;
  /** sRGB tint of the pool centre. */
  color: number;
  /** Amplitude of the large-scale traffic-wear darkening, 0..1. */
  wear: number;
}

/**
 * Defaults are phase-locked to `OfficeLevel`'s troffer layout: pitch = TILE * 3 =
 * 1.22 * 3 = 3.66 m, and because the grid has an even column count it is offset by
 * half a pitch from the world origin.
 */
export const LIGHT_POOL_OFFICE: LightPoolSpec = {
  pitch: 3.66,
  offset: [1.83, 1.83],
  inner: 0.10,
  outer: 1.02,
  min: 0.80,
  max: 1.13,
  color: 0xfff4e2,
  wear: 0.05,
};

const LP_UNIFORMS = {
  uLPPitch: { value: LIGHT_POOL_OFFICE.pitch },
  uLPOffset: { value: new THREE.Vector2(LIGHT_POOL_OFFICE.offset[0], LIGHT_POOL_OFFICE.offset[1]) },
  uLPInner: { value: LIGHT_POOL_OFFICE.inner },
  uLPOuter: { value: LIGHT_POOL_OFFICE.outer },
  uLPMin: { value: LIGHT_POOL_OFFICE.min },
  uLPMax: { value: LIGHT_POOL_OFFICE.max },
  uLPTint: { value: new THREE.Color().setHex(LIGHT_POOL_OFFICE.color, THREE.SRGBColorSpace) },
  uLPWear: { value: LIGHT_POOL_OFFICE.wear },
  uLPOn: { value: 1 },
};

const LP_FRAG_HEAD = /* glsl */ `
varying vec3 vLPWorld;
uniform float uLPPitch;
uniform vec2  uLPOffset;
uniform float uLPInner;
uniform float uLPOuter;
uniform float uLPMin;
uniform float uLPMax;
uniform vec3  uLPTint;
uniform float uLPWear;
uniform float uLPOn;
`;

const LP_FRAG_BODY = /* glsl */ `
if ( uLPOn > 0.5 ) {
  vec2 cell = ( vLPWorld.xz - uLPOffset ) / uLPPitch;
  vec2 f = abs( fract( cell ) - 0.5 ) * 2.0;
  float d = length( f );
  float pool = 1.0 - smoothstep( uLPInner, uLPOuter, d );

  // Two incommensurate low-frequency layers => no visible period at play scale.
  float wear = 0.5 + 0.5 * (
      0.62 * sin( vLPWorld.x * 0.191 + 1.7 ) * sin( vLPWorld.z * 0.133 - 0.6 )
    + 0.38 * sin( vLPWorld.x * 0.061 - 2.1 ) * sin( vLPWorld.z * 0.083 + 1.1 )
  );

  float k = mix( uLPMin, uLPMax, pool ) * ( 1.0 - uLPWear * ( 1.0 - wear ) );
  vec3 tint = mix( vec3( 1.0 ), uLPTint, pool * 0.8 );

  // Indirect takes the full pool: the troffers ARE the ambient here. Direct only
  // takes a third of it, so the key light's own shadows still read cleanly.
  reflectedLight.indirectDiffuse *= k * tint;
  reflectedLight.indirectSpecular *= mix( 1.0, k, 0.6 );
  reflectedLight.directDiffuse *= mix( 1.0, k, 0.33 );
}
`;

/**
 * Shared across every light-pooled material on purpose: three derives a program
 * cache key from `onBeforeCompile.toString()`, so one function identity means one
 * compiled permutation for all of them.
 */
function injectLightPool(shader: {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}): void {
  Object.assign(shader.uniforms, LP_UNIFORMS);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vLPWorld;')
    .replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvLPWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;'
    );
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${LP_FRAG_HEAD}`)
    .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n${LP_FRAG_BODY}`);
}

export class MaterialLibrary {
  private static cache = new Map<string, CacheEntry>();
  private static env: THREE.Texture | null = null;
  private static envIntensity = 1.0;

  /**
   * Fetch (or build) a shared material. Do not mutate the result — pass `opts` instead, which
   * yields a distinct cache entry keyed on the override values.
   */
  static get(id: MaterialId, opts?: MaterialOptions): THREE.MeshStandardMaterial {
    const key = cacheKey(id, opts);
    const hit = this.cache.get(key);
    if (hit) return hit.material;

    const spec = SPECS[id] ?? FALLBACK_SPEC;
    const tex = loadTextures(spec, opts?.repeat);

    const params: THREE.MeshStandardMaterialParameters = {
      name: key,
      color: opts?.color ?? spec.color,
      roughness: opts?.roughness ?? spec.roughness,
      metalness: opts?.metalness ?? spec.metalness,
      flatShading: opts?.flatShading ?? spec.flatShading ?? false,
    };

    if (spec.side !== undefined) params.side = spec.side;
    if (spec.transparent) {
      params.transparent = true;
      params.opacity = spec.opacity ?? 1.0;
    }
    if (spec.depthWrite !== undefined) params.depthWrite = spec.depthWrite;

    const emissive = opts?.emissive ?? spec.emissive;
    if (emissive !== undefined) {
      params.emissive = new THREE.Color(emissive);
      const ei = opts?.emissiveIntensity ?? spec.emissiveIntensity ?? 1.0;
      params.emissiveIntensity = spec.emissiveClamp !== undefined
        ? Math.min(ei, spec.emissiveClamp)
        : ei;
    }

    if (tex) {
      // Albedo is the ONLY map that lives in sRGB. Everything else stays linear — getting this
      // backwards is the classic "washed out WebGL" bug.
      ensureColorSpace(tex.map, THREE.SRGBColorSpace);
      ensureColorSpace(tex.normalMap, THREE.NoColorSpace);
      ensureColorSpace(tex.roughnessMap, THREE.NoColorSpace);
      ensureColorSpace(tex.aoMap, THREE.NoColorSpace);
      ensureColorSpace(tex.metalnessMap, THREE.NoColorSpace);

      params.map = tex.map;
      params.normalMap = tex.normalMap;
      params.roughnessMap = tex.roughnessMap;
      if (tex.aoMap) {
        params.aoMap = tex.aoMap;
        params.aoMapIntensity = spec.aoIntensity ?? 1.0;
      }
      // Only bind a metalness map on surfaces that actually have varying metalness; binding one
      // on a pure dielectric would multiply metalness 0 by it and change nothing but cost.
      if (tex.metalnessMap && (params.metalness ?? 0) > 0.0) {
        params.metalnessMap = tex.metalnessMap;
      }
    }

    let material: THREE.MeshStandardMaterial;
    if (spec.physical) {
      const p = spec.physical;
      const phys = new THREE.MeshPhysicalMaterial(params);
      if (p.clearcoat !== undefined) phys.clearcoat = p.clearcoat;
      if (p.clearcoatRoughness !== undefined) phys.clearcoatRoughness = p.clearcoatRoughness;
      if (p.ior !== undefined) phys.ior = p.ior;
      if (p.specularIntensity !== undefined) phys.specularIntensity = p.specularIntensity;
      if (p.specularColor !== undefined) phys.specularColor = new THREE.Color(p.specularColor);
      if (p.sheen) {
        phys.sheen = p.sheen.sheen;
        phys.sheenColor = new THREE.Color(p.sheen.sheenColor);
        phys.sheenRoughness = p.sheen.sheenRoughness;
      }
      if (p.transmission !== undefined) phys.transmission = p.transmission;
      if (p.thickness !== undefined) phys.thickness = p.thickness;
      material = phys;
    } else {
      material = new THREE.MeshStandardMaterial(params);
    }

    if (tex?.normalMap && spec.normalScale !== undefined) {
      material.normalScale.set(spec.normalScale, spec.normalScale);
    }

    if (spec.lightPool) {
      material.onBeforeCompile = injectLightPool;
    }

    const envScale = spec.env ?? 1.0;
    material.envMapIntensity = this.envIntensity * envScale;
    if (this.env) material.envMap = this.env;

    this.cache.set(key, { material, envScale });
    return material;
  }

  /**
   * Retune (or disable, with `null`) the interior light-pool overlay. Affects every
   * already-built floor material immediately — the uniforms are shared, so nothing
   * recompiles.
   */
  static setInteriorLightPool(spec: LightPoolSpec | null): void {
    if (!spec) {
      LP_UNIFORMS.uLPOn.value = 0;
      return;
    }
    LP_UNIFORMS.uLPOn.value = 1;
    LP_UNIFORMS.uLPPitch.value = spec.pitch;
    LP_UNIFORMS.uLPOffset.value.set(spec.offset[0], spec.offset[1]);
    LP_UNIFORMS.uLPInner.value = spec.inner;
    LP_UNIFORMS.uLPOuter.value = spec.outer;
    LP_UNIFORMS.uLPMin.value = spec.min;
    LP_UNIFORMS.uLPMax.value = spec.max;
    LP_UNIFORMS.uLPTint.value.setHex(spec.color, THREE.SRGBColorSpace);
    LP_UNIFORMS.uLPWear.value = spec.wear;
  }

  /**
   * Bind the IBL environment to every cached material (and every future one).
   *
   * Pass the PMREM output from EnvironmentRig. Passing null clears material-level envMaps, which
   * makes each material fall back to `scene.environment` if one is set.
   *
   * envMapIntensity is `intensity * spec.env`, so a carpet still picks up far less ambient
   * specular than a chrome caster even at the same global intensity.
   */
  static setEnvironment(env: THREE.Texture | null, intensity = 1.0): void {
    this.env = env;
    this.envIntensity = intensity;
    for (const entry of this.cache.values()) {
      const m = entry.material;
      const had = m.envMap !== null;
      m.envMap = env;
      m.envMapIntensity = intensity * entry.envScale;
      // Adding or removing an envMap changes the shader permutation; intensity alone does not.
      if (had !== (env !== null)) m.needsUpdate = true;
    }
  }

  /**
   * Dispose and drop every cached material.
   *
   * Does NOT dispose the textures — those are owned and shared by ProceduralTextures; call
   * `disposeTextureCache()` there as well if you are tearing the renderer down for good.
   */
  static disposeAll(): void {
    for (const entry of this.cache.values()) entry.material.dispose();
    this.cache.clear();
    this.env = null;
    this.envIntensity = 1.0;
  }
}
