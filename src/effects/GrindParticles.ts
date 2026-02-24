/**
 * Grind Particles
 * Spark effects when grinding on rails
 */

import * as THREE from 'three';

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class GrindParticles {
  private particles: Particle[] = [];
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private points: THREE.Points;
  private scene: THREE.Scene;
  
  private readonly MAX_PARTICLES = 100;
  private readonly PARTICLE_LIFETIME = 0.5;
  private readonly SPAWN_RATE = 60; // particles per second
  private spawnAccumulator = 0;
  
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    
    // Create geometry with positions
    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.MAX_PARTICLES * 3);
    const colors = new Float32Array(this.MAX_PARTICLES * 3);
    
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    // Spark material
    this.material = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    this.points = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.points);
  }
  
  /**
   * Spawn particles at a position
   */
  spawn(position: THREE.Vector3, direction: THREE.Vector3, count: number = 3): void {
    for (let i = 0; i < count && this.particles.length < this.MAX_PARTICLES; i++) {
      // Random velocity - sparks fly up and out
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 3 + 1,
        (Math.random() - 0.5) * 4
      );
      
      // Add some of the grind direction
      velocity.add(direction.clone().multiplyScalar(Math.random() * 2));
      
      this.particles.push({
        position: position.clone(),
        velocity,
        life: this.PARTICLE_LIFETIME,
        maxLife: this.PARTICLE_LIFETIME
      });
    }
  }
  
  /**
   * Update particles - call each frame when grinding
   */
  update(dt: number, isGrinding: boolean, grindPosition?: THREE.Vector3, grindDirection?: THREE.Vector3): void {
    // Spawn new particles if grinding
    if (isGrinding && grindPosition && grindDirection) {
      this.spawnAccumulator += dt * this.SPAWN_RATE;
      while (this.spawnAccumulator >= 1 && this.particles.length < this.MAX_PARTICLES) {
        this.spawnAccumulator -= 1;
        this.spawn(grindPosition, grindDirection, 1);
      }
    } else {
      this.spawnAccumulator = 0;
    }
    
    // Update existing particles
    const gravity = new THREE.Vector3(0, -15, 0);
    
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      
      // Update physics
      p.velocity.add(gravity.clone().multiplyScalar(dt));
      p.position.add(p.velocity.clone().multiplyScalar(dt));
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
        
        // Color - orange/yellow sparks that fade
        colors[i * 3] = 1.0;  // R
        colors[i * 3 + 1] = 0.5 + lifeRatio * 0.5;  // G (more yellow when bright)
        colors[i * 3 + 2] = lifeRatio * 0.3;  // B
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
