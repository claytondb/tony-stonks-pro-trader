/**
 * StonksCharacter — the hero, rebuilt.
 *
 * WHAT DRIVES IT
 * --------------
 * In game this rig's joints are driven by TrickAnimator, which puts it in the KICK-PUSH stance:
 * one knee on the seat pan, the other leg working the floor, both hands over the backrest's top
 * edge. The poses in this file (`sit`, `stand`, ...) are the fallback for when no animator is
 * attached — the model viewer, the debug cycler, and the frames before binding. Two consequences
 * worth knowing before changing anything here:
 *   - the joint OFFSETS (P.thigh, P.shin, P.shoulderX ...) are pose constraints for the animator's
 *     solver, not styling; see the note on the thigh/shin ratio below;
 *   - the constructor's pose is what TrickAnimator captures as the bind pose, because a
 *     procedural rig has no skinning bind matrices to recover one from.
 *
 * WHY THIS EXISTS
 * ---------------
 * The build previously used a Meshy.ai FBX mannequin: smooth-shaded, anatomically neutral, no
 * tie, no readable silhouette, hands touching nothing, and a clip library so mislabelled that
 * "idle" mapped to a breakdance. Every art director on the panel called it out — the hero asset
 * was the weakest asset in the game, unidentifiable as a person at follow-camera distance, and
 * roughly 60% occluded by the chair he is sitting in.
 *
 * The concept art (refs/player.png, refs/scene-office3.png) sells the entire game on one figure:
 * hard-faceted planes, an oversized stylised head, near-black slacks and shoes as one solid mass,
 * a bright white shirt as the value anchor, ONE saturated accent (the tie), and both hands in
 * visible contact with the chair. None of that is reachable by re-rigging a generic mannequin, so
 * the character is authored here from scratch:
 *
 *   - chamfered low-poly volumes only (LowPolyKit), flat-shaded, ~1.9k triangles
 *   - baked vertex-colour occlusion so every part has internal value range before lighting
 *   - a camera-relative Fresnel rim so the black slacks separate from the carpet
 *   - a real joint hierarchy driven procedurally: no animation clips to mislabel
 *   - two-bone IK on both arms; in game TrickAnimator re-solves them onto the backrest's real top
 *     edge, so the grip contact from the concept art actually reads at gameplay distance
 *   - continuous lean/roll/bob/tie-flutter additives driven by speed and turn rate, so the
 *     "in motion" frame is not pixel-identical to the static one
 *
 * ORIGIN CONTRACT
 * ---------------
 * The root's origin is the point where the rider's seat bones meet the SEAT TOP, facing -Z (the
 * same facing as ChairModel). For the standing pose, add `STANDING_DROP` to Y so the shoes land
 * on the floor instead.
 */

import * as THREE from 'three';
import {
  PartBuilder, applyRimLight, chamferBox, facetedShell, shear, taper,
} from './LowPolyKit';

// ---------------------------------------------------------------------------
// Proportions — stylised, not anatomical. Head is ~1.35x life size on purpose.
// ---------------------------------------------------------------------------

/**
 * MEASURED, not eyeballed. The previous table built a figure whose hips-to-head-joint span was
 * 0.363 m on a 1.67 m body — 22% of its own height, where a real human is 33-35%. In the riding
 * pose, with the torso folded forward over the backrest, that collapsed to 0.283 m of WORLD
 * height between the hip joint and the base of the skull (probed in game at cruise), and a torso
 * that short under an oversized head is exactly why every art note said the rider reads as an
 * undifferentiated blob rather than as a person: there is no chest to see.
 *
 * The fix is not "make him bigger" — it is to move length OUT OF THE LEGS AND INTO THE TORSO,
 * which keeps the overall figure inside the 1.6-1.8 m the chair is scaled for:
 *
 *   hip joint above the soles   thigh + shin + shoe drop = 0.315 + 0.450 + 0.131 = 0.896  (52% H)
 *   hips joint -> head joint    spine + chest + 0.008    = 0.345 + 0.280 + 0.008 = 0.633  (36% H)
 *   head geometry above that                                                       0.270
 *                                                                        total ~= 1.78 m
 *
 * Both spans now sit where a person's do. Shortening the leg is free for the pose as well: the
 * kneeling stance's depth is set by the THIGH's horizontal run back from a knee pinned near the
 * front of the seat pan, so a shorter thigh puts the pelvis further forward, over the cushion
 * instead of behind it.
 */
const P = {
  hipY: 0.085,        // hip pivot above the seat top
  spine: 0.345,       // hips -> chest pivot
  chest: 0.280,       // chest pivot -> neck base
  neck: 0.045,
  headH: 0.246,
  headW: 0.228,
  headD: 0.218,

  shoulderX: 0.188,
  // The shoulder pivot has to ride near the TOP of the ribcage, not halfway up it. At 0.082 on a
  // 0.265 chest the arms would hang out of the middle of his chest and the collar would sit a
  // whole head above them.
  shoulderY: 0.175,   // above the chest pivot
  // Shoulder-to-wrist 0.515 on a 1.78 m figure (~29% H, which is life). Longer arms also buy the
  // pose back some uprightness: TrickAnimator solves the ride lean from how far the shoulders
  // have to fold to reach the backrest rail, so reach spent here is fold it does not have to ask
  // for, and the fold is what was crushing the torso's on-screen height.
  upperArm: 0.265,
  foreArm: 0.250,

  hipX: 0.108,
  // THIGH / SHIN RATIO IS A POSE CONSTRAINT, NOT A TASTE CALL.
  // TrickAnimator kneels this figure on a 0.56 m seat pan with the other foot on the floor.
  // The thigh has to span (pelvis -> knee on the pan) and the whole leg has to span
  // (pelvis -> floor) at the same pelvis height; a long thigh forces the hip far behind the
  // knee, which hangs the pelvis right off the back lip of the seat. Spending the leg on the
  // shin instead pulls the pelvis forward over the pan without costing any reach to the floor.
  thigh: 0.315,
  shin: 0.450,
  ankle: 0.070,
  foot: 0.238,
} as const;

/** Distance from the root origin down to the soles when the figure is standing. */
export const STANDING_DROP = -(P.thigh + P.shin + P.ankle + P.hipY);

/** Armrest grip socket for ChairModel tier 1, expressed in root space. */
const GRIP = { x: 0.252, y: 0.100, z: -0.075 };

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export type CharacterSkin = 'tony_stonks' | 'stonks_guy';

interface SkinSpec {
  shirt: number;
  skin: number;
  hair: number;
  tie: number;
  dark: number;      // slacks / belt / shoes — one mass, separated by vertex tint
  rim: number;
}

/**
 * VALUE LADDER — the whole point of this table.
 *
 * The panel's note was that the hero "reads as a white and dark blob at gameplay distance".
 * A stylised low-poly figure earns its readability from the ORDER of its values, not from
 * detail, so the five surfaces are spaced deliberately against what is behind them:
 *
 *   shirt   near-white          brightest thing in the frame, and the anchor of the silhouette
 *   skin    warm mid            two full stops under the shirt, so face and arms do not merge
 *                               into the shirt the way they did at exposure 1.32
 *   chair   mid grey  (0x8d8a8a fabric, ~0.13 linear — not ours, but the value we sit against)
 *   carpet  mid brown (~0.15 linear)
 *   slacks  dark charcoal       ~0.043 linear: a clear three stops under both chair and carpet,
 *                               but NOT black, so the leg forms still show their own shading
 *   shoes   near-black          one more stop down again, via vertex tint on the same material
 *   hair    near-black brown    the head's dark half; this is what turns the head from one pale
 *                               box into a readable face
 *   tie     one saturated red   the only chromatic note on the character
 */
