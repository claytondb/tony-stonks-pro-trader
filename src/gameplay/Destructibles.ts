/**
 * Destructibles — knockable, smashable office props for Tony Stonks Pro Trader.
 *
 * WHY THIS EXISTS
 * ---------------
 * Before this file, `RigidBodyDesc.dynamic()` appeared exactly ONCE in the whole codebase
 * (the player's chair). Every cone, bin, box and printer in the office was `fixed()`, so
 * nothing in the world could be disturbed. The owner asked for "physics and things he can
 * knock over, or papers that fly around when you ride over them". This module is that.
 *
 * DESIGN CONTRACT
 * ---------------
 *  - SELF-CONTAINED. It imports THREE, Rapier and (defensively, by namespace) the art
 *    modules. It imports NOTHING from Game.ts. Everything it needs about the player —
 *    position, velocity, mass — is handed in through `update()` / `setPlayerMass()`.
 *  - It never calls `world.step()`. The game already steps the shared Rapier world; these
 *    bodies live in that same world and are simulated by that same step.
 *  - It never mutates a MaterialLibrary material in place (they are shared + cached).
 *    Anything it needs to tweak, it clones and owns and disposes.
 *
 * PERFORMANCE MODEL (a level may hold several hundred of these)
 * ------------------------------------------------------------
 * Three tiers, and a prop only ever climbs one tier at a time:
 *
 *   1. FIXED PROXY   — the default. One `RigidBodyType.Fixed` body with its collider. It
 *                      collides, it is part of the world, and it costs the solver nothing.
 *   2. DYNAMIC ASLEEP— promoted when the player comes within `promoteRadius`. Rapier keeps
 *                      sleeping dynamic bodies out of the solver, so this is nearly free,
 *                      but the body is now one impulse away from moving.
 *   3. DYNAMIC AWAKE — actually simulating. This is the expensive tier, so it is HARD
 *                      CAPPED at `awakeBudget` (default 24). Over budget, the furthest
 *                      awake bodies are forcibly put back to sleep.
 *
 * Bodies are POOLED IN PLACE: a body is created once at `spawn()` and then only ever
 * changes type via `setBodyType()`. Nothing is created or destroyed during play, so there
 * is no allocation churn and no broad-phase rebuild while skating.
 *
 * IMPACT MODEL
 * ------------
 * `PhysicsWorld.step()` runs without an EventQueue and we may not edit it, so we cannot
 * read Rapier contact events. Player impacts are therefore detected here, analytically:
 * the player's swept capsule centre is tested against each nearby prop's expanded bounds,
 * and the *closing momentum* (playerMass x closing speed) is compared against the kind's
 * `smashImpulse`. Prop-on-prop destruction is handled by an explicit chain-reaction
 * propagation from the struck prop, which gives box stacks and cone stacks the domino
 * behaviour you expect without needing contact events.
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// Defensive namespace imports: these modules are being written in parallel and individual
// builders may appear, move or briefly vanish. We resolve every builder by name at call
// time and fall back to primitive geometry, so a missing export degrades the visuals
// instead of crashing the level.
import * as OfficeProps from '../world/OfficeProps';
import * as ChairModelNS from '../world/ChairModel';
import * as MaterialLibraryNS from '../materials/MaterialLibrary';

// ---------------------------------------------------------------------------
// Public API types
// ---------------------------------------------------------------------------

export type DestructibleKind =
  | 'trashCan'
  | 'waterCooler'
  | 'printer'
  | 'paperStack'
  | 'cardboardBox'
  | 'chairEmpty'
  | 'monitor'
  | 'pottedPlant'
  | 'coneStack'
  | 'filingCabinet'
  | 'mug';

/** What the wreckage is made of. The VFX system reads this to pick a particle set. */
export type DebrisKind = 'paper' | 'plastic' | 'metal' | 'soil' | 'glass' | 'cardboard';

export interface DestructibleDef {
  kind: DestructibleKind;
  /** Floor-contact point of the prop, matching the OfficeProps origin contract (base at y=0). */
  position: THREE.Vector3;
  rotationY?: number;
  /** Override the kind's default mass, kg. */
  mass?: number;
  /** Override the closing momentum (kg m/s) needed to destroy it. */
  smashImpulse?: number;
  /** Override the stonks awarded when it is destroyed. */
  scoreValue?: number;
  /** Stable id. Auto-generated if omitted. Use an explicit id for GoalSystem smash targets. */
  id?: string;
  /** Deterministic art variation seed. Same seed => identical prop. */
  seed?: number;
  /** Art LOD passed to the OfficeProps builder. 0 = hero (default), 1 = mid, 2 = far. */
  variant?: number;
}

export interface SmashEvent {
  id: string;
  kind: DestructibleKind;
  /** World position of the wreck at the moment it broke. */
  position: THREE.Vector3;
  /** Closing momentum of the hit, kg m/s. Useful for scaling camera shake / audio. */
  impulse: number;
  scoreValue: number;
  debrisKind: DebrisKind;
  /** Human label, e.g. "Water Cooler". Handy for the ticker and for goal readouts. */
  label: string;
  /** Horizontal direction the hit came from, normalised. VFX can bias the particle cone. */
  direction: THREE.Vector3;
  /** True if the prop was toppled (it still exists and still collides) rather than broken apart. */
  toppled: boolean;
}

export interface DestructibleTuning {
  /** Mass of the player's chair body, kg. Matches PhysicsWorld.createChairBody's collider mass. */
  playerMass: number;
  /** Radius of the player capsule used for impact tests, m. */
  playerRadius: number;
  /** Half-height of the player capsule's cylindrical section plus caps, m. */
  playerHalfHeight: number;
  /** Distance at which a fixed proxy is promoted to a dynamic body, m. */
  promoteRadius: number;
  /** Distance at which a settled dynamic body drops back to a fixed proxy, m. */
  demoteRadius: number;
  /** Hard cap on simultaneously AWAKE dynamic bodies. */
  awakeBudget: number;
  /** Fraction of the player's momentum transferred into the prop. */
  impulseTransfer: number;
  /** Minimum closing speed that counts as a hit at all, m/s. */
  minClosingSpeed: number;
  /** Seconds before the same prop can be hit by the player again. */
  hitCooldown: number;
  /** Radius over which a smashed prop shoves its neighbours, m. */
  chainRadius: number;
  /** Momentum multiplier passed down a chain-reaction link. */
  chainFalloff: number;
  /** Master switch for the built-in debris shards. Turn off if a VFX system supersedes it. */
  debris: boolean;
}

const DEFAULT_TUNING: DestructibleTuning = {
  playerMass: 50, // PhysicsWorld.createChairBody -> capsule collider .setMass(50)
  playerRadius: 0.45, // capsule radius 0.4 + a little forgiveness
  // capsule halfHeight 0.3 + cap radius 0.4. The body centre sits 0.7 above the wheels, so
  // this exactly spans wheels-to-head — anything a mug on the floor to a monitor on a desk.
  playerHalfHeight: 0.7,
  promoteRadius: 14,
  demoteRadius: 20,
  awakeBudget: 24,
  impulseTransfer: 0.55,
  minClosingSpeed: 0.8,
  hitCooldown: 0.3,
  chainRadius: 1.1,
  chainFalloff: 0.45,
  debris: true,
};

// ---------------------------------------------------------------------------
// Per-kind physical + art profile
//
// Numbers are in metres / kilograms / (kg m/s). `smashImpulse` is closing MOMENTUM, so
// divide by the player mass (50 kg) to read it as a speed: the player tops out at 18 m/s
// (Game.ts maxSpeed), i.e. 900 kg m/s, and cruises around 500.
// ---------------------------------------------------------------------------

type Behaviour = 'topple' | 'burst';

interface KindProfile {
  label: string;
  builder: string | null;
  shape: 'box' | 'cylinder';
  /** Box: half extents. Cylinder: [radius, halfHeight, radius]. */
  half: readonly [number, number, number];
  mass: number;
  friction: number;
  restitution: number;
  linearDamping: number;
  angularDamping: number;
  /** Closing momentum needed to destroy it. */
  smashImpulse: number;
  /** Closing momentum below which a graze does nothing at all. */
  nudgeImpulse: number;
  /** Cap on the delta-v a single hit can impart, m/s. This is what makes a cabinet immovable. */
  maxKnockSpeed: number;
  scoreValue: number;
  debris: DebrisKind;
  debrisCount: number;
  behaviour: Behaviour;
  /** Where up the prop the impulse lands, as a fraction of half-height. Higher = tips easier. */
  leverage: number;
  /** burst only: vertical squash of the wreck. 0 = the prop disappears entirely. */
  wreckSquash: number;
  /** Fallback colour when the OfficeProps builder is unavailable. */
  fallbackColor: number;
}

