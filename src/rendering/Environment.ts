/**
 * Environment.ts — art-directed lighting / IBL / sky / fog rig.
 *
 * One `EnvironmentRig` owns EVERYTHING that makes a level read as a place:
 *   - a procedurally generated HDR environment map (equirect half-float -> PMREM -> scene.environment)
 *   - a key DirectionalLight whose shadow frustum is tightly fitted and texel-snapped to the player
 *   - a HemisphereLight + a cool fill + a warm floor-bounce so nothing ever reads as pure black
 *   - fog (linear indoors, FogExp2 outdoors) colour-matched to the environment
 *   - scene.background (dark neutral indoors, a shaded gradient sky dome + low-poly clouds outdoors)
 *
 * Target look: THPS 1+2 (2020) — strong warm/cool separation, believable ambient light,
 * visible contact shadows, bright bounce, no muddy grey.
 *
 * NOTE FOR INTEGRATION: this rig REPLACES Game.ts's ambientLight / hemiLight / sunLight / fillLight
 * and its `updateLightingForSky()` / per-level `new THREE.Fog(...)` code. Leaving those in place will
 * wash everything out. See the report / header of `apply()`.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MaterialLibrary, LIGHT_POOL_OFFICE } from '../materials/MaterialLibrary';

export type EnvPreset =
  | 'officeInterior'
  | 'garageInterior'
  | 'stairwell'
  | 'lobby'
  | 'cityDay'
  | 'cityDusk'
  | 'highwayNight'
  | 'suburbEvening'
  | 'forestDay'
  | 'trainyardOvercast'
  | 'rooftopSunset';

// ---------------------------------------------------------------------------
// Preset description
// ---------------------------------------------------------------------------

interface LightSpec {
  /** sRGB hex */
  color: number;
  intensity: number;
  /** Offset from the lit point TOWARDS the light (does not need to be normalised). */
  dir: [number, number, number];
}

interface SkySpec {
  zenith: number;
  horizon: number;
  ground: number;
  /** Multiplier applied to the sky colours when baked into the IBL (HDR headroom). */
  skyEnergy: number;
  groundEnergy: number;
  /** Radiance of the sun disc in the IBL. 0 = fully overcast, no disc. */
  sunDiscEnergy: number;
  /** Gain applied to the visible background dome so ACES doesn't mute it. */
  bgGain: number;
}

interface RoomSpec {
  ceiling: number;
  ceilingEnergy: number;
  /** Fluorescent troffer colour + radiance baked into the ceiling of the IBL. */
  panel: number;
  panelEnergy: number;
  /** How many troffer columns around the horizon, and rows up the ceiling. */
  panelCols: number;
  panelRows: number;
  /** Troffer footprint as a fraction of one grid cell (keeps the IBL integral controllable). */
  panelW: number;
  panelH: number;
  wall: number;
  wallEnergy: number;
  floor: number;
  floorEnergy: number;
}

interface FogSpec {
  kind: 'linear' | 'exp2';
  color: number;
  near?: number;
  far?: number;
  density?: number;
}

/**
 * A camera-relative rim/back light. Yaw is measured from the camera's own forward
 * vector (180 = directly behind the subject, pointing back at the lens), so the rim
 * follows the player wherever the camera goes and always separates them from the
 * floor. This is the single cheapest way to buy a hero silhouette.
 */
interface RimSpec {
  color: number;
  intensity: number;
  /** Degrees around Y from the camera forward vector. ~140-160 reads as a back rim. */
  yaw: number;
  /** Degrees above the horizon. */
  pitch: number;
}

interface ShadowSpec {
  /** Half-width of the ortho shadow frustum, in metres. */
  radius: number;
  /** How far up the shadow-casting light sits above the focus point. */
  distance: number;
  /**
   * Vertical slab (metres above the focus point) that is allowed to cast.
   * Indoors this MUST stay below the ceiling height, otherwise the ceiling slab occludes
   * the fake fluorescent key light and the whole room goes into shadow.
   */
  castHeight: number;
  mapSize: number;
  bias: number;
  normalBias: number;
}

export interface PresetSpec {
  interior: boolean;
  /** Recommended renderer.toneMappingExposure for this preset. */
  exposure: number;
  /** Global envMapIntensity handed to MaterialLibrary.setEnvironment(). */
  envIntensity: number;
  sky: SkySpec;
  /** Present for interiors; drives the ceiling/wall/floor bands of the IBL. */
  room?: RoomSpec;
  sun: LightSpec;
  fill: LightSpec;
  /** Up-facing warm bounce that fakes light kicked off the floor. */
  bounce: LightSpec;
  /** Camera-relative back/rim light. Omit for none. */
  rim?: RimSpec;
  hemi: { sky: number; ground: number; intensity: number };
  ambient: { color: number; intensity: number };
  shadow: ShadowSpec;
  fog: FogSpec;
  /** sRGB hex for an explicit background colour, or 'sky' to show the gradient dome. */
  background: number | 'sky';
  /** Number of low-poly cloud instances (0 = none). */
  clouds: number;
}

/**
 * Indoors the interesting shadows are SHORT ones: the 1.2-1.6 m cubicle walls laying a
 * band across the aisle, the desk pedestals, the chair casters. A 20 m frustum on a
 * 2k map is 2 cm/texel, which is exactly the resolution at which a caster shadow
 * dissolves and everything starts to hover. 15 m on a 4k map is 7 mm/texel — enough
 * that the contact point under each wheel survives.
 */
const SHADOW_INDOOR: ShadowSpec = {
  // 15 m was a gameplay-camera number. In any establishing/wide framing it meant the
  // ONLY shadows in the picture were the ones within 15 m of the player, and the
  // remaining 80% of the floorplate was an unshadowed flat plane — which is precisely
  // what read as "grey-beige archviz walkthrough". 20 m on the 4k map is 9.8 mm/texel,
  // still fine enough that the chair casters keep their contact point.
  radius: 20,
  distance: 45,
  castHeight: 8, // desks/cubicles/chairs cast; the ceiling slab above does not
  mapSize: 4096,
  // Tightened along with the resolution: the old -0.0005 / 0.02 pair was set for a
  // 2 cm texel and peter-pans the chair casters clean off their own contact shadow.
  bias: -0.00026,
  normalBias: 0.015,
};
const SHADOW_OUTDOOR: ShadowSpec = {
  radius: 36,
  distance: 70,
  castHeight: 70, // buildings should cast their full height outdoors
  mapSize: 2048,
  bias: -0.0005,
  normalBias: 0.025,
};

