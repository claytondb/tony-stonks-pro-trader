/**
 * Chase HUD
 * Shows the chase status during chase levels
 */

import { ChaseState } from '../story/ChaseMechanic';

export class ChaseHUD {
  private container: HTMLElement;
  private _isVisible = false;
  private chaseBar: HTMLElement | null = null;
  private warningText: HTMLElement | null = null;
  private boostIndicator: HTMLElement | null = null;
  
  constructor(container: HTMLElement) {
    this.container = container;
    this.createElements();
  }
  
  private createElements(): void {
    const style = document.createElement('style');
    style.textContent = `
      .chase-hud {
        position: absolute;
        top: 100px;
        left: 20px;
        width: 200px;
        font-family: 'Kanit', sans-serif;
        opacity: 0;
        transition: opacity 0.3s;
        pointer-events: none;
      }
      
      .chase-hud.visible {
        opacity: 1;
      }
      
      .chase-label {
        color: #ff4444;
        font-size: 14px;
        letter-spacing: 2px;
        margin-bottom: 5px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .chase-icon {
        animation: pulseIcon 0.5s infinite alternate;
      }
      
      @keyframes pulseIcon {
        from { opacity: 0.7; }
        to { opacity: 1; }
      }
      
      .chase-bar-container {
        width: 100%;
        height: 12px;
        background: rgba(0, 0, 0, 0.5);
        border: 2px solid #ff4444;
        border-radius: 6px;
        overflow: hidden;
        position: relative;
      }
      
      .chase-bar-fill {
        height: 100%;
        transition: width 0.1s, background 0.3s;
        border-radius: 4px;
      }
      
      .chase-bar-fill.safe {
        background: linear-gradient(90deg, #00ff88, #00aa55);
      }
      
      .chase-bar-fill.warning {
        background: linear-gradient(90deg, #ffff00, #ffaa00);
      }
      
      .chase-bar-fill.danger {
        background: linear-gradient(90deg, #ff8800, #ff4400);
        animation: dangerPulse 0.5s infinite alternate;
      }
      
      .chase-bar-fill.critical {
        background: linear-gradient(90deg, #ff0000, #aa0000);
        animation: criticalPulse 0.3s infinite alternate;
      }
      
      @keyframes dangerPulse {
        from { filter: brightness(1); }
        to { filter: brightness(1.3); }
      }
      
      @keyframes criticalPulse {
        from { filter: brightness(1); transform: scaleY(1); }
        to { filter: brightness(1.5); transform: scaleY(1.1); }
      }
      
      .chase-warning {
        color: #ff4444;
        font-size: 18px;
        font-weight: bold;
        margin-top: 10px;
        text-shadow: 0 0 10px #ff0000;
        animation: warningBlink 0.4s infinite alternate;
        text-align: center;
      }
      
      @keyframes warningBlink {
        from { opacity: 0.6; }
        to { opacity: 1; }
      }
      
      .chase-boost {
        margin-top: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
        color: #00ff88;
        font-size: 12px;
      }
      
      .chase-boost-bar {
        flex: 1;
        height: 6px;
        background: rgba(0, 0, 0, 0.5);
        border-radius: 3px;
        overflow: hidden;
      }
      
      .chase-boost-fill {
        height: 100%;
        background: linear-gradient(90deg, #00ff88, #00ffff);
        transition: width 0.1s;
        border-radius: 3px;
      }
    `;
    document.head.appendChild(style);
    
    const hud = document.createElement('div');
    hud.className = 'chase-hud';
    hud.innerHTML = `
      <div class="chase-label">
        <span class="chase-icon">🚨</span>
        <span>SEC AGENTS</span>
      </div>
      <div class="chase-bar-container">
        <div class="chase-bar-fill safe" style="width: 50%"></div>
      </div>
      <div class="chase-warning" style="display: none">THEY'RE CATCHING UP!</div>
      <div class="chase-boost">
        <span>⚡ BOOST</span>
        <div class="chase-boost-bar">
          <div class="chase-boost-fill" style="width: 0%"></div>
        </div>
      </div>
    `;
    
    this.container.appendChild(hud);
    this.chaseBar = hud.querySelector('.chase-bar-fill');
    this.warningText = hud.querySelector('.chase-warning');
    this.boostIndicator = hud.querySelector('.chase-boost-fill');
  }
  
  /**
   * Show the chase HUD
   */
  show(): void {
    this._isVisible = true;
    const hud = this.container.querySelector('.chase-hud');
    if (hud) hud.classList.add('visible');
  }
  
  /**
   * Hide the chase HUD
   */
  hide(): void {
    this._isVisible = false;
    const hud = this.container.querySelector('.chase-hud');
    if (hud) hud.classList.remove('visible');
  }
  
  /**
   * Check if visible
   */
  get isVisible(): boolean {
    return this._isVisible;
  }
  
  /**
   * Update the chase display
   */
  update(state: ChaseState): void {
    if (!this.chaseBar || !this.warningText || !this.boostIndicator) return;
    
    // Update distance bar
    this.chaseBar.style.width = `${state.chaseDistance}%`;
    
    // Update warning level colors
    this.chaseBar.className = `chase-bar-fill ${state.warningLevel}`;
    
    // Show/hide warning text
    this.warningText.style.display = state.warningLevel === 'critical' ? 'block' : 'none';
    
    // Update boost indicator
    const boostPercent = (state.playerSpeedBoost / 20) * 100;
    this.boostIndicator.style.width = `${boostPercent}%`;
  }
}
