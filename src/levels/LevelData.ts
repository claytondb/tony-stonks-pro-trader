/**
 * Level Data Types
 * Defines the structure of level configurations
 */

// Object types that can be placed in a level
export type ObjectType = 
  | 'rail'
  | 'rail_angled'
  | 'rail_curved'
  | 'ramp'
  | 'quarter_pipe'
  | 'quarter_pipe_small'
  | 'quarter_pipe_med'
  | 'quarter_pipe_large'
  | 'half_pipe'
  | 'fun_box'
  | 'stairs'
  | 'platform'
  | 'wall'
  | 'desk'
  | 'cubicle'
  | 'water_cooler'
  | 'elevator'
  | 'escalator'
  | 'planter'
  | 'car'
  | 'bench'
  | 'trash_can'
  | 'cone'
  | 'barrier'
  | 'building'
  | 'building_small'
  | 'building_medium'
  | 'building_large'
  | 'building_wide'
  | 'shrub_small'
  | 'shrub_medium'
  | 'shrub_large'
  | 'tree_small'
  | 'kicker'
  | 'manual_pad'
  | 'pool';

export interface LevelObject {
  type: ObjectType;
  position: [number, number, number];
  rotation?: [number, number, number]; // Euler angles in degrees
  scale?: [number, number, number];
  params?: Record<string, unknown>; // Type-specific parameters
}

export interface SpawnPoint {
  position: [number, number, number];
  rotation: number; // Y rotation in degrees
}

export interface CollectiblePlacement {
  type: 'money' | 'document' | 'special';
  position: [number, number, number];
  value?: number;
}

export interface GoalDefinition {
  type: 'score' | 'collect' | 'combo' | 'grind' | 'escape' | 'time';
  target: number;
  description: string;
  reward?: number;
}

export interface LevelData {
  id: string;
  chapter: number;
  name: string;
  subtitle?: string;
  description: string;
  
  // Environment settings
  skyColor: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  ambientLight: number;
  sunIntensity: number;
  
  // Ground settings
  groundSize: number;
  groundTexture?: string;
  groundColor?: string;
  
  // Spawn and boundaries
  spawnPoint: SpawnPoint;
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  
  // Level objects
  objects: LevelObject[];
  
  // Collectibles
  collectibles?: CollectiblePlacement[];
  
  // Goals/Objectives
  goals: GoalDefinition[];
  
  // Time limit (0 = no limit)
  timeLimit: number;
  
  // Music track
  music?: string;
  
  // Story elements
  introDialogue?: string[];
  outroDialogue?: string[];
}

// ===========================================
// LEVEL DEFINITIONS
// ===========================================

