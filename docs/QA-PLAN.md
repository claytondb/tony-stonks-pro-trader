# Tony Stonks Pro Trader
## QA Plan & Test Strategy

---

## 1. Testing Philosophy

**Core Principle:** The game must *feel* like Tony Hawk. Numbers and metrics matter, but subjective feel is the ultimate test.

**Test Pyramid:**
```
           /\
          /  \
         / E2E \        ← Playtest sessions, full runs
        /________\
       /          \
      / Integration \   ← System interactions, combos
     /______________\
    /                \
   /    Unit Tests    \ ← Individual components
  /____________________\
```

---

## 2. Unit Testing

### Framework
- **Vitest** for unit tests (fast, Vite-native)
- **Testing Library** for UI components

### Test Coverage Targets
| Module | Target | Priority |
|--------|--------|----------|
| TrickDetector | 95% | P0 |
| ComboSystem | 95% | P0 |
| InputManager | 90% | P0 |
| PhysicsWorld | 80% | P1 |
| SaveManager | 90% | P1 |
| AudioManager | 70% | P2 |

### Example Unit Tests

```typescript
// TrickDetector.test.ts
describe('TrickDetector', () => {
  describe('flip tricks', () => {
    it('detects kickflip: air + dpadLeft + jump', () => {
      const detector = new TrickDetector();
      const input = createInput({ dpadLeft: true, jump: true });
      const state = createPlayerState({ isAirborne: true });
      
      const trick = detector.detectTrick(input, state);
      
      expect(trick?.id).toBe('kickflip');
    });
    
    it('ignores flip input when grounded', () => {
      const detector = new TrickDetector();
      const input = createInput({ dpadLeft: true, jump: true });
      const state = createPlayerState({ isAirborne: false });
      
      const trick = detector.detectTrick(input, state);
      
      expect(trick).toBeNull();
    });
    
    it('detects 360 flip: air + dpadDown + dpadLeft + jump', () => {
      // ...
    });
  });
  
  describe('grab tricks', () => {
    it('detects melon: air + grab + dpadLeft', () => {
      const detector = new TrickDetector();
      const input = createInput({ dpadLeft: true, grabHeld: true });
      const state = createPlayerState({ isAirborne: true });
      
      const trick = detector.detectTrick(input, state);
      
      expect(trick?.id).toBe('melon');
    });
  });
  
  describe('manual detection', () => {
    it('detects manual from up→down input sequence', () => {
      // Test input buffer pattern matching
    });
  });
});

// ComboSystem.test.ts
describe('ComboSystem', () => {
  it('tracks multiplier correctly', () => {
    const combo = new ComboSystem();
    
    combo.addTrick(TrickRegistry.get('kickflip')!);
    expect(combo.multiplier).toBe(2);
    
    combo.addTrick(TrickRegistry.get('melon')!);
    expect(combo.multiplier).toBe(3);
  });
  
  it('applies repeat penalty', () => {
    const combo = new ComboSystem();
    const kickflip = TrickRegistry.get('kickflip')!;
    
    combo.addTrick(kickflip); // Full points
    const firstPoints = combo.totalPoints;
    
    combo.addTrick(kickflip); // 50% points
    const secondAdd = combo.totalPoints - firstPoints;
    
    expect(secondAdd).toBe(kickflip.basePoints * 0.5);
  });
  
  it('banks points on clean land', () => {
    const combo = new ComboSystem();
    combo.addTrick(TrickRegistry.get('kickflip')!);
    combo.addTrick(TrickRegistry.get('melon')!);
    
    const score = combo.land();
    
    expect(score).toBeGreaterThan(0);
    expect(combo.multiplier).toBe(1); // Reset
  });
  
  it('loses points on bail', () => {
    const combo = new ComboSystem();
    combo.addTrick(TrickRegistry.get('kickflip')!);
    
    const score = combo.bail();
    
    expect(score).toBe(0);
  });
});
```

---

## 3. Integration Testing

### Physics + Gameplay Integration

