/**
 * Main Game class
 * Orchestrates all game systems
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import { InputManager } from '../input/InputManager';
import { THPSControls, type ControlIntent } from '../input/THPSControls';
import { PhysicsWorld, CHAIR_FOOT_OFFSET } from '../physics/PhysicsWorld';
import { GrindSystem } from '../physics/GrindSystem';
import { CameraController } from '../rendering/CameraController';
import { TrickDetector, PlayerTrickState } from '../tricks/TrickDetector';
import { TrickRegistry, TrickDefinition } from '../tricks/TrickRegistry';
import { ScoreSystem, yawDeltaDegrees, type BailReason, type ScoreEvent, type TrickKind } from '../gameplay/ScoreSystem';
import { BalanceSystem, type BalanceState } from '../gameplay/BalanceSystem';
import { GoalTracker, defaultGoalSetFor, matchGap, type GoalProgress } from '../gameplay/GoalSystem';
import { TrickAnimator } from '../gameplay/TrickAnimator';
import { DestructibleManager, scatterDestructibles, type DestructibleDef, type SmashEvent } from '../gameplay/Destructibles';
import { PoliceSquad, type SquadEvent } from '../gameplay/PoliceAI';
import { PaperStorm } from '../vfx/PaperStorm';
import { HUD } from '../ui/HUD';
import { PlayerModel } from '../player/PlayerModel';
import { proceduralSounds } from '../audio/ProceduralSounds';
import { GrindParticles } from '../effects/GrindParticles';
import { LandingParticles } from '../effects/LandingParticles';
import { SpeedLines } from '../effects/SpeedLines';
import { LevelData, LevelObject, getLevelById } from '../levels/LevelData';
import { EnvironmentRig, type EnvPreset } from '../rendering/Environment';
import { PostFX } from '../rendering/PostFX';
import { MaterialLibrary } from '../materials/MaterialLibrary';
import { configureFromRenderer, warmup } from '../materials/ProceduralTextures';
import { buildOfficeInterior, disposeOfficeInterior, type OfficeInterior } from '../world/OfficeLevel';
import { makeFilingCabinet, makeGrindRail, makeKickerRamp, makePrinter, makeTrashCan, makeWaterCooler } from '../world/OfficeProps';
import { buildOfficeChair, spinCasters, type ChairParts } from '../world/ChairModel';
import { storyProgress, getStoryLevelById, StoryLevelData, StoryCheckpoint } from '../story';
import { ChaseMechanic, ChaseState } from '../story/ChaseMechanic';
import { ChaseHUD } from '../ui/ChaseHUD';
import { DialogueBox } from '../ui/DialogueBox';

const DEG2RAD = Math.PI / 180;

/** Stable 32-bit hash, so a level's procedural scatter is identical every reload. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 65536 || 1;
}

export class Game {
  // Core
  private canvas: HTMLCanvasElement;
  private isRunning = false;
  private isPaused = false;
  private lastTime = 0;
  private accumulator = 0;
  
  // Level state
  private currentLevelId: string = '';
  private levelTime = 0;
  // TODO: Add LevelManager integration
  // private levelManager!: LevelManager;
  
  // Callbacks
  onLevelComplete?: (score: number, time: number, goalsCompleted: number, totalGoals: number) => void;
  onDialogueStart?: () => void;
  onDialogueEnd?: () => void;
  onCheckpointReached?: (checkpointIndex: number, checkpointName: string) => void;
  onChaseStateChange?: (state: ChaseState) => void;
  onOfficerCaught?: () => void;
  
  // Story systems
  private chaseMechanic!: ChaseMechanic;
  private chaseHUD: ChaseHUD | null = null;
  private dialogueBox: DialogueBox | null = null;
  private currentStoryLevel: StoryLevelData | null = null;
  private checkpoints: StoryCheckpoint[] = [];
  private lastCheckpointIndex = -1;
  private checkpointPosition: THREE.Vector3 | null = null;
  private checkpointRotation = 0;
  
  // Upgrade effect multipliers (from StoryProgress)
  private speedMultiplier = 1.0;
  private jumpMultiplier = 1.0;
  private spinMultiplier = 1.0;
  private grindBalanceDrift = 0.5;  // Lower = easier
  private manualBalanceDrift = 0.5;
  
  // Constants
  private readonly PHYSICS_TIMESTEP = 1 / 60;
  private readonly MAX_FRAME_SKIP = 5;
  private readonly COYOTE_TIME_MS = 130; // Allow jumping 130ms after leaving ground
  
  // Three.js
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;

  // Rendering pipeline: IBL + lighting rig, and the post-processing chain.
  // These own scene.environment, scene.fog, scene.background, all lights,
  // tone mapping and exposure. Do not add ad-hoc lights alongside them.
  private envRig!: EnvironmentRig;
  private postFX!: PostFX;
  private lastDelta = 1 / 60;
  private officeInterior: OfficeInterior | null = null;
  private chairParts: ChairParts | null = null;

  // Systems
  private input!: InputManager;
  /** The one source of player intent. Everything gameplay-facing reads this, never raw keys. */
  private controls!: THPSControls;
  private intent!: ControlIntent;
  /** The one authoritative score path. Nothing else may write the player's stonks. */
  private score!: ScoreSystem;
  private balance!: BalanceSystem;
  private goals: GoalTracker | null = null;
  private trickAnimator: TrickAnimator | null = null;
  private destructibles: DestructibleManager | null = null;
  private paperStorm: PaperStorm | null = null;
  private police: PoliceSquad | null = null;
  private physics!: PhysicsWorld;
  private grindSystem!: GrindSystem;
  private grindParticles!: GrindParticles;
  private landingParticles!: LandingParticles;
  private speedLines!: SpeedLines;
  private cameraController!: CameraController;
  private trickDetector!: TrickDetector;
  private hud!: HUD;
  private playerModel!: PlayerModel;

  // Game objects
  private chair!: THREE.Group;
  /**
   * Child of `chair` holding the chair mesh and the rider. The rigid body is Y-locked and
   * cannot pitch or roll itself, so BalanceSystem's visual lean is applied HERE.
   */
  private chairTilt!: THREE.Group;
  private chairBody!: RAPIER.RigidBody;
  private useGLBModel = true; // Set to false to use primitive shapes
  private wheelMeshes: THREE.Object3D[] = []; // Chair wheel meshes for spin animation
  
  // Level objects (can be cleared and reloaded)
  private levelObjects: THREE.Object3D[] = [];
  
  // Pre-loaded GLB models for level objects
  private modelCache: Map<string, THREE.Object3D> = new Map();
  private gltfLoader!: GLTFLoader;
  
  
  // Player state
  private playerState: PlayerTrickState = {
    isGrounded: true,
    isAirborne: false,
    isGrinding: false,
    isManualing: false,
    hasSpecial: false,
    airTime: 0
  };
  
  private specialMeter = 0;
  /** Live balance readout, 0..1 with 0.5 centred. Written by BalanceSystem, read by the HUD. */
  private balanceState: BalanceState | null = null;
  private spinRotation = 0;

  // --- trick bookkeeping -----------------------------------------------------------------
  /** The air trick currently being played, for the animator and the held-grab bail check. */
  private activeTrick: { id: string; kind: TrickKind; name: string; until: number } | null = null;
  /** Set while a grab is being HELD. Landing with it still held is a bail. */
  private heldGrabId: string | null = null;
  /** The named grind currently being scored, from TrickDetector.detectGrindType(). */
  private grindTrick: TrickDefinition | null = null;
  /** True when the landing came off a ramp/quarterpipe, which opens the full revert window. */
  private landedFromTransition = false;
  /** Charge held on the ollie button at the moment it popped, 0..1. */
  private ollieCharge = 1;
  /** Seconds of grace after a bail during which the player cannot score. */
  private bailRecovery = 0;
  /** Guards against a second bail landing in the same instant from a different source. */
  private lastBailTime = -Infinity;
  /** Seconds since the goal HUD was last rebuilt. */
  private goalHudTimer = 0;
  /** Highest speed seen this frame-pair, for the high-speed collision bail test. */
  private prevSpeed = 0;
  /** Chair yaw last frame, so air rotation can be fed to the spin scorer. */
  private lastYaw = 0;
  /** Where the wheels last left the floor, for gap detection on touchdown. */
  private takeoffPos = new THREE.Vector3();
  /** The goal zone the player was in last frame, so entries fire exactly once. */
  private currentZoneId = '';
  /** Floating pickups (S-T-O-N-K-S letters, the hidden file, cash) placed by GoalSystem. */
  private collectibles: {
    id: string;
    kind: 'letter' | 'hiddenItem' | 'cash';
    group: THREE.Group;
    position: THREE.Vector3;
    value: number;
    taken: boolean;
  }[] = [];
  private cumulativeSpinDegrees = 0;  // Track total spin during air time
  private airStartRotation = 0;  // Chair Y rotation when leaving ground
  private lastGroundedTime = 0;  // Coyote time tracking
  private lastPushSoundTime = 0;  // Cooldown for push sound
  
  // THPS-style surface tracking
  private surfaceNormal = new THREE.Vector3(0, 1, 0);  // Current surface we're on
  private surfaceAngle = 0;  // Angle of surface in degrees (0 = flat)
  /** Furthest gap under the wheels that still counts as touching down. */
  private readonly GROUND_CONTACT_GAP = 0.18;
  /** Once grounded, how far the floor may drop away before the wheels are considered off it. */
  private readonly GROUND_STICK_GAP = 0.6;
  /** Gap under the wheels beyond which we stop looking for a surface at all. */
  private readonly GROUND_SNAP_DISTANCE = 0.9;
  private readonly LAUNCH_ANGLE = 45;  // Surface angle that triggers launch

  // ---- THPS ground feel -------------------------------------------------------------
  /** Monotonic simulated seconds. The only clock gameplay is allowed to read. */
  private simTime = 0;
  /** Comfortable cruise the push alone will carry you to. */
  private readonly CRUISE_SPEED = 13.5;
  /** Hard ceiling; only ramps, grind pops and downhills get you here. */
  private readonly MAX_SPEED = 20;
  /** Push acceleration at a standstill, m/s^2. Eases off toward CRUISE_SPEED. */
  private readonly PUSH_ACCEL = 16;
  /** Rolling resistance while coasting, m/s^2. Deliberately tiny — coasting is the game. */
  private readonly ROLL_DRAG = 0.55;
  /** Extra drag proportional to speed, 1/s. Sets where a free coast settles. */
  private readonly ROLL_DRAG_K = 0.045;
  /** How fast velocity is redirected to the way the chair points, 1/s. Carving keeps speed. */
  private readonly GRIP_RATE = 9.0;
  /** Tallest obstacle the casters will roll up instead of stopping dead. */
  private readonly STEP_HEIGHT = 0.42;
  /** Seconds of being stopped-while-pushing before the chair is treated as pinned. */
  private readonly PIN_SECONDS = 0.25;
  private pinnedFor = 0;
  /** Speed the player has earned and is entitled to keep across a contact. */
  private carriedSpeed = 0;
  /** Sim time at which a landing banks its position, unless the player saves it first. */
  private pendingBankAt = 0;
  /** How long after touchdown a manual or revert may still rescue the combo, seconds. */
  private readonly LANDING_GRACE = 0.4;

  // Debug: animation cycling
  private debugAnimIndex = 0;
  private debugAnimLockUntil = 0;  // Timestamp when debug lock expires
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }
  
  /**
   * Progress callback for loading screen
   */
  private onProgress?: (percent: number, status: string) => void;
  
  async init(onProgress?: (percent: number, status: string) => void): Promise<void> {
    console.log('Game.init() starting...');
    this.onProgress = onProgress;
    
    const report = (percent: number, status: string) => {
      console.log(`[${percent}%] ${status}`);
      this.onProgress?.(percent, status);
    };
    
    try {
      report(0, 'Initializing renderer...');
      this.initRenderer();
      
      report(10, 'Setting up scene...');
      this.initScene();

      report(15, 'Building lighting & post FX...');
      this.initRenderPipeline();

      report(20, 'Loading physics engine...');
      // Initialize physics (async WASM load)
      this.physics = new PhysicsWorld();
      await this.physics.init();
      
      report(40, 'Configuring input...');
      this.initInput();
      
      report(45, 'Setting up grind system...');
      this.grindSystem = new GrindSystem();
      this.grindParticles = new GrindParticles(this.scene);
      this.landingParticles = new LandingParticles(this.scene);
      this.speedLines = new SpeedLines(this.camera);
      this.scene.add(this.speedLines.getMesh());
      
      report(50, 'Loading trick system...');
      this.initTricks();
      
      report(55, 'Building UI...');
      this.initUI();
      
      report(60, 'Loading player model...');
      await this.initPlayer();

      report(70, 'Wiring gameplay systems...');
      this.initGameplaySystems();

      report(75, 'Loading level assets...');
      await this.preloadLevelModels();
      
      report(80, 'Generating surface textures...');
      warmup(['officeCarpet', 'ceilingTile', 'cubicleFabric', 'deskLaminate', 'drywall', 'darkPlastic', 'brushedMetal', 'paper', 'cardboard']);

      report(85, 'Building environment...');
      this.initEnvironment();

      report(95, 'Initializing audio...');
      // Initialize procedural audio
      proceduralSounds.init();
      
      // Handle window resize
      window.addEventListener('resize', this.onResize.bind(this));
      
      // Debug: Press '[' and ']' to cycle through animations
      window.addEventListener('keydown', (e) => {
        if (e.key === '[' || e.key === ']') {
          this.debugCycleAnimation(e.key === ']' ? 1 : -1);
        }
      });
      
      report(100, 'Ready!');
      console.log('Game.init() complete!');
    } catch (error) {
      console.error('Error in Game.init():', error);
      throw error;
    }
  }
  
  private initRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
  }
  
  private initScene(): void {
    this.scene = new THREE.Scene();

    // Camera. near = 0.3 (not 0.1): GTAO's depth precision at far = 1000 is poor
    // otherwise, and nothing ever gets closer than 30 cm to the follow camera.
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.3,
      1000
    );
    this.camera.position.set(0, 5, -10);
    this.camera.lookAt(0, 0, 0);

    // Lighting, IBL, fog and background are owned entirely by EnvironmentRig
    // (see initRenderPipeline). There are deliberately no lights created here.

    // Camera controller
    this.cameraController = new CameraController(this.camera);
    this.cameraController.setupMouseControls(this.canvas);
  }

  /**
   * Build the modern render pipeline: procedural texture config, the environment
   * rig (IBL + key/fill/bounce + shadows + fog + sky) and the post FX chain
   * (GTAO -> bloom -> ACES grade -> SMAA).
   */
  private initRenderPipeline(): void {
    configureFromRenderer(this.renderer);

    this.envRig = new EnvironmentRig(this.scene, this.renderer);
    this.envRig.apply('officeInterior');

    this.postFX = new PostFX(this.renderer, this.scene, this.camera, 'high');
    this.postFX.setSize(window.innerWidth, window.innerHeight);
  }

  /** Level id -> environment preset. Anything unmapped falls back to cityDay. */
  private presetForLevel(levelId: string): EnvPreset {
    const map: Record<string, EnvPreset> = {
      ch1_office: 'officeInterior',
      story_1_office: 'officeInterior',
      ch1_garage: 'garageInterior',
      ch2_downtown: 'cityDay',
      story_2_stairwell: 'stairwell',
      story_3_lobby: 'lobby',
      story_4_highway: 'highwayNight',
      story_5_home: 'suburbEvening',
      story_6_forest: 'forestDay',
      story_7_trainyard: 'trainyardOvercast',
      story_8_rooftops: 'cityDusk',
      story_9_finale: 'rooftopSunset',
    };
    return map[levelId] ?? 'cityDay';
  }
  
  // Physics is now initialized in init() before other systems
  
  private initInput(): void {
    // InputManager is kept alive only for the debug animation cycler and the pause key;
    // every gameplay decision now reads THPSControls' ControlIntent instead.
    this.input = new InputManager();
    this.controls = new THPSControls();
    this.intent = this.controls.getIntent();
  }

  private initTricks(): void {
    this.trickDetector = new TrickDetector();

    // ---- the single score path -----------------------------------------------------------
    this.score = new ScoreSystem();
    this.score.on((event) => this.onScoreEvent(event));

    // ---- balance -------------------------------------------------------------------------
    this.balance = new BalanceSystem();
    this.balance.onBail((info) => {
      // A blown manual/grind/lip balance is a real bail: it forfeits the position.
      this.bail(info.mode === 'grind' || info.mode === 'lip' ? 'grind' : 'landing');
    });
    this.balance.onEnd((info) => {
      if (info.mode === 'manual' || info.mode === 'noseManual') {
        this.score.endManual();
        this.playerState.isManualing = false;
      }
    });
  }

  /**
   * The one place score events reach the rest of the game. The HUD is a display sink;
   * sounds, camera and goals hang off the same events so they can never disagree with
   * the number on screen.
   */
  private onScoreEvent(event: ScoreEvent): void {
    this.hud?.onScoreEvent(event);
    this.hud?.setScore(this.score.balance);

    switch (event.type) {
      case 'trick': {
        proceduralSounds.playTrick(event.trick.basePoints);
        // Only discrete tricks feed the special meter; a grind cannot fill it by existing.
        if (event.trick.kind !== 'special') {
          const prev = this.specialMeter;
          this.specialMeter = Math.min(1, this.specialMeter + event.points / 6000);
          this.hud?.setSpecial(this.specialMeter);
          this.controls?.setSpecialReady(this.specialMeter >= 1);
          if (prev < 1 && this.specialMeter >= 1) proceduralSounds.playSpecialReady();
        }
        this.goals?.notifyTrickAt(event.trick.id, this.zoneIdAtPlayer());
        break;
      }

      case 'land': {
        if (event.gained > 0) {
          proceduralSounds.playChaChing(event.gained);
          proceduralSounds.playComboLanded(event.multiplier);
          this.cameraController.impactZoomPulse(event.gained);
          this.goals?.notifyCombo(event.gained);
          if (this.chaseMechanic?.isChaseActive()) {
            this.chaseMechanic.addSpeedBoost(Math.min(5, event.gained / 2000));
          }
        }
        this.goals?.notifyScore(this.score.sessionScore);
        break;
      }

      case 'bail': {
        proceduralSounds.playBail();
        this.cameraController.shake(0.8, 0.4);
        break;
      }

      case 'tierReached':
        this.goals?.notifyScore(this.score.sessionScore);
        break;

      case 'balanceChanged':
        break;
    }
  }

  // =========================================================================
  // Tricks
  // =========================================================================

  /**
   * Direction -> trick, for each button. Nine directions cover most of the registry; the
   * remainder hang off the nollie modifier, so every one of the 35 registry entries is
   * reachable from the keyboard or the pad.
   *
   * Key is `${dir.x},${dir.y}` with y = +1 UP (nose) and x = +1 RIGHT.
   */
  private static readonly FLIP_TRICKS: Record<string, string> = {
    '0,0': 'kickflip',
    '-1,0': 'heelflip',
    '1,0': 'pop_shove',
    '0,-1': 'fs_shove',
    '0,1': 'impossible',
    '-1,-1': '360_flip',
    '-1,1': 'hardflip',
    '1,-1': 'varial_flip',
    '1,1': 'swivel_flip',
  };
  /** Nollie (UP held through the ollie charge) unlocks the two chair-specific flips. */
  private static readonly FLIP_TRICKS_NOLLIE: Record<string, string> = {
    '0,0': 'caster_kick',
    '0,1': 'armrest_spin',
  };

  private static readonly GRAB_TRICKS: Record<string, string> = {
    '0,0': 'indy',
    '-1,0': 'melon',
    '1,0': 'tailgrab',
    '0,1': 'nosegrab',
    '0,-1': 'benihana',
    '-1,1': 'madonna',
    '1,1': 'airwalk',
    '-1,-1': 'coffee_mug',
    '1,-1': 'keyboard_clutch',
  };
  private static readonly GRAB_TRICKS_NOLLIE: Record<string, string> = {
    '0,0': 'monitor_hug',
  };

  private static readonly SPECIAL_TRICKS: Record<string, string> = {
    '0,0': 'quarterly_report',
    '-1,0': 'golden_parachute',
    '1,0': 'hostile_takeover',
    '0,1': 'pink_slip',
    '0,-1': 'pink_slip',
  };

  private static dirKey(dir: { x: number; y: number }): string {
    return `${dir.x},${dir.y}`;
  }

  private static readonly SPECIAL_COST = 1;

  /** ScoreSystem's TrickKind for a registry entry. */
  private static kindOf(t: TrickDefinition): TrickKind {
    switch (t.type) {
      case 'grab': return 'grab';
      case 'grind': return 'grind';
      case 'manual': return 'manual';
      case 'special': return 'special';
      default: return 'flip';
    }
  }

  /**
   * Commit a discrete trick to the open position and start its animation.
   * Returns false when the trick was refused (nothing is on cooldown-locked here — the
   * one-trick-per-press rule is enforced by the EDGE fields on ControlIntent, which is what
   * killed the old held-button repeat exploit).
   */
  private performTrick(def: TrickDefinition, held: boolean): boolean {
    if (this.bailRecovery > 0) return false;

    const kind = Game.kindOf(def);
    this.score.addTrick({
      id: def.id,
      name: def.displayName,
      basePoints: def.basePoints,
      kind,
    });

    const duration = def.duration > 0 ? def.duration : 600;
    this.activeTrick = { id: def.id, kind, name: def.displayName, until: performance.now() + duration };
    this.trickAnimator?.playTrick(def.id, kind, duration / 1000);
    this.heldGrabId = held ? def.id : null;
    return true;
  }

  /**
   * Air-trick input. Every branch is EDGE driven: one press, one trick. Holding the button
   * does nothing on subsequent frames, which is the repeat exploit fixed at the source.
   */
  private updateTricks(): void {
    const intent = this.intent;

    // Releasing the grab button ends a held grab cleanly (no bail).
    if (this.heldGrabId && !intent.grabHeld) {
      this.heldGrabId = null;
      this.trickAnimator?.releaseTrick();
    }

    if (!this.playerState.isAirborne) return;
    if (this.bailRecovery > 0) return;

    const key = Game.dirKey(intent.dir);

    // SPECIAL: two buttons at once, gated behind a full meter, and it SPENDS the meter.
    if (intent.special) {
      if (this.specialMeter >= Game.SPECIAL_COST) {
        const id = Game.SPECIAL_TRICKS[key] ?? Game.SPECIAL_TRICKS['0,0'];
        const def = TrickRegistry.get(id);
        if (def && this.performTrick(def, false)) {
          this.specialMeter = 0;
          this.hud?.setSpecial(0);
          this.controls.setSpecialReady(false);
          this.playerState.hasSpecial = false;
          proceduralSounds.playSpecialReady();
          return;
        }
      }
    }

    if (intent.flipEdge) {
      const id = (intent.nollie ? Game.FLIP_TRICKS_NOLLIE[key] : undefined)
        ?? Game.FLIP_TRICKS[key] ?? 'kickflip';
      const def = TrickRegistry.get(id);
      if (def) this.performTrick(def, false);
      return;
    }

    if (intent.grabEdge) {
      const id = (intent.nollie ? Game.GRAB_TRICKS_NOLLIE[key] : undefined)
        ?? Game.GRAB_TRICKS[key] ?? 'indy';
      const def = TrickRegistry.get(id);
      if (def) this.performTrick(def, true);
    }
  }

  // =========================================================================
  // Land / bail — the only two ways a position closes
  // =========================================================================

  /** Bank the open position. Everything else about landing hangs off this. */
  private land(): void {
    if (!this.score.isOpen) return;
    this.score.land();
    this.goals?.notifyScore(this.score.sessionScore);
    this.hud?.setScore(this.score.balance);
  }

  /**
   * Forfeit the open position and take the loss. This is the ONLY bail entry point, so
   * every source — blown balance, bad landing, high-speed collision, being caught — is
   * scored identically and can never double-charge in the same instant.
   */
  private bail(reason: BailReason): void {
    const now = performance.now();
    if (now - this.lastBailTime < 400) return;
    this.lastBailTime = now;

    this.score.bail(reason);
    this.hud?.setScore(this.score.balance);

    this.balance.end();
    this.pendingBankAt = 0;
    this.playerState.isManualing = false;
    this.heldGrabId = null;
    this.activeTrick = null;
    this.trickAnimator?.releaseTrick();
    this.bailRecovery = 0.9;

    // A bail costs you the special, THPS-style.
    if (this.specialMeter > 0) {
      this.specialMeter = 0;
      this.playerState.hasSpecial = false;
      this.hud?.setSpecial(0);
      this.controls?.setSpecialReady(false);
    }

    if (this.grindSystem.isGrinding()) {
      this.grindSystem.forceEndGrind();
      this.playerState.isGrinding = false;
      this.grindTrick = null;
      proceduralSounds.stopGrindLoop();
      proceduralSounds.stopBalanceWarning();
      this.cameraController.setGrindCamera(false);
    }

    // Paper explodes out of the rider on a wipeout — cheap, readable, and it is the game's
    // own visual language for losing money.
    const pos = this.chair?.position;
    if (pos && this.paperStorm) this.paperStorm.burst(pos.clone().setY(pos.y + 0.6), 26, 6.5);

    this.postFX?.pulse(1.0);
  }

  // =========================================================================
  // Destructibles / paper / police event sinks
  // =========================================================================

  private onSmash(e: SmashEvent): void {
    // Score through the one path.
    this.score.addTrick({
      id: `smash_${e.kind}`,
      name: e.label,
      basePoints: Math.max(50, e.scoreValue),
      kind: 'flip',
    });
    this.goals?.notifySmash(e.id);

    // Paper is the signature debris; the other materials still throw a smaller puff.
    if (this.paperStorm) {
      const count = e.debrisKind === 'paper' ? 34 : e.debrisKind === 'cardboard' ? 18 : 8;
      const energy = Math.min(12, 3 + e.impulse * 0.05);
      this.paperStorm.burst(e.position.clone().setY(e.position.y + 0.4), count, energy, e.direction);
    }

    proceduralSounds.playTrick(e.scoreValue);
    this.cameraController.shake(Math.min(0.35, 0.06 + e.impulse * 0.002), 0.18);
  }

  private onSquadEvent(e: SquadEvent): void {
    switch (e.type) {
      case 'spotted':
        this.goals?.setPursuit(true);
        proceduralSounds.playBail();
        break;
      case 'lost':
        if (this.police && !this.police.inPursuit) this.goals?.setPursuit(false);
        break;
      case 'caught':
        this.onOfficerCaught?.();
        this.cameraController.shake(1.2, 0.5);
        // Being caught costs stonks AND kills the combo. One code path, same as any bail.
        this.bail('police');
        if (this.dialogueBox) {
          this.dialogueBox.show(['SEC OFFICER: Gotcha! ...wait, he\'s still going?!']);
        }
        if (this.lastCheckpointIndex >= 0 && this.checkpointPosition) this.restoreCheckpoint();
        break;
      default:
        break;
    }
  }

  /** Fire notifyZoneEntered() once per entry, so 'reach the exit' escape goals can settle. */
  private updateZones(): void {
    if (!this.goals) return;
    const id = this.zoneIdAtPlayer();
    if (id === this.currentZoneId) return;
    this.currentZoneId = id;
    if (id) this.goals.notifyZoneEntered(id);
  }

  /** Id of the goal zone the player is standing in, or '' — fed to trickAt goals. */
  private zoneIdAtPlayer(): string {
    if (!this.goals || !this.chair) return '';
    const p = this.chair.position;
    return this.goals.zoneAt(p.x, p.y, p.z)?.id ?? '';
  }

  /**
   * Destructibles, paper VFX, the police squad and the trick animator. Everything here
   * needs both the scene and the physics world, so it runs after initPlayer().
   */
  private initGameplaySystems(): void {
    // ---- destructible props ---------------------------------------------------------------
    this.destructibles = new DestructibleManager(this.scene, this.physics);
    // Impact maths has to know what is doing the hitting: the Rapier chair capsule.
    this.destructibles.setPlayerMass(80);
    this.destructibles.onSmash((e) => this.onSmash(e));

    // ---- flying paper ---------------------------------------------------------------------
    this.paperStorm = new PaperStorm(this.scene, { maxSheets: 320, groundY: 0 });

    // ---- police ---------------------------------------------------------------------------
    this.police = new PoliceSquad(this.scene, this.physics);
    this.police.on((e) => this.onSquadEvent(e));

    // ---- procedural rider animation -------------------------------------------------------
    this.attachTrickAnimator();
  }

  /**
   * Bind TrickAnimator to the rider rig. The rig is procedural (StonksCharacter), so binding
   * can legitimately fail; when it does we leave PlayerModel's own poses in charge rather than
   * shipping a T-posed rider.
   */
  private attachTrickAnimator(): void {
    if (!this.playerModel || !this.chairParts) return;
    try {
      const rig = this.playerModel.getRigRefs(this.chairParts.root);
      if (!rig) return;
      const animator = new TrickAnimator(rig);
      const bound = Object.keys(animator.getBoundBones()).length;
      if (bound < 8) {
        console.warn(`[Game] TrickAnimator bound only ${bound} joints; keeping PlayerModel poses.`);
        animator.dispose();
        return;
      }
      animator.setChairTier(1);
      this.trickAnimator = animator;
      this.playerModel.externalRootControl = true;
      console.log(`[Game] TrickAnimator attached (${bound} joints bound).`);
    } catch (err) {
      console.warn('[Game] TrickAnimator failed to attach; keeping PlayerModel poses.', err);
      this.trickAnimator = null;
    }
  }

  private initUI(): void {
    const overlay = document.getElementById('ui-overlay');
    if (overlay) {
      this.hud = new HUD(overlay);
      this.hud.setScore(this.score.balance);

      // Initialize story systems
      this.initStorySystems(overlay);
    }
  }
  
  /**
   * Initialize story-specific UI systems (dialogue, chase HUD)
   */
  private initStorySystems(overlay: HTMLElement): void {
    // Create dialogue box
    this.dialogueBox = new DialogueBox(overlay, {
      onComplete: () => {
        this.onDialogueEnd?.();
        this.isPaused = false;
      },
      onSkip: () => {
        this.onDialogueEnd?.();
        this.isPaused = false;
      }
    });
    
    // Create chase HUD
    this.chaseHUD = new ChaseHUD(overlay);
    
    // Create chase mechanic
    this.chaseMechanic = new ChaseMechanic({
      onCaught: () => {
        // Player caught - fail level
        console.log('Player caught by agents!');
        this.cameraController.shake(1.5, 0.6);
        // Restore from checkpoint if available
        if (this.lastCheckpointIndex >= 0 && this.checkpointPosition) {
          this.restoreCheckpoint();
        } else {
          // Fail the level
          this.endLevel(false);
        }
      },
      onWarningChange: (_level) => {
        this.onChaseStateChange?.(this.chaseMechanic.getState());
      },
      onSpeedBoost: (amount) => {
        // Visual feedback for speed boost
        this.speedLines.setIntensity(Math.min(1, amount / 5));
      }
    });
  }
  
  /**
   * Load upgrade effects from StoryProgress
   */
  private loadUpgradeEffects(): void {
    // Only apply upgrades for story levels
    if (this.currentStoryLevel || this.currentLevelId.startsWith('story_')) {
      this.speedMultiplier = storyProgress.getUpgradeEffect('speed');
      this.jumpMultiplier = storyProgress.getUpgradeEffect('jumpHeight');
      this.spinMultiplier = storyProgress.getUpgradeEffect('spinSpeed');
      this.grindBalanceDrift = storyProgress.getUpgradeEffect('grindBalance');
      this.manualBalanceDrift = storyProgress.getUpgradeEffect('manualBalance');
      
      console.log('Upgrade effects loaded:', {
        speed: this.speedMultiplier,
        jump: this.jumpMultiplier,
        spin: this.spinMultiplier,
        grindBalance: this.grindBalanceDrift,
        manualBalance: this.manualBalanceDrift
      });
    } else {
      // Reset to defaults for non-story levels
      this.speedMultiplier = 1.0;
      this.jumpMultiplier = 1.0;
      this.spinMultiplier = 1.0;
      this.grindBalanceDrift = 0.5;
      this.manualBalanceDrift = 0.5;
    }
  }
  
  /**
   * Show intro dialogue for story level
   */
  showIntroDialogue(lines: string[]): void {
    if (this.dialogueBox && lines.length > 0) {
      this.isPaused = true;
      this.onDialogueStart?.();
      this.dialogueBox.show(lines);
    }
  }
  
  /**
   * Show outro dialogue for story level
   */
  showOutroDialogue(lines: string[]): void {
    if (this.dialogueBox && lines.length > 0) {
      this.isPaused = true;
      this.onDialogueStart?.();
      this.dialogueBox.show(lines);
    }
  }
  
  /**
   * Check if player reached a checkpoint
   */
  private updateCheckpoints(): void {
    if (!this.currentStoryLevel || this.checkpoints.length === 0) return;
    
    const playerPos = this.chair.position;
    
    for (let i = this.lastCheckpointIndex + 1; i < this.checkpoints.length; i++) {
      const checkpoint = this.checkpoints[i];
      const cpPos = new THREE.Vector3(checkpoint.position[0], checkpoint.position[1], checkpoint.position[2]);
      const distance = playerPos.distanceTo(cpPos);
      
      // Trigger checkpoint when within 5 units
      if (distance < 5) {
        this.triggerCheckpoint(i, checkpoint);
        break;
      }
    }
  }
  
  /**
   * Trigger a checkpoint
   */
  private triggerCheckpoint(index: number, checkpoint: StoryCheckpoint): void {
    this.lastCheckpointIndex = index;
    this.checkpointPosition = this.chair.position.clone();
    this.checkpointRotation = this.chair.rotation.y;
    
    // Save to story progress
    storyProgress.setCheckpoint(this.currentLevelId, index);
    
    // Show checkpoint dialogue if present
    if (checkpoint.dialogue && checkpoint.dialogue.length > 0) {
      this.showOutroDialogue(checkpoint.dialogue);
    }
    
    // Notify callback
    this.onCheckpointReached?.(index, checkpoint.name);
    
    console.log(`Checkpoint reached: ${checkpoint.name}`);
  }
  
  /**
   * Restore player to last checkpoint
   */
  restoreCheckpoint(): void {
    if (this.checkpointPosition && this.chairBody) {
      this.physics.setPosition(this.chairBody, this.checkpointPosition);
      this.physics.setRotationY(this.chairBody, this.checkpointRotation);
      this.physics.setVelocity(this.chairBody, new THREE.Vector3(0, 0, 0));
      
      // Reset player state. A teleport is not a bail: the open position is dropped without
      // banking it and without charging for it.
      this.playerState.isGrounded = true;
      this.playerState.isAirborne = false;
      this.score.resetCombo();
      this.balance.reset();
      this.balanceState = null;
      this.activeTrick = null;
      this.heldGrabId = null;
      this.endGrind();
      
      // Restart chase if active
      if (this.currentStoryLevel?.hasChaseMechanic) {
        this.chaseMechanic.start(this.currentStoryLevel.chaseSpeed || 8, 50);
      }
    }
  }
  
  /**
   * End the current level
   */
  endLevel(success: boolean): void {
    if (success && this.currentStoryLevel?.outroDialogue) {
      this.showOutroDialogue(this.currentStoryLevel.outroDialogue);
    }

    // Stop chase
    this.chaseMechanic?.stop();
    this.chaseHUD?.hide();

    // Cash out anything still open so the run's last combo is not silently binned.
    if (this.score.isOpen) this.land();
    this.goals?.notifyFinish();

    const summary = this.score.getRunSummary();
    const goalSummary = this.goals?.summary ?? null;
    const completed = goalSummary?.completed ?? 0;
    const total = goalSummary?.total ?? 0;

    // ---- economy ------------------------------------------------------------------------
    // Both of these were dead code before: the upgrade shop had no income and the level
    // select had no completion record, so the whole economy was disconnected at both ends.
    const earned = Math.max(0, Math.round(summary.sessionEarned));
    if (earned > 0) storyProgress.addStonks(earned);
    if (success && this.currentLevelId) {
      storyProgress.completeLevel(
        this.currentLevelId,
        Math.round(summary.sessionScore),
        this.levelTime,
        earned,
        this.currentStoryLevel?.nextLevel
      );
    }

    // REAL completed/total, so the rank stops being permanently 'D' off a 0/0 = NaN.
    this.onLevelComplete?.(Math.round(summary.sessionScore), this.levelTime, completed, total);
  }
  
  private async initPlayer(): Promise<void> {
    // Create chair group
    this.chair = new THREE.Group();
    this.chair.position.set(0, 0, 5); // Start in the middle of the skate area
    this.scene.add(this.chair);

    // Visual lean group. The Rapier body is Y-locked (it can only yaw), so BalanceSystem's
    // pitch and roll have to be applied to a visual child rather than to the body.
    this.chairTilt = new THREE.Group();
    this.chairTilt.name = 'chairTilt';
    this.chair.add(this.chairTilt);
    
    // Procedural office chair (ChairModel). Replaces chair.glb, which shipped
    // metalness = 1.0 with no env map and rendered as a black lump. This one is
    // faceted low-poly built from MaterialLibrary surfaces and is authored in
    // real-world metres with its caster contact points at y = 0.
    try {
      const parts = buildOfficeChair({ tier: 1, seed: 4 });
      // Rapier chair capsule (halfHeight 0.3 + radius 0.4) centres the body 0.7
      // above the contact patch, so drop the chair root by that much.
      parts.root.position.y = -0.70;
      this.chairParts = parts;
      this.wheelMeshes = parts.casters;
      this.chairTilt.add(parts.root);
      console.log(`Procedural chair built (${parts.root.userData.triangles} tris, ${parts.casters.length} casters)`);
    } catch (error) {
      console.warn('Failed to build procedural chair, using primitives:', error);
      this.chairTilt.add(this.createChairMesh());
    }

    // Load GLB player model if enabled
    if (this.useGLBModel) {
      try {
        this.playerModel = new PlayerModel();
        const model = await this.playerModel.load();

        // The FBX ships Phong/Lambert materials with a hot specular lobe. Under
        // the physically-scaled EnvironmentRig (key at 3.6) they blow out to
        // white. Re-author them as PBR standard so they take the IBL properly.
        this.convertToPBR(model);

        // Position player centered on chair (handled by PlayerModel.update to prevent root motion drift)
        // Start in standing position (behind chair)
        this.playerModel.setLocalPosition(0, 0, -1.2);
        model.position.set(0, 0, -1.2);
        model.rotation.y = 0;
        
        // Start seated on the chair. Every reference frame is the guy riding
        // the chair; standing behind it left the model floating beside it.
        this.isMounted = true;
        this.animState = 'rolling';
        this.updatePlayerMountPosition();
        this.playerModel.play('rolling', { loop: true });
        
        this.chairTilt.add(model);

        console.log('Player rig attached to chair');
      } catch (error) {
        console.warn('Failed to load GLB model, using primitives:', error);
        this.useGLBModel = false;
      }
    }
    
    // Create physics body at same position
    this.chairBody = this.physics.createChairBody(new THREE.Vector3(0, 0, 5));
    
    // Set camera target
    this.cameraController.setTarget(this.chair);
  }
  
  /**
   * Re-author an imported model's materials as MeshStandardMaterial so they
   * receive scene.environment and behave under physically-scaled lighting.
   * Imported FBX/GLB assets here ship either a hot Phong specular or
   * metalness = 1.0, both of which look broken in a PBR pipeline.
   */
  private convertToPBR(root: THREE.Object3D): void {
    const seen = new Map<THREE.Material, THREE.MeshStandardMaterial>();

    root.traverse((child) => {
      const m = child as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;

      const convert = (src: THREE.Material): THREE.Material => {
        if (src instanceof THREE.MeshStandardMaterial) {
          // Already PBR: just make sure it isn't fully metallic with no albedo.
          if (src.metalness > 0.6) src.metalness = 0.05;
          return src;
        }
        const cached = seen.get(src);
        if (cached) return cached;

        const any = src as unknown as { map?: THREE.Texture; color?: THREE.Color; skinning?: boolean };
        const std = new THREE.MeshStandardMaterial({
          map: any.map ?? null,
          color: any.color ? any.color.clone() : new THREE.Color(0xffffff),
          roughness: 0.78,
          metalness: 0.0,
          side: src.side,
          transparent: src.transparent,
          opacity: src.opacity,
          alphaTest: src.alphaTest,
        });
        std.name = src.name;
        if (std.map) std.map.colorSpace = THREE.SRGBColorSpace;
        seen.set(src, std);
        return std;
      };

      m.material = Array.isArray(m.material) ? m.material.map(convert) : convert(m.material);
    });
  }

  private createChairMesh(): THREE.Group {
    const chair = new THREE.Group();
    
    // Materials
    const seatMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x1a1a2e,
      roughness: 0.8
    });
    const metalMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x444444,
      metalness: 0.7,
      roughness: 0.3
    });
    const wheelMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x222222,
      roughness: 0.9
    });
    
    // Seat
    const seatGeometry = new THREE.BoxGeometry(0.5, 0.08, 0.5);
    const seat = new THREE.Mesh(seatGeometry, seatMaterial);
    seat.position.y = 0.45;
    seat.castShadow = true;
    chair.add(seat);
    
    // Seat cushion (slightly raised)
    const cushionGeometry = new THREE.BoxGeometry(0.45, 0.06, 0.45);
    const cushionMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x2d2d44,
      roughness: 0.9
    });
    const cushion = new THREE.Mesh(cushionGeometry, cushionMaterial);
    cushion.position.y = 0.52;
    cushion.castShadow = true;
    chair.add(cushion);
    
    // Back rest
    const backGeometry = new THREE.BoxGeometry(0.48, 0.5, 0.06);
    const back = new THREE.Mesh(backGeometry, seatMaterial);
    back.position.set(0, 0.72, 0.25);
    back.rotation.x = -0.1;
    back.castShadow = true;
    chair.add(back);
    
    // Armrests
    const armrestGeometry = new THREE.BoxGeometry(0.06, 0.04, 0.25);
    const leftArm = new THREE.Mesh(armrestGeometry, metalMaterial);
    leftArm.position.set(-0.28, 0.58, 0.08);
    leftArm.castShadow = true;
    chair.add(leftArm);
    
    const rightArm = new THREE.Mesh(armrestGeometry, metalMaterial);
    rightArm.position.set(0.28, 0.58, 0.08);
    rightArm.castShadow = true;
    chair.add(rightArm);
    
    // Armrest supports
    const supportGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.12);
    const leftSupport = new THREE.Mesh(supportGeometry, metalMaterial);
    leftSupport.position.set(-0.28, 0.52, 0.08);
    chair.add(leftSupport);
    
    const rightSupport = new THREE.Mesh(supportGeometry, metalMaterial);
    rightSupport.position.set(0.28, 0.52, 0.08);
    chair.add(rightSupport);
    
    // Center pole
    const poleGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.32);
    const pole = new THREE.Mesh(poleGeometry, metalMaterial);
    pole.position.y = 0.26;
    chair.add(pole);
    
    // Base (star shape)
    const baseRadius = 0.28;
    const armCount = 5;
    for (let i = 0; i < armCount; i++) {
      const angle = (i / armCount) * Math.PI * 2;
      const armGeometry = new THREE.BoxGeometry(0.04, 0.03, baseRadius);
      const arm = new THREE.Mesh(armGeometry, metalMaterial);
      arm.position.set(
        Math.sin(angle) * baseRadius * 0.5,
        0.08,
        Math.cos(angle) * baseRadius * 0.5
      );
      arm.rotation.y = -angle;
      arm.castShadow = true;
      chair.add(arm);
      
      // Wheel at end of each arm
      const wheelGeometry = new THREE.SphereGeometry(0.04, 12, 8);
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.position.set(
        Math.sin(angle) * baseRadius,
        0.04,
        Math.cos(angle) * baseRadius
      );
      wheel.castShadow = true;
      chair.add(wheel);
      
      // Wheel housing
      const housingGeometry = new THREE.CylinderGeometry(0.025, 0.035, 0.05);
      const housing = new THREE.Mesh(housingGeometry, metalMaterial);
      housing.position.set(
        Math.sin(angle) * baseRadius,
        0.065,
        Math.cos(angle) * baseRadius
      );
      chair.add(housing);
    }
    
    // ========== PLAYER CHARACTER ==========
    // Office worker riding the chair like a scooter
    // Using hierarchical groups so limbs stay connected
    
    // Materials
    const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xffdbac, roughness: 0.8 });
    const shirtMaterial = new THREE.MeshStandardMaterial({ color: 0x4a6fa5, roughness: 0.7 });
    const pantsMaterial = new THREE.MeshStandardMaterial({ color: 0xc4a35a, roughness: 0.8 });
    const shoeMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 });
    const hairMaterial = new THREE.MeshStandardMaterial({ color: 0x3d2314, roughness: 0.9 });
    
    // Main player group
    const player = new THREE.Group();
    player.position.set(0, 0.55, 0); // On chair seat level
    
    // === TORSO (main body pivot) ===
    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, 0.4, 0);
    torsoGroup.rotation.x = 0.2; // Lean forward slightly
    
    const torsoGeo = new THREE.BoxGeometry(0.32, 0.4, 0.18);
    const torso = new THREE.Mesh(torsoGeo, shirtMaterial);
    torso.castShadow = true;
    torsoGroup.add(torso);
    
    // === HEAD (attached to torso) ===
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.28, 0);
    
    const headGeo = new THREE.SphereGeometry(0.11, 12, 10);
    const head = new THREE.Mesh(headGeo, skinMaterial);
    head.castShadow = true;
    headGroup.add(head);
    
    // Hair
    const hairGeo = new THREE.SphereGeometry(0.115, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const hair = new THREE.Mesh(hairGeo, hairMaterial);
    hair.position.y = 0.02;
    hair.castShadow = true;
    headGroup.add(hair);
    
    torsoGroup.add(headGroup);
    
    // === LEFT ARM (attached to torso) ===
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.18, 0.12, 0); // Shoulder position
    leftArmGroup.rotation.z = 0.4;
    leftArmGroup.rotation.x = 0.8;
    
    const upperArmGeo = new THREE.CapsuleGeometry(0.04, 0.18, 4, 8);
    const leftUpperArm = new THREE.Mesh(upperArmGeo, shirtMaterial);
    leftUpperArm.position.y = -0.12;
    leftUpperArm.castShadow = true;
    leftArmGroup.add(leftUpperArm);
    
    // Forearm (attached to upper arm)
    const forearmGroup = new THREE.Group();
    forearmGroup.position.set(0, -0.22, 0);
    forearmGroup.rotation.x = -1.0;
    
    const forearmGeo = new THREE.CapsuleGeometry(0.035, 0.16, 4, 8);
    const leftForearm = new THREE.Mesh(forearmGeo, skinMaterial);
    leftForearm.position.y = -0.1;
    leftForearm.castShadow = true;
    forearmGroup.add(leftForearm);
    
    // Hand
    const handGeo = new THREE.SphereGeometry(0.04, 8, 6);
    const leftHand = new THREE.Mesh(handGeo, skinMaterial);
    leftHand.position.y = -0.2;
    leftHand.castShadow = true;
    forearmGroup.add(leftHand);
    
    leftArmGroup.add(forearmGroup);
    torsoGroup.add(leftArmGroup);
    
    // === RIGHT ARM (mirror of left) ===
    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.18, 0.12, 0);
    rightArmGroup.rotation.z = -0.4;
    rightArmGroup.rotation.x = 0.8;
    
    const rightUpperArm = new THREE.Mesh(upperArmGeo, shirtMaterial);
    rightUpperArm.position.y = -0.12;
    rightUpperArm.castShadow = true;
    rightArmGroup.add(rightUpperArm);
    
    const rightForearmGroup = new THREE.Group();
    rightForearmGroup.position.set(0, -0.22, 0);
    rightForearmGroup.rotation.x = -1.0;
    
    const rightForearm = new THREE.Mesh(forearmGeo, skinMaterial);
    rightForearm.position.y = -0.1;
    rightForearm.castShadow = true;
    rightForearmGroup.add(rightForearm);
    
    const rightHand = new THREE.Mesh(handGeo, skinMaterial);
    rightHand.position.y = -0.2;
    rightHand.castShadow = true;
    rightForearmGroup.add(rightHand);
    
    rightArmGroup.add(rightForearmGroup);
    torsoGroup.add(rightArmGroup);
    
    player.add(torsoGroup);
    
    // === LEFT LEG (knee on chair - bent) ===
    const leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-0.08, 0.1, 0.1); // Hip position
    leftLegGroup.rotation.x = 1.4; // Thigh forward/horizontal
    
    const thighGeo = new THREE.CapsuleGeometry(0.055, 0.28, 4, 8);
    const leftThigh = new THREE.Mesh(thighGeo, pantsMaterial);
    leftThigh.position.y = -0.16;
    leftThigh.castShadow = true;
    leftLegGroup.add(leftThigh);
    
    // Lower leg (shin)
    const shinGroup = new THREE.Group();
    shinGroup.position.set(0, -0.32, 0);
    shinGroup.rotation.x = -1.8; // Bent back
    
    const shinGeo = new THREE.CapsuleGeometry(0.045, 0.26, 4, 8);
    const leftShin = new THREE.Mesh(shinGeo, pantsMaterial);
    leftShin.position.y = -0.15;
    leftShin.castShadow = true;
    shinGroup.add(leftShin);
    
    // Foot
    const footGeo = new THREE.BoxGeometry(0.07, 0.04, 0.14);
    const leftFoot = new THREE.Mesh(footGeo, shoeMaterial);
    leftFoot.position.set(0, -0.3, 0.03);
    leftFoot.castShadow = true;
    shinGroup.add(leftFoot);
    
    leftLegGroup.add(shinGroup);
    player.add(leftLegGroup);
    
    // === RIGHT LEG (pushing leg - extended back) ===
    const rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(0.08, 0.1, -0.05);
    rightLegGroup.rotation.x = -0.5; // Angled back
    
    const rightThigh = new THREE.Mesh(thighGeo, pantsMaterial);
    rightThigh.position.y = -0.16;
    rightThigh.castShadow = true;
    rightLegGroup.add(rightThigh);
    
    // Lower leg
    const rightShinGroup = new THREE.Group();
    rightShinGroup.position.set(0, -0.32, 0);
    rightShinGroup.rotation.x = 0.3; // Slightly bent
    
    const rightShin = new THREE.Mesh(shinGeo, pantsMaterial);
    rightShin.position.y = -0.15;
    rightShin.castShadow = true;
    rightShinGroup.add(rightShin);
    
    const rightFoot = new THREE.Mesh(footGeo, shoeMaterial);
    rightFoot.position.set(0, -0.3, 0.03);
    rightFoot.rotation.x = 0.3;
    rightFoot.castShadow = true;
    rightShinGroup.add(rightFoot);
    
    rightLegGroup.add(rightShinGroup);
    player.add(rightLegGroup);
    
    chair.add(player);
    
    return chair;
  }
  
  /**
   * Pre-load GLB models for level objects
   */
  private async preloadLevelModels(): Promise<void> {
    this.gltfLoader = new GLTFLoader();
    
    const modelPaths: Record<string, string> = {
      // 'cubicle': './models/cubicle.glb',  // Disabled: GLB renders as flat slab; use procedural mesh instead
      'quarter_pipe_small': './models/qtr-pipe-small.glb',
      'quarter_pipe_med': './models/qtr-pipe-med.glb',
      'quarter_pipe_large': './models/qtr-pipe-lg.glb',
    };
    
    for (const [key, path] of Object.entries(modelPaths)) {
      try {
        const gltf = await this.gltfLoader.loadAsync(path);
        const model = gltf.scene;
        
        // Enable shadows on all meshes
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        
        this.modelCache.set(key, model);
        console.log(`Loaded model: ${key}`);
      } catch (error) {
        console.warn(`Failed to load model ${key} from ${path}:`, error);
        // Model will use primitive fallback when not in cache
      }
    }
  }
  
  private initEnvironment(): void {
    const groundSize = 200;  // Much bigger ground

    // NOTE: no sky dome and no background are created here. EnvironmentRig owns
    // scene.background / scene.environment / scene.fog and draws its own sky for
    // exterior presets. Two competing sky domes used to fight over the horizon.

    // Placeholder ground for free-skate before any level is loaded. Every real
    // level replaces this in loadLevelObjects().
    const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
    groundGeometry.setAttribute('uv1', groundGeometry.getAttribute('uv').clone());
    const groundMaterial = MaterialLibrary.get('concreteFloor', { repeat: [groundSize / 3, groundSize / 3] });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.levelObjects.push(ground);  // Track for clearing

    // Add visible walls around the perimeter
    const wallHeight = 3;
    const wallMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x888888,
      roughness: 0.8
    });
    
    // Create walls (visual)
    const halfSize = groundSize / 2;
    const wallGeometry = new THREE.BoxGeometry(groundSize, wallHeight, 1);
    
    const northWall = new THREE.Mesh(wallGeometry, wallMaterial);
    northWall.position.set(0, wallHeight/2, halfSize);
    this.scene.add(northWall);
    this.levelObjects.push(northWall);  // Track for clearing
    
    const southWall = new THREE.Mesh(wallGeometry, wallMaterial);
    southWall.position.set(0, wallHeight/2, -halfSize);
    this.scene.add(southWall);
    this.levelObjects.push(southWall);  // Track for clearing
    
    const eastWallGeom = new THREE.BoxGeometry(1, wallHeight, groundSize);
    const eastWall = new THREE.Mesh(eastWallGeom, wallMaterial);
    eastWall.position.set(halfSize, wallHeight/2, 0);
    this.scene.add(eastWall);
    this.levelObjects.push(eastWall);  // Track for clearing
    
    const westWall = new THREE.Mesh(eastWallGeom, wallMaterial);
    westWall.position.set(-halfSize, wallHeight/2, 0);
    this.scene.add(westWall);
    this.levelObjects.push(westWall);  // Track for clearing
    
    // Add ground and walls to physics
    this.physics.createGround(halfSize);
    
    // Create skate park elements
    this.createRails();
    this.createRamps();
    this.createFunBoxes();
  }
  
  private createRails(): void {
    const railMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xcccccc,
      metalness: 0.8,
      roughness: 0.2
    });
    
    // Long center rail
    this.createRail(0, 10, 15, railMaterial);
    
    // Side rails
    this.createRail(-8, 5, 10, railMaterial);
    this.createRail(8, 5, 10, railMaterial);
    
    // Diagonal rails
    this.createRailAngled(-12, 20, 8, Math.PI / 6, railMaterial);
    this.createRailAngled(12, 20, 8, -Math.PI / 6, railMaterial);
    
    // Curved rail (series of short segments)
    const curveSegments = 8;
    for (let i = 0; i < curveSegments; i++) {
      const angle = (i / curveSegments) * Math.PI * 0.5;
      const nextAngle = ((i + 1) / curveSegments) * Math.PI * 0.5;
      const radius = 12;
      const x = -20 + Math.cos(angle) * radius;
      const z = -15 + Math.sin(angle) * radius;
      const rotation = (angle + nextAngle) / 2 + Math.PI / 2;
      this.createRailAngled(x, z, 2, rotation, railMaterial);
    }
  }
  
  private createRail(x: number, z: number, length: number, material: THREE.Material): void {
    const railGeometry = new THREE.BoxGeometry(length, 0.08, 0.08);
    const rail = new THREE.Mesh(railGeometry, material);
    rail.position.set(x, 0.8, z);
    rail.castShadow = true;
    this.scene.add(rail);
    this.levelObjects.push(rail);  // Track for clearing
    
    // Rail support posts
    const postGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.8);
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });
    
    for (let i = -1; i <= 1; i += 2) {
      const post = new THREE.Mesh(postGeometry, postMaterial);
      post.position.set(x + i * (length / 2 - 0.2), 0.4, z);
      post.castShadow = true;
      this.scene.add(post);
      this.levelObjects.push(post);  // Track for clearing
    }
    
    // NO physics collider for rails - grind system handles them
    // Player passes through unless grinding
    
    // Register with grind system (rail runs along X axis)
    const start = new THREE.Vector3(x - length / 2, 0.8, z);
    const end = new THREE.Vector3(x + length / 2, 0.8, z);
    this.grindSystem.addRail(start, end, `rail_${x}_${z}`, rail);
  }
  
  private createRailAngled(x: number, z: number, length: number, rotation: number, material: THREE.Material): void {
    const railGeometry = new THREE.BoxGeometry(length, 0.08, 0.08);
    const rail = new THREE.Mesh(railGeometry, material);
    rail.position.set(x, 0.8, z);
    rail.rotation.y = rotation;
    rail.castShadow = true;
    this.scene.add(rail);
    this.levelObjects.push(rail);  // Track for clearing
    
    // NO physics collider for rails - grind system handles them
    
    // Register with grind system (calculate rotated endpoints)
    const halfLen = length / 2;
    const dx = Math.cos(rotation) * halfLen;
    const dz = Math.sin(rotation) * halfLen;
    const start = new THREE.Vector3(x - dx, 0.8, z - dz);
    const end = new THREE.Vector3(x + dx, 0.8, z + dz);
    this.grindSystem.addRail(start, end, `rail_angled_${x}_${z}`, rail);
  }
  
  private createRamps(): void {
    const rampMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x8B4513,
      roughness: 0.7
    });
    
    // Launch ramps
    this.createRamp(-6, -8, Math.PI, rampMaterial);
    this.createRamp(6, -8, Math.PI, rampMaterial);
    
    // Quarter pipes at edges
    this.createQuarterPipe(-25, 0, Math.PI / 2);
    this.createQuarterPipe(25, 0, -Math.PI / 2);
    this.createQuarterPipe(0, -30, 0);
    this.createQuarterPipe(0, 30, Math.PI);
  }
  
  private createRamp(x: number, z: number, rotation: number, material: THREE.Material): void {
    const rampGroup = new THREE.Group();
    
    // Ramp surface
    const rampGeometry = new THREE.BoxGeometry(4, 0.15, 3);
    const ramp = new THREE.Mesh(rampGeometry, material);
    ramp.position.set(0, 0.6, 0);
    ramp.rotation.x = -Math.PI / 8;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    rampGroup.add(ramp);
    
    // Side walls
    const sideGeometry = new THREE.BoxGeometry(0.1, 0.8, 3.2);
    const leftSide = new THREE.Mesh(sideGeometry, material);
    leftSide.position.set(-2, 0.4, 0);
    leftSide.castShadow = true;
    rampGroup.add(leftSide);
    
    const rightSide = new THREE.Mesh(sideGeometry, material);
    rightSide.position.set(2, 0.4, 0);
    rightSide.castShadow = true;
    rampGroup.add(rightSide);
    
    rampGroup.position.set(x, 0, z);
    rampGroup.rotation.y = rotation;
    this.scene.add(rampGroup);
    this.levelObjects.push(rampGroup);  // Track for clearing
    
    // Physics - thicker collider with gentler angle for smoother riding
    const physPos = new THREE.Vector3(x, 0.5, z);
    this.physics.createStaticBox(
      physPos,
      new THREE.Vector3(2.2, 0.2, 1.8),
      new THREE.Euler(-Math.PI / 12, rotation, 0)  // Gentler angle (15 deg instead of 22.5)
    );
  }
  
  private createQuarterPipe(x: number, z: number, rotation: number): void {
    const material = new THREE.MeshStandardMaterial({ 
      color: 0x666666,
      roughness: 0.6,
      side: THREE.DoubleSide
    });
    
    // Curved surface using ExtrudeGeometry
    const shape = new THREE.Shape();
    const radius = 4;
    const segments = 16;
    
    shape.moveTo(0, 0);
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI / 2;
      shape.lineTo(
        radius - Math.cos(angle) * radius,
        Math.sin(angle) * radius
      );
    }
    shape.lineTo(radius, 0);
    shape.lineTo(0, 0);
    
    const extrudeSettings = {
      steps: 1,
      depth: 10,
      bevelEnabled: false
    };
    
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const quarterPipe = new THREE.Mesh(geometry, material);
    quarterPipe.position.set(x, 0, z);
    quarterPipe.rotation.y = rotation;
    quarterPipe.castShadow = true;
    quarterPipe.receiveShadow = true;
    this.scene.add(quarterPipe);
    this.levelObjects.push(quarterPipe);  // Track for clearing
    
    // Physics - simplified as angled ramp
    // Create a ramp collision at the base of the quarter pipe
    this.physics.createStaticBox(
      new THREE.Vector3(x, 1.5, z),
      new THREE.Vector3(5, 1.5, 5),
      new THREE.Euler(0, rotation, 0)
    );
  }
  
  private createFunBoxes(): void {
    const material = new THREE.MeshStandardMaterial({ 
      color: 0x4a4a4a,
      roughness: 0.8
    });
    
    // Center fun box
    const boxGeometry = new THREE.BoxGeometry(6, 0.8, 4);
    const funBox = new THREE.Mesh(boxGeometry, material);
    funBox.position.set(0, 0.4, -5);
    funBox.castShadow = true;
    funBox.receiveShadow = true;
    this.scene.add(funBox);
    this.levelObjects.push(funBox);  // Track for clearing
    
    // Rails on top
    const railMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xcccccc,
      metalness: 0.8,
      roughness: 0.2
    });
    
    const railGeometry = new THREE.BoxGeometry(6, 0.06, 0.06);
    const topRail1 = new THREE.Mesh(railGeometry, railMaterial);
    topRail1.position.set(0, 0.85, -5 - 1.5);
    this.scene.add(topRail1);
    this.levelObjects.push(topRail1);  // Track for clearing
    
    const topRail2 = new THREE.Mesh(railGeometry, railMaterial);
    topRail2.position.set(0, 0.85, -5 + 1.5);
    this.scene.add(topRail2);
    this.levelObjects.push(topRail2);  // Track for clearing
    
    // Physics - make collider slightly larger for better detection
    this.physics.createStaticBox(
      new THREE.Vector3(0, 0.5, -5),
      new THREE.Vector3(3.2, 0.5, 2.2)
    );
  }
  
  start(): void {
    this.isRunning = true;
    this.isPaused = false;
    this.lastTime = performance.now();
    this.levelTime = 0;
    // Start wheel roll sound (will be silent until moving)
    proceduralSounds.startWheelRoll();
    requestAnimationFrame(this.loop.bind(this));
  }
  
  pause(): void {
    this.isPaused = true;
    // Silence wheel roll when paused
    proceduralSounds.updateWheelRoll(0, false);
  }
  
  resume(): void {
    this.isPaused = false;
    this.lastTime = performance.now(); // Reset to avoid time jump
  }
  
  /**
   * Change player skin (hot-swap)
   */
  async changePlayerSkin(skin: import('../ui/GameStateManager').PlayerSkin): Promise<void> {
    if (!this.playerModel) return;
    
    console.log(`Changing player skin to: ${skin}`);
    await this.playerModel.changeSkin(skin);
    
    // Reset animation state
    this.animState = 'standing';
    this.isMounted = false;
    this.updatePlayerMountPosition();
  }
  
  /**
   * Load a level by ID
   */
  loadLevel(levelId: string): void {
    console.log(`Loading level: ${levelId}`);
    
    // Check if it's a story level first
    const storyLevel = getStoryLevelById(levelId);
    if (storyLevel) {
      this.loadStoryLevel(storyLevel);
      return;
    }
    
    // Get level data from built-in levels
    const levelData = getLevelById(levelId);
    if (!levelData) {
      console.error(`Level not found: ${levelId}`);
      return;
    }
    
    // Use the full level loading logic
    this.loadCustomLevel(levelData);
  }
  
  /**
   * Load a story level with all story features
   */
  loadStoryLevel(level: StoryLevelData): void {
    console.log(`Loading story level: ${level.name}`);
    
    // Store story level reference
    this.currentStoryLevel = level;
    this.checkpoints = level.checkpoints || [];
    this.lastCheckpointIndex = -1;
    this.checkpointPosition = null;
    
    // Check for saved checkpoint progress
    const savedCheckpoint = storyProgress.getCheckpoint(level.id);
    if (savedCheckpoint >= 0 && savedCheckpoint < this.checkpoints.length) {
      const cp = this.checkpoints[savedCheckpoint];
      this.lastCheckpointIndex = savedCheckpoint;
      this.checkpointPosition = new THREE.Vector3(cp.position[0], cp.position[1], cp.position[2]);
      this.checkpointRotation = cp.rotation * Math.PI / 180;
    }
    
    // Load upgrade effects from story progress
    this.loadUpgradeEffects();
    
    // Load the level geometry
    this.loadCustomLevel(level);
    
    // If we have a saved checkpoint, spawn there instead
    if (this.checkpointPosition && this.chairBody) {
      this.physics.setPosition(this.chairBody, this.checkpointPosition);
      this.physics.setRotationY(this.chairBody, this.checkpointRotation);
    }
    
    // Initialize chase mechanic for chase levels
    if (level.hasChaseMechanic && this.chaseMechanic) {
      this.chaseMechanic.start(level.chaseSpeed || 8, 50);
      this.chaseHUD?.show();
    } else {
      this.chaseMechanic?.stop();
      this.chaseHUD?.hide();
    }
    
    
    // Show intro dialogue after a short delay
    if (level.introDialogue && level.introDialogue.length > 0) {
      setTimeout(() => {
        this.showIntroDialogue(level.introDialogue || []);
      }, 500);
    }
    
    // Set current level in story progress
    storyProgress.setCurrentLevel(level.id);
  }
  
  getCurrentLevelId(): string {
    return this.currentLevelId;
  }
  
  /**
   * Load a custom level (from the editor)
   */
  loadCustomLevel(level: LevelData): void {
    console.log(`Loading custom level: ${level.name}`);
    this.currentLevelId = level.id;
    this.levelTime = 0;
    
    // Reset player state
    this.specialMeter = 0;
    this.spinRotation = 0;
    this.activeTrick = null;
    this.heldGrabId = null;
    this.grindTrick = null;
    this.bailRecovery = 0;
    this.lastBailTime = -Infinity;
    this.prevSpeed = 0;
    this.carriedSpeed = 0;
    this.pinnedFor = 0;
    this.pendingBankAt = 0;
    this.playerState = {
      isGrounded: true,
      isAirborne: false,
      isGrinding: false,
      isManualing: false,
      hasSpecial: false,
      airTime: 0
    };

    // Start the level already seated on the chair.
    this.isMounted = true;
    this.animState = 'rolling';
    this.updatePlayerMountPosition();
    if (this.playerModel) {
      this.playerModel.play('rolling', { loop: true });
    }

    // ---- score / balance -----------------------------------------------------------------
    // startRun() clears the combo, run stats and tiers but KEEPS the banked balance, which is
    // then re-seeded from the save so the wallet is continuous across levels.
    this.score.startRun();
    this.score.setBalance(storyProgress.getStonks(), 'Level load');
    this.balance.reset();
    this.balanceState = null;
    if (this.chairTilt) this.chairTilt.rotation.set(0, 0, 0);

    // ---- goals ---------------------------------------------------------------------------
    const goalSet = defaultGoalSetFor(level.id);
    this.goals = new GoalTracker(goalSet);
    this.goals.on((goal) => this.onGoalComplete(goal));
    this.currentZoneId = '';
    this.score.setScoreTargets({
      high: goalSet.highScore,
      pro: goalSet.proScore,
      sick: goalSet.sickScore,
    });

    // Clear existing level objects
    this.clearLevelObjects();
    
    // Environment: IBL, key/fill/bounce lights, shadow frustum, fog, background
    // and exposure all come from the preset. The old per-level sky/fog/ambient
    // fields in LevelData are intentionally no longer read.
    this.envRig.apply(this.presetForLevel(level.id));

    // Load level objects
    this.loadLevelObjects(level.objects, level.groundSize, level.groundColor || '#555555');
    
    // Set player spawn
    const spawn = level.spawnPoint;
    const spawnPos = new THREE.Vector3(spawn.position[0], spawn.position[1], spawn.position[2]);
    if (this.chairBody) {
      this.physics.setPosition(this.chairBody, spawnPos);
      this.physics.setVelocity(this.chairBody, new THREE.Vector3(0, 0, 0));
      this.physics.setRotationY(this.chairBody, spawn.rotation * Math.PI / 180);
    }
    this.chair.position.copy(spawnPos);
    this.lastYaw = spawn.rotation * Math.PI / 180;

    // Knockable props, litter and the police squad all key off the REAL spawn point.
    this.spawnDestructibles(level, spawnPos);
    this.spawnLitter(level, spawnPos);
    this.spawnPolice(spawnPos);
    this.spawnCollectibles();

    // Reset HUD
    this.hud?.reset();
    this.hud?.setScore(this.score.balance);
    this.hud?.setGoals(this.goals ? this.goals.progress : []);
    this.goalHudTimer = 0;
  }

  /**
   * Fill the level with knockable props. GoalSystem's smash targets are spawned FIRST and with
   * their authored ids, so `notifySmash(id)` from a real collision settles a real goal.
   */
  private spawnDestructibles(level: LevelData, spawnPos: THREE.Vector3): void {
    if (!this.destructibles) return;
    this.destructibles.reset();

    const defs: DestructibleDef[] = [];
    const groundY = 0;

    // 1. Goal-authored smash targets, at their authored positions and ids.
    const targets = this.goals?.smashTargets ?? [];
    const KIND_FOR_LABEL: [RegExp, DestructibleDef['kind']][] = [
      [/cooler/i, 'waterCooler'],
      [/printer|copier|fax/i, 'printer'],
      [/cabinet|filing/i, 'filingCabinet'],
      [/monitor|screen/i, 'monitor'],
      [/plant|ficus/i, 'pottedPlant'],
      [/box|carton/i, 'cardboardBox'],
      [/mug|coffee/i, 'mug'],
      [/bin|trash|waste/i, 'trashCan'],
      [/chair/i, 'chairEmpty'],
      [/cone/i, 'coneStack'],
    ];
    for (const t of targets) {
      let kind: DestructibleDef['kind'] = 'printer';
      for (const [re, k] of KIND_FOR_LABEL) {
        if (re.test(t.label)) { kind = k; break; }
      }
      defs.push({
        kind,
        id: t.id,
        position: new THREE.Vector3(t.position[0], groundY, t.position[2]),
        rotationY: 0,
      });
    }

    // 2. Set dressing. Scattered across the playfield, seeded off the level id so a reload
    //    puts every prop back exactly where it was.
    const half = Math.max(24, (level.groundSize ?? 60) * 0.42);
    const seed = hashString(level.id);
    defs.push(...scatterDestructibles(
      new THREE.Vector3(spawnPos.x, groundY, spawnPos.z),
      half * 2, half * 2,
      this.currentLevelId === 'ch1_office' ? 30 : 20,
      seed,
    ));

    this.destructibles.spawnMany(defs);
  }

  /** Floor litter around the spawn and along the play area; it swirls in the player's wake. */
  private spawnLitter(level: LevelData, spawnPos: THREE.Vector3): void {
    if (!this.paperStorm) return;
    this.paperStorm.reset();
    this.paperStorm.setGroundLevel(0);
    const radius = Math.min(30, Math.max(14, (level.groundSize ?? 60) * 0.25));
    this.paperStorm.addFloorLitter(new THREE.Vector3(spawnPos.x, 0, spawnPos.z), radius, 110);
  }

  /**
   * Put the squad where the player actually is. The old officers were hard-coded around the
   * origin, which on a level that spawns you at (-120, -140) meant they were 150+ units away
   * and the player never saw a single one.
   */
  private spawnPolice(spawnPos: THREE.Vector3): void {
    if (!this.police) return;
    this.police.reset();

    // Ring of patrol posts around the spawn, far enough that you are not caught on frame 1.
    // 26 put the ring OUTSIDE the office shell (the floorplate is 46 m, so ±23 m), which left
    // four officers patrolling the void beyond the walls where the player could never meet them.
    const RING = 17;
    const posts = 4;
    for (let i = 0; i < posts; i++) {
      const a = (i / posts) * Math.PI * 2 + 0.4;
      const p = new THREE.Vector3(
        spawnPos.x + Math.cos(a) * RING,
        0,
        spawnPos.z + Math.sin(a) * RING,
      );
      // Each officer walks a chord across the spawn area, so their cones sweep the playfield.
      const b = a + Math.PI * 0.5;
      this.police.spawn({
        position: p,
        patrolPoints: [
          p.clone(),
          new THREE.Vector3(spawnPos.x + Math.cos(b) * RING, 0, spawnPos.z + Math.sin(b) * RING),
        ],
      });
    }
    this.hud?.setWanted(0);
  }

  /**
   * Build the floating pickups GoalSystem authored for this level: the six S-T-O-N-K-S
   * letters and the hidden file. Without these the collect goals are literally impossible,
   * which is why the checklist could never be finished before.
   */
  private spawnCollectibles(): void {
    this.clearCollectibles();
    if (!this.goals) return;

    const letterMat = new THREE.MeshStandardMaterial({
      color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 1.6,
      roughness: 0.35, metalness: 0.0,
    });
    const itemMat = new THREE.MeshStandardMaterial({
      color: 0xffd700, emissive: 0xffb000, emissiveIntensity: 1.4,
      roughness: 0.3, metalness: 0.1,
    });

    const make = (
      id: string, kind: 'letter' | 'hiddenItem' | 'cash',
      p: [number, number, number], mat: THREE.Material, value: number,
    ) => {
      const group = new THREE.Group();
      // One mesh, one draw call. A faceted ring reads at gameplay distance far better than a
      // solid blob, and the pickups are numerous enough that a second mesh each would matter.
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.11, 5, 10), mat);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      group.position.set(p[0], p[1] + 1.1, p[2]);
      this.scene.add(group);
      this.levelObjects.push(group);
      this.collectibles.push({
        id, kind, group,
        position: group.position.clone(),
        value, taken: false,
      });
    };

    for (const l of this.goals.letterPlacements) {
      make(l.id, 'letter', l.position, letterMat, 250);
    }
    for (const pk of this.goals.pickupPlacements) {
      make(pk.id, 'hiddenItem', pk.position, itemMat, pk.value ?? 1000);
    }
  }

  private clearCollectibles(): void {
    for (const c of this.collectibles) {
      this.scene.remove(c.group);
      c.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
    }
    this.collectibles = [];
  }

  /** Spin the pickups and test them against the player. */
  private updateCollectibles(dt: number): void {
    if (this.collectibles.length === 0) return;
    const p = this.chair.position;

    for (const c of this.collectibles) {
      if (c.taken) continue;
      c.group.rotation.y += dt * 2.2;
      c.group.position.y = c.position.y + Math.sin(performance.now() * 0.003 + c.position.x) * 0.12;

      const dx = p.x - c.position.x;
      const dy = p.y - c.position.y;
      const dz = p.z - c.position.z;
      if (dx * dx + dy * dy + dz * dz > 2.6 * 2.6) continue;

      c.taken = true;
      c.group.visible = false;
      this.goals?.notifyCollect(c.kind, c.id);
      // Pickups pay out through the one score path, exactly like every other award.
      this.score.addStonks(c.value, c.kind === 'letter' ? 'Letter' : 'Hidden file');
      proceduralSounds.playChaChing(c.value);
      this.paperStorm?.burst(c.position.clone(), 10, 4.5);
    }
  }

  /** A goal just completed: pay it, announce it, refresh the checklist. */
  private onGoalComplete(goal: GoalProgress): void {
    this.hud?.showGoalComplete(goal);
    proceduralSounds.playSpecialReady();
    if (this.goals) this.hud?.setGoals(this.goals.progress);
  }
  
  /**
   * Clear all level-specific objects
   */
  private clearLevelObjects(): void {
    // Remove all tracked level objects from scene
    for (const obj of this.levelObjects) {
      this.scene.remove(obj);
    }
    this.levelObjects = [];

    this.clearCollectibles();

    // The office floorplate owns real geometry; free it rather than leaking it.
    if (this.officeInterior) {
      this.scene.remove(this.officeInterior.root);
      disposeOfficeInterior(this.officeInterior);
      this.officeInterior = null;
    }

    // Clear grind system rails
    this.grindSystem.clearRails();
    
    // Clear physics colliders from previous level. Anything holding a Rapier body must be
    // cleared FIRST or it is left pointing at a freed body.
    this.destructibles?.reset();
    this.police?.reset();
    this.paperStorm?.reset();
    this.physics.clearStaticBodies();
  }
  
  /**
   * PoliceSquad is now the ONE pursuit system. The old NPCOfficer squad (four GLB officers
   * hard-coded around the origin) and ChaseMechanic's three decorative capsule blobs have both
   * been removed from the loop: they were three overlapping "chase" systems, none of which
   * shared a perception model, a catch rule or a score consequence.
   */

  /**
   * Load objects from level data with instancing optimization
   */
  private loadLevelObjects(objects: LevelObject[], groundSize: number, groundColor: string = '#555555'): void {
    // Enclosed office levels build a full interior shell (carpet, walls, suspended
    // ceiling, cubicle farm) instead of a bare ground quad under open sky.
    if (this.currentLevelId === 'ch1_office') {
      this.buildOfficeFloorplate();
    } else {
      this.createLevelGround(groundSize, groundColor);
    }

    // Types that can be instanced (decorative objects with simple/no physics)
    const instanceableTypes = new Set([
      'shrub_small', 'shrub_medium', 'shrub_large', 
      'tree_small', 'cone', 'trash_can', 'planter'
    ]);
    
    // Group objects by type for instancing
    const instanceGroups = new Map<string, LevelObject[]>();
    const regularObjects: LevelObject[] = [];
    
    for (const objData of objects) {
      if (instanceableTypes.has(objData.type)) {
        if (!instanceGroups.has(objData.type)) {
          instanceGroups.set(objData.type, []);
        }
        instanceGroups.get(objData.type)!.push(objData);
      } else {
        regularObjects.push(objData);
      }
    }
    
    // Create instanced meshes for grouped objects
    for (const [type, group] of instanceGroups) {
      if (group.length > 0) {
        this.createInstancedObjects(type, group);
      }
    }
    
    // Create regular objects individually
    for (const objData of regularObjects) {
      const mesh = this.createLevelObject(objData);
      if (mesh) {
        this.scene.add(mesh);
        this.levelObjects.push(mesh);
      }
    }
  }
  
  /**
   * Create instanced mesh for multiple objects of the same type
   */
  private createInstancedObjects(type: string, objects: LevelObject[]): void {
    // Get template geometry and material
    const template = this.getInstanceTemplate(type);
    if (!template) return;
    
    const { geometry, material } = template;
    
    // Create instanced mesh
    const instancedMesh = new THREE.InstancedMesh(geometry, material, objects.length);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;
    
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Euler();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    
    objects.forEach((objData, i) => {
      position.set(objData.position[0], objData.position[1] || 0, objData.position[2]);
      
      if (objData.rotation) {
        rotation.set(
          THREE.MathUtils.degToRad(objData.rotation[0] || 0),
          THREE.MathUtils.degToRad(objData.rotation[1] || 0),
          THREE.MathUtils.degToRad(objData.rotation[2] || 0)
        );
        quaternion.setFromEuler(rotation);
      } else {
        quaternion.identity();
      }
      
      matrix.compose(position, quaternion, scale);
      instancedMesh.setMatrixAt(i, matrix);
      
      // Still create physics colliders for each instance
      this.createInstancePhysics(type, objData);
    });
    
    instancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(instancedMesh);
    this.levelObjects.push(instancedMesh);
  }
  
  /**
   * Get template geometry and material for instanced objects
   */
  private getInstanceTemplate(type: string): { geometry: THREE.BufferGeometry; material: THREE.Material } | null {
    switch (type) {
      case 'shrub_small': {
        const geo = new THREE.SphereGeometry(0.5, 8, 6);
        const mat = new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.9 });
        return { geometry: geo, material: mat };
      }
      case 'shrub_medium': {
        const geo = new THREE.SphereGeometry(0.8, 8, 6);
        const mat = new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.9 });
        return { geometry: geo, material: mat };
      }
      case 'shrub_large': {
        const geo = new THREE.SphereGeometry(1.2, 8, 6);
        const mat = new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.9 });
        return { geometry: geo, material: mat };
      }
      case 'tree_small': {
        // Tree foliage cone - no trunk visual (physics will match this)
        const leavesGeo = new THREE.ConeGeometry(1.5, 3, 8);
        leavesGeo.translate(0, 3.5, 0); // Foliage centered at y=3.5
        const mat = new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.9 });
        return { geometry: leavesGeo, material: mat };
      }
      case 'cone': {
        const geo = new THREE.ConeGeometry(0.3, 0.7, 8);
        geo.translate(0, 0.35, 0);
        const mat = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.8 });
        return { geometry: geo, material: mat };
      }
      case 'trash_can': {
        const geo = new THREE.CylinderGeometry(0.3, 0.25, 0.8, 8);
        geo.translate(0, 0.4, 0);
        const mat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.6, metalness: 0.4 });
        return { geometry: geo, material: mat };
      }
      case 'planter': {
        const geo = new THREE.BoxGeometry(1.5, 1.2, 1.5);
        geo.translate(0, 0.6, 0);
        const mat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.9 });
        return { geometry: geo, material: mat };
      }
      default:
        return null;
    }
  }
  
  /**
   * Create physics collider for an instanced object
   */
  private createInstancePhysics(type: string, data: LevelObject): void {
    const pos = new THREE.Vector3(data.position[0], 0, data.position[2]);
    
    switch (type) {
      case 'shrub_small':
        this.physics.createStaticBox(pos.clone().setY(0.3), new THREE.Vector3(0.25, 0.3, 0.25));
        break;
      case 'shrub_medium':
        this.physics.createStaticBox(pos.clone().setY(0.5), new THREE.Vector3(0.4, 0.5, 0.4));
        break;
      case 'shrub_large':
        this.physics.createStaticBox(pos.clone().setY(0.75), new THREE.Vector3(0.6, 0.75, 0.6));
        break;
      case 'tree_small':
        // Physics matches visible foliage cone (centered at y=3.5, height 3, radius ~1.5)
        // Using a box that approximates the lower portion of the cone
        this.physics.createStaticBox(pos.clone().setY(2.5), new THREE.Vector3(1.0, 0.5, 1.0));
        break;
      case 'cone':
        this.physics.createStaticBox(pos.clone().setY(0.25), new THREE.Vector3(0.15, 0.25, 0.15));
        break;
      case 'trash_can':
        this.physics.createStaticBox(pos.clone().setY(0.4), new THREE.Vector3(0.2, 0.4, 0.2));
        break;
      case 'planter':
        this.physics.createStaticBox(pos.clone().setY(0.75), new THREE.Vector3(0.75, 0.75, 0.75));
        break;
    }
  }
  
  /**
   * Build the enclosed open-plan office: carpet, four walls, a suspended ceiling
   * with recessed troffers, and a cubicle farm around a cross-shaped skate runway.
   * Static geometry is merged per material by OfficeLevel, so this is ~30 draw calls.
   */
  private buildOfficeFloorplate(): void {
    const interior = buildOfficeInterior({
      width: 50,
      depth: 50,
      height: 3.1,
      seed: 20260730,
      lightBudget: 8,
      // The level data owns the main aisle props; keep pods and aisle clutter
      // out of the stair landing and the conference-table fun box.
      keepClear: [
        { minX: -5.0, maxX: 5.0, minZ: 16.5, maxZ: 23.5 },
        { minX: -5.0, maxX: 5.0, minZ: -21.5, maxZ: -14.5 },
      ],
    });

    this.scene.add(interior.root);
    this.officeInterior = interior;

    for (const c of interior.colliders) {
      this.physics.createStaticBox(
        c.position,
        c.halfExtents,
        c.rotationY ? new THREE.Euler(0, c.rotationY, 0) : undefined
      );
    }

    let railId = 0;
    for (const r of interior.rails) {
      this.grindSystem.addRail(r.start, r.end, `cube_${railId++}`);
    }

    // Floor collider + out-of-bounds walls.
    this.physics.createGround(interior.size.width / 2);

    console.log(
      `[OfficeLevel] ${interior.triangles} tris, ${interior.colliders.length} colliders, ` +
      `${interior.rails.length} grind edges, ${interior.lights.length} point lights`
    );
  }

  /**
   * Create ground plane for a level
   */
  private createLevelGround(size: number, groundColor: string = '#555555'): void {
    const groundGeometry = new THREE.PlaneGeometry(size, size);
    groundGeometry.setAttribute('uv1', groundGeometry.getAttribute('uv').clone());

    // Textured PBR ground. The level's groundColor is now a tint over real
    // asphalt (albedo/normal/roughness/AO) instead of a flat untextured colour,
    // which is what made every non-office level read as a grey void.
    // concreteFloor, not asphalt: the asphalt map is authored near-black, and
    // `color` is a multiplicative tint (it can only darken further), so an
    // asphalt ground reads as a void. Normalise the level's hex to a fixed
    // brightness and let it tint a mid-value concrete instead.
    const tint = new THREE.Color(groundColor);
    const level = Math.max(0.06, (tint.r + tint.g + tint.b) / 3);
    tint.multiplyScalar(Math.min(1 / Math.max(tint.r, tint.g, tint.b, 0.001), 0.78 / level));
    const groundMaterial = MaterialLibrary.get('concreteFloor', {
      repeat: [size / 5, size / 5],
      color: tint.getHex(),
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.levelObjects.push(ground);
    
    // Add physics ground
    this.physics.createGround(size / 2);
  }
  
  /**
   * Create a single level object from data
   */
  private createLevelObject(data: LevelObject): THREE.Object3D | null {
    let mesh: THREE.Object3D | null = null;
    
    // Shared, cached PBR materials. These used to be five fresh
    // MeshStandardMaterials allocated per object (131 meshes -> 69 materials).
    const railMaterial = MaterialLibrary.get('grindMetal');
    // Ramps in this game are improvised from office furniture, so desk laminate
    // rather than skatepark plywood (which read as garish orange planks).
    const woodMaterial = MaterialLibrary.get('deskLaminate', { repeat: [1.1, 1.1], color: 0xa8adb4 });
    const concreteMaterial = MaterialLibrary.get('concreteFloor', { repeat: [3, 3] });
    const metalMaterial = MaterialLibrary.get('brushedMetal');
    const officeMaterial = MaterialLibrary.get('cubicleFabric', { repeat: [3, 2] });

    switch (data.type) {
      case 'rail':
      case 'rail_angled':
      case 'rail_curved': {
        const length = (data.params?.length as number) || 10;
        mesh = this.createRailMesh(length);
        // Register with grind system
        const rot = data.rotation?.[1] || 0;
        const radRot = rot * Math.PI / 180;
        const halfLen = length / 2;
        const dx = Math.cos(radRot) * halfLen;
        const dz = Math.sin(radRot) * halfLen;
        const start = new THREE.Vector3(data.position[0] - dx, 0.8, data.position[2] - dz);
        const end = new THREE.Vector3(data.position[0] + dx, 0.8, data.position[2] + dz);
        this.grindSystem.addRail(start, end, `rail_${data.position[0]}_${data.position[2]}`, mesh);
        break;
      }
      
      case 'ramp': {
        mesh = this.createRampMesh();
        // Collider is a thin slab lying on the slope, matching the wedge mesh.
        const rampRot = (data.rotation?.[1] || 0) * Math.PI / 180;
        const slope = Math.atan2(Game.RAMP_H, Game.RAMP_D);
        const cx = Math.sin(rampRot) * 0;
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0] + cx, Game.RAMP_H / 2, data.position[2]),
          new THREE.Vector3(Game.RAMP_W / 2, 0.09, Math.hypot(Game.RAMP_D, Game.RAMP_H) / 2),
          // 'YXZ': yaw FIRST, then pitch about the ramp's own X. The default 'XYZ' order
          // composes Rx*Ry, which tilts the collider out of the slope for any yaw other
          // than 0 — it only went unnoticed while every ramp in the game faced the same way.
          new THREE.Euler(-slope, rampRot, 0, 'YXZ')
        );
        // The coping lip along the top of the kicker is a grind edge (makeKickerRamp
        // publishes it in userData.grindEdges). Register it so a kicker can be ledged as
        // well as launched off — that is what turns two ramps into a line.
        for (const e of ((mesh.userData.grindEdges as { start: number[]; end: number[] }[]) ?? [])) {
          const c = Math.cos(rampRot);
          const s = Math.sin(rampRot);
          const map = (p: number[]) => new THREE.Vector3(
            data.position[0] + p[0] * c + p[2] * s,
            p[1],
            data.position[2] - p[0] * s + p[2] * c
          );
          this.grindSystem.addRail(map(e.start), map(e.end), `ramp_${data.position[0]}_${data.position[2]}`, mesh);
        }
        break;
      }
        
      case 'quarter_pipe':
      case 'quarter_pipe_small':
      case 'quarter_pipe_med':
      case 'quarter_pipe_large': {
        // Try to use GLB model
        const qpCacheKey = data.type === 'quarter_pipe' ? 'quarter_pipe_med' : data.type;
        const qpCached = this.modelCache.get(qpCacheKey);
        if (qpCached) {
          mesh = qpCached.clone();
        } else {
          // Fallback to procedural mesh
          mesh = this.createQuarterPipeMesh(concreteMaterial);
        }
        // Physics collider
        const qpSize = data.type === 'quarter_pipe_small' ? 3 : 
                       data.type === 'quarter_pipe_large' ? 7 : 5;
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0], qpSize / 3, data.position[2]),
          new THREE.Vector3(qpSize, qpSize / 2, qpSize),
          new THREE.Euler(0, (data.rotation?.[1] || 0) * Math.PI / 180, 0)
        );
        break;
      }
        
      case 'half_pipe': {
        const width = (data.params?.width as number) || 15;
        const length = (data.params?.length as number) || 20;
        mesh = this.createHalfPipeMesh(concreteMaterial, width, length);
        break;
      }
      
      case 'fun_box': {
        const width = (data.params?.width as number) || 6;
        const depth = (data.params?.depth as number) || 4;
        const height = (data.params?.height as number) || 0.8;
        mesh = this.createFunBoxMesh(MaterialLibrary.get('deskLaminate', { repeat: [2.4, 1.4] }), railMaterial, width, depth, height);
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0], height / 2, data.position[2]),
          new THREE.Vector3(width / 2, height / 2, depth / 2)
        );
        break;
      }
      
      case 'stairs': {
        const steps = (data.params?.steps as number) || 5;
        mesh = this.createStairsMesh(concreteMaterial, steps);
        // Collision: approximate as ramp-like box
        const stairHeight = steps * 0.25;
        const stairDepth = steps * 0.3;
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0], stairHeight / 2, data.position[2]),
          new THREE.Vector3(1.5, stairHeight / 2, stairDepth / 2)
        );
        break;
      }
      
      case 'cubicle': {
        const cubWidth = (data.params?.width as number) || 3;
        const cubDepth = (data.params?.depth as number) || 3;
        const cubHeight = (data.params?.height as number) || 1.5;
        // Try to use GLB model
        const cubCached = this.modelCache.get('cubicle');
        if (cubCached) {
          mesh = cubCached.clone();
        } else {
          // Fallback to procedural mesh
          mesh = this.createCubicleMesh(officeMaterial, woodMaterial, cubWidth, cubDepth, cubHeight);
        }
        // Collision: cubicle walls — height matches the walls
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0], cubHeight / 2, data.position[2]),
          new THREE.Vector3(cubWidth / 2, cubHeight / 2, cubDepth / 2)
        );
        break;
      }
      
      case 'car':
        mesh = this.createCarMesh();
        // Collision: car body (approx 4x1.5x2)
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0], 0.75, data.position[2]),
          new THREE.Vector3(2, 0.75, 1)
        );
        break;
        
      case 'bench':
        mesh = this.createBenchMesh(woodMaterial, metalMaterial);
        // Collision: bench (approx 2x0.5x0.5)
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0], 0.3, data.position[2]),
          new THREE.Vector3(1, 0.3, 0.25)
        );
        break;
        
      case 'planter':
        mesh = this.createPlanterMesh(concreteMaterial);
        // Collision: planter box (approx 1.5x1.5x1.5)
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0], 0.75, data.position[2]),
          new THREE.Vector3(0.75, 0.75, 0.75)
        );
        break;
        
      case 'water_cooler':
        mesh = makeWaterCooler({ seed: Math.round(data.position[0] * 7 + data.position[2] * 3) });
        // Collision: water cooler (approx 0.4x1.2x0.4)
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0], 0.6, data.position[2]),
          new THREE.Vector3(0.2, 0.6, 0.2)
        );
        break;
        
      case 'trash_can':
        mesh = makeTrashCan({ seed: Math.round(data.position[0] * 5 + data.position[2] * 11) });
        // Collision: trash can cylinder approx as box (0.4x0.8x0.4)
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0], 0.4, data.position[2]),
          new THREE.Vector3(0.2, 0.4, 0.2)
        );
        break;
        
      case 'cone':
        mesh = this.createConeMesh();
        // Collision: small cone base (0.3x0.5x0.3)
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0], 0.25, data.position[2]),
          new THREE.Vector3(0.15, 0.25, 0.15)
        );
        break;
        
      case 'barrier': {
        const length = (data.params?.length as number) || 5;
        mesh = this.createBarrierMesh(metalMaterial, length);
        // Collision: barrier (length x 0.8 x 0.1)
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0], 0.5, data.position[2]),
          new THREE.Vector3(length / 2, 0.4, 0.05)
        );
        break;
      }
      
      case 'building_small':
      case 'building_medium':
      case 'building_large':
      case 'building_wide': {
        const defaults: Record<string, { width: number; depth: number; height: number }> = {
          'building_small': { width: 10, depth: 10, height: 15 },
          'building_medium': { width: 15, depth: 15, height: 30 },
          'building_large': { width: 20, depth: 20, height: 50 },
          'building_wide': { width: 30, depth: 15, height: 12 },
        };
        const def = defaults[data.type] || defaults['building_small'];
        const bWidth = (data.params?.width as number) || def.width;
        const bDepth = (data.params?.depth as number) || def.depth;
        const bHeight = (data.params?.height as number) || def.height;
        mesh = this.createBuildingMesh(data.type, data.params);
        // Collision: full building box
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0], bHeight / 2, data.position[2]),
          new THREE.Vector3(bWidth / 2, bHeight / 2, bDepth / 2)
        );
        break;
      }
      
      case 'shrub_small':
        mesh = this.createShrubMesh(0.5, 0.6);
        // Collision: small sphere approx (0.5x0.6x0.5)
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0], 0.3, data.position[2]),
          new THREE.Vector3(0.25, 0.3, 0.25)
        );
        break;
        
      case 'shrub_medium':
        mesh = this.createShrubMesh(0.8, 1.0);
        // Collision: medium shrub (0.8x1.0x0.8)
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0], 0.5, data.position[2]),
          new THREE.Vector3(0.4, 0.5, 0.4)
        );
        break;
        
      case 'shrub_large':
        mesh = this.createShrubMesh(1.2, 1.5);
        // Collision: large shrub (1.2x1.5x1.2)
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0], 0.75, data.position[2]),
          new THREE.Vector3(0.6, 0.75, 0.6)
        );
        break;
        
      case 'tree_small':
        mesh = this.createTreeMesh();
        // Collision: matches visible foliage cone (lower portion)
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0], 2.5, data.position[2]),
          new THREE.Vector3(1.0, 0.5, 1.0)
        );
        break;

      // =============================================
      // INDOOR OFFICE OBJECTS
      // =============================================

      case 'wall_indoor': {
        const wWidth = (data.params?.width as number) || 10;
        const wHeight = (data.params?.height as number) || 8;
        const wDepth = (data.params?.depth as number) || 1;
        mesh = this.createIndoorWallMesh(wWidth, wHeight, wDepth);
        // Physics: solid wall box centered at the given position
        const wallRot = data.rotation
          ? new THREE.Euler(
              data.rotation[0] * Math.PI / 180,
              data.rotation[1] * Math.PI / 180,
              data.rotation[2] * Math.PI / 180
            )
          : new THREE.Euler(0, 0, 0);
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0], data.position[1], data.position[2]),
          new THREE.Vector3(wWidth / 2, wHeight / 2, wDepth / 2),
          wallRot
        );
        break;
      }

      case 'ceiling_slab': {
        const csWidth = (data.params?.width as number) || 80;
        const csDepth = (data.params?.depth as number) || 80;
        mesh = this.createCeilingSlabMesh(csWidth, csDepth);
        // Physics: ceiling acts as a blocker
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0], data.position[1], data.position[2]),
          new THREE.Vector3(csWidth / 2, 0.5, csDepth / 2)
        );
        break;
      }

      case 'ceiling_panel': {
        const cpWidth = (data.params?.width as number) || 6;
        const cpDepth = (data.params?.depth as number) || 0.8;
        mesh = this.createCeilingPanelMesh(cpWidth, cpDepth);
        // Ceiling panels don't need physics (they're at the ceiling, player can't reach)
        // But add a point light for illumination
        const panelLight = new THREE.PointLight(0xffeedd, 1.8, 22);
        panelLight.position.set(data.position[0], data.position[1] - 2, data.position[2]);
        this.scene.add(panelLight);
        this.levelObjects.push(panelLight);
        break;
      }

      case 'filing_cabinet': {
        mesh = makeFilingCabinet({ seed: Math.round(data.position[0] * 13 + data.position[2] * 5) });
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0], 0.9, data.position[2]),
          new THREE.Vector3(0.4, 0.9, 0.3)
        );
        break;
      }

      case 'printer': {
        mesh = makePrinter({ seed: Math.round(data.position[0] * 17 + data.position[2] * 7) });
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0], 0.35, data.position[2]),
          new THREE.Vector3(0.35, 0.35, 0.3)
        );
        break;
      }

      case 'exit_sign': {
        const esWidth = (data.params?.width as number) || 3;
        const esHeight = (data.params?.height as number) || 0.8;
        mesh = this.createExitSignMesh(esWidth, esHeight);
        // Signs don't block player (mounted high on wall)
        break;
      }

      default:
        // Unknown type - create placeholder cube
        const geom = new THREE.BoxGeometry(1, 1, 1);
        mesh = new THREE.Mesh(geom, concreteMaterial);
    }
    
    if (mesh) {
      mesh.position.set(data.position[0], data.position[1], data.position[2]);
      if (data.rotation) {
        mesh.rotation.set(
          data.rotation[0] * Math.PI / 180,
          data.rotation[1] * Math.PI / 180,
          data.rotation[2] * Math.PI / 180
        );
      }
    }
    
    return mesh;
  }
  
  // =============================================
  // LEVEL OBJECT MESH CREATION HELPERS
  // =============================================
  
  /**
   * A grind rail. Delegates to OfficeProps.makeGrindRail: round steel shaft with a
   * caster-polished contact strip, welded base plates and a mid-brace, instead of the box
   * on two pins this used to be. Top of the shaft is still at y = 0.80, so every existing
   * grind registration is unchanged.
   */
  private createRailMesh(length: number): THREE.Group {
    return makeGrindRail(length, { seed: Math.round(length * 13) + 1 });
  }
  
  // Ramp dimensions, shared by the mesh and its collider so they can't drift.
  private static readonly RAMP_W = 3.4;
  private static readonly RAMP_D = 1.8;
  private static readonly RAMP_H = 0.85;

  /**
   * A kicker ramp. Delegates to OfficeProps.makeKickerRamp: beveled plywood deck, steel
   * coping lip along the top edge (which is also a grind edge), deck battens, bolt heads,
   * side cheek plates and a floor transition plate. The previous version was a bare
   * ExtrudeGeometry wedge with hard 90-degree corners — the most obviously prototype-grade
   * geometry in the level, and the object the player stares at longest during a trick.
   */
  private createRampMesh(): THREE.Group {
    return makeKickerRamp({
      width: Game.RAMP_W,
      depth: Game.RAMP_D,
      height: Game.RAMP_H,
      seed: 4211,
    });
  }
  
  private createQuarterPipeMesh(material: THREE.Material): THREE.Mesh {
    const shape = new THREE.Shape();
    const radius = 4;
    const segments = 16;
    
    shape.moveTo(0, 0);
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI / 2;
      shape.lineTo(radius - Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    shape.lineTo(radius, 0);
    shape.lineTo(0, 0);
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      steps: 1,
      depth: 10,
      bevelEnabled: false
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }
  
  private createHalfPipeMesh(material: THREE.Material, width: number, length: number): THREE.Group {
    const group = new THREE.Group();
    
    const shape = new THREE.Shape();
    const radius = 4;
    const segments = 16;
    
    shape.moveTo(0, 0);
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI / 2;
      shape.lineTo(radius - Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    shape.lineTo(radius, 0);
    shape.lineTo(0, 0);
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      steps: 1,
      depth: length,
      bevelEnabled: false
    });
    
    const left = new THREE.Mesh(geometry, material);
    left.position.set(-width / 2, 0, -length / 2);
    left.rotation.y = Math.PI / 2;
    group.add(left);
    
    const right = new THREE.Mesh(geometry, material);
    right.position.set(width / 2, 0, length / 2);
    right.rotation.y = -Math.PI / 2;
    group.add(right);
    
    const bottomGeom = new THREE.BoxGeometry(width - 8, 0.1, length);
    const bottom = new THREE.Mesh(bottomGeom, material);
    bottom.position.set(0, 0.05, 0);
    group.add(bottom);
    
    return group;
  }
  
  private createFunBoxMesh(material: THREE.Material, railMat: THREE.Material, width: number, depth: number, height: number): THREE.Group {
    const group = new THREE.Group();
    
    const boxGeom = new THREE.BoxGeometry(width, height, depth);
    const box = new THREE.Mesh(boxGeom, material);
    box.position.y = height / 2;
    box.castShadow = true;
    group.add(box);
    
    const railGeom = new THREE.BoxGeometry(width, 0.06, 0.06);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeom, railMat);
      rail.position.set(0, height + 0.03, side * (depth / 2 - 0.03));
      group.add(rail);
    }
    
    return group;
  }
  
  private createStairsMesh(material: THREE.Material, steps: number): THREE.Group {
    const group = new THREE.Group();
    
    const stepWidth = 4;
    const stepHeight = 0.2;
    const stepDepth = 0.3;
    
    for (let i = 0; i < steps; i++) {
      const stepGeom = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
      const step = new THREE.Mesh(stepGeom, material);
      step.position.set(0, stepHeight / 2 + i * stepHeight, i * stepDepth);
      step.castShadow = true;
      group.add(step);
    }
    
    return group;
  }
  
  private createCubicleMesh(_wallMat: THREE.Material, _deskMat: THREE.Material, width: number, depth: number, height: number = 1.5): THREE.Group {
    const group = new THREE.Group();

    // Cubicle wall color — fabric-covered panels (dark teal, per spec #2d5a5a)
    const fabricMat = new THREE.MeshStandardMaterial({
      color: 0x2d5a5a,
      roughness: 0.95,
      metalness: 0.0
    });
    // Light wood desk surface (per spec #c8a96e)
    const lightWoodMat = new THREE.MeshStandardMaterial({
      color: 0xc8a96e,
      roughness: 0.6,
      metalness: 0.0
    });

    // Back wall panel
    const wallGeom = new THREE.BoxGeometry(width, height, 0.08);
    const backWall = new THREE.Mesh(wallGeom, fabricMat);
    backWall.position.set(0, height / 2, depth / 2);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    group.add(backWall);

    // Side wall panels
    const sideWallGeom = new THREE.BoxGeometry(0.08, height, depth);
    for (const side of [-1, 1]) {
      const sideWall = new THREE.Mesh(sideWallGeom, fabricMat);
      sideWall.position.set(side * width / 2, height / 2, 0);
      sideWall.castShadow = true;
      sideWall.receiveShadow = true;
      group.add(sideWall);
    }

    // Desk surface (light wood laminate)
    const deskGeom = new THREE.BoxGeometry(width * 0.85, 0.06, depth * 0.42);
    const desk = new THREE.Mesh(deskGeom, lightWoodMat);
    desk.position.set(0, 0.76, depth * 0.2);
    desk.castShadow = true;
    desk.receiveShadow = true;
    group.add(desk);

    // Desk legs (metal)
    const legMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.7, roughness: 0.4 });
    const legGeom = new THREE.BoxGeometry(0.06, 0.76, 0.06);
    for (const lx of [-1, 1]) {
      for (const lz of [-1, 1]) {
        const leg = new THREE.Mesh(legGeom, legMat);
        leg.position.set(lx * (width * 0.38), 0.38, depth * 0.2 + lz * (depth * 0.18));
        group.add(leg);
      }
    }

    // Monitor (dark screen)
    const monitorBaseMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
    const monitorScreenMat = new THREE.MeshStandardMaterial({
      color: 0x112233,
      emissive: 0x0a1a2a,
      emissiveIntensity: 0.4
    });
    const monitorGeom = new THREE.BoxGeometry(0.5, 0.35, 0.04);
    const monitor = new THREE.Mesh(monitorGeom, monitorScreenMat);
    monitor.position.set(0, 1.1, depth * 0.35);
    group.add(monitor);
    const monitorBaseGeom = new THREE.BoxGeometry(0.15, 0.22, 0.08);
    const monitorBase = new THREE.Mesh(monitorBaseGeom, monitorBaseMat);
    monitorBase.position.set(0, 0.87, depth * 0.35);
    group.add(monitorBase);

    return group;
  }
  
  private createCarMesh(): THREE.Group {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2244aa, metalness: 0.8, roughness: 0.3 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    
    const bodyGeom = new THREE.BoxGeometry(2, 1, 4);
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.8;
    body.castShadow = true;
    group.add(body);
    
    const topGeom = new THREE.BoxGeometry(1.5, 0.6, 2);
    const top = new THREE.Mesh(topGeom, bodyMat);
    top.position.set(0, 1.6, -0.3);
    group.add(top);
    
    const wheelGeom = new THREE.CylinderGeometry(0.3, 0.3, 0.15, 12);
    const positions = [
      [-0.9, 0.3, 1.3], [0.9, 0.3, 1.3],
      [-0.9, 0.3, -1.3], [0.9, 0.3, -1.3]
    ];
    
    for (const [x, y, z] of positions) {
      const wheel = new THREE.Mesh(wheelGeom, wheelMat);
      wheel.position.set(x, y, z);
      wheel.rotation.z = Math.PI / 2;
      group.add(wheel);
    }
    
    return group;
  }
  
  private createBenchMesh(woodMat: THREE.Material, metalMat: THREE.Material): THREE.Group {
    const group = new THREE.Group();
    
    const seatGeom = new THREE.BoxGeometry(2, 0.1, 0.5);
    const seat = new THREE.Mesh(seatGeom, woodMat);
    seat.position.y = 0.5;
    group.add(seat);
    
    const legGeom = new THREE.BoxGeometry(0.1, 0.5, 0.4);
    for (const side of [-0.8, 0.8]) {
      const leg = new THREE.Mesh(legGeom, metalMat);
      leg.position.set(side, 0.25, 0);
      group.add(leg);
    }
    
    return group;
  }
  
  private createPlanterMesh(boxMat: THREE.Material): THREE.Group {
    const group = new THREE.Group();
    
    const boxGeom = new THREE.BoxGeometry(2, 0.8, 2);
    const box = new THREE.Mesh(boxGeom, boxMat);
    box.position.y = 0.4;
    group.add(box);
    
    const trunkGeom = new THREE.CylinderGeometry(0.1, 0.15, 1);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3020 });
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.y = 1.3;
    group.add(trunk);
    
    const foliageGeom = new THREE.SphereGeometry(0.6, 8, 8);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x228b22 });
    const foliage = new THREE.Mesh(foliageGeom, foliageMat);
    foliage.position.y = 2;
    group.add(foliage);
    
    return group;
  }
  
  
  
  private createConeMesh(): THREE.Mesh {
    const geometry = new THREE.ConeGeometry(0.2, 0.5, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0xff6600 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.25;
    return mesh;
  }
  
  private createBarrierMesh(metalMat: THREE.Material, length: number): THREE.Group {
    const group = new THREE.Group();
    
    const barrierGeom = new THREE.BoxGeometry(length, 0.8, 0.1);
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0xffcc00 });
    const barrier = new THREE.Mesh(barrierGeom, barrierMat);
    barrier.position.y = 0.5;
    group.add(barrier);
    
    const legGeom = new THREE.CylinderGeometry(0.05, 0.05, 0.8);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeom, metalMat);
      leg.position.set(side * (length / 2 - 0.1), 0.4, 0);
      group.add(leg);
    }
    
    return group;
  }
  
  private createBuildingMesh(type: string, params?: Record<string, unknown>): THREE.Group {
    const group = new THREE.Group();
    
    // Default sizes based on type
    const defaults: Record<string, { width: number; depth: number; height: number }> = {
      'building_small': { width: 10, depth: 10, height: 15 },
      'building_medium': { width: 15, depth: 15, height: 30 },
      'building_large': { width: 20, depth: 20, height: 50 },
      'building_wide': { width: 30, depth: 15, height: 12 },
    };
    
    const def = defaults[type] || defaults['building_small'];
    const width = (params?.width as number) || def.width;
    const depth = (params?.depth as number) || def.depth;
    const height = (params?.height as number) || def.height;
    
    // Building body
    const buildingMat = new THREE.MeshStandardMaterial({ 
      color: 0x808090,
      roughness: 0.7,
      metalness: 0.1
    });
    const bodyGeom = new THREE.BoxGeometry(width, height, depth);
    const body = new THREE.Mesh(bodyGeom, buildingMat);
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    
    // Windows (simple stripes)
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x4488aa,
      roughness: 0.1,
      metalness: 0.8
    });
    
    const windowRows = Math.floor(height / 3);
    const windowCols = Math.floor(width / 3);
    
    for (let row = 0; row < windowRows; row++) {
      for (let col = 0; col < windowCols; col++) {
        const windowGeom = new THREE.BoxGeometry(1.5, 2, 0.1);
        const windowMesh = new THREE.Mesh(windowGeom, windowMat);
        windowMesh.position.set(
          -width / 2 + 1.5 + col * 3,
          2 + row * 3,
          depth / 2 + 0.05
        );
        group.add(windowMesh);
        
        // Back side
        const windowBack = windowMesh.clone();
        windowBack.position.z = -depth / 2 - 0.05;
        group.add(windowBack);
      }
    }
    
    return group;
  }
  
  private createShrubMesh(radius: number, height: number): THREE.Group {
    const group = new THREE.Group();
    
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x228833,
      roughness: 0.8
    });
    
    // Create multiple spheres for organic look
    const numBalls = 5;
    for (let i = 0; i < numBalls; i++) {
      const r = radius * (0.6 + Math.random() * 0.4);
      const sphereGeom = new THREE.SphereGeometry(r, 8, 6);
      const sphere = new THREE.Mesh(sphereGeom, leafMat);
      sphere.position.set(
        (Math.random() - 0.5) * radius,
        height * 0.5 + (Math.random() - 0.5) * height * 0.3,
        (Math.random() - 0.5) * radius
      );
      sphere.castShadow = true;
      group.add(sphere);
    }
    
    return group;
  }
  
  private createTreeMesh(): THREE.Group {
    const group = new THREE.Group();
    
    // Trunk
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 });
    const trunkGeom = new THREE.CylinderGeometry(0.15, 0.2, 2, 8);
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.y = 1;
    trunk.castShadow = true;
    group.add(trunk);
    
    // Foliage
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.8 });
    const foliageGeom = new THREE.ConeGeometry(1.5, 3, 8);
    const foliage = new THREE.Mesh(foliageGeom, leafMat);
    foliage.position.y = 3.5;
    foliage.castShadow = true;
    group.add(foliage);
    
    return group;
  }
  
  // =============================================
  // INDOOR OFFICE MESH CREATORS
  // =============================================

  private createIndoorWallMesh(width: number, height: number, depth: number): THREE.Mesh {
    const geom = new THREE.BoxGeometry(width, height, depth);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xd4cfc8,   // Off-white / cream office wall
      roughness: 0.85,
      metalness: 0.0
    });
    const mesh = new THREE.Mesh(geom, mat);
    // Mesh is positioned by caller at the wall center
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    return mesh;
  }

  private createCeilingSlabMesh(width: number, depth: number): THREE.Mesh {
    const geom = new THREE.BoxGeometry(width, 1.0, depth);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xd8d8d0,   // Light gray drop ceiling tiles
      roughness: 0.9,
      metalness: 0.0
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  private createCeilingPanelMesh(width: number, depth: number): THREE.Group {
    const group = new THREE.Group();

    // Light panel housing (aluminum frame)
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.4,
      metalness: 0.5
    });
    const housingGeom = new THREE.BoxGeometry(width + 0.1, 0.08, depth + 0.1);
    const housing = new THREE.Mesh(housingGeom, housingMat);
    housing.position.y = 0;
    group.add(housing);

    // Glowing fluorescent tube (emissive white)
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffeedd,
      emissiveIntensity: 1.8,
      roughness: 0.1
    });
    const tubeGeom = new THREE.BoxGeometry(width - 0.15, 0.06, depth - 0.05);
    const tube = new THREE.Mesh(tubeGeom, tubeMat);
    tube.position.y = -0.02;
    group.add(tube);

    return group;
  }



  private createExitSignMesh(width: number, height: number): THREE.Group {
    const group = new THREE.Group();

    // Sign backing (dark border)
    const borderMat = new THREE.MeshStandardMaterial({ color: 0x002200 });
    const borderGeom = new THREE.BoxGeometry(width, height, 0.05);
    const border = new THREE.Mesh(borderGeom, borderMat);
    border.position.y = 0;
    group.add(border);

    // Glowing green face
    const signMat = new THREE.MeshStandardMaterial({
      color: 0x00ff44,
      emissive: 0x00cc33,
      emissiveIntensity: 3.0,
      roughness: 0.2
    });
    const signGeom = new THREE.BoxGeometry(width - 0.1, height - 0.08, 0.04);
    const sign = new THREE.Mesh(signGeom, signMat);
    sign.position.z = 0.03;
    group.add(sign);

    // Point light so the sign illuminates the surrounding area
    const signLight = new THREE.PointLight(0x00ff66, 2.0, 6);
    signLight.position.set(0, 0, 0.3);
    group.add(signLight);

    return group;
  }

  stop(): void {
    this.isRunning = false;
    // Stop wheel roll sound
    proceduralSounds.stopWheelRoll();
  }
  
  private loop(currentTime: number): void {
    if (!this.isRunning) return;
    
    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;
    this.lastDelta = deltaTime;

    // Don't update game logic when paused
    if (!this.isPaused) {
      this.accumulator += deltaTime;
      this.levelTime += deltaTime;
      
      // Fixed timestep physics
      let steps = 0;
      while (this.accumulator >= this.PHYSICS_TIMESTEP && steps < this.MAX_FRAME_SKIP) {
        this.fixedUpdate(this.PHYSICS_TIMESTEP);
        this.accumulator -= this.PHYSICS_TIMESTEP;
        steps++;
      }
      
      // Update HUD
      if (this.hud) {
        this.hud.update(deltaTime);
      }
    }
    
    // Roof cutaway: drop the suspended ceiling when the camera is above it.
    this.officeInterior?.setCameraHeight(this.camera.position.y);

    // Environment rig: recentre + texel-snap the shadow frustum on the player,
    // and keep the sky dome / clouds riding along with them. Must run every frame.
    if (this.envRig && this.chair) {
      this.envRig.update(deltaTime, this.chair.position, this.camera);
    }

    // Speed-driven radial blur + chromatic aberration.
    if (this.postFX && this.chairBody) {
      const v = this.physics.getVelocity(this.chairBody);
      const speed = Math.sqrt(v.x * v.x + v.z * v.z);
      this.postFX.setSpeed(Math.max(0, Math.min(1, speed / 22)));
    }

    // Always render (even when paused)
    this.render();

    requestAnimationFrame(this.loop.bind(this));
  }
  
  private fixedUpdate(dt: number): void {
    // Simulated seconds. Coyote time, pin recovery and anything else that has to be
    // reproducible run-to-run reads this, never performance.now().
    this.simTime += dt;

    // ---- 1. INTENT --------------------------------------------------------------------
    // THPSControls is the single source of player intent. InputManager is still ticked so
    // the debug animation cycler keeps working, but nothing gameplay-facing reads it.
    const intent = this.controls.update(dt);
    this.intent = intent;
    this.input.update();

    if (intent.push || intent.brake || intent.turn !== 0 || intent.olliePopped ||
        intent.flipEdge || intent.grabEdge || intent.grindEdge || intent.revertEdge) {
      this.hud?.hideControlsHint();
    }

    if (this.bailRecovery > 0) this.bailRecovery = Math.max(0, this.bailRecovery - dt);

    // ---- 2. GROUND / AIR STATE, LAND + TAKEOFF EVENTS ----------------------------------
    this.updatePlayerState(dt);

    const velNow = this.physics.getVelocity(this.chairBody);
    const speedNow = Math.hypot(velNow.x, velNow.z);

    // ---- 3. AIR TRICKS ----------------------------------------------------------------
    this.updateTricks();

    // Expire a finished one-shot trick so the animator returns to the ride pose.
    if (this.activeTrick && !this.heldGrabId && performance.now() > this.activeTrick.until) {
      this.activeTrick = null;
      this.trickAnimator?.releaseTrick();
    }

    // ---- 4. GRIND ---------------------------------------------------------------------
    this.grindSystem.updateCooldown(dt);
    this.updateGrind(dt, intent, speedNow);

    // ---- 5. MANUAL / REVERT / BALANCE -------------------------------------------------
    this.updateBalance(dt, intent, speedNow);

    // A landing banks the position only if the player did not save it. Anything that keeps
    // the line alive — a manual, a revert, a grind, going straight back into the air —
    // cancels the pending bank and the combo rolls on.
    if (this.pendingBankAt > 0) {
      if (!this.score.isOpen) {
        this.pendingBankAt = 0;
      } else if (this.balance.isManualing || this.balance.revertTimeRemaining > 0
                 || this.grindSystem.isGrinding() || this.playerState.isAirborne) {
        this.pendingBankAt = 0;
      } else if (this.simTime >= this.pendingBankAt) {
        this.pendingBankAt = 0;
        this.land();
      }
    }

    // ---- 6. MOVEMENT ------------------------------------------------------------------
    if (!this.grindSystem.isGrinding()) {
      this.applyMovement(intent, dt);
      this.grindParticles.update(dt, false);
    }
    this.landingParticles.update(dt);

    // ---- 7. PHYSICS -------------------------------------------------------------------
    if (!this.grindSystem.isGrinding()) {
      this.physics.step(dt);
    }

    // ---- 8. TRANSFORM SYNC + VISUAL LEAN ----------------------------------------------
    const pos = this.physics.getPosition(this.chairBody);
    const rot = this.physics.getRotation(this.chairBody);
    this.chair.position.copy(pos);
    this.chair.quaternion.copy(rot);

    if (this.playerState.isAirborne && this.spinRotation !== 0) {
      this.chair.rotation.y += this.spinRotation * dt;
    }

    // The rigid body is Y-locked, so BalanceSystem's pitch/roll go on the visual group.
    const bal = this.balanceState;
    if (this.chairTilt) {
      const pitchRad = bal ? bal.pitchDegrees * DEG2RAD : 0;
      const rollRad = bal ? bal.rollDegrees * DEG2RAD : 0;
      this.chairTilt.rotation.x = pitchRad;
      this.chairTilt.rotation.z = rollRad;
    }

    // ---- 9. SCORE TICK ----------------------------------------------------------------
    this.score.setAirborne(this.playerState.isAirborne);
    // Air rotation feeds the spin scorer, which turns it into 180/360/540 entries itself.
    if (this.playerState.isAirborne) {
      const yawNow = this.chair.rotation.y;
      this.score.addSpin(yawDeltaDegrees(this.lastYaw, yawNow));
      this.lastYaw = yawNow;
    } else {
      this.lastYaw = this.chair.rotation.y;
    }
    this.score.update(dt);
    this.hud?.setScore(this.score.balance);

    // ---- 10. CAMERA + FEEDBACK --------------------------------------------------------
    this.cameraController.update(dt);

    const currentVel = this.physics.getVelocity(this.chairBody);
    const currentSpeed = new THREE.Vector3(currentVel.x, 0, currentVel.z).length();

    // High-speed collision: a big instantaneous loss of speed with a combo open is a crash.
    if (this.prevSpeed > 9 && currentSpeed < this.prevSpeed * 0.45 && this.playerState.isGrounded
        && this.score.isOpen && this.bailRecovery <= 0) {
      this.bail('collision');
    }
    this.prevSpeed = currentSpeed;

    proceduralSounds.updateWheelRoll(currentSpeed, this.playerState.isGrounded && !this.playerState.isGrinding);

    if (this.chairParts) {
      spinCasters(this.chairParts, currentSpeed, dt);
    } else if (this.wheelMeshes.length > 0 && this.playerState.isGrounded && !this.playerState.isGrinding) {
      const rotationDelta = (currentSpeed / 0.025) * dt;
      for (const wheel of this.wheelMeshes) wheel.rotation.x += rotationDelta;
    }

    this.speedLines.update(dt, currentSpeed, this.playerState.isGrounded);
    this.hud?.setSpeed(currentSpeed);
    this.cameraController.updateFOVFromSpeed(currentSpeed, 18);
    this.cameraController.setTrickZoom(this.playerState.isAirborne, this.playerState.airTime);

    // ---- 11. HUD COMBO + BALANCE ------------------------------------------------------
    const comboState = this.score.state;
    this.hud?.setComboState(comboState.open ? comboState : null);

    if (this.balance.isActive) {
      this.hud?.setBalanceVisible(true);
      this.hud?.setBalance(this.balance.balance01);
    } else {
      this.hud?.setBalanceVisible(false);
    }

    // ---- 12. WORLD SYSTEMS ------------------------------------------------------------
    this.destructibles?.update(dt, this.chair.position, currentVel);
    this.paperStorm?.update(dt, this.chair.position, currentVel);
    this.updateCollectibles(dt);

    if (this.police) {
      // Noise: how loud the player is. A grinding office chair is a siren.
      const noise = Math.min(1, currentSpeed / 14 + (this.playerState.isGrinding ? 0.45 : 0));
      this.police.update(dt, this.chair.position, currentVel, noise);
      this.hud?.setHeat(this.police.heatLevel);
      this.goals?.setPursuit(this.police.inPursuit);
    }

    // ---- 13. GOALS --------------------------------------------------------------------
    if (this.goals) {
      this.goals.update(dt);
      this.updateZones();
      const unpaid = this.goals.takeUnpaidReward();
      if (unpaid > 0) this.score.addStonks(unpaid, 'Goal reward');

      this.goalHudTimer += dt;
      if (this.goalHudTimer > 0.25) {
        this.goalHudTimer = 0;
        this.hud?.setGoals(this.goals.progress);
      }
    }

    // ---- 14. RIDER ANIMATION ----------------------------------------------------------
    this.updateRider(dt, currentSpeed, intent);

    // ---- 15. STORY --------------------------------------------------------------------
    this.updateStorySystems(dt);

    this.input.clearJustPressed();
  }

  /**
   * Grind entry / exit. Grinding now REQUIRES the grind button: the old code called
   * tryStartGrind() unconditionally every frame, so rails grabbed you whether you wanted
   * them or not and no grind trick was ever named.
   */
  private updateGrind(dt: number, intent: ControlIntent, speed: number): void {
    if (!this.grindSystem.isGrinding()) {
      if (!intent.grind || this.bailRecovery > 0) return;

      const pos = this.physics.getPosition(this.chairBody);
      const vel = this.physics.getVelocity(this.chairBody);
      const rail = this.grindSystem.tryStartGrind(pos, vel, true);
      if (!rail) return;

      this.playerState.isGrinding = true;

      // Name the grind from the approach angle. detectGrindType() has been implemented and
      // uncalled since it was written; this is the call site.
      const approach = THREE.MathUtils.radToDeg(
        Math.atan2(vel.x, vel.z) - Math.atan2(rail.direction.x, rail.direction.z)
      );
      let def = this.trickDetector.detectGrindType(approach) ?? TrickRegistry.get('50_50') ?? null;
      // Holding a vertical direction as you lock on picks the two grinds the angle table
      // cannot reach, so all eight grind entries are live.
      if (intent.dir.y > 0) def = TrickRegistry.get('crooked') ?? def;
      else if (intent.dir.y < 0) def = TrickRegistry.get('bluntslide') ?? def;

      this.grindTrick = def;
      const base = def?.basePoints ?? 300;
      this.score.startGrind(def?.displayName ?? 'Grind', base);
      this.balance.startGrind();
      this.trickAnimator?.playTrick(def?.id ?? '50_50', 'grind', 0);
      this.goals?.notifyTrickAt(def?.id ?? '50_50', this.zoneIdAtPlayer());

      proceduralSounds.playGrindStart();
      proceduralSounds.startGrindLoop();
      proceduralSounds.startBalanceWarning();

      const gs = this.grindSystem.getState();
      if (gs.rail) this.cameraController.setGrindCamera(true, gs.rail.start, gs.rail.end);
      return;
    }

    // --- already grinding ---
    // Ollie out, or release the grind button to drop off. Both keep the combo open.
    if (intent.olliePopped || !intent.grindHeld) {
      const popping = intent.olliePopped;
      this.endGrind();
      if (popping) {
        proceduralSounds.playJump();
        const v = this.physics.getVelocity(this.chairBody);
        this.physics.setVelocity(this.chairBody, new THREE.Vector3(v.x, 10 * this.jumpMultiplier * intent.ollieCharge, v.z));
      }
      return;
    }

    // Balance the rail on the horizontal axis (grinds are left/right in THPS).
    this.grindSystem.updateGrind(dt, -intent.dir.x, this.physics, this.chairBody, this.grindBalanceDrift * 2);
    this.score.updateGrind(dt, this.balance.balance01);
    proceduralSounds.updateBalanceWarning(this.balance.balance01);

    const gs = this.grindSystem.getState();
    if (gs.rail) {
      const grindPos = new THREE.Vector3().lerpVectors(gs.rail.start, gs.rail.end, gs.progress);
      grindPos.y += 0.1;
      this.grindParticles.update(dt, true, grindPos, gs.rail.direction);
    }
    if (speed < 0.2) this.endGrind();

    // The grind system can drop the grind on its own (ran off the end of the rail).
    if (!this.grindSystem.isGrinding()) this.endGrind();
  }

  /** Close a grind without bailing. The combo stays open. */
  private endGrind(): void {
    if (this.grindSystem.isGrinding()) this.grindSystem.forceEndGrind();
    if (!this.playerState.isGrinding) return;

    this.playerState.isGrinding = false;
    this.grindTrick = null;
    this.score.endGrind();
    if (this.balance.state.mode === 'grind') this.balance.end();
    this.trickAnimator?.releaseTrick();
    proceduralSounds.stopGrindLoop();
    proceduralSounds.stopBalanceWarning();
    this.cameraController.setGrindCamera(false);
  }

  /**
   * Manual / nose-manual on the down-up tap, revert on landing from a transition, and the
   * inverted-pendulum integration that drives both (and the grind).
   */
  private updateBalance(dt: number, intent: ControlIntent, speed: number): void {
    // --- manual entry (edge only, so no repeat) ---
    // A manual is the glue between two features, so it gets the same landing grace as the
    // ollie. Requiring the exact frame of contact made it unusable on any surface with a
    // seam in it, and a manual you cannot start is a line you cannot link.
    const contactForTrick = this.playerState.isGrounded
      || (this.simTime - this.lastGroundedTime) * 1000 < this.COYOTE_TIME_MS * 2;

    if (intent.manualEdge !== 'none' && this.bailRecovery <= 0) {
      const nose = intent.manualEdge === 'noseManual';
      if (this.balance.tryStartManual(nose, contactForTrick, speed)) {
        this.score.startManual(nose);
        this.playerState.isManualing = true;
        const def = TrickRegistry.get(nose ? 'nose_manual' : 'manual');
        this.trickAnimator?.playTrick(def?.id ?? 'manual', 'manual', 0);
        this.goals?.notifyTrickAt(def?.id ?? 'manual', this.zoneIdAtPlayer());
      }
    }

    // --- revert ---
    if (intent.revertEdge && this.bailRecovery <= 0) {
      if (this.balance.tryRevert(this.landedFromTransition)) {
        this.score.revert();
        const def = TrickRegistry.get('manual');
        if (def) this.trickAnimator?.playTrick('revert', 'manual', 0.35);
      }
    }

    // --- integrate ---
    // Manuals are corrected vertically, grinds/lips horizontally. Difficulty rises with the
    // length of the line, so a long combo is progressively hairier to hold.
    const axis = this.balance.axis;
    const stick = axis === 'vertical' ? intent.dir.y : axis === 'horizontal' ? intent.dir.x : 0;
    const difficulty = 1 + Math.min(1.5, this.score.state.distinctTricks * 0.08);
    this.balanceState = this.balance.update(dt, stick, speed, difficulty);

    if (this.balance.isManualing) {
      this.score.updateManual(dt, this.balance.balance01);
      this.playerState.isManualing = true;
    }
  }

  /**
   * Drive the rider from real gameplay state. Every field here is a fact about this frame,
   * not a guess: the animator is never told what to do, only what is happening.
   */
  private updateRider(dt: number, speed: number, intent: ControlIntent): void {
    if (!this.playerModel) return;

    if (this.trickAnimator) {
      const bal = this.balanceState;
      this.trickAnimator.update(dt, {
        grounded: this.playerState.isGrounded,
        airTime: this.playerState.airTime / 1000,
        speed,
        turn: intent.turn,
        trickId: this.activeTrick?.id ?? (this.grindTrick?.id ?? null),
        trickKind: (this.activeTrick?.kind ?? (this.grindTrick ? 'grind' : null)) as
          'flip' | 'grab' | 'grind' | 'manual' | 'spin' | 'special' | null,
        grabHeld: !!this.heldGrabId,
        balance: bal ? bal.balance01 : 0.5,
        pitchDeg: bal ? bal.pitchDegrees : 0,
        rollDeg: bal ? bal.rollDegrees : 0,
        bailing: this.bailRecovery > 0,
        pushing: intent.push && this.playerState.isGrounded,
      });
      return;
    }

    // Fallback: the rig's own procedural poses.
    this.playerModel.update(dt, {
      grounded: this.playerState.isGrounded,
      grinding: this.playerState.isGrinding,
      airborne: this.playerState.isAirborne,
      airTime: this.playerState.airTime,
    });
    this.updatePlayerAnimation(intent);
  }

  /**
   * Update story-specific systems (checkpoints, chase, etc.)
   */
  private updateStorySystems(dt: number): void {
    // NOTE: levelTime is advanced once, in loop(), off the real frame delta. It used to be
    // incremented here as well, so every level clock (and every 'under N seconds' goal) ran
    // at double speed.
    this.updateCheckpoints();

    // Chase pressure is still simulated for the levels that use it, but its three decorative
    // capsules are gone: PoliceSquad is the only thing that renders or catches a player.
    if (this.chaseMechanic?.isChaseActive()) {
      const vel = this.physics.getVelocity(this.chairBody);
      const playerSpeed = new THREE.Vector3(vel.x, 0, vel.z).length();

      this.chaseMechanic.update(dt, playerSpeed, this.chair.position);

      if (this.chaseHUD) {
        this.chaseHUD.update(this.chaseMechanic.getState());
      }
    }
  }
  
  // Animation state tracking
  private animState: 'standing' | 'running' | 'mounting' | 'pushing' | 'rolling' | 'air' | 'trick' | 'crash' | 'recovering' = 'standing';
  private stateStartTime = 0;
  private isMounted = false;  // Is player sitting on chair?
  
  /**
   * Update player animation based on game state
   */
  private updatePlayerAnimation(input: ControlIntent): void {
    if (!this.playerModel) return;
    
    // Skip animation updates while debug lock is active
    if (this.isDebugAnimLocked()) return;
    
    const vel = this.physics.getVelocity(this.chairBody);
    const speed = new THREE.Vector3(vel.x, 0, vel.z).length();
    const now = performance.now();
    
    // =============================================
    // CRASH STATE - fall off chair
    // =============================================
    if (this.animState === 'crash') {
      // Stay in crash until animation finishes, then recover
      return;
    }
    
    // =============================================
    // RECOVERING STATE - getting back up
    // =============================================
    if (this.animState === 'recovering') {
      // Wait for recovery, then return to standing
      if (now - this.stateStartTime > 1000) {
        this.animState = 'standing';
        this.isMounted = false;
        this.updatePlayerMountPosition();
        this.playerModel.play('idle', { loop: true });
      }
      return;
    }
    
    // =============================================
    // STANDING STATE - behind chair, not mounted
    // =============================================
    if (this.animState === 'standing') {
      if (!this.isMounted) {
        // Player stands behind chair
        this.updatePlayerMountPosition();
        
        // Press forward to start running toward chair
        if (input.push) {
          this.animState = 'running';
          this.stateStartTime = now;
          this.playerModel.play('push', { loop: true });  // Use push as running
          return;
        }
        
        // Play idle animation
        if (!this.playerModel.isPlaying('idle')) {
          this.playerModel.play('idle', { loop: true });
        }
      }
      return;
    }
    
    // =============================================
    // RUNNING STATE - running toward chair
    // =============================================
    if (this.animState === 'running') {
      // After short run, mount the chair
      if (now - this.stateStartTime > 400) {
        this.animState = 'mounting';
        this.stateStartTime = now;
        this.playerModel.play('standtosit', { loop: false });
        return;
      }
      return;
    }
    
    // =============================================
    // MOUNTING STATE - sitting down on chair
    // =============================================
    if (this.animState === 'mounting') {
      // Transition player onto chair
      if (now - this.stateStartTime > 500) {
        this.isMounted = true;
        this.updatePlayerMountPosition();
        this.animState = 'pushing';
        this.stateStartTime = now;
        // Play push once, then transition to rolling (sitting)
        this.playerModel.playOnce('push', 'rolling');
      }
      return;
    }
    
    // =============================================
    // AIRBORNE - tricks and jumps (mounted)
    // =============================================
    if (this.playerState.isAirborne && this.isMounted) {
      if (input.flip || input.grab) {
        // Doing a trick
        if (input.flip) {
          if (!this.playerModel.isPlaying('trick') && !this.playerModel.isPlaying('roll')) {
            this.playerModel.play('trick', { loop: false });
          }
        } else if (input.grab) {
          if (!this.playerModel.isPlaying('chairhold')) {
            this.playerModel.play('chairhold', { loop: true });
          }
        }
        this.animState = 'trick';
      } else {
        if (!this.playerModel.isPlaying('jump') && this.animState !== 'trick') {
          this.playerModel.play('jump', { loop: false });
        }
        this.animState = 'air';
      }
      return;
    }
    
    // =============================================
    // GROUNDED & MOUNTED - pushing/rolling
    // =============================================
    if (this.isMounted) {
      // Pushing state
      if (this.animState === 'pushing') {
        if (now - this.stateStartTime > 600) {
          this.animState = 'rolling';
          this.stateStartTime = now;
          this.playerModel.play('rolling', { loop: true });
        }
        return;
      }
      
      // Rolling state
      if (this.animState === 'rolling' || this.animState === 'air' || this.animState === 'trick') {
        if (!this.playerModel.isPlaying('rolling') && this.playerState.isGrounded) {
          this.playerModel.play('rolling', { loop: true });
          this.animState = 'rolling';
        }
        
        // Push again to go faster
        if (input.push && speed < 8 && this.playerState.isGrounded) {
          // Play push once, then return to rolling (sitting)
          this.playerModel.playOnce('push', 'rolling');
          this.animState = 'pushing';
          this.stateStartTime = now;
        }
        
        // If stopped, stay mounted but idle
        if (speed < 0.3 && this.playerState.isGrounded) {
          this.playerModel.play('rolling', { loop: true });  // Sitting idle on chair
        }
      }
    }
  }
  
  /**
   * Update player position relative to chair based on mount state
   */
  private updatePlayerMountPosition(): void {
    if (!this.playerModel) return;
    
    if (this.isMounted) {
      // Mounted: player sits on the chair. Tuned to ChairModel tier 1, whose
      // seat pan top sits at y = 0.45 above the caster contact patch (the chair
      // group itself rides 0.70 above it, hence the negative local Y).
      this.playerModel.setLocalPosition(-0.40, -0.46, 0.02);
    } else {
      // Standing: player behind chair, facing it
      // Position player behind and slightly to the side of chair
      this.playerModel.setLocalPosition(0, 0, -1.2);
      // Note: The player model will face +Z, which is toward the chair
    }
  }
  
  /**
   * Trigger crash animation (called on bail)
   */
  triggerCrash(): void {
    this.postFX?.pulse(1.0);
    if (!this.playerModel) return;
    this.animState = 'crash';
    this.stateStartTime = performance.now();
    
    // Play crash animation, then recover
    this.playerModel.play('crash', { loop: false });
    
    // Set up recovery after crash
    setTimeout(() => {
      if (this.animState === 'crash') {
        this.animState = 'recovering';
        this.stateStartTime = performance.now();
        this.isMounted = false;
        this.updatePlayerMountPosition();
        
        // Stop the chair
        this.physics.setVelocity(this.chairBody, new THREE.Vector3(0, 0, 0));
      }
    }, 1500);  // Crash animation duration
  }
  
  /**
   * Check if player is mounted on chair (for movement controls)
   */
  isPlayerMounted(): boolean {
    return this.isMounted;
  }
  
  private updatePlayerState(dt: number): void {
    const pos = this.physics.getPosition(this.chairBody);
    const vel = this.physics.getVelocity(this.chairBody);
    
    // THPS-style ground detection using raycasts
    const wasGrounded = this.playerState.isGrounded;
    
    // Cast rays downward to find the surface. The chair's own body is excluded — a solid
    // ray starting inside the capsule reports toi 0, which used to make the player
    // "grounded" at any altitude, so airborne never happened and no ramp normal was ever
    // seen. `distance` is now the GAP UNDER THE WHEELS, not the distance from body centre.
    const groundCheck = this.physics.raycastGroundMulti(
      pos, 0.3, this.GROUND_SNAP_DISTANCE, this.chairBody, CHAIR_FOOT_OFFSET,
    );

    if (groundCheck && groundCheck.distance < this.GROUND_SNAP_DISTANCE) {
      // We're near a surface
      this.surfaceNormal.copy(groundCheck.normal);
      this.surfaceAngle = groundCheck.surfaceAngle;

      // Grounded if the wheels are within a hair of the floor and we are not launching.
      // Rolling off a curb, a stair edge or a desk lip must NOT read as air: a chair that
      // goes weightless every time the floor steps down by 20 cm spends a fifth of the run
      // airborne, scores no manuals (they need contact) and never links anything. So once
      // you are on the ground the contact window opens up, and only a real pop closes it.
      const stickGap = wasGrounded && vel.y <= 0.5 ? this.GROUND_STICK_GAP : this.GROUND_CONTACT_GAP;
      const closeEnough = groundCheck.distance < stickGap;
      const notLaunching = vel.y < 4; // Not actively jumping up

      // On steep surfaces (ramps), check if we're moving up or down
      if (this.surfaceAngle > this.LAUNCH_ANGLE) {
        // On a steep ramp - check if we should launch
        // Launch if moving fast and going up the ramp
        const movingUpRamp = vel.y > 2 && this.surfaceAngle > 60;
        if (movingUpRamp) {
          this.playerState.isGrounded = false;
        } else {
          this.playerState.isGrounded = closeEnough && notLaunching;
        }
      } else {
        this.playerState.isGrounded = closeEnough && notLaunching;
      }

      // THPS-style: stick to the surface across the crest of a ramp or a stair edge, so a
      // roll-off does not read as a launch. Only while descending — never fight a pop.
      if (this.playerState.isGrounded && groundCheck.distance > 0.06 && vel.y <= 0.5) {
        const snapSpeed = Math.min(9, groundCheck.distance / Math.max(dt, 1e-4));
        if (vel.y > -snapSpeed) {
          this.physics.setVelocity(this.chairBody, new THREE.Vector3(vel.x, -snapSpeed, vel.z));
        }
      }
    } else {
      // No ground detected - airborne
      this.playerState.isGrounded = false;
      this.surfaceNormal.set(0, 1, 0);
      this.surfaceAngle = 0;
    }

    this.playerState.isAirborne = !this.playerState.isGrounded;

    // Track last grounded time for coyote time. Sim seconds, not wall clock: the fixed step
    // is the only clock the gameplay may depend on if runs are to be reproducible.
    if (this.playerState.isGrounded) {
      this.lastGroundedTime = this.simTime;
    }

    // Track air time and spin
    if (this.playerState.isAirborne) {
      this.playerState.airTime += dt * 1000;
      
      // Track spin - calculate cumulative rotation since leaving ground
      const currentRotation = this.chair.rotation.y;
      const spinDelta = (currentRotation - this.airStartRotation) * (180 / Math.PI);
      // Normalize to handle wrap-around (accumulates properly)
      this.cumulativeSpinDegrees = Math.abs(spinDelta);
      
      // Update HUD with spin counter (only show if >= 90 degrees)
      const roundedSpin = Math.floor(this.cumulativeSpinDegrees / 180) * 180;
      this.hud?.setSpinCounter(roundedSpin >= 180 ? roundedSpin : 0);
    } else {
      this.playerState.airTime = 0;
    }
    
    // Becoming airborne - store starting rotation
    if (wasGrounded && !this.playerState.isGrounded) {
      this.airStartRotation = this.chair.rotation.y;
      this.lastYaw = this.chair.rotation.y;
      this.takeoffPos.copy(pos);
      this.cumulativeSpinDegrees = 0;
      // A manual cannot survive the wheels leaving the floor.
      if (this.balance.isManualing) this.balance.end();
      // Remember whether the take-off was a transition, for the revert window on landing.
      this.landedFromTransition = this.surfaceAngle > 18;
    }

    // Landing detection
    if (!wasGrounded && this.playerState.isGrounded) {
      proceduralSounds.playLand();

      const landingIntensity = Math.min(1, this.playerState.airTime / 1500);
      if (landingIntensity > 0.1) {
        this.landingParticles.spawn(pos.clone(), landingIntensity);
      }

      let impactShake = Math.min(0.3, this.playerState.airTime / 2000);
      if (this.score.isOpen) {
        impactShake = Math.min(0.5, impactShake + this.score.multiplier * 0.05);
      }

      // Named gaps: one hop from takeoff to touchdown. Paid every time, THPS-style.
      if (this.goals) {
        const gap = matchGap(
          this.goals.gaps,
          [this.takeoffPos.x, this.takeoffPos.y, this.takeoffPos.z],
          [pos.x, pos.y, pos.z],
        );
        if (gap) {
          this.goals.notifyGap(gap.id, gap.bonus);
          this.score.addTrick({ id: `gap_${gap.id}`, name: gap.name, basePoints: gap.bonus, kind: 'gap' });
        }
      }

      // Tell BalanceSystem we touched down BEFORE deciding the outcome — the revert window
      // is measured from here even when the landing turns out to be a bail.
      this.balance.notifyLanded(this.landedFromTransition, Math.hypot(vel.x, vel.z));

      // A grab still held at touchdown is a bail. That is the whole point of holding it.
      if (this.heldGrabId) {
        this.bail('landing');
      } else if (this.score.isOpen) {
        // Landing badly out of level (steep surface, huge sideways velocity) also bails.
        const sideways = Math.abs(vel.y) > 22;
        if (sideways) {
          this.bail('landing');
        } else {
          // Do NOT bank yet. THPS lets you land into a manual or a revert and keep the
          // position open — that is the entire mechanism by which two features become one
          // line. Banking on the touchdown frame made every combo exactly one trick long.
          this.pendingBankAt = this.simTime + this.LANDING_GRACE;
        }
      }

      if (impactShake > 0.05) {
        this.cameraController.shake(impactShake, 0.2);
      }
      this.postFX?.pulse(Math.min(1, 0.25 + landingIntensity * 0.75));

      this.spinRotation = 0;
      this.cumulativeSpinDegrees = 0;
      this.activeTrick = null;
      this.trickAnimator?.releaseTrick();
      this.hud?.setSpinCounter(0);
    }

    // Update special availability.
    //
    // The meter used to drain the instant it filled, which meant `specialMeter >= 1` was true
    // for exactly one frame and the four special tricks were unreachable in practice. It now
    // holds once full and is spent — either by firing a special, or by bailing.
    this.playerState.hasSpecial = this.specialMeter >= Game.SPECIAL_COST;
    this.controls?.setSpecialReady(this.playerState.hasSpecial);
  }
  
  /**
   * Curbs, ramp lips, stair edges and walls.
   *
   * Rapier will happily let a 0.3 m slab stop a 50 kg capsule dead and hold it there for
   * the rest of the run — a level-design millimetre becomes ninety percent dead time. So
   * the movement model looks ahead itself: anything shorter than a caster's reach is
   * rolled over, and anything taller is glanced off, with the chair banking along the
   * face instead of burying itself in it. A line survives contact with the level.
   */
  private resolveObstacles(dt: number, dir: THREE.Vector3, speed: number, pushing: boolean): boolean {
    const pos = this.physics.getPosition(this.chairBody);
    const wheelY = pos.y - CHAIR_FOOT_OFFSET;

    // Feeler starts a few centimetres above the floor so the floor itself is never a wall,
    // and reaches well past the capsule so contact is seen before the solver reaches it.
    const feelerOrigin = new THREE.Vector3(pos.x, wheelY + 0.06, pos.z);
    const reach = 0.45 + Math.max(0.25, speed * dt * 3);
    const ahead = this.physics.probeDirection(feelerOrigin, dir, reach, this.chairBody);

    let blocked = false;
    let wallNormal: THREE.Vector3 | null = null;

    if (ahead) {
      // How tall is it? Look straight down onto the obstacle just past the contact point.
      const probeAt = new THREE.Vector3(
        ahead.point.x + dir.x * 0.12,
        wheelY + this.STEP_HEIGHT + 0.9,
        ahead.point.z + dir.z * 0.12,
      );
      const down = this.physics.probeDirection(
        probeAt, new THREE.Vector3(0, -1, 0), this.STEP_HEIGHT + 1.4, this.chairBody,
      );
      const topY = down ? probeAt.y - down.distance : Infinity;
      const rise = topY - wheelY;

      if (rise <= this.STEP_HEIGHT) {
        // Roll up it. A caster climbing a kicker lip should cost nothing but a bump.
        if (rise > 0.02) {
          this.physics.setPosition(this.chairBody, new THREE.Vector3(pos.x, pos.y + rise + 0.05, pos.z));
        }
      } else {
        blocked = true;
        wallNormal = new THREE.Vector3(ahead.normal.x, 0, ahead.normal.z);
        if (wallNormal.lengthSq() < 1e-6) wallNormal = null; else wallNormal.normalize();
      }
    }

    // A wall that is simply eating the push, with no ray to explain it (a corner, a prop
    // the feeler slipped past). Track it so the recovery below still fires.
    if (pushing && speed < 1.2) this.pinnedFor += dt;
    else if (!blocked) this.pinnedFor = Math.max(0, this.pinnedFor - dt * 2);

    const pinned = this.pinnedFor >= this.PIN_SECONDS;
    if (!blocked && !pinned) return false;

    // Choose the way out: along the wall if we have a normal, otherwise toward whichever
    // side has more open floor.
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    let slide: THREE.Vector3;
    if (wallNormal && Math.abs(wallNormal.dot(dir)) < 0.985) {
      slide = dir.clone().sub(wallNormal.clone().multiplyScalar(dir.dot(wallNormal)));
      if (slide.lengthSq() < 1e-6) slide = right.clone();
      else slide.normalize();
    } else {
      const probeSide = (s: number) => {
        const o = new THREE.Vector3(pos.x, wheelY + 0.06, pos.z);
        const d = right.clone().multiplyScalar(s);
        const h = this.physics.probeDirection(o, d, 8, this.chairBody);
        return h ? h.distance : 8;
      };
      const openRight = probeSide(1);
      const openLeft = probeSide(-1);
      slide = right.clone().multiplyScalar(openRight >= openLeft ? 1 : -1);
      // Lean the escape slightly away from the wall we are actually touching, so a
      // head-on hit peels off rather than scraping along the face forever.
      if (wallNormal) slide.add(wallNormal.clone().multiplyScalar(0.35)).normalize();
    }

    // Redirect the line immediately — the velocity has to leave the wall this frame or the
    // solver eats it — but bank the chair's yaw across a few frames so it reads as a
    // carve off the obstacle rather than a teleporting handbrake turn.
    dir.copy(slide);

    const targetYaw = Math.atan2(slide.x, slide.z);
    const rot = this.physics.getRotation(this.chairBody);
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(rot);
    const yaw = Math.atan2(f.x, f.z);
    let delta = targetYaw - yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const maxTurn = (pinned ? 9 : 6) * dt;
    this.physics.setRotationY(this.chairBody, yaw + Math.max(-maxTurn, Math.min(maxTurn, delta)));

    if (pinned) {
      // Nothing else has worked for a quarter of a second: shove the chair off the wall so
      // the run continues. A stall is the only outcome a THPS level may never produce.
      const v = this.physics.getVelocity(this.chairBody);
      const kick = Math.max(4.5, this.carriedSpeed * 0.7);
      this.physics.setVelocity(this.chairBody, new THREE.Vector3(slide.x * kick, v.y, slide.z * kick));
      this.carriedSpeed = kick;
      this.pinnedFor = 0;
    }

    return true;
  }

  /**
   * Drive the chair from ControlIntent. Analog turn, hold-charge ollie, and spin from the
   * shoulder buttons instead of the old raw-key booleans.
   */
  private applyMovement(intent: ControlIntent, dt: number): void {
    // Only allow full movement when mounted on chair
    if (!this.isMounted) {
      this.physics.setAngularVelocity(this.chairBody, new THREE.Vector3(0, -intent.turn * 1.5, 0));
      return;
    }

    // THPS-style physics - snappy and responsive. Upgrade multipliers from story mode.
    const jumpImpulse = 12.5 * this.jumpMultiplier;
    const spinTorque = 6 * this.spinMultiplier;
    const cruiseSpeed = this.CRUISE_SPEED * this.speedMultiplier;
    const maxSpeed = this.MAX_SPEED * this.speedMultiplier;

    // +Z is forward (away from camera), matching CameraController expectations
    const chairRotation = this.physics.getRotation(this.chairBody);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(chairRotation);
    const fwdFlat = new THREE.Vector3(forward.x, 0, forward.z);
    if (fwdFlat.lengthSq() < 1e-8) fwdFlat.set(0, 0, 1); else fwdFlat.normalize();

    const velocity = this.physics.getVelocity(this.chairBody);
    const planar = new THREE.Vector3(velocity.x, 0, velocity.z);
    const currentSpeed = planar.length();

    if (this.playerState.isGrounded) {
      // ---- GROUND MOVEMENT MODEL --------------------------------------------------
      // Everything about how a THPS line feels lives in these twenty lines: velocity is
      // steered toward where the chair points WITHOUT losing magnitude (so carving keeps
      // speed), the push eases you up to a cruise rather than to the hard ceiling, and
      // coasting bleeds off slowly enough that the gaps between features stay alive.
      let speed = currentSpeed;
      const rolling = currentSpeed > 0.05 ? planar.clone().divideScalar(currentSpeed) : fwdFlat.clone();
      const goingBackwards = rolling.dot(fwdFlat) < -0.2;
      const heading = goingBackwards ? fwdFlat.clone().negate() : fwdFlat.clone();

      // Grip: rotate the velocity vector toward the heading, magnitude untouched.
      const grip = 1 - Math.exp(-this.GRIP_RATE * dt);
      const dir = rolling.lerp(heading, grip);
      if (dir.lengthSq() < 1e-8) dir.copy(heading); else dir.normalize();

      // Curbs, ramp lips, stair edges and walls, resolved BEFORE the velocity is written
      // so a contact steers the line instead of ending it. `dir` comes back pointing
      // somewhere the chair can actually go.
      const contact = this.resolveObstacles(dt, dir, speed, intent.push);

      // Speed the solver ate on the previous step. A glancing hit should cost you a
      // fraction of your speed and a change of line, not the whole run — this is the
      // difference between a level that punishes exploration and one that rewards it.
      if (this.carriedSpeed > 3.5 && speed < this.carriedSpeed * 0.6) {
        speed = this.carriedSpeed * (contact ? 0.78 : 0.85);
      }

      if (intent.push) {
        // Ease-off accel: full kick from a standstill, nothing left once you are cruising.
        const headroom = Math.max(0, 1 - speed / Math.max(1, cruiseSpeed));
        speed += this.PUSH_ACCEL * (0.25 + 0.75 * headroom) * this.speedMultiplier * dt;

        const now = performance.now();
        if (now - this.lastPushSoundTime > 400) {
          proceduralSounds.playPush();
          this.lastPushSoundTime = now;
        }
      } else if (intent.brake) {
        speed -= 14 * dt;
        if (speed < 0) speed = 0;
      } else {
        // Coast. Tiny constant term so you eventually stop, tiny linear term so the top
        // end settles; between them a 13 m/s coast still reads 10 m/s four seconds later.
        speed -= (this.ROLL_DRAG + this.ROLL_DRAG_K * speed) * dt;
        if (speed < 0) speed = 0;
      }

      // Gravity along the surface: ramps give speed back on the way down and cost on the
      // way up, which is what makes a transfer feel earned.
      if (this.surfaceAngle > 3) {
        const slopeDot = -dir.dot(new THREE.Vector3(this.surfaceNormal.x, 0, this.surfaceNormal.z));
        speed += slopeDot * 16 * dt;
        if (speed < 0) speed = 0;
      }

      if (speed > maxSpeed) speed = maxSpeed;

      // Ride the surface plane rather than skimming over it, so ramps convert speed to air.
      const alongSurface = this.physics.getSurfaceMovementDirection(dir, this.surfaceNormal);
      const newVel = new THREE.Vector3(
        alongSurface.x * speed,
        this.surfaceAngle > 3 ? alongSurface.y * speed : velocity.y,
        alongSurface.z * speed,
      );
      this.physics.setVelocity(this.chairBody, newVel);

      // Remember the speed we are entitled to, so the next contact cannot simply delete it.
      this.carriedSpeed = Math.min(maxSpeed, Math.max(speed, this.carriedSpeed - 9 * dt));
    } else if (intent.brake && currentSpeed > 0.1) {
      // Air brake is deliberately feeble — you commit when you leave the floor.
      const k = Math.max(0, 1 - 1.2 * dt);
      this.physics.setVelocity(
        this.chairBody, new THREE.Vector3(velocity.x * k, velocity.y, velocity.z * k),
      );
    }

    // TURNING — analog, with weight at both ends so the camera has something continuous
    // to follow rather than a step function.
    const turnSpeed = 3.6;      // rad/s, grounded
    const airTurnSpeed = 3.0;   // rad/s, airborne
    const TURN_ACCEL = 18;      // rad/s^2 toward the target rate
    const TURN_DECAY = 14;      // rad/s^2 back to zero on release

    const maxRate = this.playerState.isGrounded ? turnSpeed : airTurnSpeed;
    const targetRate = -intent.turn * maxRate;

    const currentRate = this.physics.getAngularVelocity(this.chairBody).y;
    const rateGap = targetRate - currentRate;
    const accel = Math.abs(targetRate) < 1e-3 ? TURN_DECAY : TURN_ACCEL;
    const maxDelta = accel * dt;
    const newRate = currentRate + Math.max(-maxDelta, Math.min(maxDelta, rateGap));

    this.physics.setAngularVelocity(
      this.chairBody,
      new THREE.Vector3(0, Math.abs(newRate) < 1e-3 ? 0 : newRate, 0)
    );

    // OLLIE — charged while the button is held, fired on release, scaled by the charge.
    // Coyote time still applies so leaving a ledge does not eat the pop.
    const withinCoyoteTime = (this.simTime - this.lastGroundedTime) * 1000 < this.COYOTE_TIME_MS;
    const canJump = this.playerState.isGrounded || withinCoyoteTime;

    if (intent.olliePopped && canJump) {
      proceduralSounds.playJump();
      this.lastGroundedTime = -Infinity;
      this.ollieCharge = Math.max(0.3, intent.ollieCharge || 1);

      // A manual you pop out of ends cleanly; the combo survives.
      if (this.balance.isManualing) this.balance.end();

      const v = this.physics.getVelocity(this.chairBody);
      const newVel = v.clone();
      newVel.y = jumpImpulse * this.ollieCharge;
      newVel.x += fwdFlat.x * 1.5;
      newVel.z += fwdFlat.z * 1.5;
      this.physics.setVelocity(this.chairBody, newVel);
    }

    // HANG TIME — bleed a third of gravity off around the apex. Without it a 30 m/s^2
    // world gives a pop that is over before a trick animation can read, and air tricks
    // are the second half of every line.
    if (this.playerState.isAirborne) {
      const v = this.physics.getVelocity(this.chairBody);
      if (Math.abs(v.y) < 4.5) {
        this.physics.setVelocity(
          this.chairBody, new THREE.Vector3(v.x, v.y + 11 * dt, v.z),
        );
      }
    }

    // SPIN — shoulder buttons, air only.
    if (this.playerState.isAirborne && Math.abs(intent.spin) > 0.05) {
      this.spinRotation = -intent.spin * spinTorque;
      this.physics.applyTorque(this.chairBody, new THREE.Vector3(0, this.spinRotation, 0));
    } else if (this.playerState.isAirborne) {
      this.spinRotation = 0;
    }
  }

  private render(_alpha?: number): void {
    // PostFX owns tone mapping while enabled and falls back to a plain
    // renderer.render() internally if the composer failed to build.
    if (this.postFX) {
      this.postFX.render(this.lastDelta);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private onResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.postFX?.setSize(width, height);
  }
  
  /**
   * Debug: Cycle through all loaded animations to identify them visually
   */
  private debugCycleAnimation(direction: number): void {
    if (!this.playerModel) return;
    
    const animNames: (import('../player/PlayerModel').AnimationName)[] = [
      'idle', 'push', 'standtosit', 'rolling', 'chairhold', 
      'trick', 'jump', 'roll', 'slide', 'crash'
    ];
    
    this.debugAnimIndex = (this.debugAnimIndex + direction + animNames.length) % animNames.length;
    const animName = animNames[this.debugAnimIndex];
    
    console.log(`🎬 DEBUG: Playing animation [${this.debugAnimIndex}] "${animName}"`);
    this.playerModel.play(animName, { loop: true, fadeTime: 0.1 });
    
    // Lock animation for 5 seconds so we can see it
    this.debugAnimLockUntil = Date.now() + 5000;
    
    // Show on screen
    const debugDiv = document.getElementById('debug-anim') || (() => {
      const d = document.createElement('div');
      d.id = 'debug-anim';
      d.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#0f0;padding:10px 20px;font-family:monospace;font-size:18px;z-index:9999;border-radius:5px;';
      document.body.appendChild(d);
      return d;
    })();
    debugDiv.textContent = `Animation: ${animName} (locked 5s)`;
  }
  
  /**
   * Check if debug animation lock is active
   */
  private isDebugAnimLocked(): boolean {
    return Date.now() < this.debugAnimLockUntil;
  }
}
