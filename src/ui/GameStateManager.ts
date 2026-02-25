/**
 * Game State Manager
 * Handles game states: title, menu, playing, paused, results
 */

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

export type GameState = 
  | 'loading'
  | 'title'
  | 'menu'
  | 'level_select'
  | 'options'
  | 'playing'
  | 'paused'
  | 'results'
  | 'story'
  | 'editor';

// Player skin options
export type PlayerSkin = 'tony_stonks' | 'stonks_guy';

export interface GameSettings {
  playerSkin: PlayerSkin;
  musicVolume: number;
  sfxVolume: number;
}

// Load settings from localStorage
export function loadSettings(): GameSettings {
  try {
    const saved = localStorage.getItem('tony-stonks-settings');
    if (saved) {
      return { ...getDefaultSettings(), ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
  return getDefaultSettings();
}

// Save settings to localStorage
export function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem('tony-stonks-settings', JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
}

function getDefaultSettings(): GameSettings {
  return {
    playerSkin: 'tony_stonks',
    musicVolume: 0.7,
    sfxVolume: 1.0
  };
}

/**
 * Mini preview renderer for player models
 */
class PlayerPreview {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private model: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private animationId: number | null = null;
  private fbxLoader: FBXLoader;
  
  constructor(container: HTMLElement) {
    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    
    // Create camera
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 1, 3);
    this.camera.lookAt(0, 0.8, 0);
    
    // Create renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(200, 250);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
    
    // Add lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);
    
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(2, 3, 2);
    this.scene.add(directional);
    
    // Add ground plane
    const groundGeo = new THREE.CircleGeometry(1, 32);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x333344 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    this.scene.add(ground);
    
    this.fbxLoader = new FBXLoader();
    
    // Start render loop
    this.animate();
  }
  
  async loadSkin(skin: PlayerSkin): Promise<void> {
    // Remove old model
    if (this.model) {
      this.scene.remove(this.model);
      this.model = null;
      this.mixer = null;
    }
    
    const skinFile = skin === 'stonks_guy' 
      ? './models/player-stonks.fbx' 
      : './models/player-combined.fbx';
    
    let scale = 0.006;
    
    // Try FBX first
    try {
      this.model = await this.fbxLoader.loadAsync(skinFile);
      console.log(`Preview loaded FBX: ${skinFile}`);
    } catch (fbxError) {
      console.warn(`Preview FBX not found: ${skinFile}, trying fallback...`);
      
      // Try default FBX
      try {
        this.model = await this.fbxLoader.loadAsync('./models/player-combined.fbx');
        console.log('Preview loaded default FBX');
      } catch (defaultFbxError) {
        // Fall back to GLB
        try {
          const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
          const gltfLoader = new GLTFLoader();
          const gltf = await gltfLoader.loadAsync('./models/player.glb');
          this.model = gltf.scene;
          scale = 0.6;
          console.log('Preview loaded GLB fallback');
        } catch (glbError) {
          console.error('Preview: Failed to load any model', glbError);
          return;
        }
      }
    }
    
    if (!this.model) return;
    
    // Larger scale for preview visibility
    const previewScale = scale * 1.5;
    this.model.scale.set(previewScale, previewScale, previewScale);
    this.model.position.set(0, -0.5, 0);  // Lower to fit in view
    this.model.rotation.y = Math.PI; // Face camera
    
    this.scene.add(this.model);
    
    // Reduce shininess - make materials more matte
    this.model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach(mat => {
            if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
              const stdMat = mat as THREE.MeshStandardMaterial;
              stdMat.metalness = 0.0;
              stdMat.roughness = 0.8;
            }
          });
        }
      }
    });
    
    // Play standing idle animation if available
    if (this.model.animations && this.model.animations.length > 0) {
      console.log('Preview animations:', this.model.animations.map(c => c.name));
      
      this.mixer = new THREE.AnimationMixer(this.model);
      
      // Find "idle 11" specifically - the standing idle animation
      let idleClip = this.model.animations.find(clip => 
        clip.name.toLowerCase() === 'idle 11'
      );
      
      // Fallback to any clip with "idle" that's not dozing/sitting
      if (!idleClip) {
        idleClip = this.model.animations.find(clip => {
          const name = clip.name.toLowerCase();
          return name.includes('idle') && 
                 !name.includes('dozing') && 
                 !name.includes('sit') &&
                 !name.includes('bar hang');
        });
      }
      
      // Last resort - just use first animation
      if (!idleClip) {
        idleClip = this.model.animations[0];
      }
      
      if (idleClip) {
        console.log('Preview playing animation:', idleClip.name);
        const action = this.mixer.clipAction(idleClip);
        action.play();
      }
    }
  }
  
  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    
    // Rotate model slowly
    if (this.model) {
      this.model.rotation.y += 0.01;
    }
    
    // Update animations
    if (this.mixer) {
      this.mixer.update(0.016);
    }
    
    this.renderer.render(this.scene, this.camera);
  };
  
  dispose(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    this.renderer.dispose();
  }
}

