/**
 * Editor Storage
 * Handles save/load to localStorage and JSON file export/import
 */

import { LevelData, LevelObject, ObjectType } from '../levels/LevelData';

export interface EditorLevelData {
  id: string;
  name: string;
  description: string;
  chapter: number;
  
  // Environment
  skyColor: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  ambientLight: number;
  sunIntensity: number;
  
  // Ground
  groundSize: number;
  groundColor: string;
  
  // Spawn
  spawnPoint: {
    position: [number, number, number];
    rotation: number;
  };
  
  // Bounds
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  
  // Objects
  objects: LevelObject[];
  
  // Metadata
  createdAt: number;
  updatedAt: number;
  version: number;
}

const STORAGE_KEY = 'tony-stonks-editor-levels';
const AUTOSAVE_KEY = 'tony-stonks-editor-autosave';

export class EditorStorage {
  /**
   * Create a new empty level
   */
  static createNewLevel(name: string = 'Untitled Level'): EditorLevelData {
    const id = `custom_${Date.now()}`;
    return {
      id,
      name,
      description: 'A custom level',
      chapter: 99, // Custom levels are chapter 99
      
      skyColor: '#87CEEB',
      fogColor: '#a0a0a0',
      fogNear: 30,
      fogFar: 100,
      ambientLight: 0.5,
      sunIntensity: 0.8,
      
      groundSize: 100,
      groundColor: '#555555',
      
      spawnPoint: {
        position: [0, 0.5, 0],
        rotation: 0
      },
      
      bounds: {
        minX: -48,
        maxX: 48,
        minZ: -48,
        maxZ: 48
      },
      
      objects: [],
      
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1
    };
  }
  
  /**
   * Get all saved levels from localStorage
   */
  static getSavedLevels(): EditorLevelData[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load saved levels:', e);
      return [];
    }
  }
  
  /**
   * Save a level to localStorage
   */
  static saveLevel(level: EditorLevelData): boolean {
    try {
      level.updatedAt = Date.now();
      level.version++;
      
      const levels = this.getSavedLevels();
      const existingIndex = levels.findIndex(l => l.id === level.id);
      
      if (existingIndex >= 0) {
        levels[existingIndex] = level;
      } else {
        levels.push(level);
      }
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
      return true;
    } catch (e) {
      console.error('Failed to save level:', e);
      return false;
    }
  }
  
  /**
   * Delete a level from localStorage
   */
  static deleteLevel(id: string): boolean {
    try {
      const levels = this.getSavedLevels();
      const filtered = levels.filter(l => l.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      return true;
    } catch (e) {
      console.error('Failed to delete level:', e);
      return false;
    }
  }
  
  /**
   * Autosave current working level
   */
  static autosave(level: EditorLevelData): void {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(level));
    } catch (e) {
      console.error('Autosave failed:', e);
    }
  }
  
  /**
   * Load autosaved level
   */
  static loadAutosave(): EditorLevelData | null {
    try {
      const data = localStorage.getItem(AUTOSAVE_KEY);
      if (!data) return null;
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  }
  
  /**
   * Clear autosave
   */
  static clearAutosave(): void {
    localStorage.removeItem(AUTOSAVE_KEY);
  }
  
  /**
   * Export level as downloadable JSON file
   */
  static exportLevel(level: EditorLevelData): void {
    const data = JSON.stringify(level, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${level.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  
  /**
   * Import level from JSON file
   */
  static async importLevel(file: File): Promise<EditorLevelData | null> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          
          // Validate required fields
          if (!data.objects || !Array.isArray(data.objects)) {
            console.error('Invalid level file: missing objects array');
            resolve(null);
            return;
          }
          
          // Generate new ID to avoid conflicts
          data.id = `imported_${Date.now()}`;
          data.createdAt = Date.now();
          data.updatedAt = Date.now();
          
          resolve(data as EditorLevelData);
        } catch (err) {
          console.error('Failed to parse level file:', err);
          resolve(null);
        }
      };
      
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });
  }
  
  /**
   * Convert EditorLevelData to LevelData (for use in game)
   */
  static toGameLevel(editorLevel: EditorLevelData): LevelData {
    return {
      id: editorLevel.id,
      chapter: editorLevel.chapter,
      name: editorLevel.name,
      subtitle: 'Custom Level',
      description: editorLevel.description,
      
      skyColor: editorLevel.skyColor,
      fogColor: editorLevel.fogColor,
      fogNear: editorLevel.fogNear,
      fogFar: editorLevel.fogFar,
      ambientLight: editorLevel.ambientLight,
      sunIntensity: editorLevel.sunIntensity,
      
      groundSize: editorLevel.groundSize,
      groundColor: editorLevel.groundColor,
      
      spawnPoint: editorLevel.spawnPoint,
      bounds: editorLevel.bounds,
      
      objects: editorLevel.objects,
      
      goals: [
        { type: 'score', target: 10000, description: 'Score 10,000 points' }
      ],
      
      timeLimit: 0 // No time limit for custom levels
    };
  }
}

