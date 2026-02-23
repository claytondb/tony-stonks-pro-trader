# Tony Stonks Pro Trader
## Technical Architecture Document

---

## 1. System Overview

### Tech Stack
```
┌─────────────────────────────────────────────────────────────┐
│                      GAME CLIENT                            │
├─────────────────────────────────────────────────────────────┤
│  Rendering          │  Three.js + Custom Shaders            │
│  Physics            │  Rapier.js (WASM)                     │
│  Audio              │  Howler.js                            │
│  Input              │  Custom (Keyboard/Gamepad/Touch)      │
│  UI Framework       │  Preact + htm (lightweight)           │
│  State Management   │  Zustand                              │
│  Language           │  TypeScript                           │
│  Build Tool         │  Vite                                 │
│  Asset Pipeline     │  GLTF/GLB + Basis Universal          │
├─────────────────────────────────────────────────────────────┤
│                    CROSS-PLATFORM                           │
├─────────────────────────────────────────────────────────────┤
│  Web                │  Direct deployment (Vite build)       │
│  iOS/Android        │  Capacitor                            │
│  Desktop            │  Electron                             │
│  Steam Deck         │  Electron (Proton compatible)         │
│  Nintendo Switch    │  Custom port (future)                 │
└─────────────────────────────────────────────────────────────┘
```

### Architecture Pattern
**Entity Component System (ECS)** for game objects
- Entities: Unique IDs
- Components: Pure data (Position, Velocity, Tricks, etc.)
- Systems: Logic processors (Physics, Rendering, Scoring)

Benefits:
- Cache-friendly data layout
- Easy to add new features
- Decoupled systems
- Great for TypeScript

---

## 2. Project Structure

```
dc-tonystonks/
├── docs/                    # Documentation
├── story/                   # Narrative content
├── assets/
│   ├── ui/                  # 2D assets
│   ├── models/              # 3D models (GLTF)
│   ├── textures/            # Textures
│   ├── animations/          # Animation files
│   └── audio/               # Sound effects + music
│
├── src/
│   ├── index.html           # Entry HTML
│   ├── main.ts              # Entry point
│   ├── game/
│   │   ├── Game.ts          # Main game class
│   │   ├── GameLoop.ts      # Fixed timestep loop
│   │   └── GameState.ts     # Global game state
│   │
│   ├── ecs/
│   │   ├── World.ts         # ECS world manager
│   │   ├── Entity.ts        # Entity factory
│   │   ├── Component.ts     # Component base
│   │   └── System.ts        # System base
│   │
│   ├── components/
│   │   ├── Transform.ts     # Position, rotation, scale
│   │   ├── RigidBody.ts     # Physics body ref
│   │   ├── Renderable.ts    # Three.js mesh ref
│   │   ├── Player.ts        # Player-specific data
│   │   ├── Chair.ts         # Chair properties
│   │   ├── Grindable.ts     # Grind rail data
│   │   ├── Collectible.ts   # Pickup items
│   │   └── NPC.ts           # NPC behavior
│   │
│   ├── systems/
│   │   ├── InputSystem.ts       # Input handling
│   │   ├── PhysicsSystem.ts     # Rapier integration
│   │   ├── MovementSystem.ts    # Player movement
│   │   ├── TrickSystem.ts       # Trick detection/scoring
│   │   ├── GrindSystem.ts       # Grind mechanics
│   │   ├── ComboSystem.ts       # Combo tracking
│   │   ├── AnimationSystem.ts   # Animation blending
│   │   ├── RenderSystem.ts      # Three.js rendering
│   │   ├── AudioSystem.ts       # Sound playback
│   │   ├── CollisionSystem.ts   # Collision response
│   │   └── UISystem.ts          # HUD updates
│   │
│   ├── physics/
│   │   ├── PhysicsWorld.ts      # Rapier world wrapper
│   │   ├── ChairPhysics.ts      # Chair-specific physics
│   │   └── CollisionGroups.ts   # Collision layers
│   │
│   ├── rendering/
│   │   ├── SceneManager.ts      # Three.js scene
│   │   ├── CameraController.ts  # Follow camera
│   │   ├── LightingManager.ts   # Dynamic lighting
│   │   └── PostProcessing.ts    # Effects
│   │
│   ├── input/
│   │   ├── InputManager.ts      # Unified input
│   │   ├── KeyboardInput.ts     # Keyboard handler
│   │   ├── GamepadInput.ts      # Gamepad handler
│   │   └── TouchInput.ts        # Mobile touch
│   │
│   ├── tricks/
│   │   ├── TrickDetector.ts     # Input → Trick mapping
│   │   ├── TrickRegistry.ts     # All tricks defined
│   │   ├── TrickScorer.ts       # Point calculation
│   │   └── tricks/
│   │       ├── FlipTricks.ts
│   │       ├── GrabTricks.ts
│   │       ├── GrindTricks.ts
│   │       └── SpecialTricks.ts
│   │
│   ├── levels/
│   │   ├── LevelLoader.ts       # Load level data
│   │   ├── LevelManager.ts      # Level state
│   │   └── levels/
│   │       ├── office.json
│   │       ├── parking.json
│   │       └── ...
│   │
│   ├── ui/
│   │   ├── UIManager.ts         # UI controller
│   │   ├── components/
│   │   │   ├── HUD.tsx
│   │   │   ├── MainMenu.tsx
│   │   │   ├── PauseMenu.tsx
│   │   │   └── ...
│   │   └── stores/
│   │       ├── gameStore.ts     # Zustand store
│   │       └── uiStore.ts
│   │
│   ├── audio/
│   │   ├── AudioManager.ts      # Howler wrapper
│   │   ├── MusicPlayer.ts       # Background music
│   │   └── SFXPlayer.ts         # Sound effects
│   │
│   ├── save/
│   │   ├── SaveManager.ts       # Save/load
│   │   └── SaveData.ts          # Save structure
│   │
│   └── utils/
│       ├── Math.ts              # Math helpers
│       ├── Pool.ts              # Object pooling
│       └── Debug.ts             # Debug tools
│
├── tests/                   # Test files
├── public/                  # Static assets
├── package.json
├── tsconfig.json
├── vite.config.ts
├── capacitor.config.ts      # Mobile config
└── electron/                # Desktop build
    ├── main.ts
    └── preload.ts
```

