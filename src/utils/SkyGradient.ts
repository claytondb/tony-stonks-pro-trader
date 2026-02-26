/**
 * Sky Gradient
 * Creates a gradient sky dome using a shader
 */

import * as THREE from 'three';

export class SkyGradient {
  private mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  
  constructor() {
    // Create a large sphere for the sky dome (smaller to stay within camera frustum)
    const geometry = new THREE.SphereGeometry(400, 32, 16);
    
    // Shader for vertical gradient
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x1e90ff) },
        bottomColor: { value: new THREE.Color(0x87ceeb) },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPosition;
        void main() {
          // Normalize Y based on position relative to mesh center
          vec3 normalizedPos = normalize(vWorldPosition);
          float h = normalizedPos.y * 0.5 + 0.5; // Map -1..1 to 0..1
          gl_FragColor = vec4(mix(bottomColor, topColor, h), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false  // Don't apply fog to sky
    });
    
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false; // Always render
    this.mesh.renderOrder = -1000; // Render first (behind everything)
  }
  
  getMesh(): THREE.Mesh {
    return this.mesh;
  }
  
  setColors(topColor: string, bottomColor: string): void {
    this.material.uniforms.topColor.value.set(topColor);
    this.material.uniforms.bottomColor.value.set(bottomColor);
  }
  
  setTopColor(color: string): void {
    this.material.uniforms.topColor.value.set(color);
  }
  
  setBottomColor(color: string): void {
    this.material.uniforms.bottomColor.value.set(color);
  }
  
  /**
   * Follow camera position (keep sky dome centered on camera)
   */
  update(cameraPosition: THREE.Vector3): void {
    this.mesh.position.copy(cameraPosition);
  }
  
  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

// Sky gradient presets
export const SKY_PRESETS: Record<string, { top: string; bottom: string; name: string; icon: string }> = {
  'clear_day': { top: '#1e90ff', bottom: '#87ceeb', name: 'Clear Day', icon: '☀️' },
  'night': { top: '#0a0a1a', bottom: '#1a1a2e', name: 'Night', icon: '🌙' },
  'sunset': { top: '#2c3e50', bottom: '#ff7b00', name: 'Sunset', icon: '🌅' },
  'pink_dusk': { top: '#4a3f55', bottom: '#ff9a9e', name: 'Pink Dusk', icon: '🌸' },
  'overcast': { top: '#4a5568', bottom: '#718096', name: 'Overcast', icon: '🌧️' },
  'midnight': { top: '#000011', bottom: '#0f0c29', name: 'Midnight', icon: '🌌' },
  'cloudy': { top: '#94a3b8', bottom: '#cbd5e1', name: 'Cloudy', icon: '☁️' },
  'dawn': { top: '#1e3a5f', bottom: '#ff9966', name: 'Dawn', icon: '🌄' },
  'stormy': { top: '#1a1a2e', bottom: '#4a4a6a', name: 'Stormy', icon: '⛈️' },
  'tropical': { top: '#00b4db', bottom: '#0083b0', name: 'Tropical', icon: '🏝️' },
};
