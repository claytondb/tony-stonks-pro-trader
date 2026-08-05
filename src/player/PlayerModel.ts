/**
 * PlayerModel — the hero rig.
 *
 * This used to be an FBX loader wrapped around a Meshy.ai mannequin with twenty clips, none of
 * which matched their own names (the file's own comments recorded that "idle" played a
 * breakdance and "slide" played a parkour push). The art panel's verdict on it was blunt: the
 * hero was the weakest asset in the build, unreadable at gameplay distance, with no tie, no
 * silhouette, no hand contact and a pose that never changed between the static and the moving
 * screenshot.
 *
 * It is now a thin controller over `StonksCharacter`, a fully procedural faceted low-poly figure
 * authored against refs/player.png. The public API is unchanged so Game.ts keeps working, but
 * every "animation" is now a procedural pose blend rather than a clip lookup, which means:
 *   - no clip can be mislabelled, because there are no clips
 *   - the pose responds continuously to speed, turn rate, air time and grind state
 *   - the hands are IK-pinned to the chair's armrest sockets
 *
 * `setMotion()` is the new entry point; it is optional, and the model degrades to a static
 * cruise pose without it.
 */

import * as THREE from 'three';
import { loadSettings, PlayerSkin } from '../ui/GameStateManager';
import {
  StonksCharacter, STANDING_DROP,
  type CharacterMotion, type CharacterPose, type CharacterSkin,
} from './StonksCharacter';

export type AnimationName =
  | 'idle'        // Sitting idle (dozing)
  | 'push'        // Step forward and push
  | 'standtosit'  // Transition from standing to sitting
  | 'rolling'     // Chair sit idle while rolling
  | 'chairhold'   // Bar hang - holding chair above head (air trick)
  | 'trick'       // Breakdance trick
  | 'jump'        // Jump over obstacle
  | 'roll'        // Parkour roll
  | 'slide'       // Slide under chair
  | 'crash';      // Angry throw (crash/fail)

/** Every gameplay animation name resolves to one of the character's procedural poses. */
const POSE_FOR: Record<AnimationName, CharacterPose> = {
  idle: 'idle',
  rolling: 'sit',
  standtosit: 'sit',
  push: 'push',
  chairhold: 'air',
  jump: 'air',
  trick: 'trick',
  roll: 'trick',
  slide: 'grind',
  crash: 'crash',
};

/**
 * Local offsets, in CHAIR space. Game.ts drives the mount state through `setLocalPosition`
 * using values authored for the old FBX (which had its origin between the feet and was
 * offset sideways to compensate for the mannequin's off-centre pivot). Rather than make
 * Game.ts care about the new rig, the two call sites are recognised here and remapped onto
 * the character's own origin contract (root = seat top, centre, facing -Z).
 *
 * The chair group rides 0.70 m above the caster contact patch, and ChairModel tier 1 puts the
 * seat top 0.56 m above it, so the seated origin is chair-local y = 0.56 - 0.70.
 */
const MOUNTED_OFFSET = new THREE.Vector3(0, -0.140, 0.012);
const STANDING_OFFSET = new THREE.Vector3(0, -0.700 - STANDING_DROP, -1.05);

export class PlayerModel {
  private character: StonksCharacter | null = null;
  private currentAnimation: AnimationName | null = null;
  private currentSkin: PlayerSkin = 'tony_stonks';

  private localPosition = STANDING_OFFSET.clone();
  private mounted = false;

  /**
   * Set true once a TrickAnimator has bound to this rig and is driving the joints itself.
   * While it is set, `update()` stops stamping the root transform and `play()` stops
   * choosing poses, so the two systems are not fighting over the same objects.
   * (This is the integration contract TrickAnimator documents in REQUIRED_PLAYERMODEL_PATCH,
   * adapted to the procedural StonksCharacter rig that replaced the FBX.)
   */
  externalRootControl = false;

  /** Set while a `playOnce` clip is "running", so `play` does not stomp it early. */
  private oneShotUntil = 0;
  private oneShotNext: AnimationName | null = null;

  private grinding = false;

  getCurrentSkin(): PlayerSkin {
    return this.currentSkin;
  }

  async load(): Promise<THREE.Group> {
    const settings = loadSettings();
    this.currentSkin = settings.playerSkin;
    return this.build(this.currentSkin);
  }

  async changeSkin(skin: PlayerSkin): Promise<void> {
    if (skin === this.currentSkin && this.character) return;

    const parent = this.character?.root.parent ?? null;
    const pose = this.character?.getPose() ?? 'sit';
    if (this.character && parent) parent.remove(this.character.root);
    this.character?.dispose();
    this.character = null;

    this.currentSkin = skin;
    const root = this.build(skin);
    this.character!.setPose(pose);
    if (parent) parent.add(root);
    this.applyLocal();
  }

  private build(skin: PlayerSkin): THREE.Group {
    this.character = new StonksCharacter(skin as CharacterSkin);
    this.character.setPose(this.mounted ? 'sit' : 'stand');
    this.applyLocal();
    return this.character.root;
  }

  // -------------------------------------------------------------------------
  // Pose control
  // -------------------------------------------------------------------------

  play(name: AnimationName, options?: { loop?: boolean; fadeTime?: number }): void {
    if (!this.character) return;
    // TrickAnimator owns pose selection once it is attached.
    if (this.externalRootControl) { this.currentAnimation = name; return; }
    const loop = options?.loop ?? true;
    const now = performance.now();

    // A non-looping request behaves like the old `LoopOnce + clampWhenFinished`: it holds for
    // a beat and then releases back to whatever the game asks for next.
    if (!loop) this.oneShotUntil = now + 520;
    else if (now < this.oneShotUntil && this.currentAnimation !== name) return;

    if (this.currentAnimation === name) return;
    this.currentAnimation = name;
    this.character.setPose(this.resolvePose(name));
  }

