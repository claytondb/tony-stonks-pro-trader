/**
 * Story Mode Levels
 * The epic tale of Tony Stonks escaping the SEC
 */

import { LevelData } from '../levels/LevelData';

export interface StoryCheckpoint {
  position: [number, number, number];
  rotation: number;
  name: string;
  dialogue?: string[];
}

export interface StoryLevelData extends LevelData {
  storyOrder: number;
  nextLevel?: string;
  checkpoints: StoryCheckpoint[];
  hasChaseMechanic?: boolean;
  chaseSpeed?: number;
}

// ===========================================
// CHAPTER 1: THE ESCAPE
// ===========================================

const LEVEL_1_OFFICE: StoryLevelData = {
  id: 'story_1_office',
  chapter: 1,
  storyOrder: 1,
  nextLevel: 'story_2_stairwell',
  name: 'Office Escape',
  subtitle: 'The Day Everything Changed',
  description: 'SEC agents have stormed the building! Grab your office chair and GET OUT!',
  
  // Indoor environment — no sky visible, fluorescent lights, carpet floor
  skyColor: '#111111',
  skyColorTop: '#111111',
  skyColorBottom: '#1a1a1a',
  fogColor: '#2a2a2e',
  fogNear: 25,
  fogFar: 60,
  ambientLight: 1.5,
  sunIntensity: 0,
  
  groundSize: 80,
  groundColor: '#7a7a6a',  // Office carpet
  
  spawnPoint: {
    position: [-28, 1.0, -30],  // Y=1.0 prevents sinking into ground
    rotation: 90
  },
  
  bounds: {
    minX: -38,
    maxX: 38,
    minZ: -38,
    maxZ: 38
  },
  
  checkpoints: [
    {
      position: [0, 1.0, 28],
      rotation: 0,
      name: 'Reached the stairwell',
      dialogue: ['TONY: There\'s the stairs! Time to ride!']
    }
  ],
  
  objects: [
    // =============================================
    // PERIMETER WALLS (indoor room enclosure)
    // =============================================
    // North wall (far end — stairwell side)
    { type: 'wall_indoor', position: [0, 4, 38.5], params: { width: 78, height: 8, depth: 1 } },
    // South wall (spawn side)
    { type: 'wall_indoor', position: [0, 4, -38.5], params: { width: 78, height: 8, depth: 1 } },
    // East wall
    { type: 'wall_indoor', position: [38.5, 4, 0], rotation: [0, 90, 0], params: { width: 78, height: 8, depth: 1 } },
    // West wall
    { type: 'wall_indoor', position: [-38.5, 4, 0], rotation: [0, 90, 0], params: { width: 78, height: 8, depth: 1 } },
    
    // CEILING
    { type: 'ceiling_slab', position: [0, 7.8, 0], params: { width: 78, depth: 78 } },
    
    // =============================================
    // FLUORESCENT CEILING LIGHT PANELS
    // =============================================
    { type: 'ceiling_panel', position: [-20, 7.6, -25], params: { width: 6, depth: 0.8 } },
    { type: 'ceiling_panel', position: [0, 7.6, -25], params: { width: 6, depth: 0.8 } },
    { type: 'ceiling_panel', position: [20, 7.6, -25], params: { width: 6, depth: 0.8 } },
    { type: 'ceiling_panel', position: [-20, 7.6, -8], params: { width: 6, depth: 0.8 } },
    { type: 'ceiling_panel', position: [0, 7.6, -8], params: { width: 6, depth: 0.8 } },
    { type: 'ceiling_panel', position: [20, 7.6, -8], params: { width: 6, depth: 0.8 } },
    { type: 'ceiling_panel', position: [-20, 7.6, 10], params: { width: 6, depth: 0.8 } },
    { type: 'ceiling_panel', position: [0, 7.6, 10], params: { width: 6, depth: 0.8 } },
    { type: 'ceiling_panel', position: [20, 7.6, 10], params: { width: 6, depth: 0.8 } },
    { type: 'ceiling_panel', position: [0, 7.6, 28], params: { width: 6, depth: 0.8 } },
    
    // =============================================
    // CUBICLES — proper office grid with skating aisles
    // Layout: Left block (x=-28,-22) and Right block (x=22,28)
    // Center main aisle: x=-19 to x=19 (38 units wide)
    // Cubicle size: 5×5 footprint, 2.2 tall walls
    // =============================================
    
    // Left block — Column A (x=-28)
    { type: 'cubicle', position: [-28, 0, -28], params: { width: 5, depth: 5, height: 2.2 } },
    { type: 'cubicle', position: [-28, 0, -18], params: { width: 5, depth: 5, height: 2.2 } },
    { type: 'cubicle', position: [-28, 0, -8], params: { width: 5, depth: 5, height: 2.2 } },
    { type: 'cubicle', position: [-28, 0, 2], params: { width: 5, depth: 5, height: 2.2 } },
    
    // Left block — Column B (x=-22)
    { type: 'cubicle', position: [-22, 0, -28], params: { width: 5, depth: 5, height: 2.2 } },
    { type: 'cubicle', position: [-22, 0, -18], params: { width: 5, depth: 5, height: 2.2 } },
    { type: 'cubicle', position: [-22, 0, -8], params: { width: 5, depth: 5, height: 2.2 } },
    { type: 'cubicle', position: [-22, 0, 2], params: { width: 5, depth: 5, height: 2.2 } },
    
    // Right block — Column C (x=22)
    { type: 'cubicle', position: [22, 0, -28], params: { width: 5, depth: 5, height: 2.2 } },
    { type: 'cubicle', position: [22, 0, -18], params: { width: 5, depth: 5, height: 2.2 } },
    { type: 'cubicle', position: [22, 0, -8], params: { width: 5, depth: 5, height: 2.2 } },
    { type: 'cubicle', position: [22, 0, 2], params: { width: 5, depth: 5, height: 2.2 } },
    
    // Right block — Column D (x=28)
    { type: 'cubicle', position: [28, 0, -28], params: { width: 5, depth: 5, height: 2.2 } },
    { type: 'cubicle', position: [28, 0, -18], params: { width: 5, depth: 5, height: 2.2 } },
    { type: 'cubicle', position: [28, 0, -8], params: { width: 5, depth: 5, height: 2.2 } },
    { type: 'cubicle', position: [28, 0, 2], params: { width: 5, depth: 5, height: 2.2 } },
    
    // =============================================
    // OFFICE PROPS
    // =============================================
    
    // Filing cabinets (along walls, near cubicles)
    { type: 'filing_cabinet', position: [-35, 0, -30] },
    { type: 'filing_cabinet', position: [-35, 0, -22] },
    { type: 'filing_cabinet', position: [-35, 0, -14] },
    { type: 'filing_cabinet', position: [35, 0, -30] },
    { type: 'filing_cabinet', position: [35, 0, -22] },
    { type: 'filing_cabinet', position: [35, 0, -14] },
    
    // Printers (scattered near cubicle clusters)
    { type: 'printer', position: [-18, 0, -32] },
    { type: 'printer', position: [18, 0, -32] },
    { type: 'printer', position: [-18, 0, 10] },
    { type: 'printer', position: [18, 0, 10] },
    
    // Water coolers (in center aisle — obstacles/jump ramps)
    { type: 'water_cooler', position: [-8, 0, -22] },
    { type: 'water_cooler', position: [8, 0, -22] },
    { type: 'water_cooler', position: [0, 0, -5] },
    
    // Trash cans
    { type: 'trash_can', position: [-12, 0, -30] },
    { type: 'trash_can', position: [12, 0, -30] },
    { type: 'trash_can', position: [-5, 0, 8] },
    { type: 'trash_can', position: [5, 0, 8] },
    
    // Plants (near walls — decorative)
    { type: 'planter', position: [-36, 0, 5] },
    { type: 'planter', position: [36, 0, 5] },
    { type: 'planter', position: [0, 0, 35] },
    
    // =============================================
    // SKATE OBSTACLES IN CENTER AISLE
    // =============================================
    
    // Conference table rails (main grinding spots)
    { type: 'rail', position: [0, 0, -18], params: { length: 12 } },
    { type: 'rail', position: [0, 0, -5], params: { length: 16 } },
    { type: 'rail', position: [-10, 0, 5], params: { length: 8 }, rotation: [0, 90, 0] },
    { type: 'rail', position: [10, 0, 5], params: { length: 8 }, rotation: [0, 90, 0] },
    
    // Fun box (overturned copy machine/desk)
    { type: 'fun_box', position: [0, 0, -32], params: { width: 8, depth: 4, height: 0.9 } },
    { type: 'fun_box', position: [-8, 0, 15], params: { width: 5, depth: 3, height: 0.8 } },
    { type: 'fun_box', position: [8, 0, 15], params: { width: 5, depth: 3, height: 0.8 } },
    
    // Ramps (overturned desks / filing cabinets)
    { type: 'ramp', position: [-5, 0, -12], rotation: [0, 0, 0] },
    { type: 'ramp', position: [5, 0, -12], rotation: [0, 180, 0] },
    { type: 'ramp', position: [0, 0, 18], rotation: [0, 0, 0] },
    
    // =============================================
    // STAIRWELL EXIT (end goal)
    // =============================================
    { type: 'exit_sign', position: [0, 3.5, 37], params: { width: 3, height: 0.8 } },
    { type: 'stairs', position: [0, 0, 32], rotation: [0, 180, 0], params: { steps: 6 } },
  ],
  
  collectibles: [
    { type: 'document', position: [-20, 1.5, -18], value: 200 },
    { type: 'document', position: [20, 1.5, -18], value: 200 },
    { type: 'document', position: [0, 2, -5], value: 500 },
    { type: 'money', position: [-8, 1.2, -30], value: 1000 },
    { type: 'money', position: [8, 1.2, -30], value: 1000 },
    { type: 'special', position: [0, 2.5, -32], value: 2500 },
  ],
  
  goals: [
    { type: 'escape', target: 1, description: 'Reach the stairwell!', reward: 2000 },
    { type: 'score', target: 5000, description: 'Score 5,000 stonks', reward: 1000 },
    { type: 'grind', target: 3, description: 'Grind 3 desk rails', reward: 750 },
    { type: 'collect', target: 3, description: 'Grab the shredded documents', reward: 1500 },
  ],
  
  timeLimit: 120,
  
  introDialogue: [
    '📰 BREAKING NEWS: SEC RAIDS STONKS CAPITAL!',
    'SEC AGENT: Tony Stonks, you\'re under arrest for... creative accounting!',
    'TONY: Not today! *jumps on office chair*',
    'TONY: Time to see if all those YouTube skating videos paid off!'
  ],
  
  outroDialogue: [
    'TONY: Made it to the stairs! But I can hear them behind me...',
    'SEC AGENT: He\'s heading down! All units to the stairwell!'
  ]
};

