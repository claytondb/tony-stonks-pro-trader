/**
 * Combo System
 * Tracks combos, multipliers, and scoring
 */

import { TrickDefinition } from './TrickRegistry';

export interface ComboTrick {
  trick: TrickDefinition;
  points: number;
  timestamp: number;
}

export interface ComboState {
  tricks: ComboTrick[];
  multiplier: number;
  totalPoints: number;
  isActive: boolean;
  timeRemaining: number;
}

export type ComboEventType = 'trick_added' | 'combo_landed' | 'combo_failed' | 'multiplier_changed';

export interface ComboEvent {
  type: ComboEventType;
  trick?: TrickDefinition;
  points?: number;
  multiplier?: number;
  totalScore?: number;
  tricks?: ComboTrick[];
}

type ComboListener = (event: ComboEvent) => void;

export class ComboSystem {
  private currentTricks: ComboTrick[] = [];
  private multiplier = 1;
  private totalPoints = 0;
  private comboTimer = 0;
  private maxComboTime = 2000; // ms to land/continue combo
  private isActive = false;
  
  // Track trick usage for repeat penalty
  private trickCounts: Map<string, number> = new Map();
  
  // Event listeners
  private listeners: ComboListener[] = [];
  
  /**
   * Add event listener
   */
  on(listener: ComboListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
  
  private emit(event: ComboEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
  
  /**
   * Add a trick to the current combo
   */
  addTrick(trick: TrickDefinition): void {
    // Count how many times this trick has been used
    const count = this.trickCounts.get(trick.id) || 0;
    this.trickCounts.set(trick.id, count + 1);
    
    // Apply repeat penalty (each repeat worth half of previous)
    const repeatPenalty = Math.pow(0.5, count);
    const points = Math.floor(trick.basePoints * repeatPenalty);
    
    // Add to combo
    const comboTrick: ComboTrick = {
      trick,
      points,
      timestamp: performance.now()
    };
    
    this.currentTricks.push(comboTrick);
    this.totalPoints += points;
    this.multiplier = this.currentTricks.length + 1;
    this.comboTimer = this.maxComboTime;
    this.isActive = true;
    
    this.emit({
      type: 'trick_added',
      trick,
      points,
      multiplier: this.multiplier,
      totalScore: this.getPotentialScore()
    });
    
    this.emit({
      type: 'multiplier_changed',
      multiplier: this.multiplier
    });
  }
  
  /**
   * Add points from grind (continuous)
   */
  addGrindPoints(pointsPerSecond: number, dt: number): void {
    const points = Math.floor(pointsPerSecond * dt);
    this.totalPoints += points;
    this.comboTimer = this.maxComboTime; // Reset timer while grinding
  }
  
  /**
   * Add points from manual (continuous)
   */
  addManualPoints(pointsPerSecond: number, dt: number): void {
    const points = Math.floor(pointsPerSecond * dt);
    this.totalPoints += points;
    this.comboTimer = this.maxComboTime; // Reset timer while manualing
  }
  
  /**
   * Update combo timer
   */
  update(dt: number): void {
    if (!this.isActive) return;
    
    this.comboTimer -= dt * 1000;
    
    // Combo timeout - auto-fail if timer runs out
    // (In practice, this is reset by landing, grinding, or manualing)
  }
  
  /**
   * Successfully land the combo
   */
  land(): number {
    if (!this.isActive) return 0;
    
    const finalScore = this.getPotentialScore();
    
    this.emit({
      type: 'combo_landed',
      totalScore: finalScore,
      multiplier: this.multiplier,
      tricks: [...this.currentTricks]
    });
    
    this.reset();
    return finalScore;
  }
  
  /**
   * Bail - lose all combo points
   */
  bail(): void {
    if (!this.isActive) return;
    
    this.emit({
      type: 'combo_failed',
      totalScore: this.getPotentialScore(),
      tricks: [...this.currentTricks]
    });
    
    this.reset();
  }
  
  /**
   * Reset combo state
   */
  reset(): void {
    this.currentTricks = [];
    this.multiplier = 1;
    this.totalPoints = 0;
    this.comboTimer = 0;
    this.isActive = false;
    this.trickCounts.clear();
  }
  
  /**
   * Get potential score (if landed now)
   */
  getPotentialScore(): number {
    return Math.floor(this.totalPoints * this.multiplier);
  }
  
  /**
   * Get current combo state
   */
  getState(): ComboState {
    return {
      tricks: [...this.currentTricks],
      multiplier: this.multiplier,
      totalPoints: this.totalPoints,
      isActive: this.isActive,
      timeRemaining: this.comboTimer
    };
  }
  
  /**
   * Check if combo is active
   */
  hasActiveCombo(): boolean {
    return this.isActive;
  }
  
  /**
   * Get current multiplier
   */
  getMultiplier(): number {
    return this.multiplier;
  }
  
  /**
   * Get last trick in combo
   */
  getLastTrick(): ComboTrick | null {
    return this.currentTricks[this.currentTricks.length - 1] || null;
  }
}