```typescript
// GrindSystem.integration.test.ts
describe('Grind System Integration', () => {
  let world: PhysicsWorld;
  let grindSystem: GrindSystem;
  let player: Entity;
  
  beforeEach(async () => {
    world = new PhysicsWorld();
    await world.init();
    grindSystem = new GrindSystem(world);
    player = createPlayerEntity(world);
  });
  
  it('snaps to rail when falling within range', () => {
    // Place player above rail
    setPosition(player, { x: 0, y: 2, z: 0 });
    setVelocity(player, { x: 0, y: -5, z: 0 });
    
    // Create rail below
    const rail = createRail(world, { 
      start: { x: -5, y: 0.8, z: 0 },
      end: { x: 5, y: 0.8, z: 0 }
    });
    
    // Simulate falling
    for (let i = 0; i < 30; i++) {
      world.step(1/60);
      grindSystem.update(1/60);
    }
    
    expect(player.get(Player).isGrinding).toBe(true);
  });
  
  it('maintains velocity along rail', () => {
    // Start grind with forward velocity
    startGrindOnRail(player, rail, { speed: 10 });
    
    const initialSpeed = getSpeed(player);
    
    // Update for 1 second
    for (let i = 0; i < 60; i++) {
      grindSystem.update(1/60);
    }
    
    const finalSpeed = getSpeed(player);
    
    // Speed should be maintained (with small friction loss)
    expect(finalSpeed).toBeGreaterThan(initialSpeed * 0.9);
  });
});
```

### Input + Trick Integration

```typescript
// TrickExecution.integration.test.ts
describe('Trick Execution Flow', () => {
  it('executes full trick sequence: input → detection → animation → scoring', async () => {
    const game = await createTestGame();
    
    // Jump
    game.input.press('jump');
    await game.advanceFrames(10);
    
    expect(game.player.isAirborne).toBe(true);
    
    // Do kickflip
    game.input.press('dpadLeft');
    game.input.press('jump');
    await game.advanceFrames(1);
    
    expect(game.player.currentTrick?.id).toBe('kickflip');
    expect(game.animator.currentAnimation).toBe('trick_kickflip');
    
    // Wait for trick completion
    await game.advanceFrames(30);
    
    // Land
    await game.advanceUntil(() => game.player.isGrounded);
    
    expect(game.score).toBeGreaterThan(0);
    expect(game.comboSystem.multiplier).toBe(1); // Reset after land
  });
});
```

---

## 4. Playtest Protocol

### Session Structure (60 minutes)
1. **Warm-up** (5 min): Let player explore freely
2. **Guided Tasks** (20 min): Complete specific objectives
3. **Free Play** (20 min): Player does whatever they want
4. **Feedback** (15 min): Survey + verbal debrief

### Key Metrics to Observe
- Time to first successful combo
- Bail rate (bails / tricks attempted)
- Time spent in tutorials
- Expressions of frustration/joy
- Controller grip changes (tension indicator)
- Natural pauses or breaks

### Recording Setup
- Screen recording with frame counter
- Face cam (for expressions)
- Input visualization overlay
- Analytics logging (trick attempts, scores, etc.)

### Playtest Survey

```
POST-SESSION SURVEY

1. Overall, how would you rate the game feel? (1-10)
   [ ] 1  [ ] 2  [ ] 3  [ ] 4  [ ] 5  [ ] 6  [ ] 7  [ ] 8  [ ] 9  [ ] 10

2. Compared to Tony Hawk games, the controls feel:
   [ ] Much worse  [ ] Worse  [ ] Similar  [ ] Better  [ ] Much better

3. How difficult was it to execute tricks? (1=Too Easy, 5=Just Right, 10=Too Hard)
   [ ] 1  [ ] 2  [ ] 3  [ ] 4  [ ] 5  [ ] 6  [ ] 7  [ ] 8  [ ] 9  [ ] 10

4. How satisfying was landing a combo? (1-10)
   [ ] 1  [ ] 2  [ ] 3  [ ] 4  [ ] 5  [ ] 6  [ ] 7  [ ] 8  [ ] 9  [ ] 10

5. Did anything feel unfair or frustrating? (free text)
   _______________________________________________

6. What was the most fun part?
   _______________________________________________

7. What would you change first?
   _______________________________________________

8. Would you play this game again?
   [ ] Definitely  [ ] Probably  [ ] Maybe  [ ] Probably not  [ ] No
```