const LEVEL_2_STAIRWELL: StoryLevelData = {
  id: 'story_2_stairwell',
  chapter: 1,
  storyOrder: 2,
  nextLevel: 'story_3_lobby',
  name: 'Stairwell Descent',
  subtitle: '50 Floors of Freedom',
  description: 'Grind your way down 50 floors of stair rails!',
  
  skyColor: '#333340',
  skyColorTop: '#1a1a25',
  skyColorBottom: '#404050',
  fogColor: '#2a2a35',
  fogNear: 10,
  fogFar: 50,
  ambientLight: 0.4,
  sunIntensity: 0.2,
  
  groundSize: 40,
  groundColor: '#444455',
  
  spawnPoint: {
    position: [0, 50, -15],
    rotation: 0
  },
  
  bounds: {
    minX: -18,
    maxX: 18,
    minZ: -18,
    maxZ: 18
  },
  
  checkpoints: [],  // No checkpoints - it's one continuous descent
  
  objects: [
    // Spiral staircase rails - descending helix
    // Each "floor" is about 10 units of vertical drop
    // Rails at each landing platform
    
    // Floor 50 (start) - top platform
    { type: 'rail', position: [0, 50, -10], params: { length: 8 }, rotation: [0, 0, 0] },
    { type: 'stairs', position: [0, 50, 0], rotation: [0, 0, 0], params: { steps: 10 } },
    
    // Floor 45
    { type: 'rail', position: [8, 40, 0], params: { length: 8 }, rotation: [0, 90, 0] },
    { type: 'stairs', position: [5, 40, 5], rotation: [0, 90, 0], params: { steps: 10 } },
    
    // Floor 40
    { type: 'rail', position: [0, 30, 10], params: { length: 8 }, rotation: [0, 180, 0] },
    { type: 'stairs', position: [0, 30, 5], rotation: [0, 180, 0], params: { steps: 10 } },
    
    // Floor 35
    { type: 'rail', position: [-8, 20, 0], params: { length: 8 }, rotation: [0, -90, 0] },
    { type: 'stairs', position: [-5, 20, -5], rotation: [0, -90, 0], params: { steps: 10 } },
    
    // Floor 30
    { type: 'rail', position: [0, 10, -10], params: { length: 8 }, rotation: [0, 0, 0] },
    { type: 'ramp', position: [5, 10, -5], rotation: [0, 45, 0] },
    
    // Lower floors
    { type: 'rail', position: [5, 5, 0], params: { length: 6 }, rotation: [0, 45, 0] },
    { type: 'rail', position: [0, 2, 5], params: { length: 6 }, rotation: [0, 0, 0] },
    
    // Exit area (ground floor)
    { type: 'fun_box', position: [0, 0, 10], params: { width: 8, depth: 4, height: 0.5 } },
  ],
  
  goals: [
    { type: 'escape', target: 1, description: 'Reach the lobby!', reward: 2500 },
    { type: 'score', target: 10000, description: 'Score 10,000 stonks', reward: 1500 },
    { type: 'grind', target: 5, description: 'Grind 5 stair rails', reward: 1000 },
    { type: 'time', target: 60, description: 'Finish in under 60 seconds', reward: 2000 },
  ],
  
  timeLimit: 90,
  
  introDialogue: [
    'TONY: 50 floors down... piece of cake!',
    'TONY: These chair wheels were made for grinding!'
  ]
};

