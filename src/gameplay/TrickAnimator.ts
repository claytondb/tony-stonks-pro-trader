/**
 * TrickAnimator — the KICK-PUSH riding pose and the per-trick motion driver for Tony Stonks.
 *
 * THE POSE, VERBATIM FROM THE OWNER
 *   "the player should face forward and push the office chair with one knee on it and the other
 *    leg pushing it, with both hands on the top of the chair back."
 *
 *   That is the kick-scooter stance, and it is how people actually ride an office chair: one knee
 *   planted on the seat pan, the other leg down kicking off the floor, torso upright and facing
 *   the way the chair is going, BOTH hands wrapped over the top edge of the backrest. The rider
 *   is NOT sitting in the chair. He never was meant to be.
 *
 *   Consequence worth stating out loud, because it decides the whole forward convention:
 *
 *     ChairModel's header says the chair FACES -Z — backrest at +Z, seat nose at -Z. But the pose
 *     puts the rider on the seat with both hands over the backrest's top edge, so the backrest is
 *     in FRONT of him and it is his handlebar. There is no arrangement of a man kneeling on a seat
 *     gripping its backrest in which he faces away from that backrest. Therefore THE CHAIR TRAVELS
 *     BACKREST-FIRST: the direction of travel is the chair's +Z, and the rider's facing (+Z in
 *     model space) is aligned with it. He faces the way he is going, as specified.
 *
 *   THE CONVENTION IS SETTLED AND MEASURED, not assumed — the first of the three failed attempts
 *   at this pose burned its whole run rediscovering it. As wired today:
 *     - Game.ts derives the chair's heading as `atan2(f.x, f.z)` with `f = (0,0,1)` rotated by the
 *       body, so the CHAIR GROUP'S LOCAL +Z IS THE DIRECTION OF TRAVEL, and ChairModel's root is
 *       added to it unrotated. The backrest therefore already leads. NO extra 180 deg yaw is
 *       applied anywhere, and none is needed; `config.modelYaw` stays 0.
 *     - StonksCharacter's geometry faces -Z (its own header says so), so `autoFacing` measures
 *       `rigForward = -1` off the shoe and placeModel yaws the character root by PI. That is the
 *       ONLY 180 deg rotation in the chain. Verify with tools/posepreview/ingame.mjs: the model
 *       root's quaternion should read (0, 1, 0, 0) and the rider's face should lead.
 *     - a chase camera behind the direction of travel is behind the RIDER, so he partly occludes
 *       the chair. Both legs still read from there: the working leg drops to the floor on one
 *       side and the planted shoe hangs in the air off the seat's other rear corner.
 *
 * WHY THIS EXISTS
 *   The build shipped TWO baked clips ('trick' and 'chairhold') covering every trick in the
 *   registry, picked by raw button rather than by trick, and no riding pose at all: a standing rig
 *   was shoved down 0.46 m so the hips happened to land near the seat. Every trick looked the
 *   same, and the man was not riding the chair — he was standing inside it.
 *
 *   This module fixes both. It builds the kick-push pose procedurally out of the rig's own bones —
 *   the knee solved onto ChairModel's real seat pan, the hands solved onto ChairModel's real
 *   backrest top edge with two-bone IK, the push foot solved onto the real floor plane, so it is
 *   correct for any rig proportions and any chair tier — then layers additive motion on top of it:
 *   the push cycle itself, lean into turns, tuck in the air, reach on grabs, arms out on the
 *   balance axis, sprawl on a bail — and one distinct pose signature for every trick id in
 *   TrickRegistry.
 *
 * HOW THE POSE MATHS WORKS (read this before changing numbers)
 *   Every authored value is expressed in MODEL SPACE (the character root's frame): +Y up,
 *   +Z the direction the rider faces (and, per the note above, the direction of travel and the
 *   side the backrest is on), +X the rider's LEFT (the Mixamo convention these FBX rigs use).
 *   For each tracked bone we cache, at bind time:
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

/**
 * Height of the GRIP LINE on the backrest — the top edge the rider's hands wrap over — above the
 * chair root's origin (which is on the floor, at the caster contact patch). Per ChairModel tier.
 *
 * Derived from ChairModel, not guessed: the backrest group hangs off the seat at
 * (0, seatY + seatT/2, seatD/2 - 0.015) with rotation.x = backTilt, and the panel runs from
 * y = lumbarGap to lumbarGap + backH in that tilted frame. The grip point is the rolled top lip
 * (tiers 0/1) or the top rail of the mesh frame (tiers 2/3), pushed through the tilt:
 *
 *   tier 0: (0.115+0.210+0.012, -0.010) tilt 0.10 about (0, 0.475, 0.185)   -> y 0.811  z 0.209
 *   tier 1: (0.100+0.315+0.012, -0.010) tilt 0.13 about (0, 0.5075, 0.205)  -> y 0.932  z 0.250
 *   tier 2: (0.095+0.400-0.008, +0.006) tilt 0.15 about (0, 0.5275, 0.215)  -> y 1.008  z 0.294
 *   tier 3: (0.090+0.430-0.008, +0.006) tilt 0.17 about (0, 0.5475, 0.225)  -> y 1.051  z 0.318
 */
export const CHAIR_BACK_TOP_Y: readonly number[] = [0.811, 0.932, 1.008, 1.051];
/** Z of the same grip line in the chair root's frame. ChairModel puts the backrest at +Z. */
export const CHAIR_BACK_TOP_Z: readonly number[] = [0.209, 0.250, 0.294, 0.318];
/** Half the usable grip width on the backrest top rail, per tier (backW/2 - 50 mm). */
export const CHAIR_BACK_GRIP_HALF_W: readonly number[] = [0.130, 0.152, 0.168, 0.180];

/**
 * How far forward the planted KNEE JOINT may go along the pan before the shin's flesh starts
 * intersecting the backrest, in the chair root's frame. THIS IS THE NUMBER THAT DECIDES WHERE
 * THE WHOLE RIDER SITS, so it is measured off the built chair rather than guessed.
 *
 * ChairModel hangs the backrest group at z = seatD/2 - 0.015 and the panel's own seat-facing
 * face lands ~55 mm in front of that. Measured on a built tier-1 chair, `ChairParts.back`'s
 * bounding box starts at z = 0.149. Subtract a 75 mm knee radius:
 *
 *   tier 0: back face 0.133 -> 0.058     tier 2: back face 0.157 -> 0.082
 *   tier 1: back face 0.149 -> 0.074     tier 3: back face 0.165 -> 0.090
 *
 * The knee is the FORWARD-most part of the rider that is anchored to the chair, so this cap is
 * also what fixes the pelvis's depth (solveStance), which in turn fixes how far the shoulders
 * are from the rail, which is what the riding lean is then solved against.
 */
export const CHAIR_KNEE_MAX_Z: readonly number[] = [0.058, 0.074, 0.082, 0.090];

/**
 * Which knee is planted on the seat.
 *   regular — LEFT knee on the pan, RIGHT leg kicks the floor (the default, and what most
 *             right-footed people do).
 *   goofy   — mirrored.
 * Every trick signature in this file is authored for `regular` and mirrored at evaluation time.
 */
export type RideStance = 'regular' | 'goofy';

/** Everything you might want to retune without touching the pose code. Mutate freely at runtime. */
export interface AnimatorConfig {
  /**
   * +1 if the rig faces +Z in its own space (Mixamo default), -1 if it faces -Z (which is what
   * both ChairModel and StonksCharacter use). Measured off the rig at bind time unless
   * `autoFacing` is false — get this wrong and the rider rides backwards, hands flailing behind
   * him, which is the single most expensive mistake available in this file.
   */
  rigForward: 1 | -1;
  /** Measure `rigForward` from the rig's own feet at bind time instead of trusting the default. */
  autoFacing: boolean;
  /** Extra yaw applied to the model root, radians. Use to line the rider up with chair forward. */
  modelYaw: number;
  /** Which knee is planted on the seat pan. */
  stance: RideStance;

  /** Pelvis height above the seat pan top, metres. Drives the whole kneel. */
  pelvisAboveSeat: number;
  /** Pelvis offset along the rider's facing from the seat anchor, metres (negative = sits back). */
  pelvisForward: number;
  /** Pelvis lateral offset, metres. */
  pelvisLateral: number;
  /**
   * SOLVE `pelvisForward`, `kneeForward` and `leanBase`, and clamp `pelvisAboveSeat`, from the
   * rig's real bone lengths and the chair's real geometry instead of trusting authored numbers.
   *
   * The planted thigh is an AIM, not a position solve: the knee always lands one thigh-length
   * from the hip joint, so the pelvis has exactly one Z that puts the knee on the spot we asked
   * for. Authoring that Z by hand is only correct for one rig and one chair tier; get it wrong
   * and the knee walks off the front of the cushion or buries itself in the backrest. Solving
   * it makes the kneel exact on all four tiers and on any rig proportions.
   */
  autoPelvis: boolean;

  /**
   * Radius of the shin's flesh, metres. The knee JOINT is a centreline, so a shin resting ON the
   * pan has its joint this far ABOVE the pan top, not on it. Without this the leg is solved into
   * the cushion and the knee disappears inside the seat — which is exactly what "the knee must
   * rest on the seat surface" is asking for.
   */
  shinRadius: number;
  /** How far the shin compresses the cushion below `shinRadius`, metres. */
  kneeSink: number;
  /** Where on the pan the knee lands, along the rider's facing, from the seat anchor. Metres. */
  kneeForward: number;
  /**
   * Hard forward limit for the knee JOINT, as a z in the chair root's frame — the point past
   * which the shin's flesh would be inside the backrest. See CHAIR_KNEE_MAX_Z. `solveStance`
   * drives the knee up against this and then hangs the pelvis off it, because "knee as far up
   * the pan as it will go" is what puts the rider's body ON the chair instead of behind it.
   */
  kneeMaxForward: number;
  /** Where on the pan the knee lands, outboard of the chair's centre line. Metres. */
  kneeOutboard: number;
  /** Hard outboard limit for the knee: past this it is off the side of the cushion. Metres. */
  kneeOutboardMax: number;
  /** Downward droop of the planted shin as it trails back over the seat, 0..1. */
  shinDroop: number;
  /**
   * Angle of the planted THIGH below horizontal, radians. This is the single number that decides
   * whether the pose reads as KNEELING or as SITTING, so it is authored and everything else
   * bends around it.
   *
   * A shallow thigh puts the hip a long way behind the knee, which hangs the whole rider off the
   * back of the chair — that is what "a man standing behind a chair holding its backrest" looked
   * like, and it is what three earlier passes shipped. At 1.0 rad (57 deg) the hip sits over the
   * middle of the pan with the shin lying back underneath it, which is what a person kneeling on
   * an office chair actually looks like.
   *
   * The cost is that the pelvis is then higher than the push leg can reach the floor from; see
   * `pushDip`, which spends that difference as a weight drop on the kick instead of pretending
   * the rider has longer legs.
   */
  thighPitch: number;

