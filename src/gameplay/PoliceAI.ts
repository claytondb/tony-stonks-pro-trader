/**
 * PoliceAI — the police squad: perception, pursuit, squad co-ordination and the officers themselves.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The build shipped two unrelated "chase" systems and neither of them was a chase:
 *
 *   - `src/npc/NPCOfficer.ts` spawned officers in IDLE and never left it, because the only
 *     transition into WALKING was out of CHASING. They detected the player by raw Euclidean
 *     distance straight through cubicle walls, walked at a fixed Y with no collision (so they
 *     drifted through desks and partitions), and `stun()` was never called by anything.
 *   - `src/story/ChaseMechanic.ts` was a 0-100 scalar racing against `playerSpeed`, drawing three
 *     decorative capsule blobs pinned behind the camera. It had no relationship to the officers.
 *
 * This module replaces both with one system that actually plays: officers patrol a route from the
 * first frame, see the player with an FOV cone AND a physics line-of-sight ray (so a cubicle wall
 * really does hide you), hear him when he is loud, escalate through suspicious -> alert -> chasing,
 * remember where they last saw him, search that area when they lose him, run out of breath and give
 * up — and go down like bowling pins when a chair hits them at speed.
 *
 * COORDINATE / ORIGIN CONTRACT
 * ----------------------------
 *   - An officer's root origin is on the FLOOR between his feet.
 *   - The model faces +Z, so `root.rotation.y = atan2(forward.x, forward.z)` with no offset.
 *   - `pos` is the authoritative simulation state; the Object3D is written from it, never read.
 *
 * PHYSICS COUPLING
 * ----------------
 * `physicsWorld` is deliberately typed `any`: `PhysicsWorld` exposes only a downward
 * `raycastGround()`, and this module needs arbitrary-direction rays for line of sight and obstacle
 * probes. It therefore resolves, in order of preference:
 *      physicsWorld.castRay(origin, dir, maxDist)      (if a project-level helper ever lands)
 *      physicsWorld.world / physicsWorld.getWorld()    (the raw Rapier world, duck-typed)
 * and degrades gracefully: with no ray source at all the officers still patrol, still steer around
 * any Box3 blockers registered via `addBlocker()`, and simply lose wall-occlusion on vision.
 * Ground follow uses `physicsWorld.raycastGround()` when present, else a flat y = 0 plane.
 *
 * RENDER COST
 * -----------
 * The articulated rig is 19 merged meshes (one per material per animated bone group) and ~1.3k
 * triangles. Beyond `lodDistance` (default 34 m) each officer swaps to a single-piece merged proxy
 * baked into a mid-stride pose: 4 meshes, same triangle count. Beyond `cullDistance` (default 70 m)
 * the model is hidden entirely and only the simulation runs. Four officers on screen at close range
 * therefore cost 76 draw calls; four officers across the room cost 16.
 */

import * as THREE from 'three';
import { MaterialLibrary, type MaterialId } from '../materials/MaterialLibrary';
import {
  PartBuilder, applyRimLight, chamferBox, shear, taper, type Placement,
} from '../player/LowPolyKit';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type OfficerState =
  | 'patrol'      // walking the route, scanning
  | 'suspicious'  // something registered; stop, turn, stare
  | 'alert'       // positive ID; the shout + point beat before the sprint
  | 'chasing'     // full pursuit, burning stamina
  | 'searching'   // lost him; sweep the last known position
  | 'stunned'     // knocked flat
  | 'winded';     // out of breath, hands on knees, giving up

export interface OfficerConfig {
  /** World-space route. Two or more points make a ping-pong patrol; one point is a post. */
  patrolPoints: THREE.Vector3[];
  /** m/s on patrol. */
  walkSpeed: number;
  /** m/s in pursuit. */
  runSpeed: number;
  /** Full horizontal cone angle in degrees. Widens once he already knows where you are. */
  fovDegrees: number;
  /** Metres. How far down the cone he can resolve a target. */
  viewDistance: number;
  /** Metres at maximum player noise. Hearing ignores walls but is much shorter than sight. */
  hearingRadius: number;
  /** Metres. Inside this, while chasing, you are caught. */
  catchRadius: number;
  /** Seconds of sprint before he is winded. */
  stamina: number;
}

export interface SquadEvent {
  type: 'spotted' | 'lost' | 'caught' | 'stunned' | 'alerted';
  officerId: string;
  position: THREE.Vector3;
}

/** Sane starting point; `spawn()` fills any field the caller omits from these. */
export const DEFAULT_OFFICER_CONFIG: OfficerConfig = {
  patrolPoints: [],
  walkSpeed: 2.4,
  runSpeed: 7.2,
  fovDegrees: 105,
  viewDistance: 24,
  hearingRadius: 14,
  catchRadius: 1.75,
  stamina: 9,
};

/** Read-only snapshot for HUD / debug overlays. */
export interface OfficerSnapshot {
  id: string;
  state: OfficerState;
  position: THREE.Vector3;
  suspicion: number;
  stamina01: number;
  distance: number;
  sees: boolean;
}

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

const EYE_HEIGHT = 1.55;
const CHEST_HEIGHT = 0.60;
const KNEE_HEIGHT = 0.28;
/** Heights the wall-deflection ray is cast at: torso, and the height of a desk edge. */
const DEFLECT_HEIGHTS = [0.60, 0.28];
/** Target height on the player used for the line-of-sight ray (chair seat + a bit of torso). */
const PLAYER_TARGET_Y = 0.55;
/** Stop the LOS ray short of the player so his own dynamic chair collider cannot occlude him. */
const LOS_SLACK = 0.8;

const LOS_INTERVAL = 0.11;      // s between line-of-sight rays per officer (staggered)
const SUSPICION_MAX = 1.0;
const SUSPICION_SUSPICIOUS = 0.28;
const SIGHT_GAIN = 2.7;         // suspicion/s at point blank, dead centre, player moving
const HEAR_GAIN = 1.05;
const DECAY_PATROL = 0.55;
const DECAY_SEARCH = 0.22;

const ALERT_DWELL = 0.45;       // s of "HEY!" before the sprint starts
const MEMORY_TIME = 3.0;        // s he keeps running at your last known position after losing sight
const SEARCH_TIME = 8.0;
const SQUAD_ALERT_RADIUS = 22;  // m — a spotter drags everyone this close into the chase
const CAUGHT_COOLDOWN = 2.5;

const KNOCK_SPEED = 5.5;        // m/s of player closing speed required to bowl an officer over
const KNOCK_RADIUS = 1.15;

const ACCEL = 8.0;              // velocity smoothing rate
const TURN_RATE = 7.0;          // yaw smoothing rate
const AVOID_WEIGHT = 1.35;
const SEPARATION_RADIUS = 1.3;

// ---------------------------------------------------------------------------
// Scratch — this file allocates nothing per frame
// ---------------------------------------------------------------------------

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
const _f = new THREE.Vector3();
const _g = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Frame-rate independent exponential approach. */
function approach(dt: number, rate: number): number {
  return 1 - Math.exp(-rate * dt);
}

// ---------------------------------------------------------------------------
// Officer proportions (metres, root on the floor, facing +Z)
// ---------------------------------------------------------------------------

const HIP_Y = 0.86;
const HIP_X = 0.115;
const THIGH = 0.44;
const NECK_Y = 0.50;       // above the waist pivot
const SHOULDER_Y = 0.42;   // above the waist pivot
const SHOULDER_X = 0.215;
const UPPER_ARM = 0.26;

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

interface OfficerMats {
  navy: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  black: THREE.MeshStandardMaterial;
  /** [derived, library source] pairs, so the IBL can be re-synced if it is bound after spawn. */
  pairs: Array<[THREE.MeshStandardMaterial, THREE.MeshStandardMaterial]>;
}

let SHARED_MATS: OfficerMats | null = null;

/**
 * The four officer surfaces, derived from the MaterialLibrary entries authored against the refs.
 *
 * The library instances are shared and must not be mutated, and they carry neither `vertexColors`
 * nor `flatShading` — both of which a faceted low-poly figure needs (the baked vertex occlusion is
 * what stops a navy uniform collapsing into one silhouette in shadow). So each is cloned once,
 * process-wide, and the clone gets the character treatment: flat shading, vertex colours, and the
 * camera-relative Fresnel rim that separates a navy cop from a grey cubicle.
 */