const LEVEL_3_LOBBY: StoryLevelData = {
  id: 'story_3_lobby',
  chapter: 1,
  storyOrder: 3,
  nextLevel: 'story_4_highway',
  name: 'Lobby Showdown',
  subtitle: 'The Great Escape',
  description: 'The grand lobby is crawling with security. Crash through the glass doors to freedom!',
  
  skyColor: '#87ceeb',
  skyColorTop: '#5a9fd4',
  skyColorBottom: '#b8d4e8',
  fogColor: '#c0c0c0',
  fogNear: 30,
  fogFar: 100,
  ambientLight: 0.7,
  sunIntensity: 1.0,
  
  groundSize: 100,
  groundColor: '#d4c4a8',  // Marble floor
  
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
  
  checkpoints: [
    {
      position: [0, 0.5, 35],
      rotation: 0,
      name: 'Escaped the building!',
      dialogue: [
        'TONY: FREEDOM! But I\'m not out of the woods yet...',
        'SEC AGENT: *into radio* Subject is heading to the highway!'
      ]
    }
  ],
  
  objects: [
    // Grand reception desk (long grindable counter)
    { type: 'rail', position: [0, 0, -25], params: { length: 25 } },
    { type: 'fun_box', position: [0, 0, -25], params: { width: 25, depth: 3, height: 1.2 } },
    
    // Decorative planters (obstacles + grindable edges)
    { type: 'planter', position: [-20, 0, -20] },
    { type: 'planter', position: [20, 0, -20] },
    { type: 'planter', position: [-20, 0, 0] },
    { type: 'planter', position: [20, 0, 0] },
    { type: 'planter', position: [-20, 0, 20] },
    { type: 'planter', position: [20, 0, 20] },
    
    // Benches (grindable)
    { type: 'bench', position: [-10, 0, -10] },
    { type: 'bench', position: [10, 0, -10] },
    { type: 'bench', position: [-10, 0, 10] },
    { type: 'bench', position: [10, 0, 10] },
    
    // Marble columns (obstacles)
    { type: 'planter', position: [-30, 0, -15] },
    { type: 'planter', position: [30, 0, -15] },
    { type: 'planter', position: [-30, 0, 15] },
    { type: 'planter', position: [30, 0, 15] },
    
    // Central fountain (fun box with rails)
    { type: 'fun_box', position: [0, 0, 0], params: { width: 10, depth: 10, height: 1 } },
    { type: 'rail', position: [-5, 0, 0], params: { length: 10 }, rotation: [0, 90, 0] },
    { type: 'rail', position: [5, 0, 0], params: { length: 10 }, rotation: [0, 90, 0] },
    
    // Ramps toward exit
    { type: 'ramp', position: [-8, 0, 25], rotation: [0, 0, 0] },
    { type: 'ramp', position: [8, 0, 25], rotation: [0, 0, 0] },
    
    // Quarter pipes at sides
    { type: 'quarter_pipe_small', position: [-40, 0, 0], rotation: [0, 90, 0] },
    { type: 'quarter_pipe_small', position: [40, 0, 0], rotation: [0, -90, 0] },
    
    // Exit area - glass doors (represented as opening)
    { type: 'barrier', position: [-15, 0, 40], params: { length: 10 } },
    { type: 'barrier', position: [15, 0, 40], params: { length: 10 } },
  ],
  
  collectibles: [
    { type: 'money', position: [0, 2, -25], value: 2000 },
    { type: 'money', position: [-20, 1.5, 0], value: 1000 },
    { type: 'money', position: [20, 1.5, 0], value: 1000 },
    { type: 'special', position: [0, 3, 0], value: 5000 },
  ],
  
  goals: [
    { type: 'escape', target: 1, description: 'Crash through the front doors!', reward: 3000 },
    { type: 'score', target: 15000, description: 'Score 15,000 stonks', reward: 2000 },
    { type: 'combo', target: 5000, description: 'Land a 5,000 point combo', reward: 1500 },
    { type: 'grind', target: 5, description: 'Grind the reception desk', reward: 1000 },
  ],
  
  timeLimit: 150,
  
  introDialogue: [
    'TONY: The lobby! Almost there!',
    'SECURITY: Stop that man! He\'s on a... chair?!',
    'TONY: Try and catch me!'
  ]
};