export interface GameStateCallbacks {
  onStateChange?: (from: GameState, to: GameState) => void;
  onStartGame?: (levelId: string) => void;
  onPause?: () => void;
  onResume?: () => void;
  onRetry?: () => void;
  onQuit?: () => void;
  onOpenEditor?: () => void;
  onSkinChange?: (skin: PlayerSkin) => void;
}

interface LevelResult {
  levelId: string;
  score: number;
  time: number;
  goalsCompleted: number;
  totalGoals: number;
  rank: 'S' | 'A' | 'B' | 'C' | 'D';
}

export class GameStateManager {
  private state: GameState = 'loading';
  private callbacks: GameStateCallbacks;
  private uiContainer: HTMLElement;
  
  private currentLevelId: string = '';
  private lastResult: LevelResult | null = null;
  private titleGlitchTimeout: number | null = null;
  private playerPreview: PlayerPreview | null = null;
  
  constructor(container: HTMLElement, callbacks: GameStateCallbacks = {}) {
    this.uiContainer = container;
    this.callbacks = callbacks;
    
    this.initKeyboardControls();
  }
  
  private initKeyboardControls(): void {
    window.addEventListener('keydown', (e) => {
      switch (this.state) {
        case 'title':
          if (e.code === 'Space' || e.code === 'Enter') {
            this.setState('menu');
          }
          break;
          
        case 'playing':
          if (e.code === 'Escape') {
            this.setState('paused');
            this.callbacks.onPause?.();
          }
          break;
          
        case 'paused':
          if (e.code === 'Escape') {
            this.setState('playing');
            this.callbacks.onResume?.();
          }
          break;
      }
    });
  }
  
  /**
   * Set game state
   */
  setState(newState: GameState): void {
    const oldState = this.state;
    this.state = newState;
    
    this.callbacks.onStateChange?.(oldState, newState);
    this.renderUI();
  }
  
  /**
   * Get current state
   */
  getState(): GameState {
    return this.state;
  }
  
  /**
   * Start playing a level
   */
  startLevel(levelId: string): void {
    this.currentLevelId = levelId;
    this.setState('playing');
    this.callbacks.onStartGame?.(levelId);
  }
  
  /**
   * End level with results
   */
  endLevel(score: number, time: number, goalsCompleted: number, totalGoals: number): void {
    // Calculate rank based on goals and score
    const goalPercent = goalsCompleted / totalGoals;
    let rank: LevelResult['rank'];
    
    if (goalPercent >= 1.0 && score >= 50000) rank = 'S';
    else if (goalPercent >= 0.75) rank = 'A';
    else if (goalPercent >= 0.5) rank = 'B';
    else if (goalPercent >= 0.25) rank = 'C';
    else rank = 'D';
    
    this.lastResult = {
      levelId: this.currentLevelId,
      score,
      time,
      goalsCompleted,
      totalGoals,
      rank
    };
    
    this.setState('results');
  }
  