function officerMats(): OfficerMats {
  if (SHARED_MATS) return SHARED_MATS;

  const pairs: Array<[THREE.MeshStandardMaterial, THREE.MeshStandardMaterial]> = [];
  const derive = (id: MaterialId, rim: number): THREE.MeshStandardMaterial => {
    const src = MaterialLibrary.get(id);
    const m = src.clone() as THREE.MeshStandardMaterial;
    m.name = `officer_${id}`;
    m.vertexColors = true;
    m.flatShading = true;
    applyRimLight(m, { color: 0xa8c0e6, power: 2.7, strength: rim });
    m.needsUpdate = true;
    pairs.push([m, src]);
    return m;
  };

  SHARED_MATS = {
    // The uniform is the darkest large mass in frame, so it carries the strongest rim.
    navy: derive('copNavy', 0.55),
    gold: derive('copBadgeGold', 0.16),
    skin: derive('skinLight', 0.22),
    black: derive('shoeBlack', 0.62),
    pairs,
  };
  return SHARED_MATS;
}

// ---------------------------------------------------------------------------
// Geometry emitters
//
// Each emitter writes one bone group's parts into a PartBuilder. `o` is the group's origin and `a`
// is a bake rotation about X: the articulated rig passes (0,0,0) / 0 because every group has its
// own transform, while the merged LOD proxy passes the group's rest transform so a whole stride can
// be flattened into a single draw.
// ---------------------------------------------------------------------------

function rotX(o: THREE.Vector3, a: number, lx: number, ly: number, lz: number): [number, number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [o.x + lx, o.y + ly * c - lz * s, o.z + ly * s + lz * c];
}

function pl(
  o: THREE.Vector3, a: number, l: [number, number, number],
  tint?: Placement['tint'], extraX = 0,
): Placement {
  const p: Placement = { pos: rotX(o, a, l[0], l[1], l[2]), rot: [a + extraX, 0, 0] };
  if (tint) p.tint = tint;
  return p;
}

/** Torso: pelvis, duty belt, shirt, shoulder yoke, collar, badge, name bar, radio. */
function emitTorso(b: PartBuilder, M: OfficerMats, o: THREE.Vector3, a: number): void {
  // Trousers mass. Darkened well below the shirt so the figure reads in two values from 40 m.
  b.add(taper(chamferBox(0.335, 0.20, 0.245, 0.045), 'y', 1.0, 0.94),
    M.navy, pl(o, a, [0, -0.07, 0], { tint: 0x6b7079, ao: 0.55 }));

  // Duty belt + buckle.
  b.add(chamferBox(0.362, 0.078, 0.262, 0.022),
    M.black, pl(o, a, [0, 0.045, 0], { tint: 0xbdbdbd, ao: 0.30 }));
  b.add(chamferBox(0.078, 0.056, 0.030, 0.012),
    M.gold, pl(o, a, [0, 0.045, 0.132]));
  // Holster on the right hip, radio on the left. Silhouette clutter reads as "police" instantly.
  b.add(chamferBox(0.082, 0.155, 0.095, 0.022),
    M.black, pl(o, a, [0.185, -0.035, 0.015], { tint: 0xd6d6d6, ao: 0.35 }));
  b.add(chamferBox(0.062, 0.115, 0.048, 0.016),
    M.black, pl(o, a, [-0.190, 0.010, 0.020], { tint: 0xe4e4e4 }));

  // Shirt. Tapered to a V and the lightest navy value on the figure.
  b.add(taper(chamferBox(0.395, 0.335, 0.245, 0.050), 'y', 0.90, 1.05),
    M.navy, pl(o, a, [0, 0.245, 0], { ao: 0.34, back: 0.26 }));
  // Shoulder yoke / vest: a darker plane change across the top of the chest.
  b.add(taper(chamferBox(0.428, 0.135, 0.258, 0.038), 'y', 1.0, 0.95),
    M.navy, pl(o, a, [0, 0.385, 0], { tint: 0x9aa2b2, ao: 0.20, back: 0.22 }));
  // Collar wings.
  b.add(chamferBox(0.205, 0.062, 0.165, 0.020),
    M.navy, pl(o, a, [0, 0.458, 0.012], { tint: 0xb8c0cf }));
  // Button placket — one dark line down the front stops the chest reading as a flat slab.
  b.add(chamferBox(0.030, 0.290, 0.020, 0.008),
    M.navy, pl(o, a, [0, 0.250, 0.126], { tint: 0x5c626c }));

  // Chest badge (shield) + name bar. The only high-chroma notes on the whole officer.
  b.add(chamferBox(0.078, 0.092, 0.022, 0.012),
    M.gold, pl(o, a, [-0.112, 0.300, 0.126]));
  b.add(chamferBox(0.090, 0.030, 0.018, 0.008),
    M.gold, pl(o, a, [0.105, 0.318, 0.126], { tint: 0xcfcfcf }));
}

/** Head: neck, skull, jaw, ears, sunglasses, moustache, peaked cap with gold pin. */
function emitHead(b: PartBuilder, M: OfficerMats, o: THREE.Vector3, a: number): void {
  b.add(chamferBox(0.100, 0.075, 0.100, 0.020),
    M.skin, pl(o, a, [0, 0.030, 0], { tint: 0x9d9d9d, ao: 0.55 }));

  b.add(chamferBox(0.205, 0.200, 0.196, 0.036),
    M.skin, pl(o, a, [0, 0.168, 0.004], { ao: 0.34, back: 0.20 }));
  // Jaw, sheared forward: a low-poly head with no jaw plane reads as a cube.
  b.add(shear(chamferBox(0.176, 0.080, 0.165, 0.028), 'z', 'y', -0.16),
    M.skin, pl(o, a, [0, 0.086, -0.008], { tint: 0xe6e6e6, ao: 0.40 }));
  b.add(chamferBox(0.028, 0.062, 0.052, 0.012),
    M.skin, pl(o, a, [0.106, 0.156, -0.012], { tint: 0xdadada }));
  b.add(chamferBox(0.028, 0.062, 0.052, 0.012),
    M.skin, pl(o, a, [-0.106, 0.156, -0.012], { tint: 0xdadada }));

  // Aviators. In the refs this single black band is what makes the cops read as cops in one frame.
  b.add(chamferBox(0.212, 0.054, 0.036, 0.012),
    M.black, pl(o, a, [0, 0.186, 0.094], { tint: 0x8f8f8f }));
  b.add(chamferBox(0.088, 0.026, 0.030, 0.008),
    M.black, pl(o, a, [0, 0.100, 0.090], { tint: 0xb0b0b0 }));

  // Peaked cap: crown, band, peak, pin.
  b.add(taper(chamferBox(0.228, 0.102, 0.218, 0.032), 'y', 1.0, 0.84),
    M.navy, pl(o, a, [0, 0.312, 0.006], { ao: 0.24, back: 0.24 }));
  b.add(chamferBox(0.234, 0.034, 0.224, 0.014),
    M.black, pl(o, a, [0, 0.259, 0.006], { tint: 0xc4c4c4 }));
  b.add(chamferBox(0.206, 0.024, 0.118, 0.012),
    M.black, pl(o, a, [0, 0.252, 0.132], { tint: 0xdedede }, -0.20));
  b.add(chamferBox(0.056, 0.060, 0.024, 0.010),
    M.gold, pl(o, a, [0, 0.316, 0.108]));
}

/** Upper arm: short navy sleeve. */
function emitArmUpper(b: PartBuilder, M: OfficerMats, o: THREE.Vector3, a: number, side: number): void {
  b.add(chamferBox(0.138, 0.118, 0.142, 0.032),
    M.navy, pl(o, a, [side * 0.008, -0.045, 0], { tint: 0xb6bccb, ao: 0.18 }));
  b.add(taper(chamferBox(0.124, 0.145, 0.132, 0.030), 'y', 0.86, 1.0),
    M.navy, pl(o, a, [side * 0.004, -0.158, 0], { ao: 0.30, back: 0.20 }));
}

/** Forearm: bare skin, black tactical glove, and (right hand only) the baton. */
function emitArmLower(b: PartBuilder, M: OfficerMats, o: THREE.Vector3, a: number, baton: boolean): void {
  // The forearm deliberately overshoots the elbow pivot by 0.04 so the sleeve never opens a gap
  // when the elbow bends; the glove likewise overlaps the wrist.
  b.add(taper(chamferBox(0.102, 0.250, 0.102, 0.026), 'y', 0.80, 1.0),
    M.skin, pl(o, a, [0, -0.085, 0], { ao: 0.30 }));
  b.add(chamferBox(0.098, 0.118, 0.118, 0.024),
    M.black, pl(o, a, [0, -0.265, -0.008], { tint: 0xc8c8c8, ao: 0.35 }));
  if (baton) {
    // Held forward along the forearm's swing plane; merges into the same black bucket, so free.
    b.add(chamferBox(0.036, 0.430, 0.036, 0.014),
      M.black, pl(o, a, [0, -0.278, 0.150], { tint: 0xe8e8e8 }, 1.42));
  }
}

