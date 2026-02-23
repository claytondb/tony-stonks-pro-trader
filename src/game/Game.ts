/**
 * Main Game class
 * Orchestrates all game systems
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CameraController } from '../rendering/CameraController';

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
  
  // Game objects
  private chair!: THREE.Group;
  private chairBody!: RAPIER.RigidBody;
  
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
    this.scene.background = new THREE.Color(0x87CEEB); // Sky blue
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
  
  private initPlayer(): void {
    // Create visual chair (placeholder - cube for now)
    this.chair = new THREE.Group();
    
    // Seat
    const seatGeometry = new THREE.BoxGeometry(0.6, 0.1, 0.6);
    const seatMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x333333,
      roughness: 0.8
    });
    const seat = new THREE.Mesh(seatGeometry, seatMaterial);
    seat.position.y = 0.45;
    seat.castShadow = true;
    this.chair.add(seat);
    
    // Back rest
    const backGeometry = new THREE.BoxGeometry(0.6, 0.6, 0.1);
    const back = new THREE.Mesh(backGeometry, seatMaterial);
    back.position.set(0, 0.75, 0.25);
    back.castShadow = true;
    this.chair.add(back);
    
    // Base (star shape simplified as cylinder)
    const baseGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 5);
    const baseMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x666666,
      metalness: 0.5,
      roughness: 0.5
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.1;
    base.castShadow = true;
    this.chair.add(base);
    
    // Center pole
    const poleGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.3);
    const pole = new THREE.Mesh(poleGeometry, baseMaterial);
    pole.position.y = 0.25;
    this.chair.add(pole);
    
    // Wheels (5 casters)
    const wheelGeometry = new THREE.SphereGeometry(0.05, 8, 8);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const wheelPositions = [
      { x: 0.25, z: 0 },
      { x: -0.25, z: 0 },
      { x: 0.12, z: 0.22 },
      { x: -0.12, z: 0.22 },
      { x: 0, z: -0.25 }
    ];
    
    for (const pos of wheelPositions) {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.position.set(pos.x, 0.05, pos.z);
      wheel.castShadow = true;
      this.chair.add(wheel);
    }
    
    this.chair.position.set(0, 0, 0);
    this.scene.add(this.chair);
    
    // Create physics body
    this.chairBody = this.physics.createChairBody(this.chair.position);
    
    // Set camera target
    this.cameraController.setTarget(this.chair);
  }
  
  private initEnvironment(): void {
    // Ground plane
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x888888,
      roughness: 0.9
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    
    // Add ground to physics
    this.physics.createGround();
    
    // Parking lot lines (visual only)
    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    for (let i = -5; i <= 5; i++) {
      const lineGeometry = new THREE.PlaneGeometry(0.1, 5);
      const line = new THREE.Mesh(lineGeometry, lineMaterial);
      line.rotation.x = -Math.PI / 2;
      line.position.set(i * 3, 0.01, 0);
      this.scene.add(line);
    }
    
    // Grindable rail
    const railGeometry = new THREE.BoxGeometry(10, 0.1, 0.1);
    const railMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xcccccc,
      metalness: 0.8,
      roughness: 0.2
    });
    const rail = new THREE.Mesh(railGeometry, railMaterial);
    rail.position.set(0, 0.8, 8);
    rail.castShadow = true;
    this.scene.add(rail);
    
    // Rail physics (static)
    this.physics.createStaticBox(
      new THREE.Vector3(0, 0.8, 8),
      new THREE.Vector3(5, 0.05, 0.05)
    );
    
    // Some ramps
    this.createRamp(-8, 0, 5, Math.PI / 6);
    this.createRamp(8, 0, 5, -Math.PI / 6);
    
    // Quarter pipe
    this.createQuarterPipe(0, 0, -15);
  }
  
  private createRamp(x: number, y: number, z: number, rotation: number): void {
    const rampGeometry = new THREE.BoxGeometry(4, 0.2, 3);
    const rampMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x8B4513, // Wood brown
      roughness: 0.7
    });
    const ramp = new THREE.Mesh(rampGeometry, rampMaterial);
    ramp.position.set(x, y + 0.5, z);
    ramp.rotation.x = rotation;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    this.scene.add(ramp);
    
    // Add physics (approximated as rotated box)
    this.physics.createStaticBox(
      new THREE.Vector3(x, y + 0.5, z),
      new THREE.Vector3(2, 0.1, 1.5),
      new THREE.Euler(rotation, 0, 0)
    );
  }
  
  private createQuarterPipe(x: number, y: number, z: number): void {
    // Simplified quarter pipe as curved mesh
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 3, 0),
      new THREE.Vector3(0, 3, -3)
    );
    
    const points = curve.getPoints(20);
    const shape = new THREE.Shape();
    shape.moveTo(-3, 0);
    shape.lineTo(3, 0);
    shape.lineTo(3, 0.2);
    shape.lineTo(-3, 0.2);
    shape.closePath();
    
    const extrudeSettings = {
      steps: 20,
      extrudePath: new THREE.CatmullRomCurve3(points)
    };
    
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const material = new THREE.MeshStandardMaterial({ 
      color: 0x666666,
      roughness: 0.5
    });
    
    const quarterPipe = new THREE.Mesh(geometry, material);
    quarterPipe.position.set(x, y, z);
    quarterPipe.receiveShadow = true;
    quarterPipe.castShadow = true;
    this.scene.add(quarterPipe);
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
    
    // Render with interpolation
    const alpha = this.accumulator / this.PHYSICS_TIMESTEP;
    this.render(alpha);
    
    requestAnimationFrame(this.loop.bind(this));
  }
  
  private fixedUpdate(dt: number): void {
    // Update input
    this.input.update();
    
    // Get input state
    const input = this.input.getState();
    
    // Apply forces based on input
    const moveForce = 15;
    const turnTorque = 5;
    const jumpImpulse = 10;
    
    // Get chair orientation for movement direction
    const chairRotation = this.physics.getRotation(this.chairBody);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(chairRotation);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(chairRotation);
    
    // Movement
    if (input.moveY !== 0) {
      const force = forward.multiplyScalar(input.moveY * moveForce);
      this.physics.applyForce(this.chairBody, force);
    }
    
    // Turning
    if (input.moveX !== 0) {
      this.physics.applyTorque(this.chairBody, new THREE.Vector3(0, -input.moveX * turnTorque, 0));
    }
    
    // Jumping
    if (input.jump && this.isGrounded()) {
      this.physics.applyImpulse(this.chairBody, new THREE.Vector3(0, jumpImpulse, 0));
    }
    
    // Spin in air
    if (!this.isGrounded()) {
      if (input.spinLeft) {
        this.physics.applyTorque(this.chairBody, new THREE.Vector3(0, 8, 0));
      }
      if (input.spinRight) {
        this.physics.applyTorque(this.chairBody, new THREE.Vector3(0, -8, 0));
      }
    }
    
    // Step physics
    this.physics.step(dt);
    
    // Sync visual to physics
    const pos = this.physics.getPosition(this.chairBody);
    const rot = this.physics.getRotation(this.chairBody);
    
    this.chair.position.copy(pos);
    this.chair.quaternion.copy(rot);
    
    // Update camera
    this.cameraController.update(dt);
  }
  
  private isGrounded(): boolean {
    const pos = this.physics.getPosition(this.chairBody);
    return pos.y < 0.6; // Simple ground check
  }
  
  private render(alpha: number): void {
    // Could interpolate here for smoother rendering
    // For now, just render current state
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
