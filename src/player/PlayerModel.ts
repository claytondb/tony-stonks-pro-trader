/**
 * Player Model Loader
 * Loads the combined GLB character model with all animations
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { loadSettings, PlayerSkin } from '../ui/GameStateManager';

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
  'idle': ['dozing elderly', 'dozing'],
  'push': ['step forward and push', 'step forward'],
  'standtosit': ['stand to sit transition male', 'stand to sit', 'look back and sit'],
  'rolling': ['dozing elderly', 'dozing', 'sit idle'],  // Sitting on chair while rolling
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
  private gltfLoader: GLTFLoader;
  private fbxLoader: FBXLoader;
  private currentSkin: PlayerSkin = 'tony_stonks';
  
  constructor() {
    this.gltfLoader = new GLTFLoader();
    this.fbxLoader = new FBXLoader();
  }
  
  /**
   * Get the model filename for a skin
   */
  private getSkinFileName(skin: PlayerSkin): string {
    switch (skin) {
      case 'stonks_guy':
        return './models/player-stonks.fbx';
      case 'tony_stonks':
      default:
        return './models/player-combined.fbx';
    }
  }
  
  /**
   * Get current skin
   */
  getCurrentSkin(): PlayerSkin {
    return this.currentSkin;
  }
  
  /**
   * Change skin (hot-swap)
   */
  async changeSkin(skin: PlayerSkin): Promise<void> {
    if (skin === this.currentSkin && this.model) return;
    
    console.log(`Hot-swapping skin to: ${skin}`);
    
    // Store parent and local transform
    const parent = this.model?.parent;
    const localPos = this.localPosition.clone();
    
    // Remove old model from parent and dispose
    if (this.model && parent) {
      parent.remove(this.model);
    }
    
    // Clear state completely
    this.model = null;
    this.animations.clear();
    this.mixer = null;
    this.currentAnimation = null;
    
    // Set new skin BEFORE loading
    this.currentSkin = skin;
    
    // Load new model
    const newModel = await this.loadSkin(skin);
    
    // Re-attach to parent
    if (parent && newModel) {
      parent.add(newModel);
    }
    
    // Restore position
    this.setLocalPosition(localPos.x, localPos.y, localPos.z);
    
    // Start idle animation
    this.play('idle');
    
    console.log(`Skin changed to: ${skin}, model attached: ${!!parent}`);
  }
  
  /**
   * Load a specific skin (used by changeSkin and load)
   */
  private async loadSkin(skin: PlayerSkin): Promise<THREE.Group> {
    const skinFile = this.getSkinFileName(skin);
    console.log(`Loading skin file: ${skinFile}`);
    
    let model: THREE.Group | null = null;
    let animations: THREE.AnimationClip[] = [];
    let useFBX = false;
    
    // Try to load the skin's FBX file
    try {
      model = await this.fbxLoader.loadAsync(skinFile);
      animations = model.animations || [];
      useFBX = true;
      console.log(`Successfully loaded FBX: ${skinFile} with ${animations.length} animations`);
    } catch (fbxError) {
      console.warn(`FBX not found: ${skinFile}, trying GLB fallbacks...`);
      
      // Try default combined FBX
      try {
        model = await this.fbxLoader.loadAsync('./models/player-combined.fbx');
        animations = model.animations || [];
        useFBX = true;
        console.log('Loaded default player-combined.fbx');
      } catch (defaultFbxError) {
        console.warn('player-combined.fbx not found, trying GLB...');
        
        // Fall back to GLB
        try {
          const gltf = await this.gltfLoader.loadAsync('./models/player.glb');
          model = gltf.scene;
          animations = gltf.animations || [];
          console.log('Loaded player.glb (GLB fallback)');
        } catch (glbError) {
          console.error('Failed to load any player model!', glbError);
          throw glbError;
        }
      }
    }
    
    this.model = model;
    
    // Scale and position - FBX needs smaller scale (centimeters vs meters)
    const scale = useFBX ? 0.006 : 0.6;
    this.model.scale.set(scale, scale, scale);
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
    
    // Load animations - use combined if available, otherwise load separately
    if (animations.length > 0) {
      console.log(`Loading ${animations.length} animations from combined file`);
      this.loadAnimationsFromCombined(animations);
    }
    
    // If we don't have enough animations, load from separate files
    if (this.animations.size < 3) {
      console.log('Not enough animations from combined file, loading separately...');
      await this.loadAnimationsSeparately();
    }
    
    console.log(`Skin loaded with ${this.animations.size} animations`);
    return this.model;
  }
  
  /**
   * Load the combined player model with all animations
   */
  async load(): Promise<THREE.Group> {
    // Use settings for initial load
    const settings = loadSettings();
    this.currentSkin = settings.playerSkin;
    
    console.log(`Initial load - skin from settings: ${this.currentSkin}`);
    
    return this.loadSkin(this.currentSkin);
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
   * Find a clip by checking multiple possible names (case-insensitive)
   * Tries exact match first, then prefix match
   */
  private findClip(clips: THREE.AnimationClip[], possibleNames: string[]): THREE.AnimationClip | null {
    // First pass: exact matches only
    for (const name of possibleNames) {
      const nameLower = name.toLowerCase();
      for (const clip of clips) {
        const clipNameLower = clip.name.toLowerCase();
        if (clipNameLower === nameLower) {
          return clip;
        }
      }
    }
    
    // Second pass: clip name starts with our target name
    for (const name of possibleNames) {
      const nameLower = name.toLowerCase();
      for (const clip of clips) {
        const clipNameLower = clip.name.toLowerCase();
        if (clipNameLower.startsWith(nameLower)) {
          return clip;
        }
      }
    }
    
    // Third pass: our target name is contained in clip name
    for (const name of possibleNames) {
      const nameLower = name.toLowerCase();
      for (const clip of clips) {
        const clipNameLower = clip.name.toLowerCase();
        if (clipNameLower.includes(nameLower)) {
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
        const gltf = await this.gltfLoader.loadAsync(anim.file);
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