  /** Grip line on the backrest, in the chair root's frame: height above the floor, metres. */
  backTopY: number;
  /** Grip line on the backrest: Z in the chair root's frame (ChairModel: backrest at +Z). */
  backTopZ: number;
  /** Half the hand spacing along the backrest top, metres. */
  handsApart: number;
  /** How far above the top edge the wrist sits when the fist wraps over it, metres. */
  gripRise: number;

  /** Ankle height above the floor when the push foot is planted (heel up, toe down), metres. */
  ankleRise: number;
  /** How far ahead of the pelvis the push foot plants, metres. */
  pushReach: number;
  /** How far behind the pelvis the push foot finishes its drive, metres. */
  pushDrive: number;
  /** Half the push foot's track width, metres. */
  pushApart: number;
  /** Peak foot lift during the recovery swing, metres. */
  pushLift: number;
  /** Seconds for one push cycle. */
  pushCycle: number;
  /** How far the coasting foot's SOLE clears the floor, metres. Keeps the shoe out of the carpet. */
  coastLift: number;
  /** How far behind the pelvis the coasting foot trails, metres. Must clear the caster ring. */
  coastTrail: number;

  /** Torso pitch at a standstill, radians. Solved from the arm reach unless `autoLean` is off. */
  leanBase: number;
  /** Extra torso pitch at `leanSpeedRef` and above, radians. */
  leanSpeed: number;
  /** Speed at which the speed lean saturates, m/s. */
  leanSpeedRef: number;
  /**
   * SOLVE `leanBase` from the real shoulder-to-rail distance instead of authoring it.
   *
   * Once the knee cap has fixed the pelvis, the only free variable left that can set the ARM
   * BEND is how far forward the torso is folded — leaning brings the shoulders toward the rail.
   * Authoring that angle by hand is only right for one chair tier and one set of rig
   * proportions: on tier 0 the rail is 120 mm lower and 40 mm nearer than on tier 1, and on
   * tier 3 it is 120 mm higher and 70 mm further. Solving it means the elbow lands at
   * `gripExtension` on all four, which is the difference between "hands gripping the backrest"
   * and either a locked-out T-rex reach or two arms folded into the chest.
   */
  autoLean: boolean;
  /**
   * Target arm extension at the base lean, as a fraction of (upper arm + forearm). 1 = locked
   * straight. 0.88 is a visibly bent elbow that still reads as a reach rather than a fold.
   */
  gripExtension: number;
  /**
   * How much more the SHOULDER rotates than `lean` says it does.
   *
   * The torso is not a rigid segment: poseRideBase pitches the hips by 0.45x lean, the spine by
   * 0.95x and the chest by 1.05x, and the shoulder hangs off the top of that chain, so the
   * offset it actually ends up at corresponds to a slightly larger rigid rotation. Measured off
   * the built rig at lean 0.68 the effective angle was 0.77. The lean solve needs this or it
   * lands the shoulders ~25 mm short every time.
   */
  leanShoulderGain: number;

  /** Used only if the rig has no findable hips bone. */
  fallbackHipHeight: number;
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

/** slot -> its opposite-side slot. Central bones map to themselves. Used for goofy stance. */
const MIRROR_SLOT: number[] = [];
for (let i = 0; i < SLOT_COUNT; i++) MIRROR_SLOT.push(i);
MIRROR_SLOT[SHO_L] = SHO_R; MIRROR_SLOT[SHO_R] = SHO_L;
MIRROR_SLOT[UARM_L] = UARM_R; MIRROR_SLOT[UARM_R] = UARM_L;
MIRROR_SLOT[FARM_L] = FARM_R; MIRROR_SLOT[FARM_R] = FARM_L;
MIRROR_SLOT[HAND_L] = HAND_R; MIRROR_SLOT[HAND_R] = HAND_L;
MIRROR_SLOT[THIGH_L] = THIGH_R; MIRROR_SLOT[THIGH_R] = THIGH_L;
MIRROR_SLOT[SHIN_L] = SHIN_R; MIRROR_SLOT[SHIN_R] = SHIN_L;
MIRROR_SLOT[FOOT_L] = FOOT_R; MIRROR_SLOT[FOOT_R] = FOOT_L;
MIRROR_SLOT[TOE_L] = TOE_R; MIRROR_SLOT[TOE_R] = TOE_L;

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
/**
 * slot -> every slot that will do as its "child", best first.
 *
 * A rig that is missing the middle of its spine (this one has hips / spine / chest / head and
 * nothing else) must still be able to say which way the chest points, and the honest answer is
 * "at the next joint that exists further up the chain" — which for this rig is the HEAD. The
 * chain has to be walked to the end rather than stopping at one fallback, because the two
 * mid-spine slots that used to be tried are both absent.
 *
 * Falling through to the geometry fallback instead is what this list is there to AVOID for the
 * torso, and the reason is a real defect it caused: `geometryOffset` walks a bone's whole
 * SUBTREE, and the arms hang off the chest, so the chest's rest direction was an average over
 * the entire upper body's meshes. Adding a wrist joint — two more small meshes on the ends of
 * two arms — swung it by 22 degrees and quietly took the head 88 mm backwards. A bone's rest
 * direction must not be a function of how many meshes its grandchildren happen to be built from.
 */
const CHILD_CHAIN: number[][] = [];
{
  const chains: Partial<Record<number, number[]>> = {
    [HIPS]: [SPINE, CHEST, UPCHEST, NECK, HEAD],
    [SPINE]: [CHEST, UPCHEST, NECK, HEAD],
    [CHEST]: [UPCHEST, NECK, HEAD],
    [UPCHEST]: [NECK, HEAD],
    [NECK]: [HEAD],
  };
  for (let s = 0; s < SLOT_COUNT; s++) {
    const explicit = chains[s];
    if (explicit) { CHILD_CHAIN.push(explicit); continue; }
    const c = CHILD_SLOT[s];
    CHILD_CHAIN.push(c === null ? [] : [c]);
  }
}
/**
 * slot -> the slot to take a direction FROM when this bone has no child at all. Only listed for
 * segments that lie along their parent in a bind pose, where "keep going the way my parent was
 * going" is the right answer. A foot is deliberately absent: it is perpendicular to its shin, so
 * guessing from the parent would aim it 90 degrees wrong, and no aim at all is the safer failure.
 */
const PARENT_DIR_FALLBACK: (number | null)[] = new Array(SLOT_COUNT).fill(null);
PARENT_DIR_FALLBACK[FARM_L] = UARM_L; PARENT_DIR_FALLBACK[FARM_R] = UARM_R;
PARENT_DIR_FALLBACK[SHIN_L] = THIGH_L; PARENT_DIR_FALLBACK[SHIN_R] = THIGH_R;

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
 * A pose signature for every id in TrickRegistry. These are read as: "on top of the KICK-PUSH
 * base, over the trick's duration, do THIS". Each is meant to be legible from the THPS chase
 * camera at 8 m, which means one big readable shape per trick, not anatomical accuracy.
 *
 * Reading them against the kneeling stance:
 *   - The rider's anchor is the BACKREST TOP, not a pair of armrests. A signature that leaves one
 *     arm alone therefore keeps that hand on the rail, which is what makes even the wildest grab
 *     still read as "man on an office chair". Only the two-handed showpieces let go with both.
 *   - Chair anatomy is expressed relative to TRAVEL, and the chair travels backrest-first: the
 *     backrest is the NOSE (+Z, at hand height) and the seat's far edge is the TAIL (-Z, behind
 *     and below him). nosegrab/tailgrab/nosegrind/bluntslide are authored on that basis.
 *   - Leg ops on the PLANTED knee are damped to 30% while the wheels are down (see poseTrick), so
 *     the big leg shapes below land in the air, where they belong, and never scrape the knee off
 *     the seat during a grind.
 *   - Everything here is authored for the REGULAR stance and mirrored automatically for goofy.
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
  op(UARM_L, { dir: [0.30, -0.90, -0.32], k: 1.0, w: 1.0 }),                 // left hand drops off the
  op(FARM_L, { dir: [0.42, -0.72, -0.55], k: 1.0, w: 1.0 }),                 // rail to the seat's edge
  op(HAND_L, { x: 0.45, z: -0.30, w: 0.85 }),
  pair(THIGH_L, THIGH_R, { dir: [0.28, 0.40, 0.87], k: 0.75 }),
  all(G_TORSO, { z: 0.18, y: 0.20 }),                                        // right hand keeps the bar
));
TRICK_SIGS.set('indy', sig(-0.10, [0, 0.04, 0], 'chairhold',
  op(UARM_R, { dir: [-0.30, -0.86, 0.42], k: 1.0, w: 1.0 }),                 // right hand under the seat
  op(FARM_R, { dir: [-0.34, -0.70, 0.63], k: 1.0, w: 1.0 }),
  op(HAND_R, { x: 0.40, w: 0.85 }),
  pair(THIGH_L, THIGH_R, { dir: [0.26, 0.44, 0.86], k: 0.8 }),
  all(G_TORSO, { z: -0.16, x: 0.22 }),                                       // left hand keeps the bar
));
TRICK_SIGS.set('nosegrab', sig(0, [0, 0.03, 0.03], 'chairhold',
  op(UARM_R, { dir: [-0.20, -0.55, 0.81], k: 1.0, w: 1.0 }),                 // down the FRONT of the
  op(FARM_R, { dir: [-0.18, -0.40, 0.90], k: 1.0, w: 1.0 }),                 // backrest — the nose
  op(HAND_R, { x: 0.30, w: 0.85 }),
  all(G_TORSO, { x: 0.40 }),                                                 // folded over the bar
  op(HEAD, { x: 0.28, w: 0.8 }),
  op(THIGH_R, { dir: [-0.24, 0.16, 0.96], k: 0.6 }),
));
TRICK_SIGS.set('tailgrab', sig(0, [0, 0.03, -0.03], 'chairhold',
  op(UARM_R, { dir: [-0.24, -0.62, -0.75], k: 1.0, w: 1.0 }),                // back and down to the
  op(FARM_R, { dir: [-0.20, -0.50, -0.84], k: 1.0, w: 1.0 }),                // seat's trailing edge
  op(HAND_R, { x: -0.35, w: 0.85 }),
  all(G_TORSO, { x: -0.30 }),                                                // arched back off the bar
  op(HEAD, { x: -0.20, w: 0.8 }),
  op(THIGH_R, { dir: [-0.26, 0.42, 0.87], k: 0.8 }),
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
  op(UARM_R, { dir: [-0.30, -0.52, -0.80], k: 1.0, w: 1.0 }),                // trailing hand grabs back
  op(FARM_R, { dir: [-0.26, -0.38, -0.89], k: 1.0, w: 1.0 }),
  all(G_TORSO, { x: -0.42, z: 0.20 }),                                       // arched back off the bar
  op(HEAD, { x: -0.30, w: 0.85 }),                                           // left hand keeps the bar
));
TRICK_SIGS.set('airwalk', sig(0, [0, 0.07, 0], 'chairhold',
  op(THIGH_L, { dir: [0.62, 0.02, 0.78], k: 1.0, w: 1.0 }),                  // legs split wide
  op(SHIN_L, { dir: [0.58, -0.12, 0.81], k: 1.0, w: 1.0 }),
  op(THIGH_R, { dir: [-0.62, 0.02, 0.78], k: 1.0, w: 1.0 }),
  op(SHIN_R, { dir: [-0.58, -0.12, 0.81], k: 1.0, w: 1.0 }),
  op(UARM_R, { dir: [-0.22, -0.48, 0.85], k: 1.0, w: 1.0 }),                 // right hand down the front
  op(FARM_R, { dir: [-0.18, -0.32, 0.93], k: 1.0, w: 1.0 }),                 // of the backrest
  all(G_TORSO, { x: 0.22 }),                                                 // left hand keeps the bar
));