const SKINS: Record<CharacterSkin, SkinSpec> = {
  tony_stonks: {
    // TROUSERS. 0x464c5e was described in the table above as "dark charcoal, ~0.043 linear".
    // It is not: 0x46/0x5e is a mid slate blue at 0.062..0.113 linear, and under this level's
    // exposure (1.35) with a 0.56 rim on top it renders PALER THAN THE CHAIR. At follow distance
    // that turned the legs and the shirt into one continuous light mass with no waistline, which
    // is most of why the figure read as a standing blob. 0x1d2028 is the value the comment
    // always claimed: three clear stops under the chair fabric and under the carpet.
    //
    // HAIR. 0x2a1a12 was so close to black that under the office key it was a hole in the head,
    // and it needed a 0.42 rim to be visible at all, which then turned the whole cap pale. But
    // 0x4e3423 overshot in the other direction once the head became two clean shells: the crown
    // is now a LARGE FLAT PLANE facing straight up into a ceiling full of fluorescents, and a
    // large plane pointed at the key takes several times the light the grazing facets of the old
    // box-stack did. Measured off shots/head-rear.png, the crown came back at srgb(165,112,68) —
    // a luminance of 0.194 against the cheek's 0.580. One and a half stops is not hair, it is a
    // suntan, and at four metres the head read as bald with a dark headband.
    //
    // 0x36261a took the crown to srgb(172,140,113) and that was still a tan, not hair. The
    // office renderer uses NO tone mapping (the harness reports toneMapping 0), so nothing rolls
    // the highlights off: the face plane near the ceiling banks is already 2x over white and
    // clips flat, which means the ONLY contrast the player gets on the head is however far the
    // hair sits below the clip. 0x281c12 lands the lit crown around srgb(140) against a face
    // pinned at 254 — a full two stops of separation on the brightest hair plane in the game,
    // and four or more on the nape, which is the plane the chase camera actually stares at.
    //
    // This is close to the 0x2a1a12 an earlier pass rejected as "a hole in the head", and the
    // reason it is safe now is geometric, not chromatic: back then the hair was a stack of
    // chamfered boxes whose facets nearly all met the key at a grazing angle, so a dark colour
    // never caught anything. The crown is now one large plane pointed straight at the ceiling.
    shirt: 0xfbf8f0, skin: 0xcb8a55, hair: 0x281c12, tie: 0xc4202c,
    dark: 0x1d2028, rim: 0xdbe6f7,
  },
  // Second skin reads cooler and older: pale blue shirt, gold tie, iron-grey hair.
  stonks_guy: {
    shirt: 0xd8e5f2, skin: 0xb47845, hair: 0x3a3d45, tie: 0xe0a129,
    dark: 0x212228, rim: 0xe8dcc4,
  },
};

interface Mats {
  shirt: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  hair: THREE.MeshStandardMaterial;
  tie: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  all: THREE.MeshStandardMaterial[];
}

function makeMats(spec: SkinSpec): Mats {
  const mk = (color: number, roughness: number, rim: number) => {
    const m = new THREE.MeshStandardMaterial({
      color, roughness, metalness: 0.0,
      flatShading: true, vertexColors: true,
    });
    applyRimLight(m, { color: spec.rim, power: 2.8, strength: rim });
    return m;
  };
  const shirt = mk(spec.shirt, 0.76, 0.10);
  const skin = mk(spec.skin, 0.66, 0.16);
  // Hair carries a rim on purpose: it is a dark shape and the follow camera looks straight at
  // it, so it needs an edge or it becomes a hole. It does NOT need enough rim to turn the whole
  // cap pale, which is what 0.42 did on a chamfered volume whose facets are mostly grazing.
  // 0.24 was still too much once the hair became one continuous shell: a Fresnel term is
  // strongest exactly on the silhouette bevels, which on a shell are BIG, so it was painting a
  // pale mauve band right along the crown's outline instead of a thin edge. The rim is additive
  // in linear space, so on a hair value this low 0.16 was already a fifth of the crown's total
  // output; 0.11 keeps the silhouette edge and stops the term setting the hair's floor.
  const hair = mk(spec.hair, 0.88, 0.11);
  const tie = mk(spec.tie, 0.52, 0.18);
  // The slacks are the darkest mass below the waist, and A RIM IS NOT WHAT SEPARATES THEM.
  // A Fresnel term on a chamfered low-poly limb catches nearly every facet — at 0.56 it lifted
  // the whole leg to roughly the shirt's value, which is the exact opposite of what the value
  // ladder above is for. The separation comes from the base colour now; the rim is back to a
  // thin edge that keeps the silhouette off a dark carpet.
  const dark = mk(spec.dark, 0.68, 0.12);
  return { shirt, skin, hair, tie, dark, all: [shirt, skin, hair, tie, dark] };
}

// ---------------------------------------------------------------------------
// Rig
// ---------------------------------------------------------------------------

interface Arm {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  /** Shoulder pivot in CHEST space. */
  origin: THREE.Vector3;
  side: number;
}

interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
  ankle: THREE.Group;
  side: number;
}

export interface CharacterMotion {
  /** Ground speed, m/s. */
  speed: number;
  /** Signed yaw rate, rad/s. Drives the roll into turns. */
  turnRate: number;
  grounded: boolean;
  grinding: boolean;
  airborne: boolean;
  airTime: number;
}

export type CharacterPose =
  | 'sit' | 'idle' | 'push' | 'air' | 'grind' | 'trick' | 'crash' | 'stand' | 'walk';

interface PoseSpec {
  torsoPitch: number;
  torsoRoll: number;
  chestPitch: number;
  headPitch: number;
  /** Vertical bounce of the whole figure. */
  lift: number;
  thighPitch: number;
  thighSplay: number;
  knee: number;
  ankle: number;
  /** Per-leg asymmetry, applied +to the left / -to the right. */
  legSplit: number;
  hand: [number, number, number];
  /** Elbow pole bias: >0 pushes elbows out to the sides. */
  elbowOut: number;
  tiePitch: number;
}

const BASE: PoseSpec = {
  torsoPitch: 0.15, torsoRoll: 0, chestPitch: 0.04, headPitch: -0.06, lift: 0,
  thighPitch: 1.40, thighSplay: 0.15, knee: -1.10, ankle: 0.28, legSplit: 0,
  hand: [GRIP.x, GRIP.y, GRIP.z], elbowOut: 0.75, tiePitch: 0.05,
};

