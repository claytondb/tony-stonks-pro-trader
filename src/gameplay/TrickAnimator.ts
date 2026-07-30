/**
 * TrickAnimator — the seated rig and the per-trick motion driver for Tony Stonks Pro Trader.
 *
 * WHY THIS EXISTS
 *   The build shipped TWO baked clips ('trick' and 'chairhold') covering every trick in the
 *   registry, picked by raw button rather than by trick, and no sitting pose at all: a standing rig
 *   was shoved
 *   down 0.46 m so the hips happened to land near the seat. Every trick therefore looked the same,
 *   and the man was not sitting on the chair — he was standing inside it.
 *
 *   This module fixes both. It builds a real SEATED POSE procedurally out of the rig's own bones
 *   (solved with two-bone IK against the chair's actual seat/armrest/caster-spider geometry, so it
 *   is correct for any rig proportions), then layers additive motion on top of it: lean into turns,
 *   tuck in the air, reach on grabs, arms out on the balance axis, sprawl on a bail, a push kick —
 *   and one distinct pose signature for every one of the 35 trick ids in TrickRegistry.
 *
 * HOW THE POSE MATHS WORKS (read this before changing numbers)
 *   Every authored value is expressed in MODEL SPACE (the character root's frame): +Y up,
 *   +Z the direction the rider faces, +X the rider's LEFT (the Mixamo convention these FBX rigs
 *   use). For each tracked bone we cache, at bind time:
 *     - its rest local transform (restored from the skeleton's boneInverses, so it is the true
 *       bind pose even if a clip has already run — see restoreBindPose()),
 *     - its rest orientation in model space,
 *     - its rest DIRECTION in model space (the unit vector toward its child bone).
 *
 *   A pose is then authored as, per bone, (a) a target direction in model space and (b) an
 *   additive rotation in model space. We turn that into
 *
 *       targetModel = additive * fromUnitVectors(restDir, targetDir) * restModel
 *       boneLocal   = parentModel⁻¹ * targetModel
 *       bone.quaternion.slerp(boneLocal, weight)
 *
 *   Three consequences, all deliberate:
 *     1. It is RIG-AGNOSTIC. We never assume a bone's local axes; we only ever ask "which way does
 *        this bone point" and "point it this way instead". Mixamo, UE-style and Bip01 rigs all work.
 *     2. Targets are ABSOLUTE, not relative to the parent, so parent rotations do not compound into
 *        children. Leaning the pelvis does not throw the arms across the screen, and each layer can
 *        be authored in isolation.
 *     3. `weight` is a real blend against whatever the baked clip put in the bone this frame. That
 *        is how the baked clips are still used: a trick raises the weight only on the slots its
 *        signature drives, and the baked clip keeps the rest.
 *
 * WHAT IT OWNS
 *   The bone pose, the hips' local translation (which is where FBX root motion hides), the model
 *   root's position and yaw (so the rider is placed ON the seat rather than guessed at), and clip
 *   playback (its own AnimationActions on its own mixer unless you hand it one).
 *
 * WHAT IT DOES NOT OWN
 *   Physics, scoring, input, the chair transform, the camera. Everything it needs arrives through
 *   `PoseInput`. It imports THREE and TrickRegistry (pure data) and nothing else from the game.
 *
 * INTEGRATION IN ONE BREATH
 *   const anim = new TrickAnimator({ model, mixer: null, clips, bones: new Map(), chairRoot });
 *   anim.setSeatAnchor(NaN, new THREE.Vector3(0, CHAIR_SEAT_TOP_Y[tier], 0.02));
 *   // per frame, AFTER the chair transform has been written:
 *   anim.update(dt, poseInput);
 *   See REQUIRED_PLAYERMODEL_PATCH at the bottom of this file for the one edit PlayerModel needs.
 */

import * as THREE from 'three';
import { TrickRegistry } from '../tricks/TrickRegistry';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RigRefs {
  /** The loaded character root (PlayerModel.getModel()). Must be a child of the chair group. */
  model: THREE.Object3D;
  /** Hand over the rig's existing mixer to share it, or null to let TrickAnimator own one. */
  mixer: THREE.AnimationMixer | null;
  /** Logical clip name -> clip. Empty map is fine: we then read `model.animations`. */
  clips: Map<string, THREE.AnimationClip>;
  /** Bone name -> bone. Empty map is fine: we then walk the model ourselves. */
  bones: Map<string, THREE.Bone>;
  /** The object the seat anchor is measured in. Use ChairParts.root. */
  chairRoot: THREE.Object3D;
}

export interface PoseInput {
  grounded: boolean;
  /** Seconds since the wheels left the floor. 0 while grounded. */
  airTime: number;
  /** Ground speed, m/s, unsigned. */
  speed: number;
  /** Steering, -1 (left) .. +1 (right). */
  turn: number;
  /** Trick id from TrickRegistry, or null. Setting it starts the trick; clearing it releases. */
  trickId: string | null;
  trickKind: 'flip' | 'grab' | 'grind' | 'manual' | 'spin' | 'special' | null;
  /** Grab button state. A grab trick releases when this goes false. */
  grabHeld: boolean;
  /** Balance, 0..1 with 0.5 centred (HUD/GrindSystem convention). -1..1 signed also accepted. */
  balance: number;
  /** Chair pitch in degrees, nose-up positive. The rider counter-leans against it. */
  pitchDeg: number;
  /** Chair roll in degrees, right-side-down positive. */
  rollDeg: number;
  bailing: boolean;
  /** True on the frames the player is kicking the floor to accelerate. */
  pushing: boolean;
}

/**
 * Seat-pan TOP height above the chair root's origin, per ChairModel tier
 * (TIERS[t].seatY + TIERS[t].seatT). Pass `new THREE.Vector3(0, CHAIR_SEAT_TOP_Y[tier], 0.02)`
 * to setSeatAnchor when chairRoot is ChairParts.root.
 */
export const CHAIR_SEAT_TOP_Y: readonly number[] = [0.520, 0.560, 0.585, 0.610];

/** Everything you might want to retune without touching the pose code. Mutate freely at runtime. */
export interface AnimatorConfig {
  /** +1 if the rig faces +Z in its own space (Mixamo default), -1 if it faces -Z. */
  rigForward: 1 | -1;
  /** Extra yaw applied to the model root, radians. Use to line the rider up with chair forward. */
  modelYaw: number;
  /** Pelvis height above the seat pan top, metres. */
  pelvisAboveSeat: number;
  /** Pelvis offset along the rider's facing from the seat centre, metres (negative = sits back). */
  pelvisForward: number;
  /** Pelvis lateral offset, metres. */
  pelvisLateral: number;
  /** Sole height below the seat pan top, metres. ChairModel's caster spider sits ~0.465 below. */
  feetBelowSeat: number;
  /** Ankle distance ahead of the pelvis, metres. */
  feetForward: number;
  /** Half the stance width, metres. */
  feetApart: number;
  /** Armrest pad top above the seat pan top, metres. */
  handsAboveSeat: number;
  /** Half the armrest track width, metres. */
  handsApart: number;
  /** Hand distance ahead of the pelvis, metres. */
  handsForward: number;
  /** Used only if the rig has no findable hips bone. */
  fallbackHipHeight: number;
  /** Which foot kicks off the floor: -1 left, +1 right. */
  pushFoot: -1 | 1;
  /** Seconds for one push cycle. */
  pushCycle: number;
  /** Global multiplier on every procedural blend weight. 1 = full procedural, 0 = baked only. */
  authority: number;
  /** Crossfade time between baked base clips, seconds. */
  clipFade: number;
}

// ---------------------------------------------------------------------------
// Bone slots
// ---------------------------------------------------------------------------

const HIPS = 0, SPINE = 1, CHEST = 2, UPCHEST = 3, NECK = 4, HEAD = 5;
const SHO_L = 6, UARM_L = 7, FARM_L = 8, HAND_L = 9;
const SHO_R = 10, UARM_R = 11, FARM_R = 12, HAND_R = 13;
const THIGH_L = 14, SHIN_L = 15, FOOT_L = 16, TOE_L = 17;
const THIGH_R = 18, SHIN_R = 19, FOOT_R = 20, TOE_R = 21;
const SLOT_COUNT = 22;

/** Index-matched to the constants above. Used for diagnostics and for `getBoundBones()`. */
export const SLOT_NAMES: readonly string[] = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'shoulderL', 'upperArmL', 'foreArmL', 'handL',
  'shoulderR', 'upperArmR', 'foreArmR', 'handR',
  'thighL', 'shinL', 'footL', 'toeL',
  'thighR', 'shinR', 'footR', 'toeR',
];

const G_TORSO = [SPINE, CHEST, UPCHEST];
const G_ARM_L = [SHO_L, UARM_L, FARM_L, HAND_L];
const G_ARM_R = [SHO_R, UARM_R, FARM_R, HAND_R];
const G_ARMS = [SHO_L, UARM_L, FARM_L, HAND_L, SHO_R, UARM_R, FARM_R, HAND_R];
const G_LEGS = [THIGH_L, SHIN_L, FOOT_L, TOE_L, THIGH_R, SHIN_R, FOOT_R, TOE_R];
const G_UPPER = [SPINE, CHEST, UPCHEST, NECK, HEAD, ...G_ARMS];
const G_ALL: number[] = [];
for (let i = 0; i < SLOT_COUNT; i++) G_ALL.push(i);

/** How much of each bone the procedural layer takes by default. Legs are locked; the head floats. */
const BASE_WEIGHT = new Float32Array(SLOT_COUNT);
BASE_WEIGHT[HIPS] = 1.0;
BASE_WEIGHT[SPINE] = 0.92; BASE_WEIGHT[CHEST] = 0.88; BASE_WEIGHT[UPCHEST] = 0.85;
BASE_WEIGHT[NECK] = 0.62; BASE_WEIGHT[HEAD] = 0.52;
BASE_WEIGHT[SHO_L] = BASE_WEIGHT[SHO_R] = 0.70;
BASE_WEIGHT[UARM_L] = BASE_WEIGHT[UARM_R] = 0.82;
BASE_WEIGHT[FARM_L] = BASE_WEIGHT[FARM_R] = 0.82;
BASE_WEIGHT[HAND_L] = BASE_WEIGHT[HAND_R] = 0.60;
BASE_WEIGHT[THIGH_L] = BASE_WEIGHT[THIGH_R] = 1.0;
BASE_WEIGHT[SHIN_L] = BASE_WEIGHT[SHIN_R] = 1.0;
BASE_WEIGHT[FOOT_L] = BASE_WEIGHT[FOOT_R] = 0.95;
BASE_WEIGHT[TOE_L] = BASE_WEIGHT[TOE_R] = 0.45;

/** slot -> the slot whose rest position defines this bone's "forward". null = no direction. */
const CHILD_SLOT: (number | null)[] = new Array(SLOT_COUNT).fill(null);
CHILD_SLOT[HIPS] = SPINE; CHILD_SLOT[SPINE] = CHEST; CHILD_SLOT[CHEST] = UPCHEST;
CHILD_SLOT[UPCHEST] = NECK; CHILD_SLOT[NECK] = HEAD;
CHILD_SLOT[SHO_L] = UARM_L; CHILD_SLOT[UARM_L] = FARM_L; CHILD_SLOT[FARM_L] = HAND_L;
CHILD_SLOT[SHO_R] = UARM_R; CHILD_SLOT[UARM_R] = FARM_R; CHILD_SLOT[FARM_R] = HAND_R;
CHILD_SLOT[THIGH_L] = SHIN_L; CHILD_SLOT[SHIN_L] = FOOT_L; CHILD_SLOT[FOOT_L] = TOE_L;
CHILD_SLOT[THIGH_R] = SHIN_R; CHILD_SLOT[SHIN_R] = FOOT_R; CHILD_SLOT[FOOT_R] = TOE_R;
/** Fallbacks when the preferred child is missing from the rig (no upperChest, no toes, ...). */
const CHILD_FALLBACK: (number | null)[] = new Array(SLOT_COUNT).fill(null);
CHILD_FALLBACK[SPINE] = NECK; CHILD_FALLBACK[CHEST] = NECK; CHILD_FALLBACK[UPCHEST] = HEAD;
CHILD_FALLBACK[HIPS] = CHEST;
CHILD_FALLBACK[FOOT_L] = null; CHILD_FALLBACK[FOOT_R] = null;

