/**
 * Physics World
 * Rapier.js wrapper for game physics
 */

import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export class PhysicsWorld {
  private world!: RAPIER.World;
  private initialized = false;
  
  async init(): Promise<void> {
    if (this.initialized) return;
    
    console.log('Initializing Rapier physics...');
    await RAPIER.init();
    console.log('Rapier initialized!');
    
    // Create world with gravity
    this.world = new RAPIER.World({ x: 0, y: -20, z: 0 });
    this.initialized = true;
  }
  
  /**
   * Create the player's chair physics body
   */
  createChairBody(position: THREE.Vector3): RAPIER.RigidBody {
    // Create dynamic rigid body
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y + 0.5, position.z)
      .setLinearDamping(0.5)
      .setAngularDamping(2.0);
    
    const body = this.world.createRigidBody(bodyDesc);
    
    // Main body collider (capsule for seat area)
    const seatDesc = RAPIER.ColliderDesc.capsule(0.2, 0.25)
      .setTranslation(0, 0.3, 0)
      .setMass(80); // 80kg player + chair
    
    this.world.createCollider(seatDesc, body);
    
    // Wheel colliders for more realistic ground contact
    const wheelPositions = [
      { x: 0.25, z: 0 },
      { x: -0.25, z: 0 },
      { x: 0.12, z: 0.22 },
      { x: -0.12, z: 0.22 },
      { x: 0, z: -0.25 }
    ];
    
    for (const pos of wheelPositions) {
      const wheelDesc = RAPIER.ColliderDesc.ball(0.05)
        .setTranslation(pos.x, 0.05, pos.z)
        .setFriction(0.3)
        .setRestitution(0.1);
      
      this.world.createCollider(wheelDesc, body);
    }
    
    return body;
  }
  
  /**
   * Create ground plane
   */
  createGround(): void {
    const groundDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(0, 0, 0);
    
    const groundBody = this.world.createRigidBody(groundDesc);
    
    const groundColliderDesc = RAPIER.ColliderDesc.cuboid(100, 0.1, 100)
      .setFriction(0.8)
      .setRestitution(0.0);
    
    this.world.createCollider(groundColliderDesc, groundBody);
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
    ).setFriction(0.5);
    
    this.world.createCollider(colliderDesc, body);
    
    return body;
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
}