const LEVEL_4_HIGHWAY: StoryLevelData = {
  id: 'story_4_highway',
  chapter: 2,
  storyOrder: 4,
  nextLevel: 'story_5_home',
  name: 'Highway Havoc',
  subtitle: 'Rush Hour Rumble',
  description: 'Weave through traffic on your office chair! Don\'t get flattened!',
  
  skyColor: '#87ceeb',
  skyColorTop: '#4a90d9',
  skyColorBottom: '#c8e0f4',
  fogColor: '#888888',
  fogNear: 50,
  fogFar: 200,
  ambientLight: 0.8,
  sunIntensity: 1.2,
  
  groundSize: 200,
  groundColor: '#333333',  // Asphalt
  
  spawnPoint: {
    position: [-80, 0.5, 0],
    rotation: 90
  },
  
  bounds: {
    minX: -95,
    maxX: 95,
    minZ: -30,
    maxZ: 30
  },
  
  checkpoints: [
    {
      position: [0, 0.5, 0],
      rotation: 90,
      name: 'Halfway across!',
      dialogue: ['TONY: Construction site ahead - shortcut!']
    },
    {
      position: [80, 0.5, 0],
      rotation: 90,
      name: 'Made it to the suburbs!',
      dialogue: ['TONY: Home is just around the corner...']
    }
  ],
  
  objects: [
    // Highway barriers (grindable!)
    { type: 'rail', position: [0, 0, -25], params: { length: 180 } },
    { type: 'rail', position: [0, 0, 25], params: { length: 180 } },
    { type: 'barrier', position: [0, 0, -25], params: { length: 180 } },
    { type: 'barrier', position: [0, 0, 25], params: { length: 180 } },
    
    // Center divider
    { type: 'rail', position: [0, 0, 0], params: { length: 60 } },
    { type: 'barrier', position: [-50, 0, 0], params: { length: 30 } },
    { type: 'barrier', position: [50, 0, 0], params: { length: 30 } },
    
    // Parked/stopped cars (obstacles)
    { type: 'car', position: [-60, 0, -15], rotation: [0, 90, 0] },
    { type: 'car', position: [-40, 0, -8], rotation: [0, 90, 0] },
    { type: 'car', position: [-20, 0, -18], rotation: [0, 90, 0] },
    { type: 'car', position: [0, 0, -12], rotation: [0, 90, 0] },
    { type: 'car', position: [20, 0, -5], rotation: [0, 90, 0] },
    { type: 'car', position: [40, 0, -15], rotation: [0, 90, 0] },
    { type: 'car', position: [60, 0, -10], rotation: [0, 90, 0] },
    
    { type: 'car', position: [-50, 0, 12], rotation: [0, -90, 0] },
    { type: 'car', position: [-30, 0, 18], rotation: [0, -90, 0] },
    { type: 'car', position: [-10, 0, 8], rotation: [0, -90, 0] },
    { type: 'car', position: [10, 0, 15], rotation: [0, -90, 0] },
    { type: 'car', position: [30, 0, 10], rotation: [0, -90, 0] },
    { type: 'car', position: [50, 0, 18], rotation: [0, -90, 0] },
    
    // Construction zone (middle shortcut)
    { type: 'cone', position: [-5, 0, -5] },
    { type: 'cone', position: [0, 0, -5] },
    { type: 'cone', position: [5, 0, -5] },
    { type: 'cone', position: [-5, 0, 5] },
    { type: 'cone', position: [0, 0, 5] },
    { type: 'cone', position: [5, 0, 5] },
    
    // Ramps from construction equipment
    { type: 'ramp', position: [-10, 0, 0], rotation: [0, 90, 0] },
    { type: 'ramp', position: [10, 0, 0], rotation: [0, -90, 0] },
    { type: 'quarter_pipe_small', position: [0, 0, -8], rotation: [0, 0, 0] },
    
    // Exit ramp
    { type: 'ramp', position: [85, 0, 0], rotation: [0, 90, 0] },
  ],
  
  goals: [
    { type: 'escape', target: 1, description: 'Make it to the suburbs!', reward: 3500 },
    { type: 'score', target: 20000, description: 'Score 20,000 stonks', reward: 2500 },
    { type: 'grind', target: 10, description: 'Grind the highway barriers', reward: 2000 },
    { type: 'time', target: 90, description: 'Finish in under 90 seconds', reward: 3000 },
  ],
  
  timeLimit: 180,
  
  introDialogue: [
    'TONY: The highway! This chair was built for speed!',
    '📻 RADIO: Traffic backed up due to a... chair chase?!',
    'TONY: Just need to get to my house and grab my go-bag!'
  ]
};

