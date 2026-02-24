/**
 * Grind System
 * Handles rail detection, snapping, and grinding physics
 */

import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from './PhysicsWorld';

export interface Rail {
  id: string;
  start: THREE.Vector3;
  end: THREE.Vector3;
  direction: THREE.Vector3;
  length: number;
  mesh?: THREE.Object3D;
}

export interface GrindState {
  isGrinding: boolean;
  rail: Rail | null;
  progress: number;      // 0-1 along rail
  direction: number;     // 1 = forward, -1 = backward
  balance: number;       // 0-1, 0.5 = centered
  speed: number;
  entrySpeed: number;
}

export class GrindSystem {
  private rails: Rail[] = [];
  private grindState: GrindState = {
    isGrinding: false,
    rail: null,
    progress: 0,
    direction: 1,
    balance: 0.5,
    speed: 0,
    entrySpeed: 0
  };
  
  // Cooldown to prevent immediate re-grinding
  private grindCooldown = 0;
  private readonly GRIND_COOLDOWN_TIME = 0.8;  // seconds before can grind again
  
  // Config
  private readonly SNAP_DISTANCE = 0.6;       // How close to rail to trigger grind
  private readonly SNAP_HEIGHT_TOLERANCE = 0.4; // Tight height check
  private readonly MIN_SPEED_TO_GRIND = 2.5;   // Min speed to start grinding
  private readonly GRIND_FRICTION = 0.995;     // Very little friction (was 0.98)
  private readonly BALANCE_DRIFT = 0.08;       // Slow balance drift
  private readonly BALANCE_CORRECTION = 4.0;   // Fast player correction
  private readonly RAIL_HEIGHT = 0.8;          // Height of rails
  private readonly MIN_GRIND_SPEED = 3.0;      // Don't go slower than this while grinding
  
  /**
   * Clear all registered rails
   */
  clearRails(): void {
    this.rails = [];
    this.forceEndGrind();
  }
  
  /**
   * Register a rail for grind detection
   */
  addRail(start: THREE.Vector3, end: THREE.Vector3, id?: string, mesh?: THREE.Object3D): Rail {
    const direction = new THREE.Vector3().subVectors(end, start).normalize();
    const length = start.distanceTo(end);
    
    const rail: Rail = {
      id: id || `rail_${this.rails.length}`,
      start: start.clone(),
      end: end.clone(),
      direction,
      length,
      mesh
    };
    
    this.rails.push(rail);
    return rail;
  }
  
  /**
   * Update cooldown timer
   */
  updateCooldown(dt: number): void {
    if (this.grindCooldown > 0) {
      this.grindCooldown -= dt;
    }
  }
  
  /**
   * Check if player can start grinding (automatic - no button required)
   */
  tryStartGrind(
    playerPos: THREE.Vector3,
    playerVel: THREE.Vector3,
    _grindPressed: boolean = true  // Keep param for compatibility but ignore it
  ): Rail | null {
    // Don't grind if already grinding or in cooldown
    if (this.grindState.isGrinding) return null;
    if (this.grindCooldown > 0) return null;
    
    const speed = new THREE.Vector3(playerVel.x, 0, playerVel.z).length();
    if (speed < this.MIN_SPEED_TO_GRIND) return null;
    
    // Find nearest rail
    let nearestRail: Rail | null = null;
    let nearestDist = this.SNAP_DISTANCE;
    let nearestProgress = 0;
    
    for (const rail of this.rails) {
      const result = this.getClosestPointOnRail(playerPos, rail);
      
      // Check horizontal distance
      const horizontalDist = new THREE.Vector2(
        playerPos.x - result.point.x,
        playerPos.z - result.point.z
      ).length();
      
      // Check height - player should be above or near rail height
      const heightDiff = Math.abs(playerPos.y - this.RAIL_HEIGHT);
      
      if (horizontalDist < nearestDist && heightDiff < this.SNAP_HEIGHT_TOLERANCE) {
        nearestDist = horizontalDist;
        nearestRail = rail;
        nearestProgress = result.progress;
      }
    }
    
    if (nearestRail) {
      // Determine grind direction based on velocity
      const velDir = new THREE.Vector3(playerVel.x, 0, playerVel.z).normalize();
      const dot = velDir.dot(nearestRail.direction);
      
      this.grindState = {
        isGrinding: true,
        rail: nearestRail,
        progress: nearestProgress,
        direction: dot >= 0 ? 1 : -1,
        balance: 0.5,
        speed: speed,
        entrySpeed: speed
      };
      
      return nearestRail;
    }
    
    return null;
  }
  
