/**
 * Main Game class
 * Orchestrates all game systems
 */

import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CameraController } from '../rendering/CameraController';
import { TrickDetector, PlayerTrickState } from '../tricks/TrickDetector';
import { ComboSystem } from '../tricks/ComboSystem';
import { HUD } from '../ui/HUD';

export class Game {
  // Core
  private canvas: HTMLCanvasElement;
  private isRunning = false;
  private lastTime = 0;
  private accumulator = 0;
  
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
  private cameraController!: CameraController;
  private trickDetector!: TrickDetector;
  private comboSystem!: ComboSystem;
  private hud!: HUD;
  
  // Game objects
  private chair!: THREE.Group;
  private chairBody!: RAPIER.RigidBody;
  
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
      
      this.initTricks();
      console.log('Tricks initialized');
      
      this.initUI();
      console.log('UI initialized');
      
      this.initPlayer();
      console.log('Player initialized');
      
      this.initEnvironment();
      console.log('Environment initialized');
      
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
      });
    }
  }
  
  private initPlayer(): void {
    // Create visual chair
    this.chair = this.createChairMesh();
    this.chair.position.set(0, 0, 0);
    this.scene.add(this.chair);
    
    // Create physics body
    this.chairBody = this.physics.createChairBody(this.chair.position);
    
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
    
    // Skin color
    const skinMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xffdbac,
      roughness: 0.8
    });
    
    // Shirt (blue dress shirt)
    const shirtMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x4a6fa5,
      roughness: 0.7
    });
    
    // Pants (khakis)
    const pantsMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xc4a35a,
      roughness: 0.8
    });
    
    // Shoes
    const shoeMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x2a2a2a,
      roughness: 0.9
    });
    
    // Hair
    const hairMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x3d2314,
      roughness: 0.9
    });
    
    // Player group (attached to chair)
    const player = new THREE.Group();
    player.position.set(0, 0, -0.15); // Slightly behind center
    
    // TORSO - leaning forward
    const torsoGeometry = new THREE.BoxGeometry(0.35, 0.45, 0.2);
    const torso = new THREE.Mesh(torsoGeometry, shirtMaterial);
    torso.position.set(0, 1.0, 0);
    torso.rotation.x = 0.3; // Lean forward
    torso.castShadow = true;
    player.add(torso);
    
    // HEAD
    const headGeometry = new THREE.SphereGeometry(0.12, 16, 12);
    const head = new THREE.Mesh(headGeometry, skinMaterial);
    head.position.set(0, 1.38, -0.08);
    head.castShadow = true;
    player.add(head);
    
    // HAIR (on top of head)
    const hairGeometry = new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const hair = new THREE.Mesh(hairGeometry, hairMaterial);
    hair.position.set(0, 1.42, -0.06);
    hair.castShadow = true;
    player.add(hair);
    
    // LEFT ARM (on armrest)
    const upperArmGeo = new THREE.CylinderGeometry(0.05, 0.045, 0.25);
    const leftUpperArm = new THREE.Mesh(upperArmGeo, shirtMaterial);
    leftUpperArm.position.set(-0.22, 0.9, 0.05);
    leftUpperArm.rotation.z = 0.3;
    leftUpperArm.rotation.x = 0.5;
    leftUpperArm.castShadow = true;
    player.add(leftUpperArm);
    
    const forearmGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.22);
    const leftForearm = new THREE.Mesh(forearmGeo, skinMaterial);
    leftForearm.position.set(-0.32, 0.72, 0.15);
    leftForearm.rotation.x = 1.2;
    leftForearm.castShadow = true;
    player.add(leftForearm);
    
    // LEFT HAND
    const handGeo = new THREE.SphereGeometry(0.04, 8, 6);
    const leftHand = new THREE.Mesh(handGeo, skinMaterial);
    leftHand.position.set(-0.32, 0.62, 0.25);
    leftHand.castShadow = true;
    player.add(leftHand);
    
    // RIGHT ARM (on armrest)
    const rightUpperArm = new THREE.Mesh(upperArmGeo, shirtMaterial);
    rightUpperArm.position.set(0.22, 0.9, 0.05);
    rightUpperArm.rotation.z = -0.3;
    rightUpperArm.rotation.x = 0.5;
    rightUpperArm.castShadow = true;
    player.add(rightUpperArm);
    
    const rightForearm = new THREE.Mesh(forearmGeo, skinMaterial);
    rightForearm.position.set(0.32, 0.72, 0.15);
    rightForearm.rotation.x = 1.2;
    rightForearm.castShadow = true;
    player.add(rightForearm);
    
    // RIGHT HAND
    const rightHand = new THREE.Mesh(handGeo, skinMaterial);
    rightHand.position.set(0.32, 0.62, 0.25);
    rightHand.castShadow = true;
    player.add(rightHand);
    
    // LEFT LEG (knee on chair)
    const thighGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.35);
    const leftThigh = new THREE.Mesh(thighGeo, pantsMaterial);
    leftThigh.position.set(-0.1, 0.65, 0.15);
    leftThigh.rotation.x = Math.PI / 2 - 0.3; // Horizontal-ish (knee on seat)
    leftThigh.rotation.z = 0.1;
    leftThigh.castShadow = true;
    player.add(leftThigh);
    
    const calfGeo = new THREE.CylinderGeometry(0.055, 0.05, 0.35);
    const leftCalf = new THREE.Mesh(calfGeo, pantsMaterial);
    leftCalf.position.set(-0.1, 0.58, 0.42);
    leftCalf.rotation.x = 0.2;
    leftCalf.castShadow = true;
    player.add(leftCalf);
    
    // LEFT FOOT (on chair)
    const footGeo = new THREE.BoxGeometry(0.08, 0.05, 0.15);
    const leftFoot = new THREE.Mesh(footGeo, shoeMaterial);
    leftFoot.position.set(-0.1, 0.45, 0.55);
    leftFoot.castShadow = true;
    player.add(leftFoot);
    
    // RIGHT LEG (pushing leg - extended back)
    const rightThigh = new THREE.Mesh(thighGeo, pantsMaterial);
    rightThigh.position.set(0.12, 0.55, -0.1);
    rightThigh.rotation.x = -0.6; // Angled back
    rightThigh.rotation.z = -0.1;
    rightThigh.castShadow = true;
    player.add(rightThigh);
    
    const rightCalf = new THREE.Mesh(calfGeo, pantsMaterial);
    rightCalf.position.set(0.12, 0.32, -0.35);
    rightCalf.rotation.x = -0.3;
    rightCalf.castShadow = true;
    player.add(rightCalf);
    
    // RIGHT FOOT (pushing off ground)
    const rightFoot = new THREE.Mesh(footGeo, shoeMaterial);
    rightFoot.position.set(0.12, 0.12, -0.52);
    rightFoot.rotation.x = -0.5;
    rightFoot.castShadow = true;
    player.add(rightFoot);
    
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
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop.bind(this));
  }
  
  stop(): void {
    this.isRunning = false;
  }
  
  private loop(currentTime: number): void {
    if (!this.isRunning) return;
    
    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;
    this.accumulator += deltaTime;
    
    // Fixed timestep physics
    let steps = 0;
    while (this.accumulator >= this.PHYSICS_TIMESTEP && steps < this.MAX_FRAME_SKIP) {
      this.fixedUpdate(this.PHYSICS_TIMESTEP);
      this.accumulator -= this.PHYSICS_TIMESTEP;
      steps++;
    }
    
    // Render
    this.render();
    
    // Update HUD
    if (this.hud) {
      this.hud.update(deltaTime);
    }
    
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
      
      // Add to special meter
      this.specialMeter = Math.min(1, this.specialMeter + trick.basePoints / 5000);
      this.hud?.setSpecial(this.specialMeter);
    }
    
    // Apply movement forces
    this.applyMovement(input, dt);
    
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
  }
  
  private updatePlayerState(dt: number): void {
    const pos = this.physics.getPosition(this.chairBody);
    const vel = this.physics.getVelocity(this.chairBody);
    
    // Ground detection
    const wasGrounded = this.playerState.isGrounded;
    this.playerState.isGrounded = pos.y < 0.55 && vel.y > -0.5;
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
      if (this.comboSystem.hasActiveCombo()) {
        this.comboSystem.land();
      }
      this.spinRotation = 0;
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
    // THPS-style physics constants
    const pushForce = 25;        // W - push forward
    const brakeForce = 15;       // S - brake/slow down  
    const turnTorque = 10;       // A/D - turning
    const airTurnTorque = 3;     // Reduced turning in air
    const jumpImpulse = 12;      // Space - ollie
    const spinTorque = 8;        // Q/E - spin in air
    const maxSpeed = 25;         // Cap forward speed
    
    // Get chair orientation and velocity
    const chairRotation = this.physics.getRotation(this.chairBody);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(chairRotation);
    const velocity = this.physics.getVelocity(this.chairBody);
    const currentSpeed = new THREE.Vector3(velocity.x, 0, velocity.z).length();
    
    // FORWARD (W) - Push in facing direction
    if (input.forward && this.playerState.isGrounded) {
      // Only push if not at max speed
      if (currentSpeed < maxSpeed) {
        const force = forward.clone().multiplyScalar(pushForce);
        this.physics.applyForce(this.chairBody, force);
      }
    }
    
    // BRAKE (S) - Slow down
    if (input.brake && this.playerState.isGrounded && currentSpeed > 0.5) {
      // Apply force opposite to current velocity
      const brakeDir = new THREE.Vector3(velocity.x, 0, velocity.z).normalize().negate();
      const force = brakeDir.multiplyScalar(brakeForce);
      this.physics.applyForce(this.chairBody, force);
    }
    
    // TURNING (A/D) - Rotate left/right
    if (this.playerState.isGrounded) {
      // Turn faster when moving
      const turnMultiplier = Math.min(1, currentSpeed / 5);
      if (input.turnLeft) {
        this.physics.applyTorque(this.chairBody, new THREE.Vector3(0, turnTorque * turnMultiplier, 0));
      }
      if (input.turnRight) {
        this.physics.applyTorque(this.chairBody, new THREE.Vector3(0, -turnTorque * turnMultiplier, 0));
      }
    } else {
      // Limited air control for turning
      if (input.turnLeft) {
        this.physics.applyTorque(this.chairBody, new THREE.Vector3(0, airTurnTorque, 0));
      }
      if (input.turnRight) {
        this.physics.applyTorque(this.chairBody, new THREE.Vector3(0, -airTurnTorque, 0));
      }
    }
    
    // JUMP (Space) - Ollie
    if (input.jump && this.playerState.isGrounded) {
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