/** Thigh. */
function emitThigh(b: PartBuilder, M: OfficerMats, o: THREE.Vector3, a: number): void {
  b.add(taper(chamferBox(0.156, 0.450, 0.168, 0.038), 'y', 0.84, 1.02),
    M.navy, pl(o, a, [0, -0.220, 0], { tint: 0x6b7079, ao: 0.30, back: 0.20 }));
}

/** Shin + boot. */
function emitShin(b: PartBuilder, M: OfficerMats, o: THREE.Vector3, a: number): void {
  b.add(taper(chamferBox(0.132, 0.400, 0.138, 0.032), 'y', 0.78, 1.0),
    M.navy, pl(o, a, [0, -0.195, 0], { tint: 0x5f646d, ao: 0.35, back: 0.20 }));
  b.add(shear(chamferBox(0.136, 0.100, 0.250, 0.028), 'y', 'z', 0.09),
    M.black, pl(o, a, [0, -0.370, 0.042], { tint: 0xd0d0d0, ao: 0.45 }));
}

// ---------------------------------------------------------------------------
// Rig
// ---------------------------------------------------------------------------

interface Rig {
  root: THREE.Group;
  /** Whole-figure pivot at the feet: bob, and the knockdown fall. */
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  shoulder: [THREE.Group, THREE.Group];
  elbow: [THREE.Group, THREE.Group];
  hip: [THREE.Group, THREE.Group];
  knee: [THREE.Group, THREE.Group];
  triangles: number;
}

function buildRig(M: OfficerMats): Rig {
  const root = new THREE.Group();
  root.name = 'officerRig';

  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Group();
  torso.position.set(0, HIP_Y, 0);
  body.add(torso);

  const head = new THREE.Group();
  head.position.set(0, NECK_Y, 0);
  torso.add(head);

  const zero = new THREE.Vector3();
  let tris = 0;

  const tb = new PartBuilder();
  emitTorso(tb, M, zero, 0);
  tris += tb.flushInto(torso, 'copTorso');

  const hb = new PartBuilder();
  emitHead(hb, M, zero, 0);
  tris += hb.flushInto(head, 'copHead');

  const shoulder: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];
  const elbow: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];
  const hip: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];
  const knee: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];

  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;

    shoulder[i].position.set(side * SHOULDER_X, SHOULDER_Y, 0);
    torso.add(shoulder[i]);
    const sb = new PartBuilder();
    emitArmUpper(sb, M, zero, 0, side);
    tris += sb.flushInto(shoulder[i], 'copArmU');

    elbow[i].position.set(0, -UPPER_ARM, 0);
    shoulder[i].add(elbow[i]);
    const eb = new PartBuilder();
    emitArmLower(eb, M, zero, 0, side > 0);
    tris += eb.flushInto(elbow[i], 'copArmL');

    hip[i].position.set(side * HIP_X, HIP_Y, 0);
    body.add(hip[i]);
    const pb = new PartBuilder();
    emitThigh(pb, M, zero, 0);
    tris += pb.flushInto(hip[i], 'copThigh');

    knee[i].position.set(0, -THIGH, 0);
    hip[i].add(knee[i]);
    const kb = new PartBuilder();
    emitShin(kb, M, zero, 0);
    tris += kb.flushInto(knee[i], 'copShin');
  }

  return { root, body, torso, head, shoulder, elbow, hip, knee, triangles: tris };
}

/**
 * The distance proxy: the identical part list flattened into ONE PartBuilder with a mid-stride
 * pose baked in, which collapses 19 draw calls into 4. At >34 m the frozen stride is a couple of
 * pixels of difference and nobody will ever see it; the draw calls are real.
 */
function buildProxy(M: OfficerMats): THREE.Group {
  const g = new THREE.Group();
  g.name = 'officerProxy';
  const b = new PartBuilder();

  const torsoPitch = 0.14;
  const torsoO = new THREE.Vector3(0, HIP_Y, 0);
  emitTorso(b, M, torsoO, torsoPitch);

  const headP = rotX(torsoO, torsoPitch, 0, NECK_Y, 0);
  emitHead(b, M, new THREE.Vector3(headP[0], headP[1], headP[2]), torsoPitch * 0.4);

  const armSwing = [-0.55, 0.45];
  const elbowBend = [-1.05, -0.85];
  const legSwing = [0.42, -0.38];
  const kneeBend = [0.30, 0.85];

  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;

    const sp = rotX(torsoO, torsoPitch, side * SHOULDER_X, SHOULDER_Y, 0);
    const shoulderO = new THREE.Vector3(sp[0], sp[1], sp[2]);
    const sa = torsoPitch + armSwing[i];
    emitArmUpper(b, M, shoulderO, sa, side);

    const ep = rotX(shoulderO, sa, 0, -UPPER_ARM, 0);
    emitArmLower(b, M, new THREE.Vector3(ep[0], ep[1], ep[2]), sa + elbowBend[i], side > 0);

    const hipO = new THREE.Vector3(side * HIP_X, HIP_Y, 0);
    emitThigh(b, M, hipO, legSwing[i]);

    const kp = rotX(hipO, legSwing[i], 0, -THIGH, 0);
    emitShin(b, M, new THREE.Vector3(kp[0], kp[1], kp[2]), legSwing[i] + kneeBend[i]);
  }

  b.flushInto(g, 'copProxy');
  return g;
}

// ---------------------------------------------------------------------------
// Officer instance
// ---------------------------------------------------------------------------

interface Officer {
  id: string;
  cfg: OfficerConfig;
  spawnPos: THREE.Vector3;
  spawnYaw: number;

  group: THREE.Group;
  rig: Rig;
  proxy: THREE.Group;

  state: OfficerState;
  stateTime: number;

  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  targetYaw: number;
  speedNow: number;

  patrolIndex: number;
  patrolDir: number;
  waitTimer: number;

  suspicion: number;
  memory: number;
  lastKnown: THREE.Vector3;
  lastKnownVel: THREE.Vector3;
  searchTarget: THREE.Vector3;
  searchTimer: number;
  searchHop: number;

  stamina: number;
  windedTimer: number;
  stunTimer: number;
  fall: number;         // 0..1 knockdown blend
  fallDir: number;      // +1 forward, -1 backward
  fallRoll: number;

  losTimer: number;
  losClear: boolean;
  sees: boolean;
  hears: number;
  dist: number;
  goal: THREE.Vector3;
  gait: number;
  headYaw: number;
  headPitch: number;
  slot: number;
  alertedThisFrame: boolean;
  blocked: number;
}

// ---------------------------------------------------------------------------
// Physics adapters (duck-typed; see the header note)
// ---------------------------------------------------------------------------

interface Vec3Like { x: number; y: number; z: number }

interface RapierLike {
  castRayAndGetNormal(
    ray: { origin: Vec3Like; dir: Vec3Like },
    maxToi: number,
    solid: boolean,
  ): { toi: number; normal: Vec3Like } | null | undefined;
}

interface GroundHit { point: THREE.Vector3 }

/** Result of a generic ray. `n` is the surface normal, valid only when `hit` is true. */
interface Probe { hit: boolean; toi: number; n: THREE.Vector3 }

const _probe: Probe = { hit: false, toi: 0, n: new THREE.Vector3() };
const _ray = { origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 0 } };

// ---------------------------------------------------------------------------
// PoliceSquad
// ---------------------------------------------------------------------------

export class PoliceSquad {
  private scene: THREE.Scene;
  private officers: Officer[] = [];
  private listeners: Array<(e: SquadEvent) => void> = [];

  private rapier: RapierLike | null = null;
  private groundFn: ((origin: THREE.Vector3, maxDistance: number) => GroundHit | null) | null = null;
  private customRay: ((o: THREE.Vector3, d: THREE.Vector3, max: number) => Probe | null) | null = null;
  private rayFailed = false;

  /** Extra occluders/obstacles for levels whose set dressing has no physics colliders. */
  private blockers: THREE.Box3[] = [];

  private nextId = 0;
  private heat = 0;
  private _nearest = Infinity;
  private caughtCooldown = 0;
  private matSyncTimer = 0;
  private time = 0;

  private playerPos = new THREE.Vector3();
  private playerVel = new THREE.Vector3();
  private playerSpeed = 0;
  private noise = 0;

  /** Beyond this, an officer renders as the 4-draw merged proxy. */
  lodDistance = 34;
  /** Beyond this, an officer is not rendered at all (the simulation keeps running). */
  cullDistance = 70;

  constructor(scene: THREE.Scene, physicsWorld: any) {
    this.scene = scene;
    this.bindPhysics(physicsWorld);
  }

  // -------------------------------------------------------------------------
  // Physics binding
  // -------------------------------------------------------------------------

