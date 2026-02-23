/**
 * Trick Registry
 * Defines all tricks in the game
 */

export type TrickType = 'flip' | 'grab' | 'grind' | 'manual' | 'special';

export interface TrickDefinition {
  id: string;
  name: string;
  displayName: string;
  type: TrickType;
  basePoints: number;
  duration: number; // ms
  difficulty: number;
}

// All tricks in the game
const tricks: TrickDefinition[] = [
  // Flip tricks
  { id: 'kickflip', name: 'kickflip', displayName: 'Kickflip', type: 'flip', basePoints: 500, duration: 400, difficulty: 1 },
  { id: 'heelflip', name: 'heelflip', displayName: 'Heelflip', type: 'flip', basePoints: 500, duration: 400, difficulty: 1 },
  { id: 'pop_shove', name: 'pop_shove', displayName: 'Pop Shove-It', type: 'flip', basePoints: 400, duration: 350, difficulty: 1 },
  { id: 'fs_shove', name: 'fs_shove', displayName: 'FS Shove-It', type: 'flip', basePoints: 400, duration: 350, difficulty: 1 },
  { id: '360_flip', name: '360_flip', displayName: '360 Flip', type: 'flip', basePoints: 1000, duration: 500, difficulty: 2 },
  { id: 'hardflip', name: 'hardflip', displayName: 'Hardflip', type: 'flip', basePoints: 800, duration: 450, difficulty: 2 },
  { id: 'varial_flip', name: 'varial_flip', displayName: 'Varial Kickflip', type: 'flip', basePoints: 700, duration: 420, difficulty: 2 },
  { id: 'impossible', name: 'impossible', displayName: 'Impossible', type: 'flip', basePoints: 900, duration: 480, difficulty: 2 },
  
  // Chair-specific flips
  { id: 'swivel_flip', name: 'swivel_flip', displayName: 'Swivel Flip', type: 'flip', basePoints: 600, duration: 400, difficulty: 1 },
  { id: 'caster_kick', name: 'caster_kick', displayName: 'Caster Kick', type: 'flip', basePoints: 550, duration: 380, difficulty: 1 },
  { id: 'armrest_spin', name: 'armrest_spin', displayName: 'Armrest Spin', type: 'flip', basePoints: 750, duration: 450, difficulty: 2 },
  
  // Grab tricks
  { id: 'melon', name: 'melon', displayName: 'Melon', type: 'grab', basePoints: 400, duration: 0, difficulty: 1 },
  { id: 'indy', name: 'indy', displayName: 'Indy', type: 'grab', basePoints: 400, duration: 0, difficulty: 1 },
  { id: 'nosegrab', name: 'nosegrab', displayName: 'Nosegrab', type: 'grab', basePoints: 450, duration: 0, difficulty: 1 },
  { id: 'tailgrab', name: 'tailgrab', displayName: 'Tailgrab', type: 'grab', basePoints: 450, duration: 0, difficulty: 1 },
  { id: 'benihana', name: 'benihana', displayName: 'Benihana', type: 'grab', basePoints: 600, duration: 0, difficulty: 2 },
  { id: 'madonna', name: 'madonna', displayName: 'Madonna', type: 'grab', basePoints: 700, duration: 0, difficulty: 2 },
  { id: 'airwalk', name: 'airwalk', displayName: 'Airwalk', type: 'grab', basePoints: 800, duration: 0, difficulty: 2 },
  
  // Chair-specific grabs
  { id: 'coffee_mug', name: 'coffee_mug', displayName: 'Coffee Mug Grab', type: 'grab', basePoints: 500, duration: 0, difficulty: 1 },
  { id: 'keyboard_clutch', name: 'keyboard_clutch', displayName: 'Keyboard Clutch', type: 'grab', basePoints: 550, duration: 0, difficulty: 1 },
  { id: 'monitor_hug', name: 'monitor_hug', displayName: 'Monitor Hug', type: 'grab', basePoints: 600, duration: 0, difficulty: 2 },
  
  // Grind tricks
  { id: '50_50', name: '50_50', displayName: '50-50', type: 'grind', basePoints: 300, duration: 0, difficulty: 1 },
  { id: 'nosegrind', name: 'nosegrind', displayName: 'Nosegrind', type: 'grind', basePoints: 400, duration: 0, difficulty: 1 },
  { id: 'tailslide', name: 'tailslide', displayName: 'Tailslide', type: 'grind', basePoints: 400, duration: 0, difficulty: 1 },
  { id: 'smith', name: 'smith', displayName: 'Smith Grind', type: 'grind', basePoints: 500, duration: 0, difficulty: 2 },
  { id: 'feeble', name: 'feeble', displayName: 'Feeble Grind', type: 'grind', basePoints: 500, duration: 0, difficulty: 2 },
  { id: 'crooked', name: 'crooked', displayName: 'Crooked Grind', type: 'grind', basePoints: 550, duration: 0, difficulty: 2 },
  { id: 'bluntslide', name: 'bluntslide', displayName: 'Bluntslide', type: 'grind', basePoints: 600, duration: 0, difficulty: 2 },
  { id: 'boardslide', name: 'boardslide', displayName: 'Boardslide', type: 'grind', basePoints: 350, duration: 0, difficulty: 1 },
  
  // Manual tricks
  { id: 'manual', name: 'manual', displayName: 'Manual', type: 'manual', basePoints: 200, duration: 0, difficulty: 1 },
  { id: 'nose_manual', name: 'nose_manual', displayName: 'Nose Manual', type: 'manual', basePoints: 250, duration: 0, difficulty: 1 },
  
  // Special tricks
  { id: 'quarterly_report', name: 'quarterly_report', displayName: 'The Quarterly Report', type: 'special', basePoints: 5000, duration: 800, difficulty: 3 },
  { id: 'golden_parachute', name: 'golden_parachute', displayName: 'Golden Parachute', type: 'special', basePoints: 4000, duration: 700, difficulty: 3 },
  { id: 'hostile_takeover', name: 'hostile_takeover', displayName: 'Hostile Takeover', type: 'special', basePoints: 4500, duration: 750, difficulty: 3 },
  { id: 'pink_slip', name: 'pink_slip', displayName: 'Pink Slip', type: 'special', basePoints: 3000, duration: 500, difficulty: 3 },
];

// Create lookup map
const trickMap = new Map<string, TrickDefinition>();
for (const trick of tricks) {
  trickMap.set(trick.id, trick);
}

export const TrickRegistry = {
  get(id: string): TrickDefinition | undefined {
    return trickMap.get(id);
  },
  
  getAll(): TrickDefinition[] {
    return [...tricks];
  },
  
  getByType(type: TrickType): TrickDefinition[] {
    return tricks.filter(t => t.type === type);
  }
};