const POSES: Record<CharacterPose, PoseSpec> = {
  // Cruising on the chair — the pose the player sees 90% of the time. Hands pinned to the
  // armrests, legs out and slightly splayed, a touch of forward lean.
  sit: { ...BASE },

  // Standing still: he slumps, knees fold in, head drops.
  idle: {
    ...BASE, torsoPitch: 0.05, chestPitch: -0.02, headPitch: 0.10,
    thighPitch: 1.26, thighSplay: 0.10, knee: -1.42, ankle: 0.20,
    hand: [GRIP.x - 0.006, GRIP.y + 0.01, GRIP.z + 0.03], elbowOut: 0.62,
  },

  // Kicking off the floor: hard forward lean, one leg reaching back and down, hands forward
  // on the front of the armrests.
  push: {
    ...BASE, torsoPitch: 0.42, chestPitch: 0.10, headPitch: -0.18,
    thighPitch: 1.05, thighSplay: 0.13, knee: -0.72, ankle: 0.10, legSplit: 0.72,
    hand: [GRIP.x - 0.01, GRIP.y + 0.02, GRIP.z - 0.10], elbowOut: 0.5, tiePitch: -0.55,
  },

  // Airborne: the concept-art pose. Legs straight out and splayed, torso back, arms wide.
  air: {
    ...BASE, torsoPitch: -0.16, chestPitch: -0.10, headPitch: -0.24, lift: 0.015,
    thighPitch: 1.56, thighSplay: 0.34, knee: -0.20, ankle: -0.10,
    hand: [0.400, 0.300, -0.150], elbowOut: 1.15, tiePitch: -1.05,
  },

  // Grinding: braced. Knees together, weight forward, arms locked out wide on the armrests.
  grind: {
    ...BASE, torsoPitch: 0.30, chestPitch: 0.08, headPitch: -0.16,
    thighPitch: 1.44, thighSplay: 0.03, knee: -0.92, ankle: 0.34,
    hand: [0.330, 0.170, -0.055], elbowOut: 1.0, tiePitch: -0.62,
  },

  // Flip / spin trick: maximum splay, arms thrown up and out.
  trick: {
    ...BASE, torsoPitch: -0.30, chestPitch: -0.16, headPitch: -0.30, lift: 0.02,
    thighPitch: 1.52, thighSplay: 0.58, knee: -0.12, ankle: -0.22, legSplit: 0.34,
    hand: [0.400, 0.460, -0.040], elbowOut: 1.25, tiePitch: -1.25,
  },

  // Bail: arms up, body thrown back, legs kicked forward.
  crash: {
    ...BASE, torsoPitch: -0.55, chestPitch: -0.24, headPitch: 0.34, lift: 0.03,
    thighPitch: 1.62, thighSplay: 0.44, knee: -0.06, ankle: -0.34, legSplit: -0.5,
    hand: [0.330, 0.600, -0.090], elbowOut: 1.3, tiePitch: -1.45,
  },

  // Off the chair, on his feet.
  stand: {
    ...BASE, torsoPitch: 0.03, chestPitch: 0.02, headPitch: 0.0,
    thighPitch: 0.02, thighSplay: 0.05, knee: -0.05, ankle: 0.0,
    hand: [0.235, -0.300, 0.020], elbowOut: 0.30, tiePitch: 0.02,
  },
  walk: {
    ...BASE, torsoPitch: 0.10, chestPitch: 0.03, headPitch: -0.04,
    thighPitch: 0.02, thighSplay: 0.06, knee: -0.18, ankle: 0.05, legSplit: 0.55,
    hand: [0.245, -0.290, -0.010], elbowOut: 0.34, tiePitch: -0.10,
  },
};

// ---------------------------------------------------------------------------
// Two-bone IK
// ---------------------------------------------------------------------------

const _dir = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _u1 = new THREE.Vector3();
const _u2 = new THREE.Vector3();
const _elbowPos = new THREE.Vector3();
const _xAxis = new THREE.Vector3();
const _yAxis = new THREE.Vector3();
const _zAxis = new THREE.Vector3();
const _basis = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _quatInv = new THREE.Quaternion();
const _tmp = new THREE.Vector3();

/**
 * Orient a joint so its local -Y axis points along `along`, with `ref` resolving the twist.
 * Limbs in this rig are all modelled hanging along -Y from their pivot.
 */
function aim(target: THREE.Object3D, along: THREE.Vector3, ref: THREE.Vector3): void {
  _yAxis.copy(along).negate().normalize();
  _xAxis.crossVectors(_yAxis, ref);
  if (_xAxis.lengthSq() < 1e-8) _xAxis.set(1, 0, 0);
  _xAxis.normalize();
  _zAxis.crossVectors(_xAxis, _yAxis).normalize();
  _basis.makeBasis(_xAxis, _yAxis, _zAxis);
  target.quaternion.setFromRotationMatrix(_basis);
}

/**
 * Solve a two-bone chain so the end effector lands on `targetLocal` (in the parent space of
 * `arm.shoulder`), with the elbow pushed toward `poleLocal`.
 */
