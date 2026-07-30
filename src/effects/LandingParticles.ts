/**
 * Landing Particles
 * Dust/debris effects when landing from air
 */

import * as THREE from 'three';

/**
 * Soft puff sprite. The old implementation used an untextured PointsMaterial, which draws hard
 * opaque squares — at 0.3 world units those read as brown confetti, not as dust.
 */
let DUST_TEX: THREE.CanvasTexture | null = null;
function dustTexture(): THREE.CanvasTexture {
  if (DUST_TEX) return DUST_TEX;
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(S, S);
  const px = img.data;
  const c = (S - 1) * 0.5;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const r = Math.min(1, Math.sqrt((x - c) * (x - c) + (y - c) * (y - c)) / c);
      // Gentle shoulder, long tail: a puff has no edge.
      const a = Math.pow(Math.max(0, 1 - r), 2.2) * 0.9;
      const i = (y * S + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 255;
      px[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  DUST_TEX = tex;
  return tex;
}

const DUST_VERT = /* glsl */`
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp( aSize * 340.0 / max( -mv.z, 0.15 ), 2.0, 190.0 );
}`;

const DUST_FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float a = texture2D( uMap, gl_PointCoord ).a * vAlpha;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( vColor, a );
}`;

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
  private material: THREE.ShaderMaterial;
  private points: THREE.Points;
  private scene: THREE.Scene;

  private readonly MAX_PARTICLES = 90;
  private readonly PARTICLE_LIFETIME = 0.85;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.MAX_PARTICLES * 3), 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(this.MAX_PARTICLES * 3), 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(this.MAX_PARTICLES), 1));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(this.MAX_PARTICLES), 1));
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: dustTexture() } },
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
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
    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.geometry.attributes.aColor as THREE.BufferAttribute;
    const siz = this.geometry.attributes.aSize as THREE.BufferAttribute;
    const alp = this.geometry.attributes.aAlpha as THREE.BufferAttribute;
    const positions = pos.array as Float32Array;
    const colors = col.array as Float32Array;
    const sizes = siz.array as Float32Array;
    const alphas = alp.array as Float32Array;

    const n = this.particles.length;
    for (let i = 0; i < n; i++) {
      const p = this.particles[i];
      const lifeRatio = p.life / p.maxLife;

      positions[i * 3] = p.position.x;
      positions[i * 3 + 1] = p.position.y;
      positions[i * 3 + 2] = p.position.z;

      // Warm carpet dust, lit rather than silhouetted: a puff kicked up under a bright
      // fluorescent grid is a LIGHT value against the floor, not a dark one.
      colors[i * 3] = 0.72;
      colors[i * 3 + 1] = 0.63;
      colors[i * 3 + 2] = 0.50;

      // Puffs expand as they dissipate — the single strongest cue that it is dust.
      sizes[i] = p.scale * (0.55 + (1 - lifeRatio) * 1.35);
      // Fast fade in, slow fade out.
      const rise = Math.min(1, (1 - lifeRatio) * 7);
      alphas[i] = rise * lifeRatio * lifeRatio * 0.55;
    }

    pos.needsUpdate = true;
    col.needsUpdate = true;
    siz.needsUpdate = true;
    alp.needsUpdate = true;
    this.geometry.setDrawRange(0, n);
    this.points.visible = n > 0;
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