const LEVEL_5_HOME: StoryLevelData = {
  id: 'story_5_home',
  chapter: 2,
  storyOrder: 5,
  nextLevel: 'story_6_forest',
  name: 'Home Sweet Home... Not',
  subtitle: 'Nowhere to Run',
  description: 'Your house is surrounded by FBI! Grab what you can and escape through the back!',
  
  skyColor: '#ff9966',
  skyColorTop: '#ff6b35',
  skyColorBottom: '#ffb347',
  fogColor: '#ffaa77',
  fogNear: 40,
  fogFar: 120,
  ambientLight: 0.6,
  sunIntensity: 0.9,
  
  groundSize: 80,
  groundColor: '#4a7c29',  // Grass
  
  spawnPoint: {
    position: [-30, 0.5, 0],
    rotation: 90
  },
  
  bounds: {
    minX: -38,
    maxX: 38,
    minZ: -38,
    maxZ: 38
  },
  
  checkpoints: [
    {
      position: [0, 0.5, 30],
      rotation: 0,
      name: 'Into the forest!',
      dialogue: ['TONY: The forest behind the house - they\'ll never catch me in there!']
    }
  ],
  
  objects: [
    // Tony's house (blocked by FBI)
    { type: 'building_wide', position: [0, 0, -15], params: { width: 20, depth: 15, height: 8 } },
    
    // FBI SUVs blocking the front
    { type: 'car', position: [-15, 0, 5], rotation: [0, 30, 0] },
    { type: 'car', position: [15, 0, 5], rotation: [0, -30, 0] },
    { type: 'car', position: [0, 0, 10], rotation: [0, 0, 0] },
    
    // Barriers
    { type: 'barrier', position: [-10, 0, 15], params: { length: 8 } },
    { type: 'barrier', position: [10, 0, 15], params: { length: 8 } },
    
    // Neighbor's yard obstacles
    { type: 'shrub_medium', position: [-25, 0, 10] },
    { type: 'shrub_medium', position: [-25, 0, 20] },
    { type: 'shrub_medium', position: [25, 0, 10] },
    { type: 'shrub_medium', position: [25, 0, 20] },
    
    // Fence rails (grindable)
    { type: 'rail', position: [-30, 0, 15], params: { length: 25 }, rotation: [0, 90, 0] },
    { type: 'rail', position: [30, 0, 15], params: { length: 25 }, rotation: [0, 90, 0] },
    
    // Escape route - backyard
    { type: 'ramp', position: [-15, 0, 25], rotation: [0, 0, 0] },
    { type: 'ramp', position: [15, 0, 25], rotation: [0, 0, 0] },
    
    // Trees near forest edge
    { type: 'tree_small', position: [-20, 0, 35] },
    { type: 'tree_small', position: [-10, 0, 33] },
    { type: 'tree_small', position: [10, 0, 35] },
    { type: 'tree_small', position: [20, 0, 33] },
  ],
  
  collectibles: [
    { type: 'money', position: [-20, 1, 20], value: 1500 },
    { type: 'money', position: [20, 1, 20], value: 1500 },
    { type: 'special', position: [0, 2, 25], value: 3000 },
  ],
  
  goals: [
    { type: 'escape', target: 1, description: 'Escape into the forest!', reward: 2500 },
    { type: 'score', target: 10000, description: 'Score 10,000 stonks', reward: 1500 },
    { type: 'time', target: 45, description: 'Get out in under 45 seconds', reward: 2000 },
  ],
  
  timeLimit: 90,
  
  introDialogue: [
    'TONY: Home sweet-- wait, is that the FBI?!',
    'FBI AGENT: Tony Stonks! Come out with your hands up!',
    'TONY: That\'s not happening! Time for plan B...',
    'TONY: Through the backyard and into the forest!'
  ]
};

const LEVEL_6_FOREST: StoryLevelData = {
  id: 'story_6_forest',
  chapter: 2,
  storyOrder: 6,
  nextLevel: 'story_7_trainyard',
  name: 'Forest Chase',
  subtitle: 'Lost in the Woods',
  description: 'Agents are right behind you! Use tricks for speed boosts to outrun them!',
  
  hasChaseMechanic: true,
  chaseSpeed: 8,  // Agents catch up at 8 units/sec if you're slow
  
  skyColor: '#2d4a2d',
  skyColorTop: '#1a3a1a',
  skyColorBottom: '#4a6a4a',
  fogColor: '#3a5a3a',
  fogNear: 15,
  fogFar: 60,
  ambientLight: 0.4,
  sunIntensity: 0.5,
  
  groundSize: 150,
  groundColor: '#3a5a3a',  // Forest floor
  
  spawnPoint: {
    position: [-60, 0.5, 0],
    rotation: 90
  },
  
  bounds: {
    minX: -70,
    maxX: 70,
    minZ: -40,
    maxZ: 40
  },
  
  checkpoints: [
    {
      position: [0, 0.5, 0],
      rotation: 90,
      name: 'Halfway through!',
      dialogue: ['TONY: I can hear them falling behind!']
    },
    {
      position: [60, 0.5, 0],
      rotation: 90,
      name: 'Lost them in the woods!',
      dialogue: [
        'TONY: *panting* I think... I lost them!',
        'TONY: Wait, is that a train yard up ahead?'
      ]
    }
  ],
  
  objects: [
    // Dense tree obstacles
    { type: 'tree_small', position: [-50, 0, -20] },
    { type: 'tree_small', position: [-45, 0, 15] },
    { type: 'tree_small', position: [-40, 0, -10] },
    { type: 'tree_small', position: [-35, 0, 25] },
    { type: 'tree_small', position: [-30, 0, -25] },
    { type: 'tree_small', position: [-25, 0, 5] },
    { type: 'tree_small', position: [-20, 0, -15] },
    { type: 'tree_small', position: [-15, 0, 20] },
    { type: 'tree_small', position: [-10, 0, -5] },
    { type: 'tree_small', position: [-5, 0, 30] },
    { type: 'tree_small', position: [0, 0, -30] },
    { type: 'tree_small', position: [5, 0, 10] },
    { type: 'tree_small', position: [10, 0, -20] },
    { type: 'tree_small', position: [15, 0, 25] },
    { type: 'tree_small', position: [20, 0, -10] },
    { type: 'tree_small', position: [25, 0, 15] },
    { type: 'tree_small', position: [30, 0, -25] },
    { type: 'tree_small', position: [35, 0, 5] },
    { type: 'tree_small', position: [40, 0, -15] },
    { type: 'tree_small', position: [45, 0, 20] },
    { type: 'tree_small', position: [50, 0, -5] },
    
    // Fallen logs (grindable!)
    { type: 'rail', position: [-45, 0, 0], params: { length: 12 }, rotation: [0, 20, 0] },
    { type: 'rail', position: [-20, 0, 10], params: { length: 15 }, rotation: [0, -15, 0] },
    { type: 'rail', position: [5, 0, -8], params: { length: 10 }, rotation: [0, 30, 0] },
    { type: 'rail', position: [30, 0, 12], params: { length: 14 }, rotation: [0, -25, 0] },
    { type: 'rail', position: [55, 0, -3], params: { length: 12 }, rotation: [0, 10, 0] },
    
    // Natural ramps (dirt mounds, rocks)
    { type: 'ramp', position: [-40, 0, -12], rotation: [0, 45, 0] },
    { type: 'ramp', position: [-15, 0, -20], rotation: [0, -30, 0] },
    { type: 'ramp', position: [10, 0, 18], rotation: [0, 60, 0] },
    { type: 'ramp', position: [35, 0, -18], rotation: [0, -45, 0] },
    
    // Stream crossing (quarter pipes)
    { type: 'quarter_pipe_small', position: [20, 0, 0], rotation: [0, 90, 0] },
    
    // Shrubs (small obstacles)
    { type: 'shrub_small', position: [-55, 0, -8] },
    { type: 'shrub_small', position: [-38, 0, 22] },
    { type: 'shrub_small', position: [-12, 0, -28] },
    { type: 'shrub_small', position: [8, 0, 28] },
    { type: 'shrub_small', position: [28, 0, -28] },
    { type: 'shrub_small', position: [48, 0, 15] },
    { type: 'shrub_medium', position: [-28, 0, -18] },
    { type: 'shrub_medium', position: [18, 0, 22] },
    { type: 'shrub_medium', position: [42, 0, -22] },
  ],
  
  goals: [
    { type: 'escape', target: 1, description: 'Escape through the forest!', reward: 4000 },
    { type: 'score', target: 25000, description: 'Score 25,000 stonks', reward: 3000 },
    { type: 'grind', target: 5, description: 'Grind 5 fallen logs', reward: 2000 },
    { type: 'combo', target: 8000, description: 'Land an 8,000 point combo', reward: 2500 },
  ],
  
  timeLimit: 120,
  
  introDialogue: [
    'TONY: Into the forest! These wheels can handle anything!',
    'FBI AGENT: Don\'t let him escape! After him!',
    'TONY: Tricks give me speed boosts - time to show off!'
  ]
};