### THPS Feel Validation Checklist

| Aspect | Feels Right? | Notes |
|--------|--------------|-------|
| Ollie timing | ☐ Yes ☐ No | |
| Air control | ☐ Yes ☐ No | |
| Grind snap distance | ☐ Yes ☐ No | |
| Manual balance | ☐ Yes ☐ No | |
| Revert timing | ☐ Yes ☐ No | |
| Combo flow | ☐ Yes ☐ No | |
| Bail feedback | ☐ Yes ☐ No | |
| Speed feeling | ☐ Yes ☐ No | |
| Camera follow | ☐ Yes ☐ No | |
| Landing weight | ☐ Yes ☐ No | |

---

## 5. Performance Testing

### Benchmarks

```typescript
// performance.test.ts
describe('Performance Benchmarks', () => {
  it('maintains 60fps with 100 active entities', async () => {
    const game = await createTestGame();
    
    // Spawn 100 entities
    for (let i = 0; i < 100; i++) {
      game.spawnNPC();
    }
    
    const frameTimes: number[] = [];
    
    // Measure 300 frames (5 seconds)
    for (let i = 0; i < 300; i++) {
      const start = performance.now();
      await game.advanceFrame();
      frameTimes.push(performance.now() - start);
    }
    
    const avgFrameTime = frameTimes.reduce((a, b) => a + b) / frameTimes.length;
    const maxFrameTime = Math.max(...frameTimes);
    const fps = 1000 / avgFrameTime;
    
    expect(fps).toBeGreaterThan(58);
    expect(maxFrameTime).toBeLessThan(33); // No frame > 33ms
  });
  
  it('physics step completes in <4ms', async () => {
    const world = new PhysicsWorld();
    await world.init();
    
    // Add complex scene
    createComplexLevel(world);
    
    const stepTimes: number[] = [];
    
    for (let i = 0; i < 1000; i++) {
      const start = performance.now();
      world.step(1/60);
      stepTimes.push(performance.now() - start);
    }
    
    const avgStepTime = stepTimes.reduce((a, b) => a + b) / stepTimes.length;
    
    expect(avgStepTime).toBeLessThan(4);
  });
});
```

### Platform Performance Matrix

| Platform | Target FPS | Test Device | Status |
|----------|------------|-------------|--------|
| Chrome Desktop | 60 | i5 + GTX 1060 | ☐ |
| Firefox Desktop | 60 | i5 + GTX 1060 | ☐ |
| Safari Desktop | 60 | M1 Mac | ☐ |
| Chrome Mobile | 60 | Pixel 6 | ☐ |
| Safari Mobile | 60 | iPhone 13 | ☐ |
| iPad | 60 | iPad Pro 2021 | ☐ |
| Steam Deck | 60 | Steam Deck | ☐ |
| Low-end Mobile | 30 | Moto G Power | ☐ |

### Memory Profiling Checklist
- [ ] No memory leaks over 30-minute session
- [ ] Heap stays under 256MB
- [ ] No GC pauses >50ms
- [ ] Texture memory under 128MB
- [ ] Audio buffers properly released

---

## 6. Platform-Specific Testing

### Web Browsers

| Test Case | Chrome | Firefox | Safari | Edge |
|-----------|--------|---------|--------|------|
| Game loads | ☐ | ☐ | ☐ | ☐ |
| WebGL renders | ☐ | ☐ | ☐ | ☐ |
| WASM physics | ☐ | ☐ | ☐ | ☐ |
| Gamepad works | ☐ | ☐ | ☐ | ☐ |
| Audio plays | ☐ | ☐ | ☐ | ☐ |
| Save/load | ☐ | ☐ | ☐ | ☐ |
| Fullscreen | ☐ | ☐ | ☐ | ☐ |

### iOS (Capacitor)

