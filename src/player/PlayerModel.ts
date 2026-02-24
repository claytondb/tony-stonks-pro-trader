/**
 * Player Model Loader
 * Loads the combined GLB character model with all animations
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type AnimationName = 
  | 'idle'        // Sitting idle (dozing)
  | 'push'        // Step forward and push
  | 'standtosit'  // Transition from standing to sitting
  | 'rolling'     // Chair sit idle while rolling
  | 'chairhold'   // Bar hang - holding chair above head (air trick)
  | 'trick'       // Breakdance trick
  | 'jump'        // Jump over obstacle
  | 'roll'        // Parkour roll
  | 'slide'       // Slide under chair
  | 'crash';      // Angry throw (crash/fail)

interface LoadedAnimation {
  clip: THREE.AnimationClip;
  action: THREE.AnimationAction;
}

// Map animation names to expected clip names in the combined file
// Names from Meshy.ai combined export
const ANIMATION_CLIP_NAMES: Record<AnimationName, string[]> = {
  'idle': ['dozing elderly', 'dozing', 'idle 11', 'idle'],
  'push': ['step forward and push', 'step forward', 'push'],
  'standtosit': ['stand to sit transition male', 'stand to sit', 'look back and sit'],
  'rolling': ['idle 11', 'walking', 'running'],  // Use idle or walking while rolling
  'chairhold': ['bar hang idle', 'bar hang', 'female bow charge'],  // Holding pose
  'trick': ['breakdance 1990', 'breakdance', 'backflip'],
  'jump': ['jump over obstacle 1', 'jump over obstacle', 'parkour vault 1'],
  'roll': ['parkour vault with roll', 'parkour vault', 'vault'],
  'slide': ['slide light', 'slide'],
  'crash': ['falling down', 'falling', 'fall'],
};

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
   * Load the combined player model with all animations
   */
  async load(): Promise<THREE.Group> {
    console.log('Loading combined player model...');
    
    // Try to load combined model first, fall back to separate files
    let gltf;
    let useCombined = false;
    
    try {
      gltf = await this.loader.loadAsync('./models/player-combined.glb');
      useCombined = true;
      console.log('Loaded combined player model');
    } catch (error) {
      console.warn('Combined model not found, falling back to separate files');
      gltf = await this.loader.loadAsync('./models/player.glb');
    }
    
    this.model = gltf.scene;
    
    // Scale and position the model
    this.model.scale.set(0.6, 0.6, 0.6);
    this.model.position.set(0, 0, 0);
    
    // Enable shadows
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    // Create animation mixer
    this.mixer = new THREE.AnimationMixer(this.model);
    
    // Load animations from combined file or separate files
    if (useCombined && gltf.animations.length > 0) {
      this.loadAnimationsFromCombined(gltf.animations);
    } else {
      await this.loadAnimationsSeparately();
    }
    
    console.log(`Player model loaded with ${this.animations.size} animations!`);
    return this.model;
  }
  
  /**
   * Load animations from the combined GLB file
   */
  private loadAnimationsFromCombined(clips: THREE.AnimationClip[]): void {
    console.log(`Found ${clips.length} animations in combined file:`, clips.map(c => c.name));
    
    // Map each of our animation names to available clips
    for (const [animName, possibleNames] of Object.entries(ANIMATION_CLIP_NAMES)) {
      const clip = this.findClip(clips, possibleNames);
      
      if (clip) {
        const action = this.mixer!.clipAction(clip);
        this.animations.set(animName as AnimationName, { clip, action });
        console.log(`Mapped animation: ${animName} -> ${clip.name}`);
      } else {
        console.warn(`Animation not found in combined file: ${animName} (looked for: ${possibleNames.join(', ')})`);
      }
    }
  }
  
  /**
   * Find a clip by checking multiple possible names (case-insensitive, partial match)
   */
  private findClip(clips: THREE.AnimationClip[], possibleNames: string[]): THREE.AnimationClip | null {
    for (const clip of clips) {
      const clipNameLower = clip.name.toLowerCase();
      
      for (const name of possibleNames) {
        const nameLower = name.toLowerCase();
        // Check exact match, partial match, or contains
        if (clipNameLower === nameLower || 
            clipNameLower.includes(nameLower) || 
            nameLower.includes(clipNameLower)) {
          return clip;
        }
      }
    }
    return null;
  }
  
  /**
   * Fallback: Load animations from separate files
   */
  private async loadAnimationsSeparately(): Promise<void> {
    const animationFiles: { name: AnimationName; file: string }[] = [
      { name: 'idle', file: './models/anim-sit-idle.glb' },
      { name: 'push', file: './models/anim-push.glb' },
      { name: 'standtosit', file: './models/anim-standtosit.glb' },
      { name: 'rolling', file: './models/anim-rolling.glb' },
      { name: 'chairhold', file: './models/anim-chairhold.glb' },
      { name: 'trick', file: './models/anim-trick.glb' },
      { name: 'jump', file: './models/anim-jump.glb' },
      { name: 'roll', file: './models/anim-roll.glb' },
      { name: 'slide', file: './models/anim-slide.glb' },
      { name: 'crash', file: './models/anim-crash.glb' },
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
   * Play an animation (with fallback to idle if not found)
   */
  play(name: AnimationName, options?: { loop?: boolean; fadeTime?: number }): void {
    let anim = this.animations.get(name);
    
    // Fallback to idle if animation not found
    if (!anim) {
      console.warn(`Animation not found: ${name}, falling back to idle`);
      if (name !== 'idle') {
        anim = this.animations.get('idle');
      }
      if (!anim) {
        console.warn('No animations available');
        return;
      }
    }
    
    // Don't restart same animation
    if (this.currentAnimation === name && anim.action.isRunning()) {
      return;
    }
    
    const fadeTime = options?.fadeTime ?? 0.3;
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
   * Play animation once and then transition to another
   */
  playOnce(name: AnimationName, thenPlay: AnimationName): void {
    const anim = this.animations.get(name);
    if (!anim) {
      // If animation doesn't exist, just play the fallback
      this.play(thenPlay);
      return;
    }
    
    this.play(name, { loop: false });
    
    // Set up listener for when animation finishes
    const onFinish = () => {
      this.mixer?.removeEventListener('finished', onFinish);
      this.play(thenPlay);
    };
    this.mixer?.addEventListener('finished', onFinish);
  }
  
  // Store the intended local position
  private localPosition = new THREE.Vector3(-0.2, -0.1, 0);
  
  /**
   * Set the local position offset for the model
   */
  setLocalPosition(x: number, y: number, z: number): void {
    this.localPosition.set(x, y, z);
  }
  
  /**
   * Update animation mixer
   */
  update(deltaTime: number): void {
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }
    
    // Reset position and rotation after animation update to prevent root motion drift
    if (this.model) {
      this.model.position.copy(this.localPosition);
      this.model.rotation.set(0, 0, 0);  // Keep facing forward
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
  
  /**
   * Check if a specific animation was loaded
   */
  hasAnimation(name: AnimationName): boolean {
    return this.animations.has(name);
  }
}