// ---------------------------------------------------------------------------
// Fuzzy bone matching
//
// The two shipped FBX rigs use Hips / Spine / Spine01 / Spine02 / Neck / Head /
// Left|RightShoulder / Arm / ForeArm / Hand / UpLeg / Leg / Foot / ToeBase, with no mixamorig:
// prefix. Other exports of the same character (and anything an artist drops in later) use
// mixamorig:, UE names (upperarm_l, calf_r, clavicle_l), Bip01-isms, or suffix sides. This
// classifier handles all of them: it is keyword based, not table based, so a rig it has never
// seen still binds as long as the bones are called something a human would recognise.
// ---------------------------------------------------------------------------

const SKIP_TOKENS = ['twist', 'roll', 'helper', 'ik', 'pole', 'target', 'ctrl', 'null', 'dummy',
  'end', 'tip', 'marker', 'attach', 'socket', 'jiggle', 'proxy'];
const FINGER_TOKENS = ['thumb', 'index', 'middle', 'ring', 'pinky', 'finger', 'digit'];

type Side = 'L' | 'R' | 'C';

interface Classified { group: string; side: Side; key: string; }

/** Strip prefixes/namespaces, lowercase, and pull the side marker out before separators vanish. */
function classifyBone(rawName: string): Classified | null {
  let n = rawName.toLowerCase();
  n = n.replace(/mixamorig[:_\s]*/g, '');
  n = n.replace(/^(bip\d*|b_|def[-_]?|jnt[-_]?|bone[-_]?)/, '');

  // Side detection has to happen while the separators are still there: `thigh_l` and `l_arm`
  // both carry the side as a lone letter, which is unrecoverable once we squash to `thighl`.
  let side: Side = 'C';
  if (n.includes('left')) side = 'L';
  else if (n.includes('right')) side = 'R';
  else {
    const m = n.match(/(?:^|[^a-z])([lr])(?:[^a-z]|$)/);
    if (m) side = m[1] === 'l' ? 'L' : 'R';
  }

  const key = n.replace(/left|right/g, '').replace(/[^a-z0-9]/g, '');
  if (key.length === 0) return null;
  for (const t of SKIP_TOKENS) if (key.includes(t)) return null;

  let group: string | null = null;
  if (key.includes('toe') || key.includes('ball')) group = 'toe';
  else if (key.includes('foot') || key.includes('ankle')) group = 'foot';
  else if (key.includes('thigh') || key.includes('upleg') || key.includes('upperleg')) group = 'thigh';
  else if (key.includes('calf') || key.includes('shin') || key.includes('lowerleg') || key.includes('knee')) group = 'shin';
  else if (key.includes('leg')) group = 'shin';                       // Mixamo `LeftLeg` IS the shin
  else if (key.includes('hand') || key.includes('wrist')) {
    for (const f of FINGER_TOKENS) if (key.includes(f)) return null;  // LeftHandIndex1 & friends
    group = 'hand';
  } else if (key.includes('forearm') || key.includes('lowerarm') || key.includes('elbow')) group = 'forearm';
  else if (key.includes('shoulder') || key.includes('clavicle') || key.includes('collar')) group = 'shoulder';
  else if (key.includes('upperarm') || key.includes('arm')) group = 'upperarm';
  else if (key.includes('head')) group = 'head';
  else if (key.includes('neck')) group = 'neck';
  else if (key.includes('chest') || key.includes('spine') || key.includes('torso') ||
           key.includes('abdomen') || key.includes('waist')) group = 'spine';
  else if (key.includes('hips') || key.includes('pelvis') || key === 'hip') group = 'hips';

  if (!group) return null;
  // Anything paired must have a side; anything central must not claim one.
  if ((group === 'hips' || group === 'spine' || group === 'neck' || group === 'head')) side = 'C';
  else if (side === 'C') return null;
  return { group, side, key };
}

// ---------------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------------

const E_BELL = 0, E_SNAP = 1, E_HOLD = 2, E_LATE = 3, E_DOUBLE = 4;
type EnvName = 'bell' | 'snap' | 'hold' | 'late' | 'double';
const ENV_IDS: Record<EnvName, number> = { bell: E_BELL, snap: E_SNAP, hold: E_HOLD, late: E_LATE, double: E_DOUBLE };

function smoothstep(u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return u * u * (3 - 2 * u);
}

/** `t` is normalised trick time for timed tricks. Sustained tricks never call this. */
function envelope(id: number, t: number): number {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  switch (id) {
    case E_SNAP:
      return u < 0.22 ? smoothstep(u / 0.22) : Math.pow(1 - (u - 0.22) / 0.78, 1.4);
    case E_HOLD:
      return Math.min(smoothstep(u / 0.20), smoothstep((1 - u) / 0.25));
    case E_LATE:
      return Math.sin(Math.PI * Math.pow(u, 1.6));
    case E_DOUBLE:
      return Math.abs(Math.sin(2 * Math.PI * u)) * (1 - 0.28 * u);
    case E_BELL:
    default:
      return Math.sin(Math.PI * u);
  }
}

// ---------------------------------------------------------------------------
// Trick signatures
// ---------------------------------------------------------------------------

interface Op {
  s: number;                     // slot
  x: number; y: number; z: number;  // peak additive rotation, model space, radians
  dx: number; dy: number; dz: number; // target direction, model space (0,0,0 = none)
  k: number;                     // direction blend at peak
  w: number;                     // procedural weight at peak
  e: number;                     // envelope id
}

interface OpSpec {
  x?: number; y?: number; z?: number;
  dir?: [number, number, number];
  k?: number;
  w?: number;
  e?: EnvName;
}

interface TrickSig {
  /** Logical baked clip to run underneath. Undefined keeps whatever the base state chose. */
  clip?: string;
  /** Whole-body yaw during the trick, radians (the rider counter-rotating against the chair). */
  spin: number;
  /** Hips translation at peak, metres, model space. */
  hx: number; hy: number; hz: number;
  ops: Op[];
}

function mkOp(slot: number, sp: OpSpec, mirror: boolean): Op {
  const m = mirror ? -1 : 1;
  const d = sp.dir;
  return {
    s: slot,
    x: sp.x ?? 0,
    y: (sp.y ?? 0) * m,
    z: (sp.z ?? 0) * m,
    dx: d ? d[0] * m : 0,
    dy: d ? d[1] : 0,
    dz: d ? d[2] : 0,
    k: d ? (sp.k ?? 1) : 0,
    w: sp.w ?? 0.9,
    e: ENV_IDS[sp.e ?? 'bell'],
  };
}

/** One op on one slot. */
function op(slot: number, sp: OpSpec): Op[] { return [mkOp(slot, sp, false)]; }
/** One op mirrored onto a left/right pair. Authored for the LEFT side. */
function pair(slotL: number, slotR: number, sp: OpSpec): Op[] {
  return [mkOp(slotL, sp, false), mkOp(slotR, sp, true)];
}
/** The same op on a whole group, unmirrored (used for whole-body rotations). */
function all(slots: number[], sp: OpSpec): Op[] {
  const out: Op[] = [];
  for (const s of slots) out.push(mkOp(s, sp, false));
  return out;
}

function sig(spin: number, hips: [number, number, number], clip: string | undefined, ...groups: Op[][]): TrickSig {
  const ops: Op[] = [];
  for (const g of groups) for (const o of g) ops.push(o);
  return { clip, spin, hx: hips[0], hy: hips[1], hz: hips[2], ops };
}

/**
 * A pose signature for every id in TrickRegistry. These are read as: "on top of the seated base,
 * over the trick's duration, do THIS". Each is meant to be legible from the THPS chase camera at
 * 8 m, which means one big readable shape per trick, not anatomical accuracy.
 */
const TRICK_SIGS = new Map<string, TrickSig>();

// --- Flip tricks: the chair flips under him, so his legs do the talking -----------------
TRICK_SIGS.set('kickflip', sig(-0.20, [0, 0.05, 0], 'trick',
  pair(THIGH_L, THIGH_R, { dir: [0.42, 0.10, 0.90], k: 0.75, e: 'snap' }),
  op(SHIN_L, { dir: [0.55, -0.62, -0.55], k: 0.85, e: 'snap' }),
  op(FOOT_L, { z: -1.10, x: -0.35, e: 'snap' }),
  op(SHIN_R, { dir: [-0.10, -0.86, 0.50], k: 0.5, e: 'snap' }),
  all(G_ARMS, { z: -0.18, w: 0.55, e: 'snap' }),
));
TRICK_SIGS.set('heelflip', sig(0.20, [0, 0.05, 0], 'trick',
  pair(THIGH_L, THIGH_R, { dir: [0.30, 0.12, 0.94], k: 0.75, e: 'snap' }),
  op(SHIN_L, { dir: [-0.45, -0.70, -0.55], k: 0.85, e: 'snap' }),
  op(FOOT_L, { z: 1.10, x: -0.30, e: 'snap' }),
  op(SHIN_R, { dir: [0.05, -0.88, 0.47], k: 0.5, e: 'snap' }),
  all(G_ARMS, { z: 0.18, w: 0.55, e: 'snap' }),
));
TRICK_SIGS.set('pop_shove', sig(0.55, [0, 0.04, 0], 'trick',
  pair(THIGH_L, THIGH_R, { dir: [0.24, 0.26, 0.93], k: 0.7, e: 'bell' }),
  pair(SHIN_L, SHIN_R, { dir: [0.08, -0.66, -0.75], k: 0.7, e: 'bell' }),
  all(G_ARMS, { y: 0.30, w: 0.6, e: 'bell' }),
  all(G_TORSO, { y: -0.22, e: 'bell' }),
));
TRICK_SIGS.set('fs_shove', sig(-0.55, [0, 0.04, 0], 'trick',
  pair(THIGH_L, THIGH_R, { dir: [0.24, 0.26, 0.93], k: 0.7, e: 'bell' }),
  pair(SHIN_L, SHIN_R, { dir: [0.08, -0.66, -0.75], k: 0.7, e: 'bell' }),
  all(G_ARMS, { y: -0.30, w: 0.6, e: 'bell' }),
  all(G_TORSO, { y: 0.22, e: 'bell' }),
));
TRICK_SIGS.set('360_flip', sig(1.05, [0, 0.10, 0], 'trick',
  pair(THIGH_L, THIGH_R, { dir: [0.26, 0.52, 0.81], k: 0.9, e: 'bell' }),
  pair(SHIN_L, SHIN_R, { dir: [0.05, -0.42, -0.91], k: 0.9, e: 'bell' }),
  all(G_ARMS, { z: -0.55, y: 0.45, w: 0.8, e: 'bell' }),
  all(G_TORSO, { x: 0.30, y: -0.30, e: 'bell' }),
  op(HEAD, { x: 0.25, y: -0.35, w: 0.8, e: 'bell' }),
));
TRICK_SIGS.set('hardflip', sig(0.35, [0, 0.06, 0], 'trick',
  op(THIGH_L, { dir: [-0.30, 0.22, 0.93], k: 0.9, e: 'snap' }),   // left knee crosses the body
  op(SHIN_L, { dir: [-0.55, -0.62, -0.55], k: 0.9, e: 'snap' }),
  op(THIGH_R, { dir: [-0.48, 0.05, 0.88], k: 0.7, e: 'snap' }),
  op(SHIN_R, { dir: [-0.20, -0.90, 0.38], k: 0.6, e: 'snap' }),
  all(G_TORSO, { z: 0.34, y: 0.20, e: 'snap' }),
));
TRICK_SIGS.set('varial_flip', sig(0.70, [0, 0.07, 0], 'trick',
  pair(THIGH_L, THIGH_R, { dir: [0.34, 0.34, 0.88], k: 0.8, e: 'bell' }),
  op(SHIN_L, { dir: [0.52, -0.60, -0.60], k: 0.85, e: 'bell' }),
  op(FOOT_L, { z: -0.85, e: 'snap' }),
  op(SHIN_R, { dir: [0.02, -0.72, -0.69], k: 0.7, e: 'bell' }),
  all(G_ARMS, { y: 0.34, z: -0.25, w: 0.7, e: 'bell' }),
));
TRICK_SIGS.set('impossible', sig(0.25, [0, 0.13, 0], 'trick',
  pair(THIGH_L, THIGH_R, { dir: [0.22, 0.74, 0.63], k: 1.0, e: 'bell' }),   // knees to chest
  pair(SHIN_L, SHIN_R, { dir: [0.05, -0.15, -0.99], k: 1.0, e: 'bell' }),
  all(G_TORSO, { x: 0.55, e: 'bell' }),
  op(HEAD, { x: 0.40, w: 0.85, e: 'bell' }),
  all(G_ARMS, { x: 0.35, z: -0.40, w: 0.8, e: 'bell' }),
));

