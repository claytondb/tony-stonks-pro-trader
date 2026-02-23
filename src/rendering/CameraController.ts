/**
 * Camera Controller
 * Smooth follow camera for player
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
  
  // Current state
  private currentOffset = new THREE.Vector3();
  private currentLookAt = new THREE.Vector3();
  
  // Shake state
  private shakeIntensity = 0;
  private shakeDuration = 0;
  private shakeTimeRemaining = 0;
  private shakeOffset = new THREE.Vector3();
  
  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.currentOffset.copy(this.offset);
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
    
    // Get target's forward direction
    const targetForward = new THREE.Vector3(0, 0, 1);
    targetForward.applyQuaternion(this.target.quaternion);
    
    // Calculate desired camera position (behind and above target)
    const desiredOffset = new THREE.Vector3(
      0,
      this.offset.y,
      this.offset.z
    );
    
    // Rotate offset based on target rotation (only Y axis for now)
    const targetRotationY = new THREE.Euler().setFromQuaternion(this.target.quaternion, 'YXZ').y;
    desiredOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), targetRotationY);
    
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
}