---

## 3. Core Game Loop

### Fixed Timestep Implementation
```typescript
// GameLoop.ts
const PHYSICS_TIMESTEP = 1 / 60; // 60 Hz physics
const MAX_FRAME_SKIP = 5;

class GameLoop {
  private accumulator = 0;
  private lastTime = 0;
  
  start() {
    this.lastTime = performance.now();
    requestAnimationFrame(this.tick.bind(this));
  }
  
  tick(currentTime: number) {
    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;
    this.accumulator += deltaTime;
    
    // Fixed timestep for physics
    let steps = 0;
    while (this.accumulator >= PHYSICS_TIMESTEP && steps < MAX_FRAME_SKIP) {
      this.fixedUpdate(PHYSICS_TIMESTEP);
      this.accumulator -= PHYSICS_TIMESTEP;
      steps++;
    }
    
    // Interpolation factor for rendering
    const alpha = this.accumulator / PHYSICS_TIMESTEP;
    this.render(alpha);
    
    requestAnimationFrame(this.tick.bind(this));
  }
  
  fixedUpdate(dt: number) {
    inputSystem.update(dt);
    physicsSystem.update(dt);
    movementSystem.update(dt);
    trickSystem.update(dt);
    grindSystem.update(dt);
    comboSystem.update(dt);
    collisionSystem.update(dt);
    animationSystem.update(dt);
  }
  
  render(alpha: number) {
    renderSystem.update(alpha);
    uiSystem.update();
  }
}
```

---

## 4. Physics System

### Rapier.js Integration

```typescript
// PhysicsWorld.ts
import RAPIER from '@dimforge/rapier3d-compat';

class PhysicsWorld {
  world: RAPIER.World;
  eventQueue: RAPIER.EventQueue;
  
  async init() {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -20, z: 0 }); // Slightly floaty
    this.eventQueue = new RAPIER.EventQueue(true);
  }
  
  step(dt: number) {
    this.world.timestep = dt;
    this.world.step(this.eventQueue);
    this.processCollisions();
  }
}
```

### Chair Physics Body

