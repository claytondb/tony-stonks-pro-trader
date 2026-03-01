# Tony Stonks Pro Trader - Polish TODO

**Goal:** Elevate game feel to THPS 1+2 quality standards.

Live: https://claytondb.github.io/tony-stonks-pro-trader/

---

## 🎯 Quick Wins (< 30 min each)

### Audio & Feedback
- [ ] **Add wheel roll sound** - Continuous rolling noise proportional to speed (currently silent when moving)
- [ ] **Landing screen shake** - Small camera shake on successful combo land (not just bail)
- [ ] **Trick pitch variation** - Vary the procedural trick sound pitch based on trick value (higher points = higher pitch)
- [ ] **Balance warning sound** - Audio cue when grind balance is in danger zone (near edges)
- [ ] **Push sound effect** - Satisfying "kick" sound when player pushes (W key)

### Visual Juice
- [ ] **Speed lines/blur** - Simple radial blur or speed lines shader when moving fast (>12 speed)
- [ ] **Combo multiplier pulse** - HUD multiplier scales up briefly when it increases
- [ ] **Trick name colors** - Color-code trick names by type (flip=cyan, grab=gold, grind=orange)
- [ ] **Landing dust particles** - Small puff when landing from air (similar to grind sparks system)
- [ ] **Wheel spin indicator** - Visual feedback on chair wheels rotating with speed

### Controls & Feel
- [ ] **Jump buffer** - Allow jump input slightly before landing (~100ms window)
- [ ] **Coyote time** - Brief window to jump after leaving ground (~80ms)
- [ ] **Trick input queue** - Queue next trick input while current trick animating

### UI Polish
- [ ] **Score number animation** - Score counts up with easing, not linear
- [ ] **Special meter glow** - Pulsing glow effect when special is full (beyond current animation)
- [ ] **Combo timer bar** - Visual indicator of time remaining to extend combo
- [ ] **Hide controls hint after first play** - Use localStorage to track

---

## 🔧 Medium Effort (1-2 hours each)

### Audio System Overhaul
- [ ] **Real sound effects** - Replace procedural sounds with actual audio files:
  - `push.mp3` - Chair push/kick sound
  - `jump.mp3` - Ollie whoosh
  - `land.mp3` - Landing thud
  - `grind-start.mp3` / `grind-loop.mp3` - Metal scraping
  - `trick-land.mp3` - Success ding
  - `bail.mp3` - Crash/fail sound
  - `combo-ding.mp3` - Combo increase sound
  - Use free sound libraries (freesound.org, mixkit.co)
  
- [ ] **Background music system** - Add looping tracks:
  - Menu music (chill/lofi)
  - Gameplay music (upbeat, energetic)
  - Music volume control in options (already has slider, just needs implementation)

### Camera Improvements
- [ ] **Dynamic FOV** - Widen FOV slightly when moving fast, narrow when slow
- [ ] **Trick zoom** - Subtle zoom out during air time for better trick visibility
- [ ] **Grind camera angle** - Rotate camera slightly to better show rail during grinds
- [ ] **Impact zoom pulse** - Brief zoom on big landings (>5000 points)

### Particle Effects
- [ ] **Landing impact particles** - Dust/debris burst on landing (intensity based on air time)
- [ ] **Speed trail particles** - Subtle trail behind chair at high speeds
- [ ] **Special meter fill particles** - Sparkle effect when special meter increases
- [ ] **Combo land celebration** - Small confetti burst on landing big combos (>10k)

### Trick System Polish
- [ ] **Spin counter display** - Show "180", "360", "540" etc. during spins
- [ ] **Revert system** - Add revert (Ctrl) to connect landings to manuals
- [ ] **Manual balance meter** - Implement manual trick with balance (up/down to start)
- [ ] **Trick variations** - Display "FS" / "BS" prefix based on approach direction

### Animation Polish
- [ ] **Animation blending cleanup** - Smoother transitions between mount/dismount/rolling states
- [ ] **Crash animation variety** - Multiple crash animations, pick randomly
- [ ] **Trick-specific poses** - Different grab animations for different grabs (currently all same)
- [ ] **Idle fidget animations** - Subtle movements when standing still

### Level Polish
- [ ] **Object outlines on rails** - Subtle highlight on grindable surfaces
- [ ] **Collectible indicators** - Floating arrows/glows on collectibles
- [ ] **Goal progress HUD** - Show current level goals on screen
- [ ] **Level intro camera sweep** - Pan across level before play starts

---

## 🏗️ Bigger Features (Half day+)

### Core Gameplay
- [ ] **Manual system** - Full manual implementation with balance:
  - Up+Up to start nose manual
  - Down+Down to start manual
  - Balance left/right with A/D
  - Links combos between air tricks and grinds
  
