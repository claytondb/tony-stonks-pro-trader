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
// TODO: Integrate LevelManager
// import { LevelManager } from '../levels/LevelManager';

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
  private cameraController!: CameraController;
  private trickDetector!: TrickDetector;
  private comboSystem!: ComboSystem;
  private hud!: HUD;
  private playerModel!: PlayerModel;
  
  // Game objects
  private chair!: THREE.Group;
  private chairBody!: RAPIER.RigidBody;
  private useGLBModel = true; // Set to false to use primitive shapes
  
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
  private manualBalance = 0.5;
  private lastTrickTime = 0;
  private spinRotation = 0;
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }
  
  async init(): Promise<void> {
    console.log('Game.init() starting...');
    
    try {
      this.initRenderer();
      console.log('Renderer initialized');
      
      this.initScene();
      console.log('Scene initialized');
      
      // Initialize physics (async WASM load)
      this.physics = new PhysicsWorld();
      await this.physics.init();
      console.log('Physics initialized');
      
      this.initInput();
      console.log('Input initialized');
      
      this.grindSystem = new GrindSystem();
      console.log('Grind system initialized');
      
      this.initTricks();
      console.log('Tricks initialized');
      
      this.initUI();
      console.log('UI initialized');
      
      await this.initPlayer();
      console.log('Player initialized');
      
      this.initEnvironment();
      console.log('Environment initialized');
      
      // Initialize procedural audio
      proceduralSounds.init();
      console.log('Audio initialized');
      
      // Handle window resize
      window.addEventListener('resize', this.onResize.bind(this));
      
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
      
      // Chair at 1/4 size as requested
      chairModel.scale.set(0.2, 0.2, 0.2);
      chairModel.position.set(0, 0, 0);
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
        
        // Position player on/behind chair
        model.position.set(0, 0.1, -0.15);
        model.rotation.y = 0;
        
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
  
  private initEnvironment(): void {
    // Ground plane with grid texture
    const groundSize = 100;
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
    groundTexture.repeat.set(20, 20);
    
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      map: groundTexture,
      roughness: 0.9
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    
    // Add ground to physics
    this.physics.createGround();
    
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
    
    // Rail support posts
    const postGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.8);
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });
    
    for (let i = -1; i <= 1; i += 2) {
      const post = new THREE.Mesh(postGeometry, postMaterial);
      post.position.set(x + i * (length / 2 - 0.2), 0.4, z);
      post.castShadow = true;
      this.scene.add(post);
    }
    
    // Physics
    this.physics.createStaticBox(
      new THREE.Vector3(x, 0.8, z),
      new THREE.Vector3(length / 2, 0.04, 0.04)
    );
    
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
    
    // Physics
    this.physics.createStaticBox(
      new THREE.Vector3(x, 0.8, z),
      new THREE.Vector3(length / 2, 0.04, 0.04),
      new THREE.Euler(0, rotation, 0)
    );
    
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
    
    // Physics (simplified as rotated box)
    const physPos = new THREE.Vector3(x, 0.6, z);
    this.physics.createStaticBox(
      physPos,
      new THREE.Vector3(2, 0.08, 1.5),
      new THREE.Euler(-Math.PI / 8, rotation, 0)
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
    
    const topRail2 = new THREE.Mesh(railGeometry, railMaterial);
    topRail2.position.set(0, 0.85, -5 + 1.5);
    this.scene.add(topRail2);
    
    // Physics
    this.physics.createStaticBox(
      new THREE.Vector3(0, 0.4, -5),
      new THREE.Vector3(3, 0.4, 2)
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
    
    // Check for grind initiation
    if (!this.grindSystem.isGrinding()) {
      const pos = this.physics.getPosition(this.chairBody);
      const vel = this.physics.getVelocity(this.chairBody);
      const startedGrind = this.grindSystem.tryStartGrind(pos, vel, input.grind);
      
      if (startedGrind) {
        this.playerState.isGrinding = true;
        this.grindBalance = 0.5;
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
        
        // Check if grind ended
        if (!this.grindSystem.isGrinding()) {
          this.playerState.isGrinding = false;
          proceduralSounds.stopGrindLoop();
        }
      }
    } else {
      // Apply normal movement forces
      this.applyMovement(input, dt);
    }
    
    // Step physics
    this.physics.step(dt);
    
    // Sync visual to physics
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
  }
  
  // Animation state tracking
  private animState: 'idle' | 'pushing' | 'rolling' | 'air' | 'trick' | 'crash' = 'idle';
  private pushStartTime = 0;
  
  /**
   * Update player animation based on game state
   */
  private updatePlayerAnimation(input: ReturnType<InputManager['getState']>): void {
    if (!this.playerModel) return;
    
    const vel = this.physics.getVelocity(this.chairBody);
    const speed = new THREE.Vector3(vel.x, 0, vel.z).length();
    const now = performance.now();
    
    // CRASH STATE - angry throw animation
    if (this.animState === 'crash') {
      // Stay in crash until animation finishes (handled by playOnce)
      return;
    }
    
    // AIRBORNE - tricks and jumps
    if (this.playerState.isAirborne) {
      if (input.flip || input.grab) {
        // Doing a trick - various trick animations
        if (input.flip) {
          // Flip tricks - use breakdance or roll
          if (!this.playerModel.isPlaying('trick') && !this.playerModel.isPlaying('roll')) {
            this.playerModel.play('trick', { loop: false });
          }
        } else if (input.grab) {
          // Grab tricks - hold chair above head
          if (!this.playerModel.isPlaying('chairhold')) {
            this.playerModel.play('chairhold', { loop: true });
          }
        }
        this.animState = 'trick';
      } else {
        // Just jumping
        if (!this.playerModel.isPlaying('jump') && this.animState !== 'trick') {
          this.playerModel.play('jump', { loop: false });
        }
        this.animState = 'air';
      }
      return;
    }
    
    // GROUNDED
    
    // Just started pushing forward
    if (input.forward && this.animState !== 'pushing' && this.animState !== 'rolling') {
      this.playerModel.play('push', { loop: false });
      this.animState = 'pushing';
      this.pushStartTime = now;
      return;
    }
    
    // Continue pushing sequence
    if (this.animState === 'pushing') {
      // After push animation, transition to sitting
      if (now - this.pushStartTime > 600) { // Push animation ~0.6s
        this.playerModel.play('standtosit', { loop: false });
        this.animState = 'rolling';
        this.pushStartTime = now;
      }
      return;
    }
    
    // Rolling state - sitting on chair while moving
    if (this.animState === 'rolling' || speed > 1.5) {
      if (now - this.pushStartTime > 400 && !this.playerModel.isPlaying('rolling')) {
        this.playerModel.play('rolling', { loop: true });
      }
      
      // If we push again, go back to push animation
      if (input.forward && speed < 8) {
        this.playerModel.play('push', { loop: false });
        this.animState = 'pushing';
        this.pushStartTime = now;
      }
      
      // Slow down to idle
      if (speed < 0.5) {
        this.animState = 'idle';
      }
      return;
    }
    
    // IDLE - sitting dozing
    if (speed < 0.5 && this.animState !== 'idle') {
      this.playerModel.play('idle', { loop: true });
      this.animState = 'idle';
    } else if (this.animState === 'idle' && !this.playerModel.isPlaying('idle')) {
      this.playerModel.play('idle', { loop: true });
    }
  }
  
  /**
   * Trigger crash animation (called on bail)
   */
  triggerCrash(): void {
    if (!this.playerModel) return;
    this.animState = 'crash';
    this.playerModel.playOnce('crash', 'idle');
  }
  
  private updatePlayerState(dt: number): void {
    const pos = this.physics.getPosition(this.chairBody);
    const vel = this.physics.getVelocity(this.chairBody);
    
    // Ground detection - check if body is near ground level
    const wasGrounded = this.playerState.isGrounded;
    this.playerState.isGrounded = pos.y < 0.8 && vel.y > -0.5;
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
    // THPS-style physics - snappy and responsive
    const pushImpulse = 3.5;     // W - immediate push (impulse, not force)
    const brakeStrength = 0.9;   // S - multiplier to slow down (0-1)
    const turnTorque = 12;       // A/D - turning
    const airTurnTorque = 4;     // Reduced turning in air
    const jumpImpulse = 10;      // Space - ollie
    const spinTorque = 8;        // Q/E - spin in air
    const maxSpeed = 20;         // Cap forward speed
    
    // Get chair orientation and velocity
    // +Z is forward (away from camera), matching CameraController expectations
    const chairRotation = this.physics.getRotation(this.chairBody);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(chairRotation);
    const velocity = this.physics.getVelocity(this.chairBody);
    const currentSpeed = new THREE.Vector3(velocity.x, 0, velocity.z).length();
    
    // FORWARD (W) - Push in facing direction (impulse for instant response)
    if (input.forward && this.playerState.isGrounded) {
      if (currentSpeed < maxSpeed) {
        // Scale push by how much room we have to accelerate
        const speedRatio = 1 - (currentSpeed / maxSpeed);
        const impulse = forward.clone().multiplyScalar(pushImpulse * (0.3 + speedRatio * 0.7));
        this.physics.applyImpulse(this.chairBody, impulse);
      }
    }
    
    // BRAKE (S) - Slow down by reducing velocity directly
    if (input.brake && this.playerState.isGrounded && currentSpeed > 0.3) {
      const newVel = velocity.clone().multiplyScalar(brakeStrength);
      newVel.y = velocity.y; // Don't affect vertical velocity
      this.physics.setVelocity(this.chairBody, newVel);
    }
    
    // TURNING (A/D) - Rotate left/right
    const isTurning = input.turnLeft || input.turnRight;
    
    if (this.playerState.isGrounded) {
      // Turn faster when moving
      const turnMultiplier = Math.min(1, currentSpeed / 5);
      if (input.turnLeft) {
        this.physics.applyTorque(this.chairBody, new THREE.Vector3(0, turnTorque * turnMultiplier, 0));
      } else if (input.turnRight) {
        this.physics.applyTorque(this.chairBody, new THREE.Vector3(0, -turnTorque * turnMultiplier, 0));
      }
    } else {
      // Limited air control for turning
      if (input.turnLeft) {
        this.physics.applyTorque(this.chairBody, new THREE.Vector3(0, airTurnTorque, 0));
      } else if (input.turnRight) {
        this.physics.applyTorque(this.chairBody, new THREE.Vector3(0, -airTurnTorque, 0));
      }
    }
    
    // Active rotation damping when not turning - prevents drift
    if (!isTurning && this.playerState.isGrounded) {
      const angVel = this.physics.getAngularVelocity(this.chairBody);
      if (Math.abs(angVel.y) > 0.01) {
        // Apply counter-torque to stop unwanted rotation
        const dampingTorque = -angVel.y * 8;
        this.physics.applyTorque(this.chairBody, new THREE.Vector3(0, dampingTorque, 0));
      }
    }
    
    // JUMP (Space) - Ollie
    if (input.jump && this.playerState.isGrounded) {
      proceduralSounds.playJump();
      this.physics.applyImpulse(this.chairBody, new THREE.Vector3(0, jumpImpulse, 0));
      // Add slight forward boost when jumping
      const forwardBoost = forward.clone().multiplyScalar(3);
      this.physics.applyImpulse(this.chairBody, forwardBoost);
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