```typescript
// ChairPhysics.ts
class ChairPhysics {
  createChairBody(world: RAPIER.World, position: Vector3): RAPIER.RigidBody {
    // Main body - capsule for seat
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(0.5)
      .setAngularDamping(2.0);
    
    const body = world.createRigidBody(bodyDesc);
    
    // Seat collider
    const seatDesc = RAPIER.ColliderDesc.capsule(0.3, 0.25)
      .setTranslation(0, 0.4, 0)
      .setMass(80); // kg
    
    world.createCollider(seatDesc, body);
    
    // Wheel colliders (5 casters)
    const wheelPositions = [
      { x: 0.3, z: 0 },
      { x: -0.3, z: 0 },
      { x: 0.15, z: 0.25 },
      { x: -0.15, z: 0.25 },
      { x: 0, z: -0.3 }
    ];
    
    for (const pos of wheelPositions) {
      const wheelDesc = RAPIER.ColliderDesc.ball(0.05)
        .setTranslation(pos.x, 0.05, pos.z)
        .setFriction(0.3)
        .setRestitution(0.1);
      world.createCollider(wheelDesc, body);
    }
    
    return body;
  }
}
```

### Collision Groups

```typescript
// CollisionGroups.ts
export const CollisionGroups = {
  PLAYER: 0x0001,
  GROUND: 0x0002,
  GRINDABLE: 0x0004,
  COLLECTIBLE: 0x0008,
  NPC: 0x0010,
  TRIGGER: 0x0020,
  HAZARD: 0x0040
};

export const CollisionMasks = {
  PLAYER: CollisionGroups.GROUND | CollisionGroups.GRINDABLE | 
          CollisionGroups.COLLECTIBLE | CollisionGroups.NPC | 
          CollisionGroups.HAZARD,
  GRINDABLE: CollisionGroups.PLAYER
};
```

---

## 5. Input System

### Unified Input Manager

```typescript
// InputManager.ts
interface InputState {
  // Movement
  moveX: number;      // -1 to 1
  moveY: number;      // -1 to 1
  
  // Actions (pressed this frame)
  jump: boolean;
  grab: boolean;
  flip: boolean;
  grind: boolean;
  revert: boolean;
  
  // Action holds
  jumpHeld: boolean;
  grabHeld: boolean;
  
  // D-pad for tricks (pressed this frame)
  dpadUp: boolean;
  dpadDown: boolean;
  dpadLeft: boolean;
  dpadRight: boolean;
  
  // Spin
  spinLeft: boolean;
  spinRight: boolean;
  
  // System
  pause: boolean;
}

class InputManager {
  private keyboard: KeyboardInput;
  private gamepad: GamepadInput;
  private touch: TouchInput;
  
  private prevState: InputState;
  private currentState: InputState;
  
  update() {
    this.prevState = { ...this.currentState };
    
    // Merge all input sources (gamepad takes priority)
    const kb = this.keyboard.getState();
    const gp = this.gamepad.getState();
    const tc = this.touch.getState();
    
    this.currentState = this.mergeInputs(kb, gp, tc);
  }
  
  // Just pressed this frame
  justPressed(action: keyof InputState): boolean {
    return this.currentState[action] && !this.prevState[action];
  }
  
  // Currently held
  isHeld(action: keyof InputState): boolean {
    return this.currentState[action];
  }
}
```

### THPS-Style Input Mapping

```typescript
// Default keyboard mapping
const KeyboardMapping = {
  moveUp: ['W', 'ArrowUp'],
  moveDown: ['S', 'ArrowDown'],
  moveLeft: ['A', 'ArrowLeft'],
  moveRight: ['D', 'ArrowRight'],
  
  jump: ['Space'],
  grab: ['ShiftLeft', 'ShiftRight'],
  revert: ['R'],
  
  spinLeft: ['Q'],
  spinRight: ['E'],
  
  // D-pad uses arrow keys when combined with grab/jump
  dpadUp: ['ArrowUp'],
  dpadDown: ['ArrowDown'],
  dpadLeft: ['ArrowLeft'],
  dpadRight: ['ArrowRight'],
  
  pause: ['Escape']
};

// Gamepad mapping (Xbox layout)
const GamepadMapping = {
  moveX: 'leftStickX',
  moveY: 'leftStickY',
  
  jump: 'A',
  grab: 'B',
  grind: 'X',
  
  dpadUp: 'dpadUp',
  dpadDown: 'dpadDown',
  dpadLeft: 'dpadLeft',
  dpadRight: 'dpadRight',
  
  spinLeft: 'LB',
  spinRight: 'RB',
  revert: ['LT', 'RT'],
  
  pause: 'start'
};
```

