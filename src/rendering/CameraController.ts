/**
 * Camera Controller
 * Smooth follow camera for player with mouse orbit
 */

import * as THREE from 'three';

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private target: THREE.Object3D | null = null;
  
  // Camera settings — THPS-style: close, low, snappy
  private offset = new THREE.Vector3(0, 2.2, -4.2);  // Closer and lower like THPS
  private lookAhead = 1.0;
  private smoothSpeed = 18;       // Was 5 — much snappier position tracking
  private rotationSmooth = 14;    // Was 3 — snappy rotation follow
  
  // Dynamic FOV settings
  private baseFOV = 80;      // Slightly wider than before for speed feel
  private maxFOV = 95;       // FOV at max speed
  private currentFOV = 80;
  private targetFOV = 80;
  private fovSmoothSpeed = 6;  // Faster FOV transitions
  
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
  private orbitSensitivity = 0.004;
  private orbitReturnSpeed = 4;  // Faster snap back to default view
  private maxOrbitY = Math.PI / 4;  // Tighter vertical limit like THPS
  private minOrbitY = -Math.PI / 8;
  
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
    }
  }
  
  update(dt: number): void {
    if (!this.target) return;
    
    // Smoothly return orbit to default when not dragging
    if (!this.isDragging) {
      this.targetOrbitX *= (1 - this.orbitReturnSpeed * dt);
      this.targetOrbitY *= (1 - this.orbitReturnSpeed * dt);
    }
    
    // Smooth orbit angle transitions
    this.orbitAngleX += (this.targetOrbitX - this.orbitAngleX) * 5 * dt;
    this.orbitAngleY += (this.targetOrbitY - this.orbitAngleY) * 5 * dt;
    
    // Get target's forward direction
    const targetForward = new THREE.Vector3(0, 0, 1);
    targetForward.applyQuaternion(this.target.quaternion);
    
    // Smooth zoom multiplier transition
    this.currentZoomMultiplier += (this.targetZoomMultiplier - this.currentZoomMultiplier) * this.zoomSmoothSpeed * dt;
    
    // Calculate desired camera position (behind and above target)
    // Apply zoom multiplier (>1 = further away for trick visibility)
    const desiredOffset = new THREE.Vector3(
      0,
      this.offset.y * this.currentZoomMultiplier,
      this.offset.z * this.currentZoomMultiplier
    );
    
    // Rotate offset based on target rotation (only Y axis for now)
    const targetRotationY = new THREE.Euler().setFromQuaternion(this.target.quaternion, 'YXZ').y;
    desiredOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), targetRotationY);
    
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
    this.currentOffset.lerp(desiredOffset, this.rotationSmooth * dt);
    
    // Calculate camera position
    const desiredPosition = new THREE.Vector3()
      .copy(this.target.position)
      .add(this.currentOffset);
    
    // Smooth camera movement
    this.camera.position.lerp(desiredPosition, this.smoothSpeed * dt);
    
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
    
    // Look at target with slight offset up and look-ahead
    const lookAheadOffset = targetForward.clone().multiplyScalar(this.lookAhead);
    const desiredLookAt = new THREE.Vector3()
      .copy(this.target.position)
      .add(new THREE.Vector3(0, 1, 0))
      .add(lookAheadOffset);
    
    // Smooth look-at transition
    this.currentLookAt.lerp(desiredLookAt, this.smoothSpeed * dt);
    
    this.camera.lookAt(this.currentLookAt);
    
    // Update impact zoom decay
    this.updateImpactZoom(dt);
    
    // Smooth FOV transition (with impact zoom pulse subtracted)
    const effectiveFOV = this.targetFOV - this.impactZoomCurrent;
    this.currentFOV += (effectiveFOV - this.currentFOV) * this.fovSmoothSpeed * dt;
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
    this.offset.z = -4.2 * zoom;
    this.offset.y = 2.2 * zoom;
  }
  
  /**
   * Update FOV based on player speed
   * Creates a sense of velocity - wider FOV when moving fast
   * @param speed - Current player speed (0 to maxSpeed)
   * @param maxSpeed - Speed at which FOV reaches maximum (e.g., 18)
   */
  updateFOVFromSpeed(speed: number, maxSpeed: number = 18): void {
    // Calculate speed ratio (0 to 1)
    const speedRatio = Math.min(speed / maxSpeed, 1);
    
    // Use easing for smoother feel - starts slow, accelerates
    const easedRatio = speedRatio * speedRatio;
    
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
      this.impactZoomCurrent -= this.impactZoomCurrent * this.impactZoomDecay * dt;
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
    this.grindCameraAngle += (this.targetGrindAngle - this.grindCameraAngle) * this.grindAngleSmoothSpeed * dt;
    
    // Snap to zero when very close (avoid floating point drift)
    if (Math.abs(this.grindCameraAngle) < 0.001 && Math.abs(this.targetGrindAngle) < 0.001) {
      this.grindCameraAngle = 0;
    }
  }
  
}