  /**
   * Render UI based on current state
   */
  private renderUI(): void {
    this.uiContainer.innerHTML = '';
    
    switch (this.state) {
      case 'loading':
        this.renderLoading();
        break;
      case 'title':
        this.renderTitle();
        break;
      case 'menu':
        this.renderMenu();
        break;
      case 'level_select':
        this.renderLevelSelect();
        break;
      case 'options':
        this.renderOptions();
        break;
      case 'playing':
        // HUD is handled separately
        break;
      case 'paused':
        this.renderPauseMenu();
        break;
      case 'results':
        this.renderResults();
        break;
      case 'story':
        // Story cutscenes handled separately
        break;
    }
  }
  
  private renderLoading(): void {
    this.uiContainer.innerHTML = `
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        color: #00FF88;
        font-family: 'Kanit', sans-serif;
      ">
        <div style="font-size: 24px; margin-bottom: 20px;">LOADING...</div>
        <div style="
          width: 200px;
          height: 4px;
          background: #333;
          border-radius: 2px;
        ">
          <div style="
            width: 50%;
            height: 100%;
            background: #00FF88;
            border-radius: 2px;
            animation: loading 1s infinite;
          "></div>
        </div>
      </div>
    `;
  }
  
  private renderTitle(): void {
    // Clean up any existing glitch timeout
    if (this.titleGlitchTimeout) {
      clearTimeout(this.titleGlitchTimeout);
      this.titleGlitchTimeout = null;
    }
    
    this.uiContainer.innerHTML = `
      <div id="title-screen" style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        pointer-events: auto;
      ">
        <!-- Background image -->
        <div style="
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: url('./ui/titlebg.png') center center / cover no-repeat;
          background-color: #1a1a2e;
        "></div>
        
        <!-- Content container -->
        <div style="
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding-top: 5vh;
        ">
          <!-- Tony character image with float animation -->
          <img 
            id="tony-float"
            src="./ui/tony1.png" 
            alt="Tony"
            style="
              max-width: 80%;
              max-height: 45vh;
              object-fit: contain;
              animation: gentleFloat 6s ease-in-out infinite;
              filter: drop-shadow(0 10px 30px rgba(0,0,0,0.5));
            "
          />
          
          <!-- Logotype with glitch effect - larger and overlapping tony image -->
          <div id="logo-container" style="
            position: relative;
            margin-top: -8vh;
            z-index: 10;
          ">
            <img 
              id="logotype"
              src="./ui/logotype.png" 
              alt="Tony Stonks Pro Trader"
              style="
                max-width: 90vw;
                max-height: 30vh;
                object-fit: contain;
                filter: drop-shadow(0 4px 20px rgba(0,255,136,0.3));
              "
            />
            <!-- Glitch layers (hidden until glitch triggers) -->
            <img 
              id="logotype-glitch-r"
              src="./ui/logotype.png" 
              alt=""
              style="
                position: absolute;
                top: 0;
                left: 0;
                max-width: 90vw;
                max-height: 30vh;
                object-fit: contain;
                opacity: 0;
                pointer-events: none;
              "
            />
            <img 
              id="logotype-glitch-b"
              src="./ui/logotype.png" 
              alt=""
              style="
                position: absolute;
                top: 0;
                left: 0;
                max-width: 90vw;
                max-height: 30vh;
                object-fit: contain;
                opacity: 0;
                pointer-events: none;
              "
            />
          </div>
          
          <!-- Press to start - black text with white outline -->
          <div style="
            margin-top: 4vh;
            font-size: clamp(16px, 3.5vw, 24px);
            font-weight: 600;
            color: #000000;
            animation: blink 1.2s infinite;
            font-family: 'Kanit', sans-serif;
            letter-spacing: 3px;
            text-shadow: 
              -2px -2px 0 #fff,
              2px -2px 0 #fff,
              -2px 2px 0 #fff,
              2px 2px 0 #fff,
              0 -2px 0 #fff,
              0 2px 0 #fff,
              -2px 0 0 #fff,
              2px 0 0 #fff;
          ">PRESS SPACE TO START</div>
          
          <!-- Copyright -->
          <div style="
            position: absolute;
            bottom: 20px;
            color: rgba(255,255,255,0.6);
            font-size: 12px;
            font-family: 'Kanit', sans-serif;
            text-shadow: 0 1px 2px rgba(0,0,0,0.5);
          ">© 2026 Diamond Hands Studios</div>
        </div>
      </div>
      
      <style>
        @keyframes blink {
          0%, 45% { opacity: 1; }
          50%, 100% { opacity: 0.3; }
        }
        
        @keyframes gentleFloat {
          0%, 100% { 
            transform: translateY(0) rotate(0deg); 
          }
          25% { 
            transform: translateY(-8px) rotate(0.5deg); 
          }
          50% { 
            transform: translateY(-4px) rotate(-0.3deg); 
          }
          75% { 
            transform: translateY(-12px) rotate(0.3deg); 
          }
        }
        
        @keyframes glitchShake {
          0% { transform: translate(0); }
          20% { transform: translate(-3px, 2px); }
          40% { transform: translate(2px, -2px); }
          60% { transform: translate(-2px, 1px); }
          80% { transform: translate(3px, -1px); }
          100% { transform: translate(0); }
        }
      </style>
    `;
    
    // Set up random glitch effect for the logotype
    this.setupLogoGlitch();
  }
  
