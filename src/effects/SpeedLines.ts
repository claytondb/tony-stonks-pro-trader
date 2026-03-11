/**
 * Speed Lines Effect
 * Radial blur-like speed streaks that appear at screen edges when moving fast
 * Adds a sense of velocity and urgency to fast movement
 */

import * as THREE from 'three';

interface SpeedLine {
  position: THREE.Vector3;   // Position in camera space
  velocity: THREE.Vector3;   // Movement direction
  length: number;            // Line length (scales with speed)
  life: number;             // Remaining lifetime
  maxLife: number;          // For fade calculation
  angle: number;            // Angle from center (radians)
}

export class SpeedLines {
  private lines: SpeedLine[] = [];
  private geometry: THREE.BufferGeometry;
  private material: THREE.LineBasicMaterial;
  private lineSegments: THREE.LineSegments;
  private camera: THREE.Camera;
  
  // Settings
  private readonly MAX_LINES = 40;
  private readonly SPEED_THRESHOLD = 10;     // Start showing at this speed
  private readonly FULL_EFFECT_SPEED = 18;   // Full intensity at this speed
  private readonly LINE_LIFETIME = 0.15;      // Seconds
  private readonly SPAWN_RATE = 80;           // Lines per second at full speed
  private readonly MIN_RADIUS = 0.7;          // Screen-space distance from center (0-1)
  private readonly MAX_RADIUS = 0.95;
  
  private spawnAccumulator = 0;
  private currentIntensity = 0;  // 0-1 based on speed
  
