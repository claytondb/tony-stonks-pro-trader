/**
 * Physics World
 * Rapier.js wrapper for game physics
 */

import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

/**
 * Distance from the chair body's centre down to the bottom of its capsule.
 * halfHeight 0.3 + radius 0.4. Ground raycasts start at the centre (that is where
 * `getPosition` reports), so every "how far is the floor" number has to have this
 * subtracted before it means "gap under the wheels".
 */
export const CHAIR_FOOT_OFFSET = 0.7;

/**
 * Radius of the chair's capsule. CHAIR_FOOT_OFFSET is this plus the capsule's half-height,
 * and the two are only interchangeable on level ground: on a surface tilted by θ the
 * capsule's nearest point to that surface is `cos θ · (verticalGap + RADIUS) − RADIUS`
 * away, not `verticalGap · cos θ`. Anything that decides "are the wheels touching?" on a
 * ramp needs the radius separately.
 */
export const CHAIR_RADIUS = 0.4;

export class PhysicsWorld {
  private world!: RAPIER.World;
  private initialized = false;
  private staticBodies: RAPIER.RigidBody[] = [];  // Track static bodies for cleanup
  /**
   * The player's chair. `step()` needs it because it is the only body in the world fast
   * enough for a single fixed step to move it further than its own collider is thick.
   */
  private chairBody: RAPIER.RigidBody | null = null;
  /**
   * Furthest the chair may FALL inside one solver substep, metres.
   *
   * MOMENTUM, NOT SAFETY. A capsule of radius 0.4 that drops further than its own radius
   * in one step arrives already BURIED in the floor, and a deep overlap does not resolve
   * along the face you touched — it resolves along whichever face of the slab is now
   * nearest, which at that depth is a SIDE face. That turns a landing into a sideways
   * shove. Measured on an 8 m drop before this existed: the chair fell 0.37 m in one step,
   * penetrated 0.32 m, and lost 74% of its PLANAR speed in a single frame (11.97 -> 3.11
   * m/s) — a big air, the move that is supposed to pay the most, costing the line instead.
   * carriedSpeed then papered over it by handing back 93%, so the visible symptom was a
   * one-frame hitch and a permanent 7% tax on every big landing.
   *
   * VERTICAL TRAVEL ONLY, deliberately. Substepping on total speed was measured too, and
   * it cost the run: median speed 14.6 -> 13.4 and 361 m -> 338 m over the flow benchmark,
   * because at 15 m/s the chair was tunnelling THROUGH level geometry it is supposed to
   * hit, and resolving those contacts properly is a change to level collision, not to
   * landing momentum. Gravity is the only thing in this game that moves the chair faster
   * than its own collider is thick, so gating on |v.y| fixes the landing and leaves every
   * horizontal contact resolved exactly as it was.
   *
   * 0.30 m is under the capsule radius; the ground snap tops out at 9 m/s (0.15 m/step),
   * so ordinary rolling never substeps. Only a real fall does.
   */
  private readonly MAX_SUBSTEP_FALL = 0.30;
  /** Ceiling on substeps per fixed update, so a pathological velocity cannot stall a frame. */
  private readonly MAX_SUBSTEPS = 4;

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
      // Rolling resistance is modelled explicitly in Game.applyMovement so that coasting
      // bleeds off at an authored rate. Solver damping here would tax air time as well,
      // which is exactly where a THPS line needs its speed left alone.
      .setLinearDamping(0.0)
      .setAngularDamping(8.0)  // Higher = snappier turn stop (was 5.0)
      .enabledRotations(false, true, false);

    const body = this.world.createRigidBody(bodyDesc);