// --- Chair-specific flips ---------------------------------------------------------------
TRICK_SIGS.set('swivel_flip', sig(1.45, [0, 0.06, 0], 'trick',
  all(G_TORSO, { y: -0.45, e: 'hold' }),
  pair(UARM_L, UARM_R, { dir: [0.94, 0.30, 0.16], k: 0.9, e: 'hold' }),      // arms out, spinning
  pair(FARM_L, FARM_R, { dir: [0.86, 0.42, 0.28], k: 0.8, e: 'hold' }),
  pair(THIGH_L, THIGH_R, { dir: [0.36, 0.24, 0.90], k: 0.7, e: 'hold' }),
  op(HEAD, { y: -0.55, w: 0.85, e: 'hold' }),
));
TRICK_SIGS.set('caster_kick', sig(-0.15, [0, 0.02, 0], 'trick',
  op(THIGH_R, { dir: [-0.34, -0.10, 0.94], k: 1.0, w: 1.0, e: 'snap' }),     // right leg SHOOTS out
  op(SHIN_R, { dir: [-0.30, -0.06, 0.95], k: 1.0, w: 1.0, e: 'snap' }),
  op(FOOT_R, { x: -0.55, w: 1.0, e: 'snap' }),
  op(THIGH_L, { dir: [0.22, 0.34, 0.91], k: 0.8, e: 'snap' }),
  op(SHIN_L, { dir: [0.06, -0.50, -0.86], k: 0.8, e: 'snap' }),
  all(G_ARM_L, { z: -0.45, x: 0.20, w: 0.7, e: 'snap' }),
  all(G_TORSO, { z: 0.22, y: 0.18, e: 'snap' }),
));
TRICK_SIGS.set('armrest_spin', sig(1.10, [0.06, -0.06, 0], 'trick',
  op(UARM_R, { dir: [-0.42, -0.88, 0.22], k: 1.0, w: 1.0, e: 'hold' }),      // right hand PLANTED
  op(FARM_R, { dir: [-0.30, -0.93, 0.20], k: 1.0, w: 1.0, e: 'hold' }),
  op(HAND_R, { x: 0.55, w: 0.9, e: 'hold' }),
  op(UARM_L, { dir: [0.72, 0.62, 0.30], k: 0.9, e: 'hold' }),                // left arm thrown up
  op(FARM_L, { dir: [0.55, 0.78, 0.28], k: 0.9, e: 'hold' }),
  all(G_TORSO, { z: -0.42, y: -0.30, e: 'hold' }),
  pair(THIGH_L, THIGH_R, { dir: [0.40, 0.30, 0.86], k: 0.7, e: 'hold' }),
  op(HEAD, { z: -0.30, w: 0.8, e: 'hold' }),
));

// --- Grabs: sustained. The hand goes somewhere specific and STAYS there. -----------------
TRICK_SIGS.set('melon', sig(0.10, [0, 0.04, 0], 'chairhold',
  op(UARM_L, { dir: [0.30, -0.90, -0.32], k: 1.0, w: 1.0 }),                 // reach behind, heelside
  op(FARM_L, { dir: [0.42, -0.72, -0.55], k: 1.0, w: 1.0 }),
  op(HAND_L, { x: 0.45, z: -0.30, w: 0.85 }),
  pair(THIGH_L, THIGH_R, { dir: [0.28, 0.40, 0.87], k: 0.75 }),
  op(UARM_R, { dir: [-0.68, 0.52, 0.52], k: 0.7 }),
  all(G_TORSO, { z: 0.18, y: 0.20 }),
));
TRICK_SIGS.set('indy', sig(-0.10, [0, 0.04, 0], 'chairhold',
  op(UARM_R, { dir: [-0.30, -0.86, 0.42], k: 1.0, w: 1.0 }),                 // right hand, toeside
  op(FARM_R, { dir: [-0.34, -0.70, 0.63], k: 1.0, w: 1.0 }),
  op(HAND_R, { x: 0.40, w: 0.85 }),
  pair(THIGH_L, THIGH_R, { dir: [0.26, 0.44, 0.86], k: 0.8 }),
  op(UARM_L, { dir: [0.70, 0.50, 0.50], k: 0.7 }),
  all(G_TORSO, { z: -0.16, x: 0.22 }),
));
TRICK_SIGS.set('nosegrab', sig(0, [0, 0.03, 0.03], 'chairhold',
  op(UARM_R, { dir: [-0.20, -0.55, 0.81], k: 1.0, w: 1.0 }),                 // reach to the seat nose
  op(FARM_R, { dir: [-0.18, -0.40, 0.90], k: 1.0, w: 1.0 }),
  op(HAND_R, { x: 0.30, w: 0.85 }),
  all(G_TORSO, { x: 0.40 }),
  op(HEAD, { x: 0.28, w: 0.8 }),
  pair(THIGH_L, THIGH_R, { dir: [0.24, 0.16, 0.96], k: 0.6 }),
));
TRICK_SIGS.set('tailgrab', sig(0, [0, 0.03, -0.03], 'chairhold',
  op(UARM_R, { dir: [-0.24, -0.62, -0.75], k: 1.0, w: 1.0 }),                // reach back to the backrest
  op(FARM_R, { dir: [-0.20, -0.50, -0.84], k: 1.0, w: 1.0 }),
  op(HAND_R, { x: -0.35, w: 0.85 }),
  all(G_TORSO, { x: -0.30 }),
  op(HEAD, { x: -0.20, w: 0.8 }),
  pair(THIGH_L, THIGH_R, { dir: [0.26, 0.42, 0.87], k: 0.8 }),
));
TRICK_SIGS.set('benihana', sig(0.15, [0, 0.05, 0], 'chairhold',
  op(THIGH_L, { dir: [0.32, -0.06, 0.95], k: 1.0, w: 1.0 }),                 // front leg boned out
  op(SHIN_L, { dir: [0.26, -0.12, 0.96], k: 1.0, w: 1.0 }),
  op(FOOT_L, { x: -0.45, w: 0.9 }),
  op(UARM_R, { dir: [-0.26, -0.60, -0.76], k: 1.0, w: 1.0 }),                // rear hand on the tail
  op(FARM_R, { dir: [-0.22, -0.46, -0.86], k: 1.0, w: 1.0 }),
  op(THIGH_R, { dir: [-0.24, 0.46, 0.86], k: 0.85 }),
  op(SHIN_R, { dir: [-0.06, -0.44, -0.90], k: 0.85 }),
  all(G_TORSO, { x: -0.18, y: 0.20 }),
));
TRICK_SIGS.set('madonna', sig(0.20, [0, 0.06, 0], 'chairhold',
  op(THIGH_L, { dir: [0.40, 0.10, 0.91], k: 1.0, w: 1.0 }),
  op(SHIN_L, { dir: [0.42, 0.02, 0.91], k: 1.0, w: 1.0 }),                   // straight front leg
  op(UARM_R, { dir: [-0.30, -0.52, -0.80], k: 1.0, w: 1.0 }),
  op(FARM_R, { dir: [-0.26, -0.38, -0.89], k: 1.0, w: 1.0 }),
  op(UARM_L, { dir: [0.62, 0.66, 0.42], k: 0.9 }),
  all(G_TORSO, { x: -0.42, z: 0.20 }),                                       // arched back
  op(HEAD, { x: -0.30, w: 0.85 }),
));
TRICK_SIGS.set('airwalk', sig(0, [0, 0.07, 0], 'chairhold',
  op(THIGH_L, { dir: [0.62, 0.02, 0.78], k: 1.0, w: 1.0 }),                  // legs split wide
  op(SHIN_L, { dir: [0.58, -0.12, 0.81], k: 1.0, w: 1.0 }),
  op(THIGH_R, { dir: [-0.62, 0.02, 0.78], k: 1.0, w: 1.0 }),
  op(SHIN_R, { dir: [-0.58, -0.12, 0.81], k: 1.0, w: 1.0 }),
  op(UARM_R, { dir: [-0.22, -0.48, 0.85], k: 1.0, w: 1.0 }),
  op(FARM_R, { dir: [-0.18, -0.32, 0.93], k: 1.0, w: 1.0 }),
  op(UARM_L, { dir: [0.66, 0.60, 0.45], k: 0.9 }),
  all(G_TORSO, { x: 0.22 }),
));

// --- Chair-specific grabs ---------------------------------------------------------------
TRICK_SIGS.set('coffee_mug', sig(-0.18, [0, 0.02, 0], 'chairhold',
  op(UARM_R, { dir: [-0.95, 0.12, 0.28], k: 1.0, w: 1.0 }),                  // arm straight out SIDEWAYS
  op(FARM_R, { dir: [-0.90, 0.30, 0.32], k: 1.0, w: 1.0 }),
  op(HAND_R, { x: -0.55, y: 0.30, w: 0.95 }),                                // wrist cocked, holding a mug
  all(G_TORSO, { z: 0.30, y: -0.24 }),                                       // lean away from the mug
  op(HEAD, { y: -0.45, z: 0.18, w: 0.9 }),                                   // looking at it
  op(UARM_L, { dir: [0.48, -0.80, 0.35], k: 0.7 }),
  pair(THIGH_L, THIGH_R, { dir: [0.26, 0.22, 0.94], k: 0.6 }),
));
TRICK_SIGS.set('keyboard_clutch', sig(0, [0, 0.03, 0], 'chairhold',
  pair(UARM_L, UARM_R, { dir: [0.52, -0.62, 0.59], k: 1.0, w: 1.0 }),        // elbows out
  pair(FARM_L, FARM_R, { dir: [0.18, -0.10, 0.98], k: 1.0, w: 1.0 }),        // forearms level, typing
  pair(HAND_L, HAND_R, { x: 0.60, w: 0.95 }),                                // palms flat
  all(G_TORSO, { x: 0.34 }),
  op(HEAD, { x: 0.30, w: 0.85 }),
  pair(THIGH_L, THIGH_R, { dir: [0.24, 0.34, 0.91], k: 0.75 }),
));
TRICK_SIGS.set('monitor_hug', sig(0, [0, 0.05, 0.02], 'chairhold',
  pair(UARM_L, UARM_R, { dir: [0.46, -0.28, 0.84], k: 1.0, w: 1.0 }),        // BOTH arms wrap in
  pair(FARM_L, FARM_R, { dir: [-0.62, -0.12, 0.78], k: 1.0, w: 1.0 }),
  pair(HAND_L, HAND_R, { x: 0.30, y: -0.55, w: 0.95 }),
  all(G_TORSO, { x: 0.52 }),                                                 // curled around it
  op(HEAD, { x: 0.42, w: 0.9 }),
  pair(THIGH_L, THIGH_R, { dir: [0.24, 0.52, 0.82], k: 0.9 }),               // knees up to meet the arms
  pair(SHIN_L, SHIN_R, { dir: [0.06, -0.42, -0.90], k: 0.9 }),
));

