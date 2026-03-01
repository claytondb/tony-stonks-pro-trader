/**
 * Landing Particles
 * Dust/debris effects when landing from air
 */

import * as THREE from 'three';

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  scale: number;
}

export class LandingParticles {
  private particles: Particle[] = [];
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private points: THREE.Points;
  private scene: THREE.Scene;
  
  private readonly MAX_PARTICLES = 50;
  private readonly PARTICLE_LIFETIME = 0.6;
  
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    
    // Create geometry with positions
    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.MAX_PARTICLES * 3);
    const colors = new Float32Array(this.MAX_PARTICLES * 3);
    const sizes = new Float32Array(this.MAX_PARTICLES);
    
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    // Dust material
    this.material = new THREE.PointsMaterial({
      size: 0.3,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.NormalBlending,
      depthWrite: false,
      sizeAttenuation: true
    });
    
    this.points = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.points);
  }
  
  /**
   * Spawn landing dust particles
   * @param position - Landing position
   * @param intensity - 0-1 based on air time (bigger landings = more dust)
   */
  spawn(position: THREE.Vector3, intensity: number = 0.5): void {
    const particleCount = Math.floor(8 + intensity * 15); // 8-23 particles
    
    for (let i = 0; i < particleCount && this.particles.length < this.MAX_PARTICLES; i++) {
      // Random horizontal spread
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3 * intensity;
      
      const velocity = new THREE.Vector3(
        Math.cos(angle) * speed,
        0.5 + Math.random() * 2 * intensity,  // Slight upward
        Math.sin(angle) * speed
      );
      
      // Spawn slightly above ground
      const spawnPos = position.clone();
      spawnPos.y = 0.1 + Math.random() * 0.2;
      
      // Random offset from center
      spawnPos.x += (Math.random() - 0.5) * 0.5;
      spawnPos.z += (Math.random() - 0.5) * 0.5;
      
      this.particles.push({
        position: spawnPos,
        velocity,
        life: this.PARTICLE_LIFETIME * (0.5 + Math.random() * 0.5),
        maxLife: this.PARTICLE_LIFETIME,
        scale: 0.15 + Math.random() * 0.25 * intensity
      });
    }
  }
  
  /**
   * Update particles each frame
   */
  update(dt: number): void {
    // Update existing particles
    const drag = 3; // Air resistance
    const gravity = new THREE.Vector3(0, -2, 0);
    
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      
      // Apply drag
      p.velocity.multiplyScalar(1 - drag * dt);
      
      // Apply gravity
      p.velocity.add(gravity.clone().multiplyScalar(dt));
      
      // Update position
      p.position.add(p.velocity.clone().multiplyScalar(dt));
      
      // Keep particles above ground
      if (p.position.y < 0.05) {
        p.position.y = 0.05;
        p.velocity.y = 0;
        p.velocity.x *= 0.5; // Friction
        p.velocity.z *= 0.5;
      }
      
      // Update life
      p.life -= dt;
      
      // Remove dead particles
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
    
    // Update geometry
    this.updateGeometry();
  }
  
  private updateGeometry(): void {
    const positions = this.geometry.attributes.position.array as Float32Array;
    const colors = this.geometry.attributes.color.array as Float32Array;
    
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      if (i < this.particles.length) {
        const p = this.particles[i];
        const lifeRatio = p.life / p.maxLife;
        
        // Position
        positions[i * 3] = p.position.x;
        positions[i * 3 + 1] = p.position.y;
        positions[i * 3 + 2] = p.position.z;
        
        // Color - brownish dust that fades out
        const fade = lifeRatio * lifeRatio; // Quadratic fade
        colors[i * 3] = 0.6 * fade;     // R - brownish
        colors[i * 3 + 1] = 0.5 * fade; // G
        colors[i * 3 + 2] = 0.4 * fade; // B
      } else {
        // Hide unused particles
        positions[i * 3] = 0;
        positions[i * 3 + 1] = -1000;
        positions[i * 3 + 2] = 0;
      }
    }
    
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
  
  /**
   * Clean up
   */
  dispose(): void {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}
