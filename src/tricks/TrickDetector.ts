/**
 * Trick Detector
 * Detects tricks based on input and player state
 */

import { InputState } from '../input/InputManager';
import { TrickRegistry, TrickDefinition } from './TrickRegistry';

export interface PlayerTrickState {
  isGrounded: boolean;
  isAirborne: boolean;
  isGrinding: boolean;
  isManualing: boolean;
  hasSpecial: boolean;
  airTime: number; // ms in air
}

export class TrickDetector {
  private inputBuffer: { input: InputState; time: number }[] = [];
  private bufferDuration = 200; // ms
  
  /**
   * Record current input for buffer analysis
   */
  recordInput(input: InputState): void {
    const now = performance.now();
    this.inputBuffer.push({ input, time: now });
    
    // Clean old inputs
    this.inputBuffer = this.inputBuffer.filter(
      entry => now - entry.time < this.bufferDuration
    );
  }
  
  /**
   * Detect trick based on current input and player state
   */
  detectTrick(input: InputState, state: PlayerTrickState): TrickDefinition | null {
    // Record input
    this.recordInput(input);
    
    // Manual detection (grounded only)
    if (state.isGrounded && !state.isManualing) {
      const manual = this.detectManualInput();
      if (manual) return manual;
    }
    
    // Air tricks only when airborne
    if (!state.isAirborne) return null;
    
    // Special tricks (requires full special meter)
    if (state.hasSpecial && input.grab && input.jump) {
      const special = this.detectSpecialTrick(input);
      if (special) return special;
    }
    
    // Flip tricks: Jump (just pressed) + D-pad direction
    if (input.jump) {
      const flip = this.detectFlipTrick(input);
      if (flip) return flip;
    }
    
    // Grab tricks: Grab held + D-pad direction
    if (input.grabHeld) {
      const grab = this.detectGrabTrick(input);
      if (grab) return grab;
    }
    
    return null;
  }
  
  /**
   * Detect flip tricks
   */
  private detectFlipTrick(input: InputState): TrickDefinition | null {
    // Tre flip / 360 flip: down + left
    if (input.dpadDown && input.dpadLeft) {
      return TrickRegistry.get('360_flip') || null;
    }
    
    // Hardflip: up + left
    if (input.dpadUp && input.dpadLeft) {
      return TrickRegistry.get('hardflip') || null;
    }
    
    // Varial flip: down + right
    if (input.dpadDown && input.dpadRight) {
      return TrickRegistry.get('varial_flip') || null;
    }
    
    // Kickflip: left
    if (input.dpadLeft) {
      return TrickRegistry.get('kickflip') || null;
    }
    
    // Heelflip: right
    if (input.dpadRight) {
      return TrickRegistry.get('heelflip') || null;
    }
    
    // Pop shove-it: down
    if (input.dpadDown) {
      return TrickRegistry.get('pop_shove') || null;
    }
    
    // FS shove-it: up
    if (input.dpadUp) {
      return TrickRegistry.get('fs_shove') || null;
    }
    
    // Impossible: double tap down (check buffer)
    if (this.checkDoubleTap('dpadDown')) {
      return TrickRegistry.get('impossible') || null;
    }
    
    return null;
  }
  
  /**
   * Detect grab tricks
   */
  private detectGrabTrick(input: InputState): TrickDefinition | null {
    // Benihana: up + down (or hold both)
    if (input.dpadUp && input.dpadDown) {
      return TrickRegistry.get('benihana') || null;
    }
    
    // Madonna: left + right
    if (input.dpadLeft && input.dpadRight) {
      return TrickRegistry.get('madonna') || null;
    }
    
    // Melon: left
    if (input.dpadLeft) {
      return TrickRegistry.get('melon') || null;
    }
    
    // Indy: right
    if (input.dpadRight) {
      return TrickRegistry.get('indy') || null;
    }
    
    // Nosegrab: up
    if (input.dpadUp) {
      return TrickRegistry.get('nosegrab') || null;
    }
    
    // Tailgrab: down
    if (input.dpadDown) {
      return TrickRegistry.get('tailgrab') || null;
    }
    
    // Airwalk: no direction (just grab)
    return TrickRegistry.get('airwalk') || null;
  }
  
  /**
   * Detect special tricks
   */
  private detectSpecialTrick(input: InputState): TrickDefinition | null {
    // Different specials based on direction
    if (input.dpadUp) {
      return TrickRegistry.get('quarterly_report') || null;
    }
    if (input.dpadDown) {
      return TrickRegistry.get('golden_parachute') || null;
    }
    if (input.dpadLeft) {
      return TrickRegistry.get('hostile_takeover') || null;
    }
    if (input.dpadRight) {
      return TrickRegistry.get('pink_slip') || null;
    }
    return null;
  }
  
  /**
   * Detect manual input (quick up→down or down→up)
   */
  private detectManualInput(): TrickDefinition | null {
    if (this.inputBuffer.length < 2) return null;
    
    const recent = this.inputBuffer.slice(-4);
    
    // Look for up→down pattern (manual)
    for (let i = 0; i < recent.length - 1; i++) {
      if (recent[i].input.dpadUp && recent[i + 1].input.dpadDown) {
        return TrickRegistry.get('manual') || null;
      }
    }
    
    // Look for down→up pattern (nose manual)
    for (let i = 0; i < recent.length - 1; i++) {
      if (recent[i].input.dpadDown && recent[i + 1].input.dpadUp) {
        return TrickRegistry.get('nose_manual') || null;
      }
    }
    
    return null;
  }
  
  /**
   * Check for double tap in buffer
   */
  private checkDoubleTap(key: keyof InputState): boolean {
    const presses = this.inputBuffer.filter(
      entry => entry.input[key] === true
    );
    
    if (presses.length < 2) return false;
    
    // Check if two presses within 150ms
    const lastTwo = presses.slice(-2);
    return lastTwo[1].time - lastTwo[0].time < 150;
  }
  
  /**
   * Detect grind type based on approach angle
   */
  detectGrindType(approachAngle: number, isSwitch: boolean): TrickDefinition | null {
    // Normalize angle to 0-360
    const angle = ((approachAngle % 360) + 360) % 360;
    
    // Based on approach angle, determine grind type
    if (angle < 30 || angle > 330) {
      // Straight on - 50-50
      return TrickRegistry.get('50_50') || null;
    } else if (angle < 60) {
      // Slight angle - nosegrind
      return TrickRegistry.get('nosegrind') || null;
    } else if (angle > 300) {
      // Opposite slight angle - tailslide
      return TrickRegistry.get('tailslide') || null;
    } else if (angle < 120) {
      // More angled - smith
      return TrickRegistry.get('smith') || null;
    } else if (angle > 240) {
      // Opposite - feeble
      return TrickRegistry.get('feeble') || null;
    } else {
      // Perpendicular - boardslide
      return TrickRegistry.get('boardslide') || null;
    }
  }
}
