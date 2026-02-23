/**
 * Level Manager
 * Loads and manages game levels
 */

import * as THREE from 'three';
import { LevelData, LevelObject, getLevelById, LEVELS } from './LevelData';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { GrindSystem } from '../physics/GrindSystem';

export class LevelManager {
  private scene: THREE.Scene;
  private physics: PhysicsWorld;
  private grindSystem: GrindSystem;
  private currentLevel: LevelData | null = null;
  private levelObjects: THREE.Object3D[] = [];
  
  // Materials cache
  private materials: Map<string, THREE.Material> = new Map();
  
  constructor(scene: THREE.Scene, physics: PhysicsWorld, grindSystem: GrindSystem) {
    this.scene = scene;
    this.physics = physics;
    this.grindSystem = grindSystem;
    this.initMaterials();
  }
  
  private initMaterials(): void {
    // Standard materials for level objects
    this.materials.set('rail', new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0.8,
      roughness: 0.2
    }));
    
    this.materials.set('wood', new THREE.MeshStandardMaterial({
      color: 0x8B4513,
      roughness: 0.7
    }));
    
    this.materials.set('concrete', new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.9
    }));
    
    this.materials.set('metal', new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.6,
      roughness: 0.4
    }));
    
    this.materials.set('plastic', new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.8
    }));
    
    this.materials.set('office', new THREE.MeshStandardMaterial({
      color: 0x4a4a5e,
      roughness: 0.7
    }));
    
    this.materials.set('car_body', new THREE.MeshStandardMaterial({
      color: 0x2244aa,
      metalness: 0.8,
      roughness: 0.3
    }));
  }
  
  /**
   * Load a level by ID
   */
  loadLevel(levelId: string): boolean {
    const level = getLevelById(levelId);
    if (!level) {
      console.error(`Level not found: ${levelId}`);
      return false;
    }
    
    // Unload current level
    this.unloadLevel();
    
    this.currentLevel = level;
    console.log(`Loading level: ${level.name}`);
    
    // Set up environment
    this.setupEnvironment(level);
    
    // Create level objects
    for (const obj of level.objects) {
      this.createObject(obj);
    }
    
    // Create collectibles
    if (level.collectibles) {
      for (const collectible of level.collectibles) {
        this.createCollectible(collectible);
      }
    }
    
    console.log(`Level loaded: ${this.levelObjects.length} objects`);
    return true;
  }
  
  /**
   * Unload current level
   */
  unloadLevel(): void {
    // Remove all level objects from scene
    for (const obj of this.levelObjects) {
      this.scene.remove(obj);
      // Dispose geometries and materials
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
        }
      });
    }
    this.levelObjects = [];
    
    // Clear grind rails
    this.grindSystem.clearRails();
    
    this.currentLevel = null;
  }
  
  /**
   * Set up level environment (sky, fog, lighting)
   */
  private setupEnvironment(level: LevelData): void {
    // Sky color
    this.scene.background = new THREE.Color(level.skyColor);
    
    // Fog
    this.scene.fog = new THREE.Fog(level.fogColor, level.fogNear, level.fogFar);
    
    // Ground
    this.createGround(level);
  }
  
  /**
   * Create ground plane
   */
  private createGround(level: LevelData): void {
    const size = level.groundSize;
    const geometry = new THREE.PlaneGeometry(size, size, 50, 50);
    
    // Create grid texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    
    const baseColor = level.groundColor || '#555555';
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 512, 512);
    
    // Grid lines
    ctx.strokeStyle = this.lightenColor(baseColor, 20);
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
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(size / 5, size / 5);
    
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.9
    });
    
    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    
    this.scene.add(ground);
    this.levelObjects.push(ground);
  }
  
  /**
   * Create a level object
   */
  private createObject(obj: LevelObject): void {
    const pos = new THREE.Vector3(obj.position[0], obj.position[1], obj.position[2]);
    const rot = obj.rotation 
      ? new THREE.Euler(
          THREE.MathUtils.degToRad(obj.rotation[0]),
          THREE.MathUtils.degToRad(obj.rotation[1]),
          THREE.MathUtils.degToRad(obj.rotation[2])
        )
      : new THREE.Euler(0, 0, 0);
    
    let mesh: THREE.Object3D | null = null;
    
    switch (obj.type) {
      case 'rail':
        mesh = this.createRail(pos, rot, obj.params?.length as number || 10);
        break;
      case 'ramp':
        mesh = this.createRamp(pos, rot);
        break;
      case 'quarter_pipe':
        mesh = this.createQuarterPipe(pos, rot);
        break;
      case 'half_pipe':
        mesh = this.createHalfPipe(pos, rot, obj.params);
        break;
      case 'fun_box':
        mesh = this.createFunBox(pos, rot, obj.params);
        break;
      case 'stairs':
        mesh = this.createStairs(pos, rot, obj.params?.steps as number || 5);
        break;
      case 'cubicle':
        mesh = this.createCubicle(pos, rot, obj.params);
        break;
      case 'car':
        mesh = this.createCar(pos, rot);
        break;
      case 'bench':
        mesh = this.createBench(pos, rot);
        break;
      case 'planter':
        mesh = this.createPlanter(pos, rot);
        break;
      case 'water_cooler':
        mesh = this.createWaterCooler(pos);
        break;
      case 'trash_can':
        mesh = this.createTrashCan(pos);
        break;
      case 'cone':
        mesh = this.createCone(pos);
        break;
      case 'barrier':
        mesh = this.createBarrier(pos, rot, obj.params?.length as number || 5);
        break;
    }
    
    if (mesh) {
      this.scene.add(mesh);
      this.levelObjects.push(mesh);
    }
  }
  
  // =============================================
  // OBJECT CREATORS
  // =============================================
  
  private createRail(pos: THREE.Vector3, rot: THREE.Euler, length: number): THREE.Group {
    const group = new THREE.Group();
    
    const railMat = this.materials.get('rail')!;
    const geometry = new THREE.BoxGeometry(length, 0.08, 0.08);
    const rail = new THREE.Mesh(geometry, railMat);
    rail.position.y = 0.8;
    rail.castShadow = true;
    group.add(rail);
    
    // Support posts
    const postGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.8);
    const postMat = this.materials.get('metal')!;
    
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeom, postMat);
      post.position.set(side * (length / 2 - 0.2), 0.4, 0);
      post.castShadow = true;
      group.add(post);
    }
    
    group.position.copy(pos);
    group.rotation.copy(rot);
    
    // Register with grind system
    const start = new THREE.Vector3(-length / 2, 0.8, 0).applyEuler(rot).add(pos);
    const end = new THREE.Vector3(length / 2, 0.8, 0).applyEuler(rot).add(pos);
    this.grindSystem.addRail(start, end, undefined, rail);
    
    // Physics
    this.physics.createStaticBox(
      new THREE.Vector3(pos.x, pos.y + 0.8, pos.z),
      new THREE.Vector3(length / 2, 0.04, 0.04),
      rot
    );
    
    return group;
  }
  
  private createRamp(pos: THREE.Vector3, rot: THREE.Euler): THREE.Group {
    const group = new THREE.Group();
    const mat = this.materials.get('wood')!;
    
    const rampGeom = new THREE.BoxGeometry(4, 0.15, 3);
    const ramp = new THREE.Mesh(rampGeom, mat);
    ramp.position.set(0, 0.6, 0);
    ramp.rotation.x = -Math.PI / 8;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    group.add(ramp);
    
    // Side walls
    const sideGeom = new THREE.BoxGeometry(0.1, 0.8, 3.2);
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(sideGeom, mat);
      wall.position.set(side * 2, 0.4, 0);
      wall.castShadow = true;
      group.add(wall);
    }
    
    group.position.copy(pos);
    group.rotation.copy(rot);
    
    // Physics
    this.physics.createStaticBox(
      new THREE.Vector3(pos.x, pos.y + 0.6, pos.z),
      new THREE.Vector3(2, 0.08, 1.5),
      new THREE.Euler(-Math.PI / 8 + rot.x, rot.y, rot.z)
    );
    
    return group;
  }
  
  private createQuarterPipe(pos: THREE.Vector3, rot: THREE.Euler): THREE.Object3D {
    const mat = this.materials.get('concrete')!;
    
    // Curved surface using ExtrudeGeometry
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
    
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.copy(pos);
    mesh.rotation.copy(rot);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }
  
  private createHalfPipe(pos: THREE.Vector3, rot: THREE.Euler, params?: Record<string, unknown>): THREE.Object3D {
    const width = (params?.width as number) || 15;
    const length = (params?.length as number) || 20;
    const mat = this.materials.get('concrete')!;
    
    const group = new THREE.Group();
    
    // Two quarter pipes facing each other
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
    
    const left = new THREE.Mesh(geometry, mat);
    left.position.set(-width / 2, 0, -length / 2);
    left.rotation.y = Math.PI / 2;
    left.castShadow = true;
    group.add(left);
    
    const right = new THREE.Mesh(geometry, mat);
    right.position.set(width / 2, 0, length / 2);
    right.rotation.y = -Math.PI / 2;
    right.castShadow = true;
    group.add(right);
    
    // Flat bottom
    const bottomGeom = new THREE.BoxGeometry(width - 8, 0.1, length);
    const bottom = new THREE.Mesh(bottomGeom, mat);
    bottom.position.set(0, 0.05, 0);
    bottom.receiveShadow = true;
    group.add(bottom);
    
    group.position.copy(pos);
    group.rotation.copy(rot);
    
    return group;
  }
  
  private createFunBox(pos: THREE.Vector3, rot: THREE.Euler, params?: Record<string, unknown>): THREE.Group {
    const width = (params?.width as number) || 6;
    const depth = (params?.depth as number) || 4;
    const height = (params?.height as number) || 0.8;
    
    const group = new THREE.Group();
    const mat = this.materials.get('concrete')!;
    const railMat = this.materials.get('rail')!;
    
    // Main box
    const boxGeom = new THREE.BoxGeometry(width, height, depth);
    const box = new THREE.Mesh(boxGeom, mat);
    box.position.y = height / 2;
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);
    
    // Rails on edges
    const railGeom = new THREE.BoxGeometry(width, 0.06, 0.06);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeom, railMat);
      rail.position.set(0, height + 0.03, side * (depth / 2 - 0.03));
      rail.castShadow = true;
      group.add(rail);
      
      // Register grind rail
      const start = new THREE.Vector3(-width / 2, height + 0.03, side * (depth / 2 - 0.03));
      const end = new THREE.Vector3(width / 2, height + 0.03, side * (depth / 2 - 0.03));
      start.applyEuler(rot).add(pos);
      end.applyEuler(rot).add(pos);
      this.grindSystem.addRail(start, end, undefined, rail);
    }
    
    group.position.copy(pos);
    group.rotation.copy(rot);
    
    // Physics for main box
    this.physics.createStaticBox(
      new THREE.Vector3(pos.x, pos.y + height / 2, pos.z),
      new THREE.Vector3(width / 2, height / 2, depth / 2),
      rot
    );
    
    return group;
  }
  
  private createStairs(pos: THREE.Vector3, rot: THREE.Euler, steps: number): THREE.Group {
    const group = new THREE.Group();
    const mat = this.materials.get('concrete')!;
    
    const stepWidth = 4;
    const stepHeight = 0.2;
    const stepDepth = 0.3;
    
    for (let i = 0; i < steps; i++) {
      const stepGeom = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
      const step = new THREE.Mesh(stepGeom, mat);
      step.position.set(0, stepHeight / 2 + i * stepHeight, i * stepDepth);
      step.castShadow = true;
      step.receiveShadow = true;
      group.add(step);
      
      // Physics for each step
      const stepPos = new THREE.Vector3(0, stepHeight / 2 + i * stepHeight, i * stepDepth)
        .applyEuler(rot)
        .add(pos);
      this.physics.createStaticBox(
        stepPos,
        new THREE.Vector3(stepWidth / 2, stepHeight / 2, stepDepth / 2),
        rot
      );
    }
    
    group.position.copy(pos);
    group.rotation.copy(rot);
    
    return group;
  }
  
  private createCubicle(pos: THREE.Vector3, rot: THREE.Euler, params?: Record<string, unknown>): THREE.Group {
    const width = (params?.width as number) || 3;
    const depth = (params?.depth as number) || 3;
    const height = 1.5;
    
    const group = new THREE.Group();
    const wallMat = this.materials.get('office')!;
    const deskMat = this.materials.get('wood')!;
    
    // Walls (3 sides)
    const wallGeom = new THREE.BoxGeometry(width, height, 0.05);
    const backWall = new THREE.Mesh(wallGeom, wallMat);
    backWall.position.set(0, height / 2, depth / 2);
    backWall.castShadow = true;
    group.add(backWall);
    
    const sideWallGeom = new THREE.BoxGeometry(0.05, height, depth);
    for (const side of [-1, 1]) {
      const sideWall = new THREE.Mesh(sideWallGeom, wallMat);
      sideWall.position.set(side * width / 2, height / 2, 0);
      sideWall.castShadow = true;
      group.add(sideWall);
    }
    
    // Desk
    const deskGeom = new THREE.BoxGeometry(width * 0.8, 0.05, depth * 0.4);
    const desk = new THREE.Mesh(deskGeom, deskMat);
    desk.position.set(0, 0.75, depth * 0.2);
    desk.castShadow = true;
    group.add(desk);
    
    group.position.copy(pos);
    group.rotation.copy(rot);
    
    // Physics - just the desk edge for grinding
    this.physics.createStaticBox(
      new THREE.Vector3(pos.x, pos.y + 0.75, pos.z + depth * 0.2),
      new THREE.Vector3(width * 0.4, 0.025, depth * 0.2),
      rot
    );
    
    return group;
  }
  
  private createCar(pos: THREE.Vector3, rot: THREE.Euler): THREE.Group {
    const group = new THREE.Group();
    const bodyMat = this.materials.get('car_body')!;
    const wheelMat = this.materials.get('plastic')!;
    
    // Body
    const bodyGeom = new THREE.BoxGeometry(2, 1, 4);
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.8;
    body.castShadow = true;
    group.add(body);
    
    // Top
    const topGeom = new THREE.BoxGeometry(1.5, 0.6, 2);
    const top = new THREE.Mesh(topGeom, bodyMat);
    top.position.set(0, 1.6, -0.3);
    top.castShadow = true;
    group.add(top);
    
    // Wheels
    const wheelGeom = new THREE.CylinderGeometry(0.3, 0.3, 0.15, 12);
    const positions = [
      [-0.9, 0.3, 1.3],
      [0.9, 0.3, 1.3],
      [-0.9, 0.3, -1.3],
      [0.9, 0.3, -1.3]
    ];
    
    for (const [x, y, z] of positions) {
      const wheel = new THREE.Mesh(wheelGeom, wheelMat);
      wheel.position.set(x, y, z);
      wheel.rotation.z = Math.PI / 2;
      group.add(wheel);
    }
    
    group.position.copy(pos);
    group.rotation.copy(rot);
    
    // Physics
    this.physics.createStaticBox(
      new THREE.Vector3(pos.x, pos.y + 0.8, pos.z),
      new THREE.Vector3(1, 0.5, 2),
      rot
    );
    
    return group;
  }
  
  private createBench(pos: THREE.Vector3, rot: THREE.Euler): THREE.Group {
    const group = new THREE.Group();
    const woodMat = this.materials.get('wood')!;
    const metalMat = this.materials.get('metal')!;
    
    // Seat
    const seatGeom = new THREE.BoxGeometry(2, 0.1, 0.5);
    const seat = new THREE.Mesh(seatGeom, woodMat);
    seat.position.y = 0.5;
    seat.castShadow = true;
    group.add(seat);
    
    // Legs
    const legGeom = new THREE.BoxGeometry(0.1, 0.5, 0.4);
    for (const side of [-0.8, 0.8]) {
      const leg = new THREE.Mesh(legGeom, metalMat);
      leg.position.set(side, 0.25, 0);
      group.add(leg);
    }
    
    group.position.copy(pos);
    group.rotation.copy(rot);
    
    // Register as grindable
    const start = new THREE.Vector3(-1, 0.55, 0).applyEuler(rot).add(pos);
    const end = new THREE.Vector3(1, 0.55, 0).applyEuler(rot).add(pos);
    this.grindSystem.addRail(start, end, undefined, seat);
    
    // Physics
    this.physics.createStaticBox(
      new THREE.Vector3(pos.x, pos.y + 0.5, pos.z),
      new THREE.Vector3(1, 0.05, 0.25),
      rot
    );
    
    return group;
  }
  
  private createPlanter(pos: THREE.Vector3, rot: THREE.Euler): THREE.Object3D {
    const group = new THREE.Group();
    
    // Concrete planter box
    const boxGeom = new THREE.BoxGeometry(2, 0.8, 2);
    const boxMat = this.materials.get('concrete')!;
    const box = new THREE.Mesh(boxGeom, boxMat);
    box.position.y = 0.4;
    box.castShadow = true;
    group.add(box);
    
    // Simple tree/plant
    const trunkGeom = new THREE.CylinderGeometry(0.1, 0.15, 1);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3020 });
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.y = 1.3;
    group.add(trunk);
    
    const foliageGeom = new THREE.SphereGeometry(0.6, 8, 8);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x228b22 });
    const foliage = new THREE.Mesh(foliageGeom, foliageMat);
    foliage.position.y = 2;
    foliage.castShadow = true;
    group.add(foliage);
    
    group.position.copy(pos);
    group.rotation.copy(rot);
    
    // Physics (obstacle)
    this.physics.createStaticBox(
      new THREE.Vector3(pos.x, pos.y + 0.4, pos.z),
      new THREE.Vector3(1, 0.4, 1)
    );
    
    return group;
  }
  
  private createWaterCooler(pos: THREE.Vector3): THREE.Object3D {
    const group = new THREE.Group();
    
    const bodyGeom = new THREE.CylinderGeometry(0.2, 0.25, 1, 12);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6688aa });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.5;
    body.castShadow = true;
    group.add(body);
    
    // Water jug
    const jugGeom = new THREE.CylinderGeometry(0.15, 0.18, 0.4, 12);
    const jugMat = new THREE.MeshStandardMaterial({ 
      color: 0x88ccff,
      transparent: true,
      opacity: 0.6
    });
    const jug = new THREE.Mesh(jugGeom, jugMat);
    jug.position.y = 1.2;
    group.add(jug);
    
    group.position.copy(pos);
    
    // Physics
    this.physics.createStaticBox(
      new THREE.Vector3(pos.x, pos.y + 0.5, pos.z),
      new THREE.Vector3(0.25, 0.5, 0.25)
    );
    
    return group;
  }
  
  private createTrashCan(pos: THREE.Vector3): THREE.Object3D {
    const geometry = new THREE.CylinderGeometry(0.25, 0.2, 0.6, 12);
    const material = this.materials.get('metal')!;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(pos);
    mesh.position.y = 0.3;
    mesh.castShadow = true;
    
    this.physics.createStaticBox(
      new THREE.Vector3(pos.x, 0.3, pos.z),
      new THREE.Vector3(0.25, 0.3, 0.25)
    );
    
    return mesh;
  }
  
  private createCone(pos: THREE.Vector3): THREE.Object3D {
    const geometry = new THREE.ConeGeometry(0.2, 0.5, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0xff6600 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(pos);
    mesh.position.y = 0.25;
    mesh.castShadow = true;
    
    return mesh;
  }
  
  private createBarrier(pos: THREE.Vector3, rot: THREE.Euler, length: number): THREE.Object3D {
    const group = new THREE.Group();
    
    // Main barrier
    const barrierGeom = new THREE.BoxGeometry(length, 0.8, 0.1);
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0xffcc00 });
    const barrier = new THREE.Mesh(barrierGeom, barrierMat);
    barrier.position.y = 0.5;
    barrier.castShadow = true;
    group.add(barrier);
    
    // Legs
    const legGeom = new THREE.CylinderGeometry(0.05, 0.05, 0.8);
    const legMat = this.materials.get('metal')!;
    for (let i = -1; i <= 1; i += 2) {
      const leg = new THREE.Mesh(legGeom, legMat);
      leg.position.set(i * (length / 2 - 0.1), 0.4, 0);
      group.add(leg);
    }
    
    group.position.copy(pos);
    group.rotation.copy(rot);
    
    this.physics.createStaticBox(
      new THREE.Vector3(pos.x, pos.y + 0.5, pos.z),
      new THREE.Vector3(length / 2, 0.4, 0.05),
      rot
    );
    
    return group;
  }
  
  private createCollectible(collectible: { type: string; position: number[]; value?: number }): void {
    // TODO: Implement collectible system
    // For now, just create visual markers
    const geometry = collectible.type === 'money' 
      ? new THREE.BoxGeometry(0.3, 0.3, 0.05)
      : new THREE.BoxGeometry(0.4, 0.5, 0.05);
    
    const material = new THREE.MeshStandardMaterial({
      color: collectible.type === 'money' ? 0x00ff00 : 0xffffff,
      emissive: collectible.type === 'money' ? 0x004400 : 0x222222,
      emissiveIntensity: 0.5
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(collectible.position[0], collectible.position[1], collectible.position[2]);
    
    // Rotate slowly
    mesh.userData.isCollectible = true;
    mesh.userData.type = collectible.type;
    mesh.userData.value = collectible.value || 100;
    
    this.scene.add(mesh);
    this.levelObjects.push(mesh);
  }
  
  // Helper to lighten a color
  private lightenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00ff) + amt);
    const B = Math.min(255, (num & 0x0000ff) + amt);
    return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
  }
  
  // =============================================
  // GETTERS
  // =============================================
  
  getCurrentLevel(): LevelData | null {
    return this.currentLevel;
  }
  
  getSpawnPoint(): { position: THREE.Vector3; rotation: number } | null {
    if (!this.currentLevel) return null;
    const sp = this.currentLevel.spawnPoint;
    return {
      position: new THREE.Vector3(sp.position[0], sp.position[1], sp.position[2]),
      rotation: THREE.MathUtils.degToRad(sp.rotation)
    };
  }
  
  getAvailableLevels(): LevelData[] {
    return LEVELS;
  }
}