  constructor(camera: THREE.Camera) {
    this.camera = camera;
    
    // Create geometry for line segments
    // Each line needs 2 vertices (start and end)
    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.MAX_LINES * 6); // 2 vertices * 3 components * MAX_LINES
    const colors = new Float32Array(this.MAX_LINES * 6);
    
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    // White lines that glow
    this.material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,  // Always render on top
    });
    
    this.lineSegments = new THREE.LineSegments(this.geometry, this.material);
    this.lineSegments.frustumCulled = false;  // Always render
    this.lineSegments.renderOrder = 999;       // Render last
  }
  
  /**
   * Get the mesh to add to scene
   */
  getMesh(): THREE.LineSegments {
    return this.lineSegments;
  }
  
  /**
   * Spawn a new speed line at a random edge position
   */
  private spawn(): void {
    if (this.lines.length >= this.MAX_LINES) return;
    
    // Random angle around the screen edge
    const angle = Math.random() * Math.PI * 2;
    
    // Random radius (weighted toward outer edge)
    const radiusT = Math.pow(Math.random(), 0.5);  // Bias toward outer
    const radius = this.MIN_RADIUS + radiusT * (this.MAX_RADIUS - this.MIN_RADIUS);
    
    // Convert to camera-local position (in front of camera, at edge of view)
    const distance = 2;  // Distance from camera
    const fovFactor = 1.2;  // Adjust for FOV
    
    const x = Math.cos(angle) * radius * fovFactor;
    const y = Math.sin(angle) * radius * fovFactor;
    
    // Velocity points inward (toward center) with slight randomization
    const inwardSpeed = 8 + Math.random() * 4;
    const velocity = new THREE.Vector3(
      -Math.cos(angle) * inwardSpeed,
      -Math.sin(angle) * inwardSpeed,
      inwardSpeed * 0.5  // Slight forward movement
    );
    
    // Line length based on intensity
    const baseLength = 0.15 + this.currentIntensity * 0.25;
    const length = baseLength * (0.8 + Math.random() * 0.4);
    
    this.lines.push({
      position: new THREE.Vector3(x, y, distance),
      velocity,
      length,
      life: this.LINE_LIFETIME * (0.8 + Math.random() * 0.4),
      maxLife: this.LINE_LIFETIME,
      angle
    });
  }
  
  /**
   * Update the speed lines based on player velocity
   * @param dt - Delta time in seconds
   * @param speed - Current player horizontal speed
   * @param isGrounded - Whether player is on the ground
   */
  update(dt: number, speed: number, isGrounded: boolean): void {
    // Calculate effect intensity based on speed
    const speedRange = this.FULL_EFFECT_SPEED - this.SPEED_THRESHOLD;
    const normalizedSpeed = (speed - this.SPEED_THRESHOLD) / speedRange;
    const targetIntensity = Math.max(0, Math.min(1, normalizedSpeed));
    
    // Smooth intensity transitions
    const intensitySpeed = targetIntensity > this.currentIntensity ? 8 : 4;
    this.currentIntensity += (targetIntensity - this.currentIntensity) * intensitySpeed * dt;
    
    // Spawn new lines if above threshold
    if (this.currentIntensity > 0.05) {
      // Slightly more lines when airborne (more dramatic)
      const airBonus = isGrounded ? 1 : 1.3;
      const spawnRate = this.SPAWN_RATE * this.currentIntensity * airBonus;
      
      this.spawnAccumulator += dt * spawnRate;
      while (this.spawnAccumulator >= 1 && this.lines.length < this.MAX_LINES) {
        this.spawnAccumulator -= 1;
        this.spawn();
      }
    }
    
    // Update existing lines
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const line = this.lines[i];
      
      // Move line
      line.position.add(line.velocity.clone().multiplyScalar(dt));
      
      // Decay
      line.life -= dt;
      
      // Remove dead lines
      if (line.life <= 0) {
        this.lines.splice(i, 1);
      }
    }
    
    // Update geometry
    this.updateGeometry();
  }
  
  /**
   * Update the buffer geometry with current line data
   */
  private updateGeometry(): void {
    const positions = this.geometry.attributes.position.array as Float32Array;
    const colors = this.geometry.attributes.color.array as Float32Array;
    
    // Position the line segments in camera space
    const cameraWorldPos = new THREE.Vector3();
    const cameraWorldQuat = new THREE.Quaternion();
    this.camera.getWorldPosition(cameraWorldPos);
    this.camera.getWorldQuaternion(cameraWorldQuat);
    
    for (let i = 0; i < this.MAX_LINES; i++) {
      const baseIdx = i * 6;  // 2 vertices * 3 components
      
      if (i < this.lines.length) {
        const line = this.lines[i];
        const lifeRatio = line.life / line.maxLife;
        
        // Calculate world-space positions
        // Start point (closer to center/camera)
        const startLocal = line.position.clone();
        
        // End point (extending outward based on line length and angle)
        const endLocal = startLocal.clone();
        endLocal.x += Math.cos(line.angle) * line.length;
        endLocal.y += Math.sin(line.angle) * line.length;
        
        // Transform to world space
        startLocal.applyQuaternion(cameraWorldQuat);
        startLocal.add(cameraWorldPos);
        
        endLocal.applyQuaternion(cameraWorldQuat);
        endLocal.add(cameraWorldPos);
        
        // Set positions
        positions[baseIdx] = startLocal.x;
        positions[baseIdx + 1] = startLocal.y;
        positions[baseIdx + 2] = startLocal.z;
        
        positions[baseIdx + 3] = endLocal.x;
        positions[baseIdx + 4] = endLocal.y;
        positions[baseIdx + 5] = endLocal.z;
        
        // Color - white/cyan with fade
        const fade = lifeRatio * lifeRatio;  // Quadratic fade
        const brightness = fade * this.currentIntensity;
        
        // Start of line (brighter, more white)
        colors[baseIdx] = 0.9 * brightness;      // R
        colors[baseIdx + 1] = 0.95 * brightness; // G
        colors[baseIdx + 2] = 1.0 * brightness;  // B (slight cyan tint)
        
        // End of line (dimmer, fades out)
        colors[baseIdx + 3] = 0.7 * brightness;
        colors[baseIdx + 4] = 0.8 * brightness;
        colors[baseIdx + 5] = 1.0 * brightness;
      } else {
        // Hide unused line segments by moving off-screen
        positions[baseIdx] = 0;
        positions[baseIdx + 1] = -1000;
        positions[baseIdx + 2] = 0;
        positions[baseIdx + 3] = 0;
        positions[baseIdx + 4] = -1000;
        positions[baseIdx + 5] = 0;
        
        // Zero color
        colors[baseIdx] = 0;
        colors[baseIdx + 1] = 0;
        colors[baseIdx + 2] = 0;
        colors[baseIdx + 3] = 0;
        colors[baseIdx + 4] = 0;
        colors[baseIdx + 5] = 0;
      }
    }
    
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
  
  /**
   * Get current intensity (for UI/debugging)
   */
  getIntensity(): number {
    return this.currentIntensity;
  }
  
  /**
   * Manually set intensity (for speed boost effects)
   */
  setIntensity(intensity: number): void {
    this.currentIntensity = Math.max(0, Math.min(1, intensity));
  }
  
  /**
   * Clean up resources
   */
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
