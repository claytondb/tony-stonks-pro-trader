/**
 * Trick Detector
 * THPS-style trick detection based on button + direction combos
 */

import { InputState } from '../input/InputManager';
import { TrickRegistry, TrickDefinition } from './TrickRegistry';

export interface PlayerTrickState {
  isGrounded: boolean;
  isAirborne: boolean;
  isGrinding: boolean;
  isManualing: boolean;
  hasSpecial: boolean;
  airTime: number;
}

export class TrickDetector {
  private lastTrickTime = 0;
  private minTrickInterval = 200; // ms between tricks
  
  /**
   * Detect trick based on THPS-style input
   * Flip = Left Arrow + direction
   * Grab = Right Arrow + direction
   * Grind = Up Arrow + direction (for lip tricks)
   */
  detectTrick(input: InputState, state: PlayerTrickState): TrickDefinition | null {
    const now = performance.now();
    
    // Cooldown between tricks
    if (now - this.lastTrickTime < this.minTrickInterval) {
      return null;
    }
    
    // Only detect tricks when airborne
    if (!state.isAirborne) {
      return null;
    }
    
    let trick: TrickDefinition | null = null;
    
    // FLIP TRICKS (Left Arrow + WASD direction)
    if (input.flip) {
      trick = this.detectFlipTrick(input);
    }
    // GRAB TRICKS (Right Arrow + WASD direction)
    else if (input.grab) {
      trick = this.detectGrabTrick(input);
    }
    
    if (trick) {
      this.lastTrickTime = now;
    }
    
    return trick;
  }
  
  /**
   * Detect flip tricks - Left Arrow + direction
   */
  private detectFlipTrick(input: InputState): TrickDefinition | null {
    // Double direction = advanced tricks
    
    // W + Left = Impossible
    if (input.trickUp && !input.trickDown && !input.trickLeft && !input.trickRight) {
      return TrickRegistry.get('impossible') || null;
    }
    
    // W + D + Left = Inward Heelflip / 360 Inward Heel
    if (input.trickUp && input.trickRight) {
      return TrickRegistry.get('hardflip') || null;
    }
    
    // D + Left = Heelflip
    if (input.trickRight && !input.trickUp && !input.trickDown) {
      return TrickRegistry.get('heelflip') || null;
    }
    
    // S + D + Left = Varial Heelflip
    if (input.trickDown && input.trickRight) {
      return TrickRegistry.get('varial_flip') || null;
    }
    
    // S + Left = Pop Shove-It
    if (input.trickDown && !input.trickLeft && !input.trickRight) {
      return TrickRegistry.get('pop_shove') || null;
    }
    
    // S + A + Left = Varial Kickflip / 360 Flip
    if (input.trickDown && input.trickLeft) {
      return TrickRegistry.get('360_flip') || null;
    }
    
    // A + Left = Kickflip
    if (input.trickLeft && !input.trickUp && !input.trickDown) {
      return TrickRegistry.get('kickflip') || null;
    }
    
    // W + A + Left = Hardflip
    if (input.trickUp && input.trickLeft) {
      return TrickRegistry.get('hardflip') || null;
    }
    
    // Just Left Arrow = Kickflip (default)
    return TrickRegistry.get('kickflip') || null;
  }
  
  /**
   * Detect grab tricks - Right Arrow + direction
   */
  private detectGrabTrick(input: InputState): TrickDefinition | null {
    // W + Right = Nosegrab
    if (input.trickUp && !input.trickDown && !input.trickLeft && !input.trickRight) {
      return TrickRegistry.get('nosegrab') || null;
    }
    
    // W + D + Right = Madonna
    if (input.trickUp && input.trickRight) {
      return TrickRegistry.get('madonna') || null;
    }
    
    // D + Right = Indy
    if (input.trickRight && !input.trickUp && !input.trickDown) {
      return TrickRegistry.get('indy') || null;
    }
    
    // S + D + Right = Airwalk
    if (input.trickDown && input.trickRight) {
      return TrickRegistry.get('airwalk') || null;
    }
    
    // S + Right = Tailgrab
    if (input.trickDown && !input.trickLeft && !input.trickRight) {
      return TrickRegistry.get('tailgrab') || null;
    }
    
    // S + A + Right = Benihana
    if (input.trickDown && input.trickLeft) {
      return TrickRegistry.get('benihana') || null;
    }
    
    // A + Right = Melon
    if (input.trickLeft && !input.trickUp && !input.trickDown) {
      return TrickRegistry.get('melon') || null;
    }
    
    // W + A + Right = Japan Air (use coffee_mug as placeholder)
    if (input.trickUp && input.trickLeft) {
      return TrickRegistry.get('coffee_mug') || null;
    }
    
    // Just Right Arrow = Indy (default)
    return TrickRegistry.get('indy') || null;
  }
  
  /**
   * Detect grind type based on approach angle
   */
  detectGrindType(approachAngle: number, _isSwitch?: boolean): TrickDefinition | null {
    // Normalize angle to 0-360
    const angle = ((approachAngle % 360) + 360) % 360;
    
    // Based on approach angle, determine grind type
    if (angle < 30 || angle > 330) {
      return TrickRegistry.get('50_50') || null;
    } else if (angle < 60) {
      return TrickRegistry.get('nosegrind') || null;
    } else if (angle > 300) {
      return TrickRegistry.get('tailslide') || null;
    } else if (angle < 120) {
      return TrickRegistry.get('smith') || null;
    } else if (angle > 240) {
      return TrickRegistry.get('feeble') || null;
    } else {
      return TrickRegistry.get('boardslide') || null;
    }
  }
}