  private bindPhysics(pw: any): void {
    if (!pw) return;

    if (typeof pw.raycastGround === 'function') {
      this.groundFn = (o, max) => {
        try {
          return pw.raycastGround(o, max) as GroundHit | null;
        } catch {
          return null;
        }
      };
    }

    // A project-level arbitrary-direction raycast, if one ever gets added to PhysicsWorld.
    if (typeof pw.castRay === 'function') {
      this.customRay = (o, d, max) => {
        try {
          const r = pw.castRay(o, d, max);
          if (!r || (r.hit === false)) return null;
          const n = r.normal as Vec3Like | undefined;
          _probe.hit = true;
          _probe.toi = (r.toi ?? r.distance ?? 0) as number;
          _probe.n.set(n?.x ?? 0, n?.y ?? 1, n?.z ?? 0);
          return _probe;
        } catch {
          return null;
        }
      };
      return;
    }

    // Otherwise reach for the raw Rapier world. PhysicsWorld keeps it `private`, which is a
    // compile-time notion only — the field is there at runtime and this module never mutates it.
    const w = pw.world ?? (typeof pw.getWorld === 'function' ? pw.getWorld() : null);
    if (w && typeof w.castRayAndGetNormal === 'function') this.rapier = w as RapierLike;
  }

  /**
   * A generic ray. Returns a SHARED Probe — read it before the next call.
   * Falls back to the registered Box3 blockers when there is no physics ray source.
   */
  private ray(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): Probe | null {
    let best: Probe | null = null;

    if (this.customRay) {
      best = this.customRay(origin, dir, maxDist);
    } else if (this.rapier && !this.rayFailed) {
      try {
        _ray.origin.x = origin.x; _ray.origin.y = origin.y; _ray.origin.z = origin.z;
        _ray.dir.x = dir.x; _ray.dir.y = dir.y; _ray.dir.z = dir.z;
        const hit = this.rapier.castRayAndGetNormal(_ray, maxDist, true);
        if (hit) {
          _probe.hit = true;
          _probe.toi = hit.toi;
          _probe.n.set(hit.normal.x, hit.normal.y, hit.normal.z);
          best = _probe;
        }
      } catch (err) {
        // One warning, then permanently fall back rather than spamming the console every frame.
        this.rayFailed = true;
        console.warn('[PoliceAI] physics raycast unavailable, falling back to blocker boxes', err);
      }
    }

    if (this.blockers.length > 0) {
      const bt = this.rayBlockers(origin, dir, maxDist);
      if (bt >= 0 && (!best || bt < best.toi)) {
        _probe.hit = true;
        _probe.toi = bt;
        // Approximate normal: oppose the ray. Good enough for a wall slide.
        _probe.n.set(-dir.x, 0, -dir.z).normalize();
        best = _probe;
      }
    }

    return best;
  }