    // Capsule collider - slides better on ramps than cylinder
    // halfHeight=0.3 (middle section), radius=0.4 (end caps)
    // Friction is essentially zero: Coulomb friction against a 0.5-friction floor under
    // 30 m/s^2 of gravity decelerates the chair at ~9 m/s^2, which kills a line in two
    // seconds. Casters roll; grip and drag are authored in the movement model instead.
    const bodyCollider = RAPIER.ColliderDesc.capsule(0.3, 0.4)
      .setMass(50)
      .setFriction(0.0)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      // Contacts are perfectly inelastic from the chair's side. The walls carry
      // restitution 0.3 and the default combine rule is Average, so clipping one used to
      // reverse 15% of the impact velocity — speed spent pushing the player backwards.
      // Min makes a graze remove the into-the-wall component and nothing more, which is
      // what lets resolveObstacles steer the line out instead of rebuilding it.
      .setRestitution(0.0)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min);
    
    this.world.createCollider(bodyCollider, body);

    this.chairBody = body;   // step() bounds this body's travel per substep

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
   * Create a static cylinder collider
   */
  createStaticCylinder(
    position: THREE.Vector3,
    halfHeight: number,
    radius: number,
    rotation?: THREE.Euler
  ): RAPIER.RigidBody {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(position.x, position.y, position.z);
    
    if (rotation) {
      const quat = new THREE.Quaternion().setFromEuler(rotation);
      bodyDesc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    }
    
    const body = this.world.createRigidBody(bodyDesc);
    
    const colliderDesc = RAPIER.ColliderDesc.cylinder(halfHeight, radius)
      .setFriction(0.2);
    
    this.world.createCollider(colliderDesc, body);
    this.staticBodies.push(body);
    
    return body;
  }
  
  /**
   * Create a static sphere collider
   */
  createStaticSphere(
    position: THREE.Vector3,
    radius: number
  ): RAPIER.RigidBody {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(position.x, position.y, position.z);
    
    const body = this.world.createRigidBody(bodyDesc);
    
    const colliderDesc = RAPIER.ColliderDesc.ball(radius)
      .setFriction(0.2);
    
    this.world.createCollider(colliderDesc, body);
    this.staticBodies.push(body);
    
    return body;
  }
  
  /**
   * Create a static cone collider
   */
  createStaticCone(
    position: THREE.Vector3,
    halfHeight: number,
    radius: number
  ): RAPIER.RigidBody {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(position.x, position.y, position.z);
    
    const body = this.world.createRigidBody(bodyDesc);
    
    const colliderDesc = RAPIER.ColliderDesc.cone(halfHeight, radius)
      .setFriction(0.2);
    
    this.world.createCollider(colliderDesc, body);
    this.staticBodies.push(body);
    
    return body;
  }
  
  /**
   * Create a compound collider from multiple shapes on one body
   */
  createCompoundBody(position: THREE.Vector3, rotation?: THREE.Euler): RAPIER.RigidBody {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(position.x, position.y, position.z);
    
    if (rotation) {
      const quat = new THREE.Quaternion().setFromEuler(rotation);
      bodyDesc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    }
    
    const body = this.world.createRigidBody(bodyDesc);
    this.staticBodies.push(body);
    
    return body;
  }
  
  /**
   * Add a box collider to an existing body (for compound shapes)
   */
  addBoxCollider(
    body: RAPIER.RigidBody,
    localPosition: THREE.Vector3,
    halfExtents: THREE.Vector3,
    localRotation?: THREE.Euler
  ): void {
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      halfExtents.x,
      halfExtents.y,
      halfExtents.z
    )
    .setTranslation(localPosition.x, localPosition.y, localPosition.z)
    .setFriction(0.2);
    
    if (localRotation) {
      const quat = new THREE.Quaternion().setFromEuler(localRotation);
      colliderDesc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    }
    
    this.world.createCollider(colliderDesc, body);
  }
  
  /**
   * Add a cylinder collider to an existing body (for compound shapes)
   */
  addCylinderCollider(
    body: RAPIER.RigidBody,
    localPosition: THREE.Vector3,
    halfHeight: number,
    radius: number,
    localRotation?: THREE.Euler
  ): void {
    const colliderDesc = RAPIER.ColliderDesc.cylinder(halfHeight, radius)
      .setTranslation(localPosition.x, localPosition.y, localPosition.z)
      .setFriction(0.2);
    
    if (localRotation) {
      const quat = new THREE.Quaternion().setFromEuler(localRotation);
      colliderDesc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    }
    
    this.world.createCollider(colliderDesc, body);
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
   * A static collider built from an arbitrary triangle mesh.
   *
   * THE ONLY WAY A CURVED SURFACE CAN BE COLLIDED CORRECTLY. Every other collider in this
   * file is a primitive, and for desks, walls and ledges that is right. It is not right for
   * a transition: a quarter pipe used to be collided as a plain axis-aligned CUBOID (a
   * 5 m box with a curved mesh drawn over it), which is why riding one produced no ramp
   * normal, no climb and no launch at all — the probe measured surfaceAngle 0 and zero
   * airtime off every quarter pipe in the game. A box cannot have a tangent.
   *
   * Callers pass the SAME vertex/index arrays they built the visual geometry from, so the
   * thing the player sees and the thing the player rides can never drift apart. Rapier
   * trimeshes have no interior, so hand it a CLOSED shell: an open sheet is rideable from
   * both sides and a body that ends up behind it has nothing to push it out.
   */
  createStaticTrimesh(
    position: THREE.Vector3,
    vertices: Float32Array,
    indices: Uint32Array,
    rotation?: THREE.Euler,
    friction = 0.3,
  ): RAPIER.RigidBody {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(position.x, position.y, position.z);

    if (rotation) {
      const quat = new THREE.Quaternion().setFromEuler(rotation);
      bodyDesc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    }

    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
      .setFriction(friction)
      .setRestitution(0.0)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min);

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
   * A KINEMATIC platform: a box the level moves and the chair rides.
   *
   * Kinematic-POSITION based, not velocity based, because the office lift is authored as a
   * position curve (see OfficeLevel.officeMoverY) rather than as a speed. Rapier resolves a
   * kinematic body against a dynamic one by moving the dynamic body out of the way, so a
   * rising platform carries the chair up; a descending one simply stops falling away from it,
   * and gravity (-30) keeps the chair in contact all the way down.
   *
   * Friction is real here, unlike the level's static boxes: a platform with zero friction
   * under a zero-friction chair is a sheet of ice, and the chair would slide off the lift the
   * moment the player touched a direction key.
   *
   * Registered in staticBodies so clearStaticBodies() disposes it with the rest of the level.
   */
  createKinematicBox(position: THREE.Vector3, halfExtents: THREE.Vector3): RAPIER.RigidBody {
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(position.x, position.y, position.z);
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setFriction(0.4)
      .setRestitution(0.0);
    this.world.createCollider(colliderDesc, body);
    this.staticBodies.push(body);
    return body;
  }

  /** Move a kinematic body created by createKinematicBox. Call once per fixed step. */
  setKinematicTarget(body: RAPIER.RigidBody, position: THREE.Vector3): void {
    body.setNextKinematicTranslation({ x: position.x, y: position.y, z: position.z });
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
    // Split the step so the chair can never tunnel far enough into a surface for the
    // contact to resolve against the wrong face. See MAX_SUBSTEP_FALL: this is a
    // momentum fix, not a robustness one, and it is a no-op at ordinary ground speeds.
    let substeps = 1;
    if (this.chairBody) {
      const fall = Math.abs(this.chairBody.linvel().y) * dt;
      substeps = Math.min(
        this.MAX_SUBSTEPS,
        Math.max(1, Math.ceil(fall / this.MAX_SUBSTEP_FALL)),
      );
    }
    this.world.timestep = dt / substeps;
    for (let i = 0; i < substeps; i++) this.world.step();
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
  
  /**
   * THPS-style ground raycast - detect surface below player
   * Returns surface info or null if airborne
   */
  raycastGround(
    origin: THREE.Vector3,
    maxGap: number = 2.0,
    exclude?: RAPIER.RigidBody,
    footOffset: number = 0,
  ): {
    hit: boolean;
    distance: number;
    point: THREE.Vector3;
    normal: THREE.Vector3;
  } | null {
    if (!this.initialized) return null;

    const rayOrigin = { x: origin.x, y: origin.y, z: origin.z };
    const rayDir = { x: 0, y: -1, z: 0 }; // Straight down

    // `solid = true` means a ray starting INSIDE a collider reports toi 0. The chair's own
    // capsule surrounds the origin, so without the exclusion filter every ground cast
    // returns "floor is 0 m away" — the player is grounded at any altitude.
    const ray = new RAPIER.Ray(rayOrigin, rayDir);
    const maxDistance = maxGap + footOffset;
    const hit = this.world.castRay(ray, maxDistance, true, undefined, undefined, undefined, exclude);

    if (hit) {
      const toi = hit.toi;
      const hitPoint = ray.pointAt(toi);
      const hitNormal = hit.collider.castRayAndGetNormal(ray, maxDistance, true);

      let normal = new THREE.Vector3(0, 1, 0); // Default up
      if (hitNormal) {
        normal = new THREE.Vector3(hitNormal.normal.x, hitNormal.normal.y, hitNormal.normal.z);
      }

      return {
        hit: true,
        // Reported as the gap under the wheels, not the distance from the body centre.
        distance: Math.max(0, toi - footOffset),
        point: new THREE.Vector3(hitPoint.x, hitPoint.y, hitPoint.z),
        normal: normal
      };
    }

    return null;
  }

  /**
   * Horizontal feeler used by the movement model to see walls, curbs and ramp faces
   * BEFORE the solver pins the chair against them. Excludes the caster's own body.
   */
  probeDirection(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
    exclude?: RAPIER.RigidBody,
  ): { distance: number; normal: THREE.Vector3; point: THREE.Vector3 } | null {
    if (!this.initialized) return null;
    const len = Math.hypot(direction.x, direction.y, direction.z);
    if (len < 1e-6) return null;
    const d = { x: direction.x / len, y: direction.y / len, z: direction.z / len };

    const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, d);
    const hit = this.world.castRayAndGetNormal(
      ray, maxDistance, true, undefined, undefined, undefined, exclude,
    );
    if (!hit) return null;

    const p = ray.pointAt(hit.toi);
    const n = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
    // A ray leaving the inside of a collider can report a zero/flipped normal; make it
    // always oppose the probe so the caller can project against it safely.
    if (n.lengthSq() < 1e-6) n.set(-d.x, -d.y, -d.z);
    else if (n.dot(new THREE.Vector3(d.x, d.y, d.z)) > 0) n.negate();

    return {
      distance: hit.toi,
      normal: n,
      point: new THREE.Vector3(p.x, p.y, p.z),
    };
  }


  /**
   * Check for penetration/stuck state and push player out
   * Only triggers when actually inside/overlapping objects, not just near them
   * Returns push info if stuck: { direction, severity (0-1), betweenObjects }
   */
  checkAndResolvePenetration(
    body: RAPIER.RigidBody,
    radius: number = 0.5
  ): { direction: THREE.Vector3; severity: number; betweenObjects: boolean } | null {
    if (!this.initialized) return null;
    
    const pos = body.translation();
    const vel = body.linvel();
    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    
    // Only check when moving slowly (stuck) or player velocity is being blocked
    if (speed > 3) return null;
    
    const pushDirection = new THREE.Vector3();
    let penetrationCount = 0;
    let totalPenetration = 0;
    
    // Cast rays in 8 horizontal directions
    const directions = [
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: -1 },
      { x: 0.707, z: 0.707 },
      { x: 0.707, z: -0.707 },
      { x: -0.707, z: 0.707 },
      { x: -0.707, z: -0.707 },
    ];
    
    const hitDirections: number[] = [];
    const penetrationThreshold = radius * 0.3; // Only trigger if actually penetrating
    
    for (let di = 0; di < directions.length; di++) {
      const dir = directions[di];
      const ray = new RAPIER.Ray(
        { x: pos.x, y: pos.y + 0.5, z: pos.z },
        { x: dir.x, y: 0, z: dir.z }
      );
      
      const hit = this.world.castRay(ray, radius, true);
      
      if (hit && hit.toi < penetrationThreshold) {
        // We're actually penetrating this obstacle
        const penetrationDepth = penetrationThreshold - hit.toi;
        const pushStrength = penetrationDepth / penetrationThreshold;
        pushDirection.x -= dir.x * pushStrength;
        pushDirection.z -= dir.z * pushStrength;
        penetrationCount++;
        totalPenetration += penetrationDepth;
        hitDirections.push(di);
      }
    }
    
    // Check if we're stuck between objects (hits on opposite sides)
    const betweenObjects = 
      (hitDirections.includes(0) && hitDirections.includes(1)) || // +X and -X
      (hitDirections.includes(2) && hitDirections.includes(3)) || // +Z and -Z
      (hitDirections.includes(4) && hitDirections.includes(7)) || // diagonals
      (hitDirections.includes(5) && hitDirections.includes(6));
    
    // Only return if actually penetrating (not just near)
    if (penetrationCount >= 2 && betweenObjects) {
      const severity = Math.min(1, totalPenetration / penetrationThreshold);
      
      // If push direction is too weak, push upward
      if (pushDirection.length() < 0.3) {
        pushDirection.set(0, 1, 0);
      } else {
        pushDirection.normalize();
      }
      
      return { direction: pushDirection, severity, betweenObjects };
    }
    
    return null;
  }
  
  /**
   * Apply separation impulse to push player away from obstacles
   */
  applySeparation(body: RAPIER.RigidBody, direction: THREE.Vector3, strength: number = 5): void {
    const currentVel = body.linvel();
    
    // If pushing up, also reduce horizontal velocity to help escape
    if (direction.y > 0.5) {
      const pushVel = new THREE.Vector3(
        currentVel.x * 0.5,
        Math.max(currentVel.y, strength),
        currentVel.z * 0.5
      );
      body.setLinvel({ x: pushVel.x, y: pushVel.y, z: pushVel.z }, true);
    } else {
      const pushVel = new THREE.Vector3(
        currentVel.x + direction.x * strength,
        currentVel.y,
        currentVel.z + direction.z * strength
      );
      body.setLinvel({ x: pushVel.x, y: pushVel.y, z: pushVel.z }, true);
    }
  }
  
  /**
   * Emergency teleport when severely stuck
   */
  emergencyUnstuck(body: RAPIER.RigidBody): void {
    const pos = body.translation();
    // Move up and slightly forward
    body.setTranslation({ x: pos.x, y: pos.y + 1.5, z: pos.z }, true);
    body.setLinvel({ x: 0, y: 2, z: 0 }, true);
  }
  
  /**
   * Multi-ray ground check for better surface detection
   * Casts rays at player center and 4 corners
   */
  raycastGroundMulti(
    origin: THREE.Vector3,
    radius: number = 0.3,
    maxGap: number = 2.0,
    exclude?: RAPIER.RigidBody,
    footOffset: number = 0,
  ): {
    hit: boolean;
    distance: number;
    point: THREE.Vector3;
    normal: THREE.Vector3;
    surfaceAngle: number; // Angle from horizontal in degrees
  } | null {
    // Cast multiple rays for better surface detection
    const offsets = [
      new THREE.Vector3(0, 0, 0),         // Center
      new THREE.Vector3(radius, 0, 0),    // Right
      new THREE.Vector3(-radius, 0, 0),   // Left
      new THREE.Vector3(0, 0, radius),    // Front
      new THREE.Vector3(0, 0, -radius),   // Back
    ];
    
    let closestHit: ReturnType<typeof this.raycastGround> = null;
    let closestDist = Infinity;
    const hits: { distance: number; normal: THREE.Vector3 }[] = [];

    for (const offset of offsets) {
      const rayOrigin = origin.clone().add(offset);
      const hit = this.raycastGround(rayOrigin, maxGap, exclude, footOffset);

      if (hit && hit.distance < closestDist) {
        closestDist = hit.distance;
        closestHit = hit;
      }
      if (hit) {
        hits.push({ distance: hit.distance, normal: hit.normal });
      }
    }

    if (!closestHit) return null;

    // Average the normals for smoother surface detection — but ONLY across rays that found
    // the same surface. The fan is 0.6 m wide, and near the coping of a transition that is
    // wide enough to straddle the lip: one ray lands on a wall at 80 degrees and another on
    // the flat deck behind it. Averaging those gave a 45 degree normal for a surface that
    // is nowhere near 45 degrees, and the movement model then drove the chair diagonally
    // INTO a vertical wall and held it there — the ramp probe measured six hundred
    // milliseconds pinned at the lip with 3 m/s of velocity going nowhere.
    //
    // Rays whose hit is much further away than the nearest one are looking at something
    // else (the floor beyond a lip, the step below an edge) and are dropped. On any
    // ordinary surface every ray agrees to within a centimetre and nothing is dropped, so
    // this is exactly the old behaviour everywhere except the case it was wrong.
    const SAME_SURFACE = 0.35;
    const avgNormal = new THREE.Vector3();
    let used = 0;
    for (const h of hits) {
      if (h.distance <= closestDist + SAME_SURFACE) { avgNormal.add(h.normal); used++; }
    }
    if (used === 0) avgNormal.copy(closestHit.normal); else avgNormal.divideScalar(used);
    avgNormal.normalize();
    
    // Calculate surface angle from horizontal
    const up = new THREE.Vector3(0, 1, 0);
    const surfaceAngle = THREE.MathUtils.radToDeg(Math.acos(avgNormal.dot(up)));
    
    return {
      hit: true,
      distance: closestHit.distance,
      point: closestHit.point,
      normal: avgNormal,
      surfaceAngle: surfaceAngle
    };
  }
  
  /**
   * Get the movement direction adjusted for surface slope (THPS-style)
   * This makes the player follow ramps instead of fighting them
   */
  getSurfaceMovementDirection(forward: THREE.Vector3, surfaceNormal: THREE.Vector3): THREE.Vector3 {
    // Project forward direction onto the surface plane
    // This makes movement follow the ramp angle
    const up = new THREE.Vector3(0, 1, 0);
    
    // If surface is flat, just return forward
    if (surfaceNormal.dot(up) > 0.99) {
      return forward.clone();
    }
    
    // Calculate the direction along the surface
    // Cross product gives us a vector perpendicular to both normal and forward
    const right = new THREE.Vector3().crossVectors(surfaceNormal, forward).normalize();
    // Cross again to get the "forward" direction along the surface
    const surfaceForward = new THREE.Vector3().crossVectors(right, surfaceNormal).normalize();
    
    return surfaceForward;
  }
}
