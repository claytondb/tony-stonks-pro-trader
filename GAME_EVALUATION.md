# Tony Stonks Pro Trader - Game Evaluation

**Evaluation Date:** 2026-02-26  
**Compared Against:** Tony Hawk's Pro Skater 1+2 (2020 Remaster)  
**Current Version:** Live at https://claytondb.github.io/tony-stonks-pro-trader/

---

## Executive Summary

Tony Stonks Pro Trader is a web-based skateboarding-style game where players perform tricks on an office chair while evading SEC investigators. The game has solid foundations including physics, trick detection, a level editor, and procedural audio. However, compared to THPS 1+2, there are significant gaps in polish, feedback systems, and content that need addressing.

---

## Feature Comparison Matrix

| Feature | THPS 1+2 | Tony Stonks | Gap Level |
|---------|----------|-------------|-----------|
| Core Movement | Excellent | Good | Medium |
| Trick System | Deep, varied | Basic | High |
| Grinding | Polished | Functional | Medium |
| Manuals/Balance | Yes | No | High |
| Reverts | Yes | No | High |
| Special Meter | Yes | No | Medium |
| HUD/Score Display | Always visible | Hidden/minimal | High |
| Combo System | Robust | Basic | Medium |
| Sound Effects | Professional | Procedural (basic) | Medium |
| Music | Licensed tracks | None | High |
| Level Editor | Create-a-Park | Yes (good!) | Low |
| Career Mode | Goals, collectibles | Basic levels only | High |
| Multiplayer | Yes | No | Low priority |
| Controller Support | Full | Keyboard only | Medium |
| Tutorial | Yes | No | High |

---

## Bugs (Priority Order)

### 🔴 Critical (Breaks Core Experience)

1. **[BUG-001] Grid lines visible during gameplay**
   - **Description:** Ground shows grid texture during actual gameplay, should be solid color only (grid is for editor)
   - **Location:** `src/game/Game.ts` - `createLevelGround()`
   - **Status:** 🔧 NEEDS FIX - Code was changed but still showing grid

2. **[BUG-002] No visible HUD during gameplay**
   - **Description:** Score, combo multiplier, trick names not displayed during play
   - **Expected:** THPS shows current score, combo chain, trick names in real-time
   - **Location:** `src/ui/HUD.ts`
   - **Status:** ❓ Investigate - HUD may exist but not rendering

### 🟡 High (Significantly Impacts Experience)

3. **[BUG-003] Sky gradient not applied in pre-built levels**
   - **Description:** Built-in levels (Cubicle Chaos, etc.) don't use sky gradient, only solid color
   - **Location:** `src/levels/LevelData.ts` - level definitions need `skyColorTop`/`skyColorBottom`
   - **Status:** 🔧 NEEDS FIX

4. **[BUG-004] No trick feedback text**
   - **Description:** When performing tricks, no text shows what trick was done
   - **Expected:** "Kickflip +500" floating text
   - **Location:** Need to add trick popup system
   - **Status:** ❌ MISSING FEATURE

5. **[BUG-005] Missing collision on some objects**
   - **Description:** Player can sometimes pass through objects or hit invisible barriers
   - **Location:** `src/game/Game.ts` - physics collider sizes
   - **Status:** 🔧 PARTIALLY FIXED - needs tuning

### 🟢 Medium (Quality of Life)

6. **[BUG-006] No controls reference in pause menu**
   - **Description:** Players don't know controls; no help screen
   - **Status:** ❌ MISSING FEATURE

7. **[BUG-007] Character preview in Options doesn't show chair**
   - **Description:** Options screen shows character standing, not sitting on chair
   - **Status:** 🔧 COSMETIC

8. **[BUG-008] Menu button highlighting inconsistent**
   - **Description:** Sometimes multiple buttons appear highlighted
   - **Status:** 🔧 COSMETIC

---

## Missing Features (Priority Order)

### 🔴 Critical (Core Gameplay Gaps)

1. **[FEAT-001] Visible Score/Combo HUD**
   - Display current score top-left
   - Show combo multiplier and current combo points
   - Show trick names when performed
   - **Effort:** Medium (2-4 hours)