- [ ] **Lip tricks** - Add lip trick detection on quarter pipe edges:
  - Approach edge, press grind button
  - Various lip tricks based on direction
  
- [ ] **Wallride** - Detect and ride along wall surfaces:
  - Approach wall at angle
  - Auto-snap to wall, maintain momentum
  - Can transfer to grinds or air

### Visual Effects
- [ ] **Post-processing stack** - Add post-processing for cinematic feel:
  - Bloom for special meter glow, sparks
  - Vignette that intensifies at high speeds
  - Chromatic aberration on big impacts
  - Motion blur option
  
- [ ] **Dynamic lighting** - Time of day system:
  - Different lighting moods per level
  - Sun position affects shadows
  - Night mode option with neon glow

### Mobile Support
- [ ] **Touch controls overlay** - On-screen joystick and buttons:
  - Virtual D-pad for movement
  - Large buttons for jump, flip, grab
  - Swipe gestures for tricks
  
- [ ] **Mobile-optimized UI** - Larger HUD elements for touch
- [ ] **Performance mode** - Reduced effects for mobile devices

### Progression System
- [ ] **High score persistence** - Save best scores per level (localStorage)
- [ ] **Unlockable content** - Unlock new levels, skins based on achievements
- [ ] **Stat tracking** - Track total tricks, grinds, play time
- [ ] **Achievement system** - Badges for milestones:
  - "First 10k combo"
  - "Grind 100 rails"
  - "Land 1000 tricks"

### Social Features
- [ ] **Replay system** - Record and playback best runs
- [ ] **Screenshot mode** - Pause and take styled screenshots
- [ ] **Share buttons** - Share scores to social media

### Tutorial & Onboarding
- [ ] **Interactive tutorial** - First-time player tutorial:
  - Step-by-step movement intro
  - Jump and trick basics
  - Grind detection explanation
  - Combo system walkthrough
  
- [ ] **Practice mode** - Free skate with no timer, goal indicators

### Audio Excellence
- [ ] **Adaptive music** - Music responds to gameplay:
  - Intensity increases during combos
  - Filters/effects during special tricks
  - Victory fanfare on level complete
  
- [ ] **Environmental audio** - Ambient sounds per level:
  - Office - keyboard clicks, phones, AC hum
  - Garage - car sounds, echoes
  - Street - traffic, crowd murmur

---

## 🐛 Known Bugs / Rough Edges

- [ ] **Grind detection sensitivity** - Sometimes clips through rails at high speed
- [ ] **Animation state machine edge cases** - Occasional stuck states when rapidly changing actions
- [ ] **Camera clipping** - Camera can clip through walls in tight spaces
- [ ] **Rail end behavior** - Awkward pop when reaching end of rail
- [ ] **Mount animation timing** - Stand-to-sit transition feels sluggish
- [ ] **Physics jitter** - Occasional micro-jitter when stationary on slopes

---

## 📊 Priority Ranking (Impact vs Effort)

### Highest Impact, Lowest Effort
1. Wheel roll sound (movement feels silent)
2. Landing screen shake (missing reward feedback)
3. Push sound effect (input feedback)
4. Jump buffer + coyote time (controls feel tighter)
5. Speed lines effect (sense of speed)

### Highest Impact, Medium Effort
1. Real sound effects (huge feel improvement)
2. Background music (atmosphere)
3. Landing particles (visual reward)
4. Manual system (core THPS mechanic missing)
5. Dynamic camera FOV (immersion)

### Biggest Long-term Value
1. Mobile touch controls (doubles audience)
2. Tutorial system (reduces bounce rate)
3. Progression/unlocks (retention)
4. Post-processing (visual polish)
5. Adaptive music (AAA feel)

---

## 🎮 THPS Quality Checklist

### Controls (like THPS 1+2)
- [x] Responsive, snappy inputs
- [x] WASD + Arrow keys scheme
- [ ] Jump buffer
- [ ] Coyote time
- [ ] Revert for combo links
- [ ] Manual balance

### Audio (like THPS 1+2)
- [ ] Satisfying trick sounds
- [ ] Wheel/rolling sounds
- [ ] Grind metallic sounds
- [ ] Music that matches energy
- [ ] Sound variety (not repetitive)

### Visual (like THPS 1+2)
- [x] Trick name popups
- [x] Combo display
- [x] Special meter
- [ ] Screen shake on impacts
- [ ] Speed effects
- [ ] Particle polish
- [ ] Camera dynamism

### Progression (like THPS 1+2)
- [x] Level goals
- [x] Score system
- [ ] High score saves
- [ ] Unlockables
- [ ] Career mode structure

---

*Last updated: 2026-02-28*
*Priority: Start with Quick Wins for immediate feel improvement, then tackle Audio & Camera for biggest impact.*