export const LEVELS: LevelData[] = [
  // =========================================
  // CHAPTER 1: THE ESCAPE
  // =========================================
  {
    id: 'ch1_office',
    chapter: 1,
    name: 'Cubicle Chaos',
    subtitle: 'The Great Escape Begins',
    description: 'Navigate through the open office floor as SEC agents close in!',
    
    skyColor: '#87CEEB',
    fogColor: '#a0a0a0',
    fogNear: 30,
    fogFar: 100,
    ambientLight: 0.5,
    sunIntensity: 0.8,
    
    groundSize: 80,
    groundColor: '#555555',
    
    spawnPoint: {
      position: [0, 0.5, 0],
      rotation: 0
    },
    
    bounds: {
      minX: -38,
      maxX: 38,
      minZ: -38,
      maxZ: 38
    },
    
    objects: [
      // Cubicle rows
      { type: 'cubicle', position: [-15, 0, -10], params: { width: 3, depth: 3 } },
      { type: 'cubicle', position: [-15, 0, -5], params: { width: 3, depth: 3 } },
      { type: 'cubicle', position: [-15, 0, 0], params: { width: 3, depth: 3 } },
      { type: 'cubicle', position: [-15, 0, 5], params: { width: 3, depth: 3 } },
      { type: 'cubicle', position: [-15, 0, 10], params: { width: 3, depth: 3 } },
      
      { type: 'cubicle', position: [15, 0, -10], params: { width: 3, depth: 3 } },
      { type: 'cubicle', position: [15, 0, -5], params: { width: 3, depth: 3 } },
      { type: 'cubicle', position: [15, 0, 0], params: { width: 3, depth: 3 } },
      { type: 'cubicle', position: [15, 0, 5], params: { width: 3, depth: 3 } },
      { type: 'cubicle', position: [15, 0, 10], params: { width: 3, depth: 3 } },
      
      // Desk rails for grinding
      { type: 'rail', position: [-10, 0, -15], params: { length: 20 } },
      { type: 'rail', position: [10, 0, -15], params: { length: 20 } },
      { type: 'rail', position: [0, 0, 15], params: { length: 25 } },
      
      // Ramps (using desks as impromptu ramps)
      { type: 'ramp', position: [-5, 0, 0], rotation: [0, 90, 0] },
      { type: 'ramp', position: [5, 0, 0], rotation: [0, -90, 0] },
      
      // Water cooler (obstacle)
      { type: 'water_cooler', position: [-20, 0, 0] },
      { type: 'water_cooler', position: [20, 0, 0] },
      
      // Conference table (fun box for tricks)
      { type: 'fun_box', position: [0, 0, -20], params: { width: 8, depth: 4, height: 0.8 } },
      
      // Stairs leading down
      { type: 'stairs', position: [0, 0, 25], rotation: [0, 180, 0], params: { steps: 5 } },
    ],
    
    collectibles: [
      { type: 'document', position: [-10, 1, -10], value: 100 },
      { type: 'document', position: [10, 1, -10], value: 100 },
      { type: 'document', position: [0, 2, 15], value: 250 },
      { type: 'money', position: [-15, 1, 0], value: 500 },
      { type: 'money', position: [15, 1, 0], value: 500 },
    ],
    
    goals: [
      { type: 'score', target: 5000, description: 'Score 5,000 points', reward: 1000 },
      { type: 'grind', target: 3, description: 'Grind 3 desk rails', reward: 500 },
      { type: 'collect', target: 5, description: 'Collect all shredded documents', reward: 2000 },
    ],
    
    timeLimit: 120,
    
    introDialogue: [
      "SEC AGENT: We have a warrant for Tony Stonks!",
      "TONY: Time to roll! Literally!",
      "OBJECTIVE: Escape through the office before they catch you!"
    ]
  },
  
  // =========================================
  // CHAPTER 2: PARKING GARAGE
  // =========================================
  {
    id: 'ch1_garage',
    chapter: 1,
    name: 'Parking Lot Panic',
    subtitle: 'Underground Getaway',
    description: 'Shred through the parking garage to reach your getaway vehicle!',
    
    skyColor: '#333333',
    fogColor: '#222222',
    fogNear: 20,
    fogFar: 80,
    ambientLight: 0.3,
    sunIntensity: 0.2,
    
    groundSize: 100,
    groundColor: '#444444',
    
    spawnPoint: {
      position: [0, 0.5, -40],
      rotation: 0
    },
    
    bounds: {
      minX: -45,
      maxX: 45,
      minZ: -45,
      maxZ: 45
    },
    
    objects: [
      // Car rows (obstacles and grind surfaces)
      { type: 'car', position: [-20, 0, -30], rotation: [0, 0, 0] },
      { type: 'car', position: [-20, 0, -20], rotation: [0, 0, 0] },
      { type: 'car', position: [-20, 0, -10], rotation: [0, 0, 0] },
      { type: 'car', position: [-20, 0, 0], rotation: [0, 0, 0] },
      
      { type: 'car', position: [20, 0, -30], rotation: [0, 180, 0] },
      { type: 'car', position: [20, 0, -20], rotation: [0, 180, 0] },
      { type: 'car', position: [20, 0, -10], rotation: [0, 180, 0] },
      { type: 'car', position: [20, 0, 0], rotation: [0, 180, 0] },
      
      // Concrete barriers (rails)
      { type: 'rail', position: [0, 0, -35], params: { length: 30 } },
      { type: 'rail', position: [0, 0, -15], params: { length: 30 } },
      { type: 'rail', position: [0, 0, 5], params: { length: 30 } },
      
      // Ramps
      { type: 'ramp', position: [-10, 0, 25], rotation: [0, 0, 0] },
      { type: 'ramp', position: [10, 0, 25], rotation: [0, 0, 0] },
      
      // Quarter pipes at edges
      { type: 'quarter_pipe', position: [-40, 0, 0], rotation: [0, 90, 0] },
      { type: 'quarter_pipe', position: [40, 0, 0], rotation: [0, -90, 0] },
      
      // Cones and barriers
      { type: 'cone', position: [-5, 0, 30] },
      { type: 'cone', position: [0, 0, 30] },
      { type: 'cone', position: [5, 0, 30] },
      { type: 'barrier', position: [0, 0, 35], params: { length: 10 } },
    ],
    
    goals: [
      { type: 'score', target: 10000, description: 'Score 10,000 points', reward: 2000 },
      { type: 'combo', target: 5000, description: 'Land a 5,000 point combo', reward: 1500 },
      { type: 'escape', target: 1, description: 'Reach the exit ramp', reward: 3000 },
    ],
    
    timeLimit: 180,
  },
  
  // =========================================  
  // CHAPTER 3: DOWNTOWN
  // =========================================
  {
    id: 'ch2_downtown',
    chapter: 2,
    name: 'Street Smart',
    subtitle: 'Urban Jungle',
    description: 'Hit the streets and show off your skills while evading pursuit!',
    
    skyColor: '#6699CC',
    fogColor: '#888888',
    fogNear: 40,
    fogFar: 150,
    ambientLight: 0.6,
    sunIntensity: 1.0,
    
    groundSize: 150,
    groundColor: '#333333',
    
    spawnPoint: {
      position: [0, 0.5, -60],
      rotation: 0
    },
    
    bounds: {
      minX: -70,
      maxX: 70,
      minZ: -70,
      maxZ: 70
    },
    
    objects: [
      // Benches (grindable)
      { type: 'bench', position: [-15, 0, -40] },
      { type: 'bench', position: [-15, 0, -20] },
      { type: 'bench', position: [-15, 0, 0] },
      { type: 'bench', position: [15, 0, -40] },
      { type: 'bench', position: [15, 0, -20] },
      { type: 'bench', position: [15, 0, 0] },
      
      // Planters (obstacles)
      { type: 'planter', position: [-30, 0, -30] },
      { type: 'planter', position: [30, 0, -30] },
      { type: 'planter', position: [-30, 0, 30] },
      { type: 'planter', position: [30, 0, 30] },
      
      // Handrails on stairs
      { type: 'stairs', position: [0, 0, -50], params: { steps: 8 } },
      { type: 'rail', position: [-3, 0, -50], params: { length: 10 }, rotation: [15, 0, 0] },
      { type: 'rail', position: [3, 0, -50], params: { length: 10 }, rotation: [15, 0, 0] },
      
      // Half pipe in plaza
      { type: 'half_pipe', position: [0, 0, 30], params: { width: 15, length: 20 } },
      
      // Trash cans
      { type: 'trash_can', position: [-25, 0, 0] },
      { type: 'trash_can', position: [25, 0, 0] },
    ],
    
    goals: [
      { type: 'score', target: 25000, description: 'Score 25,000 points', reward: 5000 },
      { type: 'combo', target: 10000, description: 'Land a 10,000 point combo', reward: 3000 },
      { type: 'grind', target: 10, description: 'Grind 10 rails', reward: 2000 },
      { type: 'time', target: 120, description: 'Survive for 2 minutes', reward: 2500 },
    ],
    
    timeLimit: 180,
  }
];

// Get level by ID
export function getLevelById(id: string): LevelData | undefined {
  return LEVELS.find(level => level.id === id);
}

// Get levels by chapter
export function getLevelsByChapter(chapter: number): LevelData[] {
  return LEVELS.filter(level => level.chapter === chapter);
}

// Get all chapter numbers
export function getChapters(): number[] {
  return [...new Set(LEVELS.map(level => level.chapter))].sort();
}