const LEVEL_7_TRAINYARD: StoryLevelData = {
  id: 'story_7_trainyard',
  chapter: 3,
  storyOrder: 7,
  nextLevel: 'story_8_rooftops',
  name: 'Train Yard Takeoff',
  subtitle: 'End of the Line',
  description: 'Navigate the abandoned train yard. Grind the rails to catch a departing freight train!',
  
  skyColor: '#2c3e50',
  skyColorTop: '#1a252f',
  skyColorBottom: '#34495e',
  fogColor: '#3d566e',
  fogNear: 30,
  fogFar: 100,
  ambientLight: 0.35,
  sunIntensity: 0.4,
  
  groundSize: 200,
  groundColor: '#3a3a3a',  // Gravel
  
  spawnPoint: {
    position: [-80, 0.5, 0],
    rotation: 90
  },
  
  bounds: {
    minX: -95,
    maxX: 95,
    minZ: -50,
    maxZ: 50
  },
  
  checkpoints: [
    {
      position: [0, 0.5, 0],
      rotation: 90,
      name: 'Past the yard office',
      dialogue: ['TONY: There\'s a freight train starting to move!']
    },
    {
      position: [80, 3, 0],
      rotation: 90,
      name: 'Caught the train!',
      dialogue: [
        'TONY: Made it! This train will take me far away...',
        'TONY: Wait, where is this thing going?'
      ]
    }
  ],
  
  objects: [
    // Railroad tracks (long grindable rails!)
    { type: 'rail', position: [0, 0, -30], params: { length: 180 } },
    { type: 'rail', position: [0, 0, -20], params: { length: 180 } },
    { type: 'rail', position: [0, 0, 0], params: { length: 180 } },
    { type: 'rail', position: [0, 0, 20], params: { length: 180 } },
    { type: 'rail', position: [0, 0, 30], params: { length: 180 } },
    
    // Train cars (obstacles/platforms)
    { type: 'fun_box', position: [-60, 0, -25], params: { width: 20, depth: 4, height: 3 } },
    { type: 'fun_box', position: [-35, 0, -25], params: { width: 15, depth: 4, height: 3 } },
    { type: 'fun_box', position: [10, 0, 25], params: { width: 25, depth: 4, height: 3 } },
    { type: 'fun_box', position: [45, 0, 25], params: { width: 20, depth: 4, height: 3 } },
    
    // Yard office building
    { type: 'building_small', position: [-20, 0, 40], params: { width: 10, depth: 8, height: 6 } },
    
    // Ramps (loading docks)
    { type: 'ramp', position: [-70, 0, 10], rotation: [0, 90, 0] },
    { type: 'ramp', position: [-50, 0, -10], rotation: [0, -90, 0] },
    { type: 'ramp', position: [20, 0, -15], rotation: [0, 45, 0] },
    { type: 'ramp', position: [50, 0, 10], rotation: [0, -45, 0] },
    
    // Quarter pipes (rail crossings)
    { type: 'quarter_pipe_small', position: [-30, 0, 0], rotation: [0, 90, 0] },
    { type: 'quarter_pipe_small', position: [30, 0, 0], rotation: [0, -90, 0] },
    
    // Barrels and crates
    { type: 'trash_can', position: [-55, 0, 35] },
    { type: 'trash_can', position: [-45, 0, 35] },
    { type: 'trash_can', position: [25, 0, -40] },
    { type: 'trash_can', position: [35, 0, -40] },
    
    // Exit point - moving train (represented as platform to reach)
    { type: 'fun_box', position: [80, 0, 0], params: { width: 15, depth: 8, height: 4 } },
    { type: 'ramp', position: [70, 0, 0], rotation: [0, 90, 0] },
  ],
  
  collectibles: [
    { type: 'money', position: [-50, 4, -25], value: 2000 },
    { type: 'money', position: [20, 4, 25], value: 2000 },
    { type: 'special', position: [0, 2, 0], value: 5000 },
  ],
  
  goals: [
    { type: 'escape', target: 1, description: 'Catch the freight train!', reward: 5000 },
    { type: 'score', target: 30000, description: 'Score 30,000 stonks', reward: 4000 },
    { type: 'grind', target: 15, description: 'Grind 15 railroad tracks', reward: 3000 },
    { type: 'combo', target: 12000, description: 'Land a 12,000 point combo', reward: 3500 },
  ],
  
  timeLimit: 180,
  
  introDialogue: [
    'TONY: An old train yard! Perfect place to lose them.',
    'TONY: Wait... is that freight train starting to move?',
    'TONY: If I can catch it, I\'m home free!'
  ]
};

