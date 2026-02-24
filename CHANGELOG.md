# Changelog

All notable changes to Tony Stonks Pro Trader.

## [0.3.0] - 2026-02-23

### Added
- Camera shake on bail and landing for better game feel
- Impact intensity scales with air time

## [0.2.0] - 2026-02-22

### Added
- **Game State Manager** - Title screen, main menu, level select, pause, results
- **Procedural Sound Effects** - Web Audio API sounds (no external files needed)
  - Push, jump, land, grind loop, trick sounds, combo feedback, bail
- **Level Data System** - 3 levels defined with goals and objects
  - Cubicle Chaos (Ch1) - Office floor
  - Parking Lot Panic (Ch1) - Garage area
  - Street Smart (Ch2) - Downtown
- **Grind System** - Rail snapping, balance mechanic, speed-based entry
- **Sound Manager** - Howler.js integration for music and SFX

### Fixed
- Jump detection (keypress handling)
- Movement direction (chair model orientation)

## [0.1.0] - 2026-02-22

### Added
- **Core Game Loop** - Fixed timestep physics
- **Player Controller** - THPS-style movement (push, brake, turn, jump, spin)
- **Trick System** - 40+ tricks in registry (flips, grabs, spins, grinds, manuals)
- **Combo System** - Chain tricks, multipliers, land to bank
- **HUD** - Score display, trick popups, combo meter, special meter
- **Skate Park** - Test environment with rails, ramps, quarter pipes
- **Physics** - Rapier.js WASM integration
- **3D Models** - GLB chair and player models
- **Camera Controller** - Smooth follow cam
- **PWA Support** - Manifest for mobile install

### Technical
- Three.js rendering pipeline
- Input system (keyboard + gamepad ready)
- TypeScript throughout
- Vite build system
- GitHub Pages deployment
