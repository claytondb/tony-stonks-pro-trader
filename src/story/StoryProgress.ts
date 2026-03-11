/**
 * Story Progress System
 * Tracks player progression through story mode, currency, and upgrades
 */

export interface PlayerUpgrades {
  speed: number;        // 0-5 levels
  jumpHeight: number;   // 0-5 levels
  spinSpeed: number;    // 0-5 levels
  grindBalance: number; // 0-5 levels
  manualBalance: number; // 0-5 levels
}

export interface PlayerCosmetics {
  tieColor: string;           // hex color
  tiePattern: 'solid' | 'striped' | 'dots' | 'diamond';
  shirtColor: string;
  pantsColor: string;
  shoesColor: string;
  chairUpholstery: string;
}

export interface LevelProgress {
  unlocked: boolean;
  completed: boolean;
  bestScore: number;
  bestTime: number;
  stonksEarned: number;
  checkpointReached: number; // -1 = none, 0+ = checkpoint index
}

export interface StoryState {
  currentChapter: number;
  currentLevel: string;
  totalStonks: number;
  lifetimeStonks: number;  // Never decreases (for unlocks)
  upgrades: PlayerUpgrades;
  cosmetics: PlayerCosmetics;
  levelProgress: Record<string, LevelProgress>;
  storyFlags: Record<string, boolean>;  // For story branching
}

const STORAGE_KEY = 'tony-stonks-story-progress';

// Default starting state
function getDefaultState(): StoryState {
  return {
    currentChapter: 1,
    currentLevel: 'story_1_office',
    totalStonks: 0,
    lifetimeStonks: 0,
    upgrades: {
      speed: 0,
      jumpHeight: 0,
      spinSpeed: 0,
      grindBalance: 0,
      manualBalance: 0
    },
    cosmetics: {
      tieColor: '#ff0000',      // Red tie
      tiePattern: 'solid',
      shirtColor: '#ffffff',    // White shirt
      pantsColor: '#2a2a2a',    // Dark pants
      shoesColor: '#000000',    // Black shoes
      chairUpholstery: '#1a1a2e' // Dark blue chair
    },
    levelProgress: {
      // Level 1 always unlocked
      'story_1_office': {
        unlocked: true,
        completed: false,
        bestScore: 0,
        bestTime: 0,
        stonksEarned: 0,
        checkpointReached: -1
      }
    },
    storyFlags: {}
  };
}

// Upgrade costs (stonks)
export const UPGRADE_COSTS: Record<keyof PlayerUpgrades, number[]> = {
  speed:        [1000, 2500, 5000, 10000, 25000],
  jumpHeight:   [1000, 2500, 5000, 10000, 25000],
  spinSpeed:    [750, 2000, 4000, 8000, 20000],
  grindBalance: [1500, 3000, 6000, 12000, 30000],
  manualBalance:[1500, 3000, 6000, 12000, 30000]
};

// Upgrade effects (multipliers or additions)
export const UPGRADE_EFFECTS: Record<keyof PlayerUpgrades, number[]> = {
  speed:        [1.0, 1.1, 1.2, 1.35, 1.5, 1.75],    // Speed multiplier
  jumpHeight:   [1.0, 1.1, 1.2, 1.35, 1.5, 1.75],    // Jump multiplier
  spinSpeed:    [1.0, 1.15, 1.3, 1.5, 1.75, 2.0],    // Spin speed multiplier
  grindBalance: [0.5, 0.4, 0.3, 0.22, 0.15, 0.1],    // Balance drift (lower = easier)
  manualBalance:[0.5, 0.4, 0.3, 0.22, 0.15, 0.1]     // Balance drift (lower = easier)
};

// Cosmetic costs
export const COSMETIC_COSTS = {
  tieColor: 500,
  tiePattern: 1000,
  shirtColor: 750,
  pantsColor: 750,
  shoesColor: 500,
  chairUpholstery: 2000
};

/**
 * Story Progress Manager - singleton
 */
class StoryProgressManager {
  private state: StoryState;
  
  constructor() {
    this.state = this.load();
  }
  