const LEVEL_8_ROOFTOPS: StoryLevelData = {
  id: 'story_8_rooftops',
  chapter: 3,
  storyOrder: 8,
  nextLevel: 'story_9_finale',
  name: 'Rooftop Run',
  subtitle: 'Sky High Stakes',
  description: 'The train dropped you in the city. Escape across the rooftops to the helipad!',
  
  skyColor: '#1a1a2e',
  skyColorTop: '#0a0a15',
  skyColorBottom: '#2a2a4e',
  fogColor: '#1a1a2e',
  fogNear: 40,
  fogFar: 150,
  ambientLight: 0.3,
  sunIntensity: 0.2,
  
  groundSize: 200,
  groundColor: '#333333',
  
  spawnPoint: {
    position: [-80, 20, 0],
    rotation: 90
  },
  
  bounds: {
    minX: -95,
    maxX: 95,
    minZ: -50,
    maxZ: 50
  },
  
  checkpoints: [
    {
      position: [0, 25, 0],
      rotation: 90,
      name: 'Halfway across!',
      dialogue: ['TONY: I can see the helipad! Just a few more jumps!']
    },
    {
      position: [80, 30, 0],
      rotation: 90,
      name: 'Reached the helipad!',
      dialogue: [
        'TONY: The helicopter is waiting! Time for the finale!',
        'PILOT: Mr. Stonks! We\'ve got one last obstacle...'
      ]
    }
  ],
  
  objects: [
    // Rooftop platforms (varying heights)
    { type: 'fun_box', position: [-75, 18, 0], params: { width: 20, depth: 30, height: 2 } },
    { type: 'fun_box', position: [-50, 20, -20], params: { width: 15, depth: 20, height: 2 } },
    { type: 'fun_box', position: [-50, 22, 20], params: { width: 18, depth: 15, height: 2 } },
    { type: 'fun_box', position: [-25, 23, 0], params: { width: 25, depth: 25, height: 2 } },
    { type: 'fun_box', position: [0, 25, -15], params: { width: 20, depth: 20, height: 2 } },
    { type: 'fun_box', position: [0, 24, 20], params: { width: 15, depth: 15, height: 2 } },
    { type: 'fun_box', position: [30, 26, 0], params: { width: 30, depth: 30, height: 2 } },
    { type: 'fun_box', position: [60, 28, -10], params: { width: 20, depth: 25, height: 2 } },
    { type: 'fun_box', position: [80, 30, 0], params: { width: 25, depth: 25, height: 2 } },
    
    // Railings (grindable)
    { type: 'rail', position: [-65, 20, -12], params: { length: 15 } },
    { type: 'rail', position: [-50, 22, -8], params: { length: 12 }, rotation: [0, 90, 0] },
    { type: 'rail', position: [-25, 25, 10], params: { length: 18 } },
    { type: 'rail', position: [0, 27, 5], params: { length: 15 }, rotation: [0, 45, 0] },
    { type: 'rail', position: [30, 28, -12], params: { length: 20 } },
    { type: 'rail', position: [55, 30, 0], params: { length: 15 }, rotation: [0, 90, 0] },
    
    // Ramps for gaps
    { type: 'ramp', position: [-60, 18, 0], rotation: [0, 90, 0] },
    { type: 'ramp', position: [-38, 20, -15], rotation: [0, 45, 0] },
    { type: 'ramp', position: [-38, 22, 15], rotation: [0, -30, 0] },
    { type: 'ramp', position: [-12, 23, 0], rotation: [0, 90, 0] },
    { type: 'ramp', position: [12, 25, 10], rotation: [0, 60, 0] },
    { type: 'ramp', position: [45, 26, -5], rotation: [0, 90, 0] },
    { type: 'ramp', position: [70, 28, 5], rotation: [0, 75, 0] },
    
    // AC units and vents (obstacles)
    { type: 'fun_box', position: [-70, 20, 10], params: { width: 3, depth: 3, height: 1.5 } },
    { type: 'fun_box', position: [-20, 25, -8], params: { width: 4, depth: 4, height: 2 } },
    { type: 'fun_box', position: [35, 28, 10], params: { width: 3, depth: 3, height: 1.5 } },
    
    // Quarter pipes (vent housings)
    { type: 'quarter_pipe_small', position: [-30, 23, -10], rotation: [0, 0, 0] },
    { type: 'quarter_pipe_small', position: [20, 26, 0], rotation: [0, 90, 0] },
  ],
  
  collectibles: [
    { type: 'money', position: [-50, 24, 0], value: 3000 },
    { type: 'money', position: [0, 28, 0], value: 3000 },
    { type: 'money', position: [50, 32, 0], value: 3000 },
    { type: 'special', position: [30, 30, 0], value: 7500 },
  ],
  
  goals: [
    { type: 'escape', target: 1, description: 'Reach the helipad!', reward: 6000 },
    { type: 'score', target: 40000, description: 'Score 40,000 stonks', reward: 5000 },
    { type: 'grind', target: 10, description: 'Grind 10 rooftop rails', reward: 3500 },
    { type: 'combo', target: 15000, description: 'Land a 15,000 point combo', reward: 4000 },
  ],
  
  timeLimit: 200,
  
  introDialogue: [
    'TONY: The city skyline! The helicopter is on that far building!',
    'TONY: Time for some rooftop acrobatics!',
    '🚁 PILOT: *radio* Mr. Stonks, hurry! They\'re closing in!'
  ]
};

