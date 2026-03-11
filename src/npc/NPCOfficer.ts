/**
 * NPCOfficer - Police officer NPC pursuer
 * Uses the npc-officer_Merged_Animations.glb model
 * States: IDLE, WALKING, CHASING, STUNNED
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type OfficerState = 'IDLE' | 'WALKING' | 'CHASING' | 'STUNNED';

export interface OfficerConfig {
  position: THREE.Vector3;
  patrolPoints?: THREE.Vector3[];  // Points to patrol between
  detectionRange?: number;          // Units to detect player (default 15)
  chaseRange?: number;              // Units to maintain chase (default 25)
  catchRange?: number;              // Units to trigger "caught" (default 2)
  walkSpeed?: number;               // Walk speed (default 3)
  runSpeed?: number;                // Run speed (default 7)
  stunDuration?: number;            // How long stun lasts in ms (default 3000)
}

export interface OfficerCallbacks {
  onCaught?: () => void;
}

// Animation clip name candidates - will be discovered at runtime
const ANIM_CANDIDATES = {
  idle: ['idle', 'Idle', 'IDLE', 'stand', 'Stand', 'Armature|idle', 'Armature|Idle'],
  walk: ['walk', 'Walk', 'WALK', 'walking', 'Walking', 'Armature|walk', 'Armature|Walk'],
  run: ['run', 'Run', 'RUN', 'running', 'Running', 'jog', 'Jog', 'Armature|run', 'Armature|Run'],
  stun: ['stun', 'Stun', 'fall', 'Fall', 'hit', 'Hit', 'death', 'Death', 'Armature|fall'],
};

export class NPCOfficer {
  private group: THREE.Group;
  private mixer: THREE.AnimationMixer | null = null;
  private clips: Map<string, THREE.AnimationClip> = new Map();
  private currentAction: THREE.AnimationAction | null = null;
  private state: OfficerState = 'IDLE';
  private config: Required<OfficerConfig>;
  private callbacks: OfficerCallbacks;

  // Patrol state
  private patrolIndex = 0;
  private patrolDirection = 1;

  // Stun timer
  private stunTimer = 0;

  // Resolved animation names
  private animNames: { idle: string; walk: string; run: string; stun: string | null } = {
    idle: '',
    walk: '',
    run: '',
    stun: null,
  };

  private loaded = false;

  constructor(config: OfficerConfig, callbacks: OfficerCallbacks = {}) {
    this.group = new THREE.Group();
    this.group.position.copy(config.position);

    this.config = {
      position: config.position.clone(),
      patrolPoints: config.patrolPoints || [],
      detectionRange: config.detectionRange ?? 15,
      chaseRange: config.chaseRange ?? 25,
      catchRange: config.catchRange ?? 2,
      walkSpeed: config.walkSpeed ?? 3,
      runSpeed: config.runSpeed ?? 7,
      stunDuration: config.stunDuration ?? 3000,
    };

    this.callbacks = callbacks;
  }

  /**
   * Load the GLB model and discover animations.
   * Resolves when model is ready to be added to the scene.
   */
  async load(loader?: GLTFLoader): Promise<THREE.Group> {
    const gltfLoader = loader || new GLTFLoader();

    const gltf = await gltfLoader.loadAsync('./models/npc-officer.glb');
    const model = gltf.scene;

    // Scale/orient model — adjust as needed once we see it
    model.scale.set(1, 1, 1);
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.group.add(model);

    // Set up animation mixer
    this.mixer = new THREE.AnimationMixer(model);

    // Log all available animation clips
    console.log(`[NPCOfficer] Available animation clips (${gltf.animations.length}):`);
    gltf.animations.forEach((clip, i) => {
      console.log(`  [${i}] "${clip.name}" (duration: ${clip.duration.toFixed(2)}s)`);
      this.clips.set(clip.name, clip);
    });

    // Resolve best animation names from candidates
    this.animNames.idle = this.findBestClip(ANIM_CANDIDATES.idle) || gltf.animations[0]?.name || '';
    this.animNames.walk = this.findBestClip(ANIM_CANDIDATES.walk) || this.animNames.idle;
    this.animNames.run = this.findBestClip(ANIM_CANDIDATES.run) || this.animNames.walk;
    this.animNames.stun = this.findBestClip(ANIM_CANDIDATES.stun) || null;

    console.log(`[NPCOfficer] Resolved animations:`, this.animNames);

    this.loaded = true;

    // Start in idle
    this.playAnim(this.animNames.idle, true);

    return this.group;
  }

  /**
   * Find the best matching clip name from a list of candidates.
   */
  private findBestClip(candidates: string[]): string | null {
    for (const candidate of candidates) {
      if (this.clips.has(candidate)) return candidate;
    }
    // Case-insensitive fallback
    const lower = candidates.map(c => c.toLowerCase());
    for (const [name] of this.clips) {
      if (lower.includes(name.toLowerCase())) return name;
    }
    return null;
  }

  /**
   * Play an animation by clip name with crossfade.
   */
  private playAnim(clipName: string, loop = true, fadeTime = 0.3): void {
    if (!this.mixer || !clipName) return;
    const clip = this.clips.get(clipName);
    if (!clip) return;

    const newAction = this.mixer.clipAction(clip);
    newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    newAction.clampWhenFinished = !loop;

    if (this.currentAction && this.currentAction !== newAction) {
      newAction.reset();
      newAction.play();
      this.currentAction.crossFadeTo(newAction, fadeTime, true);
    } else {
      newAction.reset();
      newAction.play();
    }

    this.currentAction = newAction;
  }

  /**
   * Update officer state and movement each frame.
   * @param dt - delta time in seconds
   * @param playerPosition - current player world position
   */
  update(dt: number, playerPosition: THREE.Vector3): void {
    if (!this.loaded || !this.mixer) return;

    // Update animation mixer
    this.mixer.update(dt);

    // Handle stun
    if (this.state === 'STUNNED') {
      this.stunTimer -= dt * 1000;
      if (this.stunTimer <= 0) {
        this.setState('IDLE');
      }
      return;
    }

    const myPos = this.group.position;
    const distToPlayer = myPos.distanceTo(playerPosition);

    // State transitions
    if (distToPlayer <= this.config.detectionRange) {
      // Player detected
      if (this.state !== 'CHASING') {
        this.setState('CHASING');
      }
    } else if (distToPlayer > this.config.chaseRange) {
      // Player too far — return to patrol
      if (this.state === 'CHASING') {
        this.setState(this.config.patrolPoints.length > 0 ? 'WALKING' : 'IDLE');
      }
    }

    // Movement (STUNNED is handled above with early return)
    const s = this.state as string;
    if (s === 'WALKING') {
      this.updatePatrol(dt);
    } else if (s === 'CHASING') {
      this.moveToward(playerPosition, this.config.runSpeed, dt);
      // Caught check
      if (distToPlayer <= this.config.catchRange) {
        this.callbacks.onCaught?.();
      }
    }
    // IDLE: stand still (no movement needed)
  }

  /**
   * Move toward a target position.
   */
  private moveToward(target: THREE.Vector3, speed: number, dt: number): void {
    const myPos = this.group.position;
    const dir = new THREE.Vector3()
      .subVectors(target, myPos)
      .setY(0)
      .normalize();

    const move = dir.multiplyScalar(speed * dt);
    myPos.add(move);

    // Face movement direction
    if (dir.lengthSq() > 0.001) {
      const angle = Math.atan2(dir.x, dir.z);
      this.group.rotation.y = angle;
    }
  }

  /**
   * Update patrol between patrol points.
   */
  private updatePatrol(dt: number): void {
    if (this.config.patrolPoints.length === 0) {
      this.setState('IDLE');
      return;
    }

    const target = this.config.patrolPoints[this.patrolIndex];
    const dist = this.group.position.distanceTo(target);

    if (dist < 1.0) {
      // Reached patrol point — advance
      this.patrolIndex += this.patrolDirection;
      if (this.patrolIndex >= this.config.patrolPoints.length) {
        this.patrolIndex = this.config.patrolPoints.length - 2;
        this.patrolDirection = -1;
      } else if (this.patrolIndex < 0) {
        this.patrolIndex = 1;
        this.patrolDirection = 1;
      }
    } else {
      this.moveToward(target, this.config.walkSpeed, dt);
    }
  }

  /**
   * Transition to a new state and play appropriate animation.
   */
  private setState(newState: OfficerState): void {
    if (this.state === newState) return;
    this.state = newState;

    switch (newState) {
      case 'IDLE':
        this.playAnim(this.animNames.idle, true);
        break;
      case 'WALKING':
        this.playAnim(this.animNames.walk, true);
        break;
      case 'CHASING':
        this.playAnim(this.animNames.run, true);
        break;
      case 'STUNNED':
        if (this.animNames.stun) {
          this.playAnim(this.animNames.stun, false);
        }
        break;
    }
  }

  /**
   * Trigger stun (e.g., player used a power-up).
   */
  stun(): void {
    this.stunTimer = this.config.stunDuration;
    this.setState('STUNNED');
  }

  /**
   * Force officer into chase mode immediately.
   */
  startChase(): void {
    this.setState('CHASING');
  }

  /**
   * Get the Three.js group to add to the scene.
   */
  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Get current officer state.
   */
  getState(): OfficerState {
    return this.state;
  }

  /**
   * Set officer world position.
   */
  setPosition(pos: THREE.Vector3): void {
    this.group.position.copy(pos);
  }

  /**
   * Remove from scene and clean up.
   */
  dispose(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
  }
}
