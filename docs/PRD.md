# Tony Stonks Pro Trader
## Product Requirements Document

**Version:** 1.0  
**Date:** February 22, 2026  
**Status:** Draft

---

## 1. Executive Summary

Tony Stonks Pro Trader is an arcade-style action sports game that combines the tight, satisfying gameplay of Tony Hawk's Pro Skater with absurdist corporate satire. Players control Tony Stonks, a burned-out office worker who discovers an unexpected talent for extreme office chair skating while fleeing financial crimes investigators.

The game features full trick-based gameplay including grinds, grabs, flips, and manuals, all performed on a rolling office chair across increasingly absurd environments from corporate offices to city rooftops.

**Core Value Proposition:** The feel and depth of Tony Hawk with fresh, comedic theming that resonates with anyone who's ever fantasized about escaping their cubicle.

---

## 2. Target Platforms

| Platform | Priority | Tech Stack | Target FPS |
|----------|----------|------------|------------|
| Web (Browser) | P0 - MVP | Three.js + Vite | 60 |
| iOS | P1 | Capacitor | 60 |
| Android | P1 | Capacitor | 60 |
| Steam (PC/Mac/Linux) | P2 | Electron | 60 |
| Steam Deck | P2 | Electron (verified) | 60 |
| Nintendo Switch | P3 | Custom port | 30-60 |

**MVP Focus:** Web browser with gamepad support, touch controls planned for mobile.

---

## 3. Core Gameplay Mechanics

### 3.1 Control Scheme (Matching THPS)

| Action | Keyboard | Gamepad | Touch |
|--------|----------|---------|-------|
| Move | WASD/Arrows | Left Stick | Virtual Stick |
| Ollie/Jump | Space | A/X | Jump Button |
| Flip Tricks | Arrow Keys + Space | D-pad + A | Swipe + Jump |
| Grab Tricks | Shift + Arrows | B/Circle + D-pad | Hold + Swipe |
| Grind | Auto on contact | Auto on contact | Auto |
| Manual | Up+Down quickly | Up+Down | Double-tap |
| Revert | R | RT/R2 | Revert Button |
| Spin | Q/E | Bumpers | Tilt |

### 3.2 Trick Categories

**Flip Tricks:**
- Kickflip, Heelflip, Pop Shove-it, 360 Flip, Hardflip, Laser Flip
- Chair-specific: "Swivel Flip", "Caster Kick", "Armrest Flip"

**Grab Tricks:**
- Melon, Indy, Nosegrab, Tailgrab, Benihana, Madonna
- Chair-specific: "Coffee Mug Grab", "Keyboard Clutch", "Monitor Hug"

**Grind Tricks:**
- 50-50, Nosegrind, Tailslide, Smith, Feeble, Crooked
- Chair-specific: "Wheely Grind", "Armrest Slide", "Recline Rail"

**Lip Tricks:**
- Rock to Fakie, Disaster, Invert
- Chair-specific: "Cubicle Stall", "Water Cooler Hang"

**Manuals:**
- Manual (back wheels)
- Nose Manual (front casters)
- One-Wheel Manual (special)

### 3.3 Combo System

- Tricks chain together while airborne or grinding
- Base points × multiplier (trick count)
- Manuals and reverts connect ground combos
- Balance meter for grinds and manuals
- Bail = lose all uncommitted points
- Land clean = bank points

### 3.4 Special Meter

- Fills as you land tricks
- When full, unlocks signature moves
- Drains over time when not tricking
- Special tricks worth 2-3x base points

---

## 4. Game Modes

### 4.1 Story Mode (Career)

Linear progression through 10+ levels, each with:
- 5-10 objectives (collect items, hit score targets, find secrets)
- Story cutscenes
- Time limits (2-minute runs)
- Unlockable areas within levels

**Story Levels:**
1. The Office (Tutorial)
2. Parking Garage
3. Downtown Streets
4. Shopping Mall
5. Warehouse District
6. Rooftop Chase
7. Subway System
8. Financial District
9. The Docks
10. Corporate HQ (Final)

### 4.2 Free Skate

- Any unlocked level
- No time limit
- Practice tricks
- Find all collectibles

### 4.3 Single Session

- 2-minute classic runs
- High score focus
- Leaderboards

### 4.4 Challenges

- Specific trick challenges
- Speed runs
- Collect-a-thons
- Gap completion lists

---

## 5. Progression System

### 5.1 Character Stats

- **Speed:** Max rolling velocity
- **Spin:** Rotation speed in air
- **Air:** Jump height
- **Hangtime:** Gravity modifier
- **Balance:** Grind/manual stability
- **Switch:** Penalty reduction for switch tricks

Stats improve by completing objectives and finding stat points hidden in levels.

### 5.2 Unlockables

**Chairs:**
- Standard Office Chair (starter)
- Executive Leather Throne
- Gaming Chair (RGB lights)
- Ergonomic Mesh Pro
- Vintage Wooden Swivel
- Bean Bag (joke chair)
- Shopping Cart (secret)

**Outfits:**
- Business Casual (starter)
- Full Suit
- Hawaiian Friday
- Warehouse Worker
- Security Disguise
- CEO Power Suit
- Pajamas (secret)

