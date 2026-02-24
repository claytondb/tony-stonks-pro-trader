/**
 * Player Model Loader
 * Loads the combined GLB character model with all animations
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { loadSettings, PlayerSkin } from '../ui/GameStateManager';

export type AnimationName = 
  | 'idle'           // Standing idle (Idle 11) - Options screen, waiting
  | 'push'           // Step forward and push - starting to move, 3x speed
  | 'crouchwalk'     // Cautious crouch walk - moving forward before mounting
  | 'bowpush'        // Female bow charge - pushing chair forward
  | 'lookbacksit'    // Look back and sit - before sitting
  | 'vault'          // Parkour vault 1 - vaulting over chair to sit
  | 'standtosit'     // Stand to sit transition - sitting down, 2x speed
  | 'rolling'        // Dozing elderly - sitting on chair while rolling
  | 'chairhold'      // Bar hang idle - holding chair above head (trick)
  | 'backflip'       // Backflip trick
  | 'breakdance'     // Breakdance 1990 - special trick
  | 'vaultroll'      // Parkour vault with roll - trick while on chair
  | 'slide'          // Slide light - slide under chair trick
  | 'jumpwall'       // Jump over obstacle - kick off wall trick
  | 'falling'        // Falling down - failed trick/bad landing
  | 'crash'          // Charged spell cast - throwing chair in frustration
  | 'victory'        // Victory pose - end of level/goal
  | 'running'        // Running - far from chair
  | 'walking';       // Walking - story portions

interface LoadedAnimation {
  clip: THREE.AnimationClip;
  action: THREE.AnimationAction;
}

// Map animation names to expected clip names in the combined file
// Names from Meshy.ai FBX export - format: Name_frame_rate_60.fbx
const ANIMATION_CLIP_NAMES: Record<AnimationName, string[]> = {
  'idle': ['Idle_11'],                              // Standing idle
  'push': ['Step_Forward_and_Push'],                // Push chair forward (3x speed)
  'crouchwalk': ['Cautious_Crouch_Walk_Forward'],   // Moving before mounting
  'bowpush': ['Female_Bow_Charge_Left_Hand'],       // Pushing chair
  'lookbacksit': ['Look_Back_and_Sit'],             // Before sitting
  'vault': ['Parkour_Vault_1'],                     // Vault over chair
  'standtosit': ['Stand_to_Sit_Transition_M'],      // Sit down (2x speed)
  'rolling': ['Dozing_Elderly'],                    // Sitting on rolling chair
  'chairhold': ['Bar_Hang_Idle'],                   // Chair over head trick
  'backflip': ['Backflip'],                         // Backflip trick
  'breakdance': ['Breakdance_1990'],                // Special dance trick
  'vaultroll': ['Parkour_Vault_with_Roll'],         // Roll trick on chair
  'slide': ['slide_light'],                         // Slide under chair
  'jumpwall': ['Jump_Over_Obstacle_1'],             // Wall kick trick
  'falling': ['falling_down'],                      // Failed trick
  'crash': ['Charged_Spell_Cast_2'],                // Throw chair frustration
  'victory': ['victory'],                           // Win pose
  'running': ['Running'],                           // Running to chair
  'walking': ['Walking'],                           // Story walking
};

// Animation speed multipliers
const ANIMATION_SPEEDS: Partial<Record<AnimationName, number>> = {
  'push': 3.0,        // Speed up 3x
  'standtosit': 2.0,  // Speed up 2x
  'crouchwalk': 1.5,  // Slightly faster
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
    
    // Enable shadows and reduce shininess
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        
        // Make materials less shiny/metallic - more realistic matte look
        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach(mat => {
            if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
              const stdMat = mat as THREE.MeshStandardMaterial;
              stdMat.metalness = 0.0;  // No metallic shine
              stdMat.roughness = 0.8;  // More matte/rough surface
            }
          });
        }
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
    console.log(`=== ANIMATION DEBUG ===`);
    console.log(`Found ${clips.length} animations in file:`);
    clips.forEach((c, i) => console.log(`  ${i}: "${c.name}"`));
    
    // Map each of our animation names to available clips
    for (const [animName, possibleNames] of Object.entries(ANIMATION_CLIP_NAMES)) {
      const clip = this.findClip(clips, possibleNames);
      
      if (clip) {
        const action = this.mixer!.clipAction(clip);
        this.animations.set(animName as AnimationName, { clip, action });
        console.log(`✓ Mapped: ${animName} -> "${clip.name}"`);
      } else {
        console.warn(`✗ NOT FOUND: ${animName} (looked for: ${possibleNames.join(', ')})`);
      }
    }
    console.log(`=== Total mapped: ${this.animations.size} ===`);
  }
  
  /**
   * Find a clip by checking multiple possible names (case-insensitive)
   * Prioritizes exact matches, then "starts with", then "contains"
   */
  private findClip(clips: THREE.AnimationClip[], possibleNames: string[]): THREE.AnimationClip | null {
    // First pass: exact match (case-insensitive)
    for (const name of possibleNames) {
      const nameLower = name.toLowerCase();
      const exactMatch = clips.find(clip => clip.name.toLowerCase() === nameLower);
      if (exactMatch) return exactMatch;
    }
    
    // Second pass: starts with (case-insensitive)
    for (const name of possibleNames) {
      const nameLower = name.toLowerCase();
      const startsWithMatch = clips.find(clip => clip.name.toLowerCase().startsWith(nameLower));
      if (startsWithMatch) return startsWithMatch;
    }
    
    // Third pass: contains (case-insensitive)
    for (const name of possibleNames) {
      const nameLower = name.toLowerCase();
      const containsMatch = clips.find(clip => clip.name.toLowerCase().includes(nameLower));
      if (containsMatch) return containsMatch;
    }
    
    return null;
  }
  
  /**
   * Fallback: Load animations from separate files
   */
  private async loadAnimationsSeparately(): Promise<void> {
    const animationFiles: { name: AnimationName; file: string }[] = [
      { name: 'idle', file: './models/anim-idle.glb' },
      { name: 'push', file: './models/anim-push.glb' },
      { name: 'standtosit', file: './models/anim-standtosit.glb' },
      { name: 'rolling', file: './models/anim-rolling.glb' },
      { name: 'chairhold', file: './models/anim-chairhold.glb' },
      { name: 'breakdance', file: './models/anim-trick.glb' },
      { name: 'backflip', file: './models/anim-jump.glb' },
      { name: 'vaultroll', file: './models/anim-roll.glb' },
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
    let actualName = name;
    
    // Fallback to rolling (most common state) if animation not found
    if (!anim) {
      console.warn(`Animation "${name}" not found, trying fallback...`);
      // Try rolling first (dozing elderly), then idle
      anim = this.animations.get('rolling');
      actualName = 'rolling';
      if (!anim) {
        anim = this.animations.get('idle');
        actualName = 'idle';
      }
      if (!anim) {
        // Just use the first available animation
        const firstKey = this.animations.keys().next().value;
        if (firstKey) {
          anim = this.animations.get(firstKey);
          actualName = firstKey;
          console.warn(`Using first available animation: ${firstKey}`);
        }
      }
      if (!anim) {
        console.error('No animations available at all!');
        return;
      }
    }
    
    // Don't restart same animation
    if (this.currentAnimation === actualName && anim.action.isRunning()) {
      return;
    }
    
    console.log(`Playing animation: ${name}${name !== actualName ? ` (fallback: ${actualName})` : ''}`);
    
    const loop = options?.loop ?? true;
    
    // STOP all other animations first
    this.animations.forEach((animData, animName) => {
      if (animName !== actualName) {
        animData.action.stop();
      }
    });
    
    // Configure the action
    anim.action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    anim.action.clampWhenFinished = !loop;
    
    // Apply speed multiplier if defined
    const speed = ANIMATION_SPEEDS[name] ?? 1.0;
    anim.action.timeScale = speed;
    
    // Reset and play the new animation
    anim.action.reset();
    anim.action.setEffectiveWeight(1);
    anim.action.play();
    
    this.currentAnimation = actualName;
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
