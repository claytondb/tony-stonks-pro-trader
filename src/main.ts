/**
 * Tony Stonks Pro Trader
 * Main entry point
 */

import { Game } from './game/Game';

// Wait for DOM
document.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const loading = document.getElementById('loading');
  
  if (!canvas) {
    console.error('Canvas not found!');
    return;
  }
  
  try {
    // Initialize game
    const game = new Game(canvas);
    await game.init();
    
    // Hide loading screen
    loading?.classList.add('hidden');
    
    // Start game loop
    game.start();
    
    // Debug: expose game to console
    (window as any).game = game;
    
    console.log('🪑 Tony Stonks Pro Trader loaded!');
    console.log('Controls:');
    console.log('  WASD / Arrows - Move');
    console.log('  Space - Jump');
    console.log('  Shift + Arrows - Grab tricks');
    console.log('  Q/E - Spin');
    
  } catch (error) {
    console.error('Failed to initialize game:', error);
    if (loading) {
      loading.innerHTML = `
        <div style="color: #FF4444;">
          Failed to load game<br>
          <small>${error}</small>
        </div>
      `;
    }
  }
});