  private setupLogoGlitch(): void {
    const triggerGlitch = () => {
      const logo = document.getElementById('logotype');
      const glitchR = document.getElementById('logotype-glitch-r');
      const glitchB = document.getElementById('logotype-glitch-b');
      const container = document.getElementById('logo-container');
      
      if (!logo || !glitchR || !glitchB || !container) return;
      
      // Random glitch intensity
      const intensity = Math.random() * 8 + 4;
      
      // Apply glitch
      container.style.animation = 'glitchShake 0.1s linear';
      
      // Red channel offset
      glitchR.style.opacity = '0.8';
      glitchR.style.transform = `translate(${intensity}px, ${-intensity/2}px)`;
      glitchR.style.filter = 'hue-rotate(-60deg) saturate(2)';
      glitchR.style.mixBlendMode = 'screen';
      
      // Blue channel offset
      glitchB.style.opacity = '0.8';
      glitchB.style.transform = `translate(${-intensity}px, ${intensity/2}px)`;
      glitchB.style.filter = 'hue-rotate(60deg) saturate(2)';
      glitchB.style.mixBlendMode = 'screen';
      
      // Add scan lines effect to main logo
      logo.style.filter = `drop-shadow(0 4px 20px rgba(0,255,136,0.3)) brightness(1.2) contrast(1.1)`;
      
      // Clear glitch after short duration (50-150ms)
      const glitchDuration = Math.random() * 100 + 50;
      setTimeout(() => {
        container.style.animation = '';
        glitchR.style.opacity = '0';
        glitchB.style.opacity = '0';
        logo.style.filter = 'drop-shadow(0 4px 20px rgba(0,255,136,0.3))';
      }, glitchDuration);
    };
    
    // Trigger glitch randomly every 2-5 seconds
    const scheduleNextGlitch = () => {
      const delay = Math.random() * 3000 + 2000; // 2-5 seconds
      this.titleGlitchTimeout = window.setTimeout(() => {
        if (this.state === 'title') {
          triggerGlitch();
          scheduleNextGlitch();
        }
      }, delay);
    };
    
    // Start the glitch cycle
    scheduleNextGlitch();
    
    // Trigger one glitch shortly after load for immediate feedback
    setTimeout(triggerGlitch, 500);
  }
  
