/**
 * Game State Manager
 * Handles game states: title, menu, playing, paused, results
 */

export type GameState = 
  | 'loading'
  | 'title'
  | 'menu'
  | 'level_select'
  | 'playing'
  | 'paused'
  | 'results'
  | 'story';

export interface GameStateCallbacks {
  onStateChange?: (from: GameState, to: GameState) => void;
  onStartGame?: (levelId: string) => void;
  onPause?: () => void;
  onResume?: () => void;
  onRetry?: () => void;
  onQuit?: () => void;
}

interface LevelResult {
  levelId: string;
  score: number;
  time: number;
  goalsCompleted: number;
  totalGoals: number;
  rank: 'S' | 'A' | 'B' | 'C' | 'D';
}

export class GameStateManager {
  private state: GameState = 'loading';
  private callbacks: GameStateCallbacks;
  private uiContainer: HTMLElement;
  
  private currentLevelId: string = '';
  private lastResult: LevelResult | null = null;
  
  constructor(container: HTMLElement, callbacks: GameStateCallbacks = {}) {
    this.uiContainer = container;
    this.callbacks = callbacks;
    
    this.initKeyboardControls();
  }
  
  private initKeyboardControls(): void {
    window.addEventListener('keydown', (e) => {
      switch (this.state) {
        case 'title':
          if (e.code === 'Space' || e.code === 'Enter') {
            this.setState('menu');
          }
          break;
          
        case 'playing':
          if (e.code === 'Escape') {
            this.setState('paused');
            this.callbacks.onPause?.();
          }
          break;
          
        case 'paused':
          if (e.code === 'Escape') {
            this.setState('playing');
            this.callbacks.onResume?.();
          }
          break;
      }
    });
  }
  
  /**
   * Set game state
   */
  setState(newState: GameState): void {
    const oldState = this.state;
    this.state = newState;
    
    this.callbacks.onStateChange?.(oldState, newState);
    this.renderUI();
  }
  
  /**
   * Get current state
   */
  getState(): GameState {
    return this.state;
  }
  
  /**
   * Start playing a level
   */
  startLevel(levelId: string): void {
    this.currentLevelId = levelId;
    this.setState('playing');
    this.callbacks.onStartGame?.(levelId);
  }
  
  /**
   * End level with results
   */
  endLevel(score: number, time: number, goalsCompleted: number, totalGoals: number): void {
    // Calculate rank based on goals and score
    const goalPercent = goalsCompleted / totalGoals;
    let rank: LevelResult['rank'];
    
    if (goalPercent >= 1.0 && score >= 50000) rank = 'S';
    else if (goalPercent >= 0.75) rank = 'A';
    else if (goalPercent >= 0.5) rank = 'B';
    else if (goalPercent >= 0.25) rank = 'C';
    else rank = 'D';
    
    this.lastResult = {
      levelId: this.currentLevelId,
      score,
      time,
      goalsCompleted,
      totalGoals,
      rank
    };
    
    this.setState('results');
  }
  
  /**
   * Render UI based on current state
   */
  private renderUI(): void {
    this.uiContainer.innerHTML = '';
    
    switch (this.state) {
      case 'loading':
        this.renderLoading();
        break;
      case 'title':
        this.renderTitle();
        break;
      case 'menu':
        this.renderMenu();
        break;
      case 'level_select':
        this.renderLevelSelect();
        break;
      case 'playing':
        // HUD is handled separately
        break;
      case 'paused':
        this.renderPauseMenu();
        break;
      case 'results':
        this.renderResults();
        break;
      case 'story':
        // Story cutscenes handled separately
        break;
    }
  }
  
  private renderLoading(): void {
    this.uiContainer.innerHTML = `
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        color: #00FF88;
        font-family: 'Press Start 2P', monospace;
      ">
        <div style="font-size: 24px; margin-bottom: 20px;">LOADING...</div>
        <div style="
          width: 200px;
          height: 4px;
          background: #333;
          border-radius: 2px;
        ">
          <div style="
            width: 50%;
            height: 100%;
            background: #00FF88;
            border-radius: 2px;
            animation: loading 1s infinite;
          "></div>
        </div>
      </div>
    `;
  }
  
  private renderTitle(): void {
    this.uiContainer.innerHTML = `
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
        pointer-events: auto;
      ">
        <div style="
          font-size: 64px;
          font-weight: bold;
          color: #00FF88;
          text-shadow: 4px 4px 0px #004422, 8px 8px 0px rgba(0,0,0,0.3);
          font-family: 'Impact', sans-serif;
          letter-spacing: 4px;
          margin-bottom: 10px;
        ">TONY STONKS</div>
        
        <div style="
          font-size: 32px;
          color: #FFD700;
          font-family: 'Impact', sans-serif;
          text-shadow: 2px 2px 0px #665500;
          margin-bottom: 60px;
        ">PRO TRADER</div>
        
        <div style="
          font-size: 18px;
          color: #ffffff;
          animation: blink 1s infinite;
          font-family: 'Courier New', monospace;
        ">PRESS SPACE TO START</div>
        
        <div style="
          position: absolute;
          bottom: 40px;
          color: #666;
          font-size: 12px;
          font-family: 'Courier New', monospace;
        ">© 2026 Diamond Hands Studios</div>
      </div>
      
      <style>
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0.3; }
        }
      </style>
    `;
  }
  
