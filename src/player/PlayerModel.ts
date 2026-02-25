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
// NOTE: FBX has mislabeled animations! slide_light (8.57s) is actually the sitting pose
const ANIMATION_CLIP_NAMES: Record<AnimationName, string[]> = {
  'idle': ['slide_light_frame_rate_60', 'slide light'],  // Actually the sitting/dozing animation (8.57s)
  'push': ['step forward and push', 'step forward', 'push'],
  'standtosit': ['stand to sit transition', 'stand to sit', 'look back and sit', 'sitting down'],
  'rolling': ['slide_light_frame_rate_60', 'slide light'],  // Same sitting pose while rolling
  'chairhold': ['bar hang idle', 'bar hang', 'female bow'],  // Holding pose
  'trick': ['breakdance 1990', 'breakdance', 'backflip'],
  'jump': ['jump over obstacle', 'jump', 'hop'],
  'roll': ['parkour vault', 'vault', 'roll'],
  'slide': ['Dozing_Elderly_frame_rate_60', 'dozing elderly'],  // Swapped - this was mislabeled
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
    // Log ALL clips with details so we can identify the correct animations
    console.log(`=== ALL ${clips.length} ANIMATIONS IN FBX ===`);
    clips.forEach((clip, i) => {
      console.log(`  [${i}] "${clip.name}" (${clip.duration.toFixed(2)}s, ${clip.tracks.length} tracks)`);
    });
    console.log(`=== END ANIMATION LIST ===`);
    
    // Debug: show what we're looking for
    console.log('=== ANIMATION MAPPINGS WE ARE SEARCHING FOR ===');
    for (const [animName, possibleNames] of Object.entries(ANIMATION_CLIP_NAMES)) {
      console.log(`  ${animName}: looking for ${JSON.stringify(possibleNames)}`);
    }
    console.log('=== END MAPPINGS ===');
    
    // Map each of our animation names to available clips
    for (const [animName, possibleNames] of Object.entries(ANIMATION_CLIP_NAMES)) {
      console.log(`\nSearching for: ${animName}...`);
      const clip = this.findClip(clips, possibleNames, animName);
      
      if (clip) {
        const action = this.mixer!.clipAction(clip);
        this.animations.set(animName as AnimationName, { clip, action });
        console.log(`✓ Mapped animation: ${animName} -> ${clip.name}`);
      } else {
        console.warn(`✗ Animation not found in combined file: ${animName} (looked for: ${possibleNames.join(', ')})`);
      }
    }
    
    // Debug: verify what's actually stored
    console.log('=== FINAL ANIMATION MAP ===');
    this.animations.forEach((anim, name) => {
      console.log(`  ${name} -> "${anim.clip.name}" (${anim.clip.duration.toFixed(2)}s)`);
    });
  }
  
  /**
   * Normalize a string for matching (lowercase, underscores to spaces, remove suffixes)
   */
  private normalizeForMatch(str: string): string {
    return str
      .toLowerCase()
      .replace(/_/g, ' ')           // underscores to spaces
      .replace(/\.fbx$/i, '')       // remove .fbx suffix
      .replace(/\.glb$/i, '')       // remove .glb suffix
      .replace(/frame rate \d+/i, '') // remove "frame rate 60" etc
      .replace(/\s+/g, ' ')         // collapse multiple spaces
      .trim();
  }
  
  /**
   * Find a clip by checking multiple possible names
   * Priority: exact raw match > exact normalized > prefix > contains
   */
  private findClip(clips: THREE.AnimationClip[], possibleNames: string[], debugName?: string): THREE.AnimationClip | null {
    // First pass: exact raw match (case-insensitive, with or without .fbx)
    for (const name of possibleNames) {
      const nameLower = name.toLowerCase();
      for (const clip of clips) {
        const clipLower = clip.name.toLowerCase();
        const clipNoExt = clipLower.replace(/\.fbx$/i, '');
        if (clipLower === nameLower || clipNoExt === nameLower) {
          if (debugName) console.log(`  [${debugName}] EXACT MATCH: "${name}" -> "${clip.name}"`);
          return clip;
        }
      }
    }
    
    // Second pass: exact matches (normalized)
    for (const name of possibleNames) {
      const nameNorm = this.normalizeForMatch(name);
      for (const clip of clips) {
        const clipNorm = this.normalizeForMatch(clip.name);
        if (clipNorm === nameNorm) {
          if (debugName) console.log(`  [${debugName}] NORMALIZED EXACT: "${nameNorm}" -> "${clip.name}"`);
          return clip;
        }
      }
    }
    
    // Third pass: clip name starts with our target name (normalized)
    for (const name of possibleNames) {
      const nameNorm = this.normalizeForMatch(name);
      for (const clip of clips) {
        const clipNorm = this.normalizeForMatch(clip.name);
        if (clipNorm.startsWith(nameNorm)) {
          if (debugName) console.log(`  [${debugName}] PREFIX MATCH: "${nameNorm}" -> "${clip.name}" (clip: "${clipNorm}")`);
          return clip;
        }
      }
    }
    
    // Fourth pass: our target name is contained in clip name (normalized)
    for (const name of possibleNames) {
      const nameNorm = this.normalizeForMatch(name);
      for (const clip of clips) {
        const clipNorm = this.normalizeForMatch(clip.name);
        if (clipNorm.includes(nameNorm)) {
          if (debugName) console.log(`  [${debugName}] CONTAINS MATCH: "${nameNorm}" in "${clip.name}" (clip: "${clipNorm}")`);
          return clip;
        }
      }
    }
    
    if (debugName) console.log(`  [${debugName}] NO MATCH FOUND`);
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
    
    // Debug: log which clip is being played
    console.log(`▶️ Playing "${name}" -> clip: "${anim.clip.name}" (duration: ${anim.clip.duration.toFixed(2)}s, tracks: ${anim.clip.tracks.length})`);
    
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