const PROFILES: Record<DestructibleKind, KindProfile> = {
  // Tips on the lightest brush and rolls forever — the signature THPS street prop.
  trashCan: {
    label: 'Trash Can',
    builder: 'makeTrashCan',
    shape: 'cylinder',
    half: [0.165, 0.2, 0.165],
    mass: 3,
    friction: 0.35,
    restitution: 0.35,
    linearDamping: 0.08,
    angularDamping: 0.12,
    smashImpulse: 130,
    nudgeImpulse: 25,
    maxKnockSpeed: 9,
    scoreValue: 100,
    debris: 'paper',
    debrisCount: 6,
    behaviour: 'topple',
    leverage: 0.85,
    wreckSquash: 1,
    fallbackColor: 0x3a4046,
  },
  // Top-heavy: the glass jug is most of the mass, so it goes over rather than sliding.
  waterCooler: {
    label: 'Water Cooler',
    builder: 'makeWaterCooler',
    shape: 'box',
    half: [0.17, 0.49, 0.17],
    mass: 18,
    friction: 0.5,
    restitution: 0.08,
    linearDamping: 0.15,
    angularDamping: 0.3,
    smashImpulse: 400,
    nudgeImpulse: 80,
    maxKnockSpeed: 3.2,
    scoreValue: 300,
    debris: 'glass',
    debrisCount: 9,
    behaviour: 'topple',
    leverage: 0.9,
    wreckSquash: 1,
    fallbackColor: 0xbfc4c8,
  },
  // Heavy, low, and full of paper. Bursts into a blizzard of A4.
  printer: {
    label: 'Printer',
    builder: 'makePrinter',
    shape: 'box',
    half: [0.31, 0.275, 0.27],
    mass: 24,
    friction: 0.6,
    restitution: 0.04,
    linearDamping: 0.25,
    angularDamping: 0.5,
    smashImpulse: 460,
    nudgeImpulse: 110,
    maxKnockSpeed: 2.6,
    scoreValue: 400,
    debris: 'paper',
    debrisCount: 12,
    behaviour: 'burst',
    leverage: 0.5,
    wreckSquash: 0.55,
    fallbackColor: 0xa9adaf,
  },
  // "Papers that fly around when you ride over them" — this is that prop. It explodes at
  // a walking pace, is never in your way, and is pure confetti.
  paperStack: {
    label: 'Paper Stack',
    builder: null,
    shape: 'box',
    half: [0.16, 0.055, 0.12],
    mass: 1.2,
    friction: 0.7,
    restitution: 0,
    linearDamping: 0.6,
    angularDamping: 0.8,
    smashImpulse: 35,
    nudgeImpulse: 12,
    maxKnockSpeed: 5,
    scoreValue: 50,
    debris: 'paper',
    debrisCount: 16,
    behaviour: 'burst',
    leverage: 0.6,
    wreckSquash: 0,
    fallbackColor: 0xd8d3c4,
  },
  cardboardBox: {
    label: 'Cardboard Box',
    builder: 'makeCardboardBox',
    shape: 'box',
    half: [0.25, 0.19, 0.22],
    mass: 4,
    friction: 0.5,
    restitution: 0.1,
    linearDamping: 0.2,
    angularDamping: 0.3,
    smashImpulse: 140,
    nudgeImpulse: 30,
    maxKnockSpeed: 7,
    scoreValue: 100,
    debris: 'cardboard',
    debrisCount: 8,
    behaviour: 'burst',
    leverage: 0.7,
    wreckSquash: 0.35,
    fallbackColor: 0xb08c56,
  },
  // Another office chair, on casters. Low friction: it rolls away like a shopping trolley.
  chairEmpty: {
    label: 'Office Chair',
    builder: null, // built from ChairModel.buildOfficeChair
    shape: 'box',
    half: [0.3, 0.48, 0.3],
    mass: 12,
    friction: 0.18,
    restitution: 0.2,
    linearDamping: 0.06,
    angularDamping: 0.2,
    smashImpulse: 220,
    nudgeImpulse: 45,
    maxKnockSpeed: 8,
    scoreValue: 150,
    debris: 'plastic',
    debrisCount: 6,
    behaviour: 'topple',
    leverage: 0.8,
    wreckSquash: 1,
    fallbackColor: 0x2e3236,
  },
  monitor: {
    label: 'Monitor',
    builder: 'makeMonitor',
    shape: 'box',
    half: [0.26, 0.28, 0.12],
    mass: 6,
    friction: 0.45,
    restitution: 0.05,
    linearDamping: 0.2,
    angularDamping: 0.35,
    smashImpulse: 260,
    nudgeImpulse: 55,
    maxKnockSpeed: 6.5,
    scoreValue: 250,
    debris: 'glass',
    debrisCount: 10,
    behaviour: 'burst',
    leverage: 0.85,
    wreckSquash: 0.4,
    fallbackColor: 0x1c1f22,
  },
  pottedPlant: {
    label: 'Potted Plant',
    builder: 'makePottedPlant',
    shape: 'cylinder',
    half: [0.12, 0.155, 0.12],
    mass: 5,
    friction: 0.55,
    restitution: 0.1,
    linearDamping: 0.2,
    angularDamping: 0.3,
    smashImpulse: 190,
    nudgeImpulse: 40,
    maxKnockSpeed: 5.5,
    scoreValue: 150,
    debris: 'soil',
    debrisCount: 9,
    behaviour: 'burst',
    leverage: 0.6,
    wreckSquash: 0.5,
    fallbackColor: 0xb2643c,
  },
  // Hollow plastic. Almost no mass, high restitution: they punt across the room.
  coneStack: {
    label: 'Cone Stack',
    builder: null,
    shape: 'cylinder',
    half: [0.19, 0.18, 0.19],
    mass: 1.6,
    friction: 0.35,
    restitution: 0.45,
    linearDamping: 0.28,
    angularDamping: 0.1,
    smashImpulse: 90,
    nudgeImpulse: 18,
    maxKnockSpeed: 8,
    scoreValue: 50,
    debris: 'plastic',
    debrisCount: 5,
    behaviour: 'topple',
    leverage: 0.9,
    wreckSquash: 1,
    fallbackColor: 0xe2622a,
  },
  // 65 kg with a 0.6 m/s knock cap: this is the wall you learn not to hit. It never breaks
  // at any speed the player can reach (1100 kg m/s is 22 m/s and the cap is 18).
  filingCabinet: {
    label: 'Filing Cabinet',
    builder: 'makeFilingCabinet',
    shape: 'box',
    half: [0.23, 0.55, 0.31],
    mass: 65,
    friction: 0.75,
    restitution: 0,
    linearDamping: 0.35,
    angularDamping: 1.2,
    smashImpulse: 1100,
    nudgeImpulse: 220,
    maxKnockSpeed: 1.2,
    scoreValue: 500,
    debris: 'metal',
    debrisCount: 8,
    behaviour: 'topple',
    leverage: 0.35,
    wreckSquash: 1,
    fallbackColor: 0xc9c2b0,
  },
  mug: {
    label: 'Coffee Mug',
    builder: 'makeMug',
    shape: 'cylinder',
    half: [0.05, 0.048, 0.05],
    mass: 0.35,
    friction: 0.4,
    restitution: 0.2,
    linearDamping: 0.1,
    angularDamping: 0.15,
    smashImpulse: 40,
    nudgeImpulse: 10,
    maxKnockSpeed: 8,
    scoreValue: 25,
    debris: 'glass',
    debrisCount: 6,
    behaviour: 'burst',
    leverage: 0.5,
    wreckSquash: 0,
    fallbackColor: 0xf0ece4,
  },
};

/** Read-only view of a kind's tuned defaults. Handy for level authoring tools. */
export function destructibleDefaults(kind: DestructibleKind): {
  label: string;
  mass: number;
  smashImpulse: number;
  scoreValue: number;
  debrisKind: DebrisKind;
  size: [number, number, number];
} {
  const p = PROFILES[kind];
  return {
    label: p.label,
    mass: p.mass,
    smashImpulse: p.smashImpulse,
    scoreValue: p.scoreValue,
    debrisKind: p.debris,
    size: [p.half[0] * 2, p.half[1] * 2, p.half[2] * 2],
  };
}

export const DESTRUCTIBLE_KINDS: readonly DestructibleKind[] = [
  'trashCan', 'waterCooler', 'printer', 'paperStack', 'cardboardBox',
  'chairEmpty', 'monitor', 'pottedPlant', 'coneStack', 'filingCabinet', 'mug',
];

// ---------------------------------------------------------------------------
// Defensive access to the art modules
// ---------------------------------------------------------------------------

type AnyRecord = Record<string, unknown>;

function callBuilder(name: string, opts: AnyRecord): THREE.Object3D | null {
  const fn = (OfficeProps as unknown as AnyRecord)[name];
  if (typeof fn !== 'function') return null;
  try {
    const out = (fn as (o: AnyRecord) => unknown)(opts);
    return out instanceof THREE.Object3D ? out : null;
  } catch (err) {
    console.warn(`[Destructibles] OfficeProps.${name} threw, using fallback geometry`, err);
    return null;
  }
}