**Levels:** Unlock by completing previous level objectives

**Tricks:** Special tricks unlock through story progression

### 5.3 Collectibles

- **S-T-O-N-K-S Letters:** One set per level
- **Secret Tapes:** Hidden VHS tapes with lore
- **Stat Points:** 3 per level
- **Cash:** Currency for cosmetics

---

## 6. Technical Requirements

### 6.1 Engine & Framework

```
Core:
- Three.js (3D rendering)
- Rapier.js (physics - WASM, better performance than Cannon)
- TypeScript (type safety)
- Vite (build tool)

Audio:
- Howler.js (sound management)
- Web Audio API (effects)

Cross-Platform:
- Capacitor (iOS/Android)
- Electron (Desktop)

State Management:
- Custom ECS (Entity Component System)
- Zustand (UI state)
```

### 6.2 Performance Budgets

| Metric | Target |
|--------|--------|
| Frame Rate | 60 FPS stable |
| Frame Time | <16.67ms |
| Draw Calls | <100 per frame |
| Triangles | <500k visible |
| Texture Memory | <256MB |
| Load Time | <5 seconds |
| Bundle Size (Web) | <20MB initial |

### 6.3 Physics Requirements

- Chair must feel weighty but responsive
- Gravity: ~20 units/s² (slightly floaty for hangtime)
- Grind snapping: Detect rails within 0.5 units
- Collision: Capsule for player, mesh for environment
- Ground detection: Raycast for landing

### 6.4 Input Latency

- Target: <50ms input-to-screen
- Critical for trick timing
- Pre-buffer inputs during animations

---

## 7. Monetization Strategy

### 7.1 Primary Model: Premium

**Option A: One-Time Purchase**
- Web: $9.99
- Mobile: $4.99
- Steam: $14.99
- Switch: $19.99

**Option B: Free + Cosmetics**
- Base game free
- Cosmetic chair/outfit packs: $1.99-$4.99
- No gameplay advantages (no P2W)

### 7.2 Recommendation

Start with **Option A** (premium) for MVP. Simpler, no store infrastructure needed. Consider F2P conversion later if user acquisition is challenging.

---

## 8. Success Metrics

### 8.1 MVP Success Criteria

- [ ] Playable demo with 2 complete levels
- [ ] All core trick types functional
- [ ] Combo system working
- [ ] 60 FPS on mid-range hardware
- [ ] Positive playtest feedback ("feels like THPS")

### 8.2 Launch Metrics

| Metric | Target |
|--------|--------|
| Day 1 Downloads | 1,000 |
| Week 1 Downloads | 10,000 |
| Steam Reviews | >80% positive |
| Average Session | >15 minutes |
| Completion Rate | >40% finish story |

### 8.3 Engagement Metrics

- Daily Active Users (DAU)
- Session length
- Levels completed
- High scores submitted
- Trick variety (are players using full moveset?)

---

## 9. MVP vs Full Release Scope

### 9.1 MVP (v0.1) - 8 weeks

- [ ] 2 playable levels (Office, Parking Garage)
- [ ] Core movement and physics
- [ ] 10 flip tricks, 10 grabs, 5 grinds
- [ ] Basic combo system
- [ ] Placeholder audio
- [ ] Web build only
- [ ] Keyboard + gamepad support

### 9.2 Alpha (v0.5) - 16 weeks

- [ ] 5 levels with objectives
- [ ] Full trick roster
- [ ] Story cutscenes (static images)
- [ ] Character customization
- [ ] Mobile builds (Capacitor)
- [ ] Original soundtrack

### 9.3 Full Release (v1.0) - 24 weeks

- [ ] 10+ levels
- [ ] Complete story mode
- [ ] All unlockables
- [ ] Leaderboards
- [ ] Steam build
- [ ] Polish pass

### 9.4 Post-Launch

- Nintendo Switch port
- Level editor
- Multiplayer (stretch)
- DLC levels

---

## 10. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Physics don't feel right | Medium | Critical | Early playtesting, iterate on feel |
| Performance issues | Medium | High | Profile early, LOD system, culling |
| Scope creep | High | Medium | Strict MVP focus, cut features early |
| Cross-platform bugs | Medium | Medium | CI testing on all targets |
| Legal (THPS similarity) | Low | High | Different enough IP, parody defense |
| Asset production bottleneck | Medium | Medium | Use free assets, Meshy for gaps |

---

## Appendix A: Competitive Analysis

| Game | Strengths | Weaknesses | Our Angle |
|------|-----------|------------|-----------|
| THPS 1+2 | Perfect gameplay | $40, old IP | Fresh theme, cheaper |
| Session | Realistic | Too hard, niche | Arcade accessibility |
| Skater XL | Mod support | Janky, incomplete | More content |
| Shredders | Snowboarding | Limited tricks | Deeper trick system |

---

## Appendix B: Reference Games

**Must Play:**
- Tony Hawk's Pro Skater 1+2 (Remaster)
- Tony Hawk's Underground
- Skate 3

**Study:**
- Session (realistic controls)
- OlliOlli World (2D tricks)
- Jet Set Radio (style, vibes)

---

*Document maintained by the Tony Stonks development team.*