---

## 6. Trick System

### Trick Detection

```typescript
// TrickDetector.ts
class TrickDetector {
  private inputBuffer: InputEvent[] = [];
  private bufferTime = 200; // ms
  
  detectTrick(input: InputState, playerState: PlayerState): Trick | null {
    // Only detect tricks in valid states
    if (!this.canTrick(playerState)) return null;
    
    // Flip tricks: In air + D-pad + Jump
    if (playerState.isAirborne && input.jump) {
      if (input.dpadLeft) return TrickRegistry.get('kickflip');
      if (input.dpadRight) return TrickRegistry.get('heelflip');
      if (input.dpadDown) return TrickRegistry.get('pop_shove');
      if (input.dpadUp && input.dpadLeft) return TrickRegistry.get('hardflip');
      // ... more combinations
    }
    
    // Grab tricks: In air + Grab held + D-pad
    if (playerState.isAirborne && input.grabHeld) {
      if (input.dpadLeft) return TrickRegistry.get('melon');
      if (input.dpadRight) return TrickRegistry.get('indy');
      if (input.dpadUp) return TrickRegistry.get('nosegrab');
      if (input.dpadDown) return TrickRegistry.get('tailgrab');
      // ... more
    }
    
    // Manual: Quick up+down tap
    if (playerState.isGrounded && this.checkManualInput()) {
      return TrickRegistry.get('manual');
    }
    
    return null;
  }
  
  checkManualInput(): boolean {
    // Look for up→down or down→up in buffer
    const recent = this.getRecentInputs(150);
    // ... pattern matching
  }
}
```

### Trick Registry

```typescript
// TrickRegistry.ts
interface TrickDefinition {
  id: string;
  name: string;
  displayName: string;
  type: 'flip' | 'grab' | 'grind' | 'lip' | 'manual' | 'special';
  basePoints: number;
  animation: string;
  duration: number; // ms
  difficulty: number; // affects balance
}

const TrickRegistry = new Map<string, TrickDefinition>([
  ['kickflip', {
    id: 'kickflip',
    name: 'kickflip',
    displayName: 'Kickflip',
    type: 'flip',
    basePoints: 500,
    animation: 'trick_kickflip',
    duration: 400,
    difficulty: 1
  }],
  // ... hundreds more
]);
```

### Combo System

```typescript
// ComboSystem.ts
class ComboSystem {
  private currentCombo: Trick[] = [];
  private multiplier = 1;
  private totalPoints = 0;
  private comboTimer = 0;
  private maxComboTime = 2000; // ms to land/continue
  
  addTrick(trick: Trick) {
    // Check if trick already in combo (no repeats score less)
    const repeatCount = this.currentCombo.filter(t => t.id === trick.id).length;
    const repeatPenalty = Math.pow(0.5, repeatCount);
    
    const points = trick.basePoints * repeatPenalty;
    this.totalPoints += points;
    this.multiplier++;
    this.currentCombo.push(trick);
    this.comboTimer = this.maxComboTime;
    
    // Emit event for UI
    EventBus.emit('trick', { trick, points, multiplier: this.multiplier });
  }
  
  land() {
    // Successfully landed - bank points
    const finalScore = Math.floor(this.totalPoints * this.multiplier);
    EventBus.emit('combo_complete', { 
      score: finalScore, 
      tricks: this.currentCombo,
      multiplier: this.multiplier 
    });
    
    this.reset();
    return finalScore;
  }
  
  bail() {
    // Crashed - lose all combo points
    EventBus.emit('combo_failed', { 
      lostPoints: this.totalPoints * this.multiplier 
    });
    this.reset();
    return 0;
  }
  
  reset() {
    this.currentCombo = [];
    this.multiplier = 1;
    this.totalPoints = 0;
    this.comboTimer = 0;
  }
}
```

---

## 7. Grind System

### Grind Detection

