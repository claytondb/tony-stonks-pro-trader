/**
 * Tony Stonks Pro Trader
 * Main entry point
 */

import { Game } from './game/Game';
import { GameStateManager } from './ui/GameStateManager';
import { EditorUI } from './editor/EditorUI';
import { EditorStorage, EditorLevelData } from './editor/EditorStorage';

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
  let editorUI: EditorUI | null = null;
  
  // Get loading UI elements
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const loadingStatus = document.getElementById('loading-status');
  
  const updateProgress = (percent: number, status: string) => {
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressText) progressText.textContent = `${percent}%`;
    if (loadingStatus) loadingStatus.textContent = status;
  };
  
  try {
    // Initialize game engine with progress callback
    game = new Game(canvas);
    await game.init(updateProgress);
    
    // Brief delay to show 100% before hiding
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Hide loading screen
    loading?.classList.add('hidden');
    
    // Create game state manager
    gameStateManager = new GameStateManager(uiOverlay, {
      onStateChange: (from, to) => {
        console.log(`State: ${from} -> ${to}`);
        
        // Show/hide game based on state
        if (to === 'playing') {
          canvas.style.display = 'block';
          game?.resume();
        } else if (from === 'playing' && to !== 'paused') {
          game?.pause();
        }
        
        // Handle editor state transitions
        if (from === 'editor' && to !== 'editor') {
          // Leaving editor - clean up
          if (editorUI) {
            editorUI.dispose();
            editorUI = null;
          }
          canvas.style.display = 'block';
        }
        
        if (to === 'editor') {
          // Hide game canvas when in editor (editor has its own canvas)
          canvas.style.display = 'none';
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
      },
      
      onSkinChange: async (skin) => {
        await game?.changePlayerSkin(skin);
      },
      
      onOpenEditor: () => {
        // Create editor UI in the overlay container
        editorUI = new EditorUI(uiOverlay, {
          onExit: () => {
            gameStateManager?.setState('menu');
          },
          
          onPlayTest: (level: EditorLevelData) => {
            // Convert to game level and play
            const gameLevel = EditorStorage.toGameLevel(level);
            
            // Temporarily add to available levels
            game?.loadCustomLevel(gameLevel);
            game?.start();
            gameStateManager?.setState('playing');
          }
        });
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