/**
 * The art direction lives here. Tweak these numbers, not the code.
 * `officeInterior` is the hero preset and is tuned against refs/scene-office2.png + scene-office3.png:
 * bright cool ceiling, soft falloff down the cubicle rows, warm carpet bounce, readable contact shadows.
 */
export const ENV_PRESETS: Record<EnvPreset, PresetSpec> = {
  officeInterior: {
    interior: true,
    // Raised with the ambient cut below (env 1.0 -> 0.78, hemi 0.24 -> 0.12,
    // ambient 0.08 -> 0.03). Same mid-tone placement, but now the mid tone is
    // carried by the KEY instead of by a uniform ambient wash, so the unlit side
    // of every form actually falls away.
    exposure: 1.28,
    // The single biggest flattener in the old rig. A room IBL is a near-uniform
    // dome: every unit of envIntensity fills the shadow side of every object and
    // narrows the frame's tonal range. Dropping it and pushing the key up buys the
    // whole "deep blacks / bright pools" separation the refs have.
    envIntensity: 0.78,
    sky: {
      zenith: 0xd6e0ee,
      horizon: 0x93a0b2,
      ground: 0x4f4a42,
      skyEnergy: 1.0,
      groundEnergy: 0.25,
      sunDiscEnergy: 0,
      bgGain: 1.0,
    },
    room: {
      // COOL tile, WARM troffers. This is the warm/cool separation baked straight
      // into the IBL: an upward-facing surface catches warm light from the fixture
      // grid, a vertical one catches cool bounce off the tile and the walls. It is
      // not physically what a 5000K troffer does; it is what the concept art does,
      // and the concept art is the target.
      ceiling: 0xc4d3e8,
      ceilingEnergy: 0.3,
      panel: 0xfff3e2, // warm troffer — drives the amber highlight pools
      panelEnergy: 4.6,
      panelCols: 8,
      panelRows: 4,
      panelW: 0.3,
      panelH: 0.26,
      // Cool slate walls at a third of the old energy. The old 0xbdb8ae @ 0.30 was
      // literally painting beige ambient onto every vertical surface in the level.
      wall: 0x77839a,
      wallEnergy: 0.145,
      floor: 0x5d5750, // warm carpet, but barely any bounce energy
      floorEnergy: 0.06,
    },
    // 41 degrees off the horizontal, NOT the old near-vertical 73. A 1.4 m cubicle
    // wall now lays a 1.6 m shadow band across the aisle, which is the whole reason
    // the floor reads as a surface instead of a texture.
    //
    // Warm (0xffeed2) and much stronger. Warm key + cool fill + cool IBL is the
    // separation; doing it in the lights rather than only in the grade means the
    // hue split survives into the material response and the specular highlights.
    sun: { color: 0xfff2e0, intensity: 4.6, dir: [0.62, 0.72, 0.34] },
    // Saturated, not pastel: 0x9fbcf0 at 0.85 was a bright wash that filled the
    // shadow side back in. A deeper blue at 0.5 tints the shadow instead of lifting it.
    fill: { color: 0x5f8ee0, intensity: 0.55, dir: [-0.65, 0.42, -0.75] },
    // Up-facing carpet bounce. Kept low: in a real floorplate the ceiling is a
    // huge surface, and anything above ~0.25 here paints the whole ceiling amber.
    bounce: { color: 0xffc79a, intensity: 0.06, dir: [0.1, -1.0, -0.25] },
    // Cool back rim so the near-black chair and the hero's shirt separate from the
    // mid-tone carpet at follow-camera distance. Pushed hard — with the ambient gone
    // the rim is now the ONLY thing drawing the hero's silhouette.
    rim: { color: 0x9ec6ff, intensity: 1.9, yaw: 152, pitch: 26 },
    hemi: { sky: 0xa8c2e6, ground: 0x3b4250, intensity: 0.14 },
    ambient: { color: 0x5c6c88, intensity: 0.03 },
    shadow: SHADOW_INDOOR,
    // Aerial perspective, rewritten. The old 0x7d786e / 13 / 56 pair fully saturated
    // at 56 m, so in any wide framing the entire back half of the picture WAS the fog
    // colour — one flat warm-grey slab. That is the "grey-beige archviz" note, almost
    // literally. Now: a dark COOL slate that starts far out and never fully saturates
    // inside the room, so distance reads as cool and dark against the warm foreground.
    fog: { kind: 'linear', color: 0x475467, near: 24, far: 110 },
    // Deliberately DARKER than the fog. Any hole in the room shell now reads as a
    // deep-black void, which is a value the frame otherwise never reaches.
    background: 0x2f343c,
    clouds: 0,
  },

  garageInterior: {
    interior: true,
    exposure: 1.15,
    envIntensity: 1.0,
    sky: {
      zenith: 0xc9cfcb,
      horizon: 0x7c7b74,
      ground: 0x4d4b47,
      skyEnergy: 1.0,
      groundEnergy: 0.22,
      sunDiscEnergy: 0,
      bgGain: 1.0,
    },
    room: {
      ceiling: 0xa9adaa,
      ceilingEnergy: 0.2,
      panel: 0xdcf2e6, // slightly green strip lights
      panelEnergy: 3.4,
      panelCols: 5,
      panelRows: 3,
      panelW: 0.3,
      panelH: 0.28,
      wall: 0x77746c,
      wallEnergy: 0.22,
      floor: 0x4b4945,
      floorEnergy: 0.1,
    },
    sun: { color: 0xdfeef0, intensity: 2.8, dir: [0.22, 1.0, 0.45] },
    fill: { color: 0x6f8fb5, intensity: 0.35, dir: [-0.8, 0.3, -0.5] },
    bounce: { color: 0xd9b98c, intensity: 0.22, dir: [0.0, -1.0, 0.15] },
    rim: { color: 0xbcd6ff, intensity: 0.95, yaw: 150, pitch: 24 },
    hemi: { sky: 0xa8bccc, ground: 0x4a463f, intensity: 0.2 },
    ambient: { color: 0x8f9aa4, intensity: 0.08 },
    shadow: { ...SHADOW_INDOOR, radius: 18 },
    fog: { kind: 'linear', color: 0x60625e, near: 12, far: 60 },
    // Background always matches the fog on an interior: any camera that clears the
    // room shell then sees haze, never a black void.
    background: 0x60625e,
    clouds: 0,
  },

  stairwell: {
    interior: true,
    exposure: 1.2,
    envIntensity: 1.0,
    sky: {
      zenith: 0xd6dcd4,
      horizon: 0x8d918a,
      ground: 0x4f524e,
      skyEnergy: 1.0,
      groundEnergy: 0.2,
      sunDiscEnergy: 0,
      bgGain: 1.0,
    },
    room: {
      ceiling: 0xd2d8d0,
      ceilingEnergy: 0.24,
      panel: 0xeaffe8,
      panelEnergy: 4.0,
      panelCols: 4,
      panelRows: 3,
      panelW: 0.28,
      panelH: 0.26,
      wall: 0x8e9188,
      wallEnergy: 0.26,
      floor: 0x55574f,
      floorEnergy: 0.06,
    },
    sun: { color: 0xe6ffe8, intensity: 2.9, dir: [0.15, 1.0, 0.1] },
    fill: { color: 0x7f9ec4, intensity: 0.3, dir: [-0.5, 0.5, -0.8] },
    bounce: { color: 0xbfd0a8, intensity: 0.18, dir: [0.0, -1.0, 0.0] },
    rim: { color: 0xd6ffe0, intensity: 0.9, yaw: 148, pitch: 26 },
    hemi: { sky: 0xc9dfd2, ground: 0x4c4e47, intensity: 0.22 },
    ambient: { color: 0x93a09a, intensity: 0.08 },
    shadow: { ...SHADOW_INDOOR, radius: 13, distance: 30 },
    fog: { kind: 'linear', color: 0x5f625c, near: 9, far: 46 },
    background: 0x5f625c,
    clouds: 0,
  },

  lobby: {
    interior: true,
    exposure: 1.05,
    envIntensity: 1.1,
    sky: {
      zenith: 0xdfe9f7,
      horizon: 0xf3ecdd,
      ground: 0xb3a894,
      skyEnergy: 1.0,
      groundEnergy: 0.25,
      sunDiscEnergy: 0,
      bgGain: 1.0,
    },
    room: {
      ceiling: 0xf0eee8,
      ceilingEnergy: 0.4,
      panel: 0xfff2dc,
      panelEnergy: 3.6,
      panelCols: 6,
      panelRows: 3,
      panelW: 0.3,
      panelH: 0.28,
      // big glazed walls: bright, cool daylight from the sides
      wall: 0xd7e4f2,
      wallEnergy: 0.42,
      floor: 0xb8ae9d,
      floorEnergy: 0.16,
    },
    sun: { color: 0xfff0d6, intensity: 3.4, dir: [0.85, 0.62, 0.35] },
    fill: { color: 0xa8c8ff, intensity: 0.6, dir: [-0.7, 0.45, -0.6] },
    bounce: { color: 0xffd8a8, intensity: 0.45, dir: [0.2, -1.0, -0.1] },
    rim: { color: 0xdcebff, intensity: 0.85, yaw: 154, pitch: 22 },
    hemi: { sky: 0xe4f0ff, ground: 0xa08f76, intensity: 0.35 },
    ambient: { color: 0xcdd8e6, intensity: 0.1 },
    shadow: { ...SHADOW_INDOOR, radius: 26, distance: 55 },
    fog: { kind: 'linear', color: 0xc9cfd6, near: 30, far: 130 },
    background: 0xc9cfd6,
    clouds: 0,
  },

  cityDay: {
    interior: false,
    exposure: 1.0,
    envIntensity: 1.0,
    sky: {
      zenith: 0x1f6fd8,
      horizon: 0xc4dcf6,
      ground: 0x6f7379,
      skyEnergy: 0.62,
      groundEnergy: 0.18,
      sunDiscEnergy: 45,
      bgGain: 1.25,
    },
    sun: { color: 0xfff4e2, intensity: 3.4, dir: [0.55, 0.95, 0.35] },
    fill: { color: 0x9dc4ff, intensity: 0.55, dir: [-0.7, 0.4, -0.6] },
    bounce: { color: 0xbfae94, intensity: 0.3, dir: [0.0, -1.0, 0.2] },
    rim: { color: 0xdcecff, intensity: 0.7, yaw: 150, pitch: 24 },
    hemi: { sky: 0x8fc0f5, ground: 0x6b6660, intensity: 0.3 },
    ambient: { color: 0xa9c4e0, intensity: 0.08 },
    shadow: SHADOW_OUTDOOR,
    fog: { kind: 'exp2', color: 0xbdd6ef, density: 0.0032 },
    background: 'sky',
    clouds: 20,
  },

  cityDusk: {
    interior: false,
    exposure: 1.1,
    envIntensity: 1.05,
    sky: {
      zenith: 0x2b2b58,
      horizon: 0xf2894a,
      ground: 0x4a4048,
      skyEnergy: 1.5,
      groundEnergy: 0.32,
      sunDiscEnergy: 28,
      bgGain: 1.2,
    },
    sun: { color: 0xffa25a, intensity: 3.0, dir: [0.95, 0.24, -0.2] },
    fill: { color: 0x6a86d8, intensity: 0.55, dir: [-0.85, 0.35, 0.3] },
    bounce: { color: 0xd88a5a, intensity: 0.28, dir: [0.1, -1.0, 0.1] },
    rim: { color: 0xffb377, intensity: 0.9, yaw: 150, pitch: 20 },
    hemi: { sky: 0x6577b8, ground: 0x4a3c34, intensity: 0.35 },
    ambient: { color: 0x6a6f96, intensity: 0.1 },
    shadow: { ...SHADOW_OUTDOOR, distance: 60 },
    fog: { kind: 'exp2', color: 0xd4834f, density: 0.005 },
    background: 'sky',
    clouds: 16,
  },

  highwayNight: {
    interior: false,
    exposure: 1.25,
    envIntensity: 1.2,
    sky: {
      zenith: 0x05070f,
      horizon: 0x1b2440,
      ground: 0x14161c,
      skyEnergy: 4.0,
      groundEnergy: 1.2,
      sunDiscEnergy: 4,
      bgGain: 1.0,
    },
    sun: { color: 0x9db4e8, intensity: 1.1, dir: [-0.5, 0.8, 0.45] },
    fill: { color: 0x3f5a9c, intensity: 0.45, dir: [0.6, 0.3, -0.6] },
    // sodium street lamps overhead, not a floor bounce
    bounce: { color: 0xff9c3c, intensity: 0.55, dir: [-0.2, 1.0, -0.3] },
    hemi: { sky: 0x27324f, ground: 0x2a2118, intensity: 0.7 },
    ambient: { color: 0x2b3554, intensity: 0.4 },
    shadow: { ...SHADOW_OUTDOOR, radius: 28, distance: 50 },
    fog: { kind: 'exp2', color: 0x0c1120, density: 0.011 },
    background: 'sky',
    clouds: 0,
  },

  suburbEvening: {
    interior: false,
    exposure: 1.05,
    envIntensity: 1.05,
    sky: {
      zenith: 0x2f6fc0,
      horizon: 0xffc98d,
      ground: 0x6a6350,
      skyEnergy: 0.85,
      groundEnergy: 0.22,
      sunDiscEnergy: 34,
      bgGain: 1.2,
    },
    sun: { color: 0xffc98a, intensity: 3.4, dir: [0.9, 0.4, 0.28] },
    fill: { color: 0x8fb4ff, intensity: 0.5, dir: [-0.8, 0.4, -0.4] },
    bounce: { color: 0xd9b184, intensity: 0.3, dir: [0.0, -1.0, 0.1] },
    hemi: { sky: 0x9dc0ea, ground: 0x6d5c42, intensity: 0.3 },
    ambient: { color: 0xa8b4cc, intensity: 0.08 },
    shadow: { ...SHADOW_OUTDOOR, distance: 60 },
    fog: { kind: 'exp2', color: 0xe8b78a, density: 0.0038 },
    background: 'sky',
    clouds: 14,
  },

  forestDay: {
    interior: false,
    exposure: 1.05,
    envIntensity: 1.0,
    sky: {
      zenith: 0x2e78cc,
      horizon: 0xd2e6f2,
      ground: 0x3f5a2c,
      skyEnergy: 0.6,
      groundEnergy: 0.3,
      sunDiscEnergy: 40,
      bgGain: 1.25,
    },
    sun: { color: 0xfff2d4, intensity: 3.3, dir: [0.45, 1.0, -0.4] },
    fill: { color: 0x9ed08a, intensity: 0.5, dir: [-0.6, 0.35, 0.7] },
    bounce: { color: 0x8fbf5c, intensity: 0.35, dir: [0.0, -1.0, 0.0] },
    hemi: { sky: 0x9ecdf2, ground: 0x4c6b33, intensity: 0.32 },
    ambient: { color: 0xa7c49a, intensity: 0.08 },
    shadow: SHADOW_OUTDOOR,
    fog: { kind: 'exp2', color: 0xb6cfae, density: 0.006 },
    background: 'sky',
    clouds: 10,
  },

  trainyardOvercast: {
    interior: false,
    exposure: 1.1,
    envIntensity: 1.1,
    sky: {
      zenith: 0xc3ccd6,
      horizon: 0xdfe4e9,
      ground: 0x5f5c58,
      skyEnergy: 0.62,
      groundEnergy: 0.2,
      sunDiscEnergy: 0, // fully diffuse
      bgGain: 1.15,
    },
    sun: { color: 0xdde6f0, intensity: 1.6, dir: [0.3, 1.0, 0.5] },
    fill: { color: 0xbccbd8, intensity: 0.45, dir: [-0.5, 0.5, -0.6] },
    bounce: { color: 0xa9a49c, intensity: 0.3, dir: [0.0, -1.0, 0.0] },
    hemi: { sky: 0xd5dee8, ground: 0x5d5a55, intensity: 0.45 },
    ambient: { color: 0xb8c0c8, intensity: 0.1 },
    shadow: { ...SHADOW_OUTDOOR, radius: 40 },
    fog: { kind: 'exp2', color: 0xc4ccd4, density: 0.007 },
    background: 'sky',
    clouds: 0,
  },

  rooftopSunset: {
    interior: false,
    exposure: 1.05,
    envIntensity: 1.1,
    sky: {
      zenith: 0x39346e,
      horizon: 0xff8a45,
      ground: 0x584a48,
      skyEnergy: 1.55,
      groundEnergy: 0.34,
      sunDiscEnergy: 38,
      bgGain: 1.25,
    },
    sun: { color: 0xff9a4d, intensity: 3.6, dir: [1.0, 0.2, -0.15] },
    fill: { color: 0x7a86d8, intensity: 0.6, dir: [-0.9, 0.4, 0.25] },
    bounce: { color: 0xe89a62, intensity: 0.32, dir: [0.05, -1.0, 0.05] },
    rim: { color: 0xffb072, intensity: 1.0, yaw: 150, pitch: 18 },
    hemi: { sky: 0x7d7ac0, ground: 0x5a463c, intensity: 0.35 },
    ambient: { color: 0x77719c, intensity: 0.1 },
    shadow: { ...SHADOW_OUTDOOR, distance: 60 },
    fog: { kind: 'exp2', color: 0xe08a52, density: 0.0042 },
    background: 'sky',
    clouds: 18,
  },
};

