/**
 * Chase Mechanic
 * Agents chase the player - do tricks to gain speed boosts and stay ahead!
 */

import * as THREE from 'three';

export interface ChaseState {
  isActive: boolean;
  chaseDistance: number;    // How close agents are (0 = caught, 100 = safe)
  agentSpeed: number;       // Base chase speed
  playerSpeedBoost: number; // Current speed boost from tricks
  warningLevel: 'safe' | 'warning' | 'danger' | 'critical';
}

export interface ChaseCallbacks {
  onCaught?: () => void;
  onWarningChange?: (level: ChaseState['warningLevel']) => void;
  onSpeedBoost?: (amount: number) => void;
}

export class ChaseMechanic {
  private isActive = false;
  private chaseDistance = 50;  // Start halfway
  private agentSpeed = 8;
  private playerSpeedBoost = 0;
  private speedBoostDecay = 2;  // Boost decays per second
  private callbacks: ChaseCallbacks;
  private lastWarningLevel: ChaseState['warningLevel'] = 'safe';
  
  // Visual representation
  private agentGroup: THREE.Group | null = null;
  
  constructor(callbacks: ChaseCallbacks = {}) {
    this.callbacks = callbacks;
  }
  
  /**
   * Start the chase
   */
  start(agentSpeed: number = 8, startDistance: number = 50): void {
    this.isActive = true;
    this.agentSpeed = agentSpeed;
    this.chaseDistance = startDistance;
    this.playerSpeedBoost = 0;
    this.lastWarningLevel = 'safe';
  }
  
  /**
   * Stop the chase
   */
  stop(): void {
    this.isActive = false;
    this.playerSpeedBoost = 0;
  }
  
  /**
   * Add speed boost (from tricks)
   */
  addSpeedBoost(amount: number): void {
    this.playerSpeedBoost = Math.min(20, this.playerSpeedBoost + amount);
    this.callbacks.onSpeedBoost?.(this.playerSpeedBoost);
  }
  
  /**
   * Update chase state
   */
  update(dt: number, playerSpeed: number, _playerPosition: THREE.Vector3): void {
    if (!this.isActive) return;
    
    // Decay speed boost
    this.playerSpeedBoost = Math.max(0, this.playerSpeedBoost - this.speedBoostDecay * dt);
    
    // Calculate effective speeds
    const effectivePlayerSpeed = playerSpeed + this.playerSpeedBoost;
    const effectiveAgentSpeed = this.agentSpeed;
    
    // Update chase distance
    // Positive = player ahead, negative = agents catching up
    const speedDifference = effectivePlayerSpeed - effectiveAgentSpeed;
    this.chaseDistance = Math.max(0, Math.min(100, this.chaseDistance + speedDifference * dt * 2));
    
    // Check if caught
    if (this.chaseDistance <= 0) {
      this.callbacks.onCaught?.();
      this.isActive = false;
      return;
    }
    
    // Update warning level
    const newWarningLevel = this.getWarningLevel();
    if (newWarningLevel !== this.lastWarningLevel) {
      this.lastWarningLevel = newWarningLevel;
      this.callbacks.onWarningChange?.(newWarningLevel);
    }
  }
  
  /**
   * Get current warning level based on distance
   */
  private getWarningLevel(): ChaseState['warningLevel'] {
    if (this.chaseDistance > 70) return 'safe';
    if (this.chaseDistance > 40) return 'warning';
    if (this.chaseDistance > 20) return 'danger';
    return 'critical';
  }
  
  /**
   * Get current chase state
   */
  getState(): ChaseState {
    return {
      isActive: this.isActive,
      chaseDistance: this.chaseDistance,
      agentSpeed: this.agentSpeed,
      playerSpeedBoost: this.playerSpeedBoost,
      warningLevel: this.lastWarningLevel
    };
  }
  
  /**
   * Check if chase is active
   */
  isChaseActive(): boolean {
    return this.isActive;
  }
  
  /**
   * Get distance (0-100)
   */
  getDistance(): number {
    return this.chaseDistance;
  }
  
  /**
   * Create visual agents (simple placeholder for now)
   */
  createVisuals(scene: THREE.Scene): THREE.Group {
    this.agentGroup = new THREE.Group();
    
    // Simple agent representations - dark figures
    const agentMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      emissive: 0x220000,
      emissiveIntensity: 0.3
    });
    
    // Create 3 agents in formation
    for (let i = 0; i < 3; i++) {
      const agent = new THREE.Group();
      
      // Body
      const bodyGeom = new THREE.CapsuleGeometry(0.3, 1.2, 4, 8);
      const body = new THREE.Mesh(bodyGeom, agentMaterial);
      body.position.y = 1;
      agent.add(body);
      
      // Head
      const headGeom = new THREE.SphereGeometry(0.25, 8, 8);
      const head = new THREE.Mesh(headGeom, agentMaterial);
      head.position.y = 1.9;
      agent.add(head);
      
      // Position in V formation
      const angle = (i - 1) * 0.5; // -0.5, 0, 0.5
      agent.position.set(angle * 2, 0, i === 1 ? -2 : 0);
      
      this.agentGroup.add(agent);
    }
    
    // Add red glow/flashlight effect
    const spotlight = new THREE.SpotLight(0xff0000, 1, 20, Math.PI / 4, 0.5);
    spotlight.position.set(0, 2, -3);
    spotlight.target.position.set(0, 0, 5);
    this.agentGroup.add(spotlight);
    this.agentGroup.add(spotlight.target);
    
    scene.add(this.agentGroup);
    return this.agentGroup;
  }
  
  /**
   * Update visual position based on player and chase distance
   */
  updateVisuals(playerPosition: THREE.Vector3, playerRotation: number): void {
    if (!this.agentGroup) return;
    
    // Calculate agent position behind player
    const behindDistance = 5 + (100 - this.chaseDistance) * 0.3; // Closer when chase is tight
    
    const agentX = playerPosition.x - Math.sin(playerRotation) * behindDistance;
    const agentZ = playerPosition.z - Math.cos(playerRotation) * behindDistance;
    
    this.agentGroup.position.set(agentX, playerPosition.y, agentZ);
    this.agentGroup.rotation.y = playerRotation;
    
    // Animate agents - bobbing motion
    const time = Date.now() * 0.003;
    this.agentGroup.children.forEach((agent, i) => {
      if (agent instanceof THREE.Group) {
        agent.position.y = Math.sin(time + i * 0.5) * 0.1;
      }
    });
  }
  
  /**
   * Remove visuals from scene
   */
  removeVisuals(scene: THREE.Scene): void {
    if (this.agentGroup) {
      scene.remove(this.agentGroup);
      this.agentGroup = null;
    }
  }
}