| Test Case | iPhone SE | iPhone 13 | iPad |
|-----------|-----------|-----------|------|
| App launches | ☐ | ☐ | ☐ |
| Touch controls | ☐ | ☐ | ☐ |
| Game controller | ☐ | ☐ | ☐ |
| Background/resume | ☐ | ☐ | ☐ |
| Notch handling | ☐ | N/A | N/A |
| Split screen | N/A | N/A | ☐ |

### Android (Capacitor)

| Test Case | Low-end | Mid-range | High-end |
|-----------|---------|-----------|----------|
| App launches | ☐ | ☐ | ☐ |
| Touch controls | ☐ | ☐ | ☐ |
| Game controller | ☐ | ☐ | ☐ |
| Background/resume | ☐ | ☐ | ☐ |
| Various aspect ratios | ☐ | ☐ | ☐ |

### Steam Deck

| Test Case | Status |
|-----------|--------|
| Launches via Proton | ☐ |
| Controller mapping | ☐ |
| Resolution (1280x800) | ☐ |
| Performance 60fps | ☐ |
| Suspend/resume | ☐ |
| Cloud saves sync | ☐ |

---

## 7. Test Cases by Feature

### Movement System

| ID | Test Case | Expected Result | Status |
|----|-----------|-----------------|--------|
| MOV-001 | Roll forward | Chair moves forward | ☐ |
| MOV-002 | Roll backward | Chair moves backward | ☐ |
| MOV-003 | Turn left | Chair turns left | ☐ |
| MOV-004 | Turn right | Chair turns right | ☐ |
| MOV-005 | Ollie from ground | Chair jumps | ☐ |
| MOV-006 | Ollie from grind | Chair jumps off rail | ☐ |
| MOV-007 | Landing clean | Smooth land, points bank | ☐ |
| MOV-008 | Landing hard | Slight stagger | ☐ |
| MOV-009 | Bail forward | Faceplant animation | ☐ |
| MOV-010 | Bail backward | Fall back animation | ☐ |

### Trick System

| ID | Test Case | Expected Result | Status |
|----|-----------|-----------------|--------|
| TRK-001 | Kickflip input | Kickflip executes | ☐ |
| TRK-002 | Heelflip input | Heelflip executes | ☐ |
| TRK-003 | All flip tricks | Each flip works | ☐ |
| TRK-004 | Melon grab input | Melon grab executes | ☐ |
| TRK-005 | All grab tricks | Each grab works | ☐ |
| TRK-006 | 50-50 grind | Grind starts on rail | ☐ |
| TRK-007 | All grind tricks | Each grind type works | ☐ |
| TRK-008 | Manual input | Manual starts | ☐ |
| TRK-009 | Nose manual | Nose manual starts | ☐ |
| TRK-010 | Revert input | Revert executes | ☐ |
| TRK-011 | Spin left | Chair spins left | ☐ |
| TRK-012 | Spin right | Chair spins right | ☐ |
| TRK-013 | 180 spin | Half rotation | ☐ |
| TRK-014 | 360 spin | Full rotation | ☐ |
| TRK-015 | 900 spin | 2.5 rotations | ☐ |

### Combo System

| ID | Test Case | Expected Result | Status |
|----|-----------|-----------------|--------|
| CMB-001 | Single trick scores | Points added | ☐ |
| CMB-002 | Multi-trick combo | Multiplier increases | ☐ |
| CMB-003 | Grind extends combo | Combo continues | ☐ |
| CMB-004 | Manual extends combo | Combo continues | ☐ |
| CMB-005 | Revert extends combo | Links air to manual | ☐ |
| CMB-006 | Land banks points | Score finalizes | ☐ |
| CMB-007 | Bail loses combo | Points lost | ☐ |
| CMB-008 | Repeat trick penalty | Reduced points | ☐ |
| CMB-009 | Special trick bonus | Extra points | ☐ |
| CMB-010 | Combo timer visible | UI shows time left | ☐ |

### Collectibles

| ID | Test Case | Expected Result | Status |
|----|-----------|-----------------|--------|
| COL-001 | Collect S letter | Letter obtained | ☐ |
| COL-002 | Collect all STONKS | Bonus unlocked | ☐ |
| COL-003 | Collect secret tape | Tape obtained | ☐ |
| COL-004 | Collect stat point | Stats increase | ☐ |
| COL-005 | Collect cash | Currency added | ☐ |

