/**
 * Sound Manager
 * Handles all game audio using Howler.js
 */

import { Howl, Howler } from 'howler';

export type SoundName = 
  | 'push'
  | 'jump'
  | 'land'
  | 'grind'
  | 'grindLoop'
  | 'grindEnd'
  | 'trick'
  | 'combo'
  | 'special'
  | 'bail'
  | 'menuSelect'
  | 'menuBack'
  | 'pause';

interface SoundConfig {
  src: string[];
  volume?: number;
  loop?: boolean;
}

export class SoundManager {
  private sounds: Map<SoundName, Howl> = new Map();
  private musicVolume = 0.5;
  private sfxVolume = 0.7;
  private currentMusic: Howl | null = null;
  private isInitialized = false;
  
  constructor() {
    // Will be initialized on first user interaction
  }
  
  /**
   * Initialize sounds - call after user interaction (browser autoplay policy)
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;
    
    console.log('Initializing sound manager...');
    
    // Set global volume
    Howler.volume(0.8);
    
    // Define all sounds
    // Note: Using placeholder paths - replace with actual sound files
    const soundConfigs: { name: SoundName; config: SoundConfig }[] = [
      {
        name: 'push',
        config: {
          src: ['./sounds/push.mp3', './sounds/push.ogg'],
          volume: 0.4
        }
      },
      {
        name: 'jump',
        config: {
          src: ['./sounds/jump.mp3', './sounds/jump.ogg'],
          volume: 0.5
        }
      },
      {
        name: 'land',
        config: {
          src: ['./sounds/land.mp3', './sounds/land.ogg'],
          volume: 0.5
        }
      },
      {
        name: 'grind',
        config: {
          src: ['./sounds/grind-start.mp3', './sounds/grind-start.ogg'],
          volume: 0.5
        }
      },
      {
        name: 'grindLoop',
        config: {
          src: ['./sounds/grind-loop.mp3', './sounds/grind-loop.ogg'],
          volume: 0.3,
          loop: true
        }
      },
      {
        name: 'grindEnd',
        config: {
          src: ['./sounds/grind-end.mp3', './sounds/grind-end.ogg'],
          volume: 0.4
        }
      },
      {
        name: 'trick',
        config: {
          src: ['./sounds/trick.mp3', './sounds/trick.ogg'],
          volume: 0.6
        }
      },
      {
        name: 'combo',
        config: {
          src: ['./sounds/combo.mp3', './sounds/combo.ogg'],
          volume: 0.7
        }
      },
      {
        name: 'special',
        config: {
          src: ['./sounds/special.mp3', './sounds/special.ogg'],
          volume: 0.8
        }
      },
      {
        name: 'bail',
        config: {
          src: ['./sounds/bail.mp3', './sounds/bail.ogg'],
          volume: 0.6
        }
      },
      {
        name: 'menuSelect',
        config: {
          src: ['./sounds/menu-select.mp3', './sounds/menu-select.ogg'],
          volume: 0.5
        }
      },
      {
        name: 'menuBack',
        config: {
          src: ['./sounds/menu-back.mp3', './sounds/menu-back.ogg'],
          volume: 0.4
        }
      },
      {
        name: 'pause',
        config: {
          src: ['./sounds/pause.mp3', './sounds/pause.ogg'],
          volume: 0.5
        }
      }
    ];
    
    // Load sounds (silently fail if files don't exist)
    for (const { name, config } of soundConfigs) {
      try {
        const sound = new Howl({
          ...config,
          onloaderror: () => {
            console.warn(`Sound not found: ${name}`);
          }
        });
        this.sounds.set(name, sound);
      } catch (error) {
        console.warn(`Failed to load sound: ${name}`);
      }
    }
    
    this.isInitialized = true;
    console.log('Sound manager initialized');
  }
  
  /**
   * Play a sound effect
   */
  play(name: SoundName): number | undefined {
    const sound = this.sounds.get(name);
    if (sound) {
      return sound.play();
    }
    return undefined;
  }
  
  /**
   * Stop a sound
   */
  stop(name: SoundName): void {
    const sound = this.sounds.get(name);
    if (sound) {
      sound.stop();
    }
  }
  
  /**
   * Check if a sound is playing
   */
  isPlaying(name: SoundName): boolean {
    const sound = this.sounds.get(name);
    return sound ? sound.playing() : false;
  }
  
  /**
   * Set SFX volume (0-1)
   */
  setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
    // Update all sound volumes
    for (const sound of this.sounds.values()) {
      // Scale by sfx volume
      const baseVol = (sound as any)._volume || 0.5;
      sound.volume(baseVol * this.sfxVolume);
    }
  }
  
  /**
   * Set music volume (0-1)
   */
  setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.currentMusic) {
      this.currentMusic.volume(this.musicVolume);
    }
  }
  
  /**
   * Play background music
   */
  playMusic(src: string): void {
    // Stop current music
    if (this.currentMusic) {
      this.currentMusic.fade(this.musicVolume, 0, 500);
      setTimeout(() => this.currentMusic?.stop(), 500);
    }
    
    // Start new music
    this.currentMusic = new Howl({
      src: [src],
      volume: 0,
      loop: true
    });
    
    this.currentMusic.play();
    this.currentMusic.fade(0, this.musicVolume, 1000);
  }
  
  /**
   * Stop background music
   */
  stopMusic(): void {
    if (this.currentMusic) {
      this.currentMusic.fade(this.musicVolume, 0, 500);
      setTimeout(() => {
        this.currentMusic?.stop();
        this.currentMusic = null;
      }, 500);
    }
  }
  
  /**
   * Pause all audio
   */
  pauseAll(): void {
    Howler.mute(true);
  }
  
  /**
   * Resume all audio
   */
  resumeAll(): void {
    Howler.mute(false);
  }
  
  /**
   * Mute/unmute
   */
  setMuted(muted: boolean): void {
    Howler.mute(muted);
  }
}

// Singleton instance
export const soundManager = new SoundManager();
