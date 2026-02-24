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
import { ComboSystem } from '../tricks/ComboSystem';
import { HUD } from '../ui/HUD';
import { PlayerModel } from '../player/PlayerModel';
import { proceduralSounds } from '../audio/ProceduralSounds';
import { GrindParticles } from '../effects/GrindParticles';
import { LevelData, LevelObject } from '../levels/LevelData';

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
  
  // Constants
  private readonly PHYSICS_TIMESTEP = 1 / 60;
  private readonly MAX_FRAME_SKIP = 5;
  
  // Three.js
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  
  // Systems
  private input!: InputManager;
  private physics!: PhysicsWorld;
  private grindSystem!: GrindSystem;
  private grindParticles!: GrindParticles;
  private cameraController!: CameraController;
  private trickDetector!: TrickDetector;
  private comboSystem!: ComboSystem;
  private hud!: HUD;
  private playerModel!: PlayerModel;
  
  // Game objects
  private chair!: THREE.Group;
  private chairBody!: RAPIER.RigidBody;
  private useGLBModel = true; // Set to false to use primitive shapes
  
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
  private grindBalance = 0.5;
  private grindScore = 0;  // Stonks earned during current grind
  private totalStonks = 0;  // Total stonks earned
  private manualBalance = 0.5;
  private lastTrickTime = 0;
  private spinRotation = 0;
  
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
      
      report(20, 'Loading physics engine...');
      // Initialize physics (async WASM load)
      this.physics = new PhysicsWorld();
      await this.physics.init();
      
      report(40, 'Configuring input...');
      this.initInput();
      
      report(45, 'Setting up grind system...');
      this.grindSystem = new GrindSystem();
      this.grindParticles = new GrindParticles(this.scene);
      
      report(50, 'Loading trick system...');
      this.initTricks();
      
      report(55, 'Building UI...');
      this.initUI();
      
      report(60, 'Loading player model...');
      await this.initPlayer();
      
      report(75, 'Loading level assets...');
      await this.preloadLevelModels();
      
      report(85, 'Building environment...');
      this.initEnvironment();
      
      report(95, 'Initializing audio...');
      // Initialize procedural audio
      proceduralSounds.init();
      
      // Handle window resize
      window.addEventListener('resize', this.onResize.bind(this));
      
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
    this.scene.background = new THREE.Color(0x87CEEB);
    this.scene.fog = new THREE.Fog(0x87CEEB, 50, 200);
    
    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 5, -10);
    this.camera.lookAt(0, 0, 0);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);
    
    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.position.set(50, 100, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 200;
    sunLight.shadow.camera.left = -50;
    sunLight.shadow.camera.right = 50;
    sunLight.shadow.camera.top = 50;
    sunLight.shadow.camera.bottom = -50;
    this.scene.add(sunLight);
    
    // Camera controller
    this.cameraController = new CameraController(this.camera);
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
        
        // Play sounds based on combo events
        if (event.type === 'combo_landed' && event.totalScore) {
          proceduralSounds.playComboLanded(state.multiplier);
        } else if (event.type === 'combo_failed') {
          proceduralSounds.playBail();
          // Shake camera on bail
          this.cameraController.shake(0.8, 0.4);
        }
      });
    }
  }
  
  private async initPlayer(): Promise<void> {
    // Create chair group
    this.chair = new THREE.Group();
    this.chair.position.set(0, 0, 5); // Start in the middle of the skate area
    this.scene.add(this.chair);
    
    const loader = new GLTFLoader();
    
    // Load chair GLB model
    try {
      const chairGltf = await loader.loadAsync('./models/chair.glb');
      const chairModel = chairGltf.scene;
      
      // Chair model - larger scale
      chairModel.scale.set(0.35, 0.35, 0.35);
      chairModel.position.set(0, -0.3, 0);  // Offset to sit on ground
      // Model's natural +Z should face forward (away from camera)
      
      // Enable shadows
      chairModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      
      this.chair.add(chairModel);
      console.log('Chair GLB model loaded');
    } catch (error) {
      console.warn('Failed to load chair GLB, using primitives:', error);
      // Fallback to primitive chair
      const primitiveChair = this.createChairMesh();
      this.chair.add(primitiveChair);
    }
    
    // Load GLB player model if enabled
    if (this.useGLBModel) {
      try {
        this.playerModel = new PlayerModel();
        const model = await this.playerModel.load();
        
        // Position player centered on chair (handled by PlayerModel.update to prevent root motion drift)
        // Start in standing position (behind chair)
        this.playerModel.setLocalPosition(0, 0, -1.2);
        model.position.set(0, 0, -1.2);
        model.rotation.y = 0;
        
        // Start in standing idle
        this.playerModel.play('idle');
        this.isMounted = false;
        this.animState = 'standing';
        
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
      'cubicle': './models/cubicle.glb',
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
    
    // Sky color
    this.scene.background = new THREE.Color(0x87CEEB);
    
    // Add gradient sky sphere
    const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x4A90D9) },
        bottomColor: { value: new THREE.Color(0xFFFFFF) },
        offset: { value: 20 },
        exponent: { value: 0.6 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide
    });
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    this.scene.add(sky);
    this.levelObjects.push(sky);  // Track for clearing
    
    // Ground plane with grid texture
    const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize, 50, 50);
    
    // Create grid texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#555555';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 16; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 32, 0);
      ctx.lineTo(i * 32, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * 32);
      ctx.lineTo(512, i * 32);
      ctx.stroke();
    }
    
    const groundTexture = new THREE.CanvasTexture(canvas);
    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(40, 40);  // More repeats for bigger ground
    
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      map: groundTexture,
      roughness: 0.9
    });
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
    requestAnimationFrame(this.loop.bind(this));
  }
  
  pause(): void {
    this.isPaused = true;
  }
  
  resume(): void {
    this.isPaused = false;
    this.lastTime = performance.now(); // Reset to avoid time jump
  }
  
  /**
   * Load a level by ID
   */
  loadLevel(levelId: string): void {
    console.log(`Loading level: ${levelId}`);
    this.currentLevelId = levelId;
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
    
    // Reset mount state - start standing behind chair
    this.isMounted = false;
    this.animState = 'standing';
    this.updatePlayerMountPosition();
    if (this.playerModel) {
      this.playerModel.play('idle');
    }
    
    // Reset combo
    this.comboSystem.reset();
    
    // For now, just reset player position
    // TODO: Use LevelManager to load proper level
    if (this.chairBody) {
      this.physics.setPosition(this.chairBody, new THREE.Vector3(0, 0.5, 5));
      this.physics.setVelocity(this.chairBody, new THREE.Vector3(0, 0, 0));
      this.physics.setRotationY(this.chairBody, 0);
    }
    
    // Reset HUD
    this.hud?.reset();
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
    
    // Reset mount state - start standing behind chair
    this.isMounted = false;
    this.animState = 'standing';
    this.updatePlayerMountPosition();
    if (this.playerModel) {
      this.playerModel.play('idle');
    }
    
    // Reset combo
    this.comboSystem.reset();
    
    // Clear existing level objects
    this.clearLevelObjects();
    
    // Update environment settings
    this.scene.background = new THREE.Color(level.skyColor);
    if (level.fogColor) {
      this.scene.fog = new THREE.Fog(level.fogColor, level.fogNear || 50, level.fogFar || 200);
    }
    
    // Load level objects
    this.loadLevelObjects(level.objects, level.groundSize);
    
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
    
    // Clear grind system rails
    this.grindSystem.clearRails();
  }
  
  /**
   * Load objects from level data
   */
  private loadLevelObjects(objects: LevelObject[], groundSize: number): void {
    // Create ground for the level
    this.createLevelGround(groundSize);
    
    // Create each object
    for (const objData of objects) {
      const mesh = this.createLevelObject(objData);
      if (mesh) {
        this.scene.add(mesh);
        this.levelObjects.push(mesh);
      }
    }
  }
  
  /**
   * Create ground plane for a level
   */
  private createLevelGround(size: number): void {
    const groundGeometry = new THREE.PlaneGeometry(size, size, 50, 50);
    
    // Create grid texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#555555';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 16; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 32, 0);
      ctx.lineTo(i * 32, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * 32);
      ctx.lineTo(512, i * 32);
      ctx.stroke();
    }
    
    const groundTexture = new THREE.CanvasTexture(canvas);
    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(size / 5, size / 5);
    
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      map: groundTexture,
      roughness: 0.9
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
    
    const railMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xcccccc, metalness: 0.8, roughness: 0.2
    });
    const woodMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B4513, roughness: 0.7
    });
    const concreteMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666, roughness: 0.9
    });
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888, metalness: 0.6, roughness: 0.4
    });
    const officeMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a4a5e, roughness: 0.7
    });
    
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
      
      case 'ramp':
        mesh = this.createRampMesh(woodMaterial);
        // Add physics
        const rampRot = data.rotation?.[1] || 0;
        this.physics.createStaticBox(
          new THREE.Vector3(data.position[0], 0.5, data.position[2]),
          new THREE.Vector3(2.2, 0.2, 1.8),
          new THREE.Euler(-Math.PI / 12, rampRot * Math.PI / 180, 0)
        );
        break;
        
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
        break;
      }
      
      case 'cubicle': {
        // Try to use GLB model
        const cubCached = this.modelCache.get('cubicle');
        if (cubCached) {
          mesh = cubCached.clone();
        } else {
          // Fallback to procedural mesh
          const width = (data.params?.width as number) || 3;
          const depth = (data.params?.depth as number) || 3;
          mesh = this.createCubicleMesh(officeMaterial, woodMaterial, width, depth);
        }
        break;
      }
      
      case 'car':
        mesh = this.createCarMesh();
        break;
        
      case 'bench':
        mesh = this.createBenchMesh(woodMaterial, metalMaterial);
        break;
        
      case 'planter':
        mesh = this.createPlanterMesh(concreteMaterial);
        break;
        
      case 'water_cooler':
        mesh = this.createWaterCoolerMesh();
        break;
        
      case 'trash_can':
        mesh = this.createTrashCanMesh(metalMaterial);
        break;
        
      case 'cone':
        mesh = this.createConeMesh();
        break;
        
      case 'barrier': {
        const length = (data.params?.length as number) || 5;
        mesh = this.createBarrierMesh(metalMaterial, length);
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
  
  private createRampMesh(material: THREE.Material): THREE.Group {
    const group = new THREE.Group();
    
    const rampGeom = new THREE.BoxGeometry(4, 0.15, 3);
    const ramp = new THREE.Mesh(rampGeom, material);
    ramp.position.set(0, 0.6, 0);
    ramp.rotation.x = -Math.PI / 8;
    ramp.castShadow = true;
    group.add(ramp);
    
    const sideGeom = new THREE.BoxGeometry(0.1, 0.8, 3.2);
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(sideGeom, material);
      wall.position.set(side * 2, 0.4, 0);
      group.add(wall);
    }
    
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
  
  private createCubicleMesh(wallMat: THREE.Material, deskMat: THREE.Material, width: number, depth: number): THREE.Group {
    const height = 1.5;
    const group = new THREE.Group();
    
    const wallGeom = new THREE.BoxGeometry(width, height, 0.05);
    const backWall = new THREE.Mesh(wallGeom, wallMat);
    backWall.position.set(0, height / 2, depth / 2);
    group.add(backWall);
    
    const sideWallGeom = new THREE.BoxGeometry(0.05, height, depth);
    for (const side of [-1, 1]) {
      const sideWall = new THREE.Mesh(sideWallGeom, wallMat);
      sideWall.position.set(side * width / 2, height / 2, 0);
      group.add(sideWall);
    }
    
    const deskGeom = new THREE.BoxGeometry(width * 0.8, 0.05, depth * 0.4);
    const desk = new THREE.Mesh(deskGeom, deskMat);
    desk.position.set(0, 0.75, depth * 0.2);
    group.add(desk);
    
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
  
  private createWaterCoolerMesh(): THREE.Group {
    const group = new THREE.Group();
    
    const bodyGeom = new THREE.CylinderGeometry(0.2, 0.25, 1, 12);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6688aa });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.5;
    group.add(body);
    
    const jugGeom = new THREE.CylinderGeometry(0.15, 0.18, 0.4, 12);
    const jugMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.6 });
    const jug = new THREE.Mesh(jugGeom, jugMat);
    jug.position.y = 1.2;
    group.add(jug);
    
    return group;
  }
  
  private createTrashCanMesh(material: THREE.Material): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(0.25, 0.2, 0.6, 12);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.3;
    return mesh;
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
  
  stop(): void {
    this.isRunning = false;
  }
  
  private loop(currentTime: number): void {
    if (!this.isRunning) return;
    
    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;
    
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
    
    // Always render (even when paused)
    this.render();
    
    requestAnimationFrame(this.loop.bind(this));
  }
  
  private fixedUpdate(dt: number): void {
    // Update input
    this.input.update();
    const input = this.input.getState();
    
    // Update player state
    this.updatePlayerState(dt);
    
    // Detect and execute tricks
    const trick = this.trickDetector.detectTrick(input, this.playerState);
    if (trick && performance.now() - this.lastTrickTime > trick.duration) {
      this.comboSystem.addTrick(trick);
      this.lastTrickTime = performance.now();
      proceduralSounds.playTrick();
      
      // Add to special meter
      const prevSpecial = this.specialMeter;
      this.specialMeter = Math.min(1, this.specialMeter + trick.basePoints / 5000);
      this.hud?.setSpecial(this.specialMeter);
      
      // Special meter just filled
      if (prevSpecial < 1 && this.specialMeter >= 1) {
        proceduralSounds.playSpecialReady();
      }
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
        proceduralSounds.playJump();
        // Apply jump impulse
        this.physics.applyImpulse(this.chairBody, new THREE.Vector3(0, 10, 0));
      } else {
        // Update grind physics
        this.grindSystem.updateGrind(dt, balanceInput, this.physics, this.chairBody);
        
        // Update balance display
        const grindState = this.grindSystem.getState();
        this.grindBalance = grindState.balance;
        
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
        }
      }
    } else {
      // Apply normal movement forces
      this.applyMovement(input, dt);
      
      // Update particles (not grinding)
      this.grindParticles.update(dt, false);
    }
    
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
    
    // Update combo system
    this.comboSystem.update(dt);
    
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
    
    // Clear just-pressed keys after processing
    this.input.clearJustPressed();
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
        this.playerModel.play('push', { loop: false });
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
          this.playerModel.play('push', { loop: false });
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
      // Mounted: player sits on chair
      this.playerModel.setLocalPosition(-0.2, -0.4, 0);
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
    
    // Ground detection - capsule collider (halfHeight=0.3, radius=0.4) rests at ~0.7-0.8
    const wasGrounded = this.playerState.isGrounded;
    this.playerState.isGrounded = pos.y < 1.0 && Math.abs(vel.y) < 2.0;
    this.playerState.isAirborne = !this.playerState.isGrounded;
    
    // Track air time
    if (this.playerState.isAirborne) {
      this.playerState.airTime += dt * 1000;
    } else {
      this.playerState.airTime = 0;
    }
    
    // Landing detection
    if (!wasGrounded && this.playerState.isGrounded) {
      // Just landed
      proceduralSounds.playLand();
      if (this.comboSystem.hasActiveCombo()) {
        this.comboSystem.land();
        // playComboLanded is called via combo event
      }
      this.spinRotation = 0;
      
      // Small camera shake on impact (stronger for bigger air)
      const impactShake = Math.min(0.3, this.playerState.airTime / 2000);
      if (impactShake > 0.05) {
        this.cameraController.shake(impactShake, 0.15);
      }
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
    const accelSpeed = 0.4;      // W/S - velocity boost per frame
    const jumpImpulse = 8;       // Space - ollie
    const spinTorque = 6;        // Q/E - spin in air
    const maxSpeed = 18;         // Cap forward speed
    
    // Get chair orientation and velocity
    // +Z is forward (away from camera), matching CameraController expectations
    const chairRotation = this.physics.getRotation(this.chairBody);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(chairRotation);
    const velocity = this.physics.getVelocity(this.chairBody);
    const currentSpeed = new THREE.Vector3(velocity.x, 0, velocity.z).length();
    
    // FORWARD (W) - Push in facing direction
    if (input.forward && this.playerState.isGrounded) {
      if (currentSpeed < maxSpeed) {
        // Directly add to velocity for reliable movement
        const boost = forward.clone().multiplyScalar(accelSpeed);
        const newVel = velocity.clone();
        newVel.x += boost.x;
        newVel.z += boost.z;
        this.physics.setVelocity(this.chairBody, newVel);
      }
    }
    
    // BACKWARD (S) - Move backward
    if (input.brake && this.playerState.isGrounded) {
      if (currentSpeed < maxSpeed) {
        const boost = forward.clone().multiplyScalar(-accelSpeed * 0.6); // Slower backward
        const newVel = velocity.clone();
        newVel.x += boost.x;
        newVel.z += boost.z;
        this.physics.setVelocity(this.chairBody, newVel);
      }
    }
    
    // TURNING (A/D) - Rotate left/right (direct angular velocity)
    const turnSpeed = 2.5;  // Radians per second
    const airTurnSpeed = 1.5;
    
    if (input.turnLeft) {
      const speed = this.playerState.isGrounded ? turnSpeed : airTurnSpeed;
      this.physics.setAngularVelocity(this.chairBody, new THREE.Vector3(0, speed, 0));
    } else if (input.turnRight) {
      const speed = this.playerState.isGrounded ? turnSpeed : airTurnSpeed;
      this.physics.setAngularVelocity(this.chairBody, new THREE.Vector3(0, -speed, 0));
    } else {
      // Stop rotation when not turning
      this.physics.setAngularVelocity(this.chairBody, new THREE.Vector3(0, 0, 0));
    }
    
    // JUMP (Space) - Ollie
    if (input.jump && this.playerState.isGrounded) {
      proceduralSounds.playJump();
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
    this.renderer.render(this.scene, this.camera);
  }
  
  private onResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    
    this.renderer.setSize(width, height);
  }
}