```typescript
// GrindSystem.ts
class GrindSystem {
  private grindSnapDistance = 0.5; // units
  private grindSnapAngle = 45; // degrees
  
  update(dt: number) {
    for (const entity of this.getPlayers()) {
      const player = entity.get(Player);
      const transform = entity.get(Transform);
      const rigidBody = entity.get(RigidBody);
      
      if (player.isAirborne && player.velocity.y < 0) {
        // Falling - check for nearby grindables
        const nearbyRail = this.findNearestGrindable(transform.position);
        
        if (nearbyRail && this.canSnapToRail(transform, rigidBody, nearbyRail)) {
          this.startGrind(entity, nearbyRail);
        }
      }
      
      if (player.isGrinding) {
        this.updateGrind(entity, dt);
      }
    }
  }
  
  startGrind(entity: Entity, rail: Grindable) {
    const player = entity.get(Player);
    const rigidBody = entity.get(RigidBody);
    
    // Snap to rail
    const snapPoint = rail.getNearestPoint(entity.get(Transform).position);
    rigidBody.setPosition(snapPoint);
    
    // Align velocity to rail direction
    const railDir = rail.getDirection(snapPoint);
    const speed = rigidBody.getVelocity().length();
    rigidBody.setVelocity(railDir.multiplyScalar(speed));
    
    // Set grind state
    player.isGrinding = true;
    player.currentRail = rail;
    player.grindBalance = 0.5; // centered
    
    // Detect grind type based on approach angle
    player.grindType = this.detectGrindType(rigidBody.getVelocity(), railDir);
    
    // Trigger trick
    const grindTrick = TrickRegistry.get(player.grindType);
    comboSystem.addTrick(grindTrick);
  }
  
  updateGrind(entity: Entity, dt: number) {
    const player = entity.get(Player);
    const input = inputManager.getState();
    
    // Balance mechanic
    player.grindBalance += input.moveX * dt * 2;
    player.grindBalance += (Math.random() - 0.5) * dt * 0.5; // wobble
    
    // Clamp and check bail
    if (Math.abs(player.grindBalance - 0.5) > 0.5) {
      this.endGrind(entity, true); // bail
      return;
    }
    
    // Check for jump off
    if (input.jump) {
      this.endGrind(entity, false);
      entity.get(RigidBody).applyImpulse({ x: 0, y: 8, z: 0 });
    }
    
    // Check rail end
    if (player.currentRail.isAtEnd(entity.get(Transform).position)) {
      this.endGrind(entity, false);
    }
  }
}
```

---

## 8. Rendering System

### Scene Setup

```typescript
// SceneManager.ts
import * as THREE from 'three';

class SceneManager {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  
  init(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    
    this.camera = new THREE.PerspectiveCamera(
      60, // FOV
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    
    this.renderer = new THREE.WebGLRenderer({ 
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  }
  
  render(alpha: number) {
    // Interpolate transforms for smooth rendering
    for (const entity of world.getEntitiesWithComponents(Transform, Renderable)) {
      const transform = entity.get(Transform);
      const renderable = entity.get(Renderable);
      
      // Lerp between previous and current physics state
      renderable.mesh.position.lerpVectors(
        transform.previousPosition,
        transform.position,
        alpha
      );
      renderable.mesh.quaternion.slerpQuaternions(
        transform.previousRotation,
        transform.rotation,
        alpha
      );
    }
    
    this.renderer.render(this.scene, this.camera);
  }
}
```

### Camera Controller

```typescript
// CameraController.ts
class CameraController {
  private target: THREE.Object3D;
  private offset = new THREE.Vector3(0, 3, -6);
  private lookAhead = 2;
  private smoothSpeed = 5;
  
  update(dt: number) {
    if (!this.target) return;
    
    // Calculate desired position
    const velocity = this.target.userData.velocity || new THREE.Vector3();
    const lookAheadOffset = velocity.clone().normalize().multiplyScalar(this.lookAhead);
    
    const desiredPosition = this.target.position.clone()
      .add(this.offset)
      .add(lookAheadOffset);
    
    // Smooth follow
    camera.position.lerp(desiredPosition, this.smoothSpeed * dt);
    
    // Look at player
    const lookTarget = this.target.position.clone().add(new THREE.Vector3(0, 1, 0));
    camera.lookAt(lookTarget);
  }
}
```

---

## 9. Audio System

### Howler.js Integration