// ---------------------------------------------------------------------------
// Small maths helpers
// ---------------------------------------------------------------------------

const _mLight = /*@__PURE__*/ new THREE.Matrix4();
const _mLightInv = /*@__PURE__*/ new THREE.Matrix4();
const _vTmp = /*@__PURE__*/ new THREE.Vector3();
const _vOrigin = /*@__PURE__*/ new THREE.Vector3(0, 0, 0);
const _cTmp = /*@__PURE__*/ new THREE.Color();

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function fract(x: number): number {
  return x - Math.floor(x);
}

/** sRGB hex -> linear-sRGB working-space RGB triplet. */
function linearRGB(hex: number, out: [number, number, number]): [number, number, number] {
  _cTmp.setHex(hex, THREE.SRGBColorSpace);
  out[0] = _cTmp.r;
  out[1] = _cTmp.g;
  out[2] = _cTmp.b;
  return out;
}

/** Deterministic little PRNG so cloud layouts are stable between runs. */
function makeRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Procedural HDR environment map
// ---------------------------------------------------------------------------

const EQUIRECT_W = 512;
const EQUIRECT_H = 256;

/**
 * Build a half-float linear equirectangular radiance map for a preset.
 *
 * Layout matches three's `equirectUv()`:  u = atan2(z, x)/2PI + 0.5,  v = asin(y)/PI + 0.5.
 * DataTexture rows start at v = 0 (straight down), so row 0 is the floor.
 *
 * Exported for offline inspection/tuning; `EnvironmentRig` calls it internally.
 * Values are LINEAR radiance and deliberately exceed 1.0 for lights and the sun disc.
 */