2. **[FEAT-002] Manual/Nose Manual trick**
   - Balancing on back/front wheels to extend combos
   - Balance meter UI
   - **Effort:** High (4-8 hours)

3. **[FEAT-003] Revert trick**
   - Land from vert into manual to continue combo
   - **Effort:** Medium (2-4 hours)

4. **[FEAT-004] Tutorial/How to Play**
   - Interactive or video tutorial showing controls
   - Control reference accessible from menu
   - **Effort:** Medium (3-5 hours)

### 🟡 High (Enhances Core Loop)

5. **[FEAT-005] Special Meter**
   - Fill meter by landing tricks
   - Enable special tricks when full
   - **Effort:** High (4-6 hours)

6. **[FEAT-006] Trick Name Popup**
   - Floating text showing trick names and points
   - Combo chain visualization
   - **Effort:** Low (1-2 hours)

7. **[FEAT-007] Landing Quality System**
   - Perfect/Good/Sloppy landings affect score
   - Visual/audio feedback for landing quality
   - **Effort:** Medium (2-4 hours)

8. **[FEAT-008] Bail/Crash Animations**
   - Character ragdoll or crash animation when bailing
   - **Effort:** High (4-6 hours)

9. **[FEAT-009] Career Mode Goals**
   - Score targets per level
   - Collectibles (stock certificates?)
   - Secret tape equivalent
   - **Effort:** High (6-10 hours)

### 🟢 Medium (Polish & Feel)

10. **[FEAT-010] Background Music**
    - Royalty-free or original music tracks
    - Music player/selector
    - **Effort:** Medium (depends on sourcing music)

11. **[FEAT-011] Gamepad Support**
    - Controller input mapping
    - **Effort:** Medium (3-5 hours)

12. **[FEAT-012] More Trick Variety**
    - Additional flip tricks, grab tricks, spin variations
    - **Effort:** Medium per trick (1-2 hours each)

13. **[FEAT-013] Wall Ride/Wall Plant**
    - Ride along walls for points
    - **Effort:** High (4-6 hours)

14. **[FEAT-014] Lip Tricks**
    - Tricks on coping of half pipes
    - **Effort:** High (4-6 hours)

15. **[FEAT-015] More Levels**
    - Additional pre-built levels
    - **Effort:** Medium per level (2-4 hours each)

---

## Improvement Priorities

### Phase 1: Core Polish (This Sprint)
1. ✅ Fix grid lines in gameplay
2. ✅ Add visible HUD (score, combo)
3. ✅ Add trick name popups
4. ✅ Fix sky gradient in built-in levels
5. ✅ Add controls help screen

### Phase 2: Gameplay Depth
1. Manual/Nose Manual system
2. Revert trick
3. Landing quality system
4. Special meter
5. More trick variety

### Phase 3: Content & Polish
1. Tutorial
2. Career mode goals
3. More levels
4. Background music
5. Gamepad support

### Phase 4: Advanced Features
1. Bail animations
2. Wall rides
3. Lip tricks
4. Multiplayer (stretch goal)

---

## Technical Debt

1. **Unused variables in codebase** - Minor cleanup needed
2. **Large bundle size** - Rapier.js is 2MB, consider lazy loading
3. **No error boundaries** - Game can crash without recovery
4. **No save system for career progress** - localStorage only for editor

---

## Testing Checklist

- [ ] Movement feels responsive (W/A/S/D)
- [ ] Jumping works consistently (Space)
- [ ] Tricks register properly (Arrow keys)
- [ ] Grinding activates near rails
- [ ] Combos accumulate correctly
- [ ] Score persists through session
- [ ] Level editor saves/loads work
- [ ] Play test from editor works
- [ ] Pause menu functions
- [ ] Options persist

---

## Next Actions

Starting with Phase 1, Priority 1:
1. **Fix grid lines** - Check why ground still shows grid
2. **Add HUD** - Make score/combo visible during play
3. **Add trick popups** - Show trick names when performed

---

*Document maintained by development team. Update after each sprint.*
