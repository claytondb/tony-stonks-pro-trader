# Tony Stonks Pro Trader 🪑💨

A Tony Hawk-style skating game featuring a burned-out office worker escaping financial crimes investigators on a rolling office chair.

**Play now:** [https://claytondb.github.io/tony-stonks-pro-trader/](https://claytondb.github.io/tony-stonks-pro-trader/)

## 🎮 Controls

| Key | Action |
|-----|--------|
| **W** | Push (let go to coast to a stop) |
| **S** | Brake |
| **A/D** | Steer; balance on a grind; drift along the wall in a vert air (transfer) |
| **Space** | Ollie (hold to charge); Wallie off a wall |
| **E** | Grind (near a rail or ledge) — or **Wallride** in the air beside a wall |
| **Q** | Flip trick (+ W/A/S/D for the variant) |
| **R** | Grab trick (hold) |
| **Z/C** | Spin |
| **F** | Revert (landing from a transition) |
| **S then W** | Manual (W/S to balance) |
| **Q+R** | Special (meter full) |
| **Escape** | Pause |

### Grinding and wallriding
- Ride alongside a rail, ledge, planter or coping and hold **E** to lock on; **A/D** balance, **Space** pops off.
- Jump beside a wall and hold **E** to ride it; **Space** for a Wallie.
- Go straight up a quarter pipe and press **E** at the lip for an **Axle Stall**; let go to drop back in.

### Combos
Chain tricks together without landing to build multipliers. Land clean to bank your points!

## ✨ Current Features

### Gameplay
- **Full trick system** - 40+ tricks including flips, grabs, spins, grinds, manuals
- **Combo system** - Chain tricks for multipliers, land to bank points
- **Grind system** - Snap-to-rail mechanics with balance meter
- **Special meter** - Build up for bonus scoring
- **Skate park** - Rails, ramps, quarter pipes, fun boxes

### Presentation  
- **Title screen** with animated logo
- **Main menu** - Career Mode, Free Skate, Options
- **Level select** - 3 levels defined (Cubicle Chaos, Parking Lot Panic, Street Smart)
- **Pause menu** - Resume, Retry, Quit
- **Results screen** - Score, time, rank (S/A/B/C/D)
- **HUD** - Score, combo display, trick popups, special meter, balance indicator

### Technical
- **Procedural audio** - Web Audio API sound effects (no external files needed)
- **Camera shake** - Impact feedback on bail and landing
- **3D models** - GLB chair and player models
- **Physics** - Rapier.js WASM physics engine
- **PWA ready** - Installable on mobile devices

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Deploy to GitHub Pages
npm run deploy
```

## 📁 Project Structure

```
src/
├── audio/          # Sound system (procedural + Howler)
├── game/           # Main Game class
├── input/          # Keyboard/gamepad input
├── levels/         # Level data and loader
├── physics/        # Rapier physics, grind system
├── player/         # Player model and animations
├── rendering/      # Camera controller
├── tricks/         # Trick detection, combo system
└── ui/             # HUD, menus, game state manager

public/
├── models/         # GLB 3D models
└── sounds/         # Audio files (optional)
```

## 🎯 Roadmap

- [ ] Integrate LevelManager for actual level loading
- [ ] Add collectible system
- [ ] Story mode cutscenes
- [ ] Mobile touch controls
- [ ] Leaderboards

## 💡 Concept

**Genre:** Action/Sports/Skating  
**Inspiration:** Tony Hawk's Pro Skater meets The Matrix meets Office Space

Our protagonist is a cubicle drone who discovers he's being investigated for financial crimes. In a desperate escape from the office, he grabs his trusty rolling chair and discovers an unexpected talent for chair-skating. Now a fugitive, he grinds rails, does flip tricks, and completes missions across increasingly absurd locations.

## 🛠 Tech Stack

- **Three.js** - 3D rendering
- **Rapier.js** - WASM physics engine
- **TypeScript** - Type safety
- **Vite** - Fast dev server and bundling
- **Web Audio API** - Procedural sounds

## 📝 License

MIT