function solveTwoBone(arm: Arm, targetLocal: THREE.Vector3, poleLocal: THREE.Vector3, l1: number, l2: number): void {
  _dir.subVectors(targetLocal, arm.origin);
  const reach = l1 + l2;
  let d = _dir.length();
  if (d < 1e-5) { _dir.set(0, -1, 0); d = 1e-5; }
  d = Math.min(d, reach * 0.998);
  _dir.normalize();

  // Orthogonalise the pole against the aim direction — that plane is where the elbow lives.
  _pole.copy(poleLocal).sub(arm.origin);
  _pole.addScaledVector(_dir, -_pole.dot(_dir));
  if (_pole.lengthSq() < 1e-8) _pole.set(arm.side, 0, 0.001);
  _pole.normalize();

  const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const a = Math.acos(cosA);

  _u1.copy(_dir).multiplyScalar(Math.cos(a)).addScaledVector(_pole, Math.sin(a)).normalize();
  _elbowPos.copy(arm.origin).addScaledVector(_u1, l1);
  _u2.subVectors(targetLocal, _elbowPos).normalize();

  aim(arm.shoulder, _u1, _pole);

  // The elbow's rotation is expressed in the shoulder's space.
  _quat.copy(arm.shoulder.quaternion);
  _quatInv.copy(_quat).invert();
  _tmp.copy(_u2).applyQuaternion(_quatInv);
  _pole.applyQuaternion(_quatInv);
  aim(arm.elbow, _tmp, _pole);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export interface CharacterParts {
  root: THREE.Group;
  triangles: number;
  materials: THREE.MeshStandardMaterial[];
}

/**
 * TEN DIRECTIONS ROUND THE HEAD, running front (-Z) -> +X -> back (+Z) -> -X.
 *
 * Not a circle. Indices 0/1 are a PAIR straddling the centre line at the same depth, which makes
 * the front of every ring a single flat plane rather than a curve — that flat is the face, and
 * the forehead, and the front of the fringe. Everything else fans out to a rounded back. Ten is
 * the smallest count that gives a flat front, a flat back and a distinct cheek plane on each
 * side; twelve just adds facets nobody can resolve at four metres.
 */
const HEAD_DIRS = [
  [-0.42, -1.00], [0.42, -1.00],            // face plane
  [0.92, -0.62], [1.00, -0.05], [0.86, 0.58],   // right cheek / temple / back quarter
  [0.40, 1.00], [-0.40, 1.00],              // back plane
  [-0.86, 0.58], [-1.00, -0.05], [-0.92, -0.62],
] as const satisfies readonly (readonly [number, number])[];

/** Head half-depth / half-width. P.headD / P.headW = 0.956; rounded off, and shared by every ring. */
const HEAD_ASPECT = 0.94;

/**
 * The hairline: the head's most important silhouette edge, one height per HEAD_DIRS entry.
 *
 * It runs high and asymmetric across the brow (0.202 left, 0.220 right — a swept part, and the
 * only asymmetry the head needs), drops past the temples, and plunges to 0.075 at the nape. That
 * plunge is what the chase camera sees for the entire game: a 150 mm tall unbroken dark plane
 * with a hard bottom edge, sitting on a light neck, sitting on a white collar.
 */
const HAIRLINE = [
  0.202, 0.220,
  0.206, 0.178, 0.120,
  0.076, 0.074,
  0.118, 0.172, 0.186,
];

/**
 * The head.
 *
 * At four metres a head is three shapes and nothing else: a DARK HAIR MASS, a LIGHT FACE PLANE,
 * and the notch between them. Two rebuilds ago it had those the wrong way round — a thin hair
 * strip on a big pale cranium — and the fix for that stacked EIGHT chamfered boxes on the crown
 * (a cap, a second crown slab, a back mass, two temples, a sheared fringe, a tuft rotated on all
 * three axes). Each of those boxes brings its own top face, its own twelve chamfer bevels and its
 * own silhouette edge, all crowding the same 60 mm of skull, and the review's verdict was exactly
 * what that predicts: "the crown reads as a jumble of facets at 3/4 angles".
 *
 * More detail was never the answer. The head is now TWO CONTINUOUS SHELLS swept through rings
 * (see facetedShell), so the crown is four planes wide instead of forty:
 *
 *   skin shell   chin -> jaw -> cheekbone -> eye band -> BROW RIDGE -> forehead. The brow ring
 *                is the only one that steps forward, so the ring under it falls into its shadow
 *                and the eyes sit in a band that is darker than the plane above and below — a
 *                brow you read as a brow without modelling one.
 *   hair shell   a shaped hairline, a vertical wall up to the widest point, then two bevels into
 *                one flat crown plane. From behind: wall, bevel, bevel, cap. Four values, four
 *                hard edges, no noise.
 *
 * Every side quad in both shells is planar by construction — see the planarity contract on
 * facetedShell, because `flatShading` creases anything that is not.
 *
 * Only the graphic features (eyes, brows, nose, mouth, ears) are still boxes, because they are
 * meant to read as applied marks rather than as form. Their depths are set so the front face
 * clears the shell by 1-2 mm: a dark plate that stands proud catches the key on its own front
 * and turns grey, and a grey plate is not an eye.
 */
function buildHead(m: Mats): THREE.Group {
  const g = new THREE.Group();
  const b = new PartBuilder();
  g.name = 'head';

  // --- the skin shell -------------------------------------------------------------------
  // Rings bottom to top. `r` is the half-width; the ring's front plane sits at -r * HEAD_ASPECT
  // + zOff, which is the number that matters for everything applied to the face below.
  // THE BROW RIDGE SITS AT 0.178, NOT AT 0.188. The first pass put it 8 mm under a hairline at
  // 0.196 and the forehead disappeared: brow, brows and fringe all landed in the same 20 mm and
  // the face lost the one big uninterrupted skin plane that tells you it is a face. 34 mm of
  // clear forehead on the low side of the part is the cheapest legibility on the whole head.
  const skull = facetedShell(HEAD_DIRS, [
    { y: 0.018, r: 0.048, zOff: -0.018 },   // chin, led forward
    { y: 0.062, r: 0.080, zOff: -0.010 },   // jaw
    { y: 0.116, r: 0.106, zOff: 0.004 },    // cheekbone — the widest point of the face
    { y: 0.156, r: 0.108, zOff: 0.002 },    // eye band
    { y: 0.178, r: 0.110, zOff: -0.002 },   // brow ridge: the one ring that steps forward
    { y: 0.212, r: 0.108, zOff: 0.004 },    // forehead
    { y: 0.240, r: 0.092, zOff: 0.008 },    // crown, under the hair
  ], HEAD_ASPECT);
  // `front` is doing real work here: the office key is overhead, so the face plane and the
  // temples either side of it are all vertical and all take the same grazing light. Lifting the
  // forward-facing facets is what separates the face from the sides of the head. `aoFloor` is
  // pushed BELOW the chin on purpose — at the default (the chin itself) the underside of the jaw
  // bottomed the gradient out and read as a painted-on goatee rather than as contact shadow.
  b.add(skull, m.skin, {
    tint: { ao: 0.40, aoFloor: -0.05, aoTop: 0.20, back: 0.28, front: 0.11 },
  });

  // Ears: small, but they break the outline where the hair ends and the jaw begins.
  for (const s of [-1, 1]) {
    b.add(chamferBox(0.020, 0.062, 0.044, 0.008), m.skin, {
      pos: [s * 0.112, 0.118, 0.016], tint: { ao: 0.34, tint: 0xdedede },
    });
  }

  // --- graphic features -----------------------------------------------------------------
  // Nose: a wedge, wide at the nostril and narrow at the bridge, leading with its tip. It is
  // the only thing on the face with a top plane, so it is the only thing the overhead key can
  // actually catch — which is what puts a shadow on one cheek and makes the face read as 3D.
  const nose = chamferBox(0.038, 0.056, 0.040, 0.009);
  taper(nose, 'y', 1.0, 0.48);
  shear(nose, 'z', 'y', 0.22);
  b.add(nose, m.skin, { pos: [0, 0.120, -0.106], tint: { tint: 0xfff0e4, front: 0.10 } });

  // Eyes: flat dark rectangles set into the face plane — no sockets, no whites. The face front
  // at this height is z = -0.098, so a 8 mm plate centred at -0.0954 stands 1.5 mm proud: enough
  // to never z-fight, little enough that it keeps no lit front face of its own.
  for (const s of [-1, 1]) {
    b.add(chamferBox(0.044, 0.026, 0.008, 0.003), m.dark, {
      pos: [s * 0.050, 0.140, -0.0954], tint: { tint: 0x18181c },
    });
  }
  // Brows in hair colour, angled in, sitting just under the lip of the brow ridge with a clear
  // 30 mm band of skin between them and the eyes. Set them any closer and brow + eye merge into
  // one dark bar and he reads as wearing sunglasses, which is what an earlier pass did; set them
  // any HIGHER and they collide with the fringe, which is what the pass before this one did.
  for (const s of [-1, 1]) {
    b.add(chamferBox(0.050, 0.011, 0.012, 0.004), m.hair, {
      pos: [s * 0.051, 0.170, -0.0993], rot: [0, 0, -s * 0.20], tint: { tint: 0xf0f0f0 },
    });
  }
  // Mouth: one dark bar under the nose. Any lower and it lands in the jaw's own occlusion
  // gradient and reads as a second chin.
  b.add(chamferBox(0.046, 0.011, 0.008, 0.003), m.dark, {
    pos: [0, 0.086, -0.0878], tint: { tint: 0x141418 },
  });

  // --- the hair shell -------------------------------------------------------------------
  // Ring 0 and ring 1 share a footprint, so the band between them is a set of VERTICAL planes
  // whatever the hairline does — that is the legal way to cut a shaped edge into a shell, and
  // it is what gives the hair a hard bottom silhouette instead of a bevelled mush.
  // Rings 2 and 3 shrink and slide (+x, +z) at the same time, so the crown is swept back and to
  // one side. That is the whole of the head's asymmetry, and it costs four planes.
  const hair = facetedShell(HEAD_DIRS, [
    { y: HAIRLINE, r: 0.124 },
    { y: 0.230, r: 0.124 },
    { y: 0.256, r: 0.111, xOff: 0.005, zOff: 0.005 },
    { y: 0.271, r: 0.068, xOff: 0.011, zOff: 0.013 },
  ], HEAD_ASPECT);
  // The AO gradient runs the full height of the hair, so the nape is the darkest thing on the
  // character and the flat crown cap is the brightest hair plane. Overhead key, dark mass, one
  // lit top: that is a head from any angle, including straight down the chase camera.
  b.add(hair, m.hair, { tint: { ao: 0.38, back: 0.20 } });

  b.flushInto(g, 'head');
  return g;
}

function buildTorso(m: Mats): { chest: THREE.Group; hips: THREE.Group; tie: THREE.Group } {
  // --- hips -----------------------------------------------------------------
  const hips = new THREE.Group();
  hips.name = 'hips';
  const hb = new PartBuilder();
  // Pelvis block: this is what he is actually sitting on, so it is wide and flat.
  const pelvis = chamferBox(0.320, 0.150, 0.250, 0.032);
  taper(pelvis, 'y', 0.92, 1.0);
  hb.add(pelvis, m.dark, { pos: [0, 0.020, 0.012], tint: { ao: 0.55, back: 0.18 } });
  // Belt: same material, dropped a value by vertex tint so it reads as a hard dark band
  // directly under the white shirt hem. That white-over-black step is the waistline.
  hb.add(chamferBox(0.336, 0.040, 0.262, 0.010), m.dark, {
    pos: [0, 0.084, 0.012], tint: { tint: 0x5a5a64 },
  });
  // Buckle — a tiny bright note dead centre.
  hb.add(chamferBox(0.046, 0.032, 0.016, 0.005), m.dark, {
    pos: [0, 0.084, -0.130], tint: { tint: 0xffe9a8 },
  });
  // Shirt hem: the tail of the shirt hangs over the belt, so the value ladder up the body is
  // charcoal -> black belt -> white, with no ambiguous transition in between.
  const hem = chamferBox(0.318, 0.062, 0.248, 0.020);
  taper(hem, 'y', 1.0, 1.05);
  hb.add(hem, m.shirt, { pos: [0, 0.128, 0.010], tint: { ao: 0.44, back: 0.34, aoTop: 0.03 } });
  hb.flushInto(hips, 'hips');

  // --- chest ----------------------------------------------------------------
  const chest = new THREE.Group();
  chest.name = 'chest';
  const cb = new PartBuilder();
  // Shirt: two stacked volumes, the upper one much wider, so the torso tapers to the waist
  // and the shoulder line is a hard horizontal plane the key light can catch.
  //
  // BOTH VOLUMES ARE SIZED OFF `P.spine` / `P.shoulderY`, not typed in. The chest pivot sits
  // P.spine above the hip joint and the shoulder pivot P.shoulderY above that, so the shirt has
  // to span from just under the hip's own shirt hem all the way to the collar or the figure has
  // a gap where its ribcage should be. Getting this wrong is invisible in a T-pose and glaring
  // the moment the torso folds forward over the backrest.
  const waistH = P.spine - 0.115;              // meets the hips' shirt hem, overlapping it
  const waist = chamferBox(0.300, waistH, 0.216, 0.030);
  taper(waist, 'y', 0.92, 1.06);
  cb.add(waist, m.shirt, { pos: [0, -waistH * 0.5, 0.008], tint: { ao: 0.40, back: 0.30 } });

  const upperH = P.shoulderY + 0.115;          // waist top up past the shoulder line
  const upper = chamferBox(0.372, upperH, 0.248, 0.038);
  taper(upper, 'y', 0.90, 1.0);
  cb.add(upper, m.shirt, {
    pos: [0, upperH * 0.5 - 0.085, 0.004], tint: { ao: 0.26, back: 0.34, aoTop: 0.10 },
  });
  // Sternum plane: one more hard horizontal break across the front of a now much taller chest,
  // so the shirt is not a single flat card from the follow camera.
  cb.add(chamferBox(0.286, 0.104, 0.212, 0.026), m.shirt, {
    pos: [0, P.shoulderY * 0.42, -0.030], rot: [0.10, 0, 0], tint: { tint: 0xededed, ao: 0.14 },
  });

  // Deltoid caps: the shoulders in the reference are BROADER than the chair back. Without
  // these the backrest silhouette swallows the character from the follow camera.
  for (const s of [-1, 1]) {
    const cap = chamferBox(0.108, 0.150, 0.212, 0.034);
    taper(cap, 'y', 1.0, 0.86);
    cb.add(cap, m.shirt, {
      pos: [s * 0.170, P.shoulderY - 0.025, 0.004], rot: [0, 0, s * 0.12], tint: { ao: 0.2, back: 0.32 },
    });
  }

  // Collar: two angled planes making a V at the front, plus a raised band round the back.
  // The back band is what the follow camera sees — a bright horizontal edge that separates the
  // dark hair mass above from the shirt below.
  // One continuous band round the neck, split at the front into a shallow V. Built as three
  // pieces of the SAME depth and height so it reads as a collar rather than as loose plates
  // stuck to the chest, which is what a set of individually rotated slabs looks like head-on.
  // Anchored to the top of the shirt volume rather than typed in, so it tracks P.chest.
  const collarY = P.chest - 0.050;
  for (const s of [-1, 1]) {
    cb.add(chamferBox(0.062, 0.044, 0.104, 0.010), m.shirt, {
      pos: [s * 0.062, collarY, -0.036], rot: [0.10, s * 0.30, -s * 0.16], tint: { tint: 0xf0f0f0 },
    });
  }
  for (const s of [-1, 1]) {
    cb.add(chamferBox(0.070, 0.042, 0.048, 0.009), m.shirt, {
      pos: [s * 0.036, collarY - 0.004, -0.098], rot: [0.16, 0, -s * 0.36], tint: { tint: 0xffffff },
    });
  }
  cb.add(chamferBox(0.150, 0.048, 0.052, 0.010), m.shirt, {
    pos: [0, collarY + 0.006, 0.056], rot: [-0.16, 0, 0], tint: { tint: 0xffffff },
  });

  // Neck. Deliberately a full value below the shirt and a full value above the hair, so the
  // head is joined to the body by a visible step rather than by a seam.
  cb.add(chamferBox(0.090, P.chest * 0.62, 0.088, 0.014), m.skin, {
    pos: [0, P.chest - 0.085, 0.010], tint: { ao: 0.70, aoTop: P.chest },
  });
  cb.flushInto(chest, 'chest');

  // --- tie ------------------------------------------------------------------
  // The single saturated shape on the whole character, and the only thing in the frame that
  // is allowed to be this chromatic. It hangs off its own pivot so it can flutter with speed.
  const tie = new THREE.Group();
  tie.name = 'tie';
  // Knot under the collar, blade long enough to finish just above the belt. Both are measured
  // off the chest's real length: a tie authored for a 0.155 chest stops halfway down a 0.265
  // one and reads as a bib.
  tie.position.set(0, P.chest - 0.075, -0.118);
  const bladeLen = P.spine + P.chest - 0.300;
  const tb = new PartBuilder();
  tb.add(chamferBox(0.048, 0.046, 0.030, 0.008), m.tie, {
    pos: [0, -0.012, -0.006], tint: { tint: 0xffffff },
  });
  const blade = chamferBox(0.056, bladeLen, 0.024, 0.008);
  taper(blade, 'y', 0.62, 1.0);
  tb.add(blade, m.tie, {
    pos: [0, -0.035 - bladeLen * 0.5, -0.004], tint: { ao: 0.22, aoTop: -0.04 },
  });
  const tip = chamferBox(0.056, 0.052, 0.024, 0.010);
  taper(tip, 'y', 0.10, 1.0);
  tb.add(tip, m.tie, { pos: [0, -0.058 - bladeLen, -0.004], tint: { tint: 0xd8d8d8 } });
  tb.flushInto(tie, 'tie');

  return { chest, hips, tie };
}

function buildArm(m: Mats, side: number): Arm {
  const shoulder = new THREE.Group();
  shoulder.name = side < 0 ? 'shoulderL' : 'shoulderR';
  shoulder.position.set(side * P.shoulderX, P.shoulderY, 0);

  const sb = new PartBuilder();
  // Shirt sleeve, running most of the way to the elbow.
  //
  // The previous sleeve was 50 mm long, so 80% of both arms was bare skin. Held out in front
  // of him on the backrest, that put two big warm tubes either side of a warm head with a small
  // white torso hidden behind them: the character read as skin-coloured, and the white shirt —
  // the thing that is supposed to carry the silhouette — barely appeared at all. A long sleeve
  // spends the arms on the shirt's value instead, and its cuff is a hard break mid-limb.
  const sleeveLen = P.upperArm * 0.60;
  const sleeve = chamferBox(0.114, sleeveLen, 0.114, 0.020);
  taper(sleeve, 'y', 0.80, 1.08);
  sb.add(sleeve, m.shirt, {
    pos: [0, -sleeveLen * 0.5 + 0.010, 0], tint: { ao: 0.26, back: 0.32, aoTop: 0.02 },
  });
  sb.add(chamferBox(0.106, 0.024, 0.106, 0.008), m.shirt, {
    pos: [0, -sleeveLen + 0.004, 0], tint: { tint: 0xb8b8b8 },
  });
  // Bare lower half of the upper arm. Slimmer than before — the reference's arms are lean, and
  // a thinner limb reads as a limb instead of as a pipe.
  const bareLen = P.upperArm - sleeveLen;
  const bicep = chamferBox(0.074, bareLen + 0.028, 0.078, 0.018);
  taper(bicep, 'y', 0.90, 1.0);
  sb.add(bicep, m.skin, {
    pos: [0, -sleeveLen - bareLen * 0.5 + 0.006, 0], tint: { ao: 0.28, back: 0.24 },
  });
  sb.flushInto(shoulder, 'upperArm');

  const elbow = new THREE.Group();
  elbow.name = side < 0 ? 'elbowL' : 'elbowR';
  elbow.position.set(0, -P.upperArm, 0);
  shoulder.add(elbow);

  const eb = new PartBuilder();
  const fore = chamferBox(0.072, P.foreArm, 0.076, 0.016);
  taper(fore, 'y', 0.78, 1.06);
  eb.add(fore, m.skin, { pos: [0, -P.foreArm * 0.5, 0], tint: { ao: 0.24, back: 0.22 } });
  eb.flushInto(elbow, 'foreArm');

  // WRIST — a real joint, not a lump on the end of the forearm.
  //
  // The fist used to be merged into the forearm mesh, which cost two separate things:
  //   1. TrickAnimator's `hand` slot bound to nothing, so every authored wrist rotation was
  //      silently dropped — including poseGrip's own "knuckles over the rail" roll, which is
  //      the detail that makes the hands read as GRIPPING the backrest rather than as two
  //      blocks parked next to it, and the wrist ops in coffee_mug / keyboard_clutch /
  //      monitor_hug / quarterly_report / pink_slip.
  //   2. the forearm had no child joint, so its length had to be guessed (0.95x the upper arm)
  //      and its rest direction inferred from mesh centroids rather than measured.
  // The joint sits exactly where the two-bone grip IK already places its end effector, so the
  // hands land in the same place as before; only their orientation is now drivable.
  const wrist = new THREE.Group();
  wrist.name = side < 0 ? 'wristL' : 'wristR';
  wrist.position.set(0, -P.foreArm, 0);
  elbow.add(wrist);

  const wb = new PartBuilder();
  // Fist CLOSED ROUND A RAIL. TrickAnimator solves the wrist onto the backrest's top edge, so
  // the hand has to look like it is wrapped over a bar from any angle: a block for the palm, a
  // knuckle ridge across the far side, and a thumb laid along the inboard face.
  wb.add(chamferBox(0.076, 0.082, 0.096, 0.018), m.skin, {
    pos: [0, -0.036, -0.006], rot: [0.28, 0, 0], tint: { ao: 0.44, back: 0.2 },
  });
  wb.add(chamferBox(0.078, 0.030, 0.038, 0.010), m.skin, {
    pos: [0, -0.060, -0.044], rot: [0.28, 0, 0], tint: { tint: 0xfff4ea },
  });
  wb.add(chamferBox(0.028, 0.050, 0.050, 0.011), m.skin, {
    pos: [-side * 0.038, -0.024, -0.034], rot: [0.38, 0, 0], tint: { tint: 0xf2f2f2 },
  });
  wb.flushInto(wrist, 'fist');

  return { shoulder, elbow, origin: new THREE.Vector3(side * P.shoulderX, P.shoulderY, 0), side };
}

function buildLeg(m: Mats, side: number): Leg {
  const hip = new THREE.Group();
  hip.name = side < 0 ? 'hipL' : 'hipR';
  hip.position.set(side * P.hipX, -0.010, -0.010);

  const hb = new PartBuilder();
  // Thigh. Tapered hard from a full hip to a narrow knee, and DEEPER than it is wide, so the
  // top plane of the trouser leg catches the key and draws the limb's direction. A leg that is
  // square in section reads as a post from every angle, which is why the legs did not parse.
  const thigh = chamferBox(0.150, P.thigh, 0.168, 0.028);
  taper(thigh, 'y', 0.72, 1.06);
  hb.add(thigh, m.dark, { pos: [0, -P.thigh * 0.5, 0], tint: { ao: 0.34, back: 0.26 } });
  hb.flushInto(hip, 'thigh');

  const knee = new THREE.Group();
  knee.name = side < 0 ? 'kneeL' : 'kneeR';
  knee.position.set(0, -P.thigh, 0);
  hip.add(knee);

  const kb = new PartBuilder();
  // Knee cap: a proud block ON the joint, one value up. This is what makes a bent leg read as
  // BENT rather than as a kinked pipe — the eye finds the corner because the corner is lit
  // differently from the two segments either side of it.
  kb.add(chamferBox(0.130, 0.070, 0.146, 0.020), m.dark, {
    pos: [0, -0.008, -0.008], tint: { tint: 0xd6d6de, ao: 0.18 },
  });
  const shin = chamferBox(0.124, P.shin, 0.134, 0.024);
  taper(shin, 'y', 0.66, 1.0);
  kb.add(shin, m.dark, { pos: [0, -P.shin * 0.5, 0], tint: { ao: 0.30, back: 0.26 } });
  // Trouser cuff — a hard break just above the shoe so the leg does not read as one taper.
  kb.add(chamferBox(0.110, 0.044, 0.124, 0.012), m.dark, {
    pos: [0, -P.shin + 0.030, 0.002], tint: { tint: 0xbcbcc4 },
  });
  kb.flushInto(knee, 'shin');

  const ankle = new THREE.Group();
  ankle.name = side < 0 ? 'ankleL' : 'ankleR';
  ankle.position.set(0, -P.shin, 0);
  knee.add(ankle);

  const ab = new PartBuilder();
  // Shoe: chunky, angled, near-black. Vertex tint drops it two stops under the slacks so the
  // two masses separate without spending a second material on it.
  //
  // The shoe's bulk is deliberately kept close under the ankle. TrickAnimator measures how far
  // the geometry hangs below the ankle joint (`footDrop`) and lifts every planted-foot IK target
  // by exactly that much, so a deep shoe costs the push leg reach it does not have — the pelvis
  // sits 0.83 m up and the leg is 0.80 m long.
  //
  // Its mass also has to stay biased toward -Z: TrickAnimator's `detectFacing` votes on which
  // way the shoe points to decide which way the whole rig faces, and this rig has no toe joint
  // for it to use instead. Flip this and the rider rides backwards.
  const shoe = chamferBox(0.106, 0.072, P.foot, 0.018);
  shear(shoe, 'y', 'z', 0.09);
  ab.add(shoe, m.dark, {
    pos: [0, -P.ankle - 0.002, -P.foot * 0.5 + 0.058], tint: { tint: 0x3c3c42, ao: 0.35 },
  });
  // Sole: a lighter sliver under the shoe. It is the ground-contact cue — without it a black
  // shoe on a dark carpet has no bottom edge and the foot looks like it is sinking.
  ab.add(chamferBox(0.112, 0.020, P.foot * 0.98, 0.007), m.dark, {
    pos: [0, -P.ankle - 0.032, -P.foot * 0.5 + 0.058], tint: { tint: 0x9aa0ac },
  });
  // Toe cap: a separate plane on the front of the shoe, angled up.
  ab.add(chamferBox(0.094, 0.044, 0.062, 0.014), m.dark, {
    pos: [0, -P.ankle + 0.004, -P.foot + 0.048], rot: [-0.22, 0, 0], tint: { tint: 0x50505a },
  });
  // Heel / ankle collar.
  ab.add(chamferBox(0.098, 0.058, 0.068, 0.015), m.dark, {
    pos: [0, -P.ankle + 0.024, 0.022], tint: { tint: 0x2e2e34 },
  });
  ab.flushInto(ankle, 'foot');

  return { hip, knee, ankle, side };
}

// ---------------------------------------------------------------------------
// The character
// ---------------------------------------------------------------------------

const _handTarget = new THREE.Vector3();
const _poleTarget = new THREE.Vector3();
const _wp = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _delta = new THREE.Vector3();

export class StonksCharacter {
  readonly root = new THREE.Group();
  readonly triangles: number;
  private mats: Mats;

  private hips: THREE.Group;
  private torso = new THREE.Group();
  private chest: THREE.Group;
  private head: THREE.Group;
  private tie: THREE.Group;
  private arms: Arm[];
  private legs: Leg[];

  private current: PoseSpec = { ...POSES.sit };
  private targetPose: CharacterPose = 'sit';
  private motion: CharacterMotion = {
    speed: 0, turnRate: 0, grounded: true, grinding: false, airborne: false, airTime: 0,
  };
  private clock = 0;
  private leanPitch = 0;
  private leanRoll = 0;
  private cycle = 0;

  private prevPos = new THREE.Vector3();
  private prevYaw = 0;
  private hasPrev = false;
  private derivedSpeed = 0;
  private derivedTurn = 0;
  private speedOverridden = false;
  private turnOverridden = false;

  constructor(skin: CharacterSkin = 'tony_stonks') {
    this.root.name = `stonksCharacter_${skin}`;
    this.mats = makeMats(SKINS[skin] ?? SKINS.tony_stonks);
    const m = this.mats;

    const { chest, hips, tie } = buildTorso(m);
    this.hips = hips;
    this.chest = chest;
    this.tie = tie;

    // hips -> torso pivot -> chest -> head. The torso group is the lean joint.
    this.hips.position.set(0, P.hipY, 0);
    this.root.add(this.hips);

    this.torso.name = 'torso';
    this.torso.position.set(0, 0.052, 0.010);
    this.hips.add(this.torso);

    this.chest.position.set(0, P.spine - 0.052, 0);
    this.torso.add(this.chest);

    this.head = buildHead(m);
    // Lifted clear of the collar so a band of neck stays visible between the shirt and the
    // hair from behind. Without that band the head sits straight on the shoulders and the whole
    // upper body reads as one shape.
    this.head.position.set(0, P.chest + 0.008, 0.006);
    this.chest.add(this.head);

    this.chest.add(this.tie);

    this.arms = [buildArm(m, -1), buildArm(m, 1)];
    for (const a of this.arms) this.chest.add(a.shoulder);

    this.legs = [buildLeg(m, -1), buildLeg(m, 1)];
    for (const l of this.legs) this.hips.add(l.hip);

    let tris = 0;
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const pos = mesh.geometry.getAttribute('position');
      if (pos) tris += pos.count / 3;
    });
    this.triangles = tris;
    this.root.userData.triangles = tris;

    this.applyPose();
  }

  get materials(): THREE.MeshStandardMaterial[] { return this.mats.all; }

  setPose(pose: CharacterPose): void {
    this.targetPose = pose;
  }

  getPose(): CharacterPose { return this.targetPose; }

  setMotion(motion: Partial<CharacterMotion>): void {
    if (motion.speed !== undefined) this.speedOverridden = true;
    if (motion.turnRate !== undefined) this.turnOverridden = true;
    Object.assign(this.motion, motion);
  }

  /**
   * Advance the procedural animation.
   *
   * Everything here is additive on top of the pose table: the base pose blends toward the
   * requested state, and speed / turn rate / a push cycle are layered on. There is no clip
   * library, so there is nothing to mislabel and the still frame and the moving frame can
   * never look identical.
   */
  update(dt: number): void {
    const d = Math.min(dt, 0.1);
    this.clock += d;
    this.deriveMotion(d);

    const spec = POSES[this.targetPose] ?? POSES.sit;
    // Snappier into the dramatic poses, softer back into the cruise.
    const rate = this.targetPose === 'sit' || this.targetPose === 'idle' ? 7 : 13;
    const k = 1 - Math.exp(-rate * d);
    const c = this.current;
    c.torsoPitch += (spec.torsoPitch - c.torsoPitch) * k;
    c.torsoRoll += (spec.torsoRoll - c.torsoRoll) * k;
    c.chestPitch += (spec.chestPitch - c.chestPitch) * k;
    c.headPitch += (spec.headPitch - c.headPitch) * k;
    c.lift += (spec.lift - c.lift) * k;
    c.thighPitch += (spec.thighPitch - c.thighPitch) * k;
    c.thighSplay += (spec.thighSplay - c.thighSplay) * k;
    c.knee += (spec.knee - c.knee) * k;
    c.ankle += (spec.ankle - c.ankle) * k;
    c.legSplit += (spec.legSplit - c.legSplit) * k;
    c.elbowOut += (spec.elbowOut - c.elbowOut) * k;
    c.tiePitch += (spec.tiePitch - c.tiePitch) * k;
    for (let i = 0; i < 3; i++) c.hand[i] += (spec.hand[i] - c.hand[i]) * k;

    // --- speed / turn additives ---------------------------------------------
    const spd = Math.max(0, this.motion.speed);
    const leanTargetPitch = Math.min(spd * 0.020, 0.30);
    const leanTargetRoll = THREE.MathUtils.clamp(-this.motion.turnRate * 0.085, -0.26, 0.26);
    const lk = 1 - Math.exp(-6 * d);
    this.leanPitch += (leanTargetPitch - this.leanPitch) * lk;
    this.leanRoll += (leanTargetRoll - this.leanRoll) * lk;

    // Push / roll cycle: a real gait phase so the figure never freezes.
    this.cycle += d * (1.6 + Math.min(spd, 14) * 0.55);
    const bobbing = this.motion.grounded && !this.motion.grinding;
    const bob = bobbing ? Math.sin(this.cycle * 2.0) * Math.min(spd, 10) * 0.0016 : 0;
    const sway = bobbing ? Math.cos(this.cycle * 1.0) * Math.min(spd, 10) * 0.0035 : 0;

    this.applyPose({ bob, sway });
  }

  /**
   * Recover ground speed and yaw rate from the rig's own parent (the chair group) rather than
   * asking the game loop for them. Doing it here means the lean, the roll into turns, the gait
   * bob and the tie flutter all work with zero plumbing, in the editor and in the screenshot
   * harness as well as in play.
   */
  private deriveMotion(dt: number): void {
    const parent = this.root.parent;
    if (!parent || dt <= 0) return;

    _wp.setFromMatrixPosition(parent.matrixWorld);
    _fwd.set(0, 0, -1).applyMatrix4(parent.matrixWorld).sub(_wp);
    const yaw = Math.atan2(_fwd.x, _fwd.z);

    if (this.hasPrev) {
      _delta.subVectors(_wp, this.prevPos);
      _delta.y = 0;
      const measured = _delta.length() / dt;
      // Physics can hand us a single-frame spike on a landing; smooth it.
      this.derivedSpeed += (Math.min(measured, 40) - this.derivedSpeed) * Math.min(1, 10 * dt);

      let dy = yaw - this.prevYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      const rate = THREE.MathUtils.clamp(dy / dt, -8, 8);
      this.derivedTurn += (rate - this.derivedTurn) * Math.min(1, 8 * dt);
    }
    this.prevPos.copy(_wp);
    this.prevYaw = yaw;
    this.hasPrev = true;

    if (!this.speedOverridden) this.motion.speed = this.derivedSpeed;
    if (!this.turnOverridden) this.motion.turnRate = this.derivedTurn;
  }

  private applyPose(extra?: { bob: number; sway: number }): void {
    const c = this.current;
    const bob = extra?.bob ?? 0;
    const sway = extra?.sway ?? 0;

    this.hips.position.y = P.hipY + c.lift + bob;
    this.hips.rotation.z = sway * 0.5;

    this.torso.rotation.x = c.torsoPitch + this.leanPitch;
    this.torso.rotation.z = c.torsoRoll + this.leanRoll + sway;
    this.chest.rotation.x = c.chestPitch + this.leanPitch * 0.35;
    this.chest.rotation.z = this.leanRoll * 0.4;
    // The head counter-rotates: it stays level while the body leans, which is what makes a
    // procedural figure look alive instead of like one rigid prop.
    this.head.rotation.x = c.headPitch - (this.leanPitch * 0.75 + c.torsoPitch * 0.45);
    this.head.rotation.z = -(this.leanRoll * 0.9);
    this.head.rotation.y = THREE.MathUtils.clamp(-this.motion.turnRate * 0.10, -0.30, 0.30);

    // Tie: hangs under gravity at rest, streams back and flutters at speed.
    const flutter = Math.sin(this.clock * 11) * 0.10 * Math.min(1, this.motion.speed / 6);
    this.tie.rotation.x = c.tiePitch - Math.min(this.motion.speed * 0.055, 0.85) + flutter;
    this.tie.rotation.z = -this.leanRoll * 1.4 + Math.sin(this.clock * 7.3) * 0.05 * Math.min(1, this.motion.speed / 8);

    // --- legs ---------------------------------------------------------------
    for (const leg of this.legs) {
      const split = leg.side * c.legSplit;
      const pedal = this.motion.grounded && this.targetPose === 'push'
        ? Math.sin(this.cycle * 3.0 + (leg.side > 0 ? Math.PI : 0)) * 0.30
        : 0;
      leg.hip.rotation.x = c.thighPitch - split * 0.5 + pedal;
      leg.hip.rotation.z = -leg.side * c.thighSplay;
      leg.hip.rotation.y = leg.side * c.thighSplay * 0.35;
      leg.knee.rotation.x = c.knee + split * 0.4 - Math.abs(pedal) * 0.5;
      leg.ankle.rotation.x = c.ankle;
    }

    // --- arms (IK) ----------------------------------------------------------
    for (const arm of this.arms) {
      _handTarget.set(arm.side * c.hand[0], c.hand[1], c.hand[2]);
      // The IK runs in CHEST space, but the hand targets are authored in ROOT space (they are
      // chair sockets), so undo the torso lean before solving. Doing it analytically is much
      // cheaper and far more stable than a matrix round-trip through world space.
      this.chestToRoot(_handTarget, true);
      _poleTarget.set(
        arm.side * (P.shoulderX + 0.16 + c.elbowOut * 0.20),
        -0.34 - c.elbowOut * 0.10,
        0.34 + c.elbowOut * 0.16,
      );
      solveTwoBone(arm, _handTarget, _poleTarget, P.upperArm, P.foreArm);
    }
  }

  /**
   * Transform a point between root space and chest space using only the rig's own euler
   * chain (hips translate, torso pitch/roll, chest pitch/roll). `inverse` maps root -> chest.
   */
  private chestToRoot(v: THREE.Vector3, inverse: boolean): void {
    const tPitch = this.torso.rotation.x;
    const tRoll = this.torso.rotation.z;
    const cPitch = this.chest.rotation.x;
    const cRoll = this.chest.rotation.z;
    const hipY = this.hips.position.y;
    const hipRoll = this.hips.rotation.z;

    if (inverse) {
      v.y -= hipY;
      rotZ(v, -hipRoll);
      v.y -= this.torso.position.y;
      v.z -= this.torso.position.z;
      rotZ(v, -tRoll);
      rotX(v, -tPitch);
      v.y -= this.chest.position.y;
      rotZ(v, -cRoll);
      rotX(v, -cPitch);
    } else {
      rotX(v, cPitch);
      rotZ(v, cRoll);
      v.y += this.chest.position.y;
      rotX(v, tPitch);
      rotZ(v, tRoll);
      v.y += this.torso.position.y;
      v.z += this.torso.position.z;
      rotZ(v, hipRoll);
      v.y += hipY;
    }
  }

  dispose(): void {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    for (const m of this.mats.all) m.dispose();
  }
}

function rotX(v: THREE.Vector3, a: number): void {
  if (a === 0) return;
  const c = Math.cos(a), s = Math.sin(a);
  const y = v.y, z = v.z;
  v.y = y * c - z * s;
  v.z = y * s + z * c;
}

function rotZ(v: THREE.Vector3, a: number): void {
  if (a === 0) return;
  const c = Math.cos(a), s = Math.sin(a);
  const x = v.x, y = v.y;
  v.x = x * c - y * s;
  v.y = x * s + y * c;
}
