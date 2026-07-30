/**
 * Camera Controller
 * Smooth follow camera for player with mouse orbit
 */

import * as THREE from 'three';

/**
 * Frame-rate-independent smoothing factor.
 *
 * Every smoothing term in this file used to be written `lerp(target, k * dt)`, which is
 * only stable while `k * dt < 1`. At 60fps and k=30 that is 0.5 and looks fine — but a
 * single long frame (level load, GC pause, a slower machine, a backgrounded tab) makes
 * `k * dt` exceed 1, and lerp then OVERSHOOTS the target and oscillates. That is what
 * made the camera swing when the chair turned.
 *
 * `1 - exp(-k * dt)` is the exact solution to the same exponential decay. It approaches 1
 * but never reaches or exceeds it, so it cannot overshoot at any frame rate, and the
 * perceived smoothing speed is identical regardless of dt.
 */
function damp(k: number, dt: number): number {
  return 1 - Math.exp(-k * dt);
}

/** Shortest signed angular difference, wrapped to [-pi, pi]. */
function angleDelta(to: number, from: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class CameraController {
  /**
   * Set false to stop the controller writing to the camera at all, leaving an
   * external owner (the screenshot harness, a cutscene) in control of it.
   */
  enabled = true;

  private camera: THREE.PerspectiveCamera;
  private target: THREE.Object3D | null = null;
  
  // ---------------------------------------------------------------------------
  // Framing
  //
  // The old rig was a one-point-perspective corridor shot: 80 deg VERTICAL fov (which
  // in three means a ~110 deg horizontal fisheye), a look-at target a full metre above
  // the chair, and a dead-centre vanishing point. That gave away ~40% of every frame
  // to untextured ceiling tile, stretched the cubicle rows at the edges, and left the
  // hero at roughly 4% of frame area.
  //
  // The framing below is built from three numbers:
  //   - 58 deg vertical fov (~85 deg horizontal) — a skate-game lens, not a fisheye
  //   - a look-at target ~1.05 m BELOW the camera over a 3.4 m boom => ~17 deg of
  //     downward pitch, which puts the ceiling line in the top ~20% of frame
  //   - a lateral boom offset with a *smaller* matching look-at offset, so the
  //     vanishing point sits off-centre and the mirror symmetry breaks
  // ---------------------------------------------------------------------------
  private offset = new THREE.Vector3(0, 1.7, -3.4);
  /** Boom shifted off the player's centre line; the look-at follows only partly. */
  private lateralOffset = 0.5;
  private lookAtHeight = 0.66;
  private lookAtLateral = 0.16;
  private lookAhead = 0.5;
  private smoothSpeed = 18;       // Position tracking
  private rotationSmooth = 14;    // Boom swing follow

  // ---- yaw trailing ---------------------------------------------------------
  // The boom used to be rotated by the chair's yaw directly, so the camera was welded
  // to the chair and inherited every bit of its angular velocity — turn the chair at
  // 258 deg/s and the entire view rotated at 258 deg/s. THPS cameras TRAIL: the boom
  // lags the board through a turn and catches up on the way out, which is what makes a
  // fast turn readable instead of nauseating.
  //
  // `camYaw` is the boom's own yaw. It damps toward the chair's yaw and is hard-limited
  // to `maxYawLag` radians behind it, so it always catches up but never snaps.
  private camYaw = 0;
  private hasCamYaw = false;
  private yawFollow = 7;                    // how eagerly the boom chases chair yaw
  private readonly maxYawLag = 0.60;        // ~34 deg of permitted trail

  // Dynamic FOV settings
  private baseFOV = 58;      // vertical; ~85 deg horizontal at 16:9
  private maxFOV = 72;       // FOV at max speed
  private currentFOV = 58;
  private targetFOV = 58;
  private fovSmoothSpeed = 6;  // Faster FOV transitions

  // ---- dutch roll -----------------------------------------------------------
  // A still frame has to sell velocity on its own. Rolling the camera into turns by
  // a few degrees is the cheapest, most legible speed cue there is, and it costs one
  // euler write per frame.
  private lastSpeed = 0;
  private prevTargetYaw = 0;
  private hasPrevYaw = false;
  private rollCurrent = 0;
  private readonly maxRoll = 0.075;   // ~4.3 degrees
  
  // Trick zoom settings (zoom out during air time for better visibility)
  private trickZoomAmount = 0.10;   // Subtler zoom during tricks
  private targetZoomMultiplier = 1;
  private currentZoomMultiplier = 1;
  private zoomSmoothSpeed = 10;     // Snappier zoom transitions
  
  // Current state
  private currentOffset = new THREE.Vector3();
  private currentLookAt = new THREE.Vector3();
  
  // Shake state
  private shakeIntensity = 0;
  private shakeDuration = 0;
  private shakeTimeRemaining = 0;
  private shakeOffset = new THREE.Vector3();
  
  // Mouse orbit state
  private isDragging = false;
  private orbitAngleX = 0;  // Horizontal orbit (yaw)
  private orbitAngleY = 0;  // Vertical orbit (pitch)
  private targetOrbitX = 0;
  private targetOrbitY = 0;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private orbitSensitivity = 0.003;
  private orbitReturnSpeed = 8;  // Very fast snap back — always behind player
  private maxOrbitY = Math.PI / 6;  // Minimal vertical orbit
  private minOrbitY = -Math.PI / 12;
  
  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.currentOffset.copy(this.offset);
  }
  
  /**
   * Set up mouse event listeners for orbit control
   */
  setupMouseControls(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) {  // Left or right click
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      }
    });
    
    canvas.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
    
    canvas.addEventListener('mouseleave', () => {
      this.isDragging = false;
    });
    
    canvas.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      
      const deltaX = e.clientX - this.lastMouseX;
      const deltaY = e.clientY - this.lastMouseY;
      
      this.targetOrbitX += deltaX * this.orbitSensitivity;
      this.targetOrbitY += deltaY * this.orbitSensitivity;
      
      // Clamp vertical orbit
      this.targetOrbitY = Math.max(this.minOrbitY, Math.min(this.maxOrbitY, this.targetOrbitY));
      
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });
    
    // Prevent context menu on right click
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  
  /**
   * Reset orbit to default view
   */
  resetOrbit(): void {
    this.targetOrbitX = 0;
    this.targetOrbitY = 0;
  }
  
  setTarget(target: THREE.Object3D): void {
    this.target = target;
    
    // Initialize camera position
    if (target) {
      this.currentLookAt.copy(target.position);
      this.camera.position.copy(target.position).add(this.offset);
      // Re-seed the trailing yaw on the next update rather than swinging round from
      // whatever the previous target's heading was.
      this.hasCamYaw = false;
      this.hasPrevYaw = false;
      this.rollCurrent = 0;
    }
  }
  
  update(dt: number): void {
    if (!this.enabled) return;
    if (!this.target) return;
    
    // Smoothly return orbit to default when not dragging.
    // This was `*= (1 - orbitReturnSpeed * dt)`, which goes NEGATIVE once dt exceeds
    // 1/orbitReturnSpeed (0.125s here) — flipping the sign of the orbit angle every
    // frame and turning the return-to-centre into an oscillator. Exponential decay
    // cannot change sign.
    if (!this.isDragging) {
      const keep = Math.exp(-this.orbitReturnSpeed * dt);
      this.targetOrbitX *= keep;
      this.targetOrbitY *= keep;
    }

    // Smooth orbit angle transitions
    const orbitK = damp(5, dt);
    this.orbitAngleX += (this.targetOrbitX - this.orbitAngleX) * orbitK;
    this.orbitAngleY += (this.targetOrbitY - this.orbitAngleY) * orbitK;
    
    // Get target's forward direction
    const targetForward = new THREE.Vector3(0, 0, 1);
    targetForward.applyQuaternion(this.target.quaternion);
    
    // Smooth zoom multiplier transition
    this.currentZoomMultiplier += (this.targetZoomMultiplier - this.currentZoomMultiplier) * damp(this.zoomSmoothSpeed, dt);
    
    // Calculate desired camera position (behind and above target)
    // Apply zoom multiplier (>1 = further away for trick visibility)
    const desiredOffset = new THREE.Vector3(
      this.lateralOffset,
      this.offset.y * this.currentZoomMultiplier,
      this.offset.z * this.currentZoomMultiplier
    );
    
    // Rotate offset based on target rotation (only Y axis for now).
    // The boom follows `camYaw`, which TRAILS the chair's yaw — see the field comment.
    const targetRotationY = new THREE.Euler().setFromQuaternion(this.target.quaternion, 'YXZ').y;

    if (!this.hasCamYaw) {
      this.camYaw = targetRotationY;
      this.hasCamYaw = true;
    }
    this.camYaw += angleDelta(targetRotationY, this.camYaw) * damp(this.yawFollow, dt);
    const lag = angleDelta(targetRotationY, this.camYaw);
    if (lag > this.maxYawLag) this.camYaw = targetRotationY - this.maxYawLag;
    else if (lag < -this.maxYawLag) this.camYaw = targetRotationY + this.maxYawLag;

    desiredOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.camYaw);
    
    // Apply mouse orbit rotation
    desiredOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.orbitAngleX);
    
    // Apply grind camera rotation (slight side angle to show rail better)
    this.updateGrindCamera(dt);
    if (Math.abs(this.grindCameraAngle) > 0.001) {
      desiredOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.grindCameraAngle);
    }
    
    // Apply vertical orbit (pitch) - rotate around the horizontal axis perpendicular to offset
    const horizontalAxis = new THREE.Vector3(-desiredOffset.z, 0, desiredOffset.x).normalize();
    desiredOffset.applyAxisAngle(horizontalAxis, this.orbitAngleY);
    
    // Smooth offset transition
    this.currentOffset.lerp(desiredOffset, damp(this.rotationSmooth, dt));
    
    // Calculate camera position
    const desiredPosition = new THREE.Vector3()
      .copy(this.target.position)
      .add(this.currentOffset);
    
    // Smooth camera movement
    this.camera.position.lerp(desiredPosition, damp(this.smoothSpeed, dt));
    
    // Apply camera shake
    if (this.shakeTimeRemaining > 0) {
      this.shakeTimeRemaining -= dt;
      
      // Calculate shake decay (linear falloff)
      const shakeProgress = this.shakeTimeRemaining / this.shakeDuration;
      const currentIntensity = this.shakeIntensity * shakeProgress;
      
      // Random shake offset (Perlin-like smoothing via interpolation)
      this.shakeOffset.set(
        (Math.random() - 0.5) * 2 * currentIntensity,
        (Math.random() - 0.5) * 2 * currentIntensity,
        (Math.random() - 0.5) * 2 * currentIntensity
      );
      
      // Smooth the shake for less jarring effect
      this.camera.position.add(this.shakeOffset);
    }
    
    // Look at a point BELOW the camera height (downward pitch) and slightly to the
    // side of the boom's own lateral offset, which is what pulls the vanishing point
    // off the frame centre.
    const targetRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.target.quaternion);
    const lookAheadOffset = targetForward.clone().multiplyScalar(this.lookAhead);
    const desiredLookAt = new THREE.Vector3()
      .copy(this.target.position)
      .add(new THREE.Vector3(0, this.lookAtHeight, 0))
      .addScaledVector(targetRight, this.lookAtLateral)
      .add(lookAheadOffset);

    // Smooth look-at transition
    this.currentLookAt.lerp(desiredLookAt, damp(this.smoothSpeed, dt));

    this.camera.lookAt(this.currentLookAt);

    // ---- dutch roll into turns ---------------------------------------------
    // Lateral acceleration ~ yaw rate * forward speed. Applied AFTER lookAt(), which
    // has just overwritten the whole quaternion.
    if (dt > 1e-5) {
      let yawRate = 0;
      if (this.hasPrevYaw) {
        let d = targetRotationY - this.prevTargetYaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        yawRate = d / dt;
      }
      this.prevTargetYaw = targetRotationY;
      this.hasPrevYaw = true;

      const lateral = yawRate * Math.min(this.lastSpeed, 24);
      const targetRoll = THREE.MathUtils.clamp(-lateral * 0.010, -this.maxRoll, this.maxRoll);
      this.rollCurrent += (targetRoll - this.rollCurrent) * damp(8, dt);
    }
    if (Math.abs(this.rollCurrent) > 1e-4) {
      this.camera.rotation.z = this.rollCurrent;
    }

    // Update impact zoom decay
    this.updateImpactZoom(dt);
    
    // Smooth FOV transition (with impact zoom pulse subtracted)
    const effectiveFOV = this.targetFOV - this.impactZoomCurrent;
    this.currentFOV += (effectiveFOV - this.currentFOV) * damp(this.fovSmoothSpeed, dt);
    this.camera.fov = this.currentFOV;
    this.camera.updateProjectionMatrix();
  }
  
  /**
   * Shake camera (for impacts, bails)
   * @param intensity - Shake strength (0.1 = subtle, 1 = strong)
   * @param duration - Shake duration in seconds
   */
  shake(intensity = 0.5, duration = 0.3): void {
    // Only start new shake if it would be more intense
    if (intensity > this.shakeIntensity * (this.shakeTimeRemaining / this.shakeDuration)) {
      this.shakeIntensity = intensity;
      this.shakeDuration = duration;
      this.shakeTimeRemaining = duration;
    }
  }
  
  /**
   * Zoom in/out
   */
  setZoom(zoom: number): void {
    // Scaled from the same framing baseline as `offset`, not from the old 4.2/2.2
    // pair, or calling setZoom(1) would silently undo the whole composition fix.
    this.offset.z = -3.4 * zoom;
    this.offset.y = 1.7 * zoom;
  }
  
  /**
   * Update FOV based on player speed
   * Creates a sense of velocity - wider FOV when moving fast
   * @param speed - Current player speed (0 to maxSpeed)
   * @param maxSpeed - Speed at which FOV reaches maximum (e.g., 18)
   */
  updateFOVFromSpeed(speed: number, maxSpeed: number = 18): void {
    this.lastSpeed = speed;

    // Calculate speed ratio (0 to 1)
    const speedRatio = Math.min(speed / maxSpeed, 1);

    // Ease, but not as a pure square — squaring meant the FOV ramp, like the radial
    // blur, only arrived at terminal velocity and was invisible at cruise.
    const easedRatio = Math.pow(speedRatio, 1.35);

    // Interpolate between base and max FOV
    this.targetFOV = this.baseFOV + (this.maxFOV - this.baseFOV) * easedRatio;
  }
  
  /**
   * Reset FOV to default (for menus, pauses, etc.)
   */
  resetFOV(): void {
    this.targetFOV = this.baseFOV;
  }
  
  /**
   * Update trick zoom based on air state
   * Zooms out slightly during air time for better trick visibility
   * @param isAirborne - Whether player is in the air
   * @param airTime - Time in air (seconds), used for gradual zoom
   */
  setTrickZoom(isAirborne: boolean, airTime: number = 0): void {
    if (isAirborne) {
      // Gradually zoom out as air time increases (max effect at ~0.5s)
      const airTimeFactor = Math.min(airTime / 0.5, 1);
      // Ease in for smooth transition
      const easedFactor = airTimeFactor * airTimeFactor;
      this.targetZoomMultiplier = 1 + (this.trickZoomAmount * easedFactor);
    } else {
      // Return to normal zoom
      this.targetZoomMultiplier = 1;
    }
  }
  
  /**
   * Reset trick zoom to default
   */
  resetTrickZoom(): void {
    this.targetZoomMultiplier = 1;
  }
  
  // Impact zoom pulse state (brief zoom on big landings)
  private impactZoomCurrent = 0;      // Current FOV reduction
  private impactZoomDecay = 8;        // How fast the pulse fades (higher = faster)
  
  // Grind camera settings (slight rotation to better show the rail)
  private grindCameraAngle = 0;           // Current grind camera rotation
  private targetGrindAngle = 0;           // Target rotation
  private grindAngleMax = Math.PI / 12;   // 15 degrees max rotation
  private grindAngleSmoothSpeed = 4;      // How fast to transition
  private grindRailDirection = new THREE.Vector3();  // Direction of current rail
  
  /**
   * Trigger an impact zoom pulse on big landings
   * Briefly narrows FOV then returns to normal, creating a "punch" effect
   * @param points - Points scored on this landing (used to scale intensity)
   */
  impactZoomPulse(points: number): void {
    // Only trigger for landings worth 5000+ points
    if (points < 5000) return;
    
    // Scale intensity based on points (5000 = subtle, 50000+ = dramatic)
    // FOV reduction: 5-15 degrees based on points
    const pointsFactor = Math.min((points - 5000) / 45000, 1); // 0 at 5000, 1 at 50000
    const fovReduction = 5 + pointsFactor * 10; // 5 to 15 degrees
    
    // Set the impact zoom (will decay back to 0)
    this.impactZoomCurrent = fovReduction;
  }
  
  /**
   * Update impact zoom (call in main update loop)
   */
  updateImpactZoom(dt: number): void {
    // Decay the impact zoom effect
    if (this.impactZoomCurrent > 0.1) {
      this.impactZoomCurrent -= this.impactZoomCurrent * damp(this.impactZoomDecay, dt);
    } else {
      this.impactZoomCurrent = 0;
    }
  }
  
  /**
   * Set grind camera state - rotates camera to better show the rail during grinds
   * @param isGrinding - Whether player is currently grinding
   * @param railStart - Start point of the rail (optional, for direction)
   * @param railEnd - End point of the rail (optional, for direction)
   */
  setGrindCamera(isGrinding: boolean, railStart?: THREE.Vector3, railEnd?: THREE.Vector3): void {
    if (isGrinding && railStart && railEnd) {
      // Calculate rail direction
      this.grindRailDirection.subVectors(railEnd, railStart).normalize();
      
      // Calculate angle to rotate camera based on rail direction relative to player forward
      // We want to rotate the camera slightly to the side to show the rail better
      if (this.target) {
        const playerForward = new THREE.Vector3(0, 0, 1);
        playerForward.applyQuaternion(this.target.quaternion);
        
        // Cross product to determine which side the rail is approaching from
        const cross = new THREE.Vector3().crossVectors(playerForward, this.grindRailDirection);
        
        // Use the Y component of cross product to determine rotation direction
        // Positive Y = rail is to the right, rotate camera left (positive angle)
        // Negative Y = rail is to the left, rotate camera right (negative angle)
        this.targetGrindAngle = cross.y > 0 ? this.grindAngleMax : -this.grindAngleMax;
      }
    } else {
      this.targetGrindAngle = 0;
    }
  }
  
  /**
   * Update grind camera angle (call in main update loop)
   */
  private updateGrindCamera(dt: number): void {
    // Smoothly transition grind camera angle
    this.grindCameraAngle += (this.targetGrindAngle - this.grindCameraAngle) * damp(this.grindAngleSmoothSpeed, dt);
    
    // Snap to zero when very close (avoid floating point drift)
    if (Math.abs(this.grindCameraAngle) < 0.001 && Math.abs(this.targetGrindAngle) < 0.001) {
      this.grindCameraAngle = 0;
    }
  }
  
}