  /**
   * Update grinding physics
   */
  updateGrind(
    dt: number,
    balanceInput: number,  // -1 to 1 from player input (A/D keys)
    physics: PhysicsWorld,
    chairBody: RAPIER.RigidBody
  ): { position: THREE.Vector3; velocity: THREE.Vector3 } | null {
    if (!this.grindState.isGrinding || !this.grindState.rail) {
      return null;
    }
    
    const rail = this.grindState.rail;
    
    // Apply friction but maintain minimum speed
    this.grindState.speed *= this.GRIND_FRICTION;
    if (this.grindState.speed < this.MIN_GRIND_SPEED) {
      this.grindState.speed = this.MIN_GRIND_SPEED;
    }
    
    // Update progress along rail
    const progressDelta = (this.grindState.speed * dt / rail.length) * this.grindState.direction;
    this.grindState.progress += progressDelta;
    
    // Check if we've reached end of rail
    if (this.grindState.progress < 0 || this.grindState.progress > 1) {
      return this.endGrind(physics, chairBody);
    }
    
    // Update balance
    // Random drift
    const drift = (Math.random() - 0.5) * this.BALANCE_DRIFT * dt;
    this.grindState.balance += drift;
    
    // Player correction
    this.grindState.balance += balanceInput * this.BALANCE_CORRECTION * dt;
    
    // Clamp balance
    this.grindState.balance = Math.max(0, Math.min(1, this.grindState.balance));
    
    // Check for bail
    if (this.grindState.balance < 0.1 || this.grindState.balance > 0.9) {
      return this.bailFromGrind(physics, chairBody);
    }
    
    // Calculate position on rail
    const position = new THREE.Vector3().lerpVectors(
      rail.start,
      rail.end,
      this.grindState.progress
    );
    position.y = this.RAIL_HEIGHT + 0.3; // Slightly above rail
    
    // Calculate velocity (for camera and animations)
    const velocity = rail.direction.clone()
      .multiplyScalar(this.grindState.speed * this.grindState.direction);
    
    // Snap physics body to rail position
    physics.setPosition(chairBody, position);
    physics.setVelocity(chairBody, velocity);
    
    // Lock rotation to face along rail
    const angle = Math.atan2(
      rail.direction.x * this.grindState.direction,
      rail.direction.z * this.grindState.direction
    );
    physics.setRotationY(chairBody, angle);
    
    return { position, velocity };
  }
  
  /**
   * End grind normally (reached end of rail)
   */
  private endGrind(physics: PhysicsWorld, chairBody: RAPIER.RigidBody): { position: THREE.Vector3; velocity: THREE.Vector3 } {
    const rail = this.grindState.rail!;
    
    // Exit position at end of rail
    const exitPos = this.grindState.progress > 1 ? rail.end.clone() : rail.start.clone();
    exitPos.y = this.RAIL_HEIGHT + 0.3;
    
    // Exit velocity maintains speed along rail direction
    const exitVel = rail.direction.clone()
      .multiplyScalar(this.grindState.speed * this.grindState.direction);
    
    // Add slight upward velocity for pop off
    exitVel.y = 3;
    
    this.resetGrindState();
    
    physics.setPosition(chairBody, exitPos);
    physics.setVelocity(chairBody, exitVel);
    
    return { position: exitPos, velocity: exitVel };
  }
  
  /**
   * Bail from grind (lost balance)
   */
  private bailFromGrind(physics: PhysicsWorld, chairBody: RAPIER.RigidBody): { position: THREE.Vector3; velocity: THREE.Vector3 } {
    const rail = this.grindState.rail!;
    
    // Current position on rail
    const pos = new THREE.Vector3().lerpVectors(
      rail.start,
      rail.end,
      this.grindState.progress
    );
    pos.y = this.RAIL_HEIGHT;
    
    // Fall off to the side based on balance
    const sideDir = new THREE.Vector3()
      .crossVectors(rail.direction, new THREE.Vector3(0, 1, 0))
      .normalize();
    
    const fallSide = this.grindState.balance < 0.5 ? -1 : 1;
    const fallVel = sideDir.clone().multiplyScalar(3 * fallSide);
    fallVel.y = 2;
    
    this.resetGrindState();
    
    // Mark as bailed (for scoring/animation)
    physics.setVelocity(chairBody, fallVel);
    
    return { position: pos, velocity: fallVel };
  }
  
  /**
   * Reset grind state
   */
  private resetGrindState(): void {
    this.grindState = {
      isGrinding: false,
      rail: null,
      progress: 0,
      direction: 1,
      balance: 0.5,
      speed: 0,
      entrySpeed: 0
    };
    // Start cooldown to prevent immediate re-grinding
    this.grindCooldown = this.GRIND_COOLDOWN_TIME;
  }
  
  /**
   * Get closest point on a rail to a position
   */
  private getClosestPointOnRail(pos: THREE.Vector3, rail: Rail): { point: THREE.Vector3; progress: number } {
    const startToPos = new THREE.Vector3().subVectors(pos, rail.start);
    const startToEnd = new THREE.Vector3().subVectors(rail.end, rail.start);
    
    const progress = Math.max(0, Math.min(1,
      startToPos.dot(startToEnd) / startToEnd.lengthSq()
    ));
    
    const point = new THREE.Vector3().lerpVectors(rail.start, rail.end, progress);
    
    return { point, progress };
  }
  
  /**
   * Get current grind state
   */
  getState(): GrindState {
    return { ...this.grindState };
  }
  
  /**
   * Check if currently grinding
   */
  isGrinding(): boolean {
    return this.grindState.isGrinding;
  }
  
  /**
   * Force end grind (e.g., player jumped off)
   */
  forceEndGrind(): void {
    this.resetGrindState();
  }
  
  /**
   * Get all rails (for debugging)
   */
  getRails(): Rail[] {
    return this.rails;
  }
}