  playOnce(name: AnimationName, thenPlay: AnimationName): void {
    this.oneShotNext = thenPlay;
    this.play(name, { loop: false });
  }

  private resolvePose(name: AnimationName): CharacterPose {
    const pose = POSE_FOR[name] ?? 'sit';
    // Grinding overrides the cruise pose: the braced, knees-together, arms-locked shape is
    // what makes a grind readable, and the gameplay layer never asks for it by name.
    if (this.grinding && (pose === 'sit' || pose === 'idle')) return 'grind';
    if (!this.mounted && (pose === 'sit' || pose === 'idle')) return 'stand';
    return pose;
  }

  /**
   * Feed the rig the frame's motion state. Optional — call it from the game loop to get the
   * speed lean, turn roll, gait bob, tie flutter and grind bracing.
   */
  setMotion(motion: Partial<CharacterMotion>): void {
    if (motion.grinding !== undefined && motion.grinding !== this.grinding) {
      this.grinding = motion.grinding;
      if (this.currentAnimation) this.character?.setPose(this.resolvePose(this.currentAnimation));
    }
    this.character?.setMotion(motion);
  }

  // -------------------------------------------------------------------------
  // Placement
  // -------------------------------------------------------------------------

  setLocalPosition(_x: number, _y: number, z: number): void {
    // Game.ts only ever asks for two placements: seated on the chair, or standing 1.2 m behind
    // it. Anything close to the chair's own centre line is the seated case.
    this.mounted = Math.abs(z) < 0.6;
    this.localPosition.copy(this.mounted ? MOUNTED_OFFSET : STANDING_OFFSET);
    this.applyLocal();
    if (this.character && this.currentAnimation) {
      this.character.setPose(this.resolvePose(this.currentAnimation));
    }
  }

  private applyLocal(): void {
    if (!this.character) return;
    this.character.root.position.copy(this.localPosition);
  }

  update(deltaTime: number, motion?: Partial<CharacterMotion>): void {
    if (!this.character) return;
    if (motion) this.setMotion(motion);

    if (this.oneShotNext && performance.now() >= this.oneShotUntil) {
      const next = this.oneShotNext;
      this.oneShotNext = null;
      this.play(next);
    }

    if (this.externalRootControl) return;

    this.character.update(deltaTime);
    // The rig owns its own transform; Game.ts writes the chair transform and nothing else.
    this.character.root.position.copy(this.localPosition);
    this.character.root.rotation.set(0, 0, 0);
  }

  getModel(): THREE.Group | null {
    return this.character?.root ?? null;
  }

  /**
   * Build the RigRefs TrickAnimator needs from the procedural StonksCharacter hierarchy.
   *
   * StonksCharacter is a plain Object3D chain, not a skinned FBX, so there are no THREE.Bone
   * instances for TrickAnimator's fuzzy name classifier to find. This adapter does two things:
   *   - renames the joint groups to names the classifier recognises (Hips / Spine / Chest /
   *     Head / LeftArm / LeftForeArm / LeftUpLeg / LeftLeg / LeftFoot ...), and
   *   - flags them `isBone`, which is all THREE.Bone actually adds over Object3D and all
   *     TrickAnimator reads (name, parent, position, quaternion, matrixWorld).
   *
   * Returns null when the rig has not loaded. The caller must treat a low bind count as a
   * failure and fall back to the built-in poses.
   */
  getRigRefs(chairRoot: THREE.Object3D): {
    model: THREE.Object3D;
    mixer: THREE.AnimationMixer | null;
    clips: Map<string, THREE.AnimationClip>;
    bones: Map<string, THREE.Bone>;
    chairRoot: THREE.Object3D;
  } | null {
    const root = this.character?.root;
    if (!root) return null;

    // slot name in StonksCharacter -> a name TrickAnimator's classifier binds.
    const RENAME: Record<string, string> = {
      hips: 'Hips',
      torso: 'Spine',
      chest: 'Chest',
      head: 'Head',
      shoulderL: 'LeftArm', shoulderR: 'RightArm',
      elbowL: 'LeftForeArm', elbowR: 'RightForeArm',
      hipL: 'LeftUpLeg', hipR: 'RightUpLeg',
      kneeL: 'LeftLeg', kneeR: 'RightLeg',
      ankleL: 'LeftFoot', ankleR: 'RightFoot',
    };

    // Collect the joints AS WE RENAME THEM.
    //
    // This used to rename every joint, flag it isBone, and then return `bones: new Map()` — an
    // empty map. TrickAnimator therefore bound zero joints and silently posed nothing, which is
    // why four separate attempts at authoring the kneeling pose produced no visible change: the
    // pose code was correct and was being handed an empty rig. The rider stayed in whatever
    // default stance StonksCharacter built him in.
    const bones = new Map<string, THREE.Bone>();
    root.traverse((o) => {
      const to = RENAME[o.name];
      if (!to) return;
      o.name = to;
      (o as THREE.Object3D & { isBone?: boolean }).isBone = true;
      bones.set(to, o as unknown as THREE.Bone);
    });

    return { model: root, mixer: null, clips: new Map(), bones, chairRoot };
  }

  getCurrentAnimation(): AnimationName | null {
    return this.currentAnimation;
  }

  isPlaying(name: AnimationName): boolean {
    return this.currentAnimation === name;
  }

  hasAnimation(_name: AnimationName): boolean {
    // Every name maps to a procedural pose, so they all exist by construction.
    return true;
  }

  dispose(): void {
    this.character?.dispose();
    this.character = null;
  }
}