// --- Chair-specific grabs ---------------------------------------------------------------
TRICK_SIGS.set('coffee_mug', sig(-0.18, [0, 0.02, 0], 'chairhold',
  op(UARM_R, { dir: [-0.95, 0.12, 0.28], k: 1.0, w: 1.0 }),                  // arm straight out SIDEWAYS
  op(FARM_R, { dir: [-0.90, 0.30, 0.32], k: 1.0, w: 1.0 }),
  op(HAND_R, { x: -0.55, y: 0.30, w: 0.95 }),                                // wrist cocked, holding a mug
  all(G_TORSO, { z: 0.30, y: -0.24 }),                                       // lean away from the mug
  op(HEAD, { y: -0.45, z: 0.18, w: 0.9 }),                                   // looking at it
  op(THIGH_R, { dir: [-0.26, 0.22, 0.94], k: 0.6 }),                         // left hand keeps the bar
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
/**
 * solveTwoBone's own aim scratch. It MUST NOT be one of the general-purpose _v1.._v3, because
 * every caller builds its pole vector in one of those and passes it in by reference — writing
 * the aim direction over _v3 silently overwrote the caller's pole with the aim itself, which
 * made pole and aim parallel, which sent the solver down its degenerate fallback branch every
 * single time. That is why both elbows broke upward instead of outward-and-down, and why the
 * rider's arms read as a T-rex reach no matter what the pole was set to.
 */
const _ikDir = new THREE.Vector3();
const _accQ = new THREE.Quaternion();
const _accV = new THREE.Vector3();
const _armPos = new THREE.Vector3();
const _hipsPos = new THREE.Vector3();

/** Rotate a vector about the model-space X axis, in place. Used to carry offsets through a lean. */
function rotateAboutX(v: THREE.Vector3, angle: number): void {
  if (angle === 0) return;
  const c = Math.cos(angle), s = Math.sin(angle);
  const y = v.y, z = v.z;
  v.y = y * c - z * s;
  v.z = y * s + z * c;
}

/** Rotate a vector about the model-space Y axis, in place. Used to carry offsets through a twist. */
function rotateAboutY(v: THREE.Vector3, angle: number): void {
  if (angle === 0) return;
  const c = Math.cos(angle), s = Math.sin(angle);
  const x = v.x, z = v.z;
  v.x = x * c + z * s;
  v.z = -x * s + z * c;
}

/** Rotate a vector about the model-space Z axis, in place. Used to carry offsets through a bank. */
function rotateAboutZ(v: THREE.Vector3, angle: number): void {
  if (angle === 0) return;
  const c = Math.cos(angle), s = Math.sin(angle);
  const x = v.x, y = v.y;
  v.x = x * c - y * s;
  v.y = x * s + y * c;
}

// ---------------------------------------------------------------------------
// TrickAnimator
// ---------------------------------------------------------------------------

export class TrickAnimator {
  // Defaults are ChairModel TIER 1 (the standard task chair). Everything below was SOLVED against
  // that chair's real numbers, not dialled in by eye, so it is worth writing the chain down:
  //
  //   pan top          y 0.560  (TIERS[1].seatY 0.455 + seatT 0.105), pan spans z -0.22 .. +0.22
  //   backrest grip    y 0.932  z 0.250          caster ring radius 0.275, contacts at y 0
  //
  // KNEE. A shin lying ON the pan has its joint one shin-radius ABOVE the pan, less whatever it
  // presses into the cushion:  0.560 + 0.066 - 0.006 = 0.620. And it may not go further forward
  // than CHAIR_KNEE_MAX_Z (0.074 on tier 1) or the shin is inside the backrest.
  //
  // THE SOLVE ORDER MATTERS, and it is the thing three earlier passes got wrong. There are three
  // unknowns (pelvis height, pelvis depth, torso lean) and three hard contacts (push foot on the
  // floor, knee on the pan, both hands on the rail). Chained in this order they have exactly one
  // answer, and none of them is a taste knob:
  //
  //   1. HEIGHT is whatever still lets the push leg touch the carpet. Every millimetre higher is
  //      a millimetre of hovering shoe, and a hovering shoe is the loudest possible "this figure
  //      is not standing on anything" tell. -> pelvis 0.33 m over the pan, hip joint y ~0.90.
  //   2. DEPTH follows from driving the KNEE as far up the pan as it will go (kneeMaxForward).
  //      This is the whole trick: the thigh then hangs the pelvis BACK from that knee by its own
  //      run, and the run is short because the pelvis is high, so the body ends up OVER the seat
  //      instead of trailing a foot and a half behind the chair (which is what "a man standing
  //      behind a chair" looked like).
  //   3. LEAN is then solved so the shoulders land `gripExtension` of an arm's length from the
  //      rail. Nothing else is free, so nothing else can set the elbow bend.
  //
  // MEASURED on tier 1 with the shipped rider, chair-root frame, floor y = 0
  // (`npx vite-node tools/posepreview/probe.ts -- 0 false`, i.e. stopped and coasting):
  //   pelvis      0.255 over the pan, 0.282 back from the seat anchor -> hips at y 0.815
  //   planted knee(-0.207, 0.619, 0.071)  ON the cushion: 59 mm over a pan top at 0.560, which
  //               with a 66 mm shin radius is the shin's flesh 7 mm into the cushion. Inside the
  //               pan's own footprint (x +-0.23, z -0.227..0.240) and 78 mm clear of the
  //               backrest's seat-facing face at z 0.149.
  //   planted shoe(-0.380, 0.549, -0.300) hanging in the air off the pan's rear outer corner,
  //               418 mm above the carpet, sole tipped back at the chase camera
  //   push shoe   ( 0.290, 0.136, -0.417) SOLE ON THE FLOOR (5 mm proud), hip-to-ankle 0.711 on
  //               a 0.800 leg = 89% -> a knee that visibly breaks forward, at (0.265, 0.467)
  //   both hands  wrists on the rail at y 0.972 (rail top 0.932 + 40 mm of grip), z 0.250,
  //               shoulder-to-wrist 0.406 on a 0.478 arm = 85%: a bent but reaching arm
  //   head        y 1.142, 0.21 above the top of the chair, facing down the direction of travel
  // Re-run that probe after touching ANY number in this block; every one of them moves the others.
  readonly config: AnimatorConfig = {
    rigForward: 1,
    autoFacing: true,
    modelYaw: 0,
    // STANCE IS A FRAMING DECISION, not an ergonomic one.
    //
    // The chair is a solid object roughly the size of the rider's whole lower body, so exactly
    // one of the two legs is ever visible: whichever one is on the camera's side. The knee on
    // the pan is behind the backrest from every angle; the leg that reaches the floor is the
    // only part of the stance that can actually be seen, and it is the part that says "he is
    // kicking this thing along" rather than "he is sitting in it".
    //
    // `goofy` (right knee planted, LEFT leg working) puts that working leg on the chair's +X
    // side, which is the open side in the two hero cameras and is symmetric in the chase
    // camera. Trick signatures are authored for `regular` and mirrored at evaluation time, so
    // nothing else in this file has to know.
    stance: 'goofy',

    // A CEILING, not the answer: solveStance derives the real height from `thighPitch` and only
    // clamps against this so a rig with freakish leg lengths cannot launch the rider off the
    // chair. On tier 1 with this rig the solve lands at 0.255, so this never binds.
    pelvisAboveSeat: 0.440,
    pelvisForward: -0.200,      // solved at bind time unless autoPelvis is off
    pelvisLateral: 0,
    autoPelvis: true,

    shinRadius: 0.066,
    kneeSink: 0.006,
    kneeForward: 0.054,         // solved: driven up against kneeMaxForward
    kneeMaxForward: CHAIR_KNEE_MAX_Z[1],
    // Outboard enough that the knee cap and the shin clear the seat's own side bolster (x 0.204
    // on tier 1) in plan. The planted leg is the half of the stance that says "kneeling"; run it
    // down the centre line and the seat swallows it completely from every camera angle.
    kneeOutboard: 0.195,
    kneeOutboardMax: 0.205,     // tier-1 cushion is 0.23 half-wide; the bolster crest is 0.204
    // 0.10, not 0.02: the shin has to visibly SLOPE OFF THE BACK of the pan.
    // At 0.02 it ran dead level 40 mm above the cushion and the trailing shoe finished at seat
    // height, which from behind reads as a leg sticking out sideways in mid-air rather than as a
    // leg lying on a seat. Dropping the far end to just under the pan's own top plane — past its
    // rear edge, so nothing intersects — gives the planted leg a shape that starts on the chair.
    shinDroop: 0.10,
    // 0.50 rad (29 deg) — MEASURED DOWN from 0.85 because 0.85 was reading as "standing".
    //
    // thighPitch is the one number that decides how high the pelvis rides, and every other part
    // of the silhouette hangs off it:
    //   0.85 rad put the pelvis 0.359 m over the pan, which is level with the TOP OF THE
    //   BACKREST. From there the head clears the chair by 330 mm, the grip line is below his
    //   hips, and — the tell that made four reviewers call this "a man standing behind a chair"
    //   — the kicking leg has to span 0.756 m of air to reach the carpet on a 0.800 m leg. That
    //   is 99.4% extension: a dead straight stilt, which is exactly what a standing leg is.
    //   0.50 rad drops the pelvis to 0.255 m over the pan. The kicking leg then spans 0.685 m,
    //   or 86% — a clearly bent knee, the single strongest "he is crouched over this thing
    //   pushing it" cue available — and the hip settles back over the rear of the pan with the
    //   shin under it, which is what kneeling on a seat actually looks like.
    // The cost is 88 mm more distance to the rail, which solveLeanForGrip spends as forward
    // torso lean (0.37 -> 0.49 rad). That is the right way to spend it: it is the scooter fold.
    thighPitch: 0.50,

    backTopY: CHAIR_BACK_TOP_Y[1],
    backTopZ: CHAIR_BACK_TOP_Z[1],
    handsApart: CHAIR_BACK_GRIP_HALF_W[1],
    // 0.030: this rig has no hand joint, so the two-bone solve lands the WRIST here and the fist
    // mesh continues ~33 mm further along the forearm. Measured on the built chair that puts the
    // bottom of the fist within 3 mm of the rail's top plane, which is the contact the concept
    // art sells. Raise it and the hands hover; drop it and the forearms sink into the panel.
    gripRise: 0.030,

    ankleRise: 0.075,
    pushReach: 0.290,
    pushDrive: -0.300,
    // Tucked in from 0.325: the pelvis is now 70 mm higher, and every centimetre of track width
    // is leg length the push foot no longer has to spend reaching the floor.
    pushApart: 0.245,
    pushLift: 0.150,
    pushCycle: 0.62,
    // TUCKED, not dangling. At 0.045 the coasting leg hung at 94% extension — a straight pale
    // stilt beside the chair that read as a man standing on it. 0.17 folds the knee to ~80% and
    // gives the free leg a shape. It is speed-scaled in posePushLeg, so at a standstill (every
    // menu idle, every screenshot of a stopped game) the sole is still flat on the carpet.
    coastLift: 0.150,
    // MEASURED IN from -0.150. This is a PELVIS-relative depth, and the pelvis already sits
    // 0.28 m behind the seat anchor (that is what kneeling on a seat costs), so -0.150 put the
    // coasting shoe at chair-frame z -0.412: a whole caster ring astern of the chair, with a
    // leg at 89% extension reaching down to it. A foot planted that far back is the single
    // loudest "he is standing behind this chair" cue the pose has, because it is exactly where
    // a standing man's foot would be. -0.055 brings the shoe to z -0.322 — under his own hips,
    // just outside the caster ring's 0.306 radius so it never ploughs a spoke, and reading as a
    // man braced over the chair rather than trailing it.
    coastTrail: -0.055,

    // LEAN. This is not a taste knob — it is what decides the arms, so it is SOLVED, not typed.
    // 0.47 is only the tier-1 answer and only the starting value; solveStance overwrites it from
    // the real shoulder-to-rail distance for whatever chair is under him.
    leanBase: 0.470,
    leanSpeed: 0.300,
    leanSpeedRef: 12,
    autoLean: true,
    gripExtension: 0.88,
    leanShoulderGain: 1.13,

    fallbackHipHeight: 0.95,
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

  // --- Solved ride targets ---------------------------------------------------------------
  // Static per rig + chair: recomputed only when the anchors or the config change.
  /** Planted-leg bone directions, model space, per side index (0 = left, 1 = right). */
  private kneelThigh: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3()];
  private kneelShin: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3()];
  private kneelFoot: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3()];
  /** Hip joint offset from the hips bone, metres, canonical (rigForward = +1) frame. */
  private hipJointRel: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3()];
  /** Shoulder (upper-arm root) offset from the hips bone, metres, canonical frame, UNLEANED. */
  private armRootRel: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3()];
  /** Backrest grip point relative to the hips bone, metres, canonical frame. */
  private gripRel: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3()];
  private lenThigh = 0.42;
  private lenShin = 0.40;
  private lenUpArm = 0.28;
  private lenForeArm = 0.26;
  /** How far the rig's shoe hangs below its ankle joint, metres. Measured at bind time. */
  private footDrop = 0;
  /** The pelvis height as authored, before solveStance() clamps it to the leg's reach. */
  private authoredPelvisAbove = NaN;
  /**
   * How far the pelvis has to sink for the kicking foot to reach the floor, metres. Solved in
   * solveStance and spent as a weight drop through the push cycle.
   */
  private pushDip = 0;
  /** How far back the pelvis rocks over the planted knee while it dips. Metres. */
  private pushDipBack = 0;

  // Per-frame IK outputs. Reused, never reallocated.
  private ikUpper = new THREE.Vector3();
  private ikLower = new THREE.Vector3();

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
  // The three whole-torso rotations the base pose applies, kept as scalars so the grip IK can be
  // solved from the shoulder position they actually produce instead of from the lean alone. Every
  // layer that moves the torso as a unit must add itself here or the hands will drift off the rail.
  /** Body bank into the current turn, radians. */
  private bank = 0;
  /** Torso twist away from the turn, radians. */
  private twist = 0;
  /** Extra forward pitch from the push cycle's load/thrust, radians. */
  private leanExtra = 0;
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
    this.solveRidePose();
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
      let child: BoneEntry | null = null;
      for (const cs of CHILD_CHAIN[s]) {
        const cand = this.slots[cs];
        if (cand) { child = cand; break; }
      }
      if (!child) {
        // LEAF BONE — no child joint to point at. Two fallbacks, in order:
        //
        //  1. the bone's OWN GEOMETRY. Whatever hangs off a forearm or an ankle extends along the
        //     limb, so the centroid of that geometry gives the direction directly. This is the
        //     only fallback that is correct when the rig was captured in a POSE rather than in a
        //     bind pose, which is the normal case for a procedurally built rider.
        //  2. failing that (skinned rigs hang no meshes off their bones), continue the parent's
        //     direction — right for a segment that lies along its parent in a bind pose, which is
        //     what a forearm does on every T-posed skeleton.
        //
        // Without either, the direction target for that bone is discarded outright, and the grip
        // IK's entire lower-arm solve goes with it: the hands never arrive on the backrest.
        const g = new THREE.Vector3();
        if (this.geometryDir(e, modelInv, g)) { e.restDir = g; continue; }
        const parentSlot = PARENT_DIR_FALLBACK[s];
        if (parentSlot === null) continue;
        child = this.slots[parentSlot];
        if (!child) continue;
        const d = new THREE.Vector3().subVectors(e.restModelPos, child.restModelPos);
        if (d.lengthSq() < 1e-10) continue;
        e.restDir = d.normalize();
        continue;
      }
      const d = new THREE.Vector3().subVectors(child.restModelPos, e.restModelPos);
      if (d.lengthSq() < 1e-10) continue;
      e.restDir = d.normalize();
    }

    // 4a. how far below the ankle does this rig's shoe actually reach? `ankleRise` is authored as
    // a plausible default, but a chunky stylised shoe can hang a lot further than that, and the
    // difference is the sole ploughing through the carpet on every push. Take the deeper of the
    // two, measured off the geometry, so the foot plants on the floor rather than in it.
    this.footDrop = 0;
    for (const f of [FOOT_L, FOOT_R]) {
      const ef = this.slots[f];
      if (!ef) continue;
      let lowest = 0;
      ef.bone.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.geometry) return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        const bb = m.geometry.boundingBox;
        if (!bb) return;
        // Eight corners, because a rotated box's lowest corner is not its bbox min.
        for (let c = 0; c < 8; c++) {
          _v1.set(c & 1 ? bb.max.x : bb.min.x, c & 2 ? bb.max.y : bb.min.y, c & 4 ? bb.max.z : bb.min.z);
          _v1.applyMatrix4(m.matrixWorld).applyMatrix4(modelInv);
          const drop = ef.restModelPos.y - _v1.y;
          if (drop > lowest) lowest = drop;
        }
      });
      if (lowest > this.footDrop) this.footDrop = lowest;
    }
    this.footDrop *= Math.abs(this.rig.model.scale.y) || 1;

    // 4b. which way does this rig face?
    if (this.config.autoFacing) {
      const f = this.detectFacing(modelInv);
      if (f !== 0) this.config.rigForward = f > 0 ? 1 : -1;
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

  /**
   * Which way the rig faces, measured off the rig itself: +1 for +Z, -1 for -Z, 0 for "no idea".
   *
   * Feet are the reliable tell on every humanoid ever rigged, in two escalating forms:
   *   1. a TOE bone sits ahead of its ankle, so the sign of (toe.z - ankle.z) is the facing;
   *   2. failing that, the SHOE GEOMETRY hanging off the ankle sticks out forwards, so the sign of
   *      (shoe centroid z - ankle z) says the same thing. This is what catches procedurally built
   *      riders, which typically have no toe joint at all.
   * Both are summed over the two feet, so one odd foot cannot flip the answer on its own.
   */
  /**
   * Model-space centroid of the geometry hanging off a bone, minus the bone itself. Used both to
   * point a leaf bone along its own limb and to work out which way the rig faces (a shoe sticks
   * out forwards). Returns false when the bone carries no geometry, which is the normal case for
   * a skinned rig. Must run in the same matrix pass that produced `modelInv` and restModelPos.
   */
  private geometryOffset(e: BoneEntry, modelInv: THREE.Matrix4, out: THREE.Vector3): boolean {
    out.set(0, 0, 0);
    let n = 0;
    e.bone.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      // Only the geometry that belongs to THIS bone. Anything under a further joint belongs to
      // that joint, and averaging it in makes a bone's rest direction depend on how the rig
      // downstream of it happens to be subdivided — which is how adding a wrist swung the
      // chest's rest direction by 22 degrees and moved the rider's head.
      for (let p = m.parent; p && p !== e.bone; p = p.parent) {
        if ((p as THREE.Object3D & { isBone?: boolean }).isBone) return;
      }
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox;
      if (!bb) return;
      // Deliberately NOT updateWorldMatrix() here: bindBones already refreshed the model and every
      // descendant, and `modelInv` was taken in that same pass. Refreshing again walks up through
      // the model's ANCESTORS too and lands the point in the chair's world frame, which modelInv
      // does not undo — the measurement then comes back metres out.
      _v1.copy(bb.min).add(bb.max).multiplyScalar(0.5);
      _v1.applyMatrix4(m.matrixWorld).applyMatrix4(modelInv);
      out.add(_v1);
      n++;
    });
    if (n === 0) return false;
    out.divideScalar(n).sub(e.restModelPos);
    return true;
  }

  /** Unit direction a bone's own geometry extends in, model space. False if it carries none. */
  private geometryDir(e: BoneEntry, modelInv: THREE.Matrix4, out: THREE.Vector3): boolean {
    if (!this.geometryOffset(e, modelInv, out)) return false;
    if (out.lengthSq() < 1e-8) return false;
    out.normalize();
    return true;
  }

  private detectFacing(modelInv: THREE.Matrix4): number {
    let vote = 0;

    for (const [f, t] of [[FOOT_L, TOE_L], [FOOT_R, TOE_R]] as const) {
      const ef = this.slots[f];
      const et = this.slots[t];
      if (ef && et) vote += et.restModelPos.z - ef.restModelPos.z;
    }
    if (Math.abs(vote) > 1e-4) return vote > 0 ? 1 : -1;

    for (const f of [FOOT_L, FOOT_R]) {
      const ef = this.slots[f];
      if (!ef) continue;
      if (this.geometryOffset(ef, modelInv, _v2)) vote += _v2.z;
    }
    if (Math.abs(vote) > 1e-4) return vote > 0 ? 1 : -1;
    return 0;
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
    if (d < 1e-5) { _ikDir.set(0, -1, 0); d = minReach; } else _ikDir.copy(target).divideScalar(d);
    d = Math.min(maxReach, Math.max(minReach, d));

    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));

    _ikN.copy(pole).addScaledVector(_ikDir, -pole.dot(_ikDir));
    if (_ikN.lengthSq() < 1e-8) {
      _ikN.set(0, 0, 1).addScaledVector(_ikDir, -_ikDir.z);
      if (_ikN.lengthSq() < 1e-8) _ikN.set(1, 0, 0).addScaledVector(_ikDir, -_ikDir.x);
    }
    _ikN.normalize();

    _ikJoint.copy(_ikDir).multiplyScalar(a).addScaledVector(_ikN, h);
    outUpper.copy(_ikJoint).normalize();
    _ikA.copy(_ikDir).multiplyScalar(d).sub(_ikJoint);
    if (_ikA.lengthSq() < 1e-10) _ikA.copy(_ikDir);
    outLower.copy(_ikA).normalize();
  }

  /**
   * Rest offset of a bone from the hips bone, in METRES and in the canonical (rigForward = +1)
   * frame, so authored geometry can be compared against it directly. Falls back to a plausible
   * humanoid offset if either bone is missing from the rig.
   */
  private restOffsetFromHips(slot: number, out: THREE.Vector3, fx: number, fy: number, fz: number): void {
    const hips = this.slots[HIPS];
    const e = this.slots[slot];
    if (!hips || !e) { out.set(fx, fy, fz); return; }
    const s = this.config.rigForward;
    out.set(
      (e.restModelPos.x - hips.restModelPos.x) * this.modelScale * s,
      (e.restModelPos.y - hips.restModelPos.y) * this.modelScale,
      (e.restModelPos.z - hips.restModelPos.z) * this.modelScale * s,
    );
  }

  /**
   * Solve everything about the kick-push pose that does NOT change frame to frame, against the
   * chair's real geometry, so it is right for any rig proportions and any chair tier.
   *
   * What comes out of here:
   *   - the planted leg: a thigh direction that lands the knee on the pan at (kneeOutboard,
   *     kneeForward) and at exactly the pan's surface height, a shin that trails back along the
   *     pan, a foot that drops off the seat's leading edge behind him;
   *   - the hip-joint and shoulder offsets, and the backrest grip point, all relative to the
   *     hips bone, which is what the per-frame arm and push-leg IK works from.
   *
   * All three limbs are re-solved per frame against where the pelvis actually ended up — see
   * poseRideBase, solvePlantedThigh and posePushLeg. What is cached here is only the part that
   * cannot move: bone lengths, the rig's own joint offsets, and the chair's grip point.
   */
  /**
   * Height of the planted KNEE JOINT, in the chair root's frame: the pan top, plus the shin's own
   * radius (the joint is a centreline, the flesh is not), less how far it presses in. This is the
   * single number that decides whether the knee rests on the seat or vanishes inside it.
   */
  private kneeTopY(): number {
    return this.seatLocal.y + this.config.shinRadius - this.config.kneeSink;
  }

  /**
   * Aim the planted thigh so the knee lands ON the seat pan, inside the cushion, and clear of
   * the backrest — against the hip joint's LIVE position, so the pelvis can lean, bank, dip into
   * a push or slide back at speed without dragging the knee off the seat with it.
   *
   * The knee target is clamped in plan first (never past `kneeMaxForward`, never further out
   * than `kneeOutboardMax`) and the thigh is then fitted to whatever is left:
   *
   *   - target further away than the thigh is long -> aim straight at it and land short. The
   *     knee ends up a little high, which is the right way to fail: it hovers a centimetre over
   *     the cushion rather than sliding off the front of it.
   *   - target nearer than the thigh is long -> keep the clamped plan position exactly and let
   *     the knee drop below the pan top instead, which reads as the cushion compressing. This
   *     case is what a push dip produces (a lower hip needs a longer horizontal run), and
   *     spending it forward or outboard is how the knee used to end up inside the backrest or
   *     hanging off the side of the seat.
   */
  private solvePlantedThigh(side: number, hjY: number, hjX: number, hjZ: number, out: THREE.Vector3): void {
    const c = this.config;
    const L = Math.max(0.05, this.lenThigh);

    // Knee target relative to the hip joint, clamped onto the real cushion.
    const kx = Math.max(-c.kneeOutboardMax, Math.min(c.kneeOutboardMax, side * c.kneeOutboard));
    const kz = Math.min(this.seatLocal.z + c.kneeForward, c.kneeMaxForward);
    const wx = kx - hjX;
    const wz = kz - hjZ;
    const wy = this.kneeTopY() - hjY;

    const plan = Math.sqrt(wx * wx + wz * wz);
    const full = Math.sqrt(plan * plan + wy * wy);
    if (full >= L || plan >= L) {
      // Out of reach: aim at it, land short, knee a touch high.
      if (full > 1e-4) out.set(wx / full, wy / full, wz / full);
      else out.set(0, -1, 0);
      return;
    }
    // In reach: hold the plan position and take the slack out of the height.
    const drop = -Math.sqrt(Math.max(0, L * L - plan * plan));
    out.set(wx / L, drop / L, wz / L);
    const n = out.length();
    if (n > 1e-5) out.divideScalar(n); else out.set(0, -1, 0);
  }

  /**
   * Solve the WHOLE kneeling stance against the rig's own bones and the chair's own geometry.
   *
   * Three unknowns — pelvis height, pelvis depth, torso lean — and three contacts that all have
   * to be true at once. Chained in this order they have exactly one answer:
   *
   *  1. HEIGHT is capped by the push leg. The pelvis is as high as it can be while the kicking
   *     foot still reaches the floor out beside the caster ring, with a few per cent of the leg
   *     kept in reserve so the knee never locks straight. Past that the shoe simply hovers,
   *     which is the "foot floating above the floor" defect.
   *  2. DEPTH comes from driving the KNEE as far up the pan as it will go — right up against
   *     `kneeMaxForward`, where the shin would start entering the backrest. The thigh then hangs
   *     the pelvis back from that knee by its own horizontal run, and because the pelvis is high
   *     the run is short, so the rider's body ends up over the seat. Sitting the pelvis further
   *     back than this is what made every earlier version read as "a man standing behind a
   *     chair holding its backrest" instead of "a man kneeling on it".
   *  3. LEAN then falls out of the arm. Pelvis fixed means shoulder-offset fixed, and the only
   *     thing left that can move the shoulders toward or away from the rail is how far the torso
   *     is folded forward. Solve it for `gripExtension` and the elbow bend is right on every
   *     chair tier and every rig, with nothing authored by eye.
   */
  private solveStance(): void {
    const c = this.config;
    const i = this.plantedIndex();
    const side = i === 0 ? 1 : -1;
    const legLen = this.lenThigh + this.lenShin;
    const armLen = this.lenUpArm + this.lenForeArm;
    // Remember what was asked for: the clamps below only ever reduce, so re-solving for a
    // different chair has to start from the authored values, not from the last answer.
    if (!Number.isFinite(this.authoredPelvisAbove)) this.authoredPelvisAbove = c.pelvisAboveSeat;
    else c.pelvisAboveSeat = this.authoredPelvisAbove;

    // --- 1. height, from the thigh angle that makes the kneel read ----------------------
    // The hip goes exactly one thigh-length up-and-back from the knee at `thighPitch`. Capped by
    // the authored ceiling so a freak rig with enormous legs cannot launch the rider off the
    // chair, but NOT capped by the push leg any more: see the dip below.
    const kneeRise = this.lenThigh * Math.sin(c.thighPitch);
    const h = Math.min(c.pelvisAboveSeat,
      Math.max(0.10, (this.kneeTopY() + kneeRise) - this.seatLocal.y - this.hipJointRel[i].y));
    c.pelvisAboveSeat = h;
    const pelvisY = this.seatLocal.y + h;

    // How far the pelvis has to drop for the kicking foot to actually reach the carpet, out
    // beside the caster ring. Kneeling upright puts the hip higher than a straight push leg can
    // span, and the honest way to spend that difference is as a weight drop on the kick — which
    // is what a real kick-push does anyway — rather than by flattening the kneel all the time or
    // by letting the shoe hover, which are the two ways this has been got wrong before.
    const pi = this.pushIndex();
    const rise = Math.max(c.ankleRise, this.footDrop + 0.006);
    const lateral = Math.abs((pi === 0 ? 1 : -1) * c.pushApart - this.hipJointRel[pi].x);
    const usable = legLen * 0.965;
    const vDrop = Math.sqrt(Math.max(0.01, usable * usable - lateral * lateral));
    // hipJointY = seat.y + h + hipJointRel.y, and it may sit at most vDrop above the ankle.
    const hPush = (rise + vDrop) - this.seatLocal.y - this.hipJointRel[pi].y;
    this.pushDip = Math.max(0, Math.min(0.14, h - hPush));
    // The dip is an ARC ABOUT THE PLANTED KNEE, not a straight drop. Sinking 47 mm on a 385 mm
    // thigh lengthens its horizontal run by 59 mm, and if the pelvis does not give that ground
    // back the knee is shoved 59 mm forward — straight into the backrest. Rocking back over the
    // knee is what a real kick-push does anyway.
    const kneeDrop0 = (this.seatLocal.y + h + this.hipJointRel[i].y) - this.kneeTopY();
    const run0 = Math.sqrt(Math.max(0, this.lenThigh * this.lenThigh - kneeDrop0 * kneeDrop0));
    const kneeDrop1 = Math.max(0.02, kneeDrop0 - this.pushDip);
    const run1 = Math.sqrt(Math.max(0, this.lenThigh * this.lenThigh - kneeDrop1 * kneeDrop1));
    this.pushDipBack = Math.max(0, run1 - run0);

    // --- 2. depth: knee as far up the pan as the backrest allows -----------------------
    c.kneeForward = c.kneeMaxForward - this.seatLocal.z;
    const hipY = pelvisY + this.hipJointRel[i].y;
    let dy = (this.kneeTopY() - hipY) / Math.max(0.05, this.lenThigh);
    dy = Math.max(-0.985, Math.min(0.985, dy));
    const horiz = this.lenThigh * Math.sqrt(Math.max(0, 1 - dy * dy));
    const dx = side * c.kneeOutboard - (c.pelvisLateral + this.hipJointRel[i].x);
    const run = Math.sqrt(Math.max(0, horiz * horiz - dx * dx));
    // knee z = pelvisZ + hipJointRel.z + run  =>  pelvisForward = kneeForward - run - hipRel.z
    c.pelvisForward = c.kneeForward - run - this.hipJointRel[i].z;
    const pelvisZ = this.seatLocal.z + c.pelvisForward;

    // --- 3. lean: fold the torso until the shoulders are one arm-reach off the rail ------
    if (c.autoLean) c.leanBase = this.solveLeanForGrip(pelvisY, pelvisZ, armLen * c.gripExtension);
  }

  /**
   * The torso pitch that puts the shoulder exactly `want` metres from the grip point.
   *
   * |grip - (pelvis + Rx(theta * gain) . armRootRel)| is monotonically decreasing in theta over
   * the whole usable range (folding forward carries the shoulder toward a rail that is in front
   * of and below it), so twenty bisections nail it to well under a millimetre and there is no
   * closed form worth the trigonometry. Falls back to the extremes of the bracket when the rail
   * is unreachable at any lean, which is what a rig with unusually short arms would produce.
   */
  private solveLeanForGrip(pelvisY: number, pelvisZ: number, want: number): number {
    const c = this.config;
    const LO = 0.10, HI = 1.00;
    const dist = (theta: number): number => {
      _v3.copy(this.armRootRel[0]);
      rotateAboutX(_v3, theta * c.leanShoulderGain);
      const ex = c.handsApart - (c.pelvisLateral + _v3.x);
      const ey = (c.backTopY + c.gripRise) - (pelvisY + _v3.y);
      const ez = c.backTopZ - (pelvisZ + _v3.z);
      return Math.sqrt(ex * ex + ey * ey + ez * ez);
    };
    if (dist(LO) <= want) return LO;      // rail is already close: sit as upright as we allow
    if (dist(HI) >= want) return HI;      // rail is far: fold as far as we allow
    let lo = LO, hi = HI;
    for (let n = 0; n < 20; n++) {
      const mid = (lo + hi) * 0.5;
      if (dist(mid) > want) lo = mid; else hi = mid;
    }
    return (lo + hi) * 0.5;
  }

  private solveRidePose(): void {
    const c = this.config;

    this.lenThigh = this.limbLength(THIGH_L, SHIN_L, 0.42);
    this.lenShin = this.limbLength(SHIN_L, FOOT_L, 0.40);
    this.lenUpArm = this.limbLength(UARM_L, FARM_L, 0.28);
    // A rig with no hand joint (the procedural rider has none — the fist is part of the forearm
    // mesh) used to fall back to a flat 0.26 m forearm. On a 0.245 m upper arm that is 6% of
    // over-estimate on the reach, and the grip IK spends it by leaving both hands short of the
    // rail. Scale the fallback off the upper arm instead, which every humanoid roughly matches.
    this.lenForeArm = this.limbLength(FARM_L, HAND_L, this.lenUpArm * 0.95);

    for (let i = 0; i < 2; i++) {
      this.restOffsetFromHips(i === 0 ? THIGH_L : THIGH_R, this.hipJointRel[i],
        (i === 0 ? 1 : -1) * 0.09, -0.06, 0);
      this.restOffsetFromHips(i === 0 ? UARM_L : UARM_R, this.armRootRel[i],
        (i === 0 ? 1 : -1) * 0.17, 0.42, 0);
    }
    if (c.autoPelvis) this.solveStance();

    // Pelvis in the chair's frame (this is where placeModel() will put the hips bone).
    const pelvisY = this.seatLocal.y + c.pelvisAboveSeat;
    const pelvisZ = this.seatLocal.z + c.pelvisForward;

    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;   // model-space X sign: 0 = left (+X), 1 = right (-X)

      // --- backrest grip, relative to the hips bone -------------------------------------
      this.gripRel[i].set(
        side * c.handsApart - c.pelvisLateral,
        (c.backTopY + c.gripRise) - pelvisY,
        c.backTopZ - pelvisZ,
      );

      // --- planted leg ------------------------------------------------------------------
      // The bind-time copy is only a fallback; poseRideBase re-solves it every frame against the
      // hip joint's actual position. See solvePlantedThigh().
      this.solvePlantedThigh(side, pelvisY + this.hipJointRel[i].y, c.pelvisLateral + this.hipJointRel[i].x,
        pelvisZ + this.hipJointRel[i].z, this.kneelThigh[i]);

      // Shin trails back along the pan behind him, drooping just enough that the ankle clears
      // the cushion instead of intersecting it, and swung OUTBOARD so the ankle leaves the pan
      // over its trailing outboard corner rather than dead astern.
      //
      // THE OUTBOARD COMPONENT IS WHAT MAKES THE KNEEL VISIBLE, and it is a tuned compromise,
      // not a free parameter. The chair is a solid object the size of the rider's lower body;
      // run the shin straight down the centre line and the seat and backrest swallow the whole
      // planted leg from every camera the game uses, so the outboard swing is what carries the
      // trailing shoe out past the chair's own silhouette (the seat group reaches x 0.277)
      // where the chase camera can see it.
      //
      // MEASURED DOWN from 25 degrees to 15. At 25 the ankle finished at x -0.380 — 100 mm
      // clear of the chair on one side while the kicking shoe sat 290 mm clear on the other,
      // and from any camera ahead of the chair (both hero angles, every 3/4 screenshot) that
      // reads as a SYMMETRIC STRADDLE: two legs splayed either side of a chair nobody is
      // kneeling on. At 15 degrees the ankle lands at x -0.307, which is 30 mm proud of the
      // seat — still separated from the chair's silhouette from behind, but tucked back inside
      // it from the front, so the two legs stop mirroring each other and the asymmetry that
      // says "one of these is up on the seat" survives.
      //
      // The droop is capped by interpenetration, not taste: the shin has to stay ABOVE the pan
      // until it is past the pan's own rear edge (z -0.227) or it sinks into the cushion. At
      // this outboard angle and this droop it crosses the pan plane at z -0.261, which is
      // already behind the seat. Steepen either and the trouser leg dives through the foam.
      this.kneelShin[i].set(side * 0.24, -0.07 - c.shinDroop, -0.955).normalize();
      // Foot hangs off the trailing outboard corner, toes down and back.
      this.kneelFoot[i].set(side * 0.22, -0.64, -0.74).normalize();
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
    this.solveRidePose();
  }

  /**
   * Where the rider's hands go: the grip line along the TOP EDGE of the backrest, in the chair
   * root's local frame. Only Y and Z are read (the hands straddle the centre line by
   * `config.handsApart`). For ChairModel with chairRoot = ChairParts.root that is
   * `(0, CHAIR_BACK_TOP_Y[tier], CHAIR_BACK_TOP_Z[tier])`.
   */
  setBackrestAnchor(backTopLocal: THREE.Vector3): void {
    this.config.backTopY = backTopLocal.y;
    this.config.backTopZ = backTopLocal.z;
    this.solveRidePose();
  }

  /**
   * Point the whole pose at one ChairModel tier in a single call: seat pan, backrest grip line
   * and grip width all come from that tier's real geometry.
   */
  setChairTier(tier: number): void {
    const t = Math.max(0, Math.min(CHAIR_SEAT_TOP_Y.length - 1, Math.round(tier)));
    this.seatLocal.set(0, CHAIR_SEAT_TOP_Y[t], 0.02);
    this.config.kneeMaxForward = CHAIR_KNEE_MAX_Z[t];
    this.config.backTopY = CHAIR_BACK_TOP_Y[t];
    this.config.backTopZ = CHAIR_BACK_TOP_Z[t];
    this.config.handsApart = CHAIR_BACK_GRIP_HALF_W[t];
    this.solveRidePose();
  }

  /** Which knee is planted on the seat. Trick signatures mirror with it. */
  setStance(stance: RideStance): void {
    if (this.config.stance === stance) return;
    this.config.stance = stance;
    this.solveRidePose();
  }

  getStance(): RideStance { return this.config.stance; }

  /** Side index (0 = left, 1 = right) of the knee that is on the seat. */
  private plantedIndex(): number { return this.config.stance === 'regular' ? 0 : 1; }
  /** Side index of the leg that kicks the floor. */
  private pushIndex(): number { return this.config.stance === 'regular' ? 1 : 0; }

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
    this.poseRideBase(p);
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
   * The KICK-PUSH base. One knee on the seat pan, the other leg working the floor, torso upright
   * and facing the way he is going, both hands wrapped over the top edge of the backrest.
   * Everything else in this file is a modifier on this.
   *
   * Three of the four limbs are solved, not authored:
   *   - the planted thigh's pitch comes from the real pan height (solveRidePose),
   *   - the push leg is two-bone IK onto the real floor plane, driven round the push cycle,
   *   - both arms are two-bone IK onto the real backrest grip line, from the shoulder position
   *     the CURRENT lean puts them at — which is why the hands stay on the rail as he leans in
   *     rather than only lining up at one speed on one chair tier.
   */
  private poseRideBase(p: PoseInput): void {
    const c = this.config;
    const leanF = Math.min(1, this.speedSm / Math.max(0.5, c.leanSpeedRef));
    // Forward lean: a base crouch, more the faster he goes, more again while actually kicking.
    const lean = c.leanBase + c.leanSpeed * leanF + 0.10 * this.pushSm;

    // Whole-torso rotations, solved up front: the planted-leg and grip solves below both need the
    // hip joint / shoulder positions these produce, so they cannot be left to poseLayers.
    this.bank = this.turnSm * 0.30 * Math.min(1, 0.35 + this.speedSm / 12);
    this.twist = -this.turnSm * 0.16;
    this.leanExtra = 0;

    // --- torso: a rigid pitch about X, with a little extra curl up the chain ---------------
    this.setDirPitch(HIPS, lean * 0.45);
    this.setDirPitch(SPINE, lean * 0.95);
    this.setDirPitch(CHEST, lean * 1.05);
    this.setDirPitch(UPCHEST, lean * 1.00);
    // Head up and looking down the road, so the lean never buries his face in the backrest.
    //
    // The neck carries most of that counter-rotation, but THIS RIG HAS NO NECK JOINT (the
    // procedural rider's head hangs straight off the chest), and an unbound slot silently
    // absorbs whatever is written to it. Leave it there and the head keeps 0.75x of the torso's
    // fold instead of 0.40x — at the ride lean that is a rider staring into the seat cushion,
    // which is the difference between a face and a haircut at gameplay distance. So when the
    // neck is missing, the head takes the neck's share as well.
    this.setDirPitch(NECK, -lean * 0.35);
    const neckShare = this.slots[NECK] ? 0 : -lean * 0.35;
    this.addRot(HEAD, -0.03 - lean * 0.30 + neckShare, 0, 0);

    const planted = this.plantedIndex();
    const push = this.pushIndex();
    const pelvisY = this.seatLocal.y + c.pelvisAboveSeat;
    const pelvisZ = this.seatLocal.z + c.pelvisForward;

    // Weight goes back as he folds down over the bar — otherwise the shoulders arrive on top of
    // the grip line at speed and the arms crumple into the chest. The knee stays where it is:
    // solvePlantedThigh re-aims against the moved hip joint below.
    this.hipOff.z -= 0.055 * leanF;

    // Weight DROPS onto the kicking leg. The upright kneel sits the hip higher than a straight
    // push leg can reach the carpet from (solveStance measures by how much), so he sinks into
    // the kick and comes back up to coast. Doing it here, before either leg is solved, keeps the
    // knee on the pan and the shoe on the floor through the whole cycle.
    this.hipOff.y -= this.pushDip * this.pushSm;
    this.hipOff.z -= this.pushDipBack * this.pushSm;

    // --- planted leg: knee on the pan, shin trailing back, foot off the leading edge -------
    {
      const i = planted;
      const side = i === 0 ? 1 : -1;
      const th = i === 0 ? THIGH_L : THIGH_R;
      const sh = i === 0 ? SHIN_L : SHIN_R;
      const ft = i === 0 ? FOOT_L : FOOT_R;
      const to = i === 0 ? TOE_L : TOE_R;

      // Re-aim the thigh against the hip joint's ACTUAL position this frame: pitching the pelvis
      // into the lean, banking it into a turn and sliding it back at speed all move that joint,
      // and without this the knee floats, sinks or walks off the cushion as he rides.
      _v2.copy(this.hipJointRel[i]);
      rotateAboutX(_v2, lean * 0.45);
      rotateAboutZ(_v2, this.bank);       // the pelvis banks with the turn; the knee must not
      this.solvePlantedThigh(
        side,
        pelvisY + _v2.y + this.hipOff.y,
        c.pelvisLateral + _v2.x + this.hipOff.x,
        pelvisZ + _v2.z + this.hipOff.z,
        _v3,
      );
      this.setDir(th, _v3.x, _v3.y, _v3.z, 1);
      this.setDir(sh, this.kneelShin[i].x, this.kneelShin[i].y, this.kneelShin[i].z, 1);
      this.setDir(ft, this.kneelFoot[i].x, this.kneelFoot[i].y, this.kneelFoot[i].z, 1);
      this.addRot(to, -0.12, 0, 0);
      // Weight is over this knee: the pelvis shifts a few millimetres toward it.
      this.hipOff.x += side * 0.012;
    }

    // --- push leg: solved onto the floor, phased round the push cycle ----------------------
    this.posePushLeg(push);

    // --- both hands on the backrest top edge ----------------------------------------------
    this.poseGrip(lean + this.leanExtra, 1, 1);

    // Landing compression.
    if (this.landPop > 0) {
      const k = this.landPop * this.landPop;
      this.addGroup(G_TORSO, 0.22 * k, 0, 0);
      this.addGroup(G_ARMS, 0.18 * k, 0, 0);
      this.hipOff.y -= 0.035 * k;
      if (!p.grounded) this.landPop = 0;
    }
  }

  /** Aim a bone's rest direction (up the chain) forward by `angle` radians about model X. */
  private setDirPitch(slot: number, angle: number): void {
    this.setDir(slot, 0, Math.cos(angle), Math.sin(angle), 1);
  }

  /**
   * Both hands onto the backrest grip line.
   *
   * The shoulder position is derived from the rig's own rest offset carried through the current
   * torso lean, and the target is the chair's real grip point, so the elbow bend falls out of the
   * geometry: no hand-tuned rotation that only reads on one chair tier. `kL`/`kR` scale each
   * hand's authority so a layer (balance wings, a grab, a bail) can take one hand off the rail.
   */
  private poseGrip(lean: number, kL: number, kR: number): void {
    for (let i = 0; i < 2; i++) {
      const k = i === 0 ? kL : kR;
      if (k <= 0.002) continue;
      const side = i === 0 ? 1 : -1;
      const ua = i === 0 ? UARM_L : UARM_R;
      const fa = i === 0 ? FARM_L : FARM_R;
      const hd = i === 0 ? HAND_L : HAND_R;
      const so = i === 0 ? SHO_L : SHO_R;

      // Shoulder, relative to the hips bone. Measured off the rig where we can (exact, and it
      // picks up every torso rotation for free); estimated from the rest offset carried through
      // lean / twist / bank only when the rig is missing one of the two bones.
      const eArm = this.slots[ua];
      const eHips = this.slots[HIPS];
      if (eArm && eHips) {
        this.modelPosOf(eArm, _armPos);
        this.modelPosOf(eHips, _hipsPos);
        _v2.subVectors(_armPos, _hipsPos);
        const s = this.config.rigForward;
        _v2.x *= s; _v2.z *= s;                       // measured -> canonical (+Z forward) frame
      } else {
        _v2.copy(this.armRootRel[i]);
        rotateAboutX(_v2, lean);
        rotateAboutY(_v2, this.twist);
        rotateAboutZ(_v2, this.bank);
      }
      // gripRel is measured from the NOMINAL pelvis and _v2 from the HIPS BONE, and hipOff is
      // exactly the gap between the two. Leave it out and every hip shift the pose makes — the
      // lean's weight-back, the push cycle's load and thrust, a trick's hip signature — slides
      // both hands off the rail by that much. It is only two or three centimetres, which is
      // precisely the size of gap that reads as "not quite holding on".
      _v1.copy(this.gripRel[i]).sub(this.hipOff).sub(_v2);

      // The elbow breaks OUTWARD, down and a little back — the way it does on a scooter bar.
      // Outward has to dominate: break the elbow mostly downward instead and both arms collapse
      // into a narrow V in front of the chest that reads as praying rather than as gripping.
      _v3.set(side * 0.82, -0.50, -0.28).normalize();
      this.solveTwoBone(_v1, this.lenUpArm, this.lenForeArm, _v3, this.ikUpper, this.ikLower);

      this.blendDir(ua, this.ikUpper.x, this.ikUpper.y, this.ikUpper.z, k);
      this.blendDir(fa, this.ikLower.x, this.ikLower.y, this.ikLower.z, k);
      this.addRot(hd, 0.34 * k, 0, -side * 0.16 * k);      // knuckles over the rail
      this.addRot(so, 0.16 * k, side * 0.05 * k, -side * 0.06 * k);   // shoulders rolled forward
      this.raiseWeight(ua, 0.95 * k);
      this.raiseWeight(fa, 0.95 * k);
    }
  }

  /**
   * The push leg, as a POSITION solved onto the floor rather than an authored rotation, so the
   * foot actually arrives at the ground plane instead of hovering over it or ploughing through.
   *
   * Cycle, in `pushPhase`:
   *   0.30 .. 0.75  contact — the sole is on the floor and drives from `pushReach` ahead of the
   *                 pelvis back to `pushDrive` behind it. This is the half that propels the chair.
   *   0.75 .. 0.30  recovery — the foot lifts and swings forward again for the next plant.
   * With no push input the whole thing gives way to a tuck alongside the chair, and in the air it
   * folds up under him.
   */
  private posePushLeg(i: number): void {
    const c = this.config;
    const side = i === 0 ? 1 : -1;
    const th = i === 0 ? THIGH_L : THIGH_R;
    const sh = i === 0 ? SHIN_L : SHIN_R;
    const ft = i === 0 ? FOOT_L : FOOT_R;
    const to = i === 0 ? TOE_L : TOE_R;

    // Floor, in the pelvis's own frame: the chair root's origin IS the floor (caster contact).
    const floorY = -(this.seatLocal.y + c.pelvisAboveSeat);
    // Ankle height of a planted foot: never less than the rig's own shoe depth (see bindBones).
    const rise = Math.max(c.ankleRise, this.footDrop + 0.006);

    // --- the kicking target ---------------------------------------------------------------
    const ph = this.pushPhase;
    let footZ: number;
    let footY: number;
    let toeDown: number;
    if (ph >= 0.30 && ph < 0.75) {
      const u = smoothstep((ph - 0.30) / 0.45);
      footZ = c.pushReach + (c.pushDrive - c.pushReach) * u;
      // The ankle climbs through the drive because the heel comes up and he finishes on the toe.
      // It has to climb by more than the toe drops, or the shoe's toe box ends up under the floor.
      footY = floorY + rise * (1 + 0.90 * u);
      toeDown = 0.35 + 0.55 * u;
    } else {
      const v = ph >= 0.75 ? (ph - 0.75) / 0.55 : (ph + 0.25) / 0.55;
      const u = smoothstep(v);
      footZ = c.pushDrive + (c.pushReach - c.pushDrive) * u;
      footY = floorY + rise + c.pushLift * Math.sin(Math.PI * v);
      toeDown = 0.35 - 0.30 * Math.sin(Math.PI * v);
    }
    _v1.set(side * c.pushApart, footY, footZ);

    // --- the coasting target: tucked in alongside the chair --------------------------------
    // Down beside the caster ring and trailing behind him, far enough back that the shoe never
    // ploughs through a spoke or drags a shin across the seat.
    //
    // The lift off the carpet is SPEED SCALED, and that matters more than it looks. At a
    // standstill a foot hovering five centimetres over the floor is the single most obvious
    // tell that a character is not standing on anything — and a standstill is exactly the frame
    // every screenshot and every menu idle catches. So: sole planted when stopped, tucked up
    // only once he is actually rolling and the lift reads as a tuck rather than as a bug.
    const roll = Math.min(1, this.speedSm / 3.5);
    _v2.set(side * (c.pushApart + 0.045), floorY + rise + c.coastLift * roll, c.coastTrail);

    const drive = Math.max(0, Math.min(1, this.pushSm)) * (1 - this.airSm);
    _v1.lerp(_v2, 1 - drive);
    // Flat sole while the foot is down and stopped; toe drops as it comes off the floor.
    toeDown = toeDown * drive + (0.04 + 0.16 * roll) * (1 - drive);

    // --- turn counterweight ----------------------------------------------------------------
    // The free leg is the only mass he can throw, so it swings out and back on the outside of a
    // turn and tucks in under him on the inside. This is done to the IK TARGET rather than by
    // overriding the leg's direction, which is what lets the floor clamp below still apply: an
    // authored counterweight direction is exactly how a swinging foot ends up under the carpet.
    const turnK = Math.min(1, Math.abs(this.turnSm)) * (1 - 0.55 * this.pushSm) * (1 - this.airSm);
    if (turnK > 0.005) {
      const swing = -this.turnSm * side;      // +1 when the turn is away from this leg
      _v1.x += side * 0.130 * swing * turnK;
      _v1.z -= 0.110 * swing * turnK;
      _v1.y += 0.075 * Math.max(0, swing) * turnK;
    }

    // --- airborne: fold it up under him ----------------------------------------------------
    if (this.airSm > 0.01) {
      // Ankle 300 mm under the pelvis and just clear of the pan's rear edge: knee up and
      // forward, heel in, at roughly 40% of full leg extension. Deliberately NOT expressed as
      // `-pelvisAboveSeat + k`, which is how it used to read: that ties the tuck to how high the
      // rider kneels, so lowering the kneel silently pulled the ankle up into the pelvis and the
      // ollie folded the leg flat instead of tucking it.
      _v2.set(side * (c.pushApart * 0.85), -0.300, 0.020);
      _v1.lerp(_v2, this.airSm);
      toeDown += 0.25 * this.airSm;
    }

    // A toe-down foot reaches further past its ankle than a flat one, so the ankle has to climb
    // by roughly what the pitch costs — otherwise the toe box of the shoe finishes the drive
    // phase a couple of centimetres under the carpet.
    _v1.y += this.footDrop * 0.42 * Math.max(0, toeDown) * (1 - this.airSm);

    // The shoe is never allowed below the floor plane while the wheels are down. `rise` is the
    // ankle height of a planted foot, so most of it is the shallowest the ankle may ever get.
    const minY = floorY + rise * 0.80;
    if (_v1.y < minY) _v1.y += (minY - _v1.y) * (1 - this.airSm);

    // Hip joint -> ankle. `_v1` is still measured from the NOMINAL pelvis, so the live hip offset
    // has to come off too or a leaning rider's shoe stops meeting the floor he is standing on.
    _v1.sub(this.hipJointRel[i]).sub(this.hipOff);
    _v3.set(side * 0.34, 0.20, 1).normalize();
    this.solveTwoBone(_v1, this.lenThigh, this.lenShin, _v3, this.ikUpper, this.ikLower);

    this.setDir(th, this.ikUpper.x, this.ikUpper.y, this.ikUpper.z, 1);
    this.setDir(sh, this.ikLower.x, this.ikLower.y, this.ikLower.z, 1);
    // Foot: toe leads on the swing, toe drives on the kick.
    const fz = 0.92 - 1.8 * Math.max(0, Math.min(1, (ph - 0.30) / 0.45)) * drive;
    _v2.set(side * 0.06, -toeDown, fz).normalize();
    this.setDir(ft, _v2.x, _v2.y, _v2.z, 1);
    this.addRot(to, 0.10 * drive, 0, 0);

    // The body works with the leg: he folds down onto the bar to load the kick and comes up as
    // it drives through.
    if (drive > 0.01) {
      const load = Math.max(0, 1 - Math.min(1, Math.abs(ph - 0.30) / 0.28));
      const thrust = Math.max(0, Math.min(1, (ph - 0.35) / 0.35));
      this.leanExtra = (0.18 * load - 0.09 * thrust) * drive;
      this.twist += -side * 0.08 * thrust * drive;
      this.addGroup(G_TORSO, this.leanExtra, -side * 0.08 * thrust * drive, 0);
      this.hipOff.y += (-0.025 * load + 0.018 * thrust) * drive;
      this.hipOff.z += 0.015 * thrust * drive;
    }
  }

  /** Everything additive that is not a named trick. */
  private poseLayers(p: PoseInput): void {
    const turn = this.turnSm;
    const air = this.airSm;
    const pushIdx = this.pushIndex();
    const pushSide = pushIdx === 0 ? 1 : -1;

    // --- lean into the turn: the rider banks, the head leads ---------------------------
    // Deliberately NOT applied to the arms or the legs. Both of those are pinned to real
    // geometry — hands on the rail, knee on the pan, shoe on the floor — and rotating them with
    // the body is what used to slide the knee off the seat and swing the foot into the carpet.
    // The shoulders' share of the bank is already in the grip IK (see poseRideBase).
    if (Math.abs(turn) > 0.001) {
      const bank = this.bank;
      this.addRot(HIPS, 0, 0, bank);
      this.addGroup(G_TORSO, 0, 0, bank);
      this.addRot(NECK, 0, 0, bank);
      this.addRot(HEAD, 0, 0, bank);
      this.addGroup(G_TORSO, 0, -turn * 0.16, -bank * 0.35);
      this.addRot(HEAD, 0, -turn * 0.34, -bank * 0.4);
      this.hipOff.x += turn * 0.02;
      // The free leg's counterweight swing is NOT here: it is solved as an offset on the push
      // leg's IK target inside posePushLeg, so it stays above the floor. See the note there.
    }

    // --- absorb the chair's own tilt: the upper body stays more upright than the chair ---
    const pitchR = this.pitchSm * Math.PI / 180;
    const rollR = this.rollSm * Math.PI / 180;
    if (Math.abs(pitchR) > 0.002 || Math.abs(rollR) > 0.002) {
      this.addGroup(G_UPPER, -pitchR * 0.40, 0, rollR * 0.40);
      this.addGroup(G_LEGS, -pitchR * 0.15, 0, rollR * 0.15);
      this.addRot(HEAD, -pitchR * 0.30, 0, rollR * 0.30);
    }

    // --- air: the ollie tuck. Push leg comes up, arms compress, he pulls in on the bar ----
    // (The planted knee stays on the pan — the chair is coming up with him.)
    if (air > 0.01) {
      const t = Math.min(1, p.airTime / 0.20);
      const settle = 1 - Math.min(0.55, Math.max(0, (p.airTime - 0.55)) * 0.6);
      const k = air * smoothstep(t) * settle;
      const pth = this.plantedIndex() === 0 ? THIGH_L : THIGH_R;
      const psh = this.plantedIndex() === 0 ? SHIN_L : SHIN_R;
      const pside = this.plantedIndex() === 0 ? 1 : -1;
      // The planted leg only folds a little — enough to sell the pop, not enough to leave the seat.
      this.blendDir(pth, pside * 0.16, -0.30, 0.94, 0.30 * k);
      this.blendDir(psh, pside * 0.08, -0.46, -0.88, 0.30 * k);
      // Arms compress: elbows fold, chest comes down toward the bar. Kept small on the upper arm
      // so the hands stay within a fist's width of the rail he is supposedly pulling on.
      this.addGroup(G_TORSO, 0.20 * k, 0, 0);
      this.addGroup(G_ARMS, 0.09 * k, 0, -0.12 * k);
      this.addRot(FARM_L, 0.22 * k, 0, 0);
      this.addRot(FARM_R, 0.22 * k, 0, 0);
      this.hipOff.y += 0.02 * k;
      this.hipOff.z -= 0.02 * k;
    }

    // --- generic grab reach when a grab is held with no named trick ----------------------
    // One hand leaves the rail and drops to the seat edge; the other keeps the chair.
    if (this.grabSm > 0.02 && !this.active) {
      const k = this.grabSm;
      const ua = pushIdx === 0 ? UARM_L : UARM_R;
      const fa = pushIdx === 0 ? FARM_L : FARM_R;
      this.blendDir(ua, pushSide * 0.42, -0.86, -0.28, k);
      this.blendDir(fa, pushSide * 0.36, -0.74, -0.57, k);
      this.raiseWeight(ua, 0.9 * k); this.raiseWeight(fa, 0.9 * k);
    }

    // --- balance: ONE hand off the rail, out as a wing, on the manual / grind axis -------
    const bal = this.balSm;
    const balancing = p.trickKind === 'manual' || p.trickKind === 'grind';
    if (balancing || Math.abs(bal) > 0.06) {
      const amp = (balancing ? 0.45 : 0) + Math.min(0.55, Math.abs(bal) * 0.9);
      if (amp > 0.02) {
        // The free hand is the one on the push-leg side; the other stays gripping the backrest.
        const ua = pushIdx === 0 ? UARM_L : UARM_R;
        const fa = pushIdx === 0 ? FARM_L : FARM_R;
        this.blendDir(ua, pushSide * 0.92, 0.28, 0.26, amp * 0.95);
        this.blendDir(fa, pushSide * 0.84, 0.44, 0.30, amp * 0.85);
        this.raiseWeight(ua, 0.95 * amp); this.raiseWeight(fa, 0.95 * amp);
        // The gripping arm only opens up a little — the hand stays on the rail.
        const gua = pushIdx === 0 ? UARM_R : UARM_L;
        this.addRot(gua, 0, 0, -pushSide * 0.20 * amp);
        // Countering a roll means both arms swing the SAME way, not mirrored.
        const wind = -bal * 0.85 * (balancing ? 1 : 0.6);
        this.addGroup(G_ARM_L, 0, 0, wind);
        this.addGroup(G_ARM_R, 0, 0, wind);
        this.addGroup(G_TORSO, 0, 0, -bal * 0.16);
        this.addRot(HEAD, 0, bal * 0.20, 0);
        // The free leg comes off the floor and out to windmill with the arm.
        const th = pushIdx === 0 ? THIGH_L : THIGH_R;
        this.blendDir(th, pushSide * 0.54, -0.74, 0.40, 0.5 * amp);
      }
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

  /**
   * The named trick signature, evaluated at its current envelope value.
   *
   * Two things happen on the way in, both consequences of the kick-push base:
   *
   *  1. STANCE MIRRORING. Every signature in this file is authored for the regular stance (left
   *     knee planted). In goofy the slots swap sides and the lateral components negate, so all
   *     36 tricks read the same way round without a second copy of the table.
   *
   *  2. PLANTED-KNEE PROTECTION. While the wheels are down, the knee is load-bearing: a grind or
   *     a manual that threw it off the seat would read as a glitch. Ops on the planted leg are
   *     therefore damped hard on the ground and released completely in the air, which is exactly
   *     where the big leg shapes (flips, splits, airwalks) were designed to happen anyway.
   */
  private poseTrick(): void {
    const a = this.active;
    if (!a || a.release <= 0) return;

    // Sustained tricks ease in and hold; timed tricks follow their authored envelope.
    const gate = a.sustained
      ? smoothstep(a.t / 0.16) * a.release
      : a.release;

    const goofy = this.config.stance === 'goofy';
    const mirror = goofy ? -1 : 1;
    const plantedTh = this.plantedIndex() === 0 ? THIGH_L : THIGH_R;
    const plantedSh = this.plantedIndex() === 0 ? SHIN_L : SHIN_R;
    const plantedFt = this.plantedIndex() === 0 ? FOOT_L : FOOT_R;
    const plantGate = 0.30 + 0.70 * this.airSm;

    const ops = a.sig.ops;
    for (let i = 0; i < ops.length; i++) {
      const o = ops[i];
      let env = (a.sustained ? 1 : envelope(o.e, a.duration > 0 ? a.t / a.duration : 1)) * gate;
      if (env <= 0.001) continue;
      const slot = goofy ? MIRROR_SLOT[o.s] : o.s;
      if (slot === plantedTh || slot === plantedSh || slot === plantedFt) env *= plantGate;
      if (env <= 0.001) continue;
      if (o.x !== 0 || o.y !== 0 || o.z !== 0) {
        this.addRot(slot, o.x * env, o.y * env * mirror, o.z * env * mirror);
      }
      if (o.k > 0) this.blendDir(slot, o.dx * mirror, o.dy, o.dz, o.k * env);
      if (o.w > 0) this.raiseWeight(slot, o.w * env);
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

  /**
   * A bone's CURRENT position in model space, in metres, walked from the bone's own parent chain.
   *
   * The point of this is the grip solve. Estimating the shoulder analytically ("rotate the rest
   * offset by the lean") is wrong by a few centimetres as soon as anything else touches the torso
   * — the bank, the twist, the push bob, a trick's spine ops — and a few centimetres is the
   * difference between a hand on the backrest rail and a hand hovering beside it.
   *
   * The bones still hold LAST frame's rotations when the pose is being assembled, so this lags by
   * one frame. Everything driving it is exponentially smoothed, so the solve is a fixed point that
   * re-converges every frame; at 60 Hz the lag is invisible and the hands stay welded to the rail.
   */
  private modelPosOf(e: BoneEntry, out: THREE.Vector3): void {
    out.set(0, 0, 0);
    _accQ.identity();
    const chain = e.chain;
    for (let i = 0; i < chain.length; i++) {
      const node = chain[i];
      out.add(_accV.copy(node.position).applyQuaternion(_accQ));
      _accQ.multiply(node.quaternion);
    }
    out.add(_accV.copy(e.bone.position).applyQuaternion(_accQ));
    out.multiplyScalar(this.modelScale);
  }

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

    // Pelvis offset from the anchor, in the CHAIR's frame — which is also the rider's canonical
    // frame, because he faces the chair's +Z (the backrest, his handlebar). `rigForward` describes
    // the MODEL's internal axes only, and is paid for entirely by the yaw below; scaling this
    // offset by it as well double-counts and lands the rider on the far side of the backrest.
    const s = this.config.rigForward;
    chair.getWorldQuaternion(_qWorld);
    _v2.set(this.config.pelvisLateral, this.config.pelvisAboveSeat, this.config.pelvisForward);
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
