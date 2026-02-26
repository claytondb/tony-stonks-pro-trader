/**
 * Physics World
 * Rapier.js wrapper for game physics
 */

import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export class PhysicsWorld {
  private world!: RAPIER.World;
  private initialized = false;
  private staticBodies: RAPIER.RigidBody[] = [];  // Track static bodies for cleanup
  
  async init(): Promise<void> {
    if (this.initialized) return;
    
    console.log('Initializing Rapier physics...');
    await RAPIER.init();
    console.log('Rapier initialized!');
    
    // Create world with stronger gravity
    this.world = new RAPIER.World({ x: 0, y: -30, z: 0 });
    this.initialized = true;
  }
  
  /**
   * Create the player's chair physics body
   * Locked to stay upright (only Y rotation allowed)
   */
  createChairBody(position: THREE.Vector3): RAPIER.RigidBody {
    // Create dynamic rigid body
    // Only Y rotation allowed (chair stays upright)
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, 2.0, position.z)  // Start well above ground
      .setLinearDamping(0.1)
      .setAngularDamping(5.0)
      .enabledRotations(false, true, false);
    
    const body = this.world.createRigidBody(bodyDesc);
    
    // Capsule collider - slides better on ramps than cylinder
    // halfHeight=0.3 (middle section), radius=0.4 (end caps)
    const bodyCollider = RAPIER.ColliderDesc.capsule(0.3, 0.4)
      .setMass(50)
      .setFriction(0.15)  // Low friction for smooth sliding
      .setRestitution(0.0);
    
    this.world.createCollider(bodyCollider, body);
    
    return body;
  }
  
  /**
   * Create ground plane with walls
   */
  createGround(size = 50): void {
    // Ground - thick slab below y=0 so surface is at y=0
    const groundDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(0, -0.5, 0);  // Center at -0.5
    const groundBody = this.world.createRigidBody(groundDesc);
    const groundColliderDesc = RAPIER.ColliderDesc.cuboid(size, 0.5, size)  // Half-height 0.5, so top at y=0
      .setFriction(0.5)
      .setRestitution(0.0);
    this.world.createCollider(groundColliderDesc, groundBody);
    
    // Walls (invisible barriers)
    const wallHeight = 5;
    const wallThickness = 1;
    
    // North wall (+Z)
    this.createWall(0, wallHeight/2, size + wallThickness, size, wallHeight, wallThickness);
    // South wall (-Z)
    this.createWall(0, wallHeight/2, -size - wallThickness, size, wallHeight, wallThickness);
    // East wall (+X)
    this.createWall(size + wallThickness, wallHeight/2, 0, wallThickness, wallHeight, size);
    // West wall (-X)
    this.createWall(-size - wallThickness, wallHeight/2, 0, wallThickness, wallHeight, size);
  }
  
  private createWall(x: number, y: number, z: number, halfW: number, halfH: number, halfD: number): void {
    const wallDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(x, y, z);
    const wallBody = this.world.createRigidBody(wallDesc);
    const wallCollider = RAPIER.ColliderDesc.cuboid(halfW, halfH, halfD)
      .setFriction(0.3)
      .setRestitution(0.3);
    this.world.createCollider(wallCollider, wallBody);
  }
  
  /**
   * Create a static box (for rails, ramps, etc.)
   */
  createStaticBox(
    position: THREE.Vector3, 
    halfExtents: THREE.Vector3,
    rotation?: THREE.Euler
  ): RAPIER.RigidBody {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(position.x, position.y, position.z);
    
    if (rotation) {
      const quat = new THREE.Quaternion().setFromEuler(rotation);
      bodyDesc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    }
    
    const body = this.world.createRigidBody(bodyDesc);
    
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      halfExtents.x, 
      halfExtents.y, 
      halfExtents.z
    ).setFriction(0.2);  // Low friction for smooth sliding
    
    this.world.createCollider(colliderDesc, body);
    this.staticBodies.push(body);
    
    return body;
  }
  
  /**
   * Create a static ramp collider (triangular prism for quarter pipes, ramps)
   */
  createStaticRamp(
    position: THREE.Vector3,
    width: number,
    height: number,
    depth: number,
    rotation?: THREE.Euler
  ): RAPIER.RigidBody {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(position.x, position.y, position.z);
    
    if (rotation) {
      const quat = new THREE.Quaternion().setFromEuler(rotation);
      bodyDesc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    }
    
    const body = this.world.createRigidBody(bodyDesc);
    
    // Create triangular prism vertices for ramp
    // The ramp goes from (0,0) up to (depth, height)
    const vertices = new Float32Array([
      // Front face (triangle)
      -width/2, 0, 0,
      width/2, 0, 0,
      width/2, height, depth,
      -width/2, height, depth,
      // Back bottom edge
      -width/2, 0, depth,
      width/2, 0, depth,
    ]);
    
    const indices = new Uint32Array([
      // Front triangle
      0, 1, 2,
      0, 2, 3,
      // Back triangle  
      4, 5, 1,
      4, 1, 0,
      // Top face
      3, 2, 5,
      3, 5, 4,
      // Left face
      0, 3, 4,
      // Right face
      1, 5, 2,
      // Bottom face
      0, 4, 5,
      0, 5, 1,
    ]);
    
    const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
      .setFriction(0.3);
    
    this.world.createCollider(colliderDesc, body);
    this.staticBodies.push(body);
    
    return body;
  }
  
  /**
   * Create a curved quarter pipe collider (approximated with segments)
   */
  createQuarterPipeCollider(
    position: THREE.Vector3,
    radius: number,
    width: number,
    segments: number = 8,
    rotation?: THREE.Euler
  ): RAPIER.RigidBody {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(position.x, position.y, position.z);
    
    if (rotation) {
      const quat = new THREE.Quaternion().setFromEuler(rotation);
      bodyDesc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    }
    
    const body = this.world.createRigidBody(bodyDesc);
    
    // Generate curved surface vertices
    const vertices: number[] = [];
    const indices: number[] = [];
    
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI / 2;
      const x = radius - Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      
      // Two vertices per segment (left and right side)
      vertices.push(-width/2, y, x);
      vertices.push(width/2, y, x);
    }
    
    // Create triangles between segments
    for (let i = 0; i < segments; i++) {
      const bl = i * 2;
      const br = i * 2 + 1;
      const tl = (i + 1) * 2;
      const tr = (i + 1) * 2 + 1;
      
      indices.push(bl, br, tr);
      indices.push(bl, tr, tl);
    }
    
    const colliderDesc = RAPIER.ColliderDesc.trimesh(
      new Float32Array(vertices),
      new Uint32Array(indices)
    ).setFriction(0.3);
    
    this.world.createCollider(colliderDesc, body);
    this.staticBodies.push(body);
    
    return body;
  }
  
  /**
   * Clear all static bodies (for level reload)
   */
  clearStaticBodies(): void {
    for (const body of this.staticBodies) {
      this.world.removeRigidBody(body);
    }
    this.staticBodies = [];
  }
  
  /**
   * Step physics simulation
   */
  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
  }
  
  /**
   * Get position of a rigid body
   */
  getPosition(body: RAPIER.RigidBody): THREE.Vector3 {
    const pos = body.translation();
    return new THREE.Vector3(pos.x, pos.y, pos.z);
  }
  
  /**
   * Get rotation of a rigid body
   */
  getRotation(body: RAPIER.RigidBody): THREE.Quaternion {
    const rot = body.rotation();
    return new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
  }
  
  /**
   * Apply force to a rigid body
   */
  applyForce(body: RAPIER.RigidBody, force: THREE.Vector3): void {
    body.addForce({ x: force.x, y: force.y, z: force.z }, true);
  }
  
  /**
   * Apply impulse to a rigid body
   */
  applyImpulse(body: RAPIER.RigidBody, impulse: THREE.Vector3): void {
    body.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);
  }
  
  /**
   * Apply torque to a rigid body
   */
  applyTorque(body: RAPIER.RigidBody, torque: THREE.Vector3): void {
    body.addTorque({ x: torque.x, y: torque.y, z: torque.z }, true);
  }
  
  /**
   * Get linear velocity
   */
  getVelocity(body: RAPIER.RigidBody): THREE.Vector3 {
    const vel = body.linvel();
    return new THREE.Vector3(vel.x, vel.y, vel.z);
  }
  
  /**
   * Set linear velocity
   */
  setVelocity(body: RAPIER.RigidBody, velocity: THREE.Vector3): void {
    body.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
  }
  
  /**
   * Set position directly
   */
  setPosition(body: RAPIER.RigidBody, position: THREE.Vector3): void {
    body.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
  }
  
  /**
   * Set Y rotation only (for grinding along rails)
   */
  setRotationY(body: RAPIER.RigidBody, angle: number): void {
    // Create quaternion from Y rotation only
    const quat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      angle
    );
    body.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, true);
  }
  
  /**
   * Get angular velocity
   */
  getAngularVelocity(body: RAPIER.RigidBody): THREE.Vector3 {
    const angvel = body.angvel();
    return new THREE.Vector3(angvel.x, angvel.y, angvel.z);
  }
  
  /**
   * Set angular velocity
   */
  setAngularVelocity(body: RAPIER.RigidBody, angvel: THREE.Vector3): void {
    body.setAngvel({ x: angvel.x, y: angvel.y, z: angvel.z }, true);
  }
}
