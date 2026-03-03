/**
 * Camera Controller
 * Smooth follow camera for player with mouse orbit
 */

import * as THREE from 'three';

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private target: THREE.Object3D | null = null;
  
  // Camera settings
  private offset = new THREE.Vector3(0, 3, -5);  // Closer and lower
  private lookAhead = 1.5;
  private smoothSpeed = 5;
  private rotationSmooth = 3;
  
  // Dynamic FOV settings
  private baseFOV = 75;      // Default FOV when stationary
  private maxFOV = 90;       // FOV at max speed
  private currentFOV = 75;
  private targetFOV = 75;
  private fovSmoothSpeed = 4;  // How fast FOV transitions
  
  // Trick zoom settings (zoom out during air time for better visibility)
  private trickZoomAmount = 0.15;   // How much to zoom out (0-1, where 1 = full offset change)
  private targetZoomMultiplier = 1; // Current target zoom (1 = normal, >1 = zoomed out)
  private currentZoomMultiplier = 1;
  private zoomSmoothSpeed = 6;      // How fast zoom transitions
  
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
  private orbitSensitivity = 0.005;
  private orbitReturnSpeed = 2;  // Speed to return to default view
  private maxOrbitY = Math.PI / 3;  // Limit vertical rotation
  private minOrbitY = -Math.PI / 6;
  
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
    this.offset.z = -8 * zoom;
    this.offset.y = 4 * zoom;
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
  
}
