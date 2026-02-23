/**
 * Player Model Loader
 * Loads the GLB character model and handles animations
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type AnimationName = 'idle' | 'push' | 'jump' | 'fall' | 'slide' | 'trick' | 'victory';

interface LoadedAnimation {
  clip: THREE.AnimationClip;
  action: THREE.AnimationAction;
}

export class PlayerModel {
  private model: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private animations: Map<AnimationName, LoadedAnimation> = new Map();
  private currentAnimation: AnimationName | null = null;
  private loader: GLTFLoader;
  
  constructor() {
    this.loader = new GLTFLoader();
  }
  
  /**
   * Load the player model and all animations
   */
  async load(): Promise<THREE.Group> {
    console.log('Loading player model...');
    
    // Load base model
    const gltf = await this.loader.loadAsync('./models/player.glb');
    this.model = gltf.scene;
    
    // Scale and position the model
    this.model.scale.set(0.5, 0.5, 0.5); // Adjust scale as needed
    this.model.position.set(0, 0, 0);
    this.model.rotation.y = Math.PI; // Face forward
    
    // Enable shadows
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    // Create animation mixer
    this.mixer = new THREE.AnimationMixer(this.model);
    
    // Load animations
    await this.loadAnimations();
    
    // Start with idle animation
    this.play('idle');
    
    console.log('Player model loaded!');
    return this.model;
  }
  
  /**
   * Load all animation clips
   */
  private async loadAnimations(): Promise<void> {
    const animationFiles: { name: AnimationName; file: string }[] = [
      { name: 'idle', file: './models/anim-sit-idle.glb' },
      { name: 'push', file: './models/anim-push.glb' },
      { name: 'jump', file: './models/anim-jump.glb' },
      { name: 'fall', file: './models/anim-fall.glb' },
      { name: 'slide', file: './models/anim-slide.glb' },
      { name: 'trick', file: './models/anim-trick.glb' },
      { name: 'victory', file: './models/anim-victory.glb' },
    ];
    
    for (const anim of animationFiles) {
      try {
        const gltf = await this.loader.loadAsync(anim.file);
        if (gltf.animations.length > 0) {
          const clip = gltf.animations[0];
          clip.name = anim.name;
          
          const action = this.mixer!.clipAction(clip);
          this.animations.set(anim.name, { clip, action });
          
          console.log(`Loaded animation: ${anim.name}`);
        }
      } catch (error) {
        console.warn(`Failed to load animation ${anim.name}:`, error);
      }
    }
  }
  
  /**
   * Play an animation
   */
  play(name: AnimationName, options?: { loop?: boolean; fadeTime?: number }): void {
    const anim = this.animations.get(name);
    if (!anim) {
      console.warn(`Animation not found: ${name}`);
      return;
    }
    
    const fadeTime = options?.fadeTime ?? 0.2;
    const loop = options?.loop ?? true;
    
    // Configure the action
    anim.action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    anim.action.clampWhenFinished = !loop;
    
    // Fade out current animation
    if (this.currentAnimation && this.currentAnimation !== name) {
      const current = this.animations.get(this.currentAnimation);
      if (current) {
        current.action.fadeOut(fadeTime);
      }
    }
    
    // Fade in new animation
    anim.action.reset();
    anim.action.fadeIn(fadeTime);
    anim.action.play();
    
    this.currentAnimation = name;
  }
  
  /**
   * Update animation mixer
   */
  update(deltaTime: number): void {
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }
  }
  
  /**
   * Get the model group
   */
  getModel(): THREE.Group | null {
    return this.model;
  }
  
  /**
   * Get current animation name
   */
  getCurrentAnimation(): AnimationName | null {
    return this.currentAnimation;
  }
  
  /**
   * Check if an animation is playing
   */
  isPlaying(name: AnimationName): boolean {
    return this.currentAnimation === name;
  }
}