  private renderMenu(): void {
    const menuItems = [
      { label: 'CAREER MODE', action: 'career' },
      { label: 'FREE SKATE', action: 'level_select' },
      { label: 'OPTIONS', action: 'options' },
      { label: 'CREDITS', action: 'credits' }
    ];
    
    this.uiContainer.innerHTML = `
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
        pointer-events: auto;
      ">
        <div style="
          font-size: 48px;
          font-weight: bold;
          color: #00FF88;
          margin-bottom: 60px;
          font-family: 'Impact', sans-serif;
        ">MAIN MENU</div>
        
        <div id="menu-items" style="
          display: flex;
          flex-direction: column;
          gap: 15px;
        ">
          ${menuItems.map((item, i) => `
            <button class="menu-btn" data-action="${item.action}" style="
              width: 280px;
              padding: 15px 30px;
              font-size: 20px;
              font-weight: bold;
              font-family: 'Courier New', monospace;
              color: #fff;
              background: ${i === 0 ? '#00AA66' : '#333'};
              border: 3px solid ${i === 0 ? '#00FF88' : '#555'};
              cursor: pointer;
              transition: all 0.15s;
            ">
              ${item.label}
            </button>
          `).join('')}
        </div>
      </div>
    `;
    
    // Add click handlers
    this.uiContainer.querySelectorAll('.menu-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        if (action === 'level_select' || action === 'career') {
          this.setState('level_select');
        }
      });
      
      btn.addEventListener('mouseenter', () => {
        (btn as HTMLElement).style.background = '#00AA66';
        (btn as HTMLElement).style.borderColor = '#00FF88';
      });
      
      btn.addEventListener('mouseleave', () => {
        (btn as HTMLElement).style.background = '#333';
        (btn as HTMLElement).style.borderColor = '#555';
      });
    });
  }
  
  private renderLevelSelect(): void {
    // Import level data
    const levels = [
      { id: 'ch1_office', name: 'Cubicle Chaos', chapter: 1, unlocked: true },
      { id: 'ch1_garage', name: 'Parking Lot Panic', chapter: 1, unlocked: true },
      { id: 'ch2_downtown', name: 'Street Smart', chapter: 2, unlocked: true }
    ];
    
    this.uiContainer.innerHTML = `
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        align-items: center;
        padding-top: 60px;
        background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
        pointer-events: auto;
      ">
        <div style="
          font-size: 36px;
          font-weight: bold;
          color: #00FF88;
          margin-bottom: 40px;
          font-family: 'Impact', sans-serif;
        ">SELECT LEVEL</div>
        
        <div style="
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          max-width: 900px;
          width: 90%;
        ">
          ${levels.map(level => `
            <button class="level-btn" data-id="${level.id}" style="
              padding: 25px;
              background: ${level.unlocked ? '#2a2a4e' : '#1a1a2e'};
              border: 3px solid ${level.unlocked ? '#4a4a7e' : '#333'};
              border-radius: 8px;
              cursor: ${level.unlocked ? 'pointer' : 'not-allowed'};
              text-align: left;
              transition: all 0.15s;
              opacity: ${level.unlocked ? 1 : 0.5};
            ">
              <div style="
                font-size: 12px;
                color: #888;
                margin-bottom: 5px;
              ">CHAPTER ${level.chapter}</div>
              <div style="
                font-size: 18px;
                font-weight: bold;
                color: #fff;
              ">${level.name}</div>
              ${!level.unlocked ? '<div style="color: #ff6666; font-size: 12px; margin-top: 10px;">🔒 LOCKED</div>' : ''}
            </button>
          `).join('')}
        </div>
        
        <button id="back-btn" style="
          margin-top: 40px;
          padding: 12px 40px;
          font-size: 16px;
          background: #333;
          border: 2px solid #555;
          color: #fff;
          cursor: pointer;
        ">BACK</button>
      </div>
    `;
    
    // Add click handlers
    this.uiContainer.querySelectorAll('.level-btn').forEach(btn => {
      const levelId = btn.getAttribute('data-id');
      btn.addEventListener('click', () => {
        if (levelId) {
          this.startLevel(levelId);
        }
      });
      
      btn.addEventListener('mouseenter', () => {
        (btn as HTMLElement).style.borderColor = '#00FF88';
        (btn as HTMLElement).style.background = '#3a3a5e';
      });
      
      btn.addEventListener('mouseleave', () => {
        (btn as HTMLElement).style.borderColor = '#4a4a7e';
        (btn as HTMLElement).style.background = '#2a2a4e';
      });
    });
    
    this.uiContainer.querySelector('#back-btn')?.addEventListener('click', () => {
      this.setState('menu');
    });
  }
  
  private renderPauseMenu(): void {
    this.uiContainer.innerHTML = `
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background: rgba(0, 0, 0, 0.8);
        pointer-events: auto;
      ">
        <div style="
          font-size: 48px;
          font-weight: bold;
          color: #FFD700;
          margin-bottom: 50px;
          font-family: 'Impact', sans-serif;
        ">PAUSED</div>
        
        <div style="display: flex; flex-direction: column; gap: 15px;">
          <button class="pause-btn" data-action="resume" style="
            width: 200px;
            padding: 15px;
            font-size: 18px;
            background: #00AA66;
            border: 3px solid #00FF88;
            color: #fff;
            cursor: pointer;
          ">RESUME</button>
          
          <button class="pause-btn" data-action="retry" style="
            width: 200px;
            padding: 15px;
            font-size: 18px;
            background: #333;
            border: 3px solid #555;
            color: #fff;
            cursor: pointer;
          ">RETRY</button>
          
          <button class="pause-btn" data-action="quit" style="
            width: 200px;
            padding: 15px;
            font-size: 18px;
            background: #333;
            border: 3px solid #555;
            color: #fff;
            cursor: pointer;
          ">QUIT</button>
        </div>
      </div>
    `;
    
    this.uiContainer.querySelectorAll('.pause-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        switch (action) {
          case 'resume':
            this.setState('playing');
            this.callbacks.onResume?.();
            break;
          case 'retry':
            this.callbacks.onRetry?.();
            this.setState('playing');
            break;
          case 'quit':
            this.callbacks.onQuit?.();
            this.setState('menu');
            break;
        }
      });
    });
  }
  
  private renderResults(): void {
    if (!this.lastResult) return;
    
    const result = this.lastResult;
    const rankColors: Record<string, string> = {
      'S': '#FFD700',
      'A': '#00FF88',
      'B': '#4488FF',
      'C': '#FF8844',
      'D': '#FF4444'
    };
    
    this.uiContainer.innerHTML = `
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
        pointer-events: auto;
      ">
        <div style="
          font-size: 36px;
          color: #fff;
          margin-bottom: 20px;
        ">LEVEL COMPLETE!</div>
        
        <div style="
          font-size: 120px;
          font-weight: bold;
          color: ${rankColors[result.rank]};
          text-shadow: 4px 4px 0px rgba(0,0,0,0.5);
          margin-bottom: 30px;
        ">${result.rank}</div>
        
        <div style="
          background: rgba(0,0,0,0.3);
          padding: 30px 50px;
          border-radius: 10px;
          margin-bottom: 40px;
        ">
          <div style="
            display: flex;
            justify-content: space-between;
            font-size: 20px;
            color: #fff;
            margin-bottom: 15px;
          ">
            <span>SCORE:</span>
            <span style="color: #00FF88;">${result.score.toLocaleString()}</span>
          </div>
          
          <div style="
            display: flex;
            justify-content: space-between;
            font-size: 20px;
            color: #fff;
            margin-bottom: 15px;
          ">
            <span>TIME:</span>
            <span>${this.formatTime(result.time)}</span>
          </div>
          
          <div style="
            display: flex;
            justify-content: space-between;
            font-size: 20px;
            color: #fff;
          ">
            <span>GOALS:</span>
            <span>${result.goalsCompleted} / ${result.totalGoals}</span>
          </div>
        </div>
        
        <div style="display: flex; gap: 20px;">
          <button class="result-btn" data-action="retry" style="
            padding: 15px 40px;
            font-size: 18px;
            background: #00AA66;
            border: 3px solid #00FF88;
            color: #fff;
            cursor: pointer;
          ">RETRY</button>
          
          <button class="result-btn" data-action="next" style="
            padding: 15px 40px;
            font-size: 18px;
            background: #4466AA;
            border: 3px solid #6688CC;
            color: #fff;
            cursor: pointer;
          ">NEXT LEVEL</button>
          
          <button class="result-btn" data-action="menu" style="
            padding: 15px 40px;
            font-size: 18px;
            background: #333;
            border: 3px solid #555;
            color: #fff;
            cursor: pointer;
          ">MENU</button>
        </div>
      </div>
    `;
    
    this.uiContainer.querySelectorAll('.result-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        switch (action) {
          case 'retry':
            this.startLevel(this.currentLevelId);
            break;
          case 'next':
            // TODO: Get next level
            this.setState('level_select');
            break;
          case 'menu':
            this.setState('menu');
            break;
        }
      });
    });
  }
  
  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