### Save/Load

| ID | Test Case | Expected Result | Status |
|----|-----------|-----------------|--------|
| SAV-001 | Auto-save on level complete | Save created | ☐ |
| SAV-002 | Load saved game | Progress restored | ☐ |
| SAV-003 | Save settings | Settings persist | ☐ |
| SAV-004 | Save corruption handling | Graceful fallback | ☐ |
| SAV-005 | Multiple save slots | All slots work | ☐ |

---

## 8. Bug Tracking

### Severity Levels

| Level | Definition | Response Time |
|-------|------------|---------------|
| S1 - Blocker | Game unplayable, crash, data loss | Immediate |
| S2 - Critical | Major feature broken, no workaround | 24 hours |
| S3 - Major | Feature impaired, workaround exists | 72 hours |
| S4 - Minor | Cosmetic, polish, edge cases | Next sprint |
| S5 - Trivial | Nice to have, suggestions | Backlog |

### Bug Report Template

```markdown
## Bug Report

**Title:** [Brief description]

**Severity:** S1/S2/S3/S4/S5

**Platform:** [Browser/iOS/Android/Desktop]

**Version:** [Build number]

**Steps to Reproduce:**
1. 
2. 
3. 

**Expected Result:**
[What should happen]

**Actual Result:**
[What actually happens]

**Frequency:** [Always/Sometimes/Rare]

**Screenshots/Video:**
[Attach media]

**Logs:**
[Console output if available]

**Additional Context:**
[Any other relevant info]
```

### Known Issues Tracking

| ID | Title | Severity | Status | Assigned |
|----|-------|----------|--------|----------|
| BUG-001 | [Template] | S3 | Open | - |

---

## 9. Regression Testing

### Pre-Release Checklist

Before each release, run through:

- [ ] All P0 unit tests pass
- [ ] All P1 unit tests pass
- [ ] Integration tests pass
- [ ] Performance benchmarks met
- [ ] Full playthrough (all levels)
- [ ] Save/load cycle works
- [ ] Settings persist correctly
- [ ] Audio plays correctly
- [ ] No console errors
- [ ] Memory stable over 30 min

### Smoke Test (5 minutes)

Quick validation for every build:

1. [ ] Game launches
2. [ ] Main menu loads
3. [ ] Start game works
4. [ ] Player can move
5. [ ] Player can trick
6. [ ] Audio plays
7. [ ] Can pause/resume
8. [ ] Can quit to menu

---

## 10. Test Environment Setup

### Local Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- TrickDetector.test.ts

# Run in watch mode
npm run test:watch
```

### CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test
      - run: npm run build
```

---

## 11. Test Data & Fixtures

### Test Helpers

```typescript
// tests/helpers.ts

export function createInput(overrides: Partial<InputState> = {}): InputState {
  return {
    moveX: 0,
    moveY: 0,
    jump: false,
    grab: false,
    jumpHeld: false,
    grabHeld: false,
    dpadUp: false,
    dpadDown: false,
    dpadLeft: false,
    dpadRight: false,
    spinLeft: false,
    spinRight: false,
    pause: false,
    ...overrides
  };
}

export function createPlayerState(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    isGrounded: true,
    isAirborne: false,
    isGrinding: false,
    isManualing: false,
    isBailing: false,
    velocity: { x: 0, y: 0, z: 0 },
    ...overrides
  };
}

export async function createTestGame(): Promise<TestGame> {
  // Headless game instance for testing
}
```

---

## 12. Accessibility Testing

### WCAG Compliance Checklist

- [ ] Color contrast meets AA standard
- [ ] UI scalable to 150%
- [ ] Colorblind modes functional
- [ ] All info available without color alone
- [ ] Subtitles work correctly
- [ ] Controls fully remappable
- [ ] No reliance on audio-only cues
- [ ] Reduced motion option works
- [ ] One-handed mode functional (mobile)

---

*QA plan will evolve as development progresses and new test cases are identified.*