  private renderMenu(): void {
    const menuItems = [
      { label: 'CAREER MODE', action: 'career' },
      { label: 'FREE SKATE', action: 'level_select' },
      { label: 'LEVEL EDITOR', action: 'editor' },
      { label: 'OPTIONS', action: 'options' },
      { label: 'CREDITS', action: 'credits' }
    ];
    
    this.uiContainer.innerHTML = `
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
        pointer-events: auto;
      ">
        <div style="
          font-size: 48px;
          font-weight: bold;
          color: #00FF88;
          margin-bottom: 60px;
          font-family: 'Kanit', sans-serif;
        ">MAIN MENU</div>
        
        <div id="menu-items" style="
          display: flex;
          flex-direction: column;
          gap: 15px;
        ">
          ${menuItems.map((item, i) => `
            <button class="menu-btn" data-action="${item.action}" style="
              width: 280px;
              padding: 15px 30px;
              font-size: 20px;
              font-weight: bold;
              font-family: 'Kanit', sans-serif;
              color: #fff;
              background: ${i === 0 ? '#00AA66' : '#333'};
              border: 3px solid ${i === 0 ? '#00FF88' : '#555'};
              cursor: pointer;
              transition: all 0.15s;
            ">
              ${item.label}
            </button>
          `).join('')}
        </div>
      </div>
    `;
    
    // Add click handlers
    this.uiContainer.querySelectorAll('.menu-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        if (action === 'level_select' || action === 'career') {
          this.setState('level_select');
        } else if (action === 'editor') {
          this.setState('editor');
          this.callbacks.onOpenEditor?.();
        } else if (action === 'options') {
          this.setState('options');
        }
      });
      
      btn.addEventListener('mouseenter', () => {
        (btn as HTMLElement).style.background = '#00AA66';
        (btn as HTMLElement).style.borderColor = '#00FF88';
      });
      
      btn.addEventListener('mouseleave', () => {
        (btn as HTMLElement).style.background = '#333';
        (btn as HTMLElement).style.borderColor = '#555';
      });
    });
  }
  
  private renderLevelSelect(): void {
    // Import level data
    const levels = [
      { id: 'ch1_office', name: 'Cubicle Chaos', chapter: 1, unlocked: true },
      { id: 'ch1_garage', name: 'Parking Lot Panic', chapter: 1, unlocked: true },
      { id: 'ch2_downtown', name: 'Street Smart', chapter: 2, unlocked: true }
    ];
    
    this.uiContainer.innerHTML = `
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        align-items: center;
        padding-top: 60px;
        background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
        pointer-events: auto;
      ">
        <div style="
          font-size: 36px;
          font-weight: bold;
          color: #00FF88;
          margin-bottom: 40px;
          font-family: 'Kanit', sans-serif;
        ">SELECT LEVEL</div>
        
        <div style="
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          max-width: 900px;
          width: 90%;
        ">
          ${levels.map(level => `
            <button class="level-btn" data-id="${level.id}" style="
              padding: 25px;
              background: ${level.unlocked ? '#2a2a4e' : '#1a1a2e'};
              border: 3px solid ${level.unlocked ? '#4a4a7e' : '#333'};
              border-radius: 8px;
              cursor: ${level.unlocked ? 'pointer' : 'not-allowed'};
              text-align: left;
              transition: all 0.15s;
              opacity: ${level.unlocked ? 1 : 0.5};
            ">
              <div style="
                font-size: 12px;
                color: #888;
                margin-bottom: 5px;
              ">CHAPTER ${level.chapter}</div>
              <div style="
                font-size: 18px;
                font-weight: bold;
                color: #fff;
              ">${level.name}</div>
              ${!level.unlocked ? '<div style="color: #ff6666; font-size: 12px; margin-top: 10px;">🔒 LOCKED</div>' : ''}
            </button>
          `).join('')}
        </div>
        
        <button id="back-btn" style="
          margin-top: 40px;
          padding: 12px 40px;
          font-size: 16px;
          background: #333;
          border: 2px solid #555;
          color: #fff;
          cursor: pointer;
        ">BACK</button>
      </div>
    `;
    
    // Add click handlers
    this.uiContainer.querySelectorAll('.level-btn').forEach(btn => {
      const levelId = btn.getAttribute('data-id');
      btn.addEventListener('click', () => {
        if (levelId) {
          this.startLevel(levelId);
        }
      });
      
      btn.addEventListener('mouseenter', () => {
        (btn as HTMLElement).style.borderColor = '#00FF88';
        (btn as HTMLElement).style.background = '#3a3a5e';
      });
      
      btn.addEventListener('mouseleave', () => {
        (btn as HTMLElement).style.borderColor = '#4a4a7e';
        (btn as HTMLElement).style.background = '#2a2a4e';
      });
    });
    
    this.uiContainer.querySelector('#back-btn')?.addEventListener('click', () => {
      this.setState('menu');
    });
  }
  
  private renderOptions(): void {
    // Clean up any existing preview
    if (this.playerPreview) {
      this.playerPreview.dispose();
      this.playerPreview = null;
    }
    
    const settings = loadSettings();
    
    const playerSkins: { id: PlayerSkin; name: string }[] = [
      { id: 'tony_stonks', name: 'Tony Stonks' },
      { id: 'stonks_guy', name: 'Stonks Guy' }
    ];
    
    this.uiContainer.innerHTML = `
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
        pointer-events: auto;
      ">
        <div style="
          font-size: 48px;
          font-weight: bold;
          color: #00FF88;
          margin-bottom: 40px;
          font-family: 'Kanit', sans-serif;
        ">OPTIONS</div>
        
        <div style="
          display: flex;
          gap: 40px;
          align-items: flex-start;
        ">
          <!-- Player Preview -->
          <div style="
            background: rgba(0,0,0,0.4);
            padding: 15px;
            border-radius: 10px;
            border: 2px solid #333;
          ">
            <div style="
              font-size: 14px;
              color: #888;
              margin-bottom: 10px;
              font-family: 'Kanit', sans-serif;
              text-align: center;
            ">PREVIEW</div>
            <div id="player-preview" style="
              width: 200px;
              height: 250px;
              border-radius: 8px;
              overflow: hidden;
            "></div>
          </div>
          
          <!-- Settings Panel -->
          <div style="
            background: rgba(0,0,0,0.3);
            padding: 30px 50px;
            border-radius: 10px;
            border: 2px solid #333;
          ">
            <!-- Player Selection -->
            <div style="margin-bottom: 30px;">
              <div style="
                font-size: 16px;
                color: #888;
                margin-bottom: 10px;
                font-family: 'Kanit', sans-serif;
              ">PLAYER CHARACTER</div>
              <div id="player-options" style="display: flex; gap: 15px;">
                ${playerSkins.map(skin => `
                  <button class="skin-btn" data-skin="${skin.id}" style="
                    width: 160px;
                    padding: 15px 20px;
                    font-size: 16px;
                    font-weight: bold;
                    font-family: 'Kanit', sans-serif;
                    color: #fff;
                    background: ${settings.playerSkin === skin.id ? '#00AA66' : '#333'};
                    border: 3px solid ${settings.playerSkin === skin.id ? '#00FF88' : '#555'};
                    cursor: pointer;
                    transition: all 0.15s;
                  ">
                    ${skin.name}
                  </button>
                `).join('')}
              </div>
            </div>
            
            <!-- Music Volume -->
            <div style="margin-bottom: 20px;">
              <div style="
                font-size: 16px;
                color: #888;
                margin-bottom: 10px;
                font-family: 'Kanit', sans-serif;
              ">MUSIC VOLUME</div>
              <input type="range" id="music-volume" min="0" max="100" value="${settings.musicVolume * 100}" style="
                width: 100%;
                height: 8px;
                cursor: pointer;
              ">
            </div>
            
            <!-- SFX Volume -->
            <div style="margin-bottom: 30px;">
              <div style="
                font-size: 16px;
                color: #888;
                margin-bottom: 10px;
                font-family: 'Kanit', sans-serif;
              ">SFX VOLUME</div>
              <input type="range" id="sfx-volume" min="0" max="100" value="${settings.sfxVolume * 100}" style="
                width: 100%;
                height: 8px;
                cursor: pointer;
              ">
            </div>
          </div>
        </div>
        
        <button id="back-btn" style="
          margin-top: 30px;
          width: 200px;
          padding: 15px 30px;
          font-size: 18px;
          font-weight: bold;
          font-family: 'Kanit', sans-serif;
          color: #fff;
          background: #333;
          border: 3px solid #555;
          cursor: pointer;
          transition: all 0.15s;
        ">BACK</button>
      </div>
    `;
    
    // Initialize preview
    const previewContainer = this.uiContainer.querySelector('#player-preview') as HTMLElement;
    if (previewContainer) {
      this.playerPreview = new PlayerPreview(previewContainer);
      this.playerPreview.loadSkin(settings.playerSkin);
    }
    
    // Skin button handlers
    this.uiContainer.querySelectorAll('.skin-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const skinId = btn.getAttribute('data-skin') as PlayerSkin;
        const newSettings = loadSettings();
        newSettings.playerSkin = skinId;
        saveSettings(newSettings);
        
        // Update button styles
        this.uiContainer.querySelectorAll('.skin-btn').forEach(b => {
          const isSelected = b.getAttribute('data-skin') === skinId;
          (b as HTMLElement).style.background = isSelected ? '#00AA66' : '#333';
          (b as HTMLElement).style.borderColor = isSelected ? '#00FF88' : '#555';
        });
        
        // Update preview
        this.playerPreview?.loadSkin(skinId);
        
        // Notify game of skin change for hot-swap
        this.callbacks.onSkinChange?.(skinId);
      });
      
      btn.addEventListener('mouseenter', () => {
        (btn as HTMLElement).style.background = '#00AA66';
        (btn as HTMLElement).style.borderColor = '#00FF88';
      });
      
      btn.addEventListener('mouseleave', () => {
        const skinId = btn.getAttribute('data-skin') as PlayerSkin;
        const currentSettings = loadSettings();
        const isSelected = currentSettings.playerSkin === skinId;
        (btn as HTMLElement).style.background = isSelected ? '#00AA66' : '#333';
        (btn as HTMLElement).style.borderColor = isSelected ? '#00FF88' : '#555';
      });
    });
    
    // Volume handlers
    const musicSlider = this.uiContainer.querySelector('#music-volume') as HTMLInputElement;
    const sfxSlider = this.uiContainer.querySelector('#sfx-volume') as HTMLInputElement;
    
    musicSlider?.addEventListener('input', () => {
      const newSettings = loadSettings();
      newSettings.musicVolume = parseInt(musicSlider.value) / 100;
      saveSettings(newSettings);
    });
    
    sfxSlider?.addEventListener('input', () => {
      const newSettings = loadSettings();
      newSettings.sfxVolume = parseInt(sfxSlider.value) / 100;
      saveSettings(newSettings);
    });
    
    // Back button
    this.uiContainer.querySelector('#back-btn')?.addEventListener('click', () => {
      // Clean up preview
      if (this.playerPreview) {
        this.playerPreview.dispose();
        this.playerPreview = null;
      }
      this.setState('menu');
    });
  }
  
  private renderPauseMenu(): void {
    this.uiContainer.innerHTML = `
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background: rgba(0, 0, 0, 0.8);
        pointer-events: auto;
      ">
        <div style="
          font-size: 48px;
          font-weight: bold;
          color: #FFD700;
          margin-bottom: 50px;
          font-family: 'Kanit', sans-serif;
        ">PAUSED</div>
        
        <div style="display: flex; flex-direction: column; gap: 15px;">
          <button class="pause-btn" data-action="resume" style="
            width: 200px;
            padding: 15px;
            font-size: 18px;
            background: #00AA66;
            border: 3px solid #00FF88;
            color: #fff;
            cursor: pointer;
          ">RESUME</button>
          
          <button class="pause-btn" data-action="retry" style="
            width: 200px;
            padding: 15px;
            font-size: 18px;
            background: #333;
            border: 3px solid #555;
            color: #fff;
            cursor: pointer;
          ">RETRY</button>
          
          <button class="pause-btn" data-action="quit" style="
            width: 200px;
            padding: 15px;
            font-size: 18px;
            background: #333;
            border: 3px solid #555;
            color: #fff;
            cursor: pointer;
          ">QUIT</button>
        </div>
      </div>
    `;
    
    this.uiContainer.querySelectorAll('.pause-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        switch (action) {
          case 'resume':
            this.setState('playing');
            this.callbacks.onResume?.();
            break;
          case 'retry':
            this.callbacks.onRetry?.();
            this.setState('playing');
            break;
          case 'quit':
            this.callbacks.onQuit?.();
            this.setState('menu');
            break;
        }
      });
    });
  }
  
  private renderResults(): void {
    if (!this.lastResult) return;
    
    const result = this.lastResult;
    const rankColors: Record<string, string> = {
      'S': '#FFD700',
      'A': '#00FF88',
      'B': '#4488FF',
      'C': '#FF8844',
      'D': '#FF4444'
    };
    
    this.uiContainer.innerHTML = `
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
        pointer-events: auto;
      ">
        <div style="
          font-size: 36px;
          color: #fff;
          margin-bottom: 20px;
        ">LEVEL COMPLETE!</div>
        
        <div style="
          font-size: 120px;
          font-weight: bold;
          color: ${rankColors[result.rank]};
          text-shadow: 4px 4px 0px rgba(0,0,0,0.5);
          margin-bottom: 30px;
        ">${result.rank}</div>
        
        <div style="
          background: rgba(0,0,0,0.3);
          padding: 30px 50px;
          border-radius: 10px;
          margin-bottom: 40px;
        ">
          <div style="
            display: flex;
            justify-content: space-between;
            font-size: 20px;
            color: #fff;
            margin-bottom: 15px;
          ">
            <span>SCORE:</span>
            <span style="color: #00FF88;">${result.score.toLocaleString()}</span>
          </div>
          
          <div style="
            display: flex;
            justify-content: space-between;
            font-size: 20px;
            color: #fff;
            margin-bottom: 15px;
          ">
            <span>TIME:</span>
            <span>${this.formatTime(result.time)}</span>
          </div>
          
          <div style="
            display: flex;
            justify-content: space-between;
            font-size: 20px;
            color: #fff;
          ">
            <span>GOALS:</span>
            <span>${result.goalsCompleted} / ${result.totalGoals}</span>
          </div>
        </div>
        
        <div style="display: flex; gap: 20px;">
          <button class="result-btn" data-action="retry" style="
            padding: 15px 40px;
            font-size: 18px;
            background: #00AA66;
            border: 3px solid #00FF88;
            color: #fff;
            cursor: pointer;
          ">RETRY</button>
          
          <button class="result-btn" data-action="next" style="
            padding: 15px 40px;
            font-size: 18px;
            background: #4466AA;
            border: 3px solid #6688CC;
            color: #fff;
            cursor: pointer;
          ">NEXT LEVEL</button>
          
          <button class="result-btn" data-action="menu" style="
            padding: 15px 40px;
            font-size: 18px;
            background: #333;
            border: 3px solid #555;
            color: #fff;
            cursor: pointer;
          ">MENU</button>
        </div>
      </div>
    `;
    
    this.uiContainer.querySelectorAll('.result-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        switch (action) {
          case 'retry':
            this.startLevel(this.currentLevelId);
            break;
          case 'next':
            // TODO: Get next level
            this.setState('level_select');
            break;
          case 'menu':
            this.setState('menu');
            break;
        }
      });
    });
  }
  
  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