export function createEnvEquirect(preset: EnvPreset): THREE.DataTexture {
  const spec = ENV_PRESETS[preset];
  const w = EQUIRECT_W;
  const h = EQUIRECT_H;
  const data = new Uint16Array(w * h * 4);
  const toHalf = THREE.DataUtils.toHalfFloat;

  const zenith = linearRGB(spec.sky.zenith, [0, 0, 0]);
  const horizon = linearRGB(spec.sky.horizon, [0, 0, 0]);
  const groundC = linearRGB(spec.sky.ground, [0, 0, 0]);
  const sunTint = linearRGB(spec.sun.color, [0, 0, 0]);

  const sd = new THREE.Vector3(spec.sun.dir[0], spec.sun.dir[1], spec.sun.dir[2]).normalize();

  // Interior bands
  const room = spec.room;
  const ceil = room ? linearRGB(room.ceiling, [0, 0, 0]) : zenith;
  const panel = room ? linearRGB(room.panel, [0, 0, 0]) : zenith;
  const wall = room ? linearRGB(room.wall, [0, 0, 0]) : horizon;
  const floor = room ? linearRGB(room.floor, [0, 0, 0]) : groundC;

  const rgb: [number, number, number] = [0, 0, 0];

  for (let j = 0; j < h; j++) {
    const v = (j + 0.5) / h;
    const y = Math.sin((v - 0.5) * Math.PI);
    const r = Math.sqrt(Math.max(0, 1 - y * y));

    for (let i = 0; i < w; i++) {
      const u = (i + 0.5) / w;
      const ang = (u - 0.5) * Math.PI * 2;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;

      if (room) {
        // ---- interior: floor band -> wall band -> ceiling band + troffers ----
        const up = smoothstep(0.02, 0.45, y);
        const down = smoothstep(0.02, 0.5, -y);

        // panel mask: a grid of bright rectangles overhead
        const gu = fract(u * room.panelCols);
        const gv = fract((1 - y) * room.panelRows * 2.0);
        const pw = room.panelW;
        const ph = room.panelH;
        const maskU = smoothstep(0.0, 0.08, gu) * (1 - smoothstep(pw, pw + 0.08, gu));
        const maskV = smoothstep(0.0, 0.08, gv) * (1 - smoothstep(ph, ph + 0.08, gv));
        const panelMask = maskU * maskV * smoothstep(0.42, 0.75, y);

        for (let c = 0; c < 3; c++) {
          const wallV = wall[c] * room.wallEnergy;
          const ceilV = ceil[c] * room.ceilingEnergy + panel[c] * room.panelEnergy * panelMask;
          const floorV = floor[c] * room.floorEnergy;
          rgb[c] = wallV + (ceilV - wallV) * up + (floorV - wallV) * down;
        }
      } else {
        // ---- exterior: gradient sky + sun disc/halo, dim ground hemisphere ----
        if (y >= 0) {
          const t = Math.pow(y, 0.55);
          for (let c = 0; c < 3; c++) {
            rgb[c] = (horizon[c] + (zenith[c] - horizon[c]) * t) * spec.sky.skyEnergy;
          }
          if (spec.sky.sunDiscEnergy > 0) {
            const d = x * sd.x + y * sd.y + z * sd.z;
            // ~2.6 deg disc plus a tight and a broad halo
            const disc = smoothstep(0.99895, 0.99965, d);
            const dm = Math.max(0, d);
            const halo = Math.pow(dm, 240) * 0.9 + Math.pow(dm, 12) * 0.07;
            const e = spec.sky.sunDiscEnergy;
            for (let c = 0; c < 3; c++) {
              rgb[c] += sunTint[c] * (disc * e + halo * e * 0.16);
            }
          }
        } else {
          const t = smoothstep(0.0, 0.4, -y);
          for (let c = 0; c < 3; c++) {
            const hz = horizon[c] * spec.sky.skyEnergy * 0.75;
            const gr = groundC[c] * spec.sky.groundEnergy;
            rgb[c] = hz + (gr - hz) * t;
          }
        }
      }

      const o = (j * w + i) * 4;
      data[o] = toHalf(Math.min(rgb[0], 60));
      data[o + 1] = toHalf(Math.min(rgb[1], 60));
      data[o + 2] = toHalf(Math.min(rgb[2], 60));
      data[o + 3] = toHalf(1);
    }
  }

  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.name = `env-equirect-${preset}`;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace; // already linear radiance
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Sky dome
// ---------------------------------------------------------------------------

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uSunDisc;
  varying vec3 vDir;

  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;
    vec3 col;
    if (y >= 0.0) {
      col = mix(uHorizon, uZenith, pow(clamp(y, 0.0, 1.0), 0.55));
    } else {
      col = mix(uHorizon, uGround, smoothstep(0.0, 0.32, -y));
    }
    if (uSunDisc > 0.0) {
      float sdot = dot(d, uSunDir);
      float dm = max(sdot, 0.0);
      float disc = smoothstep(0.99930, 0.99975, sdot);
      float halo = pow(dm, 300.0) * 0.55 + pow(dm, 14.0) * 0.10;
      col += uSunColor * (disc * 3.0 + halo) * uSunDisc;
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------------------
// EnvironmentRig
// ---------------------------------------------------------------------------

export class EnvironmentRig {
  /** Shadow-casting key light. Its `target` is added to the scene and follows the focus point. */
  readonly sun: THREE.DirectionalLight;
  /** Cool fill from the opposite side. No shadow. */
  readonly fill: THREE.DirectionalLight;
  /** Warm up-facing bounce that fakes floor/carpet kick. No shadow. */
  readonly bounce: THREE.DirectionalLight;
  /**
   * Camera-relative back rim. Repositioned every frame from the camera's yaw so the
   * player always carries an edge highlight that lifts them off the floor.
   */
  readonly rim: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly ambient: THREE.AmbientLight;

  private readonly scene: THREE.Scene;
  private readonly renderer: THREE.WebGLRenderer;

  private pmrem: THREE.PMREMGenerator | null = null;
  private readonly envCache = new Map<EnvPreset, THREE.WebGLRenderTarget>();
  private _envMap: THREE.Texture | null = null;

  private preset: EnvPreset | null = null;
  private spec: PresetSpec | null = null;

  private readonly lightGroup: THREE.Group;
  private readonly sunDir = new THREE.Vector3(0, 1, 0);
  private readonly sunUp = new THREE.Vector3(0, 1, 0);
  private rimYaw = 0;
  private rimPitch = 0;
  private shadowScale = 1;
  private readonly rimDir = new THREE.Vector3(0, 0, 1);

  private skyMesh: THREE.Mesh | null = null;
  private skyMat: THREE.ShaderMaterial | null = null;
  private clouds: THREE.InstancedMesh | null = null;
  private cloudCapacity = 0;
  private cloudGroup: THREE.Group | null = null;
  private cloudDrift = 0;
  /** Legacy sky domes we hid so they cannot paint over our background. Restored on dispose(). */
  private readonly suppressed: THREE.Object3D[] = [];

  private disposed = false;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.renderer = renderer;

    this.lightGroup = new THREE.Group();
    this.lightGroup.name = 'EnvironmentRig';
    scene.add(this.lightGroup);

    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.name = 'env-key';
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.lightGroup.add(this.sun);
    this.lightGroup.add(this.sun.target);

    this.fill = new THREE.DirectionalLight(0xffffff, 0.5);
    this.fill.name = 'env-fill';
    this.fill.castShadow = false;
    this.lightGroup.add(this.fill);
    this.lightGroup.add(this.fill.target);

    this.bounce = new THREE.DirectionalLight(0xffffff, 0.3);
    this.bounce.name = 'env-bounce';
    this.bounce.castShadow = false;
    this.lightGroup.add(this.bounce);
    this.lightGroup.add(this.bounce.target);

    this.rim = new THREE.DirectionalLight(0xffffff, 0.0);
    this.rim.name = 'env-rim';
    this.rim.castShadow = false;
    this.rim.visible = false;
    this.lightGroup.add(this.rim);
    this.lightGroup.add(this.rim.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.5);
    this.hemi.name = 'env-hemi';
    this.lightGroup.add(this.hemi);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.1);
    this.ambient.name = 'env-ambient';
    this.lightGroup.add(this.ambient);
  }

  get envMap(): THREE.Texture | null {
    return this._envMap;
  }

  /** The preset currently applied, or null before the first apply(). */
  get currentPreset(): EnvPreset | null {
    return this.preset;
  }

  /**
   * Apply a preset: rebuild/reuse the IBL, retune every light, set fog + background.
   *
   * Integration: this writes scene.environment, scene.fog, scene.background and
   * renderer.toneMappingExposure. Remove Game.ts's own light set + updateLightingForSky()
   * + per-level `new THREE.Fog(...)` or they will fight each other.
   */
  apply(preset: EnvPreset): void {
    if (this.disposed) return;
    const spec = ENV_PRESETS[preset];
    if (!spec) return;

    this.preset = preset;
    this.spec = spec;

    // ---- IBL ----------------------------------------------------------
    const env = this.buildEnv(preset);
    this._envMap = env;
    this.scene.environment = env;
    MaterialLibrary.setEnvironment(env, spec.envIntensity);

    // The troffer grid is baked into the IBL, which gets its colour right and its
    // SHAPE completely wrong — a real fluorescent ceiling lays down pools, not a
    // uniform wash. Switch the floor's world-space pool overlay on for interiors.
    MaterialLibrary.setInteriorLightPool(spec.interior ? LIGHT_POOL_OFFICE : null);

    // ---- key light ----------------------------------------------------
    this.sunDir.set(spec.sun.dir[0], spec.sun.dir[1], spec.sun.dir[2]).normalize();
    this.sunUp.set(0, 1, 0);
    if (Math.abs(this.sunDir.y) > 0.995) this.sunUp.set(0, 0, 1);

    this.sun.color.setHex(spec.sun.color, THREE.SRGBColorSpace);
    this.sun.intensity = spec.sun.intensity;

    const sh = spec.shadow;
    const mapSize = this.resolveMapSize(sh.mapSize);
    if (this.sun.shadow.mapSize.x !== mapSize) {
      this.sun.shadow.mapSize.set(mapSize, mapSize);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
    const cam = this.sun.shadow.camera;
    cam.left = -sh.radius;
    cam.right = sh.radius;
    cam.top = sh.radius;
    cam.bottom = -sh.radius;
    cam.near = Math.max(0.1, sh.distance - sh.castHeight);
    cam.far = sh.distance + sh.radius * 2;
    cam.updateProjectionMatrix();
    this.sun.shadow.bias = sh.bias;
    this.sun.shadow.normalBias = sh.normalBias;

    // ---- fill / bounce / hemi / ambient --------------------------------
    this.setDirLight(this.fill, spec.fill, 60);
    this.setDirLight(this.bounce, spec.bounce, 30);

    if (spec.rim) {
      this.rim.color.setHex(spec.rim.color, THREE.SRGBColorSpace);
      this.rim.intensity = spec.rim.intensity;
      this.rim.visible = true;
      this.rimYaw = (spec.rim.yaw * Math.PI) / 180;
      this.rimPitch = (spec.rim.pitch * Math.PI) / 180;
    } else {
      this.rim.intensity = 0;
      this.rim.visible = false;
    }

    this.hemi.color.setHex(spec.hemi.sky, THREE.SRGBColorSpace);
    this.hemi.groundColor.setHex(spec.hemi.ground, THREE.SRGBColorSpace);
    this.hemi.intensity = spec.hemi.intensity;

    this.ambient.color.setHex(spec.ambient.color, THREE.SRGBColorSpace);
    this.ambient.intensity = spec.ambient.intensity;

    // ---- fog ------------------------------------------------------------
    if (spec.fog.kind === 'exp2') {
      this.scene.fog = new THREE.FogExp2(spec.fog.color, spec.fog.density ?? 0.004);
    } else {
      this.scene.fog = new THREE.Fog(spec.fog.color, spec.fog.near ?? 20, spec.fog.far ?? 120);
    }

    // ---- background -----------------------------------------------------
    if (spec.background === 'sky') {
      this.scene.background = null;
      this.ensureSky();
      this.updateSkyUniforms(spec);
      if (this.skyMesh) this.skyMesh.visible = true;
      this.ensureClouds(spec.clouds);
      if (this.cloudGroup) this.cloudGroup.visible = spec.clouds > 0;
    } else {
      if (this.scene.background instanceof THREE.Color) {
        this.scene.background.setHex(spec.background, THREE.SRGBColorSpace);
      } else {
        this.scene.background = new THREE.Color().setHex(spec.background, THREE.SRGBColorSpace);
      }
      if (this.skyMesh) this.skyMesh.visible = false;
      if (this.cloudGroup) this.cloudGroup.visible = false;
    }

    // ---- exposure --------------------------------------------------------
    this.renderer.toneMappingExposure = spec.exposure;

    this.suppressLegacySkyDomes();
  }

  /**
   * Game.ts's SkyGradient dome uses depthTest:false + renderOrder -1000, so it paints over
   * scene.background and would show blue sky inside the office. Hide any such dome once we
   * are driving the environment. (The second, r=500 depth-tested dome created in
   * Game.initEnvironment() is NOT caught here — it is a normal opaque sphere and must be
   * deleted at the source; it is removed anyway on the first loadCustomLevel().)
   */
  private suppressLegacySkyDomes(): void {
    this.scene.traverse((o) => {
      if (o === this.skyMesh || !o.visible) return;
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.renderOrder > -1000) return;
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (!mat || mat.depthTest !== false) return;
      o.visible = false;
      this.suppressed.push(o);
    });
  }

  /**
   * Scale every preset's shadow-map resolution. 1.0 = the authored 4k indoor map
   * (7 mm/texel, which is what makes contact shadows survive); 0.5 halves it for a
   * weak GPU. Clamped to a power of two between 512 and 4096.
   */
  setShadowQuality(scale: number): void {
    const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
    if (s === this.shadowScale) return;
    this.shadowScale = s;
    if (this.preset) this.apply(this.preset);
  }

  private resolveMapSize(base: number): number {
    const raw = base * this.shadowScale;
    const p = Math.pow(2, Math.round(Math.log2(Math.max(1, raw))));
    return Math.min(4096, Math.max(512, p));
  }

  /** Apply `preset` only if it isn't already active. */
  setPreset(preset: EnvPreset): void {
    if (this.preset === preset) return;
    this.apply(preset);
  }

  /**
   * Per-frame. `focus` is the point the shadow frustum should be centred on — the player.
   * The frustum centre is snapped to the shadow-map texel grid in light space so shadows
   * do not crawl/shimmer as the player moves.
   *
   * Pass `camera` to drive the camera-relative rim light. Without it the rim falls back
   * to a fixed world direction, which still separates the hero but does not track.
   */
  update(dt: number, focus: THREE.Vector3, camera?: THREE.Camera): void {
    if (this.disposed || !this.spec) return;
    const sh = this.spec.shadow;

    // ---- camera-relative rim -------------------------------------------
    if (this.rim.visible) {
      // Camera forward projected onto the ground plane.
      let fx = 0;
      let fz = 1;
      if (camera) {
        camera.getWorldDirection(this.rimDir);
        const len = Math.hypot(this.rimDir.x, this.rimDir.z);
        if (len > 1e-4) {
          fx = this.rimDir.x / len;
          fz = this.rimDir.z / len;
        }
      }
      const c = Math.cos(this.rimYaw);
      const s = Math.sin(this.rimYaw);
      const rx = fx * c - fz * s;
      const rz = fx * s + fz * c;
      const cp = Math.cos(this.rimPitch);
      const sp = Math.sin(this.rimPitch);
      // Position the light OPPOSITE the direction it should throw from, i.e. behind
      // the subject relative to the lens.
      this.rim.position.set(focus.x - rx * 22 * cp, focus.y + 22 * sp, focus.z - rz * 22 * cp);
      this.rim.target.position.copy(focus);
      this.rim.target.updateMatrixWorld();
    }

    // Build a light-space rotation basis and snap the frustum centre to the texel grid.
    _mLight.lookAt(this.sunDir, _vOrigin, this.sunUp);
    _mLightInv.copy(_mLight).invert();

    const texel = (sh.radius * 2) / this.resolveMapSize(sh.mapSize);
    _vTmp.copy(focus).applyMatrix4(_mLightInv);
    _vTmp.x = Math.round(_vTmp.x / texel) * texel;
    _vTmp.y = Math.round(_vTmp.y / texel) * texel;
    _vTmp.applyMatrix4(_mLight);

    this.sun.target.position.copy(_vTmp);
    this.sun.position.copy(_vTmp).addScaledVector(this.sunDir, sh.distance);
    this.sun.target.updateMatrixWorld();

    // Sky + clouds ride along with the player so they never clip the far plane.
    if (this.skyMesh && this.skyMesh.visible) {
      this.skyMesh.position.copy(focus);
    }
    if (this.cloudGroup && this.cloudGroup.visible) {
      // seamless slow rotation rather than an unbounded translation (no wrap pop)
      this.cloudDrift += dt * 0.006;
      this.cloudGroup.position.set(focus.x, 0, focus.z);
      this.cloudGroup.rotation.y = this.cloudDrift;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    for (const o of this.suppressed) o.visible = true;
    this.suppressed.length = 0;

    this.scene.remove(this.lightGroup);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }

    if (this.skyMesh) {
      this.scene.remove(this.skyMesh);
      this.skyMesh.geometry.dispose();
    }
    this.skyMat?.dispose();
    this.skyMesh = null;
    this.skyMat = null;

    if (this.cloudGroup) {
      this.scene.remove(this.cloudGroup);
    }
    if (this.clouds) {
      this.clouds.geometry.dispose();
      (this.clouds.material as THREE.Material).dispose();
      this.clouds.dispose();
      this.clouds = null;
    }
    this.cloudGroup = null;

    for (const rt of this.envCache.values()) rt.dispose();
    this.envCache.clear();
    this.pmrem?.dispose();
    this.pmrem = null;

    this._envMap = null;
    this.scene.environment = null;
    MaterialLibrary.setEnvironment(null);
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  private setDirLight(light: THREE.DirectionalLight, spec: LightSpec, distance: number): void {
    light.color.setHex(spec.color, THREE.SRGBColorSpace);
    light.intensity = spec.intensity;
    _vTmp.set(spec.dir[0], spec.dir[1], spec.dir[2]).normalize().multiplyScalar(distance);
    light.position.copy(_vTmp);
    light.target.position.set(0, 0, 0);
    light.target.updateMatrixWorld();
  }

  private buildEnv(preset: EnvPreset): THREE.Texture {
    const cached = this.envCache.get(preset);
    if (cached) return cached.texture;

    if (!this.pmrem) {
      this.pmrem = new THREE.PMREMGenerator(this.renderer);
      this.pmrem.compileEquirectangularShader();
    }
    const equirect = createEnvEquirect(preset);
    const rt = this.pmrem.fromEquirectangular(equirect);
    equirect.dispose();
    rt.texture.name = `env-pmrem-${preset}`;
    this.envCache.set(preset, rt);
    return rt.texture;
  }

  private ensureSky(): void {
    if (this.skyMesh) return;
    const geo = new THREE.SphereGeometry(600, 24, 14);
    this.skyMat = new THREE.ShaderMaterial({
      name: 'EnvSkyDome',
      uniforms: {
        uZenith: { value: new THREE.Color(0x1f6fd8) },
        uHorizon: { value: new THREE.Color(0xc4dcf6) },
        uGround: { value: new THREE.Color(0x6f7379) },
        uSunColor: { value: new THREE.Color(0xfff4e2) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunDisc: { value: 1.0 },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: true,
    });
    this.skyMesh = new THREE.Mesh(geo, this.skyMat);
    this.skyMesh.name = 'env-sky-dome';
    this.skyMesh.frustumCulled = false;
    // -999 so we draw AFTER (and therefore over) the legacy SkyGradient dome at -1000,
    // which also uses depthTest:false. Still far ahead of all opaque geometry.
    this.skyMesh.renderOrder = -999;
    this.scene.add(this.skyMesh);
  }

  private updateSkyUniforms(spec: PresetSpec): void {
    if (!this.skyMat) return;
    const u = this.skyMat.uniforms;
    const g = spec.sky.bgGain;
    (u.uZenith.value as THREE.Color).setHex(spec.sky.zenith, THREE.SRGBColorSpace).multiplyScalar(g);
    (u.uHorizon.value as THREE.Color).setHex(spec.sky.horizon, THREE.SRGBColorSpace).multiplyScalar(g);
    (u.uGround.value as THREE.Color).setHex(spec.sky.ground, THREE.SRGBColorSpace).multiplyScalar(g * 0.8);
    (u.uSunColor.value as THREE.Color).setHex(spec.sun.color, THREE.SRGBColorSpace);
    (u.uSunDir.value as THREE.Vector3)
      .set(spec.sun.dir[0], spec.sun.dir[1], spec.sun.dir[2])
      .normalize();
    u.uSunDisc.value = spec.sky.sunDiscEnergy > 0 ? 1.0 : 0.0;
  }

  private ensureClouds(count: number): void {
    if (count <= 0) return;
    if (this.clouds && this.cloudCapacity >= count) {
      this.clouds.count = count;
      return;
    }
    if (this.clouds) {
      this.scene.remove(this.cloudGroup!);
      this.clouds.geometry.dispose();
      (this.clouds.material as THREE.Material).dispose();
      this.clouds.dispose();
      this.clouds = null;
      this.cloudGroup = null;
      this.cloudCapacity = 0;
    }

    // One chunky faceted puff = 3 merged low-detail icosahedra (60 tris).
    const blobs: THREE.BufferGeometry[] = [];
    const offsets: [number, number, number, number][] = [
      [0, 0, 0, 1.0],
      [0.85, -0.18, 0.12, 0.68],
      [-0.8, -0.24, -0.15, 0.6],
    ];
    for (const [ox, oy, oz, s] of offsets) {
      const g = new THREE.IcosahedronGeometry(s, 0);
      g.translate(ox, oy, oz);
      blobs.push(g);
    }
    const merged = mergeGeometries(blobs, false);
    for (const g of blobs) g.dispose();
    const cloudGeo = merged ?? new THREE.IcosahedronGeometry(1, 0);

    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1.0,
      metalness: 0.0,
      flatShading: true,
      fog: false,
      emissive: 0xdfe9f5,
      emissiveIntensity: 0.35,
    });

    const mesh = new THREE.InstancedMesh(cloudGeo, cloudMat, count);
    mesh.name = 'env-clouds';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    const rand = makeRandom(0xc10d5);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand() * 0.5;
      const rad = 170 + rand() * 190;
      p.set(Math.cos(a) * rad, 70 + rand() * 90, Math.sin(a) * rad);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
      const sc = 16 + rand() * 30;
      s.set(sc, sc * (0.28 + rand() * 0.16), sc * (0.6 + rand() * 0.3));
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;

    const group = new THREE.Group();
    group.name = 'env-cloud-layer';
    group.add(mesh);
    this.scene.add(group);
    this.clouds = mesh;
    this.cloudCapacity = count;
    this.cloudGroup = group;
  }
}
