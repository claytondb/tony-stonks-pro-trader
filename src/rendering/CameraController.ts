/**
 * Camera Controller
 * Smooth follow camera for player
 */

import * as THREE from 'three';

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private target: THREE.Object3D | null = null;
  
  // Camera settings
  private offset = new THREE.Vector3(0, 4, -8);
  private lookAhead = 2;
  private smoothSpeed = 4;
  private rotationSmooth = 2;
  
  // Current state
  private currentOffset = new THREE.Vector3();
  private currentLookAt = new THREE.Vector3();
  
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
   */
  shake(_intensity = 1, _duration = 0.3): void {
    // TODO: Implement camera shake
  }
  
  /**
   * Zoom in/out
   */
  setZoom(zoom: number): void {
    this.offset.z = -8 * zoom;
    this.offset.y = 4 * zoom;
  }
}