const LEVEL_9_FINALE: StoryLevelData = {
  id: 'story_9_finale',
  chapter: 3,
  storyOrder: 9,
  name: 'The Great Escape',
  subtitle: 'Freedom at Last',
  description: 'One final gauntlet! Make it to the helicopter before the SEC catches up!',
  
  hasChaseMechanic: true,
  chaseSpeed: 12,  // Faster chase in finale
  
  skyColor: '#ff6b35',
  skyColorTop: '#ff4500',
  skyColorBottom: '#ffa500',
  fogColor: '#ff8c42',
  fogNear: 40,
  fogFar: 120,
  ambientLight: 0.6,
  sunIntensity: 1.0,
  
  groundSize: 150,
  groundColor: '#444444',
  
  spawnPoint: {
    position: [-60, 0.5, 0],
    rotation: 90
  },
  
  bounds: {
    minX: -70,
    maxX: 70,
    minZ: -40,
    maxZ: 40
  },
  
  checkpoints: [
    {
      position: [60, 5, 0],
      rotation: 90,
      name: 'FREEDOM!',
      dialogue: [
        '🎉 TONY: I DID IT! STONKS TO THE MOON!',
        'SEC AGENT: He got away... again.',
        '🚁 PILOT: Where to, Mr. Stonks?',
        'TONY: Somewhere with no extradition treaty... and beaches!',
        '📰 EPILOGUE: Tony Stonks was never seen again...',
        '📈 ...but his legendary escape became a viral video,',
        '💰 ...and STONKS coin went up 10,000%.',
        '🏝️ THE END... ?'
      ]
    }
  ],
  
  objects: [
    // Epic finale course - everything at once!
    
    // Opening section - car obstacles
    { type: 'car', position: [-45, 0, -15], rotation: [0, 30, 0] },
    { type: 'car', position: [-45, 0, 15], rotation: [0, -30, 0] },
    { type: 'car', position: [-30, 0, 0], rotation: [0, 0, 0] },
    
    // Rails section
    { type: 'rail', position: [-20, 0, -20], params: { length: 25 } },
    { type: 'rail', position: [-20, 0, 20], params: { length: 25 } },
    { type: 'rail', position: [-20, 0, 0], params: { length: 30 } },
    
    // Jump section
    { type: 'ramp', position: [0, 0, -15], rotation: [0, 45, 0] },
    { type: 'ramp', position: [0, 0, 15], rotation: [0, -45, 0] },
    { type: 'quarter_pipe_med', position: [0, 0, 0], rotation: [0, 90, 0] },
    
    // Obstacle gauntlet
    { type: 'barrier', position: [15, 0, -10], params: { length: 8 } },
    { type: 'barrier', position: [15, 0, 10], params: { length: 8 } },
    { type: 'cone', position: [20, 0, -5] },
    { type: 'cone', position: [20, 0, 0] },
    { type: 'cone', position: [20, 0, 5] },
    { type: 'trash_can', position: [25, 0, -15] },
    { type: 'trash_can', position: [25, 0, 15] },
    
    // Final approach - big ramp to helicopter
    { type: 'fun_box', position: [40, 0, 0], params: { width: 15, depth: 20, height: 2 } },
    { type: 'rail', position: [40, 2, -8], params: { length: 15 } },
    { type: 'rail', position: [40, 2, 8], params: { length: 15 } },
    { type: 'ramp', position: [50, 2, 0], rotation: [0, 90, 0] },
    
    // Helicopter platform
    { type: 'fun_box', position: [60, 4, 0], params: { width: 15, depth: 15, height: 1 } },
  ],
  
  collectibles: [
    { type: 'money', position: [-30, 1, -15], value: 2500 },
    { type: 'money', position: [-30, 1, 15], value: 2500 },
    { type: 'money', position: [0, 3, 0], value: 5000 },
    { type: 'money', position: [40, 5, 0], value: 5000 },
    { type: 'special', position: [60, 7, 0], value: 10000 },
  ],
  
  goals: [
    { type: 'escape', target: 1, description: 'REACH THE HELICOPTER!', reward: 10000 },
    { type: 'score', target: 50000, description: 'Score 50,000 stonks (finale bonus!)', reward: 7500 },
    { type: 'combo', target: 20000, description: 'Land a LEGENDARY 20K combo!', reward: 5000 },
    { type: 'time', target: 60, description: 'Escape in under 60 seconds!', reward: 8000 },
  ],
  
  timeLimit: 120,
  
  introDialogue: [
    '🚁 PILOT: Mr. Stonks! They\'re right behind you!',
    'SEC AGENT: This is your last chance, Stonks! Give up!',
    'TONY: NEVER! DIAMOND HANDS FOREVER! 💎🙌',
    'TONY: ONE LAST RIDE!'
  ]
};

// All story levels
export const STORY_LEVELS: StoryLevelData[] = [
  LEVEL_1_OFFICE,
  LEVEL_2_STAIRWELL,
  LEVEL_3_LOBBY,
  LEVEL_4_HIGHWAY,
  LEVEL_5_HOME,
  LEVEL_6_FOREST,
  LEVEL_7_TRAINYARD,
  LEVEL_8_ROOFTOPS,
  LEVEL_9_FINALE
];

// Get story level by ID
export function getStoryLevelById(id: string): StoryLevelData | undefined {
  return STORY_LEVELS.find(level => level.id === id);
}

// Get story levels by chapter
export function getStoryLevelsByChapter(chapter: number): StoryLevelData[] {
  return STORY_LEVELS.filter(level => level.chapter === chapter).sort((a, b) => a.storyOrder - b.storyOrder);
}

// Get next story level
export function getNextStoryLevel(currentId: string): StoryLevelData | undefined {
  const current = getStoryLevelById(currentId);
  if (!current?.nextLevel) return undefined;
  return getStoryLevelById(current.nextLevel);
}
