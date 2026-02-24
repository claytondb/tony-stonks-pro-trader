/**
 * TrickDetector unit tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TrickDetector, PlayerTrickState } from '../src/tricks/TrickDetector';
import { InputState } from '../src/input/InputManager';

// Helper to create a default input state
function createInput(overrides: Partial<InputState> = {}): InputState {
  return {
    forward: false,
    brake: false,
    turnLeft: false,
    turnRight: false,
    jump: false,
    jumpHeld: false,
    flip: false,
    grab: false,
    grind: false,
    trickUp: false,
    trickDown: false,
    trickLeft: false,
    trickRight: false,
    spinLeft: false,
    spinRight: false,
    revert: false,
    pause: false,
    ...overrides
  };
}

// Helper to create a default player state
function createState(overrides: Partial<PlayerTrickState> = {}): PlayerTrickState {
  return {
    isGrounded: false,
    isAirborne: true,
    isGrinding: false,
    isManualing: false,
    hasSpecial: false,
    airTime: 500,
    ...overrides
  };
}

describe('TrickDetector', () => {
  let detector: TrickDetector;
  
  beforeEach(() => {
    detector = new TrickDetector();
  });
  
  describe('flip tricks', () => {
    it('detects kickflip with flip + trickLeft', () => {
      const input = createInput({ flip: true, trickLeft: true });
      const state = createState();
      
      const trick = detector.detectTrick(input, state);
      
      expect(trick).not.toBeNull();
      expect(trick?.id).toBe('kickflip');
      expect(trick?.type).toBe('flip');
    });
    
    it('detects heelflip with flip + trickRight', () => {
      const input = createInput({ flip: true, trickRight: true });
      const state = createState();
      
      const trick = detector.detectTrick(input, state);
      
      expect(trick).not.toBeNull();
      expect(trick?.id).toBe('heelflip');
    });
    
    it('detects impossible with flip + trickUp', () => {
      const input = createInput({ flip: true, trickUp: true });
      const state = createState();
      
      const trick = detector.detectTrick(input, state);
      
      expect(trick).not.toBeNull();
      expect(trick?.id).toBe('impossible');
    });
    
    it('detects pop shove with flip + trickDown', () => {
      const input = createInput({ flip: true, trickDown: true });
      const state = createState();
      
      const trick = detector.detectTrick(input, state);
      
      expect(trick).not.toBeNull();
      expect(trick?.id).toBe('pop_shove');
    });
    
    it('detects 360 flip with flip + trickDown + trickLeft', () => {
      const input = createInput({ flip: true, trickDown: true, trickLeft: true });
      const state = createState();
      
      const trick = detector.detectTrick(input, state);
      
      expect(trick).not.toBeNull();
      expect(trick?.id).toBe('360_flip');
    });
    
    it('detects hardflip with flip + trickUp + trickLeft', () => {
      const input = createInput({ flip: true, trickUp: true, trickLeft: true });
      const state = createState();
      
      const trick = detector.detectTrick(input, state);
      
      expect(trick).not.toBeNull();
      expect(trick?.id).toBe('hardflip');
    });
    
    it('ignores flip input when grounded', () => {
      const input = createInput({ flip: true, trickLeft: true });
      const state = createState({ isGrounded: true, isAirborne: false });
      
      const trick = detector.detectTrick(input, state);
      
      expect(trick).toBeNull();
    });
    
    it('defaults to kickflip when only flip is pressed', () => {
      const input = createInput({ flip: true });
      const state = createState();
      
      const trick = detector.detectTrick(input, state);
      
      expect(trick).not.toBeNull();
      expect(trick?.id).toBe('kickflip');
    });
  });

  describe('grab tricks', () => {
    it('detects melon with grab + trickLeft', () => {
      const input = createInput({ grab: true, trickLeft: true });
      const state = createState();
      
      const trick = detector.detectTrick(input, state);
      
      expect(trick).not.toBeNull();
      expect(trick?.id).toBe('melon');
      expect(trick?.type).toBe('grab');
    });
    
    it('detects indy with grab + trickRight', () => {
      const input = createInput({ grab: true, trickRight: true });
      const state = createState();
      
      const trick = detector.detectTrick(input, state);
      
      expect(trick).not.toBeNull();
      expect(trick?.id).toBe('indy');
    });
    
    it('detects nosegrab with grab + trickUp', () => {
      const input = createInput({ grab: true, trickUp: true });
      const state = createState();
      
      const trick = detector.detectTrick(input, state);
      
      expect(trick).not.toBeNull();
      expect(trick?.id).toBe('nosegrab');
    });
    
    it('detects tailgrab with grab + trickDown', () => {
      const input = createInput({ grab: true, trickDown: true });
      const state = createState();
      
      const trick = detector.detectTrick(input, state);
      
      expect(trick).not.toBeNull();
      expect(trick?.id).toBe('tailgrab');
    });
    
    it('detects benihana with grab + trickDown + trickLeft', () => {
      const input = createInput({ grab: true, trickDown: true, trickLeft: true });
      const state = createState();
      
      const trick = detector.detectTrick(input, state);
      
      expect(trick).not.toBeNull();
      expect(trick?.id).toBe('benihana');
    });
    
    it('detects airwalk with grab + trickDown + trickRight', () => {
      const input = createInput({ grab: true, trickDown: true, trickRight: true });
      const state = createState();
      
      const trick = detector.detectTrick(input, state);
      
      expect(trick).not.toBeNull();
      expect(trick?.id).toBe('airwalk');
    });
    
    it('defaults to indy when only grab is pressed', () => {
      const input = createInput({ grab: true });
      const state = createState();
      
      const trick = detector.detectTrick(input, state);
      
      expect(trick).not.toBeNull();
      expect(trick?.id).toBe('indy');
    });
  });

  describe('grind detection', () => {
    it('detects 50-50 at straight approach (0 degrees)', () => {
      const trick = detector.detectGrindType(0);
      
      expect(trick).not.toBeNull();
      expect(trick?.id).toBe('50_50');
    });
    
    it('detects 50-50 at near-straight approach (350 degrees)', () => {
      const trick = detector.detectGrindType(350);
      
      expect(trick).not.toBeNull();
      expect(trick?.id).toBe('50_50');
    });
    
    it('detects nosegrind at slight angle (45 degrees)', () => {
      const trick = detector.detectGrindType(45);
      
      expect(trick).not.toBeNull();
      expect(trick?.id).toBe('nosegrind');
    });
    
    it('detects tailslide at opposite angle (315 degrees)', () => {
      const trick = detector.detectGrindType(315);
      
      expect(trick).not.toBeNull();
      expect(trick?.id).toBe('tailslide');
    });
    
    it('detects smith grind at steep angle (90 degrees)', () => {
      const trick = detector.detectGrindType(90);
      
      expect(trick).not.toBeNull();
      expect(trick?.id).toBe('smith');
    });
    
    it('detects feeble grind at reverse steep angle (270 degrees)', () => {
      const trick = detector.detectGrindType(270);
      
      expect(trick).not.toBeNull();
      expect(trick?.id).toBe('feeble');
    });
    
    it('detects boardslide at perpendicular approach (180 degrees)', () => {
      const trick = detector.detectGrindType(180);
      
      expect(trick).not.toBeNull();
      expect(trick?.id).toBe('boardslide');
    });
    
    it('handles negative angles correctly', () => {
      const trick = detector.detectGrindType(-45);
      
      expect(trick).not.toBeNull();
      // -45 normalizes to 315, which should be tailslide
      expect(trick?.id).toBe('tailslide');
    });
    
    it('handles angles over 360 correctly', () => {
      const trick = detector.detectGrindType(400);
      
      expect(trick).not.toBeNull();
      // 400 normalizes to 40, which should be nosegrind
      expect(trick?.id).toBe('nosegrind');
    });
  });

  describe('trick cooldown', () => {
    it('respects minimum trick interval', async () => {
      const input = createInput({ flip: true, trickLeft: true });
      const state = createState();
      
      // First trick should succeed
      const trick1 = detector.detectTrick(input, state);
      expect(trick1).not.toBeNull();
      
      // Immediate second attempt should fail (cooldown)
      const trick2 = detector.detectTrick(input, state);
      expect(trick2).toBeNull();
    });
  });

  describe('input priority', () => {
    it('prioritizes flip over grab when both pressed', () => {
      const input = createInput({ flip: true, grab: true, trickLeft: true });
      const state = createState();
      
      const trick = detector.detectTrick(input, state);
      
      expect(trick).not.toBeNull();
      expect(trick?.type).toBe('flip');
    });
  });
});

// Placeholder test to verify setup works
describe('Test Setup', () => {
  it('vitest is working', () => {
    expect(1 + 1).toBe(2);
  });
});
