/**
 * Tony Stonks Pro Trader
 * Main entry point
 */

import { Game } from './game/Game';
import { GameStateManager } from './ui/GameStateManager';
import { EditorUI, EditorUIOptions } from './editor/EditorUI';
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
  let isPlayTesting: boolean = false;
  let playTestLevel: EditorLevelData | null = null;
  
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
          // Force game to resize in case canvas was hidden
          window.dispatchEvent(new Event('resize'));
        }
        
        if (to === 'editor') {
          // Hide game canvas when in editor (editor has its own canvas)
          canvas.style.display = 'none';
          
          // Recreate editor UI if returning from play test
          if (!editorUI) {
            // Skip autosave prompt if returning from play test (we have the level already)
            const editorOptions: EditorUIOptions = {
              skipAutosaveCheck: !!playTestLevel
            };
            
            editorUI = new EditorUI(uiOverlay, {
              onExit: () => {
                isPlayTesting = false;
                playTestLevel = null;
                gameStateManager?.setState('menu');
              },
              
              onPlayTest: (level: EditorLevelData) => {
                isPlayTesting = true;
                playTestLevel = level;
                gameStateManager?.setPlayTesting(true);
                const gameLevel = EditorStorage.toGameLevel(level);
                game?.loadCustomLevel(gameLevel);
                game?.start();
                gameStateManager?.setState('playing');
              }
            }, editorOptions);
            
            // Load the level we were editing
            if (playTestLevel) {
              editorUI.loadLevel(playTestLevel);
            }
          }
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
        
        // If play testing, return to editor
        if (isPlayTesting && playTestLevel) {
          isPlayTesting = false;
          gameStateManager?.setPlayTesting(false);
          gameStateManager?.setState('editor');
          // Editor will be recreated by state change handler
        }
      },
      
      onBackToEditor: () => {
        game?.stop();
        isPlayTesting = false;
        gameStateManager?.setPlayTesting(false);
        gameStateManager?.setState('editor');
        // Editor will be recreated by state change handler with playTestLevel
      },
      
      onSkinChange: async (skin) => {
        await game?.changePlayerSkin(skin);
      },
      
      onOpenEditor: () => {
        // Editor UI is created by the state change handler (to === 'editor')
        // This callback is kept for any additional setup needed when opening editor from menu
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