// --- Grinds: sustained, and mostly about where the WEIGHT is ----------------------------
TRICK_SIGS.set('50_50', sig(0, [0, 0.01, 0], undefined,
  all(G_TORSO, { x: -0.06 }),
  pair(UARM_L, UARM_R, { dir: [0.78, -0.52, 0.34], k: 0.8, w: 0.85 }),
  pair(FARM_L, FARM_R, { dir: [0.70, -0.24, 0.66], k: 0.7, w: 0.85 }),
  pair(THIGH_L, THIGH_R, { dir: [0.16, -0.20, 0.97], k: 0.5 }),
));
TRICK_SIGS.set('nosegrind', sig(0, [0, 0.0, 0.04], undefined,
  all(G_TORSO, { x: 0.42 }),                                                 // weight forward
  op(HEAD, { x: 0.20, w: 0.8 }),
  pair(UARM_L, UARM_R, { dir: [0.60, -0.42, 0.68], k: 0.9, w: 0.9 }),
  pair(FARM_L, FARM_R, { dir: [0.46, -0.20, 0.86], k: 0.85, w: 0.9 }),
  pair(THIGH_L, THIGH_R, { dir: [0.20, 0.06, 0.98], k: 0.7 }),
));
TRICK_SIGS.set('tailslide', sig(0.85, [0, 0.0, -0.03], undefined,
  all(G_TORSO, { y: -0.42, x: -0.20 }),
  op(HEAD, { y: -0.65, w: 0.9 }),                                            // looking over the shoulder
  op(UARM_L, { dir: [0.86, -0.14, -0.49], k: 0.95, w: 0.9 }),
  op(FARM_L, { dir: [0.78, 0.16, -0.60], k: 0.9, w: 0.9 }),
  op(UARM_R, { dir: [-0.52, -0.60, 0.60], k: 0.85, w: 0.9 }),
  pair(THIGH_L, THIGH_R, { dir: [0.30, -0.10, 0.95], k: 0.6 }),
));
TRICK_SIGS.set('smith', sig(0.28, [0, -0.02, 0], undefined,
  op(THIGH_R, { dir: [-0.22, -0.42, 0.88], k: 0.95, w: 0.95 }),              // back knee dropped
  op(SHIN_R, { dir: [-0.10, -0.94, 0.32], k: 0.95, w: 0.95 }),
  op(THIGH_L, { dir: [0.30, -0.06, 0.95], k: 0.95, w: 0.95 }),               // front leg long
  op(SHIN_L, { dir: [0.24, -0.30, 0.92], k: 0.95, w: 0.95 }),
  all(G_TORSO, { z: 0.16, y: -0.18 }),
  op(UARM_L, { dir: [0.88, -0.34, 0.34], k: 0.9, w: 0.9 }),
  op(UARM_R, { dir: [-0.62, -0.58, 0.53], k: 0.9, w: 0.9 }),
));
TRICK_SIGS.set('feeble', sig(-0.28, [0, -0.02, 0], undefined,
  op(THIGH_L, { dir: [0.66, -0.28, 0.70], k: 0.95, w: 0.95 }),               // front leg out over the rail
  op(SHIN_L, { dir: [0.60, -0.46, 0.66], k: 0.95, w: 0.95 }),
  op(THIGH_R, { dir: [-0.18, -0.30, 0.94], k: 0.9, w: 0.95 }),
  op(SHIN_R, { dir: [-0.06, -0.92, 0.38], k: 0.9, w: 0.95 }),
  all(G_TORSO, { z: -0.22, y: 0.16 }),
  op(UARM_R, { dir: [-0.86, -0.30, 0.42], k: 0.9, w: 0.9 }),
  op(UARM_L, { dir: [0.58, -0.62, 0.53], k: 0.9, w: 0.9 }),
));
TRICK_SIGS.set('crooked', sig(0.40, [0, 0.0, 0.03], undefined,
  all(G_TORSO, { x: 0.30, y: -0.26 }),
  op(THIGH_L, { dir: [0.42, -0.06, 0.90], k: 0.9, w: 0.9 }),
  op(FOOT_L, { y: -0.50, w: 0.9 }),                                          // front foot turned in
  op(THIGH_R, { dir: [-0.12, -0.34, 0.93], k: 0.8 }),
  pair(UARM_L, UARM_R, { dir: [0.68, -0.44, 0.58], k: 0.85, w: 0.9 }),
  op(HEAD, { y: -0.30, w: 0.8 }),
));
TRICK_SIGS.set('bluntslide', sig(0.20, [0, 0.0, -0.05], undefined,
  all(G_TORSO, { x: -0.48 }),                                                // weight right back
  op(HEAD, { x: -0.22, w: 0.85 }),
  pair(THIGH_L, THIGH_R, { dir: [0.24, 0.34, 0.91], k: 0.9, w: 0.95 }),      // knees up
  pair(SHIN_L, SHIN_R, { dir: [0.06, -0.58, -0.81], k: 0.9, w: 0.95 }),
  pair(UARM_L, UARM_R, { dir: [0.70, 0.34, -0.63], k: 0.9, w: 0.9 }),        // arms up and back
  pair(FARM_L, FARM_R, { dir: [0.60, 0.62, -0.50], k: 0.85, w: 0.9 }),
));
TRICK_SIGS.set('boardslide', sig(1.40, [0, 0.0, 0], undefined,
  all(G_TORSO, { y: -0.60 }),
  op(HEAD, { y: -0.75, w: 0.9 }),
  pair(UARM_L, UARM_R, { dir: [0.94, -0.06, 0.34], k: 0.95, w: 0.95 }),      // arms out wide
  pair(FARM_L, FARM_R, { dir: [0.90, 0.16, 0.40], k: 0.9, w: 0.95 }),
  pair(THIGH_L, THIGH_R, { dir: [0.34, -0.14, 0.93], k: 0.6 }),
));

// --- Manuals: sustained, and entirely about the counterweight ---------------------------
TRICK_SIGS.set('manual', sig(0, [0, 0.0, -0.06], undefined,
  all(G_TORSO, { x: -0.52 }),                                                // torso thrown back
  op(HEAD, { x: -0.12, w: 0.9 }),                                            // ...but eyes up
  pair(UARM_L, UARM_R, { dir: [0.90, 0.30, 0.32], k: 0.95, w: 0.95 }),       // arms out, wings
  pair(FARM_L, FARM_R, { dir: [0.82, 0.48, 0.32], k: 0.9, w: 0.95 }),
  pair(THIGH_L, THIGH_R, { dir: [0.22, -0.06, 0.97], k: 0.9, w: 0.95 }),     // legs pushed forward
  pair(SHIN_L, SHIN_R, { dir: [0.10, -0.72, 0.68], k: 0.9, w: 0.95 }),
));
TRICK_SIGS.set('nose_manual', sig(0, [0, 0.0, 0.06], undefined,
  all(G_TORSO, { x: 0.56 }),                                                 // folded forward
  op(HEAD, { x: 0.20, w: 0.9 }),
  pair(UARM_L, UARM_R, { dir: [0.86, -0.10, 0.50], k: 0.95, w: 0.95 }),
  pair(FARM_L, FARM_R, { dir: [0.76, 0.26, 0.60], k: 0.9, w: 0.95 }),
  pair(THIGH_L, THIGH_R, { dir: [0.24, 0.30, 0.92], k: 0.9, w: 0.95 }),      // knees tucked under
  pair(SHIN_L, SHIN_R, { dir: [0.08, -0.80, -0.59], k: 0.9, w: 0.95 }),
));

// --- Specials: the money shots ----------------------------------------------------------
TRICK_SIGS.set('quarterly_report', sig(1.90, [0, 0.14, 0], 'trick',
  pair(UARM_L, UARM_R, { dir: [0.42, 0.88, 0.22], k: 1.0, w: 1.0, e: 'hold' }),   // paperwork overhead
  pair(FARM_L, FARM_R, { dir: [0.26, 0.95, 0.16], k: 1.0, w: 1.0, e: 'hold' }),
  pair(HAND_L, HAND_R, { x: -0.40, w: 0.95, e: 'hold' }),
  all(G_TORSO, { x: -0.44, e: 'hold' }),
  op(HEAD, { x: -0.35, w: 0.95, e: 'hold' }),
  op(THIGH_L, { dir: [0.72, -0.10, 0.68], k: 1.0, w: 1.0, e: 'hold' }),           // legs split
  op(THIGH_R, { dir: [-0.72, -0.10, 0.68], k: 1.0, w: 1.0, e: 'hold' }),
  pair(SHIN_L, SHIN_R, { dir: [0.30, -0.68, 0.67], k: 0.9, w: 1.0, e: 'hold' }),
));
TRICK_SIGS.set('golden_parachute', sig(-0.60, [0, 0.10, 0], 'trick',
  pair(UARM_L, UARM_R, { dir: [0.80, 0.56, 0.20], k: 1.0, w: 1.0, e: 'hold' }),   // canopy
  pair(FARM_L, FARM_R, { dir: [0.72, 0.66, 0.22], k: 1.0, w: 1.0, e: 'hold' }),
  pair(HAND_L, HAND_R, { x: -0.30, z: -0.30, w: 0.9, e: 'hold' }),
  all(G_TORSO, { x: -0.14, e: 'hold' }),
  pair(THIGH_L, THIGH_R, { dir: [0.26, 0.60, 0.76], k: 1.0, w: 1.0, e: 'hold' }), // knees tucked, floating
  pair(SHIN_L, SHIN_R, { dir: [0.06, -0.30, -0.95], k: 1.0, w: 1.0, e: 'hold' }),
  op(HEAD, { x: -0.18, w: 0.85, e: 'hold' }),
));
TRICK_SIGS.set('hostile_takeover', sig(0.45, [0, 0.04, 0.05], 'trick',
  pair(UARM_L, UARM_R, { dir: [0.30, -0.44, 0.85], k: 1.0, w: 1.0, e: 'double' }), // double fist punch
  pair(FARM_L, FARM_R, { dir: [0.16, -0.20, 0.97], k: 1.0, w: 1.0, e: 'double' }),
  pair(HAND_L, HAND_R, { x: 0.35, w: 0.9, e: 'double' }),
  all(G_TORSO, { x: 0.50, e: 'double' }),                                          // lunging forward
  op(HEAD, { x: 0.30, w: 0.9, e: 'double' }),
  op(THIGH_R, { dir: [-0.18, -0.52, -0.83], k: 1.0, w: 1.0, e: 'double' }),         // rear leg driven back
  op(SHIN_R, { dir: [-0.10, -0.70, -0.71], k: 1.0, w: 1.0, e: 'double' }),
  op(THIGH_L, { dir: [0.28, -0.02, 0.96], k: 0.95, w: 0.95, e: 'double' }),
));
TRICK_SIGS.set('pink_slip', sig(-0.75, [0, 0.03, 0], 'trick',
  op(UARM_R, { dir: [-0.90, -0.16, 0.40], k: 1.0, w: 1.0, e: 'double' }),           // slip handed over
  op(FARM_R, { dir: [-0.96, 0.10, 0.26], k: 1.0, w: 1.0, e: 'double' }),
  op(HAND_R, { z: 0.85, x: -0.30, w: 0.95, e: 'double' }),                          // flicked from the wrist
  op(UARM_L, { dir: [0.40, -0.86, 0.32], k: 0.8, e: 'double' }),
  all(G_TORSO, { y: 0.46, z: -0.18, e: 'double' }),
  op(HEAD, { y: 0.55, w: 0.9, e: 'double' }),
  op(THIGH_L, { dir: [0.52, 0.16, 0.84], k: 0.9, w: 0.9, e: 'double' }),
  op(SHIN_L, { dir: [0.40, -0.44, 0.80], k: 0.9, w: 0.9, e: 'double' }),
));

/** Fallbacks so an unregistered id (or a raw 'spin') still reads as something. */
const KIND_FALLBACK = new Map<string, TrickSig>();
KIND_FALLBACK.set('flip', TRICK_SIGS.get('kickflip')!);
KIND_FALLBACK.set('grab', TRICK_SIGS.get('indy')!);
KIND_FALLBACK.set('grind', TRICK_SIGS.get('50_50')!);
KIND_FALLBACK.set('manual', TRICK_SIGS.get('manual')!);
KIND_FALLBACK.set('special', TRICK_SIGS.get('quarterly_report')!);
KIND_FALLBACK.set('spin', sig(0.9, [0, 0.03, 0], 'trick',
  all(G_ARMS, { z: -0.50, y: 0.40, w: 0.8, e: 'bell' }),
  all(G_TORSO, { y: -0.35, e: 'bell' }),
  pair(THIGH_L, THIGH_R, { dir: [0.28, 0.30, 0.91], k: 0.7, e: 'bell' }),
));

