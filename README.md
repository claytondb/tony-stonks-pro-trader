# Tony Stonks Pro Trader 🪑💨

A Tony Hawk-style skating game featuring a burned-out office worker escaping financial crimes investigators on a rolling office chair.

**Play now:** [https://claytondb.github.io/tony-stonks-pro-trader/](https://claytondb.github.io/tony-stonks-pro-trader/)

## 🎮 Controls

| Key | Action |
|-----|--------|
| **W** | Push forward |
| **S** | Brake |
| **A/D** | Turn left/right |
| **Space** | Jump (Ollie) |
| **Q/E** | Spin left/right (in air) |
| **↑** | Flip tricks / Start grind |
| **↓** | Grab tricks / Manual |
| **←/→** | Rotate tricks |
| **Escape** | Pause game |

### Grinding
- Approach a rail and press **↑** to lock onto it
- Use **A/D** to balance while grinding
- Press **Space** to jump off the rail

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