function buildEmptyChair(seed: number): THREE.Object3D | null {
  const fn = (ChairModelNS as unknown as AnyRecord)['buildOfficeChair'];
  if (typeof fn !== 'function') return null;
  try {
    const parts = (fn as (o: AnyRecord) => unknown)({ tier: seed % 2 === 0 ? 0 : 1, seed }) as
      | { root?: unknown }
      | undefined;
    const root = parts && (parts as { root?: unknown }).root;
    return root instanceof THREE.Object3D ? root : null;
  } catch (err) {
    console.warn('[Destructibles] ChairModel.buildOfficeChair threw, using fallback geometry', err);
    return null;
  }
}

/**
 * Clone a MaterialLibrary material so we can safely change `side` / `flatShading` without
 * corrupting the shared cache. Falls back to a plain standard material.
 */
function ownedMaterial(id: string, color: number, roughness: number, metalness: number): THREE.MeshStandardMaterial {
  const lib = (MaterialLibraryNS as unknown as AnyRecord)['MaterialLibrary'] as
    | { get?: (id: string, opts?: AnyRecord) => unknown }
    | undefined;
  if (lib && typeof lib.get === 'function') {
    try {
      const m = lib.get(id, { color, roughness, metalness });
      if (m instanceof THREE.MeshStandardMaterial) return m.clone();
    } catch {
      /* fall through */
    }
  }
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

// ---------------------------------------------------------------------------
// Debris — pooled, instanced, CPU-integrated shards. No rigid bodies involved.
//
// One InstancedMesh per debris kind => six draw calls for the entire wreckage system,
// regardless of how much of the office you have destroyed.
// ---------------------------------------------------------------------------

interface DebrisProfile {
  capacity: number;
  gravity: number;
  drag: number;
  bounce: number;
  spin: number;
  life: number;
  /** Sideways spread of the burst, m/s. */
  spread: number;
  /** Upward kick, m/s. */
  lift: number;
  /** Extra sinusoidal side-slip, m/s. Paper only. */
  flutter: number;
  doubleSided: boolean;
  color: number;
  materialId: string;
  roughness: number;
  metalness: number;
  geometry: () => THREE.BufferGeometry;
}

const DEBRIS_PROFILES: Record<DebrisKind, DebrisProfile> = {
  paper: {
    capacity: 72,
    gravity: 2.6,
    drag: 1.5,
    bounce: 0.05,
    spin: 5,
    life: 4.5,
    spread: 2.6,
    lift: 3.4,
    flutter: 1.5,
    doubleSided: true,
    color: 0xe6e1d2,
    materialId: 'paper',
    roughness: 0.95,
    metalness: 0,
    geometry: () => new THREE.PlaneGeometry(0.21, 0.297),
  },
  plastic: {
    capacity: 40,
    gravity: 24,
    drag: 0.25,
    bounce: 0.4,
    spin: 11,
    life: 2.6,
    spread: 3.4,
    lift: 3,
    flutter: 0,
    doubleSided: false,
    color: 0xd8672c,
    materialId: 'darkPlastic',
    roughness: 0.55,
    metalness: 0,
    geometry: () => new THREE.BoxGeometry(0.08, 0.05, 0.06),
  },
  metal: {
    capacity: 32,
    gravity: 26,
    drag: 0.12,
    bounce: 0.28,
    spin: 8,
    life: 2.4,
    spread: 2.6,
    lift: 2.4,
    flutter: 0,
    doubleSided: false,
    color: 0xa8adb2,
    materialId: 'brushedMetal',
    roughness: 0.4,
    metalness: 0.8,
    geometry: () => new THREE.BoxGeometry(0.11, 0.02, 0.06),
  },
  soil: {
    capacity: 40,
    gravity: 26,
    drag: 0.3,
    bounce: 0.12,
    spin: 6,
    life: 2.2,
    spread: 2.8,
    lift: 2.8,
    flutter: 0,
    doubleSided: false,
    color: 0x5b4530,
    materialId: 'terracotta',
    roughness: 0.98,
    metalness: 0,
    geometry: () => new THREE.IcosahedronGeometry(0.045, 0),
  },
  glass: {
    capacity: 48,
    gravity: 25,
    drag: 0.1,
    bounce: 0.32,
    spin: 14,
    life: 2.2,
    spread: 4,
    lift: 3.2,
    flutter: 0,
    doubleSided: false,
    color: 0xd6e6ec,
    materialId: 'whiteboard',
    roughness: 0.12,
    metalness: 0.05,
    geometry: () => new THREE.TetrahedronGeometry(0.055, 0),
  },
  cardboard: {
    capacity: 36,
    gravity: 18,
    drag: 0.6,
    bounce: 0.1,
    spin: 7,
    life: 3,
    spread: 2.6,
    lift: 2.8,
    flutter: 0.5,
    doubleSided: true,
    color: 0xb08c56,
    materialId: 'cardboard',
    roughness: 0.9,
    metalness: 0,
    geometry: () => new THREE.BoxGeometry(0.15, 0.012, 0.12),
  },
};

interface Shard {
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
  rx: number; ry: number; rz: number;
  sx: number; sy: number; sz: number;
  life: number;
  maxLife: number;
  scale: number;
  floorY: number;
  phase: number;
  resting: boolean;
}

function makeShard(): Shard {
  return {
    px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0,
    sx: 0, sy: 0, sz: 0, life: 0, maxLife: 1, scale: 1, floorY: 0, phase: 0, resting: false,
  };
}

class DebrisField {
  private readonly meshes = new Map<DebrisKind, THREE.InstancedMesh>();
  private readonly pools = new Map<DebrisKind, Shard[]>();
  private readonly live = new Map<DebrisKind, number>();
  private readonly geoms: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];

  private readonly mtx = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly eul = new THREE.Euler();
  private readonly pos = new THREE.Vector3();
  private readonly scl = new THREE.Vector3();

  constructor(private readonly parent: THREE.Object3D) {}

  private ensure(kind: DebrisKind): THREE.InstancedMesh {
    const existing = this.meshes.get(kind);
    if (existing) return existing;

    const p = DEBRIS_PROFILES[kind];
    const geo = p.geometry();
    const mat = ownedMaterial(p.materialId, p.color, p.roughness, p.metalness);
    if (p.doubleSided) mat.side = THREE.DoubleSide;
    this.geoms.push(geo);
    this.mats.push(mat);

    const im = new THREE.InstancedMesh(geo, mat, p.capacity);
    im.name = `debris_${kind}`;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false; // shards fly well outside the source bounding sphere
    im.castShadow = false;
    im.receiveShadow = false;
    im.count = 0;
    this.parent.add(im);

    const pool: Shard[] = new Array(p.capacity);
    for (let i = 0; i < p.capacity; i++) pool[i] = makeShard();

    this.meshes.set(kind, im);
    this.pools.set(kind, pool);
    this.live.set(kind, 0);
    return im;
  }

  /**
   * Throw `count` shards out of `origin`, biased along `dirX/dirZ`.
   * `floorY` is where they stop falling (the floor the prop was standing on).
   */
  burst(
    kind: DebrisKind,
    origin: THREE.Vector3,
    count: number,
    dirX: number,
    dirZ: number,
    energy: number,
    floorY: number,
  ): void {
    this.ensure(kind);
    const p = DEBRIS_PROFILES[kind];
    const pool = this.pools.get(kind)!;
    let live = this.live.get(kind)!;

    for (let i = 0; i < count; i++) {
      // Over budget: recycle the oldest shard rather than dropping the burst. A smash you
      // can see is worth more than a stale shard you have stopped looking at.
      let idx: number;
      if (live < p.capacity) {
        idx = live++;
      } else {
        idx = 0;
        let oldest = Infinity;
        for (let j = 0; j < p.capacity; j++) {
          if (pool[j].life < oldest) { oldest = pool[j].life; idx = j; }
        }
      }

      const s = pool[idx];
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.18;
      s.px = origin.x + Math.cos(a) * r;
      s.py = origin.y + Math.random() * 0.2;
      s.pz = origin.z + Math.sin(a) * r;

      const sideX = -dirZ;
      const sideZ = dirX;
      const lateral = (Math.random() - 0.5) * p.spread;
      const along = (0.45 + Math.random() * 0.9) * p.spread * energy;
      s.vx = dirX * along + sideX * lateral;
      s.vz = dirZ * along + sideZ * lateral;
      s.vy = p.lift * (0.5 + Math.random()) * energy;

      s.rx = Math.random() * Math.PI * 2;
      s.ry = Math.random() * Math.PI * 2;
      s.rz = Math.random() * Math.PI * 2;
      s.sx = (Math.random() - 0.5) * p.spin;
      s.sy = (Math.random() - 0.5) * p.spin;
      s.sz = (Math.random() - 0.5) * p.spin;

      s.maxLife = p.life * (0.75 + Math.random() * 0.5);
      s.life = s.maxLife;
      s.scale = 0.75 + Math.random() * 0.5;
      s.floorY = floorY;
      s.phase = Math.random() * Math.PI * 2;
      s.resting = false;
    }
    this.live.set(kind, live);
  }

  update(dt: number, time: number): void {
    for (const [kind, im] of this.meshes) {
      const p = DEBRIS_PROFILES[kind];
      const pool = this.pools.get(kind)!;
      let live = this.live.get(kind)!;
      if (live === 0) {
        if (im.count !== 0) { im.count = 0; }
        continue;
      }

      for (let i = 0; i < live; i++) {
        const s = pool[i];
        s.life -= dt;
        if (s.life <= 0) {
          // swap-remove; re-test this slot next iteration
          pool[i] = pool[live - 1];
          pool[live - 1] = s;
          live--;
          i--;
          continue;
        }

        if (!s.resting) {
          s.vy -= p.gravity * dt;
          const damp = Math.max(0, 1 - p.drag * dt);
          s.vx *= damp;
          s.vz *= damp;
          if (p.flutter > 0) {
            // Sheets do not fall, they slip sideways. This is the whole read of "paper".
            const f = Math.sin(time * 6.5 + s.phase) * p.flutter * dt;
            s.vx += f;
            s.vz += Math.cos(time * 5.1 + s.phase) * p.flutter * dt;
            s.vy *= damp;
          }

          s.px += s.vx * dt;
          s.py += s.vy * dt;
          s.pz += s.vz * dt;

          const rest = s.floorY + 0.012;
          if (s.py <= rest) {
            s.py = rest;
            if (Math.abs(s.vy) < 1.2) {
              // Settled: freeze it flat and stop integrating. Free from here on.
              s.vx = 0; s.vy = 0; s.vz = 0;
              s.sx = 0; s.sy = 0; s.sz = 0;
              s.resting = true;
              if (p.doubleSided) { s.rx = -Math.PI / 2; s.rz = Math.random() * Math.PI * 2; }
            } else {
              s.vy = -s.vy * p.bounce;
              s.vx *= 0.65;
              s.vz *= 0.65;
              s.sx *= 0.5; s.sy *= 0.5; s.sz *= 0.5;
            }
          }

          s.rx += s.sx * dt;
          s.ry += s.sy * dt;
          s.rz += s.sz * dt;
        }

        // Shrink out over the last 0.45 s instead of fading: the material is shared by every
        // instance, so per-shard opacity is not available without a per-instance attribute.
        const fade = s.life < 0.45 ? s.life / 0.45 : 1;
        const k = s.scale * fade;

        this.pos.set(s.px, s.py, s.pz);
        this.eul.set(s.rx, s.ry, s.rz, 'XYZ');
        this.quat.setFromEuler(this.eul);
        this.scl.set(k, k, k);
        this.mtx.compose(this.pos, this.quat, this.scl);
        im.setMatrixAt(i, this.mtx);
      }

      this.live.set(kind, live);
      im.count = live;
      im.instanceMatrix.needsUpdate = true;
    }
  }

  get shardCount(): number {
    let n = 0;
    for (const v of this.live.values()) n += v;
    return n;
  }

  clear(): void {
    for (const [kind, im] of this.meshes) {
      this.live.set(kind, 0);
      im.count = 0;
    }
  }

  dispose(): void {
    for (const im of this.meshes.values()) {
      im.removeFromParent();
      im.dispose();
    }
    this.meshes.clear();
    this.pools.clear();
    this.live.clear();
    for (const g of this.geoms) g.dispose();
    for (const m of this.mats) m.dispose();
    this.geoms.length = 0;
    this.mats.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Instance record
// ---------------------------------------------------------------------------

interface Instance {
  id: string;
  kind: DestructibleKind;
  profile: KindProfile;
  /** Synced to the rigid body. Its child holds the art, offset down by the collider half-height. */
  root: THREE.Group;
  visual: THREE.Object3D;
  body: RAPIER.RigidBody | null;
  colliders: RAPIER.Collider[];
  mass: number;
  smashImpulse: number;
  nudgeImpulse: number;
  scoreValue: number;
  /** World-space centre of the collider at spawn (i.e. def.position + half height). */
  homePos: THREE.Vector3;
  homeQuat: THREE.Quaternion;
  /** Distance from the collider centre to the outer corner. Used for the broad impact test. */
  reachXZ: number;
  reachY: number;
  dynamic: boolean;
  smashed: boolean;
  /** Broken apart: colliders are off and it must never be promoted to a dynamic body again. */
  inert: boolean;
  /** True once anything has moved it, which is when we start syncing the mesh. */
  disturbed: boolean;
  wasAwake: boolean;
  lastHit: number;
  cellKey: number;
  /** Physics-less fallback topple animation, only used when no Rapier world was resolvable. */
  fallT: number;
  fallDur: number;
  fallAxisX: number;
  fallAxisZ: number;
}

// ---------------------------------------------------------------------------
// Rapier world resolution
// ---------------------------------------------------------------------------

interface RapierWorldLike {
  createRigidBody(desc: RAPIER.RigidBodyDesc): RAPIER.RigidBody;
  createCollider(desc: RAPIER.ColliderDesc, parent: RAPIER.RigidBody): RAPIER.Collider;
  removeRigidBody(body: RAPIER.RigidBody): void;
}

function isWorldLike(v: unknown): v is RapierWorldLike {
  const o = v as Partial<RapierWorldLike> | null;
  return !!o && typeof o.createRigidBody === 'function' && typeof o.createCollider === 'function';
}

/**
 * PhysicsWorld keeps its RAPIER.World in a `private` field with no accessor, and we are not
 * allowed to edit that file. `private` is a compile-time fiction, so we probe for it — by
 * accessor first, then by the known field names, then by a shallow scan.
 */
function resolveRapierWorld(physicsWorld: unknown): RapierWorldLike | null {
  if (!physicsWorld || typeof physicsWorld !== 'object') return null;
  if (isWorldLike(physicsWorld)) return physicsWorld;

  const host = physicsWorld as AnyRecord;
  const getter = host['getWorld'];
  if (typeof getter === 'function') {
    try {
      const w = (getter as () => unknown).call(physicsWorld);
      if (isWorldLike(w)) return w;
    } catch {
      /* keep probing */
    }
  }
  for (const key of ['world', 'rapierWorld', '_world', 'physicsWorld']) {
    if (isWorldLike(host[key])) return host[key] as RapierWorldLike;
  }
  for (const key of Object.keys(host)) {
    if (isWorldLike(host[key])) return host[key] as RapierWorldLike;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Spatial hash — keeps the per-frame proximity query off the full instance list
// ---------------------------------------------------------------------------

const CELL_SIZE = 8;

function cellKey(x: number, z: number): number {
  const ix = Math.floor(x / CELL_SIZE);
  const iz = Math.floor(z / CELL_SIZE);
  return (ix * 73856093) ^ (iz * 19349663);
}

// ---------------------------------------------------------------------------
// DestructibleManager
// ---------------------------------------------------------------------------

export class DestructibleManager {
  private readonly group = new THREE.Group();
  private readonly world: RapierWorldLike | null;
  private readonly tuning: DestructibleTuning = { ...DEFAULT_TUNING };

  private readonly instances: Instance[] = [];
  private readonly byId = new Map<string, Instance>();
  private readonly grid = new Map<number, Instance[]>();
  /** Instances currently in the DYNAMIC tier (awake or asleep). Small, iterated every frame. */
  private readonly dynamics: Instance[] = [];

  private readonly listeners = new Set<(e: SmashEvent) => void>();
  private readonly debrisField: DebrisField;
  // Geometry and materials for the props we build ourselves are cached BY KEY, not per
  // instance. Two hundred paper stacks must share three geometries and one material, or
  // they are two hundred draw calls and the whole point of the module is lost.
  private readonly geoCache = new Map<string, THREE.BufferGeometry>();
  private readonly matCache = new Map<string, THREE.MeshStandardMaterial>();

  private time = 0;
  private nextId = 1;
  private awake = 0;
  private smashedCountInternal = 0;
  /** Momentum absorbed by props this frame; the integrator can bleed it off the player. */
  private pendingDrag = 0;
  private warnedNoWorld = false;

  // scratch — nothing in the hot loop allocates
  private readonly vA = new THREE.Vector3();
  private readonly qA = new THREE.Quaternion();
  private readonly chainScratch: Instance[] = [];
  private readonly sortScratch: Instance[] = [];

  constructor(scene: THREE.Scene, physicsWorld: unknown) {
    this.group.name = 'destructibles';
    scene.add(this.group);
    this.world = resolveRapierWorld(physicsWorld);
    if (!this.world) {
      console.warn(
        '[Destructibles] Could not resolve the Rapier world from the supplied PhysicsWorld. ' +
          'Props will still spawn, be hittable and smash, but they will not simulate rigid-body physics.',
      );
    }
    this.debrisField = new DebrisField(this.group);
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /** Override any tuning value. Safe to call at any time. */
  configure(t: Partial<DestructibleTuning>): void {
    Object.assign(this.tuning, t);
  }

  /** Convenience: keep impact maths honest if the chair's mass ever changes. */
  setPlayerMass(kg: number): void {
    this.tuning.playerMass = Math.max(1, kg);
  }

  get tuningSnapshot(): Readonly<DestructibleTuning> {
    return this.tuning;
  }

  // -------------------------------------------------------------------------
  // Spawning
  // -------------------------------------------------------------------------

  spawn(def: DestructibleDef): string {
    const profile = PROFILES[def.kind];
    if (!profile) {
      console.warn(`[Destructibles] unknown kind "${def.kind}"`);
      return '';
    }

    const id = def.id ?? `${def.kind}_${this.nextId++}`;
    if (this.byId.has(id)) {
      console.warn(`[Destructibles] duplicate id "${id}" — ignoring the second spawn`);
      return id;
    }

    const seed = def.seed ?? hashString(id);
    const rotY = def.rotationY ?? 0;
    const halfY = profile.half[1];

    // Rapier bodies are centred on their collider; OfficeProps roots sit on the floor.
    const centre = new THREE.Vector3(def.position.x, def.position.y + halfY, def.position.z);

    const root = new THREE.Group();
    root.name = id;
    root.position.copy(centre);
    root.quaternion.setFromAxisAngle(UP, rotY);

    const visual = this.buildVisual(def.kind, profile, seed, def.variant ?? 0);
    visual.position.y = -halfY; // put the prop's floor-origin back on the floor
    root.add(visual);
    this.group.add(root);

    const inst: Instance = {
      id,
      kind: def.kind,
      profile,
      root,
      visual,
      body: null,
      colliders: [],
      mass: def.mass ?? profile.mass,
      smashImpulse: def.smashImpulse ?? profile.smashImpulse,
      nudgeImpulse: Math.min(def.smashImpulse ?? profile.smashImpulse, profile.nudgeImpulse),
      scoreValue: def.scoreValue ?? profile.scoreValue,
      homePos: centre.clone(),
      homeQuat: root.quaternion.clone(),
      // Rotation-safe: use the larger horizontal half-extent for both axes so a yawed prop
      // is never under-tested.
      reachXZ: Math.max(profile.half[0], profile.half[2]),
      reachY: halfY,
      dynamic: false,
      smashed: false,
      inert: false,
      disturbed: false,
      wasAwake: false,
      lastHit: -999,
      cellKey: cellKey(centre.x, centre.z),
      fallT: 0,
      fallDur: 0,
      fallAxisX: 0,
      fallAxisZ: 0,
    };

    if (this.world) {
      const bodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(centre.x, centre.y, centre.z)
        .setRotation({ x: root.quaternion.x, y: root.quaternion.y, z: root.quaternion.z, w: root.quaternion.w })
        .setLinearDamping(profile.linearDamping)
        .setAngularDamping(profile.angularDamping)
        .setCanSleep(true)
        .setCcdEnabled(false);

      const body = this.world.createRigidBody(bodyDesc);

      const colliderDesc =
        profile.shape === 'cylinder'
          ? RAPIER.ColliderDesc.cylinder(profile.half[1], profile.half[0])
          : RAPIER.ColliderDesc.cuboid(profile.half[0], profile.half[1], profile.half[2]);
      colliderDesc
        .setMass(inst.mass)
        .setFriction(profile.friction)
        .setRestitution(profile.restitution);

      inst.colliders.push(this.world.createCollider(colliderDesc, body));
      inst.body = body;
    }

    this.instances.push(inst);
    this.byId.set(id, inst);
    this.addToGrid(inst);
    return id;
  }

  spawnMany(defs: DestructibleDef[]): string[] {
    const out: string[] = new Array(defs.length);
    for (let i = 0; i < defs.length; i++) out[i] = this.spawn(defs[i]);
    return out;
  }

  private buildVisual(
    kind: DestructibleKind,
    profile: KindProfile,
    seed: number,
    variant: number,
  ): THREE.Object3D {
    let obj: THREE.Object3D | null = null;

    if (kind === 'chairEmpty') {
      obj = buildEmptyChair(seed);
    } else if (kind === 'paperStack') {
      obj = this.buildPaperStack(seed);
    } else if (kind === 'coneStack') {
      obj = this.buildConeStack(seed);
    } else if (profile.builder) {
      // OfficeProps asks for roughly one accent-coloured prop in six so the frame always
      // carries a high-chroma note. Deterministic on the seed, so it never flickers.
      obj = callBuilder(profile.builder, { seed, variant, accent: seed % 6 === 0 });
    }

    if (!obj) obj = this.buildFallback(profile);
    obj.name = `${kind}_art`;
    return obj;
  }

  /** A ream of copier paper. There is no OfficeProps builder for this, so we own it. */
  private buildPaperStack(seed: number): THREE.Object3D {
    const g = new THREE.Group();
    const rand = mulberry(seed);
    const mat = this.mat('paper', 'paper', 0xdedaca, 0.95, 0);
    const geo = this.geo('paperSheet', () => new THREE.BoxGeometry(0.3, 0.035, 0.22));
    const sheets = 3;
    for (let i = 0; i < sheets; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set((rand() - 0.5) * 0.03, 0.018 + i * 0.035, (rand() - 0.5) * 0.03);
      m.rotation.y = (rand() - 0.5) * 0.35;
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    return g;
  }

  /** Traffic cones, stacked. Screams "skate spot" and punts beautifully. */
  private buildConeStack(seed: number): THREE.Object3D {
    const g = new THREE.Group();
    const rand = mulberry(seed);
    const body = this.mat('coneBody', 'accentOrange', 0xe2622a, 0.65, 0);
    const stripe = this.mat('coneStripe', 'whiteboard', 0xf2f2ee, 0.5, 0);
    const coneGeo = this.geo('cone', () => new THREE.ConeGeometry(0.115, 0.33, 8, 1, true));
    const bandGeo = this.geo('coneBand', () => new THREE.CylinderGeometry(0.078, 0.088, 0.045, 8, 1, true));
    const baseGeo = this.geo('coneBase', () => new THREE.BoxGeometry(0.2, 0.018, 0.2));
    const n = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) {
      const y = i * 0.09;
      const cone = new THREE.Mesh(coneGeo, body);
      cone.position.set((rand() - 0.5) * 0.02, y + 0.165, (rand() - 0.5) * 0.02);
      cone.rotation.y = rand() * Math.PI;
      cone.castShadow = true;
      g.add(cone);

      const band = new THREE.Mesh(bandGeo, stripe);
      band.position.set(cone.position.x, y + 0.2, cone.position.z);
      g.add(band);

      const base = new THREE.Mesh(baseGeo, body);
      base.position.set(cone.position.x, y + 0.009, cone.position.z);
      base.rotation.y = cone.rotation.y;
      base.castShadow = true;
      base.receiveShadow = true;
      g.add(base);
    }
    return g;
  }

  /** Last resort when an OfficeProps builder is missing: a correctly-sized solid. */
  private buildFallback(profile: KindProfile): THREE.Object3D {
    const [hx, hy, hz] = profile.half;
    const key = `fb_${profile.shape}_${hx}_${hy}_${hz}`;
    const geo = this.geo(key, () =>
      profile.shape === 'cylinder'
        ? new THREE.CylinderGeometry(hx, hx * 0.85, hy * 2, 10)
        : new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2),
    );
    const mat = this.mat(`fb_${profile.fallbackColor}`, 'darkPlastic', profile.fallbackColor, 0.7, 0.05);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = hy;
    m.castShadow = true;
    m.receiveShadow = true;
    const g = new THREE.Group();
    g.add(m);
    return g;
  }

  private geo(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.geoCache.get(key);
    if (!g) {
      g = build();
      this.geoCache.set(key, g);
    }
    return g;
  }

  private mat(
    key: string,
    libId: string,
    color: number,
    roughness: number,
    metalness: number,
  ): THREE.MeshStandardMaterial {
    let m = this.matCache.get(key);
    if (!m) {
      m = ownedMaterial(libId, color, roughness, metalness);
      this.matCache.set(key, m);
    }
    return m;
  }

  // -------------------------------------------------------------------------
  // Grid
  // -------------------------------------------------------------------------

  private addToGrid(inst: Instance): void {
    let bucket = this.grid.get(inst.cellKey);
    if (!bucket) {
      bucket = [];
      this.grid.set(inst.cellKey, bucket);
    }
    bucket.push(inst);
  }

  private removeFromGrid(inst: Instance): void {
    const bucket = this.grid.get(inst.cellKey);
    if (!bucket) return;
    const i = bucket.indexOf(inst);
    if (i >= 0) {
      bucket[i] = bucket[bucket.length - 1];
      bucket.pop();
    }
  }

  private recell(inst: Instance, x: number, z: number): void {
    const key = cellKey(x, z);
    if (key === inst.cellKey) return;
    this.removeFromGrid(inst);
    inst.cellKey = key;
    this.addToGrid(inst);
  }

  // -------------------------------------------------------------------------
  // Per-frame update
  // -------------------------------------------------------------------------

  update(dt: number, playerPos: THREE.Vector3, playerVel: THREE.Vector3): void {
    // A hitched frame must not teleport the impact test across half the office.
    const step = Math.min(Math.max(dt, 0), 1 / 20);
    this.time += step;
    this.pendingDrag = 0;

    this.promoteNearby(playerPos);
    this.stepDynamics(step, playerPos, playerVel);
    this.enforceBudget(playerPos);
    this.debrisField.update(step, this.time);
  }

  /** Tier 1 -> tier 2: anything inside promoteRadius becomes a (sleeping) dynamic body. */
  private promoteNearby(playerPos: THREE.Vector3): void {
    const r = this.tuning.promoteRadius;
    const r2 = r * r;
    const minIx = Math.floor((playerPos.x - r) / CELL_SIZE);
    const maxIx = Math.floor((playerPos.x + r) / CELL_SIZE);
    const minIz = Math.floor((playerPos.z - r) / CELL_SIZE);
    const maxIz = Math.floor((playerPos.z + r) / CELL_SIZE);

    for (let ix = minIx; ix <= maxIx; ix++) {
      for (let iz = minIz; iz <= maxIz; iz++) {
        const bucket = this.grid.get((ix * 73856093) ^ (iz * 19349663));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const inst = bucket[i];
          if (inst.dynamic || inst.inert) continue;
          const dx = inst.root.position.x - playerPos.x;
          const dz = inst.root.position.z - playerPos.z;
          if (dx * dx + dz * dz > r2) continue;
          this.setDynamic(inst, false);
        }
      }
    }
  }

  /** Tier 2/3: impact tests, mesh sync, and demotion of anything that has drifted away. */
  private stepDynamics(dt: number, playerPos: THREE.Vector3, playerVel: THREE.Vector3): void {
    const demote2 = this.tuning.demoteRadius * this.tuning.demoteRadius;
    const impactRange = this.tuning.playerRadius + 1.6;
    const impactRange2 = impactRange * impactRange;
    let awake = 0;

    for (let i = this.dynamics.length - 1; i >= 0; i--) {
      const inst = this.dynamics[i];
      const body = inst.body;

      if (!body) {
        // No Rapier world: scripted fallback so the game still reads correctly.
        this.stepScriptedFall(inst, dt);
        const dxs = inst.root.position.x - playerPos.x;
        const dzs = inst.root.position.z - playerPos.z;
        const ds2 = dxs * dxs + dzs * dzs;
        if (!inst.inert && ds2 < impactRange2) this.testPlayerImpact(inst, dt, playerPos, playerVel);
        else if (ds2 > demote2 && inst.fallDur <= 0) this.setStatic(inst);
        continue;
      }

      const sleeping = body.isSleeping();
      if (!sleeping) awake++;

      const t = body.translation();
      const dx = t.x - playerPos.x;
      const dz = t.z - playerPos.z;
      const d2 = dx * dx + dz * dz;

      // Anything that moved without us pushing it (a domino from a neighbour, or a prop
      // resting on another prop that just left) starts syncing its mesh from here on.
      if (!inst.disturbed && !sleeping) {
        const mx = t.x - inst.homePos.x;
        const my = t.y - inst.homePos.y;
        const mz = t.z - inst.homePos.z;
        if (mx * mx + my * my + mz * mz > 0.0004) inst.disturbed = true;
      }

      // Sync only when it matters: undisturbed props keep their exact authored transform,
      // which also hides the sub-millimetre settle Rapier applies on the first awake step.
      if (inst.disturbed && (!sleeping || inst.wasAwake)) {
        const r = body.rotation();
        inst.root.position.set(t.x, t.y, t.z);
        inst.root.quaternion.set(r.x, r.y, r.z, r.w);
        this.recell(inst, t.x, t.z);
      }
      inst.wasAwake = !sleeping;

      // A toppled prop is still a solid object lying on the floor, so it stays kickable —
      // exactly like a bin you have already knocked over in THPS. Only broken-apart props
      // (inert, colliders off) drop out of impact testing.
      if (!inst.inert && d2 < impactRange2) {
        this.testPlayerImpact(inst, dt, playerPos, playerVel);
      }

      // Drop back to a fixed proxy. The `lastHit` clause is load-bearing: a prop wedged
      // against another prop can jitter forever and never satisfy Rapier's sleep threshold,
      // and without it those bodies would stay dynamic and awake for the rest of the run
      // no matter how far away the player skated.
      if (d2 > demote2 && (sleeping || !inst.disturbed || this.time - inst.lastHit > 2)) {
        this.setStatic(inst);
      }
    }

    this.awake = awake;
  }

  /**
   * Analytic player-vs-prop impact. Rapier contact events are unavailable (the shared
   * `PhysicsWorld.step()` runs without an EventQueue and we may not edit it), so the
   * player's swept capsule centre is tested against the prop's expanded bounds at three
   * points along this frame's motion. At 18 m/s that is a 0.1 m sample spacing, which is
   * finer than the smallest prop.
   */
  private testPlayerImpact(inst: Instance, dt: number, playerPos: THREE.Vector3, playerVel: THREE.Vector3): void {
    if (this.time - inst.lastHit < this.tuning.hitCooldown) return;

    const c = inst.root.position;
    const expandXZ = inst.reachXZ + this.tuning.playerRadius;
    const expandY = inst.reachY + this.tuning.playerHalfHeight;

    let hit = false;
    for (let s = 0; s <= 2; s++) {
      const f = (s * 0.5) * dt;
      const px = playerPos.x + playerVel.x * f;
      const py = playerPos.y + playerVel.y * f;
      const pz = playerPos.z + playerVel.z * f;
      if (
        Math.abs(px - c.x) <= expandXZ &&
        Math.abs(pz - c.z) <= expandXZ &&
        Math.abs(py - c.y) <= expandY
      ) {
        hit = true;
        break;
      }
    }
    if (!hit) return;

    // Direction of the shove: away from the player, horizontally.
    let dx = c.x - playerPos.x;
    let dz = c.z - playerPos.z;
    let len = Math.hypot(dx, dz);
    const speed = Math.hypot(playerVel.x, playerVel.z);
    if (len < 1e-4) {
      // Dead centre — shove it the way we are travelling.
      if (speed < 1e-4) return;
      dx = playerVel.x / speed;
      dz = playerVel.z / speed;
    } else {
      dx /= len;
      dz /= len;
    }

    const closing = playerVel.x * dx + playerVel.z * dz;
    if (closing < this.tuning.minClosingSpeed) return;

    const momentum = this.tuning.playerMass * closing;
    if (momentum < inst.nudgeImpulse) return;

    this.applyHit(inst, dx, dz, momentum, 0);
  }

  /**
   * The one place an impulse enters a prop. Player hits and chain-reaction links both
   * land here, so the smash rules and the knock cap can never disagree.
   */
  private applyHit(inst: Instance, dx: number, dz: number, momentum: number, depth: number): void {
    if (inst.inert) return;

    inst.lastHit = this.time;
    inst.disturbed = true;
    if (!inst.dynamic) this.setDynamic(inst, true);

    const p = inst.profile;
    // Two caps, and the tighter one wins: never transfer more than `impulseTransfer` of the
    // player's momentum, and never accelerate the prop past its own maxKnockSpeed. The
    // second cap is what makes a 65 kg filing cabinet shrug off a full-speed hit while a
    // 3 kg bin goes across the room.
    const j = Math.min(momentum * this.tuning.impulseTransfer, inst.mass * p.maxKnockSpeed);
    const body = inst.body;

    if (body) {
      body.wakeUp();
      const c = body.translation();
      // Land the impulse above the centre of mass so the prop rotates as well as slides.
      const py = c.y + inst.reachY * p.leverage;
      body.applyImpulseAtPoint(
        { x: dx * j, y: j * 0.1, z: dz * j },
        { x: c.x, y: py, z: c.z },
        true,
      );
    }

    // Whatever the prop absorbs, the player should feel. Reported via consumeImpactDrag().
    this.pendingDrag += Math.min(j, momentum * this.tuning.impulseTransfer);

    const smashing = momentum >= inst.smashImpulse;
    if (smashing && !inst.smashed) {
      this.breakInstance(inst, dx, dz, momentum);
    }

    if (depth < 2 && (smashing || j > inst.mass * p.maxKnockSpeed * 0.6)) {
      this.propagate(inst, dx, dz, momentum * this.tuning.chainFalloff, depth + 1);
    }
  }

  /**
   * Chain reaction. Rapier will happily resolve prop-vs-prop contacts, but a contact alone
   * cannot decide "this box stack should come apart" without contact events. So a prop that
   * takes a big hit hands a fraction of it to its immediate neighbours.
   */
  private propagate(source: Instance, dx: number, dz: number, momentum: number, depth: number): void {
    const r = this.tuning.chainRadius + source.reachXZ;
    const r2 = r * r;
    const c = source.root.position;
    const near = this.chainScratch;
    near.length = 0;

    const minIx = Math.floor((c.x - r) / CELL_SIZE);
    const maxIx = Math.floor((c.x + r) / CELL_SIZE);
    const minIz = Math.floor((c.z - r) / CELL_SIZE);
    const maxIz = Math.floor((c.z + r) / CELL_SIZE);
    for (let ix = minIx; ix <= maxIx; ix++) {
      for (let iz = minIz; iz <= maxIz; iz++) {
        const bucket = this.grid.get((ix * 73856093) ^ (iz * 19349663));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const other = bucket[i];
          if (other === source) continue;
          if (this.time - other.lastHit < this.tuning.hitCooldown) continue;
          const ox = other.root.position.x - c.x;
          const oz = other.root.position.z - c.z;
          const oy = other.root.position.y - c.y;
          if (ox * ox + oz * oz > r2) continue;
          if (Math.abs(oy) > source.reachY + other.reachY + 0.6) continue;
          if (momentum < other.nudgeImpulse) continue;
          near.push(other);
        }
      }
    }

    for (let i = 0; i < near.length; i++) {
      const other = near[i];
      let ox = other.root.position.x - c.x;
      let oz = other.root.position.z - c.z;
      const l = Math.hypot(ox, oz);
      if (l < 1e-4) { ox = dx; oz = dz; } else { ox /= l; oz /= l; }
      // Blend the incoming direction with the separation direction so a stack sprays
      // outward but still mostly goes the way the player was travelling.
      const bx = ox * 0.6 + dx * 0.4;
      const bz = oz * 0.6 + dz * 0.4;
      const bl = Math.hypot(bx, bz) || 1;
      this.applyHit(other, bx / bl, bz / bl, momentum, depth);
    }
    near.length = 0;
  }

  /** Destroy a prop: topple it or break it apart, spawn debris, notify listeners. */
  private breakInstance(inst: Instance, dx: number, dz: number, momentum: number): void {
    inst.smashed = true;
    this.smashedCountInternal++;
    const p = inst.profile;
    // Snapshot: the burst branch below moves root.position, and the debris origin and the
    // event position must both report where the prop was when it broke.
    const pos = inst.root.position.clone();
    const floorY = inst.homePos.y - inst.reachY;
    const energy = THREE.MathUtils.clamp(momentum / Math.max(inst.smashImpulse, 1), 0.8, 2.2);

    if (p.behaviour === 'topple') {
      // Still a solid object — it just isn't standing up any more. Guarantee it goes over
      // instead of leaving it teetering: a torque impulse about the axis perpendicular to
      // the hit, sized against the prop's own inertia.
      const body = inst.body;
      if (body) {
        const t = inst.mass * inst.reachY * 1.8 * Math.min(energy, 1.6);
        body.applyTorqueImpulse({ x: -dz * t, y: (Math.random() - 0.5) * t * 0.25, z: dx * t }, true);
      } else {
        inst.fallDur = 0.55;
        inst.fallT = 0;
        inst.fallAxisX = -dz;
        inst.fallAxisZ = dx;
      }
    } else {
      // Broken apart. The wreck stops being an obstacle immediately, and it must also stop
      // being a rigid body: a dynamic body whose only collider is disabled has zero mass,
      // which Rapier cannot integrate. So we disable the collider AND pin the body back to
      // fixed, then mark the instance inert so it is never promoted again.
      for (const col of inst.colliders) col.setEnabled(false);
      inst.inert = true;

      const wreckY = floorY + inst.reachY * Math.max(p.wreckSquash, 0.25);
      if (p.wreckSquash <= 0) {
        inst.visual.visible = false;
      } else {
        // The broken variant: squashed, tilted, and dropped onto the floor.
        inst.visual.scale.set(1.06, p.wreckSquash, 1.06);
        inst.visual.rotation.set(
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.9,
          (Math.random() - 0.5) * 0.5,
        );
        inst.visual.position.y = -inst.reachY;
      }
      inst.root.position.set(pos.x, wreckY, pos.z);
      if (inst.body) {
        inst.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
        inst.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
        inst.body.setTranslation({ x: pos.x, y: wreckY, z: pos.z }, false);
      }
      this.setStatic(inst);
    }

    if (this.tuning.debris && p.debrisCount > 0) {
      this.vA.set(pos.x, pos.y + inst.reachY * 0.4, pos.z);
      this.debrisField.burst(p.debris, this.vA, p.debrisCount, dx, dz, energy, floorY);
    }

    if (this.listeners.size > 0) {
      const evt: SmashEvent = {
        id: inst.id,
        kind: inst.kind,
        position: new THREE.Vector3(pos.x, pos.y, pos.z),
        impulse: momentum,
        scoreValue: inst.scoreValue,
        debrisKind: p.debris,
        label: p.label,
        direction: new THREE.Vector3(dx, 0, dz),
        toppled: p.behaviour === 'topple',
      };
      for (const cb of this.listeners) {
        try {
          cb(evt);
        } catch (err) {
          console.error('[Destructibles] onSmash listener threw', err);
        }
      }
    }
  }

  /** Physics-less topple, only reachable when no Rapier world could be resolved. */
  private stepScriptedFall(inst: Instance, dt: number): void {
    if (inst.fallDur <= 0) return;
    inst.fallT = Math.min(inst.fallDur, inst.fallT + dt);
    const k = inst.fallT / inst.fallDur;
    // ease-out so it accelerates over and then stops dead on the floor
    const angle = (Math.PI / 2) * (1 - (1 - k) * (1 - k));
    const ax = inst.fallAxisX;
    const az = inst.fallAxisZ;
    const l = Math.hypot(ax, az) || 1;
    this.vA.set(ax / l, 0, az / l);
    this.qA.setFromAxisAngle(this.vA, angle);
    inst.root.quaternion.copy(inst.homeQuat).premultiply(this.qA);
    inst.root.position.y = inst.homePos.y - inst.reachY * 0.6 * Math.sin(angle);
    if (inst.fallT >= inst.fallDur) inst.fallDur = 0;
  }

  // -------------------------------------------------------------------------
  // Tier transitions + budget
  // -------------------------------------------------------------------------

  private setDynamic(inst: Instance, wake: boolean): void {
    if (inst.inert) return;
    if (inst.dynamic) {
      if (wake && inst.body) inst.body.wakeUp();
      return;
    }
    inst.dynamic = true;
    this.dynamics.push(inst);
    if (inst.body) {
      inst.body.setBodyType(RAPIER.RigidBodyType.Dynamic, wake);
      if (wake) inst.body.wakeUp();
    }
  }

  private setStatic(inst: Instance): void {
    if (!inst.dynamic) return;
    inst.dynamic = false;
    const i = this.dynamics.indexOf(inst);
    if (i >= 0) {
      this.dynamics[i] = this.dynamics[this.dynamics.length - 1];
      this.dynamics.pop();
    }
    const body = inst.body;
    if (body) {
      // Freeze it exactly where it came to rest — a toppled cabinet stays toppled.
      body.setLinvel({ x: 0, y: 0, z: 0 }, false);
      body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      body.setBodyType(RAPIER.RigidBodyType.Fixed, false);
      const t = body.translation();
      const r = body.rotation();
      inst.root.position.set(t.x, t.y, t.z);
      inst.root.quaternion.set(r.x, r.y, r.z, r.w);
      this.recell(inst, t.x, t.z);
    }
    inst.wasAwake = false;
  }

  /**
   * Hard cap on awake dynamic bodies. Sleeping is free in Rapier; simulating is not. When
   * we are over budget the furthest awake bodies are forced to sleep — never one that the
   * player disturbed in the last second, so nothing freezes in front of the camera.
   */
  private enforceBudget(playerPos: THREE.Vector3): void {
    if (this.awake <= this.tuning.awakeBudget) return;

    const list = this.sortScratch;
    list.length = 0;
    for (let i = 0; i < this.dynamics.length; i++) {
      const inst = this.dynamics[i];
      const body = inst.body;
      if (!body || body.isSleeping()) continue;
      if (this.time - inst.lastHit < 1.0) continue;
      list.push(inst);
    }
    if (list.length === 0) return;

    const px = playerPos.x;
    const pz = playerPos.z;
    list.sort((a, b) => {
      const da = (a.root.position.x - px) ** 2 + (a.root.position.z - pz) ** 2;
      const db = (b.root.position.x - px) ** 2 + (b.root.position.z - pz) ** 2;
      return db - da; // furthest first
    });

    let over = this.awake - this.tuning.awakeBudget;
    for (let i = 0; i < list.length && over > 0; i++, over--) {
      const inst = list[i];
      const body = inst.body!;
      const t = body.translation();
      const r = body.rotation();
      inst.root.position.set(t.x, t.y, t.z);
      inst.root.quaternion.set(r.x, r.y, r.z, r.w);
      body.sleep();
      inst.wasAwake = false;
      this.awake--;
    }
    list.length = 0;
  }

  // -------------------------------------------------------------------------
  // Events + queries
  // -------------------------------------------------------------------------

  onSmash(cb: (e: SmashEvent) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /**
   * Smash everything in a radius, e.g. a bail explosion or a cop tackle. `impulse` is the
   * momentum delivered at the centre; it falls off linearly to zero at the rim.
   */
  smashRadius(centre: THREE.Vector3, radius: number, impulse: number): number {
    const r2 = radius * radius;
    let n = 0;
    const minIx = Math.floor((centre.x - radius) / CELL_SIZE);
    const maxIx = Math.floor((centre.x + radius) / CELL_SIZE);
    const minIz = Math.floor((centre.z - radius) / CELL_SIZE);
    const maxIz = Math.floor((centre.z + radius) / CELL_SIZE);
    for (let ix = minIx; ix <= maxIx; ix++) {
      for (let iz = minIz; iz <= maxIz; iz++) {
        const bucket = this.grid.get((ix * 73856093) ^ (iz * 19349663));
        if (!bucket) continue;
        // applyHit can re-cell instances, so iterate a snapshot.
        const snapshot = bucket.slice();
        for (let i = 0; i < snapshot.length; i++) {
          const inst = snapshot[i];
          if (inst.inert) continue;
          let dx = inst.root.position.x - centre.x;
          let dz = inst.root.position.z - centre.z;
          const d2 = dx * dx + dz * dz;
          if (d2 > r2) continue;
          const d = Math.sqrt(d2);
          if (d < 1e-4) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
          const falloff = 1 - d / radius;
          const m = impulse * falloff;
          if (m < inst.nudgeImpulse) continue;
          inst.lastHit = -999; // an explosion ignores the per-prop hit cooldown
          this.applyHit(inst, dx, dz, m, 1);
          n++;
        }
      }
    }
    return n;
  }

  /** Force a specific prop to break, e.g. from a scripted beat. */
  smashById(id: string, impulse = Infinity): boolean {
    const inst = this.byId.get(id);
    if (!inst || inst.inert) return false;
    const m = impulse === Infinity ? inst.smashImpulse * 1.5 : impulse;
    inst.lastHit = -999;
    const a = Math.random() * Math.PI * 2;
    this.applyHit(inst, Math.cos(a), Math.sin(a), m, 1);
    return true;
  }

  /**
   * Momentum (kg m/s) that props absorbed from the player since the last call, and clears it.
   * Feed it into the player's velocity so ploughing through a filing cabinet actually costs
   * you speed. Returns 0 on a clean frame.
   */
  consumeImpactDrag(): number {
    const d = this.pendingDrag;
    this.pendingDrag = 0;
    return d;
  }

  /**
   * Placements shaped for `GoalSystem.SmashTarget`, so a level can author
   * "smash the 5 water coolers" without duplicating the position data.
   */
  smashTargets(kind?: DestructibleKind): { id: string; label: string; position: [number, number, number] }[] {
    const out: { id: string; label: string; position: [number, number, number] }[] = [];
    for (const inst of this.instances) {
      if (kind && inst.kind !== kind) continue;
      out.push({
        id: inst.id,
        label: inst.profile.label,
        position: [inst.homePos.x, inst.homePos.y - inst.reachY, inst.homePos.z],
      });
    }
    return out;
  }

  isSmashed(id: string): boolean {
    return this.byId.get(id)?.smashed ?? false;
  }

  /** Number of dynamic bodies actually being simulated this frame (the thing that costs). */
  get activeBodyCount(): number {
    return this.awake;
  }

  /** Bodies in the dynamic tier, awake or asleep. */
  get dynamicBodyCount(): number {
    return this.dynamics.length;
  }

  get instanceCount(): number {
    return this.instances.length;
  }

  get smashedCount(): number {
    return this.smashedCountInternal;
  }

  get debrisCount(): number {
    return this.debrisField.shardCount;
  }

  /** One-line debug readout for the HUD's perf overlay. */
  get debugLine(): string {
    return `props ${this.instances.length} | dyn ${this.dynamics.length} | awake ${this.awake}/${this.tuning.awakeBudget} | smashed ${this.smashedCountInternal} | shards ${this.debrisField.shardCount}`;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Put every prop back exactly where it started, unbroken. Call on level restart. */
  reset(): void {
    for (const inst of this.instances) {
      const body = inst.body;
      if (body) {
        if (inst.dynamic) body.setBodyType(RAPIER.RigidBodyType.Fixed, false);
        body.setLinvel({ x: 0, y: 0, z: 0 }, false);
        body.setAngvel({ x: 0, y: 0, z: 0 }, false);
        body.setTranslation({ x: inst.homePos.x, y: inst.homePos.y, z: inst.homePos.z }, false);
        body.setRotation(
          { x: inst.homeQuat.x, y: inst.homeQuat.y, z: inst.homeQuat.z, w: inst.homeQuat.w },
          false,
        );
        for (const col of inst.colliders) col.setEnabled(true);
      }
      inst.dynamic = false;
      inst.smashed = false;
      inst.inert = false;
      inst.disturbed = false;
      inst.wasAwake = false;
      inst.lastHit = -999;
      inst.fallDur = 0;
      inst.fallT = 0;
      inst.root.position.copy(inst.homePos);
      inst.root.quaternion.copy(inst.homeQuat);
      inst.visual.visible = true;
      inst.visual.scale.set(1, 1, 1);
      inst.visual.rotation.set(0, 0, 0);
      inst.visual.position.set(0, -inst.reachY, 0);
      this.recell(inst, inst.homePos.x, inst.homePos.z);
    }
    this.dynamics.length = 0;
    this.awake = 0;
    this.smashedCountInternal = 0;
    this.pendingDrag = 0;
    this.debrisField.clear();
  }

  /** Tear everything down: bodies, meshes, geometry and the materials we cloned. */
  dispose(): void {
    if (this.world) {
      for (const inst of this.instances) {
        if (inst.body) {
          try {
            this.world.removeRigidBody(inst.body);
          } catch (err) {
            if (!this.warnedNoWorld) {
              console.warn('[Destructibles] removeRigidBody failed during dispose', err);
              this.warnedNoWorld = true;
            }
          }
        }
        inst.body = null;
        inst.colliders.length = 0;
      }
    }

    this.debrisField.dispose();

    for (const inst of this.instances) inst.root.removeFromParent();
    this.instances.length = 0;
    this.dynamics.length = 0;
    this.byId.clear();
    this.grid.clear();
    this.listeners.clear();

    // Only what WE built. Geometry and materials that came out of OfficeProps / ChairModel /
    // MaterialLibrary are shared caches owned by those modules — disposing them here would
    // blank out the rest of the level.
    for (const g of this.geoCache.values()) g.dispose();
    for (const m of this.matCache.values()) m.dispose();
    this.geoCache.clear();
    this.matCache.clear();

    this.group.removeFromParent();
    this.awake = 0;
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const UP = new THREE.Vector3(0, 1, 0);

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Level authoring helper
// ---------------------------------------------------------------------------

/**
 * Scatter a believable spread of breakables across a rectangular floor patch. Deterministic
 * for a given seed. Meant for quickly dressing a level; hand-place the hero props that a
 * goal depends on so their ids are stable.
 */
export function scatterDestructibles(
  centre: THREE.Vector3,
  sizeX: number,
  sizeZ: number,
  count: number,
  seed = 1,
  mix: readonly DestructibleKind[] = ['trashCan', 'paperStack', 'cardboardBox', 'coneStack', 'mug', 'chairEmpty', 'pottedPlant'],
): DestructibleDef[] {
  const rand = mulberry(seed);
  const out: DestructibleDef[] = [];
  for (let i = 0; i < count; i++) {
    const kind = mix[Math.floor(rand() * mix.length) % mix.length];
    out.push({
      kind,
      position: new THREE.Vector3(
        centre.x + (rand() - 0.5) * sizeX,
        centre.y,
        centre.z + (rand() - 0.5) * sizeZ,
      ),
      rotationY: rand() * Math.PI * 2,
      seed: Math.floor(rand() * 0xffff),
      id: `scatter_${seed}_${i}`,
    });
  }
  return out;
}