// ---------------------------------------------------------------------------
// Internal state types
// ---------------------------------------------------------------------------

interface BoneEntry {
  slot: number;
  bone: THREE.Bone;
  /** model-exclusive .. bone.parent inclusive, outermost first. */
  chain: THREE.Object3D[];
  restLocalPos: THREE.Vector3;
  restLocalQuat: THREE.Quaternion;
  restModelPos: THREE.Vector3;
  restModelQuat: THREE.Quaternion;
  restDir: THREE.Vector3 | null;
}

interface ActiveTrick {
  id: string;
  sig: TrickSig;
  sustained: boolean;
  duration: number;   // seconds; 0 for sustained
  t: number;          // seconds since start
  release: number;    // 1 while held, ramps to 0 after release
  releasing: boolean;
}

// ---------------------------------------------------------------------------
// Scratch — every one of these exists so update() allocates nothing
// ---------------------------------------------------------------------------

const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _qTarget = new THREE.Quaternion();
const _qParent = new THREE.Quaternion();
const _qLocal = new THREE.Quaternion();
const _qWorld = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _mat2 = new THREE.Matrix4();
const _decompScale = new THREE.Vector3();
const _ikA = new THREE.Vector3();
const _ikN = new THREE.Vector3();
const _ikJoint = new THREE.Vector3();

// ---------------------------------------------------------------------------
// TrickAnimator
// ---------------------------------------------------------------------------

export class TrickAnimator {
  readonly config: AnimatorConfig = {
    rigForward: 1,
    modelYaw: 0,
    pelvisAboveSeat: 0.090,
    pelvisForward: -0.030,
    pelvisLateral: 0,
    // Measured off ChairModel tier 1: seat top 0.560, spoke top ~0.101 at a tip radius of 0.275
    // with two spokes at (+/-0.162, 0.222); armrest pad top 0.660 at x = +/-0.25, pad centred on
    // z = 0.026 and 0.31 long. The soles land on those two spokes and the palms on the pads.
    feetBelowSeat: 0.465,
    feetForward: 0.215,
    feetApart: 0.115,
    handsAboveSeat: 0.115,
    handsApart: 0.245,
    handsForward: 0.020,
    fallbackHipHeight: 0.95,
    pushFoot: 1,
    pushCycle: 0.62,
    authority: 1,
    clipFade: 0.18,
  };

  private rig: RigRefs;
  private mixer: THREE.AnimationMixer;
  private ownsMixer: boolean;
  private actions = new Map<string, THREE.AnimationAction>();
  private clipByName = new Map<string, THREE.AnimationClip>();
  private baseClip: string | null = null;

  private slots: (BoneEntry | null)[] = new Array(SLOT_COUNT).fill(null);
  /** Bound bones sorted parents-first, so a parent's final local quaternion is ready when read. */
  private order: BoneEntry[] = [];
  private modelScale = 1;
  private hipHeight = 0.95;

  // Pose accumulators (indexed by slot). Reset and refilled every frame; never reallocated.
  private aX = new Float32Array(SLOT_COUNT);
  private aY = new Float32Array(SLOT_COUNT);
  private aZ = new Float32Array(SLOT_COUNT);
  private dX = new Float32Array(SLOT_COUNT);
  private dY = new Float32Array(SLOT_COUNT);
  private dZ = new Float32Array(SLOT_COUNT);
  private dW = new Float32Array(SLOT_COUNT);
  private wt = new Float32Array(SLOT_COUNT);
  private hipOff = new THREE.Vector3();

