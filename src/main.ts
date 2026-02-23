/**
 * Tony Stonks Pro Trader
 * Main entry point
 */

import { Game } from './game/Game';
import { GameStateManager } from './ui/GameStateManager';

// Wait for DOM
document.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const loading = document.getElementById('loading');
  const uiOverlay = document.getElementById('ui-overlay');
  
  if (!canvas || !uiOverlay) {
    console.error('Required elements not found!');
    return;
  }
  
  let game: Game | null = null;
  let gameStateManager: GameStateManager | null = null;
  
  try {
    // Initialize game engine
    game = new Game(canvas);
    await game.init();
    
    // Hide loading screen
    loading?.classList.add('hidden');
    
    // Create game state manager
    gameStateManager = new GameStateManager(uiOverlay, {
      onStateChange: (from, to) => {
        console.log(`State: ${from} -> ${to}`);
        
        // Show/hide game based on state
        if (to === 'playing') {
          game?.resume();
        } else if (from === 'playing' && to !== 'paused') {
          game?.pause();
        }
      },
      
      onStartGame: (levelId) => {
        console.log(`Starting level: ${levelId}`);
        game?.loadLevel(levelId);
        game?.start();
      },
      
      onPause: () => {
        game?.pause();
      },
      
      onResume: () => {
        game?.resume();
      },
      
      onRetry: () => {
        const currentLevel = game?.getCurrentLevelId();
        if (currentLevel) {
          game?.loadLevel(currentLevel);
        }
      },
      
      onQuit: () => {
        game?.stop();
      }
    });
    
    // Connect game events to state manager
    game.onLevelComplete = (score, time, goalsCompleted, totalGoals) => {
      gameStateManager?.endLevel(score, time, goalsCompleted, totalGoals);
    };
    
    // Show title screen
    gameStateManager.setState('title');
    
    // Debug: expose to console
    (window as any).game = game;
    (window as any).gameState = gameStateManager;
    
    console.log('🪑 Tony Stonks Pro Trader loaded!');
    console.log('Press SPACE to start!');
    
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
