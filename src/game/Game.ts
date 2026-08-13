/**
 * Main Game class
 * Orchestrates all game systems
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import { InputManager } from '../input/InputManager';
import { THPSControls, type ControlIntent } from '../input/THPSControls';
import { PhysicsWorld, CHAIR_FOOT_OFFSET, CHAIR_RADIUS } from '../physics/PhysicsWorld';
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
import { HUD, minimapFootprints } from '../ui/HUD';
import { PlayerModel } from '../player/PlayerModel';
import { proceduralSounds } from '../audio/ProceduralSounds';
import { soundManager } from '../audio/SoundManager';
import { GrindParticles } from '../effects/GrindParticles';
import { LandingParticles } from '../effects/LandingParticles';
import { SpeedLines } from '../effects/SpeedLines';
import { LevelData, LevelObject, getLevelById } from '../levels/LevelData';
import { EnvironmentRig, type EnvPreset } from '../rendering/Environment';
import { PostFX } from '../rendering/PostFX';
import { MaterialLibrary } from '../materials/MaterialLibrary';
import { configureFromRenderer, warmup } from '../materials/ProceduralTextures';
import { buildOfficeInterior, disposeOfficeInterior, officeMoverY, type OfficeInterior, type OfficeMover } from '../world/OfficeLevel';
import { batchStaticLevelObjects, makeFilingCabinet, makeGrindRail, makeKickerRamp, makePrinter, makeTrashCan, makeWaterCooler } from '../world/OfficeProps';
import { buildOfficeChair, spinCasters, type ChairParts } from '../world/ChairModel';
import { storyProgress, getStoryLevelById, StoryLevelData, StoryCheckpoint } from '../story';
import { ChaseMechanic, ChaseState } from '../story/ChaseMechanic';
import { ChaseHUD } from '../ui/ChaseHUD';
import { DialogueBox } from '../ui/DialogueBox';

const DEG2RAD = Math.PI / 180;

/** Shortest signed representation of an angle, in (-pi, pi]. */
function wrapPi(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

/**
 * The chair's heading in world space, from a quaternion, as the angle whose forward is
 * (sin, 0, cos) — the same convention PhysicsWorld.setRotationY writes.
 *
 * Reading `object.rotation.y` instead is a trap that cost this game several bugs. THREE's
 * default 'XYZ' Euler decomposition of a pure yaw q folds the angle into [-pi/2, pi/2]:
 * for any |yaw| > 90 degrees it reports (pi, pi - yaw, pi), which is the SAME rotation but
 * a different number, mirrored about the X axis and running the other way. Anything that
 * read it — the minimap arrow, the checkpoint heading, the air-spin counter — was right on
 * one half of the compass and mirrored on the other.
 */
function yawOf(q: THREE.Quaternion | { x: number; y: number; z: number; w: number }): number {
  return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
}

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
  // --- ollie feel ------------------------------------------------------------------
  /**
   * Grace after the wheels leave the floor during which a pop still fires. Deliberately
   * NOT a frame multiple: at 150 the window boundary landed exactly on frame 9, so which
   * side of it a press fell on was decided by float accumulation in simTime and the same
   * input could pop or not pop. 110ms sits 10ms clear of frame 6 and 6.7ms clear of frame
   * 7, so the answer is the same every time — five forgiven frames, enough that rolling
   * off a desk lip a hair early still pops, short enough that the chair is never visibly
   * jumping out of mid-air.
   */
  private readonly COYOTE_TIME_MS = 110;
  /**
   * Contact grace for STARTING a trick (manual/nose-manual) rather than for popping. It
   * used to be spelled `COYOTE_TIME_MS * 2`, which silently tied the manual entry window
   * to the ollie's forgiveness; they are different questions and are now tuned apart.
   */
  private readonly TRICK_CONTACT_GRACE_MS = 300;
  /** A pop pressed this long before touchdown is remembered and fired on contact. */
  private readonly OLLIE_BUFFER_MS = 170;
  /** Upward acceleration applied while the ollie button stays held after the pop. */
  private readonly OLLIE_LIFT = 11;
  /** How long that lift lasts — the cap beyond which holding buys nothing more. */
  private readonly OLLIE_LIFT_SECONDS = 0.45;
  /**
   * The floor of vertical speed a pop guarantees ON TOP of whatever the chair already had.
   * `Math.max(v.y, impulse)` alone made a pop off a ramp lip, or inside the coyote window
   * while still rising, a literal no-op: the button was consumed and nothing happened.
   * Same input, different hop — the one thing an ollie may never be.
   */
  private readonly OLLIE_MIN_GAIN = 3;
  /**
   * A press this soon after a pop cannot pop again. Longer than COYOTE_TIME_MS, so it
   * covers the whole window in which a fresh press could have found the wheels still
   * nominally in contact; a real second ollie needs a landing, which is 700ms away.
   */
  private readonly OLLIE_REPOP_LOCKOUT_MS = 120;
  // --- hang time -------------------------------------------------------------------
  // Gravity is bled off around the apex so a pop lasts long enough to read a trick. This
  // was a hard band (|v.y| < 4.5 -> full assist) and the hard edge was a real defect: the
  // hold-for-height lift and this assist are both +OLLIE_LIFT, so a lift frame that
  // pushed v.y from just under 4.5 to exactly 4.5 bought the extra speed and lost the
  // assist in the same step, for a net gain of zero. Holding one frame longer measurably
  // did nothing at 5, 7, 10, 13 and 15 frames of hold. The assist is now a continuous
  // ramp — full below FULL, fading to nothing at FADE — and no step for the charge curve
  // to fall into. Widths chosen so the integrated assist (3.2 full + half of 3.3 fading =
  // 4.85) is a shade stronger than the old 4.5-wide switch, which holds the airtime of a
  // pop where it was rather than paying for the smoothing out of the player's hang time.
  private readonly HANG_ACCEL = 11;
  private readonly HANG_FULL_SPEED = 3.2;
  private readonly HANG_FADE_SPEED = 6.5;
  
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
  /** Moving platforms published by the office floorplate (the lift). Rebuilt per level load. */
  private officeMovers: { spec: OfficeMover; body: RAPIER.RigidBody }[] = [];
  private officeMoverTime = 0;
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
  // The merged draw-call batch for the static half of `levelObjects`. Held separately because
  // it must be removed on teardown but must NOT reach `minimapFootprints`, which would draw
  // one level-wide rectangle over the whole map. See OfficeProps.batchStaticLevelObjects.
  private levelBatch: THREE.Object3D | null = null;

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
  /** simTime of a pop pressed while there was no floor to push off. Fires on touchdown. */
  private ollieBufferedAt = -Infinity;
  /** One coyote-window pop per airborne period, so the grace can never become a double jump. */
  private ollieCoyoteUsed = false;
  /** simTime of the last pop applyMovement fired, for the re-pop lockout. */
  private lastOlliePopAt = -Infinity;
  /** Seconds of hold-to-go-higher lift still owed to the current pop. */
  private ollieLiftLeft = 0;
  /** simTime of the step on which the grind path already spent this frame's pop. */
  private olliePopHandledAt = -Infinity;
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
  /** Steering state: the yaw rate the model wants, and the rate actually commanded. */
  private turnRate = 0;
  private turnCommand = 0;
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
  private lastAirYaw = 0;  // Chair heading last air frame, for the spin accumulator
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

  // ---- TRANSITIONS ------------------------------------------------------------------
  //
  // A transition is a surface steep enough that riding it is CLIMBING rather than rolling.
  // Everything below exists because a quarter pipe used to do none of the four things a
  // quarter pipe is for: it did not turn the chair to face up the wall, it did not let go
  // at the lip along the exit tangent, it gave no float at the apex, and dropping back in
  // cost you the run instead of paying you speed.
  /** Surface angle, degrees, above which a slope is treated as a transition. */
  private readonly TRANSITION_ANGLE = 12;
  /**
   * Effective gravity ALONG a slope, m/s^2, against the world's 30. Skate games are
   * generous here on purpose: at the real figure a 13.5 m/s cruise cannot clear a 3 m
   * transition at all, and every quarter pipe becomes a wall you stall on.
   */
  private readonly SLOPE_GRAVITY = 18;
  /**
   * Ceiling on the launch angle off a lip. The exit tangent at the coping is 90 degrees —
   * dead vertical — and honouring that exactly gives a pogo stick: you go straight up, come
   * straight back down the same line, and nothing you do in the air can change where you
   * land. Holding a little forward speed back is what makes air control mean something and
   * what lets a big one clear the deck instead of falling back in.
   */
  private readonly TRANSITION_MAX_LAUNCH = 74;
  /** How much of a transition launch survives as float. Ramped like the ollie's hang. */
  private readonly TRANSITION_HANG_ACCEL = 10;
  private readonly TRANSITION_HANG_FADE = 10;
  /** Fraction of the speed a drop-in carries into the transition. Under 1: not a trampoline. */
  private readonly TRANSITION_LANDING_KEEP = 0.94;
  /** Surface angle on the frame BEFORE this one — the take-off frame has already lost it. */
  private lastSurfaceAngle = 0;
  /** 0..1, how much of a transition the last take-off was. Drives the extra hang time. */
  private transitionLaunch = 0;
  /** sin(slope along travel) while grounded: + climbing, - descending. Visual pitch source. */
  private surfaceClimb = 0;
  /** Smoothed visual pitch of the chair on a transition and in the air, radians. */
  private ridePitch = 0;

  // ---- THPS ground feel -------------------------------------------------------------
  /** Monotonic simulated seconds. The only clock gameplay is allowed to read. */
  private simTime = 0;
  /** Comfortable cruise the push alone will carry you to. */
  private readonly CRUISE_SPEED = 13.5;
  /** Hard ceiling; only ramps, grind pops and downhills get you here. */
  private readonly MAX_SPEED = 20;
  /** Push acceleration at a standstill, m/s^2. Eases off toward CRUISE_SPEED. */
  private readonly PUSH_ACCEL = 16;
  /**
   * Rolling resistance while coasting, m/s^2. Deliberately tiny — coasting is the game.
   * The constant term is what eventually brings a stationary-ish chair to rest; the
   * speed-proportional term below is what sets where a free coast settles. Together they
   * cost a 13 m/s cruise about a quarter of its speed over three and a half seconds,
   * which is the THPS-ish "you can still set up the next feature" budget.
   */
  private readonly ROLL_DRAG = 0.42;
  /** Extra drag proportional to speed, 1/s. Sets where a free coast settles. */
  private readonly ROLL_DRAG_K = 0.035;
  /** How fast velocity is redirected to the way the chair points, 1/s. Carving keeps speed. */
  private readonly GRIP_RATE = 9.0;
  /**
   * Facing-follows-travel recovery. A chair whose velocity has been knocked more than
   * REALIGN_ANGLE off its nose is not carving, it is sliding — and there is no input that
   * asks for that, so the chair turns to face where it is going at REALIGN_RATE until the
   * misalignment is back inside the threshold. 60 degrees is comfortably outside the ~16
   * degrees a full-lock carve lags by, so steering never wakes it, and the rate is a
   * spin-out recovery the player can read rather than a snap — doubled for an outright
   * reversal, which is an emergency and should be over before it can be watched.
   */
  private readonly REALIGN_ANGLE = Math.PI / 3;
  private readonly REALIGN_RATE = 9.0;
  /**
   * Drag while travelling backwards, 1/s, on top of the constant term. Being dragged
   * backwards on casters is not a mode of travel, it is a scrub: a full-speed bounce
   * loses about a tenth of what is left every frame, so the worst hit in the game is
   * down to walking pace by the time the chair has finished turning to face its line.
   */
  private readonly REVERSE_SCRUB = 6.0;
  /**
   * Below this the heading is noise — a chair at rest has no travel direction. Kept low
   * deliberately: a chair rolling backwards at walking pace is still rolling backwards,
   * and it is the slow ones a player has time to sit and watch.
   */
  private readonly REALIGN_MIN_SPEED = 0.9;
  /** Tallest obstacle the casters will roll up instead of stopping dead. */
  private readonly STEP_HEIGHT = 0.42;
  /** Seconds of being stopped-while-pushing before the chair is treated as pinned. */
  private readonly PIN_SECONDS = 0.25;
  private pinnedFor = 0;
  /** Speed the player has earned and is entitled to keep across a contact. */
  private carriedSpeed = 0;
  /** Speed a possible crash was entered at, and how many frames are left to confirm it. */
  private collisionSuspectSpeed = 0;
  private collisionSuspectFrames = 0;
  /** Sim time at which a landing banks its position, unless the player saves it first. */
  private pendingBankAt = 0;
  /**
   * How long after touchdown a manual, revert or the next feature may still rescue the combo.
   *
   * This is NOT an independent number: it is the combo window itself. A fixed 0.4 s here was a
   * second, shorter combo clock racing the real one, and it always won — harness instrumentation
   * showed every combo in a 24 s run closing on an explicit land() 0.6-0.7 s after the rail ended,
   * never on a lapsed combo clock, while the measured gap between features runs to 1.35 s. One
   * clock, owned by ScoreSystem, tuned against measured feature spacing.
   */
  private get LANDING_GRACE(): number {
    return this.score.comboWindowSeconds;
  }

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
      soundManager.init();
      
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
    // Boom collision: the camera asks the physics world whether a wall is between it and
    // the rider. Deferred through a closure because physics/chairBody do not exist yet.
    this.cameraController.setOcclusionProbe((origin, dir, maxDist) =>
      this.physics?.probeDirection(origin, dir, maxDist, this.chairBody)?.distance ?? null);
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
        this.cameraController.startBail();
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
    // Cold white snap on every trick that registers — distinct from bank (green, rising)
    // and bail (red, falling), so the outcome is legible without reading the HUD.
    if (this.chair) this.landingParticles?.trickPop(this.chair.position, Math.min(1, def.basePoints / 900));
    this.activeTrick = { id: def.id, kind, name: def.displayName, until: performance.now() + duration };
    // MILLISECONDS. `duration` is already in ms (TrickRegistry's unit) and playTrick converts;
    // passing `duration / 1000` here converted twice, so a 400 ms trick ran for 0.4 ms — the
    // envelope finished inside the frame it started and released, which is why not one of the
    // per-trick pose signatures had ever been seen on screen.
    this.trickAnimator?.playTrick(def.id, kind, duration);
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
    const banked = this.score.unrealised;
    this.score.land();
    // Banking a position reads GREEN and RISING — the visual opposite of a bail.
    if (this.chair) this.landingParticles?.bank(this.chair.position, Math.min(1, banked / 4000));
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
    // Red, downward, floor-slapping: the visual grammar of losing the position.
    if (pos) this.landingParticles?.bailFlash(pos);

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

    // Material-specific impact. The score event already fires the trick sting.
    proceduralSounds.playSmash(e.debrisKind, e.impulse);
    this.cameraController.shake(Math.min(0.35, 0.06 + e.impulse * 0.002), 0.18);
  }

  private onSquadEvent(e: SquadEvent): void {
    switch (e.type) {
      case 'spotted':
        this.goals?.setPursuit(true);
        proceduralSounds.playPoliceWhistle();
        break;
      case 'lost':
        if (this.police && !this.police.inPursuit) this.goals?.setPursuit(false);
        proceduralSounds.playPoliceLost();
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
    this.paperStorm = new PaperStorm(this.scene, { maxSheets: 520, groundY: 0 });

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
    this.checkpointRotation = yawOf(this.chair.quaternion);
    
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
      // See loadLevel: the speed entitlement has to go with the velocity, or the restore
      // launches the player out of the checkpoint at the speed they crashed at.
      this.carriedSpeed = 0;
      this.pinnedFor = 0;

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
      // Sparks come off the real caster contact patches, not off a single point.
      this.grindParticles?.setChairSource(parts.root, parts.wheelContactPoints);
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
    soundManager.startMusic();
    requestAnimationFrame(this.loop.bind(this));
  }
  
  pause(): void {
    this.isPaused = true;
    // Silence wheel roll when paused
    proceduralSounds.updateWheelRoll(0, false);
    soundManager.stopMusic();
  }
  
  resume(): void {
    this.isPaused = false;
    this.lastTime = performance.now(); // Reset to avoid time jump
    soundManager.startMusic();
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
    const spawnPos = this.resolveSpawnHeight(
      new THREE.Vector3(spawn.position[0], spawn.position[1], spawn.position[2]),
    );
    if (this.chairBody) {
      this.physics.setPosition(this.chairBody, spawnPos);
      this.physics.setVelocity(this.chairBody, new THREE.Vector3(0, 0, 0));
      this.physics.setRotationY(this.chairBody, spawn.rotation * Math.PI / 180);
      // Zeroing the body is not enough: carriedSpeed is the speed the player is ENTITLED
      // to, and applyMovement hands 93% of it back the moment actual speed falls below
      // 85% of it. Left standing across a level load it fires from a dead stop and shoots
      // the chair off the spawn at the speed of the run before it. loadCustomLevel()
      // already clears it; this path did not. Measured: hard stop at 11.99 -> 11.14 one
      // frame later, out of nothing.
      this.carriedSpeed = 0;
      this.pinnedFor = 0;
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
    this.hud?.setMinimapLayout(minimapFootprints(this.levelObjects));
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
    // 110 sheets over a 30 m disc is 0.04 sheets/m2 — the player crossed one every few
    // seconds and the wake had nothing to pick up. Tighter disc, denser scatter.
    const radius = Math.min(26, Math.max(14, (level.groundSize ?? 60) * 0.22));
    this.paperStorm.addFloorLitter(new THREE.Vector3(spawnPos.x, 0, spawnPos.z), radius, 420);
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
    if (this.levelBatch) {
      this.scene.remove(this.levelBatch);
      this.levelBatch.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.geometry) m.geometry.dispose();
      });
      this.levelBatch = null;
    }

    this.clearCollectibles();

    // The office floorplate owns real geometry; free it rather than leaking it.
    this.officeMovers = [];
    this.officeMoverTime = 0;
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
    const placed: THREE.Object3D[] = [];
    for (const objData of regularObjects) {
      const mesh = this.createLevelObject(objData);
      if (mesh) {
        this.scene.add(mesh);
        this.levelObjects.push(mesh);
        placed.push(mesh);
      }
    }

    // ...then collapse the static ones into a single per-material batch. Ten props built one
    // at a time were 28 visible meshes and ~84 draw calls a frame; they are authored where
    // they stand and never move, so they have no business costing a draw call each. The
    // sources stay in `levelObjects` (detached, geometry intact) so the minimap footprints
    // and teardown below are unaffected.
    this.levelBatch = batchStaticLevelObjects(placed, this.scene);
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
   * Build the office floor plan: hallways, break room, boardroom, cubicle farm, server room,
   * corner offices, a stair set and a working lift up to a mezzanine deck over the north half.
   * Static geometry is merged per material by OfficeLevel, so this is ~30 draw calls.
   *
   * `height` is the UPPER ceiling now — the south half of the plate is a double-height atrium
   * and the mezzanine deck sits at 4.20 m inside it. See src/world/OfficeLevel.ts.
   */
  private buildOfficeFloorplate(): void {
    const interior = buildOfficeInterior({
      width: 46,
      depth: 46,
      height: 8.0,
      seed: 20260813,
      lightBudget: 8,
      // The level data owns the spine and cross-arm props (floor rails, kickers, fun box);
      // keep the floorplate's own perimeter dressing off them.
      keepClear: [
        { minX: -6.0, maxX: 6.0, minZ: -21.5, maxZ: -5.0 },
        { minX: -6.0, maxX: 6.0, minZ: 5.0, maxZ: 21.5 },
        { minX: 6.5, maxX: 19.0, minZ: -4.6, maxZ: -0.6 },
        { minX: -19.0, maxX: -6.5, minZ: 0.6, maxZ: 4.6 },
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

    // The lift. One kinematic-position body per mover; OfficeLevel owns the motion curve
    // (officeMoverY) so the whole animation lives with the level that authored it.
    this.officeMovers = interior.movers.map((spec) => ({
      spec,
      body: this.physics.createKinematicBox(
        new THREE.Vector3(spec.x + spec.offset.x, officeMoverY(spec, 0) + spec.offset.y, spec.z + spec.offset.z),
        spec.halfExtents,
      ),
    }));

    // Floor collider + out-of-bounds walls.
    this.physics.createGround(interior.size.width / 2);

    console.log(
      `[OfficeLevel] ${interior.triangles} tris, ${interior.colliders.length} colliders, ` +
      `${interior.rails.length} grind edges, ${interior.lights.length} point lights, ` +
      `${interior.movers.length} movers`
    );
  }

  /** Drive the office lift. Called from fixedUpdate so the platform is reproducible. */
  private updateOfficeMovers(dt: number): void {
    if (!this.officeMovers.length) return;
    this.officeMoverTime += dt;
    for (const m of this.officeMovers) {
      const y = officeMoverY(m.spec, this.officeMoverTime);
      m.spec.object.position.y = y;
      this.physics.setKinematicTarget(
        m.body,
        new THREE.Vector3(m.spec.x + m.spec.offset.x, y + m.spec.offset.y, m.spec.z + m.spec.offset.z),
      );
    }
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
        // DELIBERATELY PROCEDURAL, and deliberately not the qtr-pipe-*.glb models. The
        // collider is generated from this mesh's own vertices; an art asset whose curve we
        // cannot read would put us straight back to a mesh that disagrees with what the
        // player rides, which is the whole defect being fixed here.
        const qpRadius = data.type === 'quarter_pipe_small' ? 2.0
          : data.type === 'quarter_pipe_large' ? 4.2 : 3.0;
        const qpWidth = data.type === 'quarter_pipe_small' ? 5
          : data.type === 'quarter_pipe_large' ? 9 : 7;
        const qpWorld = {
          x: data.position[0], z: data.position[2],
          yaw: (data.rotation?.[1] || 0) * Math.PI / 180,
        };
        mesh = this.createQuarterPipeMesh(concreteMaterial, qpRadius, qpWidth, 1.4, qpWorld);
        break;
      }

      case 'half_pipe': {
        const width = (data.params?.width as number) || 15;
        const length = (data.params?.length as number) || 20;
        mesh = this.createHalfPipeMesh(concreteMaterial, width, length, {
          x: data.position[0], z: data.position[2],
          yaw: (data.rotation?.[1] || 0) * Math.PI / 180,
        });
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
  
  // ---- TRANSITIONS ------------------------------------------------------------------
  //
  // THE ARC WAS UPSIDE DOWN. Every quarter pipe and half pipe in this game was cut from
  // the profile `(x, y) = (r - r·cos a, r·sin a)`. At a = 0 that curve is VERTICAL and at
  // a = π/2 it is HORIZONTAL — it is a hump, the convex outside of a roll, not a
  // transition. You could not ride up it because it started as a wall.
  //
  // A transition is the other half of the circle: flat where it meets the floor, vertical
  // at the coping. Centre the circle at (z = 0, y = r) and walk it:
  //
  //     z = r·sin a          a = 0    -> (0, 0)   tangent horizontal, meets the floor
  //     y = r·(1 - cos a)    a = π/2  -> (r, r)   tangent vertical, this is the coping
  //
  // The solid is the material OUTSIDE that circle: the corner under the curve, plus a flat
  // deck behind the coping to land on and roll out over. Local +Z is up the transition and
  // local X is the width, so a transition uses the same yaw convention as everything else.
  //
  // Both the visual geometry and the physics collider come out of this one function, and
  // the collider is fed the mesh's OWN vertices — the two cannot drift apart, which is the
  // failure the old quarter pipe embodied (curved mesh, cuboid collider).
  private static readonly QP_SEGMENTS = 14;

  /**
   * The extruded solid for one transition. Returns geometry in local space (ride direction
   * +Z, width centred on X, floor at y = 0) plus the numbers the caller needs to dress it:
   * where the coping sits and how deep the whole footprint is.
   */
  private buildTransitionSolid(radius: number, width: number, deck: number): {
    geometry: THREE.BufferGeometry;
    vertices: Float32Array;
    indices: Uint32Array;
    copingZ: number;
    copingY: number;
    footprint: number;
  } {
    const seg = Game.QP_SEGMENTS;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    for (let i = 1; i <= seg; i++) {
      const a = (i / seg) * Math.PI / 2;
      shape.lineTo(radius * Math.sin(a), radius * (1 - Math.cos(a)));
    }
    shape.lineTo(radius + deck, radius);   // deck, flat, behind the coping
    shape.lineTo(radius + deck, 0);        // back wall
    shape.lineTo(0, 0);                    // floor

    const geometry = new THREE.ExtrudeGeometry(shape, { steps: 1, depth: width, bevelEnabled: false });
    // ExtrudeGeometry lays the profile in XY and extrudes along +Z. Put the width on X and
    // the profile on Z instead, centred across the width and with the toe of the
    // transition at the local origin.
    geometry.translate(0, 0, -width / 2);
    geometry.rotateY(-Math.PI / 2);
    geometry.computeVertexNormals();

    const posAttr = geometry.getAttribute('position');
    const vertices = new Float32Array(posAttr.array as ArrayLike<number>);
    const idx = geometry.getIndex();
    const indices = idx
      ? new Uint32Array(idx.array as ArrayLike<number>)
      : new Uint32Array(Array.from({ length: posAttr.count }, (_, i) => i));

    return {
      geometry, vertices, indices,
      copingZ: radius, copingY: radius, footprint: radius + deck,
    };
  }

  /**
   * A dressed transition: the solid, a steel coping tube along the lip, and a scuff line
   * where every caster in the building has hit the same spot on the curve.
   */
  private createTransitionMesh(
    material: THREE.Material, radius: number, width: number, deck: number,
  ): { group: THREE.Group; vertices: Float32Array; indices: Uint32Array; copingZ: number; copingY: number } {
    const solid = this.buildTransitionSolid(radius, width, deck);
    const group = new THREE.Group();

    const body = new THREE.Mesh(solid.geometry, material);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Coping. Sits proud of the lip like real coping does, so the eye can find the launch
    // point from across the room — you cannot aim at a transition whose top edge you
    // cannot see.
    const coping = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, width, 10),
      MaterialLibrary.get('grindMetal'),
    );
    coping.rotation.z = Math.PI / 2;
    coping.position.set(0, solid.copingY + 0.03, solid.copingZ - 0.02);
    coping.castShadow = true;
    group.add(coping);

    return {
      group,
      vertices: solid.vertices,
      indices: solid.indices,
      copingZ: solid.copingZ,
      copingY: solid.copingY,
    };
  }

  /**
   * Spawn one transition. The MESH goes into `parent` at a local offset (createLevelObject
   * applies the object's own position and yaw to the parent afterwards); the COLLIDER and
   * the coping grind edge have to be placed in world space themselves, so `world` carries
   * the object's authored placement.
   *
   * `localYaw` is the direction the transition RISES in, in the parent's frame.
   */
  private addTransition(
    parent: THREE.Object3D, material: THREE.Material,
    localOrigin: THREE.Vector3, localYaw: number,
    world: { x: number; z: number; yaw: number },
    radius: number, width: number, deck: number,
  ): void {
    const t = this.createTransitionMesh(material, radius, width, deck);
    t.group.position.copy(localOrigin);
    t.group.rotation.y = localYaw;
    parent.add(t.group);

    // Local -> world. A yaw of θ about +Y maps local (x, z) to
    // (x·cosθ + z·sinθ, −x·sinθ + z·cosθ); the same mapping puts the coping where the
    // player will actually meet it.
    const cw = Math.cos(world.yaw);
    const sw = Math.sin(world.yaw);
    const toWorld = (lx: number, ly: number, lz: number) => new THREE.Vector3(
      world.x + lx * cw + lz * sw,
      ly,
      world.z - lx * sw + lz * cw,
    );
    const worldYaw = world.yaw + localYaw;
    this.physics.createStaticTrimesh(
      toWorld(localOrigin.x, localOrigin.y, localOrigin.z), t.vertices, t.indices,
      new THREE.Euler(0, worldYaw, 0),
    );

    // Coping grind edge. Runs across the width at the lip, in world space.
    const cy = Math.cos(worldYaw);
    const sy = Math.sin(worldYaw);
    const lipWorld = (lx: number) => {
      const px = localOrigin.x + (lx * cy + t.copingZ * sy);
      const pz = localOrigin.z + (-lx * sy + t.copingZ * cy);
      return toWorld(px, localOrigin.y + t.copingY + 0.06, pz);
    };
    this.grindSystem.addRail(
      lipWorld(-width / 2), lipWorld(width / 2),
      `coping_${world.x.toFixed(1)}_${world.z.toFixed(1)}_${worldYaw.toFixed(2)}`,
      t.group,
    );
  }

  /**
   * A free-standing quarter pipe, centred on its authored position.
   *
   * `rotation` is the direction the transition FACES — the side you ride in from — which
   * is the convention the existing levels were authored against (the garage's pipes sit at
   * x = ±40 facing the middle of the room, and now actually work that way).
   */
  private createQuarterPipeMesh(
    material: THREE.Material, radius: number, width: number, deck: number,
    world: { x: number; z: number; yaw: number },
  ): THREE.Group {
    const group = new THREE.Group();
    // Rises AWAY from the side it faces, and centred so the authored position is the
    // middle of the footprint rather than the toe.
    const half = (radius + deck) / 2;
    const localOrigin = new THREE.Vector3(0, 0, half);
    this.addTransition(group, material, localOrigin, Math.PI, world, radius, width, deck);
    return group;
  }

  /**
   * A half pipe: two transitions facing each other across a flat, with the flat wide enough
   * to build speed on and pump across. `width` is the whole span wall to wall (so the flat
   * is what is left after two footprints), `length` is how far it runs.
   *
   * The old version had NO COLLIDER AT ALL — the two curved meshes were decoration and the
   * player rolled straight through them across bare floor. That is the literal reason
   * "halfpipes don't work how halfpipes should": there was no halfpipe, only a picture of
   * one.
   */
  private createHalfPipeMesh(
    material: THREE.Material, width: number, length: number,
    world: { x: number; z: number; yaw: number },
  ): THREE.Group {
    const group = new THREE.Group();
    const deck = 1.4;
    // Keep at least 5 m of flat between the toes whatever the authored width, and never a
    // wall taller than the span can carry.
    const radius = Math.max(1.4, Math.min(3.2, (width - 5) / 2 - deck));
    const flat = Math.max(1, width - 2 * (radius + deck));
    const toe = flat / 2;

    // Ride direction is across the width (local X), so each transition rises outward from
    // the edge of the flat and the whole thing still spans exactly `width`.
    this.addTransition(group, material, new THREE.Vector3(-toe, 0, 0), -Math.PI / 2,
      world, radius, length, deck);
    this.addTransition(group, material, new THREE.Vector3(toe, 0, 0), Math.PI / 2,
      world, radius, length, deck);

    const floor = new THREE.Mesh(new THREE.BoxGeometry(flat, 0.1, length), material);
    floor.position.set(0, 0.05, 0);
    floor.receiveShadow = true;
    group.add(floor);

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
    soundManager.shutdown();
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
      // Same response curve as the speed streaks, so lens and streaks ramp together.
      this.postFX.setSpeed(this.speedLines ? this.speedLines.getBlurDrive() : Math.max(0, Math.min(1, speed / 22)));
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

    // Moving platforms step BEFORE the player's ground test, so a rider on the lift is
    // resolved against where the platform is this frame, not where it was last frame.
    this.updateOfficeMovers(dt);

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
      this.chair.rotateY(this.spinRotation * dt);
    }

    // The rigid body is Y-locked, so BalanceSystem's pitch/roll go on the visual group.
    const bal = this.balanceState;
    if (this.chairTilt) {
      const pitchRad = bal ? bal.pitchDegrees * DEG2RAD : 0;
      const rollRad = bal ? bal.rollDegrees * DEG2RAD : 0;

      // ---- TRANSITION PITCH -----------------------------------------------------------
      // "The player should rotate as they go up the ramp." The chair used to ride a
      // transition perfectly level, sliding up a wall like a fridge magnet, because the
      // rigid body is Y-locked and nothing else ever wrote a pitch. So the pitch is driven
      // here, off the same two things the physics is using:
      //
      //   GROUNDED  the slope along travel. Nose follows the surface up the curve, and
      //             follows it back down on the way in.
      //   AIRBORNE  the velocity vector. Leave the lip pointing up, rotate through level at
      //             the apex, and be pointing down the way you are going to land — which is
      //             both what a skater does and what tells the player where they will land.
      //
      // Rotating +X pitches the nose (+Z) DOWN, hence the negation. Smoothed with an
      // exponential approach so the seams between collider triangles never show, and
      // capped so the chair never reads as somersaulting.
      let target = 0;
      if (this.playerState.isGrounded) {
        target = -Math.asin(Math.max(-1, Math.min(1, this.surfaceClimb)));
      } else {
        const av = this.physics.getVelocity(this.chairBody);
        const planarV = Math.hypot(av.x, av.z);
        target = -Math.atan2(av.y, Math.max(2.5, planarV)) * 0.7;
      }
      const CAP = 1.15;   // ~66 degrees
      target = Math.max(-CAP, Math.min(CAP, target));
      this.ridePitch += (target - this.ridePitch) * (1 - Math.exp(-11 * dt));

      this.chairTilt.rotation.x = pitchRad + this.ridePitch;
      this.chairTilt.rotation.z = rollRad;
    }

    // ---- 9. SCORE TICK ----------------------------------------------------------------
    this.score.setAirborne(this.playerState.isAirborne);
    // Air rotation feeds the spin scorer, which turns it into 180/360/540 entries itself.
    if (this.playerState.isAirborne) {
      const yawNow = yawOf(this.chair.quaternion);
      this.score.addSpin(yawDeltaDegrees(this.lastYaw, yawNow));
      this.lastYaw = yawNow;
    } else {
      this.lastYaw = yawOf(this.chair.quaternion);
    }
    this.score.update(dt);
    this.hud?.setScore(this.score.balance);

    // ---- 10. CAMERA + FEEDBACK --------------------------------------------------------
    this.cameraController.update(dt);

    const currentVel = this.physics.getVelocity(this.chairBody);
    const currentSpeed = new THREE.Vector3(currentVel.x, 0, currentVel.z).length();

    // High-speed collision: a big loss of speed with a combo open is a crash — but only when the
    // speed STAYS gone. Judged on a single frame this fired on transients that were not crashes
    // at all: a caster clipping a step, and any frame on which the rigid body's velocity is not
    // the authority (GrindSystem drives the chair along the rail and skips physics.step, so the
    // body reads ~0). Harness instrumentation of a 24 s run caught four of these, each one
    // forfeiting the entire line — three were phantoms (one sampled 14.9 -> 5.6 -> 13.0 m/s in
    // 100 ms, one fired mid-grind at a rock-steady 15 m/s). Require the loss to persist for
    // ~100 ms and never judge it while grinding.
    const grindingNow = this.grindSystem.isGrinding() || this.playerState.isGrinding;
    if (this.collisionSuspectFrames > 0) {
      if (grindingNow || currentSpeed >= this.collisionSuspectSpeed * 0.55) {
        this.collisionSuspectFrames = 0;          // it came back: not a crash
      } else if (--this.collisionSuspectFrames === 0) {
        if (this.playerState.isGrounded && this.score.isOpen && this.bailRecovery <= 0) {
          this.bail('collision');
        }
      }
    } else if (!grindingNow && this.prevSpeed > 9 && currentSpeed < this.prevSpeed * 0.45
               && this.playerState.isGrounded && this.score.isOpen && this.bailRecovery <= 0) {
      this.collisionSuspectSpeed = this.prevSpeed;
      this.collisionSuspectFrames = 6;
    }
    this.prevSpeed = currentSpeed;

    // One audio sample point per frame. The director drives the roll bed, the
    // grind bed, the combo riser, the chase tension and the music arrangement.
    // Surface hardness: the office floor is carpet; desks, ledges and any real
    // transition are hard laminate/concrete. One scalar, crossfaded in the mix.
    const surfaceHardness = Math.min(1,
      Math.max(0, (this.chair.position.y - 0.85) / 0.6) + (this.surfaceAngle > 14 ? 0.55 : 0));
    soundManager.update(dt, {
      speed: currentSpeed,
      rolling: this.playerState.isGrounded && !this.playerState.isGrinding,
      hardness: surfaceHardness,
      grinding: this.playerState.isGrinding,
      balance: this.balance.balance01,
      comboOpen: this.score.isOpen,
      multiplier: this.score.multiplier,
      heat: this.police?.heatLevel ?? 0,
    });

    if (this.chairParts) {
      spinCasters(this.chairParts, currentSpeed, dt);
    } else if (this.wheelMeshes.length > 0 && this.playerState.isGrounded && !this.playerState.isGrinding) {
      const rotationDelta = (currentSpeed / 0.025) * dt;
      for (const wheel of this.wheelMeshes) wheel.rotation.x += rotationDelta;
    }

    this.speedLines.update(dt, currentSpeed, this.playerState.isGrounded);
    this.hud?.setSpeed(currentSpeed);
    this.hud?.setMinimapPlayer(this.chair.position.x, this.chair.position.z, yawOf(this.chair.quaternion));
    this.cameraController.updateFOVFromSpeed(currentSpeed, 18);
    this.cameraController.setTrickZoom(this.playerState.isAirborne, this.playerState.airTime);
    this.cameraController.setManualing(this.playerState.isManualing);

    // ---- 11. HUD COMBO + BALANCE ------------------------------------------------------
    const comboState = this.score.state;
    this.hud?.setComboState(comboState.open ? comboState : null);

    if (this.balance.isActive) {
      this.hud?.setBalanceMode(this.balance.state.mode);
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
        proceduralSounds.playOllie(intent.ollieCharge || 1);
        const v = this.physics.getVelocity(this.chairBody);
        this.physics.setVelocity(this.chairBody, new THREE.Vector3(v.x, 10 * this.jumpMultiplier * intent.ollieCharge, v.z));
        // This step's pop is spent — applyMovement must not fire it again or buffer it —
        // but holding the button still buys height off a rail, same as off the floor.
        this.olliePopHandledAt = this.simTime;
        this.ollieLiftLeft = this.OLLIE_LIFT_SECONDS;
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
      this.grindParticles.update(dt, true, grindPos, gs.rail.direction, speed);
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
      || (this.simTime - this.lastGroundedTime) * 1000 < this.TRICK_CONTACT_GRACE_MS;

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
        if (def) this.trickAnimator?.playTrick('revert', 'manual', 350);   // ms, not seconds
      }
    }

    // --- integrate ---
    // Manuals are corrected vertically, grinds/lips horizontally. Difficulty rises with the
    // length of the line, so a long combo is progressively hairier to hold.
    const axis = this.balance.axis;
    const stick = axis === 'vertical' ? intent.dir.y : axis === 'horizontal' ? intent.dir.x : 0;
    // Difficulty is owned by ScoreSystem: it is a property of the open position, not of the
    // chair. `distinctTricks` was the wrong signal — a line of sixteen grinds glued by manuals
    // uses three distinct ids and so never got harder, however long it ran.
    const difficulty = 1 + this.score.comboPressure;
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
        
        // Stop the chair. The speed entitlement goes with it — otherwise remounting
        // hands back 93% of the speed that caused the crash and the chair drives off
        // on its own. See applyMovement's restore.
        this.physics.setVelocity(this.chairBody, new THREE.Vector3(0, 0, 0));
        this.carriedSpeed = 0;
        this.pinnedFor = 0;
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
    //
    // THE RAY GOES STRAIGHT DOWN, AND A TRANSITION IS NOT UNDER YOU — it is beside you. A
    // chair sitting on a surface tilted by θ has its wheels a perpendicular 0 m from that
    // surface but 0.70/cos θ VERTICALLY above it, so at 60 degrees a straight-down cast
    // reports a 0.7 m gap and at 75 degrees it does not reach the surface at all. That is
    // the mechanism by which the player let go of a wall a third of the way up it. The cast
    // is lengthened by 1/cos θ while the last surface was a transition, and every decision
    // below is taken on the PERPENDICULAR gap, which is the one that means "touching".
    const lastCos = Math.cos(this.lastSurfaceAngle * DEG2RAD);
    const reach = this.lastSurfaceAngle > this.TRANSITION_ANGLE
      ? Math.min(4.0, this.GROUND_SNAP_DISTANCE / Math.max(0.2, lastCos))
      : this.GROUND_SNAP_DISTANCE;
    const groundCheck = this.physics.raycastGroundMulti(
      pos, 0.3, reach, this.chairBody, CHAIR_FOOT_OFFSET,
    );
    // Exact perpendicular gap between the capsule and the surface. `distance` is a VERTICAL
    // gap under the wheels; multiplying it by cos θ is not the perpendicular distance,
    // because the capsule's nearest point to a tilted surface is not its lowest point.
    // Getting this wrong by the 13 cm it is wrong by at 48 degrees was enough to make the
    // stick below drive the chair 8 m/s INTO a quarter pipe every frame: the geometry said
    // "still 13 cm of air", the solver said "you are inside me", and the chair crawled down
    // the transition at 1 m/s with the two of them fighting.
    const perpGap = groundCheck
      ? Math.max(0, Math.cos(groundCheck.surfaceAngle * DEG2RAD)
        * (groundCheck.distance + CHAIR_RADIUS) - CHAIR_RADIUS)
      : Infinity;

    if (groundCheck && perpGap < this.GROUND_SNAP_DISTANCE) {
      // We're near a surface
      this.surfaceNormal.copy(groundCheck.normal);
      this.surfaceAngle = groundCheck.surfaceAngle;

      // Speed INTO the surface. On flat ground this is exactly v.y, which is what the two
      // rules below used to read; on a transition it is the component that decides whether
      // the wheels are settling onto the curve or leaving it, and v.y is not — riding up a
      // wall v.y is hugely positive while the chair is glued to the surface.
      const vNormal = vel.x * this.surfaceNormal.x + vel.y * this.surfaceNormal.y
        + vel.z * this.surfaceNormal.z;

      // Grounded if the wheels are within a hair of the floor and we are not launching.
      // Rolling off a curb, a stair edge or a desk lip must NOT read as air: a chair that
      // goes weightless every time the floor steps down by 20 cm spends a fifth of the run
      // airborne, scores no manuals (they need contact) and never links anything. So once
      // you are on the ground the contact window opens up, and only a real pop closes it.
      const stickGap = wasGrounded && vNormal <= 0.5 ? this.GROUND_STICK_GAP : this.GROUND_CONTACT_GAP;
      const closeEnough = perpGap < stickGap;
      const notLaunching = vNormal < 4; // Not actively jumping off this surface

      // On steep surfaces (ramps), check if we're moving up or down
      if (this.surfaceAngle > this.LAUNCH_ANGLE) {
        // Past vertical there is no surface left to hold: let go. This used to fire at 60
        // degrees, which on a real transition is barely two thirds of the way up the curve
        // — the chair let go mid-wall, so it never reached the tangent that makes a lip
        // launch a launch. Geometry decides now; this is only the backstop.
        const movingUpRamp = vel.y > 2 && this.surfaceAngle > 86;
        if (movingUpRamp) {
          this.playerState.isGrounded = false;
        } else {
          this.playerState.isGrounded = closeEnough && notLaunching;
        }
      } else {
        this.playerState.isGrounded = closeEnough && notLaunching;
      }

      // Stick to the surface across the crest of a ramp, a stair edge or the curve of a
      // transition, so a roll-off does not read as a launch. Pulled along the SURFACE
      // NORMAL, not straight down: a transition curves away underneath a chair that is
      // travelling in a straight line, and without this the chord always leaves the arc and
      // the player pops off the middle of the wall. On flat ground the normal is up and
      // this is bit-for-bit the behaviour it replaced.
      if (this.playerState.isGrounded && perpGap > 0.06 && vNormal <= 0.5) {
        const snapSpeed = Math.min(9, perpGap / Math.max(dt, 1e-4));
        if (vNormal > -snapSpeed) {
          const pull = -snapSpeed - vNormal;
          this.physics.setVelocity(this.chairBody, new THREE.Vector3(
            vel.x + this.surfaceNormal.x * pull,
            vel.y + this.surfaceNormal.y * pull,
            vel.z + this.surfaceNormal.z * pull,
          ));
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
      
      // Track spin. Accumulated from per-frame deltas rather than differenced against the
      // take-off heading: a heading is an angle on a circle, so the difference across the
      // wrap point is a 360-degree jump that never happened, and a 540 that crossed it read
      // as a 180.
      const currentRotation = yawOf(this.chair.quaternion);
      this.cumulativeSpinDegrees
        += Math.abs(wrapPi(currentRotation - this.lastAirYaw)) * (180 / Math.PI);
      this.lastAirYaw = currentRotation;
      
      // Update HUD with spin counter (only show if >= 90 degrees)
      const roundedSpin = Math.floor(this.cumulativeSpinDegrees / 180) * 180;
      this.hud?.setSpinCounter(roundedSpin >= 180 ? roundedSpin : 0);
    } else {
      this.playerState.airTime = 0;
    }
    
    // Becoming airborne - store starting rotation
    if (wasGrounded && !this.playerState.isGrounded) {
      this.lastAirYaw = yawOf(this.chair.quaternion);
      this.lastYaw = this.lastAirYaw;
      this.takeoffPos.copy(pos);
      this.cumulativeSpinDegrees = 0;
      // A manual cannot survive the wheels leaving the floor.
      if (this.balance.isManualing) this.balance.end();
      // Remember whether the take-off was a transition, for the revert window on landing.
      // `surfaceAngle` has already been reset to 0 by the branch above — the frame you
      // leave a lip is by definition the frame there is no surface — so the take-off has to
      // be judged on the angle of the surface you were on LAST frame.
      this.landedFromTransition = this.lastSurfaceAngle > 18;

      // ---- LAUNCH OFF THE LIP ---------------------------------------------------------
      // Leaving a transition sends you up its EXIT TANGENT with the speed you arrived with,
      // rather than off the end of it along the floor. The ground model has already been
      // writing velocity along the surface each frame, but the frame you actually let go is
      // the one that decides the whole arc, and it is the one most likely to have been
      // eaten by a solver contact at the coping — so the angle is asserted here rather than
      // left to whatever survived. Magnitude is preserved exactly: this trades horizontal
      // speed for height, it never manufactures either.
      // 0 at TRANSITION_ANGLE, 1 by 42 degrees. The span is deliberately short enough that
      // the game's own 25 degree kickers get a real share of it: fixing the slope sign
      // above (correctly) made climbing a kicker cost speed where it used to pay, and the
      // pop off one dropped from 0.69 m to 0.49. Widening the hang here puts the height
      // back without putting the physics error back.
      this.transitionLaunch = Math.max(0, Math.min(1,
        (this.lastSurfaceAngle - this.TRANSITION_ANGLE) / 30));
      if (this.transitionLaunch > 0) {
        const speed3 = Math.hypot(vel.x, vel.y, vel.z);
        const planarSpeed = Math.hypot(vel.x, vel.z);
        const launchRad = Math.min(this.lastSurfaceAngle, this.TRANSITION_MAX_LAUNCH) * DEG2RAD;
        const wantY = speed3 * Math.sin(launchRad);
        // A CAP AS WELL AS A FLOOR. The ground model has already written velocity along the
        // surface, and at the coping that surface is vertical — left alone it fires the
        // player dead-straight up, which is a pogo stick and not a launch.
        if (speed3 > 1 && Math.abs(wantY - vel.y) > 0.05) {
          const wantPlanar = speed3 * Math.cos(launchRad);
          const k = planarSpeed > 0.05 ? wantPlanar / planarSpeed : 0;
          const yaw = yawOf(this.chair.quaternion);
          this.physics.setVelocity(this.chairBody, new THREE.Vector3(
            planarSpeed > 0.05 ? vel.x * k : Math.sin(yaw) * wantPlanar,
            wantY,
            planarSpeed > 0.05 ? vel.z * k : Math.cos(yaw) * wantPlanar,
          ));
        }
      }
    }

    // Landing detection
    if (!wasGrounded && this.playerState.isGrounded) {
      // ---- LANDING BACK INTO A TRANSITION ---------------------------------------------
      // Dropping in should PAY you. Land on the curve and the fall becomes speed down the
      // wall: the whole velocity vector is laid flat onto the surface and its magnitude
      // kept (bar a few per cent), instead of the vertical part being thrown away and the
      // chair arriving at the bottom of a 3 m transition slower than it left the top. This
      // is what a pump is, and it is why a half pipe can be ridden more than once.
      //
      // Flat ground is deliberately excluded — there the same arithmetic would hand out
      // free speed for every hop, which is a very different game.
      if (this.surfaceAngle > this.TRANSITION_ANGLE) {
        const speed3 = Math.hypot(vel.x, vel.y, vel.z);
        const n = this.surfaceNormal;
        const dot = vel.x * n.x + vel.y * n.y + vel.z * n.z;
        const flat = new THREE.Vector3(vel.x - n.x * dot, vel.y - n.y * dot, vel.z - n.z * dot);
        // A GLANCING LANDING IS A DROP-IN; A PERPENDICULAR ONE IS A SLAM. The rule below
        // rescales whatever survives the projection back up to (nearly) the full incoming
        // speed, and when the velocity is almost parallel to the surface normal what
        // survives is numerical dust pointing in an arbitrary direction. Amplifying that to
        // 7.5 m/s is exactly what happened at the lip of the probe's half pipe: the chair
        // arrived travelling straight up, was handed 7.5 m/s ACROSS the wall, and traversed
        // it sideways for a second and a half without gaining or losing a centimetre of
        // height. Below a third of the incoming speed there is no line left to preserve, so
        // the landing is left exactly as the world made it.
        if (flat.length() > 0.30 * speed3 && speed3 > 1) {
          flat.setLength(Math.min(this.MAX_SPEED, speed3 * this.TRANSITION_LANDING_KEEP));
          this.physics.setVelocity(this.chairBody, flat);
          // The speed entitlement has to be told, or the restore below spends the next few
          // frames trying to drag the line back to what it was before the drop.
          this.carriedSpeed = Math.max(this.carriedSpeed, Math.hypot(flat.x, flat.z));

          // FAKIE. You went up the wall forwards, so you are coming down it backwards, and
          // every rule in applyMovement treats travel that opposes the facing as damage the
          // world did — it would scrub the speed off and crab the chair sideways out of the
          // transition. Coming back down the thing you just rode up is not damage. Turn the
          // chair to face its line on the touchdown frame, before the movement model ever
          // sees a reversal.
          const travel = Math.atan2(flat.x, flat.z);
          const face = yawOf(this.chair.quaternion);
          if (Math.abs(wrapPi(travel - face)) > 1.9) {
            this.physics.setRotationY(this.chairBody, travel);
          }
        }
      }
      this.transitionLaunch = 0;

      const landingIntensity = Math.min(1, this.playerState.airTime / 1500);
      proceduralSounds.playLand(landingIntensity);
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

    // The angle of the surface we were ON this frame, for the next one. Both the extended
    // transition cast above and the lip launch need it, and by the time either fires the
    // live value has already been cleared.
    this.lastSurfaceAngle = this.playerState.isGrounded ? this.surfaceAngle : 0;
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

    // A TRANSITION IS NOT A WALL, and this function cannot tell the difference on its own.
    // It fires a feeler forward at wheel height, measures how far the thing in front rises
    // over the next 12 cm, and calls anything taller than a caster a wall to bank off. On a
    // quarter pipe the thing in front IS the floor, and it rises faster the higher you get —
    // so halfway up the curve the escape fired, rotated the line 90 degrees across the face
    // and slid the chair sideways along the wall at full speed instead of up it. Measured on
    // the ramp probe: z frozen at 0.36 m for six frames with 18 m/s of planar speed pointing
    // the wrong way. While the wheels are ON a transition, the surface ahead is the ride.
    if (this.playerState.isGrounded && this.surfaceAngle > this.TRANSITION_ANGLE) {
      this.pinnedFor = 0;
      return false;
    }

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

    // A wall that is simply eating the line, with no ray to explain it (a corner, a prop
    // the feeler slipped past). Track it so the recovery below still fires.
    //
    // This used to require the player to be HOLDING the push, which meant the one case that
    // most needs rescuing was the one case it ignored: coast a full-speed line into a corner
    // and the chair stops dead and stays there, because a player mid-line is not leaning on
    // forward. An entitlement above 3.5 m/s counts as intent to keep moving — and braking
    // cannot trigger it, because braking bleeds that entitlement away with the speed.
    if ((pushing || this.carriedSpeed > 3.5) && speed < 1.2) this.pinnedFor += dt;
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
      // KEEP FORWARD INTENT IN THE ESCAPE.
      //
      // This used to be a PURELY perpendicular vector — a flat 90 degree sideways
      // redirect — and the yaw solve below then turned the chair to face it. One hit
      // costs you a quarter turn; a few in quick succession leave you travelling
      // backwards. In a level dense enough that the player is in contact with geometry
      // most of the time, that fires constantly and reads as "the chair randomly spins
      // and rolls backwards", which is exactly what it was doing.
      //
      // Blending the original heading back in makes the escape a ~50 degree peel-off
      // instead of a broadside. The chair still gets out of the corner, but it leaves
      // pointing roughly where the player was already going.
      slide = right.clone()
        .multiplyScalar(openRight >= openLeft ? 1 : -1)
        .addScaledVector(dir, 0.85)
        .normalize();
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
    // Hard ceiling on how far an escape may ever swing the chair. Even with a
    // forward-biased slide, repeated escapes in tight geometry could otherwise walk the
    // heading round a full turn one clamped step at a time. No single recovery gets to
    // turn the player more than 60 degrees, so the line always survives recognisably.
    const ESCAPE_YAW_LIMIT = Math.PI / 3;
    delta = Math.max(-ESCAPE_YAW_LIMIT, Math.min(ESCAPE_YAW_LIMIT, delta));
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
  /**
   * Put the chair's body centre where its capsule actually rests on the floor.
   *
   * Every level in the game authors its spawn Y as 0.5 or 0.6 — but the capsule bottom
   * sits CHAIR_FOOT_OFFSET (0.70 m) below the body centre. So every level was loading the
   * chair 0.10-0.20 m INSIDE the floor, and Rapier's penetration solver did exactly what
   * it should: it threw the chair out. Measured on ch1_office, the player was ejected
   * 7.74 m into the air at 13.37 m/s with no input at all, airborne for 110 frames. Every
   * run in every level began with a launch.
   *
   * Authored Y is treated as a hint about WHICH floor is meant (a mezzanine, a rooftop),
   * not as a body position. Cast down from above it and seat the capsule on whatever we
   * hit, with a hair of clearance so the solver has nothing to resolve. If the cast finds
   * nothing, lift the authored value by the foot offset — still strictly better than
   * burying it.
   */
  private resolveSpawnHeight(authored: THREE.Vector3): THREE.Vector3 {
    const CLEARANCE = 0.02;
    const out = authored.clone();
    const probeTop = authored.y + 3.0;
    const hit = this.physics.raycastGround(
      new THREE.Vector3(authored.x, probeTop, authored.z),
      probeTop + 6.0,
      this.chairBody ?? undefined,
    );
    if (hit?.hit) {
      out.y = hit.point.y + CHAIR_FOOT_OFFSET + CLEARANCE;
    } else {
      out.y = authored.y + CHAIR_FOOT_OFFSET + CLEARANCE;
      console.warn('[Game] spawn ground cast found nothing; lifting authored Y instead');
    }
    return out;
  }

  private applyMovement(intent: ControlIntent, dt: number): void {
    // Only allow full movement when mounted on chair
    if (!this.isMounted) {
      // Steering state is stale while off the chair — clear it so remounting starts from
      // straight instead of resuming a carve the player asked for a minute ago.
      this.turnRate = 0;
      this.turnCommand = 0;
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
    // SPEED IS MEASURED ALONG THE SURFACE, NOT ACROSS THE FLOORPLAN.
    //
    // The model writes `alongSurface * speed` and then reads its own work back as the
    // FLAT length of that vector, which on a slope of θ is speed·cos θ — so every frame on
    // a ramp threw away (1 − cos θ) of the line, 9% a frame on a kicker and half of it a
    // frame on the steep part of a transition. It only ever looked like it worked because
    // the carriedSpeed restore quietly re-inflated the loss a frame later.
    //
    // In the other direction, the ground stick pushes the chair INTO the surface, and on a
    // tilted surface part of that push is horizontal — so the flat reading also counted the
    // stick as forward speed, and the two errors together had a chair ACCELERATE from 12.6
    // to 15.3 m/s while climbing a quarter pipe. Reading the tangential component is right
    // on both counts: it is the speed the chair actually has along the thing it is riding,
    // and it cannot see the stick at all. Flat ground is untouched (the normal is up, and
    // the tangential magnitude is exactly the planar one).
    let currentSpeed = planar.length();
    if (this.playerState.isGrounded && this.surfaceAngle > 3) {
      const n = this.surfaceNormal;
      const vn = velocity.x * n.x + velocity.y * n.y + velocity.z * n.z;
      currentSpeed = Math.hypot(
        velocity.x - n.x * vn, velocity.y - n.y * vn, velocity.z - n.z * vn,
      );
    }

    if (this.playerState.isGrounded) {
      // ---- GROUND MOVEMENT MODEL --------------------------------------------------
      // Everything about how a THPS line feels lives in these twenty lines: velocity is
      // steered toward where the chair points WITHOUT losing magnitude (so carving keeps
      // speed), the push eases you up to a cruise rather than to the hard ceiling, and
      // coasting bleeds off slowly enough that the gaps between features stay alive.
      let speed = currentSpeed;
      // Unit direction of travel across the floorplan. Normalised by the PLANAR length, not
      // by `currentSpeed` — on a transition those are no longer the same number, and a
      // "unit" vector two thirds shorter than it claims is a trap for anything downstream
      // that trusts it.
      const planarLen = planar.length();
      const rolling = planarLen > 0.05 ? planar.clone().divideScalar(planarLen) : fwdFlat.clone();

      // ---- THE CHAIR HAS NO REVERSE GEAR ------------------------------------------
      //
      // This model used to accept backwards travel as a legitimate state: if the velocity
      // opposed the facing by more than ~101 degrees it flipped `heading` to -forward and
      // gripped the velocity onto it. Nothing ever flipped it back, so backwards was a
      // LATCH, and everything downstream then worked to keep the player there: the speed
      // entitlement re-inflated the reversed direction to 93% of cruise, and holding the
      // push accelerated along it. Measured on ch1_office, 37.6% of a 20 s coast-and-turn
      // run had velocity opposing the facing, worst case 10.6 m/s backwards.
      //
      // How the player got there is not a reverse input — there isn't one. It is contact:
      // the solver removes the into-the-surface component of a graze, and whatever slice
      // of the line survives can point anywhere, including behind the chair. One frame of
      // that used to be permanent.
      //
      // So: travel that opposes the facing is always something the WORLD did, never
      // something the player asked for, and the correction is to turn the CHAIR to face
      // where it is actually going — a spin-out recovery, over about a quarter of a
      // second — rather than to turn the LINE around to suit a facing nobody chose. The
      // trajectory the player earned survives; the chair ends up pointing along it.
      const faceAngle = Math.atan2(fwdFlat.x, fwdFlat.z);
      const travelAngle = Math.atan2(rolling.x, rolling.z);
      let misalign = wrapPi(travelAngle - faceAngle);

      // ---- ...EXCEPT ON A TRANSITION, WHERE GOING BACKWARDS IS THE POINT ---------------
      //
      // Everything below treats travel that opposes the facing as damage, and it is right
      // to, on a floor. On a quarter pipe it is the feature working: you ride up the wall
      // forwards and you come back down it backwards, every time, and that is a fakie and
      // not a spin-out. Handing that to the rules below was measured on the ramp probe and
      // it was ugly — the reversal invariant cannot keep any part of a dead-astern line, so
      // it peeled the chair off at exactly 90 degrees and sent it TRAVERSING THE WALL
      // sideways at 7.5 m/s, frozen at the same height, for a second and a half.
      //
      // So on a transition the chair simply turns to face where the ramp is taking it, and
      // the reversal machinery never sees a reversal at all. Only a real about-face
      // qualifies; a carve across the curve still steers normally.
      if (this.surfaceAngle > this.TRANSITION_ANGLE
          && currentSpeed > this.REALIGN_MIN_SPEED && Math.abs(misalign) > 1.75) {
        this.physics.setRotationY(this.chairBody, travelAngle);
        fwdFlat.set(Math.sin(travelAngle), 0, Math.cos(travelAngle));
        misalign = 0;
      }
      const slewing = currentSpeed > this.REALIGN_MIN_SPEED
        && Math.abs(misalign) > this.REALIGN_ANGLE;
      // Actually travelling backwards, as opposed to merely sliding: the only state the
      // rules below have to refuse. Judged on the body's own velocity before anything in
      // this frame has touched it, and only while the chair is moving fast enough for a
      // heading to mean anything — a chair shuffling at walking pace against a desk leg
      // has no line to protect and must never be locked out of its own accelerator.
      const reversing = currentSpeed > this.REALIGN_MIN_SPEED && Math.abs(misalign) > Math.PI / 2;
      if (slewing) {
        // Turn toward the travel direction, but never past the threshold: this is a
        // recovery from a broadside, not a steering override. A normal carve lags the
        // facing by ~16 degrees and can never wake it. An outright reversal is an
        // emergency and gets twice the rate, so the worst case in the game — landing a
        // 180 backwards at speed — is pointing the right way again inside a fifth of a
        // second rather than being something the player has to watch happen to them.
        const rate = this.REALIGN_RATE * (reversing ? 2 : 1);
        const swing = Math.sign(misalign)
          * Math.min(Math.abs(misalign) - this.REALIGN_ANGLE, rate * dt);
        const newFace = faceAngle + swing;
        this.physics.setRotationY(this.chairBody, newFace);
        fwdFlat.set(Math.sin(newFace), 0, Math.cos(newFace));
      }

      // Grip: rotate the velocity vector toward the facing, magnitude untouched. Done as a
      // rotation through the angle rather than a lerp between vectors — a lerp toward the
      // exact opposite vector collapses to zero length, which is precisely the case a chair
      // that has just been spun round by a wall is in. Only an outright reversal weakens the
      // grip: there the recovery should be the chair turning to meet the line, not the line
      // being yanked round to meet the chair. A merely sideways slide keeps full grip, or
      // the two rules meet in the middle and the chair drifts at the threshold angle
      // forever — measured at a permanent 60 degree crab through every carve.
      const grip = (1 - Math.exp(-this.GRIP_RATE * dt)) * (reversing ? 0.25 : 1);
      const dirAngle = travelAngle - wrapPi(travelAngle - Math.atan2(fwdFlat.x, fwdFlat.z)) * grip;
      const dir = new THREE.Vector3(Math.sin(dirAngle), 0, Math.cos(dirAngle));

      // THE INVARIANT: this model never writes a velocity with a backwards component. The
      // solver can still produce one — a head-on hit at 13 m/s has to go somewhere — but it
      // survives exactly one frame, because the next one takes the backwards component out
      // and leaves the sideways part. A hit that used to fire the player back across the
      // room now skids them along it. Without this the reversal lasted as long as the chair
      // took to turn round (4-7 frames, and up to 149 before any of this existed).
      if (reversing) {
        const back = dir.dot(fwdFlat);
        if (back < 0) {
          dir.addScaledVector(fwdFlat, -back);
          if (dir.lengthSq() < 1e-6) {
            // Dead astern: no sideways component to keep. Peel off the way the chair is
            // already turning, so the recovery reads as one movement.
            dir.set(fwdFlat.z, 0, -fwdFlat.x).multiplyScalar(Math.sign(misalign) || 1);
          }
          dir.normalize();
        }
      }

      // Curbs, ramp lips, stair edges and walls, resolved BEFORE the velocity is written
      // so a contact steers the line instead of ending it. `dir` comes back pointing
      // somewhere the chair can actually go.
      const contact = this.resolveObstacles(dt, dir, speed, intent.push);

      // Speed the solver ate on the previous step. A glancing hit should cost you a
      // fraction of your speed and a change of line, not the whole run — this is the
      // difference between a level that punishes exploration and one that rewards it.
      //
      // The window used to be "lost more than 40% in one frame, hand back 78-85%", which
      // meant a clip that cost 35% was kept in full — and in a room-sized level that is
      // most of them. Measured coasting through ch1_office, single-frame solver bites of
      // 3-5 m/s were the whole of the speed problem; authored rolling drag was never even
      // a third of it. So the window opens at a 15% single-step loss and hands back most
      // of it. Deliberate deceleration can never trigger it: braking is gated out here, and
      // the entitlement below only ever bleeds by the exact amount this model chose to
      // take, so slowing down on purpose is never mistaken for the solver taking a bite.
      //
      // THE RESTORE MAY NEVER RE-INFLATE A REVERSED LINE. Whatever survives a contact is
      // whatever the solver left, and that can point behind the chair; handing it 93% of
      // cruise turned a bounce into a full-speed reversal. The probe caught the exact
      // frames: speed 8.7 -> 3.9 as the solver ate the into-wall component, then 8.8 again
      // the next frame, pointing backwards, and it stayed there. The restore is now held
      // back for exactly as long as the chair is pointed the wrong way, and hands the line
      // back the moment it is facing its travel again — so a hit costs a change of line
      // rather than the run, which is the whole point of the restore, and it can never
      // again pay out along a direction the player did not choose.
      //
      // AND IT IS HELD BACK ON A TRANSITION. Climbing a quarter pipe is SUPPOSED to cost
      // you most of your speed — that is the trade the whole feature exists to offer — and
      // to this rule a chair that entered at 12.6 m/s and reached the coping at 1.3 looked
      // exactly like a chair that had just been eaten by a wall. It handed 93% of cruise
      // back at the lip, every frame, and the probe caught the result: the chair hung at
      // the top of the curve oscillating between 1 and 8 m/s and never went anywhere. The
      // entitlement still bleeds correctly here (the climb is an authored loss, so
      // carriedSpeed follows the speed down the wall and back up it); it is only the
      // instant re-inflation that must not fire.
      const onTransition = this.surfaceAngle > this.TRANSITION_ANGLE;
      /** Set when the climb ran out of speed and the chair is being sent back down. */
      let stalled = false;
      /** Speed the slope gave (+) or took (-) this frame. An authored loss like any other. */
      let slopeWork = 0;
      if (!intent.brake && !reversing && !onTransition
          && this.carriedSpeed > 3.5 && speed < this.carriedSpeed * 0.85) {
        speed = this.carriedSpeed * (contact ? 0.85 : 0.93);
      }
      const speedAfterRestore = speed;

      if (intent.push && reversing) {
        // Pushing while the chair is still travelling backwards out of a hit. Feeding the
        // accelerator here would drive the player further backwards — the wheels scrub
        // instead, so the input the player reaches for to recover actually recovers.
        speed -= 10 * dt;
        if (speed < 0) speed = 0;
      } else if (intent.push) {
        // Ease-off accel: full kick from a standstill, almost nothing left once you are
        // cruising. The residual term used to be a flat 25% of PUSH_ACCEL — 4 m/s^2 that
        // never faded, so simply holding forward on any clear straight dragged the player
        // to MAX_SPEED and pinned them there. That made top speed uncontrollable and, worse,
        // meant every coast started from a wall-scraping 18-20 m/s that no line ever
        // actually earned. It now fades to zero as MAX_SPEED approaches, so the push alone
        // settles a little above CRUISE_SPEED and the ceiling stays reserved for what is
        // supposed to earn it: ramps, downhills and grind pops.
        const headroom = Math.max(0, 1 - speed / Math.max(1, cruiseSpeed));
        const overCruise = Math.max(0, Math.min(1,
          (maxSpeed - speed) / Math.max(1, maxSpeed - cruiseSpeed)));
        speed += this.PUSH_ACCEL * (0.12 * overCruise + 0.88 * headroom)
          * this.speedMultiplier * dt;

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

      // Backwards travel scrubs. Whatever the input, a chair being dragged backwards on its
      // casters sheds that speed fast — so a hit that spins the line round costs the player
      // the speed rather than firing them across the room with it, and the reversal is over
      // in a few frames instead of being a state you have to drive out of.
      let reverseScrub = 0;
      if (reversing) {
        const before = speed;
        speed -= (8 + this.REVERSE_SCRUB * speed) * dt;
        if (speed < 0) speed = 0;
        reverseScrub = before - speed;
      }

      // Gravity along the surface: ramps give speed back on the way down and cost on the
      // way up, which is what makes a transfer feel earned.
      //
      // THIS TERM USED TO HAVE THE SIGN BACKWARDS and had done since it was written — the
      // comment above describes what was intended, the arithmetic did the opposite. For a
      // surface rising toward +Z the up-normal is (0, cos, −sin), so `−dir·n_horizontal` is
      // +sin θ going UP it, and the line `speed += slopeDot * 16 * dt` therefore paid the
      // player to climb and charged them to descend. On the 0.85 m kickers it was invisible
      // (+2 m/s, indistinguishable from "ramps feel punchy"). On a 3 m transition it is
      // catastrophic: the ramp probe measured a chair entering at 12.6 m/s, ACCELERATING up
      // the curve to 19, and leaving the lip on a trajectory 9.3 m high — three times the
      // height of the ramp, off a wall it should barely have cleared.
      //
      // AND IT WAS BEING CHARGED TWICE. The rigid body is under 30 m/s^2 of world gravity
      // and `speed` is read back out of that body every frame, so the solver has ALREADY
      // taken the full gravity component along the surface before this line runs — the
      // authored term was a second helping on top of it, ~46 m/s^2 all told. Measured: a
      // 12.6 m/s entry stalled 1.6 m up a 3 m quarter pipe, when 12.6 m/s is enough energy
      // for 2.6 m under real gravity alone.
      //
      // So this term now works the other way round: it HANDS BACK the difference between
      // world gravity and the gentler figure a skate game wants on a transition. That is
      // what lets a cruise clear a wall at all, and it keeps the trade honest — a full
      // climb and descent still comes out slower than it went in.
      if (this.surfaceAngle > 3) {
        const climb = this.physics
          .getSurfaceMovementDirection(dir, this.surfaceNormal).y;
        speed += (30 - this.SLOPE_GRAVITY) * climb * dt;
        if (speed < 0) speed = 0;
        // What the slope did to the line this frame: negative climbing, positive dropping.
        // The entitlement below has to see it or it will treat a climb as damage.
        slopeWork = -this.SLOPE_GRAVITY * climb * dt;

        // ---- STALL OUT ----------------------------------------------------------------
        // You did not make it. Every other rule in this model works on a scalar speed and a
        // heading, which cannot express "rolling backwards down a wall" — so a chair that
        // ran out of speed halfway up a transition simply STOPPED THERE, pinned to a 60
        // degree surface by a velocity the model rewrote to zero every frame. A stall on a
        // transition has to end with the chair coming back down it, and it has to come down
        // FACING down, or the reversal rules above spend the descent scrubbing the speed
        // off and crabbing the chair sideways out of the ramp.
        //
        // The horizontal part of the surface normal points straight down the fall line, so
        // it is both the direction to travel and the direction to face.
        if (onTransition && climb > 0.05 && speed < 1.6) {
          const fall = new THREE.Vector3(this.surfaceNormal.x, 0, this.surfaceNormal.z);
          if (fall.lengthSq() > 1e-4) {
            fall.normalize();
            this.physics.setRotationY(this.chairBody, Math.atan2(fall.x, fall.z));
            fwdFlat.copy(fall);
            dir.copy(fall);
            speed = 1.6;
            stalled = true;
          }
        }
      }

      if (speed > maxSpeed) speed = maxSpeed;

      // Ride the surface plane rather than skimming over it, so ramps convert speed to air.
      //
      // ---- A HORIZONTAL HEADING IS THE WRONG THING TO STEER A WALL WITH ----------------
      //
      // `dir` is a compass bearing, and `getSurfaceMovementDirection` lifts it onto the
      // surface. On a floor that is exact. On a transition it is unstable, and violently
      // so: the up-the-wall direction is squashed in the horizontal plane by cos θ, so the
      // lift DIVIDES the sideways part of the bearing by cos θ — a factor of 3.6 at 74
      // degrees. Feed the resulting velocity's horizontal shadow back in as next frame's
      // bearing and a 4 degree error becomes 16, then 45, then 90. That is the entire
      // mechanism behind the worst thing the probe found: the chair reached the lip of the
      // half pipe, spiralled off the fall line in three frames, and then TRAVERSED the wall
      // at 7.5 m/s, at a constant height, for a second and a half.
      //
      // On a transition the direction of travel is therefore taken from the velocity the
      // chair actually has, projected onto the surface — which is stable, and which carries
      // gravity's pull back toward the fall line for free, because the solver has already
      // applied it. Steering is blended in on top, weighted by cos θ so that its authority
      // falls off at exactly the rate the instability grows: full on a bank, none on vert,
      // which is also how a real transition rides.
      let alongSurface: THREE.Vector3;
      if (stalled) {
        alongSurface = this.physics.getSurfaceMovementDirection(dir, this.surfaceNormal);
      } else if (onTransition) {
        const n = this.surfaceNormal;
        const vn = velocity.x * n.x + velocity.y * n.y + velocity.z * n.z;
        const travel3 = new THREE.Vector3(
          velocity.x - n.x * vn, velocity.y - n.y * vn, velocity.z - n.z * vn,
        );
        const steer = this.physics.getSurfaceMovementDirection(dir, n);
        if (travel3.lengthSq() > 1e-4) {
          const blend = 0.35 * Math.max(0, Math.cos(this.surfaceAngle * DEG2RAD));
          alongSurface = travel3.normalize().lerp(steer, blend).normalize();
        } else {
          alongSurface = steer;
        }
      } else {
        alongSurface = this.physics.getSurfaceMovementDirection(dir, this.surfaceNormal);
      }
      // sin of the slope ALONG TRAVEL: what the chair is actually climbing or dropping,
      // as opposed to how steep the surface is in the abstract. Traversing a transition
      // sideways is flat; going straight up it is not. The visual pitch reads this.
      this.surfaceClimb = this.surfaceAngle > 2 ? alongSurface.y : 0;
      const newVel = new THREE.Vector3(
        alongSurface.x * speed,
        this.surfaceAngle > 3 ? alongSurface.y * speed : velocity.y,
        alongSurface.z * speed,
      );
      this.physics.setVelocity(this.chairBody, newVel);

      // The speed the player is ENTITLED to: what they would have if nothing but this model
      // had touched them. It bleeds by exactly the losses authored above — rolling drag, the
      // brake, gravity up a ramp, the MAX_SPEED clamp — and by nothing else, so any further
      // gap between it and the body's actual velocity is the solver, and only the solver.
      //
      // It used to decay on a flat timer (9, then 18 m/s^2) instead, which quietly made
      // sustained contact the single biggest speed sink in the game: every frame spent
      // scraping a wall or a desk leg cost 0.3 m/s on top of whatever the solver took, so a
      // graze at 15 m/s bled out inside a second. A wall now costs a fixed slice at the
      // moment of contact plus a mild 3 m/s^2 while you stay on it, and the line survives.
      // The reverse scrub is deliberately NOT counted as an authored loss. It is the model
      // undoing something the world did, and charging the player's entitlement for it would
      // mean every hit that spun them round also cost them the whole run: the chair would
      // shed the reversal, come round to face its line, and then have nothing left to
      // continue it with. Measured over a 30 s flow run, charging it took mean speed from
      // 13.9 to 9.3 m/s and dead time from 1.5% to 10.2%. The line survives the contact;
      // what it does not survive is being pointed backwards.
      //
      // THE SLOPE IS AN AUTHORED LOSS TOO, and it was not being counted. The speed a climb
      // costs is taken by gravity through the solver rather than by any line in this model,
      // so the entitlement sat at the full 13.7 m/s all the way up a 3 m wall — and the
      // moment the wheels touched anything flat again the restore paid every metre of it
      // back. The probe caught the result: a chair popped over the lip of a half pipe at
      // 1 m/s, landed on the deck, and was fired off the back of it at 12.6. Charging the
      // climb and crediting the descent makes the entitlement track the thing it is
      // supposed to represent — the speed the player would have if only this model had
      // touched them — over a transition as well as over a floor.
      const authoredLoss = Math.min(0, speed - speedAfterRestore + reverseScrub) + slopeWork;
      this.carriedSpeed = Math.min(maxSpeed, Math.max(speed,
        this.carriedSpeed + authoredLoss - (contact ? 3 : 0) * dt));
    } else if (intent.brake && currentSpeed > 0.1) {
      // Air brake is deliberately feeble — you commit when you leave the floor.
      const k = Math.max(0, 1 - 1.2 * dt);
      this.physics.setVelocity(
        this.chairBody, new THREE.Vector3(velocity.x * k, velocity.y, velocity.z * k),
      );
    }

    // TURNING — analog, with weight at both ends so the camera has something continuous
    // to follow rather than a step function.
    //
    // A/D used to STEP the yaw rate from 0 to full in a single frame, which whipped the
    // camera round; the fix was a constant-acceleration ramp. That killed the whip but the
    // ramp then took ~18 frames to arrive, because it was chasing a target read back out of
    // the rigid body — whose 8.0 angular damping ate ~12% of the rate every step, so a
    // linear 18 rad/s^2 ramp spent itself fighting the damping and settled at 2.5 rad/s
    // instead of the 3.6 it was asking for. The chair felt like it was on ice.
    //
    // The shape is now: exponential approach (never a step — the first frame is a fraction
    // of full rate) plus a LEAD term proportional to the remaining gap, which cancels the
    // lag of the input filter in THPSControls and gives the chair its bite. Steering state
    // is kept here rather than read back from the body, so the damping no longer decides
    // the steady rate and the same input always produces the same carve. TURN_MAX_STEP is
    // the hard guarantee that the original bug cannot come back through any input path
    // (including an analog stick slammed over): the commanded rate can never move more than
    // that in one frame, whatever the lead term asks for.
    const turnSpeed = 2.56;     // rad/s, grounded, and now actually delivered
    const airTurnSpeed = 2.1;   // rad/s, airborne
    const TURN_CHASE = 30;      // 1/s, exponential approach while turning in
    const TURN_SETTLE = 20;     // 1/s, exponential return to straight on release
    const TURN_LEAD = 2.0;      // gap feed-forward: the bite
    const TURN_RELEASE_LEAD = 1.25; // the same feed-forward on the way OUT: see below
    const TURN_PEAK = 1.15;     // ceiling on the commanded rate, as a multiple of the max
    const TURN_MAX_STEP = 1.1;  // rad/s, most the command may move in one frame

    const maxRate = this.playerState.isGrounded ? turnSpeed : airTurnSpeed;
    const targetRate = -intent.turn * maxRate;

    const holdingTurn = Math.abs(targetRate) >= Math.abs(this.turnRate);
    const gap = targetRate - this.turnRate;
    this.turnRate += gap * (1 - Math.exp(-(holdingTurn ? TURN_CHASE : TURN_SETTLE) * dt));
    // The lead used to be dropped entirely on release, for fear of commanding a
    // counter-rotation. The cost of that was measured: letting go at a full carve left the
    // chair turning for 13 more frames and swinging a further 19 degrees of heading the
    // player did not ask for — enough to miss the rail you released the stick to line up.
    // The release now leads too, and the counter-rotation it was afraid of is prevented
    // outright by the guard below rather than by refusing to lead at all.
    const lead = (holdingTurn ? TURN_LEAD : TURN_RELEASE_LEAD) * (targetRate - this.turnRate);
    const ceiling = maxRate * TURN_PEAK;
    let newRate = Math.max(-ceiling, Math.min(ceiling, this.turnRate + lead));
    // Coming out of a turn the command may reach straight, and stop there. It may not
    // cross to the other side and carve back — but only while the stick agrees it is
    // coming out: once the player has pushed the OTHER way (target and current rate on
    // opposite sides of zero) that is a reversal they asked for, and the lead is what
    // makes an S through two features quick, so it is left alone.
    if (!holdingTurn && targetRate * this.turnRate >= 0 && newRate * this.turnRate < 0) newRate = 0;
    newRate = this.turnCommand
      + Math.max(-TURN_MAX_STEP, Math.min(TURN_MAX_STEP, newRate - this.turnCommand));
    this.turnCommand = newRate;

    this.physics.setAngularVelocity(
      this.chairBody,
      new THREE.Vector3(0, Math.abs(newRate) < 1e-3 ? 0 : newRate, 0)
    );

    // OLLIE — fires on the PRESS, then keeps lifting for as long as the button is held.
    //
    // The old shape charged on the button and fired on release, which meant the height a
    // player got was decided by one sampled frame: press a hair after leaving a ledge and
    // the pop was silently swallowed, release a hair after the wheels lost contact and it
    // was swallowed again. Same input, different hop — nothing a player can learn. Now the
    // launch is a fixed floor applied on the press and every extra held FIXED STEP adds a
    // fixed slice of lift, so height is a smooth, monotonic, exactly repeatable function
    // of how long you held, capped at OLLIE_LIFT_SECONDS.
    if (this.playerState.isGrounded) this.ollieCoyoteUsed = false;

    const airborneMs = (this.simTime - this.lastGroundedTime) * 1000;
    // `isGrounded` is still true on the frame of the pop and often on the one after it, so
    // without a lockout a second press a frame later popped again out of the same contact —
    // a hidden double jump, and one more way for the same input to give two heights. The
    // lockout is a CLOCK, deliberately: an earlier version keyed the same guard off
    // ollieLiftLeft, which applyMovement is the only thing that decrements and which
    // applyMovement does not run at all during a grind, so it froze mid-grind and started
    // eating real pops. Anything that can get stuck must not gate the most-used input.
    const repopLocked = (this.simTime - this.lastOlliePopAt) * 1000 < this.OLLIE_REPOP_LOCKOUT_MS;
    const canJump = !repopLocked
      && (this.playerState.isGrounded
        || (airborneMs < this.COYOTE_TIME_MS && !this.ollieCoyoteUsed));
    // The grind path spends the pop itself when you ollie off a rail; don't fire twice.
    const popPressed = intent.olliePopped && this.olliePopHandledAt !== this.simTime;

    if (popPressed) {
      this.ollieCharge = Math.max(0.3, intent.ollieCharge || 1);
      // Pressed with no floor to push off: remember it and fire the instant one arrives,
      // so a pop asked for a few frames early lands as a pop instead of as nothing.
      this.ollieBufferedAt = canJump ? -Infinity : this.simTime;
    }
    const bufferedPop = this.playerState.isGrounded
      && (this.simTime - this.ollieBufferedAt) * 1000 < this.OLLIE_BUFFER_MS;

    if ((popPressed && canJump) || bufferedPop) {
      proceduralSounds.playOllie(this.ollieCharge);
      this.ollieBufferedAt = -Infinity;
      if (!this.playerState.isGrounded) this.ollieCoyoteUsed = true;
      this.lastOlliePopAt = this.simTime;
      this.ollieLiftLeft = this.OLLIE_LIFT_SECONDS;

      // A manual you pop out of ends cleanly; the combo survives.
      if (this.balance.isManualing) this.balance.end();

      const v = this.physics.getVelocity(this.chairBody);
      const newVel = v.clone();
      // A floor under the vertical speed, not an overwrite: any residual sink from the
      // ground-stick snap is erased so the takeoff is identical every time. The second
      // term is what makes the pop always DO something — a bare Math.max against v.y
      // silently swallowed the input whenever the chair was already rising faster than
      // the impulse (off a ramp lip, or inside the coyote window on the way up), which is
      // the same button producing two different outcomes.
      newVel.y = Math.max(v.y + this.OLLIE_MIN_GAIN, jumpImpulse * this.ollieCharge);
      newVel.x += fwdFlat.x * 1.5;
      newVel.z += fwdFlat.z * 1.5;
      this.physics.setVelocity(this.chairBody, newVel);
    }

    // HOLD FOR HEIGHT — the pop's extra air lives here rather than in a charge sampled at
    // release. Ends the moment the button goes, the moment you stop rising, or when the
    // cap runs out, so holding longer is never worse and never unbounded.
    if (this.ollieLiftLeft > 0) {
      const v = this.physics.getVelocity(this.chairBody);
      if (!intent.ollieHeld || v.y <= 0) {
        this.ollieLiftLeft = 0;
      } else {
        const slice = Math.min(dt, this.ollieLiftLeft);
        this.ollieLiftLeft -= slice;
        this.physics.setVelocity(
          this.chairBody, new THREE.Vector3(v.x, v.y + this.OLLIE_LIFT * slice, v.z),
        );
      }
    }

    // HANG TIME — bleed a third of gravity off around the apex. Without it a 30 m/s^2
    // world gives a pop that is over before a trick animation can read, and air tricks
    // are the second half of every line. Ramped, not switched: see HANG_FULL_SPEED.
    if (this.playerState.isAirborne) {
      const v = this.physics.getVelocity(this.chairBody);
      const rising = Math.abs(v.y);
      let assist = 0;
      if (rising < this.HANG_FADE_SPEED) {
        const k = rising <= this.HANG_FULL_SPEED ? 1
          : (this.HANG_FADE_SPEED - rising) / (this.HANG_FADE_SPEED - this.HANG_FULL_SPEED);
        assist += this.HANG_ACCEL * k;
      }
      // TRANSITION HANG TIME — "slow down a little bit in the air so it feels like
      // hangtime". Air off a lip gets a SECOND, wider bite out of gravity, scaled by how
      // much of a transition the take-off actually was: a kicker at 25 degrees gets a
      // third of it, a full vert wall gets all of it. Deliberately kept as a gravity
      // reduction around the apex rather than a longer, slower jump — the player should
      // feel weightless at the top, not feel the controls go soft.
      //
      // A flat ollie sees NONE of this (transitionLaunch is 0 unless the take-off surface
      // was steeper than TRANSITION_ANGLE), so the pop the whole game is tuned around is
      // bit-for-bit what it was.
      if (this.transitionLaunch > 0 && rising < this.TRANSITION_HANG_FADE) {
        const k = rising <= this.HANG_FULL_SPEED ? 1
          : (this.TRANSITION_HANG_FADE - rising) / (this.TRANSITION_HANG_FADE - this.HANG_FULL_SPEED);
        assist += this.TRANSITION_HANG_ACCEL * this.transitionLaunch * k;
      }
      if (assist > 0) {
        this.physics.setVelocity(
          this.chairBody, new THREE.Vector3(v.x, v.y + assist * dt, v.z),
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