  // Solved seated targets, recomputed only when the seat anchor or config changes.
  private seatThigh: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3()];
  private seatShin: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3()];
  private seatUpArm: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3()];
  private seatForeArm: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3()];

  private seatLocal = new THREE.Vector3(0, CHAIR_SEAT_TOP_Y[1], 0.02);
  private seatWorldY = NaN;

  // Smoothed / continuous drivers.
  private turnSm = 0;
  private speedSm = 0;
  private pitchSm = 0;
  private rollSm = 0;
  private balSm = 0;
  private airSm = 0;
  private bailSm = 0;
  private pushSm = 0;
  private pushPhase = 0;
  private grabSm = 0;
  private wasGrounded = true;
  private landPop = 0;

  private active: ActiveTrick | null = null;
  private lastAutoId: string | null = null;
  private disposed = false;

  constructor(rig: RigRefs) {
    this.rig = rig;
    this.ownsMixer = !rig.mixer;
    this.mixer = rig.mixer ?? new THREE.AnimationMixer(rig.model);

    this.collectClips();
    this.bindBones();
    this.solveSeatedPose();
  }

  // -------------------------------------------------------------------------
  // Bind
  // -------------------------------------------------------------------------

  private collectClips(): void {
    for (const [name, clip] of this.rig.clips) this.clipByName.set(name.toLowerCase(), clip);
    const own = (this.rig.model as THREE.Object3D & { animations?: THREE.AnimationClip[] }).animations;
    if (own) {
      for (const clip of own) {
        const key = clip.name.toLowerCase();
        if (!this.clipByName.has(key)) this.clipByName.set(key, clip);
      }
    }
  }

  /**
   * Put the skeleton back on its bind pose, so the rest transforms we cache are the real rest
   * transforms even if a clip has already been played on this rig.
   *
   * This deliberately does NOT call THREE.Skeleton.pose(). That method writes the ROOT bone's
   * bind WORLD matrix into its LOCAL matrix (Skeleton.js: the `else` branch when the parent is
   * not a Bone), which is only correct when the root bone's parent is at identity. Our rig hangs
   * off an Armature node under a model scaled to 0.006, so pose() collapses the whole skeleton by
   * that factor. Deriving each local from the parent's boneInverse is space-independent and has
   * no such assumption; the root bone is simply left alone.
   */
  private restoreBindPose(): void {
    const seen = new Set<THREE.Skeleton>();
    this.rig.model.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh || !sm.skeleton) return;
      const sk = sm.skeleton;
      if (seen.has(sk)) return;
      seen.add(sk);
      const inv = sk.boneInverses;
      if (!inv || inv.length !== sk.bones.length) return;
      const index = new Map<THREE.Object3D, number>();
      for (let i = 0; i < sk.bones.length; i++) index.set(sk.bones[i], i);
      for (let i = 0; i < sk.bones.length; i++) {
        const b = sk.bones[i];
        if (!b.parent) continue;
        const pi = index.get(b.parent);
        if (pi === undefined) continue;                 // root of the chain: leave it as authored
        // local = parentBindWorld⁻¹ * childBindWorld = boneInverse[parent] * boneInverse[child]⁻¹
        _mat.copy(inv[i]).invert();
        _mat2.copy(inv[pi]).multiply(_mat);
        _mat2.decompose(b.position, b.quaternion, b.scale);
      }
    });
  }

  /** Find, classify and cache the rest pose of every bone we can drive. */
  private bindBones(): void {
    const model = this.rig.model;

    // 1. gather candidate bones
    const candidates: THREE.Bone[] = [];
    if (this.rig.bones.size > 0) {
      for (const b of this.rig.bones.values()) candidates.push(b);
    } else {
      model.traverse((o) => {
        const b = o as THREE.Bone;
        if (b.isBone) candidates.push(b);
      });
    }
    if (candidates.length === 0) return;

    // 2. restore the bind pose so the transforms we read are the rest pose
    this.restoreBindPose();
    model.updateMatrixWorld(true);
    _mat.copy(model.matrixWorld).invert();
    const modelInv = _mat.clone();

    // 3. classify. Best (shortest, shallowest) name per group wins; spines resolve by depth.
    const best = new Map<string, { bone: THREE.Bone; len: number; depth: number }>();
    const spineChain: { bone: THREE.Bone; depth: number; chesty: boolean }[] = [];
    for (const bone of candidates) {
      const c = classifyBone(bone.name);
      if (!c) continue;
      const depth = this.depthOf(bone, model);
      if (depth < 0) continue;
      if (c.group === 'spine') {
        spineChain.push({ bone, depth, chesty: c.key.includes('chest') });
        continue;
      }
      const slotKey = c.group + c.side;
      const prev = best.get(slotKey);
      if (!prev || c.key.length < prev.len || (c.key.length === prev.len && depth < prev.depth)) {
        best.set(slotKey, { bone, len: c.key.length, depth });
      }
    }

    const put = (slot: number, bone: THREE.Bone | undefined) => {
      if (!bone) return;
      const chain: THREE.Object3D[] = [];
      let p: THREE.Object3D | null = bone.parent;
      while (p && p !== model) { chain.push(p); p = p.parent; }
      if (p !== model) return;                     // not under the model root — ignore it
      chain.reverse();
      _mat.copy(modelInv).multiply(bone.matrixWorld);
      const entry: BoneEntry = {
        slot,
        bone,
        chain,
        restLocalPos: bone.position.clone(),
        restLocalQuat: bone.quaternion.clone(),
        restModelPos: new THREE.Vector3(),
        restModelQuat: new THREE.Quaternion(),
        restDir: null,
      };
      _mat.decompose(entry.restModelPos, entry.restModelQuat, _decompScale);
      this.slots[slot] = entry;
    };

    put(HIPS, best.get('hipsC')?.bone);
    put(NECK, best.get('neckC')?.bone);
    put(HEAD, best.get('headC')?.bone);
    put(SHO_L, best.get('shoulderL')?.bone); put(SHO_R, best.get('shoulderR')?.bone);
    put(UARM_L, best.get('upperarmL')?.bone); put(UARM_R, best.get('upperarmR')?.bone);
    put(FARM_L, best.get('forearmL')?.bone); put(FARM_R, best.get('forearmR')?.bone);
    put(HAND_L, best.get('handL')?.bone); put(HAND_R, best.get('handR')?.bone);
    put(THIGH_L, best.get('thighL')?.bone); put(THIGH_R, best.get('thighR')?.bone);
    put(SHIN_L, best.get('shinL')?.bone); put(SHIN_R, best.get('shinR')?.bone);
    put(FOOT_L, best.get('footL')?.bone); put(FOOT_R, best.get('footR')?.bone);
    put(TOE_L, best.get('toeL')?.bone); put(TOE_R, best.get('toeR')?.bone);

    // Spine chain: shallowest is the lumbar spine, then chest, then upper chest. A bone that
    // actually says "chest" outranks depth order for the chest slot.
    spineChain.sort((a, b) => a.depth - b.depth);
    if (spineChain.length > 0) put(SPINE, spineChain[0].bone);
    if (spineChain.length > 1) {
      let chestIdx = 1;
      for (let i = 1; i < spineChain.length; i++) if (spineChain[i].chesty) { chestIdx = i; break; }
      put(CHEST, spineChain[chestIdx].bone);
      if (spineChain.length > chestIdx + 1) put(UPCHEST, spineChain[chestIdx + 1].bone);
    }

    // 4. rest directions, from each bone toward its (possibly substituted) child
    for (let s = 0; s < SLOT_COUNT; s++) {
      const e = this.slots[s];
      if (!e) continue;
      let childSlot = CHILD_SLOT[s];
      if (childSlot === null || !this.slots[childSlot]) childSlot = CHILD_FALLBACK[s];
      if (childSlot === null) continue;
      const child = this.slots[childSlot];
      if (!child) continue;
      const d = new THREE.Vector3().subVectors(child.restModelPos, e.restModelPos);
      if (d.lengthSq() < 1e-10) continue;
      e.restDir = d.normalize();
    }

    // 5. evaluation order: parents before children
    this.order.length = 0;
    for (let s = 0; s < SLOT_COUNT; s++) if (this.slots[s]) this.order.push(this.slots[s]!);
    this.order.sort((a, b) => a.chain.length - b.chain.length);

    // 6. scale + hip height, both in metres of the model's PARENT space
    const sc = Math.abs(this.rig.model.scale.y);
    this.modelScale = sc > 1e-6 ? sc : 1;
    const hips = this.slots[HIPS];
    this.hipHeight = hips ? hips.restModelPos.y * this.modelScale : this.config.fallbackHipHeight;
    if (!(this.hipHeight > 0.05)) this.hipHeight = this.config.fallbackHipHeight;
  }

  private depthOf(bone: THREE.Object3D, root: THREE.Object3D): number {
    let d = 0;
    let p: THREE.Object3D | null = bone;
    while (p && p !== root) { p = p.parent; d++; if (d > 64) return -1; }
    return p === root ? d : -1;
  }

  /** Bone length in metres between two slots, or a sane guess if either is missing. */
  private limbLength(a: number, b: number, fallback: number): number {
    const ea = this.slots[a], eb = this.slots[b];
    if (!ea || !eb) return fallback;
    const l = ea.restModelPos.distanceTo(eb.restModelPos) * this.modelScale;
    return l > 1e-4 ? l : fallback;
  }

  /**
   * Two-bone IK, all in model space, all in metres.
   * `target` is the end effector relative to the chain root; `pole` biases which way the middle
   * joint breaks. Writes unit directions for the upper and lower bone.
   */
  private solveTwoBone(
    target: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3,
    outUpper: THREE.Vector3, outLower: THREE.Vector3,
  ): void {
    const maxReach = (l1 + l2) * 0.995;
    const minReach = Math.abs(l1 - l2) + 1e-3;
    let d = target.length();
    if (d < 1e-5) { _v3.set(0, -1, 0); d = minReach; } else _v3.copy(target).divideScalar(d);
    d = Math.min(maxReach, Math.max(minReach, d));

    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));

    _ikN.copy(pole).addScaledVector(_v3, -pole.dot(_v3));
    if (_ikN.lengthSq() < 1e-8) {
      _ikN.set(0, 0, 1).addScaledVector(_v3, -_v3.z);
      if (_ikN.lengthSq() < 1e-8) _ikN.set(1, 0, 0).addScaledVector(_v3, -_v3.x);
    }
    _ikN.normalize();

    _ikJoint.copy(_v3).multiplyScalar(a).addScaledVector(_ikN, h);
    outUpper.copy(_ikJoint).normalize();
    _ikA.copy(_v3).multiplyScalar(d).sub(_ikJoint);
    if (_ikA.lengthSq() < 1e-10) _ikA.copy(_v3);
    outLower.copy(_ikA).normalize();
  }

  /**
   * Solve the four limb chains against the actual chair geometry so the feet land on the caster
   * spider and the hands land on the armrests whatever the rig's proportions are. Cheap enough to
   * re-run whenever the seat anchor changes; never runs per frame.
   */
  private solveSeatedPose(): void {
    const c = this.config;
    const hips = this.slots[HIPS];
    const hipModelY = hips ? hips.restModelPos.y : 0;

    const thighLen = this.limbLength(THIGH_L, SHIN_L, 0.42);
    const shinLen = this.limbLength(SHIN_L, FOOT_L, 0.40);
    const upArmLen = this.limbLength(UARM_L, FARM_L, 0.28);
    const foreArmLen = this.limbLength(FARM_L, HAND_L, 0.26);

    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;   // 0 = left (+X), 1 = right

      // --- legs: hip joint -> ankle on the caster spider ---------------------------------
      const thigh = this.slots[i === 0 ? THIGH_L : THIGH_R];
      const hipJointY = thigh ? thigh.restModelPos.y : hipModelY;
      const hipDrop = (hipModelY - hipJointY) * this.modelScale;  // hip joint sits below the pelvis
      _v1.set(
        side * c.feetApart,
        -(c.pelvisAboveSeat + c.feetBelowSeat) + hipDrop,
        c.feetForward - c.pelvisForward,
      );
      if (thigh) {
        _v1.x -= (thigh.restModelPos.x - (hips ? hips.restModelPos.x : 0)) * this.modelScale;
        _v1.z -= (thigh.restModelPos.z - (hips ? hips.restModelPos.z : 0)) * this.modelScale;
      }
      // The knee breaks forward and slightly outward.
      _v2.set(side * 0.30, 0.25, 1).normalize();
      this.solveTwoBone(_v1, thighLen, shinLen, _v2, this.seatThigh[i], this.seatShin[i]);

      // --- arms: shoulder joint -> hand on the armrest -----------------------------------
      const uarm = this.slots[i === 0 ? UARM_L : UARM_R];
      _v1.set(
        side * c.handsApart,
        c.handsAboveSeat - c.pelvisAboveSeat,
        c.handsForward - c.pelvisForward,
      );
      if (uarm && hips) {
        _v1.x -= (uarm.restModelPos.x - hips.restModelPos.x) * this.modelScale;
        _v1.y -= (uarm.restModelPos.y - hips.restModelPos.y) * this.modelScale;
        _v1.z -= (uarm.restModelPos.z - hips.restModelPos.z) * this.modelScale;
      } else {
        _v1.y -= 0.45;   // no shoulder bone: assume it sits 45 cm above the pelvis
      }
      // The elbow breaks backward and outward — the way a person rests on armrests.
      _v2.set(side * 0.55, -0.25, -1).normalize();
      this.solveTwoBone(_v1, upArmLen, foreArmLen, _v2, this.seatUpArm[i], this.seatForeArm[i]);
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Where the rider's pelvis goes.
   *
   * @param seatWorldY World-space Y of the seat pan TOP. Pass NaN to derive it from `seatLocal`
   *                   (which is the normal case — the chair is rigid, so the local value is right
   *                   and cheaper). A finite value overrides the Y only; X/Z still come from
   *                   `seatLocal` through the chair transform.
   * @param seatLocal  Seat pan top centre in `rig.chairRoot`'s local frame. For ChairModel with
   *                   chairRoot = ChairParts.root that is (0, CHAIR_SEAT_TOP_Y[tier], 0.02).
   */
  setSeatAnchor(seatWorldY: number, seatLocal: THREE.Vector3): void {
    this.seatWorldY = seatWorldY;
    this.seatLocal.copy(seatLocal);
    this.solveSeatedPose();
  }

  /**
   * Start a trick. `duration` is in MILLISECONDS to match TrickRegistry.duration; <= 0 means the
   * trick is sustained (grabs, grinds, manuals) and runs until released — which happens
   * automatically when PoseInput.trickId clears, when a grab's button comes up, or when another
   * trick starts.
   */
  playTrick(trickId: string, kind: string, duration: number): void {
    if (this.disposed) return;
    const s = TRICK_SIGS.get(trickId) ?? KIND_FALLBACK.get(kind) ?? KIND_FALLBACK.get('flip')!;
    const def = TrickRegistry.get(trickId);
    let ms = duration;
    if (!Number.isFinite(ms)) ms = def ? def.duration : 400;
    const sustained = ms <= 0;
    this.lastAutoId = trickId;
    this.active = {
      id: trickId,
      sig: s,
      sustained,
      duration: sustained ? 0 : ms / 1000,
      t: 0,
      release: 1,
      releasing: false,
    };
    if (s.clip) this.setBaseClip(s.clip, 0.08);
  }

  /** Begin the release ramp on the current trick (harmless if nothing is running). */
  releaseTrick(): void {
    if (this.active && !this.active.releasing) this.active.releasing = true;
  }

  /** Which trick the animator currently believes it is playing. */
  getActiveTrickId(): string | null {
    return this.active && this.active.release > 0.02 ? this.active.id : null;
  }

  /** Diagnostics: which rig bone got bound to which slot. Empty values mean "not found". */
  getBoundBones(): Record<string, string> {
    const out: Record<string, string> = {};
    for (let s = 0; s < SLOT_COUNT; s++) out[SLOT_NAMES[s]] = this.slots[s]?.bone.name ?? '';
    return out;
  }

  /**
   * Drive the rig for this frame.
   *
   * Call it AFTER the chair's transform has been written for the frame, and (if you handed us
   * your own mixer) after you have advanced that mixer. If TrickAnimator owns the mixer it
   * advances it here.
   */
  update(dt: number, p: PoseInput): void {
    if (this.disposed) return;
    const d = dt > 0 ? Math.min(dt, 0.1) : 0;

    this.updateDrivers(d, p);
    this.syncTrick(d, p);
    this.updateBaseClip(p);
    if (this.ownsMixer) this.mixer.update(d);

    if (this.order.length === 0) { this.placeModel(); return; }

    this.resetPose();
    this.poseSeatedBase(p);
    this.poseLayers(p);
    this.poseTrick();
    this.writeBones();
    this.placeModel();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const a of this.actions.values()) a.stop();
    this.actions.clear();
    if (this.ownsMixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.rig.model as THREE.Object3D);
    }
    // Leave the rig on its rest pose rather than on a half-finished trick.
    for (const e of this.order) {
      e.bone.quaternion.copy(e.restLocalQuat);
      e.bone.position.copy(e.restLocalPos);
    }
    this.order.length = 0;
    this.slots.fill(null);
    this.clipByName.clear();
    this.active = null;
  }

  // -------------------------------------------------------------------------
  // Drivers
  // -------------------------------------------------------------------------

  /** Frame-rate independent exponential smoothing: tau is the time constant in seconds. */
  private static approach(cur: number, target: number, dt: number, tau: number): number {
    if (dt <= 0) return cur;
    const a = 1 - Math.exp(-dt / Math.max(1e-4, tau));
    return cur + (target - cur) * a;
  }

  private updateDrivers(dt: number, p: PoseInput): void {
    const A = TrickAnimator.approach;
    this.turnSm = A(this.turnSm, Math.max(-1, Math.min(1, p.turn)), dt, 0.10);
    this.speedSm = A(this.speedSm, Math.max(0, p.speed), dt, 0.20);
    this.pitchSm = A(this.pitchSm, p.pitchDeg, dt, 0.12);
    this.rollSm = A(this.rollSm, p.rollDeg, dt, 0.12);
    this.grabSm = A(this.grabSm, p.grabHeld ? 1 : 0, dt, 0.07);
    this.bailSm = A(this.bailSm, p.bailing ? 1 : 0, dt, p.bailing ? 0.05 : 0.25);
    this.airSm = A(this.airSm, p.grounded ? 0 : 1, dt, 0.06);
    this.pushSm = A(this.pushSm, p.pushing ? 1 : 0, dt, p.pushing ? 0.05 : 0.16);

    // Balance: accept both the 0..1 HUD convention and a signed -1..1 one.
    const b = p.balance;
    const signed = (b < -0.001) ? Math.max(-1, b) : (b > 1.001 ? 1 : (b - 0.5) * 2);
    this.balSm = A(this.balSm, Math.max(-1, Math.min(1, signed)), dt, 0.05);

    if (p.pushing) this.pushPhase = (this.pushPhase + dt / Math.max(0.1, this.config.pushCycle)) % 1;
    else this.pushPhase = this.pushSm > 0.02 ? (this.pushPhase + dt / this.config.pushCycle) % 1 : 0;

    // Landing compression: a short squash the frame the wheels come back down.
    if (p.grounded && !this.wasGrounded) this.landPop = 1;
    this.wasGrounded = p.grounded;
    this.landPop = Math.max(0, this.landPop - dt / 0.28);
  }

  /**
   * Keep `active` in step with PoseInput so the integrator only has to set trickId.
   *
   * A trick auto-starts on the EDGE of trickId changing, never on its level. Holding the same id
   * across frames therefore plays the trick exactly once — the animation half of the "held flip
   * re-fires every 200 ms for free multiplier" bug does not get to happen here. Call playTrick()
   * directly if you genuinely want the same trick twice in a row with no gap.
   */
  private syncTrick(dt: number, p: PoseInput): void {
    if (!p.trickId) this.lastAutoId = null;
    else if (p.trickId !== this.lastAutoId) {
      const def = TrickRegistry.get(p.trickId);
      const kind = p.trickKind ?? (def ? def.type : 'flip');
      this.playTrick(p.trickId, kind, def ? def.duration : (kind === 'flip' || kind === 'special' ? 400 : 0));
      return;
    }
    const a = this.active;
    if (!a) return;

    a.t += dt;
    if (a.sustained) {
      const shouldRelease =
        !p.trickId ||
        (p.trickKind === 'grab' && !p.grabHeld) ||
        (TrickRegistry.get(a.id)?.type === 'grab' && !p.grabHeld) ||
        p.bailing;
      if (shouldRelease) a.releasing = true;
    } else if (a.t >= a.duration) {
      a.releasing = true;
    }

    if (a.releasing) {
      a.release = Math.max(0, a.release - dt / 0.20);
      if (a.release <= 0) this.active = null;
    }
  }

  // -------------------------------------------------------------------------
  // Baked clip layer
  // -------------------------------------------------------------------------

  private findClip(name: string): THREE.AnimationClip | null {
    const c = this.clipByName.get(name.toLowerCase());
    return c ?? null;
  }

  private setBaseClip(name: string, fade: number): void {
    if (this.baseClip === name) return;
    const clip = this.findClip(name);
    if (!clip) return;
    let action = this.actions.get(name);
    if (!action) {
      action = this.mixer.clipAction(clip);
      this.actions.set(name, action);
    }
    const prev = this.baseClip ? this.actions.get(this.baseClip) : undefined;
    if (prev) prev.fadeOut(fade);

    const once = name === 'crash' || name === 'trick' || name === 'jump';
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    action.reset();
    action.setEffectiveWeight(1);
    action.fadeIn(fade);
    action.play();
    this.baseClip = name;
  }

  /**
   * Pick the baked clip that best matches the situation. It is only ever a substrate: the
   * procedural layer sits on top of it at the weights the pose asked for.
   */
  private updateBaseClip(p: PoseInput): void {
    if (this.clipByName.size === 0) return;
    let want: string;
    if (p.bailing) want = 'crash';
    else if (this.active && this.active.sig.clip && !this.active.releasing) want = this.active.sig.clip;
    else if (!p.grounded) want = 'jump';
    else if (p.pushing) want = 'push';
    else if (this.speedSm < 0.4) want = 'idle';
    else want = 'rolling';

    if (!this.findClip(want)) {
      // Graceful degradation down the list of clips this rig actually shipped with.
      const fallbacks = want === 'crash' ? ['fall', 'crash', 'rolling', 'idle']
        : want === 'jump' ? ['jump', 'rolling', 'idle']
        : want === 'push' ? ['push', 'rolling', 'idle']
        : want === 'idle' ? ['idle', 'rolling']
        : ['rolling', 'idle'];
      let found: string | null = null;
      for (const f of fallbacks) if (this.findClip(f)) { found = f; break; }
      if (!found) {
        const first = this.clipByName.keys().next();
        if (first.done) return;
        found = first.value;
      }
      want = found;
    }
    this.setBaseClip(want, this.config.clipFade);
  }

  // -------------------------------------------------------------------------
  // Pose assembly
  // -------------------------------------------------------------------------

  private resetPose(): void {
    this.aX.fill(0); this.aY.fill(0); this.aZ.fill(0);
    this.dX.fill(0); this.dY.fill(0); this.dZ.fill(0);
    this.dW.fill(0);
    for (let i = 0; i < SLOT_COUNT; i++) this.wt[i] = BASE_WEIGHT[i];
    this.hipOff.set(0, 0, 0);
  }

  private setDir(slot: number, x: number, y: number, z: number, k: number): void {
    this.dX[slot] = x; this.dY[slot] = y; this.dZ[slot] = z; this.dW[slot] = k;
  }

  /** Blend an authored direction into whatever is already targeted for this slot. */
  private blendDir(slot: number, x: number, y: number, z: number, k: number): void {
    if (k <= 0) return;
    if (this.dW[slot] <= 0) { this.setDir(slot, x, y, z, k); return; }
    const t = Math.min(1, k);
    this.dX[slot] += (x - this.dX[slot]) * t;
    this.dY[slot] += (y - this.dY[slot]) * t;
    this.dZ[slot] += (z - this.dZ[slot]) * t;
    if (k > this.dW[slot]) this.dW[slot] = k;
  }

  private addRot(slot: number, x: number, y: number, z: number): void {
    this.aX[slot] += x; this.aY[slot] += y; this.aZ[slot] += z;
  }

  private addGroup(group: number[], x: number, y: number, z: number): void {
    for (let i = 0; i < group.length; i++) {
      const s = group[i];
      this.aX[s] += x; this.aY[s] += y; this.aZ[s] += z;
    }
  }

  private raiseWeight(slot: number, w: number): void {
    if (w > this.wt[slot]) this.wt[slot] = w;
  }

  /**
   * The seated base. Pelvis on the pan, thighs forward and a little apart, knees ~90 degrees,
   * shins down onto the caster spider, spine upright with a lean that grows with speed, hands
   * forward and down on the armrests. Everything else in this file is a modifier on this.
   */
  private poseSeatedBase(p: PoseInput): void {
    const leanF = Math.min(1, this.speedSm / 14);
    const lean = 0.10 + 0.24 * leanF;

    this.setDir(HIPS, 0, 1, -0.10, 1);                          // pelvis rocked back into the pan
    this.setDir(SPINE, 0, 1, lean, 1);
    this.setDir(CHEST, 0, 1, lean * 0.55, 1);
    this.setDir(UPCHEST, 0, 1, lean * 0.35, 1);
    this.setDir(NECK, 0, 1, -0.05 - 0.10 * leanF, 1);           // head stays level over the lean
    this.addRot(HEAD, -0.05 - 0.12 * leanF, 0, 0);

    for (let i = 0; i < 2; i++) {
      const th = i === 0 ? THIGH_L : THIGH_R;
      const sh = i === 0 ? SHIN_L : SHIN_R;
      const ft = i === 0 ? FOOT_L : FOOT_R;
      const to = i === 0 ? TOE_L : TOE_R;
      const ua = i === 0 ? UARM_L : UARM_R;
      const fa = i === 0 ? FARM_L : FARM_R;
      const hd = i === 0 ? HAND_L : HAND_R;
      const so = i === 0 ? SHO_L : SHO_R;
      const side = i === 0 ? 1 : -1;

      this.setDir(th, this.seatThigh[i].x, this.seatThigh[i].y, this.seatThigh[i].z, 1);
      this.setDir(sh, this.seatShin[i].x, this.seatShin[i].y, this.seatShin[i].z, 1);
      this.setDir(ft, side * 0.04, -0.22, 0.975, 1);            // soles flat on the spoke
      this.addRot(to, 0.10, 0, 0);

      this.setDir(ua, this.seatUpArm[i].x, this.seatUpArm[i].y, this.seatUpArm[i].z, 1);
      this.setDir(fa, this.seatForeArm[i].x, this.seatForeArm[i].y, this.seatForeArm[i].z, 1);
      this.addRot(hd, 0.28, 0, -side * 0.10);                   // palms down on the pads
      this.addRot(so, 0, side * 0.04, -side * 0.05);            // shoulders settle
    }

    // Riding posture: a touch more forward the faster he goes, and a bounce on landing.
    this.addGroup(G_TORSO, 0.06 * leanF, 0, 0);
    if (this.landPop > 0) {
      const k = this.landPop * this.landPop;
      this.addGroup(G_TORSO, 0.22 * k, 0, 0);
      this.addGroup(G_ARMS, 0.18 * k, 0, 0);
      this.hipOff.y -= 0.035 * k;
      if (!p.grounded) this.landPop = 0;
    }
  }

  /** Everything additive that is not a named trick. */
  private poseLayers(p: PoseInput): void {
    const turn = this.turnSm;
    const air = this.airSm;

    // --- lean into the turn: the whole rider banks, the head leads ----------------------
    if (Math.abs(turn) > 0.001) {
      const bank = turn * 0.30 * Math.min(1, 0.35 + this.speedSm / 12);
      this.addGroup(G_ALL, 0, 0, bank);
      this.addGroup(G_TORSO, 0, -turn * 0.16, -bank * 0.35);
      this.addRot(HEAD, 0, -turn * 0.34, -bank * 0.4);
      this.hipOff.x += turn * 0.02;
    }

    // --- absorb the chair's own tilt: the upper body stays more upright than the chair ---
    const pitchR = this.pitchSm * Math.PI / 180;
    const rollR = this.rollSm * Math.PI / 180;
    if (Math.abs(pitchR) > 0.002 || Math.abs(rollR) > 0.002) {
      this.addGroup(G_UPPER, -pitchR * 0.40, 0, rollR * 0.40);
      this.addGroup(G_LEGS, -pitchR * 0.15, 0, rollR * 0.15);
      this.addRot(HEAD, -pitchR * 0.30, 0, rollR * 0.30);
    }

    // --- air: tuck the knees, hands come up. Extend again as the airtime runs long -------
    if (air > 0.01) {
      const t = Math.min(1, p.airTime / 0.20);
      const settle = 1 - Math.min(0.55, Math.max(0, (p.airTime - 0.55)) * 0.6);
      const k = air * smoothstep(t) * settle;
      for (let i = 0; i < 2; i++) {
        const th = i === 0 ? THIGH_L : THIGH_R;
        const sh = i === 0 ? SHIN_L : SHIN_R;
        const side = i === 0 ? 1 : -1;
        this.blendDir(th, side * 0.26, 0.34, 0.90, 0.75 * k);
        this.blendDir(sh, side * 0.06, -0.62, -0.78, 0.75 * k);
      }
      this.addGroup(G_TORSO, 0.18 * k, 0, 0);
      this.addGroup(G_ARMS, 0.10 * k, 0, -0.22 * k);
      this.hipOff.y += 0.02 * k;
    }

    // --- generic grab reach when a grab is held with no named trick ----------------------
    if (this.grabSm > 0.02 && !this.active) {
      const k = this.grabSm;
      this.blendDir(UARM_R, -0.30, -0.86, 0.42, k);
      this.blendDir(FARM_R, -0.34, -0.70, 0.63, k);
      this.raiseWeight(UARM_R, 0.9 * k); this.raiseWeight(FARM_R, 0.9 * k);
    }

    // --- balance: arms out and windmilling on the manual / grind axis --------------------
    const bal = this.balSm;
    const balancing = p.trickKind === 'manual' || p.trickKind === 'grind';
    if (balancing || Math.abs(bal) > 0.06) {
      const amp = (balancing ? 0.45 : 0) + Math.min(0.55, Math.abs(bal) * 0.9);
      if (amp > 0.02) {
        for (let i = 0; i < 2; i++) {
          const ua = i === 0 ? UARM_L : UARM_R;
          const fa = i === 0 ? FARM_L : FARM_R;
          const side = i === 0 ? 1 : -1;
          this.blendDir(ua, side * 0.92, 0.28, 0.26, amp * 0.85);
          this.blendDir(fa, side * 0.84, 0.44, 0.30, amp * 0.7);
          this.raiseWeight(ua, 0.9 * amp); this.raiseWeight(fa, 0.9 * amp);
        }
        // Countering a roll means both arms swing the SAME way, not mirrored.
        const wind = -bal * 0.85 * (balancing ? 1 : 0.6);
        this.addGroup(G_ARM_L, 0, 0, wind);
        this.addGroup(G_ARM_R, 0, 0, wind);
        this.addGroup(G_TORSO, 0, 0, -bal * 0.16);
        this.addRot(HEAD, 0, bal * 0.20, 0);
      }
    }

    // --- push-off kick: the foot leaves the spider, reaches back, drives, returns --------
    if (this.pushSm > 0.02) {
      const ph = this.pushPhase;
      const k = this.pushSm;
      const side = this.config.pushFoot;         // +1 right, -1 left
      const th = side > 0 ? THIGH_R : THIGH_L;
      const sh = side > 0 ? SHIN_R : SHIN_L;
      const ft = side > 0 ? FOOT_R : FOOT_L;
      // reach (0 .. .35) -> plant & drive (.35 .. .7) -> recover (.7 .. 1)
      const reach = smoothstep(ph / 0.35) * (1 - smoothstep((ph - 0.35) / 0.35));
      const drive = smoothstep((ph - 0.35) / 0.35) * (1 - smoothstep((ph - 0.70) / 0.30));
      const s = side > 0 ? -1 : 1;               // model-space X sign of that foot
      this.blendDir(th, s * 0.22, -0.28, 0.93, 0.9 * k * reach);
      this.blendDir(sh, s * 0.16, -0.96, 0.22, 0.9 * k * reach);
      this.blendDir(th, s * 0.18, -0.52, -0.83, 0.9 * k * drive);
      this.blendDir(sh, s * 0.10, -0.90, -0.42, 0.9 * k * drive);
      this.addRot(ft, -0.35 * reach + 0.30 * drive, 0, 0);
      this.raiseWeight(th, 1.0 * k); this.raiseWeight(sh, 1.0 * k); this.raiseWeight(ft, 0.95 * k);
      // The body works with the leg: fold forward on the reach, rise on the drive.
      this.addGroup(G_TORSO, (0.26 * reach - 0.10 * drive) * k, -s * 0.10 * k * drive, 0);
      this.addGroup(G_ARMS, -0.20 * k * drive, 0, 0.12 * k * reach);
      this.hipOff.y += (-0.03 * reach + 0.02 * drive) * k;
    }

    // --- bail: forget everything, sprawl -----------------------------------------------
    if (this.bailSm > 0.01) {
      const k = this.bailSm;
      for (let i = 0; i < 2; i++) {
        const ua = i === 0 ? UARM_L : UARM_R;
        const fa = i === 0 ? FARM_L : FARM_R;
        const th = i === 0 ? THIGH_L : THIGH_R;
        const sh = i === 0 ? SHIN_L : SHIN_R;
        const side = i === 0 ? 1 : -1;
        this.blendDir(ua, side * 0.72, 0.58, -0.38, k);          // arms flung up and back
        this.blendDir(fa, side * 0.55, 0.76, -0.34, k);
        this.blendDir(th, side * 0.60, 0.28, 0.75, k);           // legs splayed
        this.blendDir(sh, side * 0.42, -0.42, 0.80, k);
        this.raiseWeight(ua, k); this.raiseWeight(fa, k);
        this.raiseWeight(th, k); this.raiseWeight(sh, k);
      }
      this.addGroup(G_TORSO, -0.45 * k, 0.25 * k, 0.30 * k);
      this.addRot(HEAD, -0.40 * k, 0.30 * k, 0);
      this.raiseWeight(HEAD, 0.9 * k); this.raiseWeight(SPINE, k); this.raiseWeight(CHEST, k);
      this.hipOff.y -= 0.05 * k;
      this.hipOff.z -= 0.04 * k;
    }
  }

  /** The named trick signature, evaluated at its current envelope value. */
  private poseTrick(): void {
    const a = this.active;
    if (!a || a.release <= 0) return;

    // Sustained tricks ease in and hold; timed tricks follow their authored envelope.
    const gate = a.sustained
      ? smoothstep(a.t / 0.16) * a.release
      : a.release;

    const ops = a.sig.ops;
    for (let i = 0; i < ops.length; i++) {
      const o = ops[i];
      const env = (a.sustained ? 1 : envelope(o.e, a.duration > 0 ? a.t / a.duration : 1)) * gate;
      if (env <= 0.001) continue;
      if (o.x !== 0 || o.y !== 0 || o.z !== 0) this.addRot(o.s, o.x * env, o.y * env, o.z * env);
      if (o.k > 0) this.blendDir(o.s, o.dx, o.dy, o.dz, o.k * env);
      if (o.w > 0) this.raiseWeight(o.s, o.w * env);
    }

    const envBody = a.sustained ? gate : gate * (a.duration > 0 ? envelope(E_HOLD, a.t / a.duration) : 0);
    if (a.sig.spin !== 0) this.addGroup(G_ALL, 0, a.sig.spin * envBody, 0);
    this.hipOff.x += a.sig.hx * envBody;
    this.hipOff.y += a.sig.hy * envBody;
    this.hipOff.z += a.sig.hz * envBody;
  }

  // -------------------------------------------------------------------------
  // Write-out
  // -------------------------------------------------------------------------

  /** Accumulate the model-space rotation of everything above this bone. */
  private parentModelQuat(e: BoneEntry, out: THREE.Quaternion): void {
    out.identity();
    const chain = e.chain;
    for (let i = 0; i < chain.length; i++) out.multiply(chain[i].quaternion);
  }

  private writeBones(): void {
    const s = this.config.rigForward;
    const authority = Math.max(0, Math.min(1, this.config.authority));

    for (let i = 0; i < this.order.length; i++) {
      const e = this.order[i];
      const slot = e.slot;
      const w = this.wt[slot] * authority;
      if (w <= 0.002) continue;

      // 1. direction delta (absolute aim, in model space)
      let hasDelta = false;
      _q1.identity();
      const k = this.dW[slot];
      if (k > 0.001 && e.restDir) {
        _dir.set(this.dX[slot] * s, this.dY[slot], this.dZ[slot] * s);
        if (_dir.lengthSq() > 1e-8) {
          _dir.normalize();
          _q2.setFromUnitVectors(e.restDir, _dir);
          if (k >= 0.999) _q1.copy(_q2);
          else _q1.identity().slerp(_q2, k);
          hasDelta = true;
        }
      }

      // 2. additive rotation (also model space)
      const ax = this.aX[slot], ay = this.aY[slot], az = this.aZ[slot];
      if (ax !== 0 || ay !== 0 || az !== 0) {
        _euler.set(ax * s, ay, az * s, 'YXZ');
        _q3.setFromEuler(_euler);
        if (hasDelta) _q1.premultiply(_q3); else _q1.copy(_q3);
        hasDelta = true;
      }
      if (!hasDelta) continue;

      // 3. model-space target -> bone local -> blend against whatever the clip produced
      _qTarget.copy(_q1).multiply(e.restModelQuat);
      this.parentModelQuat(e, _qParent);
      _qLocal.copy(_qParent).invert().multiply(_qTarget);
      if (w >= 0.999) e.bone.quaternion.copy(_qLocal);
      else e.bone.quaternion.slerp(_qLocal, w);
    }

    // Hips translation. This is where FBX root motion lives, so we always take it: the clip's
    // hip travel is replaced by rest + our own authored offset, in metres.
    const hips = this.slots[HIPS];
    if (hips) {
      _v1.set(this.hipOff.x * s, this.hipOff.y, this.hipOff.z * s).divideScalar(this.modelScale);
      this.parentModelQuat(hips, _qParent);
      _v1.applyQuaternion(_qParent.invert());
      _v2.copy(hips.restLocalPos).add(_v1);
      if (authority >= 0.999) hips.bone.position.copy(_v2);
      else hips.bone.position.lerp(_v2, authority);
    }
  }

  /**
   * Put the character root where the pelvis ends up ON the seat, and face it the way the chair
   * faces. This is what replaces the old "shove the standing rig down 0.46 m" hack.
   */
  private placeModel(): void {
    const model = this.rig.model;
    const parent = model.parent;
    const chair = this.rig.chairRoot;
    if (!parent) return;

    chair.updateWorldMatrix(true, false);
    parent.updateWorldMatrix(true, false);

    // Seat anchor -> world.
    _v1.copy(this.seatLocal).applyMatrix4(chair.matrixWorld);
    if (Number.isFinite(this.seatWorldY)) _v1.y = this.seatWorldY;

    // Pelvis offset from the anchor, in the chair's frame.
    const s = this.config.rigForward;
    chair.getWorldQuaternion(_qWorld);
    _v2.set(this.config.pelvisLateral * s, this.config.pelvisAboveSeat, this.config.pelvisForward * s);
    _v2.applyQuaternion(_qWorld);
    _v1.add(_v2);

    // Drop by the rig's own hip height so the HIPS, not the origin, land on the seat.
    _v1.y -= this.hipHeight;
    parent.worldToLocal(_v1);
    model.position.copy(_v1);

    // Facing: the chair's yaw plus whatever the rig needs to agree with it.
    _euler.set(0, this.config.modelYaw + (s < 0 ? Math.PI : 0), 0, 'YXZ');
    _q1.setFromEuler(_euler);
    _qWorld.multiply(_q1);
    parent.getWorldQuaternion(_q2);
    model.quaternion.copy(_q2.invert()).multiply(_qWorld);
  }
}