```typescript
// AudioManager.ts
import { Howl, Howler } from 'howler';

class AudioManager {
  private sounds: Map<string, Howl> = new Map();
  private music: Howl | null = null;
  
  async loadSounds() {
    const soundDefs = [
      { id: 'ollie', src: '/audio/sfx/ollie.mp3' },
      { id: 'land', src: '/audio/sfx/land.mp3' },
      { id: 'grind_loop', src: '/audio/sfx/grind_loop.mp3', loop: true },
      { id: 'trick_flip', src: '/audio/sfx/flip.mp3' },
      { id: 'bail', src: '/audio/sfx/bail.mp3' },
      // ... more
    ];
    
    for (const def of soundDefs) {
      this.sounds.set(def.id, new Howl({
        src: [def.src],
        loop: def.loop || false,
        volume: 0.8
      }));
    }
  }
  
  play(id: string, options?: { volume?: number, rate?: number }) {
    const sound = this.sounds.get(id);
    if (!sound) return;
    
    const soundId = sound.play();
    if (options?.volume) sound.volume(options.volume, soundId);
    if (options?.rate) sound.rate(options.rate, soundId);
    
    return soundId;
  }
  
  playMusic(track: string) {
    if (this.music) this.music.fade(1, 0, 500);
    
    this.music = new Howl({
      src: [`/audio/music/${track}.mp3`],
      loop: true,
      volume: 0.5
    });
    this.music.play();
  }
}
```

---

## 10. Save System

### Save Data Structure

```typescript
// SaveData.ts
interface SaveData {
  version: number;
  profile: {
    name: string;
    playTime: number;
    created: number;
  };
  progress: {
    currentLevel: string;
    completedLevels: string[];
    objectives: Record<string, string[]>; // levelId → completed objective ids
    secretTapes: string[];
    stonksCollected: Record<string, boolean[]>;
  };
  unlocks: {
    chairs: string[];
    outfits: string[];
    levels: string[];
    specials: string[];
  };
  stats: {
    totalScore: number;
    highScores: Record<string, number>;
    bestCombos: Record<string, number>;
    tricksLanded: Record<string, number>;
    totalBails: number;
    totalGrindTime: number;
  };
  settings: {
    audio: {
      master: number;
      music: number;
      sfx: number;
    };
    graphics: {
      quality: 'low' | 'medium' | 'high';
      shadows: boolean;
      postProcessing: boolean;
    };
    controls: {
      invertY: boolean;
      sensitivity: number;
      vibration: boolean;
    };
  };
}
```

### Save Manager

```typescript
// SaveManager.ts
class SaveManager {
  private storageKey = 'tonystonks_save';
  
  save(data: SaveData) {
    const json = JSON.stringify(data);
    
    // Web: localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.storageKey, json);
    }
    
    // Capacitor: Preferences plugin
    if (window.Capacitor) {
      Preferences.set({ key: this.storageKey, value: json });
    }
    
    // Electron: electron-store
    if (window.electronAPI) {
      window.electronAPI.saveGame(json);
    }
  }
  
  async load(): Promise<SaveData | null> {
    let json: string | null = null;
    
    if (typeof localStorage !== 'undefined') {
      json = localStorage.getItem(this.storageKey);
    }
    
    if (!json && window.Capacitor) {
      const result = await Preferences.get({ key: this.storageKey });
      json = result.value;
    }
    
    if (!json && window.electronAPI) {
      json = await window.electronAPI.loadGame();
    }
    
    return json ? JSON.parse(json) : null;
  }
}
```

---

## 11. Cross-Platform Build

### Vite Config

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: {
    target: 'esnext',
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          rapier: ['@dimforge/rapier3d-compat'],
          howler: ['howler']
        }
      }
    }
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat']
  }
});
```

### Capacitor Config

```typescript
// capacitor.config.ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tonystonks.protrader',
  appName: 'Tony Stonks Pro Trader',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#2D2D2D'
    },
    Keyboard: {
      resize: 'none'
    }
  }
};

export default config;
```

---

## 12. Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| FPS | 60 stable | Performance.now() delta |
| Frame Budget | <16.67ms | requestAnimationFrame timing |
| Physics Step | <4ms | Rapier profiling |
| Draw Calls | <100 | Three.js renderer.info |
| Triangles | <500k | Three.js renderer.info |
| Memory (JS Heap) | <256MB | Chrome DevTools |
| Bundle Size | <20MB | Vite build output |
| First Load | <5s (3G) | Lighthouse |
| Input Latency | <50ms | Manual testing |

### Optimization Strategies
- Object pooling for particles, projectiles
- LOD system for distant objects
- Frustum culling (Three.js built-in)
- Texture atlasing
- Instanced rendering for repeated objects
- WASM physics (Rapier)
- Web Workers for heavy computation

---

*Architecture will evolve as development progresses.*
