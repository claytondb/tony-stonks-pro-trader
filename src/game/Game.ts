/**
 * Main Game class
 * Orchestrates all game systems
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { GrindSystem } from '../physics/GrindSystem';
import { CameraController } from '../rendering/CameraController';
import { TrickDetector, PlayerTrickState } from '../tricks/TrickDetector';
import { TrickDefinition } from '../tricks/TrickRegistry';
import { ComboSystem } from '../tricks/ComboSystem';
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
import { makeFilingCabinet, makePrinter, makeTrashCan, makeWaterCooler } from '../world/OfficeProps';
import { buildOfficeChair, spinCasters, type ChairParts } from '../world/ChairModel';
import { storyProgress, getStoryLevelById, StoryLevelData, StoryCheckpoint } from '../story';
import { ChaseMechanic, ChaseState } from '../story/ChaseMechanic';
import { ChaseHUD } from '../ui/ChaseHUD';
import { DialogueBox } from '../ui/DialogueBox';
import { NPCOfficer } from '../npc/NPCOfficer';

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
  private readonly COYOTE_TIME_MS = 80; // Allow jumping 80ms after leaving ground
  
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
  private physics!: PhysicsWorld;
  private grindSystem!: GrindSystem;
  private grindParticles!: GrindParticles;
  private landingParticles!: LandingParticles;
  private speedLines!: SpeedLines;
  private cameraController!: CameraController;
  private trickDetector!: TrickDetector;
  private comboSystem!: ComboSystem;
  private hud!: HUD;
  private playerModel!: PlayerModel;
  
  // Game objects
  private chair!: THREE.Group;
  private chairBody!: RAPIER.RigidBody;
  private useGLBModel = true; // Set to false to use primitive shapes
  private wheelMeshes: THREE.Object3D[] = []; // Chair wheel meshes for spin animation
  
  // Level objects (can be cleared and reloaded)
  private levelObjects: THREE.Object3D[] = [];
  
  // Pre-loaded GLB models for level objects
  private modelCache: Map<string, THREE.Object3D> = new Map();
  private gltfLoader!: GLTFLoader;
  
  // NPC officers
  private npcOfficers: NPCOfficer[] = [];
  private officerCaughtCooldown = 0;  // Prevent rapid caught events (seconds)
  
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
  private grindBalance = 0.5;
  private grindScore = 0;  // Stonks earned during current grind
  private totalStonks = 0;  // Total stonks earned
  private manualBalance = 0.5;
  private lastTrickTime = 0;
  private queuedTrick: TrickDefinition | null = null;  // Trick input queue
  private spinRotation = 0;
  private cumulativeSpinDegrees = 0;  // Track total spin during air time
  private airStartRotation = 0;  // Chair Y rotation when leaving ground
  private lastGroundedTime = 0;  // Coyote time tracking
  private lastPushSoundTime = 0;  // Cooldown for push sound
  
  // THPS-style surface tracking
  private surfaceNormal = new THREE.Vector3(0, 1, 0);  // Current surface we're on
  private surfaceAngle = 0;  // Angle of surface in degrees (0 = flat)
  private readonly GROUND_SNAP_DISTANCE = 1.5;  // Max distance to snap to ground
  private readonly LAUNCH_ANGLE = 45;  // Surface angle that triggers launch
  
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
    this.input = new InputManager();
  }
  
  private initTricks(): void {
    this.trickDetector = new TrickDetector();
    this.comboSystem = new ComboSystem();
  }
  
  private initUI(): void {
    const overlay = document.getElementById('ui-overlay');
    if (overlay) {
      this.hud = new HUD(overlay);
      
      // Connect combo events to HUD
      this.comboSystem.on((event) => {
        this.hud.onComboEvent(event);
        
        // Update combo display
        const state = this.comboSystem.getState();
        this.hud.updateCombo(state.tricks, state.totalPoints, state.multiplier);
        this.hud.updateComboTimer(state.timeRemaining, 2000); // 2000ms max combo time
        
        // Play sounds based on combo events
        if (event.type === 'combo_landed' && event.totalScore) {
          proceduralSounds.playChaChing(event.totalScore);  // 💰 cha-ching!
          proceduralSounds.playComboLanded(state.multiplier);
          // Impact zoom pulse on big landings (>5000 points)
          this.cameraController.impactZoomPulse(event.totalScore);
          
          // Give speed boost during chase levels when landing tricks
          if (this.chaseMechanic?.isChaseActive()) {
            const boost = Math.min(5, event.totalScore / 2000); // Up to 5 boost from big tricks
            this.chaseMechanic.addSpeedBoost(boost);
          }
        } else if (event.type === 'combo_failed') {
          proceduralSounds.playBail();
          // Shake camera on bail
          this.cameraController.shake(0.8, 0.4);
        }
      });
      
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
        this.speedLines.setIntensity(Math.min(1, amount / 10));
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
      
      // Reset player state
      this.playerState.isGrounded = true;
      this.playerState.isAirborne = false;
      this.comboSystem.reset();
      
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
    
    // Calculate final score
    this.onLevelComplete?.(this.totalStonks, this.levelTime, 0, 0);
  }
  
  private async initPlayer(): Promise<void> {
    // Create chair group
    this.chair = new THREE.Group();
    this.chair.position.set(0, 0, 5); // Start in the middle of the skate area
    this.scene.add(this.chair);
    
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
      this.chair.add(parts.root);
      console.log(`Procedural chair built (${parts.root.userData.triangles} tris, ${parts.casters.length} casters)`);
    } catch (error) {
      console.warn('Failed to build procedural chair, using primitives:', error);
      this.chair.add(this.createChairMesh());
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
        
        this.chair.add(model);
        
        console.log('GLB player model attached to chair');
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
      this.chaseMechanic.createVisuals(this.scene);
      this.chaseHUD?.show();
    } else {
      this.chaseMechanic?.stop();
      this.chaseHUD?.hide();
    }
    
    // Spawn NPC officers for story levels that have them defined
    this.spawnLevelNPCs(level.id);
    
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
    this.grindBalance = 0.5;
    this.manualBalance = 0.5;
    this.spinRotation = 0;
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
    
    // Reset combo
    this.comboSystem.reset();
    
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
    if (this.chairBody) {
      this.physics.setPosition(this.chairBody, new THREE.Vector3(spawn.position[0], spawn.position[1], spawn.position[2]));
      this.physics.setVelocity(this.chairBody, new THREE.Vector3(0, 0, 0));
      this.physics.setRotationY(this.chairBody, spawn.rotation * Math.PI / 180);
    }
    
    // Reset HUD
    this.hud?.reset();
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

    // The office floorplate owns real geometry; free it rather than leaking it.
    if (this.officeInterior) {
      this.scene.remove(this.officeInterior.root);
      disposeOfficeInterior(this.officeInterior);
      this.officeInterior = null;
    }

    // Clear grind system rails
    this.grindSystem.clearRails();
    
    // Clear physics colliders from previous level
    this.physics.clearStaticBodies();
    
    // Dispose and remove NPC officers
    this.clearNPCOfficers();
  }
  
  /**
   * Remove all NPC officers from scene
   */
  private clearNPCOfficers(): void {
    for (const officer of this.npcOfficers) {
      this.scene.remove(officer.getGroup());
      officer.dispose();
    }
    this.npcOfficers = [];
    this.officerCaughtCooldown = 0;
  }
  
  /**
   * Spawn NPC officers for a given level ID
   */
  private spawnLevelNPCs(levelId: string): void {
    // Only spawn for levels that need them
    if (levelId === 'story_1_office') {
      this.spawnOfficeOfficers();
    } else if (levelId === 'story_6_forest' || levelId === 'story_9_finale') {
      // Forest/finale chase levels: add officers to supplement the abstract chase mechanic
      this.spawnChaseOfficers();
    }
  }
  
  /**
   * Spawn 4 officers patrolling the office level (ch1_office)
   * Officers patrol between cubicle rows; switch to chase when player within 15 units
   */
  private spawnOfficeOfficers(): void {
    const officerConfigs = [
      {
        position: new THREE.Vector3(-25, 0, -10),
        patrolPoints: [
          new THREE.Vector3(-25, 0, -30),
          new THREE.Vector3(-25, 0, 5),
        ],
      },
      {
        position: new THREE.Vector3(25, 0, -15),
        patrolPoints: [
          new THREE.Vector3(25, 0, -30),
          new THREE.Vector3(25, 0, 5),
        ],
      },
      {
        position: new THREE.Vector3(0, 0, -25),
        patrolPoints: [
          new THREE.Vector3(-15, 0, -25),
          new THREE.Vector3(15, 0, -25),
        ],
      },
      {
        position: new THREE.Vector3(0, 0, 5),
        patrolPoints: [
          new THREE.Vector3(-10, 0, 5),
          new THREE.Vector3(10, 0, 5),
        ],
      },
    ];
    
    for (const cfg of officerConfigs) {
      const officer = new NPCOfficer(
        {
          position: cfg.position,
          patrolPoints: cfg.patrolPoints,
          detectionRange: 15,
          chaseRange: 25,
          catchRange: 2,
          walkSpeed: 3,
          runSpeed: 6,
        },
        {
          onCaught: () => this.handleOfficerCaught(),
        }
      );
      
      this.npcOfficers.push(officer);
      
      // Load async — add to scene when ready
      officer.load(this.gltfLoader).then((group) => {
        this.scene.add(group);
        console.log('[Game] NPC officer spawned at', cfg.position);
      }).catch((err) => {
        console.warn('[Game] Failed to load NPC officer model:', err);
      });
    }
  }
  
  /**
   * Spawn officers for chase levels (visual pursuers)
   */
  private spawnChaseOfficers(): void {
    const spawnPos = this.currentStoryLevel?.spawnPoint.position;
    if (!spawnPos) return;
    
    const base = new THREE.Vector3(spawnPos[0] - 10, 0, spawnPos[2]);
    
    for (let i = 0; i < 2; i++) {
      const offset = new THREE.Vector3((i - 0.5) * 4, 0, 0);
      const officer = new NPCOfficer(
        {
          position: base.clone().add(offset),
          detectionRange: 999,   // Always chasing
          chaseRange: 999,
          catchRange: 2,
          walkSpeed: 4,
          runSpeed: 8,
        },
        {
          onCaught: () => this.handleOfficerCaught(),
        }
      );
      
      officer.startChase();
      this.npcOfficers.push(officer);
      
      officer.load(this.gltfLoader).then((group) => {
        this.scene.add(group);
        console.log('[Game] Chase NPC officer spawned');
      }).catch((err) => {
        console.warn('[Game] Failed to load chase NPC officer:', err);
      });
    }
  }
  
  /**
   * Handle the "caught" event from an NPC officer
   */
  private handleOfficerCaught(): void {
    // Cooldown to avoid rapid re-triggering
    if (this.officerCaughtCooldown > 0) return;
    this.officerCaughtCooldown = 3; // 3 second cooldown
    
    console.log('[Game] Player caught by officer NPC!');
    this.onOfficerCaught?.();
    
    // Camera shake for impact
    this.cameraController.shake(1.2, 0.5);
    
    // Deduct score penalty
    const penalty = 500;
    this.totalStonks = Math.max(0, this.totalStonks - penalty);
    this.hud?.setScore(Math.floor(this.totalStonks));
    
    // Show brief dialogue
    if (this.dialogueBox) {
      this.dialogueBox.show(['SEC OFFICER: Gotcha! ...wait, he\'s still going?!']);
    }
    
    // Restore from checkpoint if available, else keep going (non-fatal)
    if (this.lastCheckpointIndex >= 0 && this.checkpointPosition) {
      this.restoreCheckpoint();
    }
  }
  
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
    const tint = new THREE.Color(groundColor);
    tint.multiplyScalar(1.9); // the map already carries the mid value
    const groundMaterial = MaterialLibrary.get('asphalt', {
      repeat: [size / 6, size / 6],
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
        mesh = this.createRailMesh(length, railMaterial, metalMaterial);
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
        mesh = this.createRampMesh(woodMaterial);
        // Collider is a thin slab lying on the slope, matching the wedge mesh.
        const rampRot = (data.rotation?.[1] || 0) * Math.PI / 180;
        const slope = Math.atan2(Game.RAMP_H, Game.RAMP_D);
        const cx = Math.sin(rampRot) * 0;
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0] + cx, Game.RAMP_H / 2, data.position[2]),
          new THREE.Vector3(Game.RAMP_W / 2, 0.09, Math.hypot(Game.RAMP_D, Game.RAMP_H) / 2),
          new THREE.Euler(-slope, rampRot, 0)
        );
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
        mesh = this.createFunBoxMesh(concreteMaterial, railMaterial, width, depth, height);
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
  
  private createRailMesh(length: number, railMat: THREE.Material, metalMat: THREE.Material): THREE.Group {
    const group = new THREE.Group();
    
    const railGeom = new THREE.BoxGeometry(length, 0.08, 0.08);
    const rail = new THREE.Mesh(railGeom, railMat);
    rail.position.y = 0.8;
    rail.castShadow = true;
    group.add(rail);
    
    const postGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.8);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeom, metalMat);
      post.position.set(side * (length / 2 - 0.2), 0.4, 0);
      post.castShadow = true;
      group.add(post);
    }
    
    return group;
  }
  
  // Ramp dimensions, shared by the mesh and its collider so they can't drift.
  private static readonly RAMP_W = 3.4;
  private static readonly RAMP_D = 1.8;
  private static readonly RAMP_H = 0.85;

  /**
   * A solid low-poly kicker. The old version was a tilted 4x3 plank floating
   * 60 cm off the carpet on two thin fins, which read as broken geometry and
   * cast a hard rectangular shadow onto nothing.
   */
  private createRampMesh(material: THREE.Material): THREE.Group {
    const group = new THREE.Group();
    const w = Game.RAMP_W / 2;
    const d = Game.RAMP_D / 2;
    const h = Game.RAMP_H;

    // Triangular prism: flat at -Z, rising to full height at +Z.
    const shape = new THREE.Shape();
    shape.moveTo(-d, 0);
    shape.lineTo(d, 0);
    shape.lineTo(d, h);
    shape.closePath();

    const geom = new THREE.ExtrudeGeometry(shape, { depth: Game.RAMP_W, bevelEnabled: false });
    // Extrude runs along +Z; rotate so the slope runs along Z and width along X.
    geom.rotateY(Math.PI / 2);
    geom.translate(0, 0, -w);
    geom.computeVertexNormals();
    const uv = geom.getAttribute('uv');
    if (uv) geom.setAttribute('uv1', uv.clone());

    const wedge = new THREE.Mesh(geom, material);
    wedge.castShadow = true;
    wedge.receiveShadow = true;
    group.add(wedge);

    // Steel nosing along the top lip — reads as an edge highlight and matches
    // the metal trim on the cubicle caps.
    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(Game.RAMP_W + 0.06, 0.07, 0.14),
      MaterialLibrary.get('grindMetal')
    );
    lip.position.set(0, h - 0.02, d - 0.05);
    lip.castShadow = true;
    lip.receiveShadow = true;
    group.add(lip);

    return group;
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
      this.envRig.update(deltaTime, this.chair.position);
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
    // Update input
    this.input.update();
    const input = this.input.getState();
    
    // Hide controls hint on first meaningful input
    if (input.forward || input.brake || input.turnLeft || input.turnRight || 
        input.jump || input.flip || input.grab || input.grind) {
      this.hud?.hideControlsHint();
    }
    
    // Update player state
    this.updatePlayerState(dt);
    
    // Detect and execute tricks (with input queue support)
    const detectedTrick = this.trickDetector.detectTrick(input, this.playerState);
    const now = performance.now();
    const trickCooldownActive = now - this.lastTrickTime < 200; // ~200ms trick animation window
    
    // Queue trick if we're still in a trick animation
    if (detectedTrick && trickCooldownActive && !this.queuedTrick) {
      this.queuedTrick = detectedTrick;
    }
    
    // Determine which trick to execute: queued trick takes priority, then newly detected
    const trickToExecute = !trickCooldownActive 
      ? (this.queuedTrick || detectedTrick)
      : null;
    
    if (trickToExecute) {
      this.comboSystem.addTrick(trickToExecute);
      this.lastTrickTime = now;
      this.queuedTrick = null;  // Clear queue after executing
      proceduralSounds.playTrick(trickToExecute.basePoints);
      
      // Add to special meter
      const prevSpecial = this.specialMeter;
      this.specialMeter = Math.min(1, this.specialMeter + trickToExecute.basePoints / 5000);
      this.hud?.setSpecial(this.specialMeter);
      
      // Special meter just filled
      if (prevSpecial < 1 && this.specialMeter >= 1) {
        proceduralSounds.playSpecialReady();
      }
    }
    
    // Clear queued trick if player lands (no longer airborne)
    if (!this.playerState.isAirborne) {
      this.queuedTrick = null;
    }
    
    // Update grind cooldown
    this.grindSystem.updateCooldown(dt);
    
    // Check for grind initiation (automatic when near a rail)
    if (!this.grindSystem.isGrinding()) {
      const pos = this.physics.getPosition(this.chairBody);
      const vel = this.physics.getVelocity(this.chairBody);
      // Auto-grind: always check for rails, no button required
      const startedGrind = this.grindSystem.tryStartGrind(pos, vel, true);
      
      if (startedGrind) {
        this.playerState.isGrinding = true;
        this.grindBalance = 0.5;
        this.grindScore = 0;  // Reset grind score
        proceduralSounds.playGrindStart();
        proceduralSounds.startGrindLoop();
        proceduralSounds.startBalanceWarning();  // Start balance warning system (initially silent)
        
        // Enable grind camera angle for better rail visibility
        const grindState = this.grindSystem.getState();
        if (grindState.rail) {
          this.cameraController.setGrindCamera(true, grindState.rail.start, grindState.rail.end);
        }
      }
    }
    
    // Update grind if active
    if (this.grindSystem.isGrinding()) {
      // Balance input from A/D keys
      let balanceInput = 0;
      if (input.turnLeft) balanceInput = -1;
      if (input.turnRight) balanceInput = 1;
      
      // Jump off rail
      if (input.jump) {
        this.grindSystem.forceEndGrind();
        this.playerState.isGrinding = false;
        proceduralSounds.stopGrindLoop();
        proceduralSounds.stopBalanceWarning();
        proceduralSounds.playJump();
        // Apply jump impulse
        this.physics.applyImpulse(this.chairBody, new THREE.Vector3(0, 10, 0));
        // Disable grind camera angle
        this.cameraController.setGrindCamera(false);
      } else {
        // Update grind physics with upgrade-modified balance drift
        this.grindSystem.updateGrind(dt, balanceInput, this.physics, this.chairBody, this.grindBalanceDrift * 2);
        
        // Update balance display
        const grindState = this.grindSystem.getState();
        this.grindBalance = grindState.balance;
        
        // Update balance warning sound (gets louder/higher pitch near edges)
        proceduralSounds.updateBalanceWarning(this.grindBalance);
        
        // Earn stonks while grinding (10 per second base, up to 50 with good balance)
        const balanceBonus = 1 + Math.abs(0.5 - grindState.balance) * -4 + 2;  // Better balance = more stonks
        const stonksPerSecond = 10 * Math.max(1, balanceBonus);
        this.grindScore += stonksPerSecond * dt;
        this.totalStonks += stonksPerSecond * dt;
        this.hud?.setScore(Math.floor(this.totalStonks));
        
        // Update grind particles with sparks
        if (grindState.rail) {
          const grindPos = new THREE.Vector3().lerpVectors(
            grindState.rail.start,
            grindState.rail.end,
            grindState.progress
          );
          grindPos.y += 0.1;  // Slightly above rail
          this.grindParticles.update(dt, true, grindPos, grindState.rail.direction);
        }
        
        // Check if grind ended
        if (!this.grindSystem.isGrinding()) {
          this.playerState.isGrinding = false;
          proceduralSounds.stopGrindLoop();
          proceduralSounds.stopBalanceWarning();
          // Disable grind camera angle
          this.cameraController.setGrindCamera(false);
        }
      }
    } else {
      // Apply normal movement forces
      this.applyMovement(input, dt);
      
      // Update particles (not grinding)
      this.grindParticles.update(dt, false);
    }
    
    // Always update landing particles
    this.landingParticles.update(dt);
    
    // Step physics (but not during grinding - grind system controls position)
    if (!this.grindSystem.isGrinding()) {
      this.physics.step(dt);
    }
    
    // Sync visual to physics (or grind position)
    const pos = this.physics.getPosition(this.chairBody);
    const rot = this.physics.getRotation(this.chairBody);
    
    this.chair.position.copy(pos);
    this.chair.quaternion.copy(rot);
    
    // Apply spin rotation (visual only during air)
    if (this.playerState.isAirborne && this.spinRotation !== 0) {
      this.chair.rotation.y += this.spinRotation * dt;
    }
    
    // Update camera
    this.cameraController.update(dt);
    
    // Update wheel roll sound based on speed
    const currentVel = this.physics.getVelocity(this.chairBody);
    const currentSpeed = new THREE.Vector3(currentVel.x, 0, currentVel.z).length();
    proceduralSounds.updateWheelRoll(currentSpeed, this.playerState.isGrounded && !this.playerState.isGrinding);
    
    // Caster animation: forks trail the direction of travel, tyres roll at v/r.
    // Must run AFTER the chair transform is written this frame.
    if (this.chairParts) {
      spinCasters(this.chairParts, currentSpeed, dt);
    } else if (this.wheelMeshes.length > 0 && this.playerState.isGrounded && !this.playerState.isGrinding) {
      const rotationDelta = (currentSpeed / 0.025) * dt;
      for (const wheel of this.wheelMeshes) wheel.rotation.x += rotationDelta;
    }

    // Update speed lines effect (radial blur at high speeds)
    this.speedLines.update(dt, currentSpeed, this.playerState.isGrounded);

    // Update speed stock-chart HUD
    this.hud?.setSpeed(currentSpeed);
    
    // Update dynamic FOV based on speed (wider FOV at high speeds)
    this.cameraController.updateFOVFromSpeed(currentSpeed, 18);
    
    // Update trick zoom (zoom out slightly during air time for better trick visibility)
    this.cameraController.setTrickZoom(this.playerState.isAirborne, this.playerState.airTime);
    
    // Update combo system
    this.comboSystem.update(dt);
    
    // Update combo timer bar every frame for smooth animation
    if (this.hud && this.comboSystem.hasActiveCombo()) {
      const comboState = this.comboSystem.getState();
      this.hud.updateComboTimer(comboState.timeRemaining, 2000);
    }
    
    // Update HUD balance meter
    if (this.playerState.isGrinding || this.playerState.isManualing) {
      this.hud?.setBalanceVisible(true);
      this.hud?.setBalance(this.playerState.isGrinding ? this.grindBalance : this.manualBalance);
    } else {
      this.hud?.setBalanceVisible(false);
    }
    
    // Update player model animations
    if (this.playerModel && this.useGLBModel) {
      this.playerModel.update(dt);
      this.updatePlayerAnimation(input);
    }
    
    // Update story-specific systems
    this.updateStorySystems(dt);
    
    // Clear just-pressed keys after processing
    this.input.clearJustPressed();
  }
  
  /**
   * Update story-specific systems (checkpoints, chase, etc.)
   */
  private updateStorySystems(dt: number): void {
    // Update level time
    this.levelTime += dt;
    
    // Check for checkpoint triggers
    this.updateCheckpoints();
    
    // Update chase mechanic if active
    if (this.chaseMechanic?.isChaseActive()) {
      const vel = this.physics.getVelocity(this.chairBody);
      const playerSpeed = new THREE.Vector3(vel.x, 0, vel.z).length();
      
      this.chaseMechanic.update(dt, playerSpeed, this.chair.position);
      this.chaseMechanic.updateVisuals(this.chair.position, this.chair.rotation.y);
      
      // Update chase HUD
      if (this.chaseHUD) {
        this.chaseHUD.update(this.chaseMechanic.getState());
      }
    }
    
    // Update NPC officers
    if (this.npcOfficers.length > 0) {
      // Tick caught cooldown
      if (this.officerCaughtCooldown > 0) {
        this.officerCaughtCooldown -= dt;
      }
      
      const playerPos = this.chair.position;
      for (const officer of this.npcOfficers) {
        officer.update(dt, playerPos);
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
  private updatePlayerAnimation(input: ReturnType<InputManager['getState']>): void {
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
        if (input.forward) {
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
        if (input.forward && speed < 8 && this.playerState.isGrounded) {
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
    
    // Cast rays downward to find the surface
    const groundCheck = this.physics.raycastGroundMulti(pos, 0.3, this.GROUND_SNAP_DISTANCE);
    
    if (groundCheck && groundCheck.distance < this.GROUND_SNAP_DISTANCE) {
      // We're near a surface
      this.surfaceNormal.copy(groundCheck.normal);
      this.surfaceAngle = groundCheck.surfaceAngle;
      
      // Grounded if close enough and not moving too fast upward
      const closeEnough = groundCheck.distance < 0.9; // Capsule radius + small buffer
      const notLaunching = vel.y < 5; // Not actively jumping up
      
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
      
      // THPS-style: snap to surface when grounded (follow ramps smoothly)
      if (this.playerState.isGrounded && groundCheck.distance > 0.5 && groundCheck.distance < 0.85) {
        // Gently push player toward surface
        const snapForce = (0.8 - groundCheck.distance) * 15;
        const newVel = vel.clone();
        newVel.y -= snapForce;
        this.physics.setVelocity(this.chairBody, newVel);
      }
    } else {
      // No ground detected - airborne
      this.playerState.isGrounded = false;
      this.surfaceNormal.set(0, 1, 0);
      this.surfaceAngle = 0;
    }
    
    this.playerState.isAirborne = !this.playerState.isGrounded;
    
    // Track last grounded time for coyote time
    if (this.playerState.isGrounded) {
      this.lastGroundedTime = performance.now();
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
      this.cumulativeSpinDegrees = 0;
    }
    
    // Landing detection
    if (!wasGrounded && this.playerState.isGrounded) {
      // Just landed
      proceduralSounds.playLand();
      
      // Calculate landing intensity based on air time (0-1)
      const landingIntensity = Math.min(1, this.playerState.airTime / 1500);
      
      // Spawn landing dust particles
      if (landingIntensity > 0.1) {
        this.landingParticles.spawn(pos.clone(), landingIntensity);
      }
      
      // Camera shake on impact (stronger for bigger air or combo lands)
      let impactShake = Math.min(0.3, this.playerState.airTime / 2000);
      
      if (this.comboSystem.hasActiveCombo()) {
        // Bigger shake for successful combo landing
        const comboState = this.comboSystem.getState();
        impactShake = Math.min(0.5, impactShake + comboState.multiplier * 0.05);
        this.comboSystem.land();
        // playComboLanded is called via combo event
      }
      
      if (impactShake > 0.05) {
        this.cameraController.shake(impactShake, 0.2);
      }

      // Screen-space impact punch (zoom + flash), decays over ~0.3s.
      this.postFX?.pulse(Math.min(1, 0.25 + landingIntensity * 0.75));

      this.spinRotation = 0;
      this.cumulativeSpinDegrees = 0;
      this.hud?.setSpinCounter(0);  // Hide spin counter on landing
    }
    
    // Update special availability
    this.playerState.hasSpecial = this.specialMeter >= 1;
    
    // Drain special meter slowly
    if (this.playerState.hasSpecial) {
      this.specialMeter = Math.max(0, this.specialMeter - dt * 0.1);
      this.hud?.setSpecial(this.specialMeter);
    }
  }
  
  private applyMovement(input: ReturnType<InputManager['getState']>, _dt: number): void {
    // Only allow full movement when mounted on chair
    if (!this.isMounted) {
      // When standing, only allow turning the chair to face it
      if (input.turnLeft) {
        this.physics.setAngularVelocity(this.chairBody, new THREE.Vector3(0, 1.5, 0));
      } else if (input.turnRight) {
        this.physics.setAngularVelocity(this.chairBody, new THREE.Vector3(0, -1.5, 0));
      } else {
        this.physics.setAngularVelocity(this.chairBody, new THREE.Vector3(0, 0, 0));
      }
      return;
    }
    
    // THPS-style physics - snappy and responsive
    // Apply upgrade multipliers from story mode
    const accelSpeed = 0.4 * this.speedMultiplier;      // W/S - velocity boost per frame
    const jumpImpulse = 10 * this.jumpMultiplier;        // Space - ollie (snappy)
    const spinTorque = 6 * this.spinMultiplier;         // Q/E - spin in air
    const maxSpeed = 18 * this.speedMultiplier;         // Cap forward speed
    
    // Get chair orientation and velocity
    // +Z is forward (away from camera), matching CameraController expectations
    const chairRotation = this.physics.getRotation(this.chairBody);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(chairRotation);
    const velocity = this.physics.getVelocity(this.chairBody);
    const currentSpeed = new THREE.Vector3(velocity.x, 0, velocity.z).length();
    
    // THPS-style: Get movement direction along the surface (for ramps)
    const surfaceForward = this.physics.getSurfaceMovementDirection(forward, this.surfaceNormal);
    
    // FORWARD (W) - Push in facing direction (follows surface on ramps!)
    if (input.forward && this.playerState.isGrounded) {
      if (currentSpeed < maxSpeed) {
        // Use surface-relative direction for smooth ramp riding
        const boost = surfaceForward.clone().multiplyScalar(accelSpeed);
        const newVel = velocity.clone();
        newVel.x += boost.x;
        newVel.y += boost.y; // This is key - adds vertical component on ramps!
        newVel.z += boost.z;
        this.physics.setVelocity(this.chairBody, newVel);
        
        // Play push sound with cooldown (every 400ms max)
        const now = performance.now();
        if (now - this.lastPushSoundTime > 400) {
          proceduralSounds.playPush();
          this.lastPushSoundTime = now;
        }
      }
    }
    
    // BACKWARD (S) - Move backward (also follows surface)
    if (input.brake && this.playerState.isGrounded) {
      if (currentSpeed < maxSpeed) {
        const boost = surfaceForward.clone().multiplyScalar(-accelSpeed * 0.6);
        const newVel = velocity.clone();
        newVel.x += boost.x;
        newVel.y += boost.y;
        newVel.z += boost.z;
        this.physics.setVelocity(this.chairBody, newVel);
      }
    }
    
    // On steep ramps going up, preserve momentum
    if (this.playerState.isGrounded && this.surfaceAngle > 20) {
      // Reduce gravity effect on ramps to maintain speed
      const gravityReduction = Math.min(0.8, this.surfaceAngle / 60);
      const newVel = velocity.clone();
      newVel.y += gravityReduction * 0.3; // Counter some gravity
      this.physics.setVelocity(this.chairBody, newVel);
    }
    
    // TURNING (A/D) - Rotate left/right (direct angular velocity)
    // THPS-style: instant, responsive turning
    const turnSpeed = 4.5;  // Radians per second - snappy! (was 2.5)
    const airTurnSpeed = 3.5;  // Tightened air control (was 2.5) - more responsive tricks
    
    if (input.turnLeft) {
      const speed = this.playerState.isGrounded ? turnSpeed : airTurnSpeed;
      this.physics.setAngularVelocity(this.chairBody, new THREE.Vector3(0, speed, 0));
    } else if (input.turnRight) {
      const speed = this.playerState.isGrounded ? turnSpeed : airTurnSpeed;
      this.physics.setAngularVelocity(this.chairBody, new THREE.Vector3(0, -speed, 0));
    } else {
      // Stop rotation when not turning - instant stop for responsiveness
      this.physics.setAngularVelocity(this.chairBody, new THREE.Vector3(0, 0, 0));
    }
    
    // JUMP (Space) - Ollie with coyote time + jump buffer
    // Coyote time: can jump briefly after leaving ground
    const withinCoyoteTime = performance.now() - this.lastGroundedTime < this.COYOTE_TIME_MS;
    const canJump = this.playerState.isGrounded || withinCoyoteTime;
    
    // Jump buffer: pressing jump slightly before landing still triggers jump on land
    const wantsJump = input.jump || this.input.isJumpBuffered();
    
    if (wantsJump && canJump) {
      proceduralSounds.playJump();
      // Clear the jump buffer so we don't double-jump
      this.input.clearJumpBuffer();
      // Reset coyote time so we can't double-jump
      this.lastGroundedTime = 0;
      // Set vertical velocity directly for reliable jumping
      const newVel = velocity.clone();
      newVel.y = jumpImpulse;
      // Add slight forward boost
      newVel.x += forward.x * 2;
      newVel.z += forward.z * 2;
      this.physics.setVelocity(this.chairBody, newVel);
    }
    
    // SPIN (Q/E) - Rotate in air
    if (this.playerState.isAirborne) {
      if (input.spinLeft) {
        this.spinRotation = spinTorque;
        this.physics.applyTorque(this.chairBody, new THREE.Vector3(0, spinTorque, 0));
      } else if (input.spinRight) {
        this.spinRotation = -spinTorque;
        this.physics.applyTorque(this.chairBody, new THREE.Vector3(0, -spinTorque, 0));
      } else {
        this.spinRotation = 0;
      }
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