/**
 * Object category definitions for the palette
 */
export interface ObjectCategory {
  name: string;
  icon: string;
  items: ObjectPaletteItem[];
}

export interface ObjectPaletteItem {
  type: ObjectType;
  name: string;
  description: string;
  icon: string;
  defaultParams?: Record<string, unknown>;
}

export const OBJECT_CATEGORIES: ObjectCategory[] = [
  {
    name: 'Rails & Grinds',
    icon: '🛤️',
    items: [
      { type: 'rail', name: 'Rail', description: 'Standard grindable rail', icon: '━', defaultParams: { length: 10 } },
      { type: 'rail_angled', name: 'Angled Rail', description: 'Descending grind rail', icon: '╲', defaultParams: { length: 10 } },
      { type: 'rail_curved', name: 'Curved Rail', description: 'Curved grind rail', icon: '⌒', defaultParams: { length: 10 } },
      { type: 'bench', name: 'Bench', description: 'Grindable park bench', icon: '🪑' },
    ]
  },
  {
    name: 'Ramps & Pipes',
    icon: '📐',
    items: [
      { type: 'ramp', name: 'Ramp', description: 'Launch ramp', icon: '⟋' },
      { type: 'quarter_pipe_small', name: 'Quarter Pipe (S)', description: 'Small curved vert ramp', icon: '⌓' },
      { type: 'quarter_pipe_med', name: 'Quarter Pipe (M)', description: 'Medium curved vert ramp', icon: '⌓' },
      { type: 'quarter_pipe_large', name: 'Quarter Pipe (L)', description: 'Large curved vert ramp', icon: '⌓' },
      { type: 'half_pipe', name: 'Half Pipe', description: 'Full half pipe', icon: '⏜', defaultParams: { width: 15, length: 20 } },
      { type: 'fun_box', name: 'Fun Box', description: 'Flat top with rails', icon: '▭', defaultParams: { width: 6, depth: 4, height: 0.8 } },
    ]
  },
  {
    name: 'Structures',
    icon: '🏢',
    items: [
      { type: 'stairs', name: 'Stairs', description: 'Stair set', icon: '📶', defaultParams: { steps: 5 } },
      { type: 'platform', name: 'Platform', description: 'Flat elevated platform', icon: '▬', defaultParams: { width: 5, depth: 5, height: 1 } },
      { type: 'wall', name: 'Wall', description: 'Solid wall barrier', icon: '🧱', defaultParams: { width: 5, height: 3 } },
    ]
  },
  {
    name: 'Office',
    icon: '🏢',
    items: [
      { type: 'desk', name: 'Desk', description: 'Office desk', icon: '🪑' },
      { type: 'cubicle', name: 'Cubicle', description: 'Office cubicle', icon: '📦', defaultParams: { width: 3, depth: 3 } },
      { type: 'water_cooler', name: 'Water Cooler', description: 'Office water cooler', icon: '🚰' },
      { type: 'elevator', name: 'Elevator', description: 'Elevator doors', icon: '🛗' },
      { type: 'escalator', name: 'Escalator', description: 'Moving stairs', icon: '📶' },
    ]
  },
  {
    name: 'Vehicles',
    icon: '🚗',
    items: [
      { type: 'car', name: 'Car', description: 'Parked car', icon: '🚗' },
    ]
  },
  {
    name: 'Street Props',
    icon: '🌳',
    items: [
      { type: 'planter', name: 'Planter', description: 'Planter with tree', icon: '🌳' },
      { type: 'trash_can', name: 'Trash Can', description: 'Metal trash can', icon: '🗑️' },
      { type: 'cone', name: 'Traffic Cone', description: 'Orange traffic cone', icon: '🔶' },
      { type: 'barrier', name: 'Barrier', description: 'Safety barrier', icon: '🚧', defaultParams: { length: 5 } },
    ]
  }
];
