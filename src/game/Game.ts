/**
 * Main Game class
 * Orchestrates all game systems
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
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
    // Initialize physics first (async WASM load)
    await RAPIER.init();
    
    this.initRenderer();
    this.initScene();
    this.initPhysics();
    this.initInput();
    this.initTricks();
    this.initUI();
    this.initPlayer();
    this.initEnvironment();
    
    // Handle window resize
    window.addEventListener('resize', this.onResize.bind(this));
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
  
  private initPhysics(): void {
    this.physics = new PhysicsWorld();
  }
  
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
  
  private applyMovement(input: ReturnType<InputManager['getState']>, dt: number): void {
    const moveForce = 20;
    const turnTorque = 8;
    const jumpImpulse = 12;
    const spinSpeed = 6;
    
    // Get chair orientation
    const chairRotation = this.physics.getRotation(this.chairBody);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(chairRotation);
    
    // Movement
    if (input.moveY !== 0) {
      const force = forward.clone().multiplyScalar(input.moveY * moveForce);
      this.physics.applyForce(this.chairBody, force);
    }
    
    // Turning (only when grounded or slow in air)
    if (input.moveX !== 0 && (this.playerState.isGrounded || this.playerState.airTime < 100)) {
      this.physics.applyTorque(this.chairBody, new THREE.Vector3(0, -input.moveX * turnTorque, 0));
    }
    
    // Jumping
    if (input.jump && this.playerState.isGrounded) {
      this.physics.applyImpulse(this.chairBody, new THREE.Vector3(0, jumpImpulse, 0));
    }
    
    // Spinning in air
    if (this.playerState.isAirborne) {
      if (input.spinLeft) {
        this.spinRotation = spinSpeed;
        this.physics.applyTorque(this.chairBody, new THREE.Vector3(0, spinSpeed, 0));
      } else if (input.spinRight) {
        this.spinRotation = -spinSpeed;
        this.physics.applyTorque(this.chairBody, new THREE.Vector3(0, -spinSpeed, 0));
      } else {
        this.spinRotation = 0;
      }
    }
  }
  
  private render(): void {
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
