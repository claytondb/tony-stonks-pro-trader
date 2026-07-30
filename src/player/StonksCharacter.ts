/**
 * StonksCharacter — the hero, rebuilt.
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
 *   - two-bone IK on both arms, pinned to the chair's armrest sockets, so the grip contact from
 *     the concept art actually reads at gameplay distance
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
  PartBuilder, applyRimLight, chamferBox, shear, taper,
} from './LowPolyKit';

// ---------------------------------------------------------------------------
// Proportions — stylised, not anatomical. Head is ~1.35x life size on purpose.
// ---------------------------------------------------------------------------

const P = {
  hipY: 0.085,        // hip pivot above the seat top
  spine: 0.200,       // hips -> chest pivot
  chest: 0.155,       // chest pivot -> neck base
  neck: 0.045,
  headH: 0.235,
  headW: 0.212,
  headD: 0.205,

  shoulderX: 0.188,
  shoulderY: 0.082,   // above the chest pivot
  upperArm: 0.245,
  foreArm: 0.230,

  hipX: 0.108,
  thigh: 0.420,
  shin: 0.405,
  ankle: 0.072,
  foot: 0.245,
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

const SKINS: Record<CharacterSkin, SkinSpec> = {
  // The reference figure: bright white short-sleeve shirt, near-black slacks, one saturated
  // red accent. The shirt is the only high-value surface on the character, which is what makes
  // the silhouette legible at 40 m against a mid-tone carpet.
  tony_stonks: {
    shirt: 0xf2efe4, skin: 0xdfa374, hair: 0x4a2c18, tie: 0xc0202a,
    dark: 0x1d1f26, rim: 0xdbe6f7,
  },
  // Second skin reads cooler and older: pale blue shirt, gold tie, grey hair.
  stonks_guy: {
    shirt: 0xcedcec, skin: 0xc98d5f, hair: 0x2a2724, tie: 0xe0a129,
    dark: 0x262832, rim: 0xe8dcc4,
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
  const shirt = mk(spec.shirt, 0.74, 0.16);
  const skin = mk(spec.skin, 0.68, 0.22);
  const hair = mk(spec.hair, 0.86, 0.34);
  const tie = mk(spec.tie, 0.52, 0.20);
  // The slacks are the darkest mass in the frame and carry the strongest rim: this single
  // number is what stops the lower half of the character dissolving into the carpet.
  const dark = mk(spec.dark, 0.66, 0.60);
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

function buildHead(m: Mats): THREE.Group {
  const g = new THREE.Group();
  g.name = 'head';
  const b = new PartBuilder();
  const W = P.headW, H = P.headH, D = P.headD;
  const cy = H * 0.5;

  // Cranium: one big chamfered mass. The chamfer is deliberately huge (25 mm) so the head
  // reads as a faceted gem, exactly like the reference, rather than as a rounded ball.
  b.add(chamferBox(W, H * 0.72, D, 0.026), m.skin, {
    pos: [0, cy + H * 0.10, 0], tint: { ao: 0.26, back: 0.24, aoTop: cy },
  });
  // Jaw / chin: narrower, pushed forward, tilted. This is the plane that reads as a face.
  const jaw = chamferBox(W * 0.90, H * 0.36, D * 0.92, 0.020);
  shear(jaw, 'z', 'y', 0.16);
  b.add(jaw, m.skin, { pos: [0, cy - H * 0.24, -0.006], tint: { ao: 0.42, back: 0.22 } });
  // Ears.
  for (const s of [-1, 1]) {
    b.add(chamferBox(0.022, 0.058, 0.040, 0.008), m.skin, {
      pos: [s * (W * 0.5 - 0.002), cy + 0.006, 0.012], tint: { ao: 0.3, tint: 0xe8e8e8 },
    });
  }
  // Nose — a wedge, not a bump.
  const nose = chamferBox(0.034, 0.048, 0.040, 0.010);
  taper(nose, 'y', 1.0, 0.55);
  b.add(nose, m.skin, { pos: [0, cy - 0.016, -D * 0.5 - 0.006], tint: { tint: 0xfff2ea } });

  // Eyes: flat dark rectangles set into the face plane. The reference does exactly this —
  // no sculpted sockets, no whites, just two graphic shapes that read at thumbnail size.
  for (const s of [-1, 1]) {
    b.add(chamferBox(0.040, 0.030, 0.016, 0.004), m.dark, {
      pos: [s * 0.048, cy + 0.026, -D * 0.5 + 0.004], tint: { tint: 0x2a2a30 },
    });
  }
  // Brows — the only thing giving the face an expression at distance.
  for (const s of [-1, 1]) {
    b.add(chamferBox(0.048, 0.014, 0.018, 0.004), m.hair, {
      pos: [s * 0.049, cy + 0.056, -D * 0.5 + 0.006], rot: [0, 0, -s * 0.16],
      tint: { tint: 0xbfbfbf },
    });
  }

  // Hair: a chunky angular cap plus a swept fringe, in three separate planes so it catches
  // three different values off the key.
  b.add(chamferBox(W * 1.03, H * 0.30, D * 1.03, 0.024), m.hair, {
    pos: [0, H * 0.86, 0.004], tint: { ao: 0.18, back: 0.28 },
  });
  const fringe = chamferBox(W * 0.94, H * 0.14, D * 0.42, 0.014);
  shear(fringe, 'y', 'z', -0.22);
  b.add(fringe, m.hair, {
    pos: [0.010, H * 0.735, -D * 0.34], rot: [0.12, 0, 0.06], tint: { back: 0.2 },
  });
  b.add(chamferBox(W * 0.62, H * 0.16, D * 0.36, 0.016), m.hair, {
    pos: [-0.026, H * 0.94, -D * 0.20], rot: [0, 0.22, 0.10], tint: { back: 0.2 },
  });
  // Sideburns / back of the neck hairline.
  b.add(chamferBox(W * 0.98, H * 0.20, D * 0.30, 0.014), m.hair, {
    pos: [0, H * 0.60, D * 0.40], tint: { ao: 0.4, back: 0.3 },
  });

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
  // Belt: same material, lifted a value by vertex tint so it reads as a separate band.
  hb.add(chamferBox(0.336, 0.036, 0.262, 0.010), m.dark, {
    pos: [0, 0.086, 0.012], tint: { tint: 0x8e8e96 },
  });
  // Buckle — a tiny bright note dead centre.
  hb.add(chamferBox(0.044, 0.030, 0.016, 0.005), m.dark, {
    pos: [0, 0.086, -0.128], tint: { tint: 0xd8c898 },
  });
  hb.flushInto(hips, 'hips');

  // --- chest ----------------------------------------------------------------
  const chest = new THREE.Group();
  chest.name = 'chest';
  const cb = new PartBuilder();
  // Shirt: two stacked volumes, the upper one much wider, so the torso tapers to the waist
  // and the shoulder line is a hard horizontal plane the key light can catch.
  const waist = chamferBox(0.300, 0.150, 0.216, 0.030);
  taper(waist, 'y', 0.92, 1.06);
  cb.add(waist, m.shirt, { pos: [0, -0.062, 0.008], tint: { ao: 0.40, back: 0.30 } });

  const upper = chamferBox(0.372, 0.230, 0.248, 0.038);
  taper(upper, 'y', 0.90, 1.0);
  cb.add(upper, m.shirt, { pos: [0, 0.030, 0.004], tint: { ao: 0.26, back: 0.34, aoTop: 0.10 } });

  // Deltoid caps: the shoulders in the reference are BROADER than the chair back. Without
  // these the backrest silhouette swallows the character from the follow camera.
  for (const s of [-1, 1]) {
    const cap = chamferBox(0.108, 0.150, 0.212, 0.034);
    taper(cap, 'y', 1.0, 0.86);
    cb.add(cap, m.shirt, {
      pos: [s * 0.170, 0.070, 0.004], rot: [0, 0, s * 0.12], tint: { ao: 0.2, back: 0.32 },
    });
  }

  // Collar: two angled planes making a V, plus the back of the collar.
  for (const s of [-1, 1]) {
    cb.add(chamferBox(0.086, 0.052, 0.030, 0.008), m.shirt, {
      pos: [s * 0.050, 0.146, -0.088], rot: [0.30, 0, -s * 0.42], tint: { tint: 0xf6f6f6 },
    });
  }
  cb.add(chamferBox(0.150, 0.048, 0.036, 0.009), m.shirt, {
    pos: [0, 0.152, 0.070], rot: [-0.24, 0, 0], tint: { tint: 0xc8c8c8 },
  });

  // Neck.
  cb.add(chamferBox(0.088, P.chest * 0.52, 0.086, 0.014), m.skin, {
    pos: [0, P.chest - 0.048, 0.008], tint: { ao: 0.65, aoTop: P.chest },
  });
  cb.flushInto(chest, 'chest');

  // --- tie ------------------------------------------------------------------
  // The single saturated shape on the whole character, and the only thing in the frame that
  // is allowed to be this chromatic. It hangs off its own pivot so it can flutter with speed.
  const tie = new THREE.Group();
  tie.name = 'tie';
  tie.position.set(0, 0.140, -0.112);
  const tb = new PartBuilder();
  tb.add(chamferBox(0.048, 0.046, 0.030, 0.008), m.tie, {
    pos: [0, -0.012, -0.006], tint: { tint: 0xffffff },
  });
  const blade = chamferBox(0.056, 0.210, 0.024, 0.008);
  taper(blade, 'y', 0.62, 1.0);
  tb.add(blade, m.tie, { pos: [0, -0.140, -0.004], tint: { ao: 0.22, aoTop: -0.04 } });
  const tip = chamferBox(0.056, 0.052, 0.024, 0.010);
  taper(tip, 'y', 0.10, 1.0);
  tb.add(tip, m.tie, { pos: [0, -0.268, -0.004], tint: { tint: 0xd8d8d8 } });
  tb.flushInto(tie, 'tie');

  return { chest, hips, tie };
}

function buildArm(m: Mats, side: number): Arm {
  const shoulder = new THREE.Group();
  shoulder.name = side < 0 ? 'shoulderL' : 'shoulderR';
  shoulder.position.set(side * P.shoulderX, P.shoulderY, 0);

  const sb = new PartBuilder();
  // Short shirt sleeve — the reference wears one, and the hard cuff line is a free extra
  // silhouette break halfway down the upper arm.
  const sleeve = chamferBox(0.118, 0.124, 0.118, 0.022);
  taper(sleeve, 'y', 0.86, 1.0);
  sb.add(sleeve, m.shirt, { pos: [0, -0.052, 0], tint: { ao: 0.30, back: 0.30 } });
  // Bicep.
  const bicep = chamferBox(0.086, P.upperArm - 0.10, 0.090, 0.020);
  taper(bicep, 'y', 0.86, 1.02);
  sb.add(bicep, m.skin, { pos: [0, -(P.upperArm - 0.10) * 0.5 - 0.098, 0], tint: { ao: 0.26, back: 0.22 } });
  sb.flushInto(shoulder, 'upperArm');

  const elbow = new THREE.Group();
  elbow.name = side < 0 ? 'elbowL' : 'elbowR';
  elbow.position.set(0, -P.upperArm, 0);
  shoulder.add(elbow);

  const eb = new PartBuilder();
  const fore = chamferBox(0.082, P.foreArm, 0.084, 0.018);
  taper(fore, 'y', 0.80, 1.04);
  eb.add(fore, m.skin, { pos: [0, -P.foreArm * 0.5, 0], tint: { ao: 0.24, back: 0.22 } });
  // Fist wrapped round the armrest: a chunky block plus a thumb ridge, angled inboard.
  eb.add(chamferBox(0.082, 0.086, 0.104, 0.020), m.skin, {
    pos: [0, -P.foreArm - 0.038, -0.008], rot: [0.25, 0, 0], tint: { ao: 0.42, back: 0.2 },
  });
  eb.add(chamferBox(0.030, 0.052, 0.052, 0.012), m.skin, {
    pos: [-side * 0.040, -P.foreArm - 0.026, -0.036], rot: [0.35, 0, 0], tint: { tint: 0xf2f2f2 },
  });
  eb.flushInto(elbow, 'foreArm');

  return { shoulder, elbow, origin: new THREE.Vector3(side * P.shoulderX, P.shoulderY, 0), side };
}

function buildLeg(m: Mats, side: number): Leg {
  const hip = new THREE.Group();
  hip.name = side < 0 ? 'hipL' : 'hipR';
  hip.position.set(side * P.hipX, -0.010, -0.010);

  const hb = new PartBuilder();
  const thigh = chamferBox(0.146, P.thigh, 0.156, 0.030);
  taper(thigh, 'y', 0.80, 1.04);
  hb.add(thigh, m.dark, { pos: [0, -P.thigh * 0.5, 0], tint: { ao: 0.34, back: 0.24 } });
  hb.flushInto(hip, 'thigh');

  const knee = new THREE.Group();
  knee.name = side < 0 ? 'kneeL' : 'kneeR';
  knee.position.set(0, -P.thigh, 0);
  hip.add(knee);

  const kb = new PartBuilder();
  const shin = chamferBox(0.122, P.shin, 0.132, 0.026);
  taper(shin, 'y', 0.68, 1.02);
  kb.add(shin, m.dark, { pos: [0, -P.shin * 0.5, 0], tint: { ao: 0.30, back: 0.24 } });
  // Trouser cuff — a hard break just above the shoe so the leg does not read as one taper.
  kb.add(chamferBox(0.112, 0.042, 0.122, 0.012), m.dark, {
    pos: [0, -P.shin + 0.028, 0.002], tint: { tint: 0xb4b4b4 },
  });
  kb.flushInto(knee, 'shin');

  const ankle = new THREE.Group();
  ankle.name = side < 0 ? 'ankleL' : 'ankleR';
  ankle.position.set(0, -P.shin, 0);
  knee.add(ankle);

  const ab = new PartBuilder();
  // Shoe: chunky, angled, near-black. Vertex tint drops it below the slacks so the two masses
  // separate without spending a second material on it.
  const shoe = chamferBox(0.108, 0.078, P.foot, 0.020);
  shear(shoe, 'y', 'z', 0.10);
  ab.add(shoe, m.dark, {
    pos: [0, -P.ankle - 0.006, -P.foot * 0.5 + 0.062], tint: { tint: 0x6e6e74, ao: 0.35 },
  });
  // Sole: one value up, so the shoe has an edge.
  ab.add(chamferBox(0.114, 0.024, P.foot * 0.98, 0.008), m.dark, {
    pos: [0, -P.ankle - 0.044, -P.foot * 0.5 + 0.062], tint: { tint: 0x9a9aa2 },
  });
  ab.add(chamferBox(0.100, 0.060, 0.070, 0.016), m.dark, {
    pos: [0, -P.ankle + 0.020, 0.020], tint: { tint: 0x5e5e64 },
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
    this.head.position.set(0, P.chest - 0.010, 0.006);
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