  /**
   * Load progress from localStorage
   */
  private load(): StoryState {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to handle new fields
        return { ...getDefaultState(), ...parsed };
      }
    } catch (e) {
      console.warn('Failed to load story progress:', e);
    }
    return getDefaultState();
  }
  
  /**
   * Save progress to localStorage
   */
  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('Failed to save story progress:', e);
    }
  }
  
  /**
   * Reset all progress (new game)
   */
  reset(): void {
    this.state = getDefaultState();
    this.save();
  }
  
  /**
   * Get current state
   */
  getState(): StoryState {
    return { ...this.state };
  }
  
  /**
   * Get total stonks (currency)
   */
  getStonks(): number {
    return this.state.totalStonks;
  }
  
  /**
   * Add stonks (from tricks, level completion, etc.)
   */
  addStonks(amount: number): void {
    this.state.totalStonks += amount;
    this.state.lifetimeStonks += amount;
    this.save();
  }
  
  /**
   * Spend stonks (returns false if not enough)
   */
  spendStonks(amount: number): boolean {
    if (this.state.totalStonks < amount) return false;
    this.state.totalStonks -= amount;
    this.save();
    return true;
  }
  
  /**
   * Get upgrade level
   */
  getUpgradeLevel(upgrade: keyof PlayerUpgrades): number {
    return this.state.upgrades[upgrade];
  }
  
  /**
   * Get upgrade effect value
   */
  getUpgradeEffect(upgrade: keyof PlayerUpgrades): number {
    const level = this.state.upgrades[upgrade];
    return UPGRADE_EFFECTS[upgrade][level];
  }
  
  /**
   * Get cost for next upgrade level
   */
  getUpgradeCost(upgrade: keyof PlayerUpgrades): number | null {
    const level = this.state.upgrades[upgrade];
    if (level >= 5) return null; // Max level
    return UPGRADE_COSTS[upgrade][level];
  }
  
  /**
   * Purchase upgrade (returns false if can't afford or max level)
   */
  purchaseUpgrade(upgrade: keyof PlayerUpgrades): boolean {
    const cost = this.getUpgradeCost(upgrade);
    if (cost === null) return false;
    if (!this.spendStonks(cost)) return false;
    
    this.state.upgrades[upgrade]++;
    this.save();
    return true;
  }
  
  /**
   * Get cosmetic value
   */
  getCosmetic<K extends keyof PlayerCosmetics>(key: K): PlayerCosmetics[K] {
    return this.state.cosmetics[key];
  }
  
  /**
   * Set cosmetic (and spend stonks)
   */
  setCosmetic<K extends keyof PlayerCosmetics>(key: K, value: PlayerCosmetics[K]): boolean {
    const cost = COSMETIC_COSTS[key as keyof typeof COSMETIC_COSTS] || 0;
    if (cost > 0 && !this.spendStonks(cost)) return false;
    
    this.state.cosmetics[key] = value;
    this.save();
    return true;
  }
  
  /**
   * Check if level is unlocked
   */
  isLevelUnlocked(levelId: string): boolean {
    return this.state.levelProgress[levelId]?.unlocked ?? false;
  }
  
  /**
   * Check if level is completed
   */
  isLevelCompleted(levelId: string): boolean {
    return this.state.levelProgress[levelId]?.completed ?? false;
  }
  
  /**
   * Unlock a level
   */
  unlockLevel(levelId: string): void {
    if (!this.state.levelProgress[levelId]) {
      this.state.levelProgress[levelId] = {
        unlocked: true,
        completed: false,
        bestScore: 0,
        bestTime: 0,
        stonksEarned: 0,
        checkpointReached: -1
      };
    } else {
      this.state.levelProgress[levelId].unlocked = true;
    }
    this.save();
  }
  
  /**
   * Complete a level and unlock next
   */
  completeLevel(levelId: string, score: number, time: number, stonksEarned: number, nextLevelId?: string): void {
    if (!this.state.levelProgress[levelId]) {
      this.state.levelProgress[levelId] = {
        unlocked: true,
        completed: false,
        bestScore: 0,
        bestTime: 0,
        stonksEarned: 0,
        checkpointReached: -1
      };
    }
    
    const progress = this.state.levelProgress[levelId];
    progress.completed = true;
    
    if (score > progress.bestScore) {
      progress.bestScore = score;
    }
    if (time < progress.bestTime || progress.bestTime === 0) {
      progress.bestTime = time;
    }
    progress.stonksEarned += stonksEarned;
    
    // Unlock next level
    if (nextLevelId) {
      this.unlockLevel(nextLevelId);
    }
    
    this.save();
  }
  
  /**
   * Save checkpoint progress
   */
  setCheckpoint(levelId: string, checkpointIndex: number): void {
    if (!this.state.levelProgress[levelId]) {
      this.state.levelProgress[levelId] = {
        unlocked: true,
        completed: false,
        bestScore: 0,
        bestTime: 0,
        stonksEarned: 0,
        checkpointReached: checkpointIndex
      };
    } else {
      const current = this.state.levelProgress[levelId].checkpointReached;
      if (checkpointIndex > current) {
        this.state.levelProgress[levelId].checkpointReached = checkpointIndex;
      }
    }
    this.save();
  }
  
  /**
   * Get last checkpoint for level
   */
  getCheckpoint(levelId: string): number {
    return this.state.levelProgress[levelId]?.checkpointReached ?? -1;
  }
  
  /**
   * Set a story flag (for branching narrative)
   */
  setFlag(flag: string, value: boolean = true): void {
    this.state.storyFlags[flag] = value;
    this.save();
  }
  
  /**
   * Check a story flag
   */
  getFlag(flag: string): boolean {
    return this.state.storyFlags[flag] ?? false;
  }
  
  /**
   * Set current level (for continue)
   */
  setCurrentLevel(levelId: string): void {
    this.state.currentLevel = levelId;
    this.save();
  }
  
  /**
   * Get current level
   */
  getCurrentLevel(): string {
    return this.state.currentLevel;
  }
}

// Export singleton
export const storyProgress = new StoryProgressManager();
