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
  /** Grind surface height at the rail. Derived from start/end y. */
  height: number;
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
  //
  // The capture window is deliberately generous. At 12 m/s a chair covers 0.2 m per frame,
  // so a 0.6 m lateral window is roughly three frames of overlap for a perpendicular
  // approach and effectively zero for a shallow one — the level had 211 rails and the
  // player caught none of them. THPS is forgiving here on purpose: you aim at the rail and
  // the game meets you. Widening this is the single biggest difference between "there are
  // rails in the level" and "the level is made of lines".
  private readonly SNAP_DISTANCE = 1.5;        // Lateral capture radius, metres
  private readonly SNAP_HEIGHT_TOLERANCE = 0.85; // Vertical capture window, metres
  /**
   * The chair rides with its body centre this far above the rail while grinding, so the
   * height test has to compare against `rail.height + RIDE_HEIGHT`, not `rail.height`.
   * Comparing against the bare rail height biased every check by a third of a metre and
   * put the 1.4 m cubicle tops — 140 of the level's 211 rails — permanently out of reach.
   */
  private readonly RIDE_HEIGHT = 0.3;
  private readonly MIN_SPEED_TO_GRIND = 2.5;   // Min speed to start grinding
  // Per-frame, so 0.995 is a 26%/s bleed — enough to make a long rail end slower than it
  // started and to break the line that follows it. A grind should hand your speed back.
  private readonly GRIND_FRICTION = 0.9992;
  private readonly BALANCE_DRIFT = 0.08;       // Slow balance drift
  private readonly BALANCE_CORRECTION = 4.0;   // Fast player correction
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
      height: (start.y + end.y) * 0.5,
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
    
    const velDir = new THREE.Vector3(playerVel.x, 0, playerVel.z).normalize();

    // Find nearest rail
    let nearestRail: Rail | null = null;
    let nearestDist = this.SNAP_DISTANCE;
    let nearestProgress = 0;

    for (const rail of this.rails) {
      const result = this.getClosestPointOnRail(playerPos, rail);

      // Reject rails we would immediately run off the end of. The closest point on a rail
      // is clamped to its endpoints, so approaching from beyond one end used to "capture"
      // at progress 1 and end the grind on the very next frame — a lock-on that lasted one
      // sixtieth of a second and read to the player as the rail not working at all.
      const travelSign = velDir.dot(rail.direction) >= 0 ? 1 : -1;
      const remaining = (travelSign > 0 ? 1 - result.progress : result.progress) * rail.length;
      if (remaining < 0.8) continue;

      // Check horizontal distance
      const horizontalDist = new THREE.Vector2(
        playerPos.x - result.point.x,
        playerPos.z - result.point.z
      ).length();
      
      // Check height against the pose the chair would actually hold on this rail.
      // (Cubicle-panel tops sit at 1.4 m, floor rails at 0.8 m.)
      const heightDiff = playerPos.y - (rail.height + this.RIDE_HEIGHT);
      // Dropping onto a rail from above is the normal way to catch one, so the window is
      // asymmetric: forgiving from above, tight from below.
      const withinHeight = heightDiff < this.SNAP_HEIGHT_TOLERANCE
        && heightDiff > -this.SNAP_HEIGHT_TOLERANCE * 0.6;

      if (horizontalDist < nearestDist && withinHeight) {
        nearestDist = horizontalDist;
        nearestRail = rail;
        nearestProgress = result.progress;
      }
    }
    
    if (nearestRail) {
      // Determine grind direction based on velocity
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
   * @param balanceDriftMultiplier - Multiplier for balance drift (lower = easier)
   */
  updateGrind(
    dt: number,
    balanceInput: number,  // -1 to 1 from player input (A/D keys)
    physics: PhysicsWorld,
    chairBody: RAPIER.RigidBody,
    balanceDriftMultiplier: number = 1.0
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
    // Random drift - multiplied by upgrade effect (lower = easier)
    const drift = (Math.random() - 0.5) * this.BALANCE_DRIFT * dt * balanceDriftMultiplier;
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
    position.y = rail.height + 0.3; // Slightly above rail
    
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
    exitPos.y = rail.height + 0.3;
    
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
    pos.y = rail.height;
    
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