  /** Slab test against the registered blockers. Returns toi, or -1. */
  private rayBlockers(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): number {
    let best = -1;
    for (const box of this.blockers) {
      let tmin = 0;
      let tmax = maxDist;
      let ok = true;
      for (let axis = 0; axis < 3 && ok; axis++) {
        const od = axis === 0 ? d.x : axis === 1 ? d.y : d.z;
        const oo = axis === 0 ? o.x : axis === 1 ? o.y : o.z;
        const lo = axis === 0 ? box.min.x : axis === 1 ? box.min.y : box.min.z;
        const hi = axis === 0 ? box.max.x : axis === 1 ? box.max.y : box.max.z;
        if (Math.abs(od) < 1e-6) {
          if (oo < lo || oo > hi) ok = false;
        } else {
          const inv = 1 / od;
          let t1 = (lo - oo) * inv;
          let t2 = (hi - oo) * inv;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
          if (t1 > tmin) tmin = t1;
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) ok = false;
        }
      }
      if (ok && tmin >= 0 && tmin <= maxDist && (best < 0 || tmin < best)) best = tmin;
    }
    return best;
  }

  /** Floor height under `p`, searching from `fromY + 1.1` downward. Null = no floor / a drop. */
  private groundAt(p: THREE.Vector3, fromY: number): number | null {
    _origin.set(p.x, fromY + 1.1, p.z);
    if (this.groundFn) {
      const g = this.groundFn(_origin, 3.2);
      if (g && g.point) {
        // Refuse to step off a ledge: officers are not supposed to pratfall off the mezzanine.
        if (g.point.y < fromY - 0.85) return null;
        return g.point.y;
      }
      return null;
    }
    if (this.rapier || this.customRay) {
      _dir.set(0, -1, 0);
      const hit = this.ray(_origin, _dir, 3.2);
      if (hit) {
        const y = _origin.y - hit.toi;
        if (y < fromY - 0.85) return null;
        return y;
      }
      return null;
    }
    return 0; // No physics at all: assume the level's floor is the y = 0 plane.
  }

  // -------------------------------------------------------------------------
  // Spawning
  // -------------------------------------------------------------------------

  /**
   * Add an officer. Every `OfficerConfig` field is optional and falls back to
   * `DEFAULT_OFFICER_CONFIG`, so a caller supplying the full config also typechecks.
   * Returns the officer's id (auto-generated when not supplied).
   */
  spawn(config: Partial<OfficerConfig> & { position: THREE.Vector3; id?: string }): string {
    const M = officerMats();
    const cfg: OfficerConfig = {
      patrolPoints: (config.patrolPoints ?? DEFAULT_OFFICER_CONFIG.patrolPoints).map((p) => p.clone()),
      walkSpeed: config.walkSpeed ?? DEFAULT_OFFICER_CONFIG.walkSpeed,
      runSpeed: config.runSpeed ?? DEFAULT_OFFICER_CONFIG.runSpeed,
      fovDegrees: config.fovDegrees ?? DEFAULT_OFFICER_CONFIG.fovDegrees,
      viewDistance: config.viewDistance ?? DEFAULT_OFFICER_CONFIG.viewDistance,
      hearingRadius: config.hearingRadius ?? DEFAULT_OFFICER_CONFIG.hearingRadius,
      catchRadius: config.catchRadius ?? DEFAULT_OFFICER_CONFIG.catchRadius,
      stamina: config.stamina ?? DEFAULT_OFFICER_CONFIG.stamina,
    };

    const id = config.id ?? `officer_${this.nextId++}`;
    const group = new THREE.Group();
    group.name = `police_${id}`;

    const rig = buildRig(M);
    const proxy = buildProxy(M);
    proxy.visible = false;
    group.add(rig.root, proxy);

    const pos = config.position.clone();
    // Drop onto the floor immediately so the first frame is not a hover.
    const gy = this.groundAt(pos, pos.y + 0.5);
    if (gy !== null) pos.y = gy;

    // Face the first patrol leg out of the gate; a cop staring at a wall reads as broken.
    let yaw = 0;
    if (cfg.patrolPoints.length > 0) {
      _a.copy(cfg.patrolPoints[0]).sub(pos);
      if (_a.lengthSq() > 1e-4) yaw = Math.atan2(_a.x, _a.z);
    }

    const o: Officer = {
      id, cfg,
      spawnPos: pos.clone(),
      spawnYaw: yaw,
      group, rig, proxy,
      state: 'patrol',
      stateTime: 0,
      pos,
      vel: new THREE.Vector3(),
      yaw,
      targetYaw: yaw,
      speedNow: 0,
      patrolIndex: 0,
      patrolDir: 1,
      waitTimer: 0,
      suspicion: 0,
      memory: 0,
      lastKnown: pos.clone(),
      lastKnownVel: new THREE.Vector3(),
      searchTarget: pos.clone(),
      searchTimer: 0,
      searchHop: 0,
      stamina: cfg.stamina,
      windedTimer: 0,
      stunTimer: 0,
      fall: 0,
      fallDir: -1,
      fallRoll: 0,
      // Stagger the LOS rays so four officers never raycast on the same frame.
      losTimer: (this.officers.length * LOS_INTERVAL) / 4,
      losClear: false,
      sees: false,
      hears: 0,
      dist: Infinity,
      goal: pos.clone(),
      gait: Math.random() * Math.PI * 2,
      headYaw: 0,
      headPitch: 0,
      slot: 0,
      alertedThisFrame: false,
      blocked: 0,
    };

    group.position.copy(pos);
    group.rotation.y = yaw;
    this.scene.add(group);
    this.officers.push(o);
    return id;
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  on(cb: (e: SquadEvent) => void): () => void {
    this.listeners.push(cb);
    return () => {
      const i = this.listeners.indexOf(cb);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  private fire(type: SquadEvent['type'], o: Officer, at?: THREE.Vector3): void {
    if (this.listeners.length === 0) return;
    const e: SquadEvent = { type, officerId: o.id, position: (at ?? o.pos).clone() };
    for (const cb of this.listeners.slice()) {
      try {
        cb(e);
      } catch (err) {
        console.warn('[PoliceAI] squad listener threw', err);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  /**
   * @param playerNoise 0..1+ — how loud the player is RIGHT NOW. Grinding, smashing a desk and
   *        landing all spike this; coasting is near zero. Speed contributes on its own, so passing
   *        a constant 0 still leaves a fast player audible.
   */
  update(dt: number, playerPos: THREE.Vector3, playerVel: THREE.Vector3, playerNoise: number): void {
    if (this.officers.length === 0) {
      this._nearest = Infinity;
      this.heat = Math.max(0, this.heat - dt * 0.6);
      return;
    }

    const step = clamp(dt, 0, 1 / 20);
    this.time += step;
    if (this.caughtCooldown > 0) this.caughtCooldown -= step;

    this.playerPos.copy(playerPos);
    this.playerVel.copy(playerVel);
    this.playerSpeed = Math.hypot(playerVel.x, playerVel.z);
    this.noise = clamp(playerNoise, 0, 2);

    this.syncMaterials(step);

    // 1. Perception.
    this._nearest = Infinity;
    for (const o of this.officers) {
      o.alertedThisFrame = false;
      this.perceive(o, step);
      if (o.dist < this._nearest) this._nearest = o.dist;
    }

    // 2. State machine (this is where 'spotted' fires and the squad broadcast happens).
    for (const o of this.officers) this.tickState(o, step);

    // 3. Squad roles: who tail-chases and who cuts him off.
    this.assignSlots();

    // 4. Locomotion + pose.
    for (const o of this.officers) {
      this.pickGoal(o, step);
      this.locomote(o, step);
      this.pose(o, step);
      this.writeTransform(o);
    }

    // 5. Getting bowled over is the whole fantasy; it should not need wiring up.
    this.checkKnockdowns();

    // 6. Heat.
    this.updateHeat(step);
  }

  /**
   * The officer materials are clones of the MaterialLibrary entries, so if the IBL is bound after
   * the officers spawn the clones would sit un-lit. Cheap 2 Hz re-sync instead of a subscription.
   */
  private syncMaterials(dt: number): void {
    this.matSyncTimer -= dt;
    if (this.matSyncTimer > 0) return;
    this.matSyncTimer = 0.5;
    const M = SHARED_MATS;
    if (!M) return;
    for (const [m, src] of M.pairs) {
      if (m.envMap !== src.envMap) {
        const had = m.envMap !== null;
        m.envMap = src.envMap;
        if (had !== (src.envMap !== null)) m.needsUpdate = true;
      }
      m.envMapIntensity = src.envMapIntensity;
    }
  }

  // -------------------------------------------------------------------------
  // Perception
  // -------------------------------------------------------------------------

  private perceive(o: Officer, dt: number): void {
    const aware = o.state === 'chasing' || o.state === 'alert';

    _a.set(o.pos.x, o.pos.y + EYE_HEIGHT, o.pos.z);
    _b.set(this.playerPos.x, this.playerPos.y + PLAYER_TARGET_Y, this.playerPos.z);
    _c.subVectors(_b, _a);
    const dist = _c.length();
    o.dist = dist;

    o.sees = false;
    o.hears = 0;

    if (o.state === 'stunned') {
      // Face down on the carpet: no vision, and only the loudest noise registers.
      o.suspicion = Math.max(0, o.suspicion - dt * 0.15);
      o.memory = Math.max(0, o.memory - dt);
      return;
    }

    // --- hearing: ignores walls, but is short and needs the player to be making a racket -------
    const speedNoise = clamp(this.playerSpeed / 11, 0, 1);
    const loud = clamp(Math.max(this.noise, speedNoise * 0.85), 0, 1);
    const hearR = o.cfg.hearingRadius * (0.22 + 0.90 * loud);
    if (dist < hearR && hearR > 0.5) o.hears = 1 - dist / hearR;

    // --- vision: FOV cone AND line of sight ---------------------------------------------------
    const viewRange = o.cfg.viewDistance * (aware ? 1.20 : 1.0) * (1 + 0.25 * loud);
    if (dist <= viewRange) {
      _d.set(_c.x, 0, _c.z);
      const flat = _d.length();
      _e.set(Math.sin(o.yaw), 0, Math.cos(o.yaw));
      const cosA = flat > 1e-4 ? _d.dot(_e) / flat : 1;

      // Once he has positively identified you he stops needing to look straight at you.
      const fovDeg = clamp(o.cfg.fovDegrees * (aware ? 1.75 : 1.0), 10, 340);
      const cosHalf = Math.cos(THREE.MathUtils.degToRad(fovDeg * 0.5));
      // Anything inside 2.5 m is noticed regardless of the cone — peripheral vision.
      const inCone = cosA >= cosHalf || dist < 2.5;

      if (inCone) {
        o.losTimer -= dt;
        if (o.losTimer <= 0) {
          o.losTimer = LOS_INTERVAL;
          o.losClear = this.lineOfSight(_a, _c, dist);
        }
        o.sees = o.losClear;
      } else {
        o.losClear = false;
      }
    } else {
      o.losClear = false;
    }

    // --- suspicion integration ----------------------------------------------------------------
    if (o.sees) {
      _d.set(_c.x, 0, _c.z);
      const flat = Math.max(1e-4, _d.length());
      _e.set(Math.sin(o.yaw), 0, Math.cos(o.yaw));
      const centrality = 0.45 + 0.55 * clamp(_d.dot(_e) / flat, 0, 1);
      const closeness = clamp(1.15 - dist / Math.max(1, o.cfg.viewDistance), 0.18, 1);
      const motion = 0.55 + 0.45 * clamp(this.playerSpeed / 7, 0, 1);
      o.suspicion += dt * SIGHT_GAIN * centrality * closeness * motion;
      o.lastKnown.copy(this.playerPos);
      o.lastKnownVel.copy(this.playerVel);
      o.memory = MEMORY_TIME;
    } else if (o.hears > 0) {
      o.suspicion += dt * HEAR_GAIN * o.hears;
      // Hearing gives a direction, not a fix: bias the guess toward the officer's own side.
      if (o.suspicion > 0.2) {
        o.lastKnown.lerp(this.playerPos, clamp(dt * 2.2 * o.hears, 0, 1));
        o.memory = Math.max(o.memory, 1.4);
      }
    } else {
      const decay = o.state === 'searching' || o.state === 'suspicious' ? DECAY_SEARCH : DECAY_PATROL;
      o.suspicion -= dt * decay;
      o.memory = Math.max(0, o.memory - dt);
    }
    o.suspicion = clamp(o.suspicion, 0, SUSPICION_MAX);
  }

  /** True when nothing solid sits between the officer's eye and the player's chest. */
  private lineOfSight(eye: THREE.Vector3, toPlayer: THREE.Vector3, dist: number): boolean {
    if (!this.rapier && !this.customRay && this.blockers.length === 0) return true;
    const reach = dist - LOS_SLACK;
    if (reach <= 0.05) return true;
    _dir.copy(toPlayer).multiplyScalar(1 / Math.max(1e-4, dist));
    const hit = this.ray(eye, _dir, reach);
    return !hit;
  }

  // -------------------------------------------------------------------------
  // State machine
  // -------------------------------------------------------------------------

  private setState(o: Officer, s: OfficerState): void {
    if (o.state === s) return;
    o.state = s;
    o.stateTime = 0;

    if (s === 'searching') {
      o.searchTimer = SEARCH_TIME;
      o.searchHop = 0;
      o.searchTarget.copy(o.lastKnown);
    }
    if (s === 'winded') {
      o.windedTimer = 4.2;
      o.suspicion = Math.min(o.suspicion, 0.6);
    }
  }

  private tickState(o: Officer, dt: number): void {
    o.stateTime += dt;

    // Stamina: only the sprint burns it; everything else pays it back.
    if (o.state === 'chasing') {
      o.stamina -= dt;
    } else if (o.state !== 'stunned') {
      o.stamina = Math.min(o.cfg.stamina, o.stamina + dt * (o.state === 'winded' ? 0.85 : 0.55));
    }

    switch (o.state) {
      case 'stunned':
        o.stunTimer -= dt;
        if (o.stunTimer <= 0) {
          // He gets up angrier: half the suspicion bar is already full.
          o.suspicion = Math.max(o.suspicion, 0.55);
          this.setState(o, o.memory > 0 || o.suspicion >= 0.5 ? 'searching' : 'patrol');
        }
        break;

      case 'patrol':
        if (o.suspicion >= SUSPICION_MAX) this.enterAlert(o);
        else if (o.suspicion >= SUSPICION_SUSPICIOUS) this.setState(o, 'suspicious');
        break;

      case 'suspicious':
        if (o.suspicion >= SUSPICION_MAX) this.enterAlert(o);
        else if (o.suspicion <= 0.05) this.setState(o, 'patrol');
        break;

      case 'alert':
        if (o.stateTime >= ALERT_DWELL) this.setState(o, 'chasing');
        break;

      case 'chasing':
        if (o.stamina <= 0) {
          this.fire('lost', o);
          this.setState(o, 'winded');
        } else if (!o.sees && o.memory <= 0) {
          this.fire('lost', o);
          this.setState(o, 'searching');
        } else if (o.dist <= o.cfg.catchRadius && this.caughtCooldown <= 0) {
          this.caughtCooldown = CAUGHT_COOLDOWN;
          this.fire('caught', o, this.playerPos);
        }
        break;

      case 'searching':
        o.searchTimer -= dt;
        if (o.suspicion >= SUSPICION_MAX) this.enterAlert(o);
        else if (o.searchTimer <= 0) this.setState(o, 'patrol');
        break;

      case 'winded':
        o.windedTimer -= dt;
        if (o.windedTimer <= 0) this.setState(o, o.memory > 0 ? 'searching' : 'patrol');
        break;
    }
  }

  /** Positive ID. Shout, point, and drag the rest of the squad in. */
  private enterAlert(o: Officer): void {
    this.setState(o, 'alert');
    o.lastKnown.copy(this.playerPos);
    o.lastKnownVel.copy(this.playerVel);
    o.memory = MEMORY_TIME;
    this.fire('spotted', o, this.playerPos);
    if (o.alertedThisFrame) return;
    o.alertedThisFrame = true;

    for (const other of this.officers) {
      if (other === o || other.state === 'stunned') continue;
      if (other.state === 'chasing' || other.state === 'alert') continue;
      if (other.pos.distanceTo(o.pos) > SQUAD_ALERT_RADIUS) continue;
      other.lastKnown.copy(this.playerPos);
      other.lastKnownVel.copy(this.playerVel);
      other.memory = MEMORY_TIME;
      other.suspicion = SUSPICION_MAX;
      other.alertedThisFrame = true;   // stops the broadcast echoing round the squad
      this.setState(other, 'alert');
      this.fire('alerted', other, this.playerPos);
    }
  }

  // -------------------------------------------------------------------------
  // Squad roles
  // -------------------------------------------------------------------------

  /**
   * Slot 0 is the tail chaser. Everyone else is assigned an alternating left/right slot and aims at
   * a point AHEAD of and BESIDE the player's predicted position, which is what turns "three cops in
   * single file behind you" into a pincer you have to actually steer out of.
   */
  private assignSlots(): void {
    const chasers: Officer[] = [];
    for (const o of this.officers) {
      if (o.state === 'chasing' || o.state === 'alert') chasers.push(o);
    }
    if (chasers.length === 0) return;
    chasers.sort((a, b) => a.dist - b.dist);
    for (let i = 0; i < chasers.length; i++) chasers[i].slot = i;
  }

  /** Where this officer wants to be standing. */
  private pickGoal(o: Officer, dt: number): void {
    switch (o.state) {
      case 'stunned':
        o.goal.copy(o.pos);
        break;

      case 'patrol': {
        const pts = o.cfg.patrolPoints;
        if (pts.length === 0) {
          o.goal.copy(o.spawnPos);
          break;
        }
        if (o.waitTimer > 0) {
          o.waitTimer -= dt;
          o.goal.copy(o.pos);
          break;
        }
        const target = pts[clamp(o.patrolIndex, 0, pts.length - 1) | 0];
        o.goal.copy(target);
        _a.set(target.x - o.pos.x, 0, target.z - o.pos.z);
        if (_a.lengthSq() < 1.2 * 1.2 || o.blocked > 1.6) {
          o.blocked = 0;
          // Pause and scan at each waypoint — a patrol that never stops reads as a conveyor belt.
          o.waitTimer = 0.7 + Math.random() * 1.2;
          if (pts.length === 1) break;
          o.patrolIndex += o.patrolDir;
          if (o.patrolIndex >= pts.length) { o.patrolIndex = pts.length - 2; o.patrolDir = -1; }
          else if (o.patrolIndex < 0) { o.patrolIndex = Math.min(1, pts.length - 1); o.patrolDir = 1; }
        }
        break;
      }

      case 'suspicious':
        // Freeze and stare for a beat, then creep toward whatever it was.
        if (o.stateTime < 0.9) o.goal.copy(o.pos);
        else o.goal.copy(o.lastKnown);
        break;

      case 'alert':
        o.goal.copy(o.pos);
        break;

      case 'chasing': {
        const anchor = o.sees ? this.playerPos : o.lastKnown;
        const vel = o.sees ? this.playerVel : o.lastKnownVel;
        const lead = clamp(o.dist / Math.max(1, o.cfg.runSpeed), 0, 1.5);
        o.goal.set(anchor.x + vel.x * lead, anchor.y, anchor.z + vel.z * lead);

        if (o.slot > 0) {
          _a.set(vel.x, 0, vel.z);
          if (_a.lengthSq() < 0.25) {
            // Player is basically parked: fan out around him instead of stacking up.
            _a.set(o.pos.x - anchor.x, 0, o.pos.z - anchor.z);
            if (_a.lengthSq() < 1e-4) _a.set(1, 0, 0);
          }
          _a.normalize();
          _b.crossVectors(UP, _a).normalize();
          const side = (o.slot % 2 === 1) ? 1 : -1;
          const ring = 1 + Math.floor((o.slot - 1) / 2);
          // Ahead and to the side: a cut-off point, not a tail.
          o.goal.addScaledVector(_b, side * 2.6 * ring);
          o.goal.addScaledVector(_a, 1.8 * ring);
        }
        break;
      }

      case 'searching': {
        _a.set(o.searchTarget.x - o.pos.x, 0, o.searchTarget.z - o.pos.z);
        if (_a.lengthSq() < 1.3 * 1.3 || o.blocked > 1.4) {
          o.blocked = 0;
          o.searchHop++;
          const ang = Math.random() * Math.PI * 2;
          const rad = 2.5 + Math.random() * 4.5;
          o.searchTarget.set(
            o.lastKnown.x + Math.cos(ang) * rad,
            o.lastKnown.y,
            o.lastKnown.z + Math.sin(ang) * rad,
          );
        }
        o.goal.copy(o.searchTarget);
        break;
      }

      case 'winded':
        o.goal.copy(o.pos);
        break;
    }
  }

  private speedFor(o: Officer): number {
    switch (o.state) {
      case 'patrol': return o.waitTimer > 0 ? 0 : o.cfg.walkSpeed;
      case 'suspicious': return o.stateTime < 0.9 ? 0 : o.cfg.walkSpeed * 0.65;
      case 'alert': return 0;
      case 'chasing': {
        // The last second of stamina visibly sags — the tell that you are about to be free.
        const fade = clamp(o.stamina / 1.5, 0.55, 1);
        return o.cfg.runSpeed * fade;
      }
      case 'searching': return o.cfg.walkSpeed * 1.15;
      case 'winded': return 0;
      case 'stunned': return 0;
    }
  }

  // -------------------------------------------------------------------------
  // Locomotion
  // -------------------------------------------------------------------------

  private locomote(o: Officer, dt: number): void {
    if (o.state === 'stunned') {
      // Skid to a halt along the floor after the hit.
      o.vel.multiplyScalar(1 - approach(dt, 4.5));
      this.integrate(o, dt);
      return;
    }

    const speed = this.speedFor(o);

    _a.set(o.goal.x - o.pos.x, 0, o.goal.z - o.pos.z);
    const distGoal = _a.length();
    if (distGoal > 1e-4) _a.multiplyScalar(1 / distGoal);
    else _a.set(0, 0, 0);

    // Arrive: do not oscillate on top of the goal.
    let want = speed;
    if (distGoal < 1.0) want = speed * clamp(distGoal / 1.0, 0, 1);

    // --- obstacle avoidance -------------------------------------------------------------------
    // Skipped at contact range in a chase, otherwise his own target reads as a wall and he
    // circles the player forever instead of grabbing him.
    const contact = o.state === 'chasing' && o.dist < o.cfg.catchRadius + 1.6;
    _f.set(0, 0, 0);
    if (want > 0.05 && !contact) {
      this.avoid(o, _a, want, _f);
    }
    if (_f.lengthSq() > 1e-6) {
      _a.addScaledVector(_f, AVOID_WEIGHT);
      const l = _a.length();
      if (l > 1e-4) _a.multiplyScalar(1 / l);
    }

    // --- separation from the rest of the squad ------------------------------------------------
    for (const other of this.officers) {
      if (other === o) continue;
      _b.set(o.pos.x - other.pos.x, 0, o.pos.z - other.pos.z);
      const d2 = _b.lengthSq();
      if (d2 > SEPARATION_RADIUS * SEPARATION_RADIUS || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      _a.addScaledVector(_b.multiplyScalar(1 / d), (1 - d / SEPARATION_RADIUS) * 1.1);
    }
    const al = _a.length();
    if (al > 1e-4) _a.multiplyScalar(1 / al);

    // --- integrate ----------------------------------------------------------------------------
    _b.copy(_a).multiplyScalar(want);
    o.vel.lerp(_b, approach(dt, ACCEL));
    o.vel.y = 0;

    // Hard block: project the velocity onto any wall we are about to enter, so an officer slides
    // along a cubicle instead of walking through it. This is the check that actually holds.
    this.deflect(o, dt);

    this.integrate(o, dt);

    o.speedNow = Math.hypot(o.vel.x, o.vel.z);
    if (o.speedNow < want * 0.35 && want > 0.5) o.blocked += dt;
    else o.blocked = Math.max(0, o.blocked - dt * 2);

    // --- facing -------------------------------------------------------------------------------
    if (o.state === 'suspicious' || o.state === 'alert' || (o.state === 'chasing' && o.dist < 3)) {
      const look = o.sees ? this.playerPos : o.lastKnown;
      _c.set(look.x - o.pos.x, 0, look.z - o.pos.z);
      if (_c.lengthSq() > 1e-4) o.targetYaw = Math.atan2(_c.x, _c.z);
    } else if (o.speedNow > 0.12) {
      o.targetYaw = Math.atan2(o.vel.x, o.vel.z);
    } else if (o.state === 'patrol' && o.waitTimer > 0) {
      // Scan the room while stopped at a waypoint.
      o.targetYaw = o.spawnYaw + Math.sin(this.time * 0.9 + o.gait) * 1.05;
    }
    let delta = o.targetYaw - o.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    o.yaw += delta * approach(dt, TURN_RATE);
  }

  /** Three forward probes at chest height plus one at knee height (desks, drawers, boxes). */
  private avoid(o: Officer, dir: THREE.Vector3, speed: number, out: THREE.Vector3): void {
    if (!this.rapier && !this.customRay && this.blockers.length === 0) return;
    const probe = clamp(0.95 + speed * 0.26, 0.95, 2.8);
    const fan = [0, -0.62, 0.62];

    for (let i = 0; i < fan.length; i++) {
      const ang = fan[i];
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      _dir.set(dir.x * ca + dir.z * sa, 0, -dir.x * sa + dir.z * ca).normalize();
      const len = i === 0 ? probe : probe * 0.75;

      _origin.set(o.pos.x, o.pos.y + CHEST_HEIGHT, o.pos.z);
      let hit = this.ray(_origin, _dir, len);
      let toi = hit ? hit.toi : -1;
      let nx = hit ? hit.n.x : 0;
      let nz = hit ? hit.n.z : 0;

      if (i === 0) {
        _origin.set(o.pos.x, o.pos.y + KNEE_HEIGHT, o.pos.z);
        hit = this.ray(_origin, _dir, len);
        if (hit && (toi < 0 || hit.toi < toi)) {
          toi = hit.toi;
          nx = hit.n.x;
          nz = hit.n.z;
        }
      }

      if (toi < 0) continue;
      const w = 1 - toi / len;
      // Push away along the surface normal (a real slide) and back off the blocked direction.
      const nl = Math.hypot(nx, nz);
      if (nl > 1e-3) {
        out.x += (nx / nl) * w * 1.25;
        out.z += (nz / nl) * w * 1.25;
      }
      out.x -= _dir.x * w * 0.7;
      out.z -= _dir.z * w * 0.7;
    }
  }

  /** Remove the component of velocity that points into a surface we are about to hit. */
  private deflect(o: Officer, dt: number): void {
    const sp = Math.hypot(o.vel.x, o.vel.z);
    if (sp < 1e-3) return;
    if (!this.rapier && !this.customRay && this.blockers.length === 0) return;

    _dir.set(o.vel.x / sp, 0, o.vel.z / sp);
    const reach = 0.42 + sp * dt;

    for (const h of DEFLECT_HEIGHTS) {
      _origin.set(o.pos.x, o.pos.y + h, o.pos.z);
      const hit = this.ray(_origin, _dir, reach);
      if (!hit) continue;
      const nl = Math.hypot(hit.n.x, hit.n.z);
      if (nl < 1e-3) {
        o.vel.set(0, 0, 0);
        return;
      }
      _b.set(hit.n.x / nl, 0, hit.n.z / nl);
      const into = o.vel.dot(_b);
      if (into < 0) {
        o.vel.addScaledVector(_b, -into);
        // Bleed a little energy so he does not rocket along walls.
        o.vel.multiplyScalar(0.92);
        _dir.set(o.vel.x, 0, o.vel.z);
        const l = _dir.length();
        if (l < 1e-3) return;
        _dir.multiplyScalar(1 / l);
      }
    }
  }

  /** Step, then snap to the floor. A step that would leave the floor is refused. */
  private integrate(o: Officer, dt: number): void {
    if (Math.abs(o.vel.x) < 1e-5 && Math.abs(o.vel.z) < 1e-5) {
      const gy0 = this.groundAt(o.pos, o.pos.y);
      if (gy0 !== null) o.pos.y += (gy0 - o.pos.y) * approach(dt, 14);
      return;
    }

    _g.set(o.pos.x + o.vel.x * dt, o.pos.y, o.pos.z + o.vel.z * dt);
    const gy = this.groundAt(_g, o.pos.y);
    if (gy === null) {
      // Cliff or missing floor: refuse the step and let the blocked timer reroute him.
      o.vel.multiplyScalar(0.2);
      o.blocked += dt * 2;
      return;
    }
    o.pos.x = _g.x;
    o.pos.z = _g.z;
    o.pos.y += (gy - o.pos.y) * approach(dt, 14);
  }

  // -------------------------------------------------------------------------
  // Knockdowns
  // -------------------------------------------------------------------------

  private checkKnockdowns(): void {
    if (this.playerSpeed < KNOCK_SPEED) return;
    for (const o of this.officers) {
      if (o.state === 'stunned') continue;
      _a.set(this.playerPos.x - o.pos.x, 0, this.playerPos.z - o.pos.z);
      const d = _a.length();
      if (d > KNOCK_RADIUS + o.cfg.catchRadius * 0.25) continue;
      // Only a real impact counts: the chair has to be closing on him, not drifting past.
      const closing = d > 1e-3 ? -(this.playerVel.x * (_a.x / d) + this.playerVel.z * (_a.z / d)) : this.playerSpeed;
      if (closing < KNOCK_SPEED * 0.5) continue;
      this.knock(o, this.playerSpeed, this.playerVel);
    }
  }

  private knock(o: Officer, speed: number, dir: THREE.Vector3): void {
    const secs = clamp(1.8 + (speed - KNOCK_SPEED) * 0.22, 1.8, 4.5);
    o.fallDir = 1;
    o.fallRoll = (Math.random() - 0.5) * 0.8;
    // Launch him along the impact.
    const l = Math.hypot(dir.x, dir.z);
    if (l > 1e-3) {
      o.vel.set((dir.x / l) * Math.min(7, speed * 0.55), 0, (dir.z / l) * Math.min(7, speed * 0.55));
    }
    this.applyStun(o, secs);
  }

  /**
   * External impact hook, for wiring a real Rapier contact event instead of relying on the
   * built-in proximity test. Returns the ids of everyone knocked down.
   */
  applyImpact(position: THREE.Vector3, velocity: THREE.Vector3, radius = KNOCK_RADIUS): string[] {
    const speed = Math.hypot(velocity.x, velocity.z);
    const hit: string[] = [];
    if (speed < KNOCK_SPEED * 0.6) return hit;
    for (const o of this.officers) {
      if (o.state === 'stunned') continue;
      if (Math.hypot(position.x - o.pos.x, position.z - o.pos.z) > radius + 0.5) continue;
      this.knock(o, speed, velocity);
      hit.push(o.id);
    }
    return hit;
  }

  stun(officerId: string, seconds: number): void {
    const o = this.officers.find((x) => x.id === officerId);
    if (!o) return;
    this.applyStun(o, seconds);
  }

  private applyStun(o: Officer, seconds: number): void {
    o.stunTimer = Math.max(o.stunTimer, seconds);
    this.setState(o, 'stunned');
    o.waitTimer = 0;
    this.fire('stunned', o);
  }

  // -------------------------------------------------------------------------
  // Pose
  // -------------------------------------------------------------------------

  private pose(o: Officer, dt: number): void {
    const R = o.rig;
    const chasing = o.state === 'chasing' || o.state === 'alert';
    const run = clamp(o.speedNow / Math.max(1, o.cfg.runSpeed), 0, 1);

    // Gait phase advances with actual ground speed, so the feet do not skate.
    o.gait += dt * (o.speedNow > 0.05 ? 2.2 + o.speedNow * 1.45 : 0);
    const amp = 0.26 + 0.72 * run;
    const swing = clamp(o.speedNow / 1.2, 0, 1);

    for (let i = 0; i < 2; i++) {
      const ph = o.gait + (i === 0 ? 0 : Math.PI);
      const s = Math.sin(ph);
      // Hips drive the stride; the knee tucks on the return swing.
      R.hip[i].rotation.x = -s * amp * swing;
      R.knee[i].rotation.x = (0.06 + Math.max(0, Math.sin(ph + 1.15)) * 0.95 * run) * swing + 0.05;
      // Arms counter-swing.
      R.shoulder[i].rotation.x = s * amp * 0.85 * swing + (chasing ? -0.20 : 0);
      R.shoulder[i].rotation.z = (i === 0 ? -1 : 1) * (0.10 + 0.16 * run);
      R.elbow[i].rotation.x = -(0.25 + 1.05 * run) * swing - (chasing ? 0.55 : 0.18);
    }

    // Torso: leans into the run, folds over when winded, squares up when he shouts.
    let pitch = 0.04 + 0.30 * run;
    let bob = Math.abs(Math.sin(o.gait)) * 0.035 * swing;
    if (o.state === 'winded') {
      pitch = 0.62;
      bob = Math.sin(this.time * 4.5) * 0.028;   // panting
      for (let i = 0; i < 2; i++) {
        R.shoulder[i].rotation.x = 0.55;
        R.elbow[i].rotation.x = -0.55;
      }
    } else if (o.state === 'suspicious') {
      pitch = 0.10;
    } else if (o.state === 'alert') {
      // Point at him. One raised arm is the clearest "he's seen you" read at gameplay distance.
      pitch = 0.02;
      R.shoulder[1].rotation.x = -1.45;
      R.shoulder[1].rotation.z = 0.22;
      R.elbow[1].rotation.x = -0.15;
    }
    R.torso.rotation.x += (pitch - R.torso.rotation.x) * approach(dt, 8);

    // Head: locks on when aware, sweeps the room otherwise.
    let hy = 0;
    let hp = 0;
    if (o.sees || o.state === 'chasing' || o.state === 'alert' || o.state === 'suspicious') {
      const look = o.sees ? this.playerPos : o.lastKnown;
      _a.set(look.x - o.pos.x, 0, look.z - o.pos.z);
      if (_a.lengthSq() > 1e-4) {
        let d = Math.atan2(_a.x, _a.z) - o.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        hy = clamp(d, -1.0, 1.0);
      }
      hp = clamp((look.y + 0.6 - (o.pos.y + EYE_HEIGHT)) * 0.5, -0.35, 0.35);
    } else {
      hy = Math.sin(this.time * 0.8 + o.gait * 0.13) * 0.55;
    }
    o.headYaw += (hy - o.headYaw) * approach(dt, 6);
    o.headPitch += (hp - o.headPitch) * approach(dt, 6);
    R.head.rotation.y = o.headYaw;
    R.head.rotation.x = o.headPitch - R.torso.rotation.x * 0.55;

    // Knockdown blend.
    const wantFall = o.state === 'stunned' ? 1 : 0;
    o.fall += (wantFall - o.fall) * approach(dt, wantFall > o.fall ? 11 : 3.2);
    if (o.fall > 0.001) {
      const f = o.fall;
      R.body.rotation.x = f * o.fallDir * 1.42;
      R.body.rotation.z = f * o.fallRoll;
      R.body.position.y = -f * 0.10;
      // Sprawl.
      for (let i = 0; i < 2; i++) {
        R.hip[i].rotation.x = -0.30 * f + R.hip[i].rotation.x * (1 - f);
        R.knee[i].rotation.x = 0.75 * f + R.knee[i].rotation.x * (1 - f);
        R.shoulder[i].rotation.x = -1.15 * f + R.shoulder[i].rotation.x * (1 - f);
        R.shoulder[i].rotation.z = (i === 0 ? -1 : 1) * (0.55 * f) + R.shoulder[i].rotation.z * (1 - f);
      }
      R.torso.rotation.x *= (1 - f);
    } else {
      R.body.rotation.x = 0;
      R.body.rotation.z = 0;
      R.body.position.y = bob;
    }
  }

  private writeTransform(o: Officer): void {
    o.group.position.copy(o.pos);
    o.group.rotation.y = o.yaw;

    const d = o.dist;
    if (d > this.cullDistance) {
      if (o.group.visible) o.group.visible = false;
      return;
    }
    if (!o.group.visible) o.group.visible = true;

    const far = d > this.lodDistance;
    if (far === o.rig.root.visible) {
      o.rig.root.visible = !far;
      o.proxy.visible = far;
    }
  }

  // -------------------------------------------------------------------------
  // Heat
  // -------------------------------------------------------------------------

  private updateHeat(dt: number): void {
    let target = 0;
    let chasers = 0;
    for (const o of this.officers) {
      let h: number;
      switch (o.state) {
        case 'patrol': h = Math.min(0.16, o.suspicion * 0.28); break;
        case 'suspicious': h = 0.20 + 0.24 * o.suspicion; break;
        case 'alert': h = 0.62; break;
        case 'chasing': h = 0.78; chasers++; break;
        case 'searching': h = 0.42; break;
        case 'winded': h = 0.30; break;
        case 'stunned': h = 0.22; break;
      }
      if (h > target) target = h;
    }
    if (chasers > 1) target = Math.min(1, target + 0.07 * (chasers - 1));
    target = clamp(target, 0, 1);

    // Spikes instantly, cools slowly: the WANTED stars should feel earned and sticky.
    const rate = target > this.heat ? 6.5 : 0.45;
    this.heat += (target - this.heat) * approach(dt, rate);
    this.heat = clamp(this.heat, 0, 1);
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /** 0..1. Multiply by the star count and round up for the HUD's WANTED meter. */
  get heatLevel(): number {
    return this.heat;
  }

  /** Metres to the closest officer, Infinity when the squad is empty. */
  get nearestDistance(): number {
    return this._nearest;
  }

  get count(): number {
    return this.officers.length;
  }

  /** True while anyone is actively hunting; handy for music stingers. */
  get inPursuit(): boolean {
    return this.officers.some((o) => o.state === 'chasing' || o.state === 'alert');
  }

  snapshot(): OfficerSnapshot[] {
    return this.officers.map((o) => ({
      id: o.id,
      state: o.state,
      position: o.pos.clone(),
      suspicion: o.suspicion,
      stamina01: clamp(o.stamina / Math.max(0.001, o.cfg.stamina), 0, 1),
      distance: o.dist,
      sees: o.sees,
    }));
  }

  // -------------------------------------------------------------------------
  // Blockers (fallback occluders when a level's set dressing has no colliders)
  // -------------------------------------------------------------------------

  addBlocker(box: THREE.Box3): void {
    this.blockers.push(box.clone());
  }

  clearBlockers(): void {
    this.blockers.length = 0;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Back to spawn, full stamina, zero suspicion. Use on checkpoint restore / level restart. */
  reset(): void {
    this.heat = 0;
    this._nearest = Infinity;
    this.caughtCooldown = 0;
    for (const o of this.officers) {
      o.pos.copy(o.spawnPos);
      o.vel.set(0, 0, 0);
      o.yaw = o.spawnYaw;
      o.targetYaw = o.spawnYaw;
      o.state = 'patrol';
      o.stateTime = 0;
      o.suspicion = 0;
      o.memory = 0;
      o.stamina = o.cfg.stamina;
      o.stunTimer = 0;
      o.windedTimer = 0;
      o.waitTimer = 0;
      o.patrolIndex = 0;
      o.patrolDir = 1;
      o.searchTimer = 0;
      o.blocked = 0;
      o.fall = 0;
      o.speedNow = 0;
      o.dist = Infinity;
      o.sees = false;
      o.losClear = false;
      o.lastKnown.copy(o.spawnPos);
      o.lastKnownVel.set(0, 0, 0);
      o.searchTarget.copy(o.spawnPos);
      o.group.visible = true;
      o.rig.root.visible = true;
      o.proxy.visible = false;
      o.rig.body.rotation.set(0, 0, 0);
      o.rig.body.position.set(0, 0, 0);
      o.rig.torso.rotation.set(0, 0, 0);
      o.group.position.copy(o.pos);
      o.group.rotation.y = o.yaw;
    }
  }

  /**
   * Remove every officer from the scene and free their geometry.
   * The four shared materials are process-wide and are deliberately NOT disposed, so a level
   * reload does not pay to rebuild them; `MaterialLibrary.disposeAll()` is the teardown path.
   */
  dispose(): void {
    for (const o of this.officers) {
      this.scene.remove(o.group);
      o.group.traverse((n) => {
        const mesh = n as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
    }
    this.officers.length = 0;
    this.listeners.length = 0;
    this.blockers.length = 0;
    this.heat = 0;
    this._nearest = Infinity;
  }
}