// ---------------------------------------------------------------------------
// The one edit this module needs somebody else to make
// ---------------------------------------------------------------------------

/**
 * TrickAnimator cannot own the character root while PlayerModel.update() is stamping over it.
 * This constant is the exact, minimal edit the integration pass must apply to
 * src/player/PlayerModel.ts. It is a string rather than code because this module is not allowed
 * to edit that file; print it, paste it, or diff against it.
 */
export const REQUIRED_PLAYERMODEL_PATCH: string = `
================================================================================
REQUIRED PATCH — src/player/PlayerModel.ts   (3 edits, all inside that one file)
================================================================================

WHY
  1) PlayerModel.update() resets model.position and model.rotation to fixed values EVERY frame
     (lines 486-490). That is a blunt fix for FBX root-motion drift, and it makes it impossible
     for anything else to place or orient the rider. TrickAnimator kills root motion properly, at
     the source, by pinning the HIPS BONE's local translation to its rest value plus an authored
     offset — so the reset is now both unnecessary and harmful.
  2) TrickAnimator needs the mixer and the loaded clips. Sharing PlayerModel's mixer avoids two
     mixers fighting over the same skeleton.

--------------------------------------------------------------------------------
EDIT 1 of 3 — remove the transform reset in update()
--------------------------------------------------------------------------------
REPLACE (PlayerModel.ts, in update(deltaTime: number)):

    update(deltaTime: number): void {
      if (this.mixer) {
        this.mixer.update(deltaTime);
      }

      // Reset position and rotation after animation update to prevent root motion drift
      if (this.model) {
        this.model.position.copy(this.localPosition);
        this.model.rotation.set(0, 0, 0);  // Keep facing forward
      }
    }

WITH:

    update(deltaTime: number): void {
      if (this.mixer) {
        this.mixer.update(deltaTime);
      }

      // The character root is owned by TrickAnimator, which places the rider on the chair seat
      // and cancels root motion at the hips bone. Only fall back to the old clamp when no
      // animator is attached (e.g. the model viewer / debug anim lock).
      if (this.model && !this.externalRootControl) {
        this.model.position.copy(this.localPosition);
        this.model.rotation.set(0, 0, 0);
      }
    }

AND ADD, next to the other private fields (near \`private localPosition\`):

    /** Set true once a TrickAnimator is driving this rig's root transform. */
    externalRootControl = false;

--------------------------------------------------------------------------------
EDIT 2 of 3 — expose the mixer and the clips
--------------------------------------------------------------------------------
ADD two methods to PlayerModel (anywhere in the class body):

    /** The mixer that owns this rig. Null until load() resolves. */
    getMixer(): THREE.AnimationMixer | null {
      return this.mixer;
    }

    /** Logical animation name -> clip, for systems that drive playback themselves. */
    getClipMap(): Map<string, THREE.AnimationClip> {
      const out = new Map<string, THREE.AnimationClip>();
      this.animations.forEach((a, name) => out.set(name, a.clip));
      return out;
    }

--------------------------------------------------------------------------------
EDIT 3 of 3 — stop fighting over the same skeleton
--------------------------------------------------------------------------------
Once TrickAnimator is attached, PlayerModel.play() / playOnce() must no longer be called from
Game.updatePlayerAnimation(): TrickAnimator chooses the base clip itself from PoseInput. Either
delete those call sites during integration, or guard them:

    play(name: AnimationName, options?: { loop?: boolean; fadeTime?: number }): void {
      if (this.externalRootControl) return;   // TrickAnimator owns clip selection
      ...existing body...
    }

NOTHING ELSE IN PlayerModel.ts NEEDS TO CHANGE. In particular do NOT delete \`localPosition\` or
setLocalPosition() — the standing/unmounted states and the debug viewer still use them.
================================================================================
`;
