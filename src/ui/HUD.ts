/**
 * HUD - Heads Up Display
 * Shows score, combo, timer, and trick popups
 */

import { ComboEvent, ComboTrick } from '../tricks/ComboSystem';

export class HUD {
  private container: HTMLElement;
  private scoreElement!: HTMLElement;
  private comboElement!: HTMLElement;
  private trickPopup!: HTMLElement;
  private specialMeter!: HTMLElement;
  private specialFill!: HTMLElement;
  private balanceMeter!: HTMLElement;
  private balanceArrow!: HTMLElement;
  
  private currentScore = 0;
  private displayedScore = 0;
  private specialAmount = 0;
  
  constructor(container: HTMLElement) {
    this.container = container;
    this.createElements();
  }
  
  private createElements(): void {
    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
      .hud-container {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        font-family: 'Kanit', sans-serif;
        color: white;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
      }
      
      .hud-score {
        position: absolute;
        top: 20px;
        right: 20px;
        font-size: 48px;
        text-align: right;
      }
      
      .hud-score-label {
        font-size: 16px;
        color: #00FF88;
        letter-spacing: 2px;
      }
      
      .hud-combo {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        opacity: 0;
        transition: opacity 0.2s;
      }
      
      .hud-combo.active {
        opacity: 1;
      }
      
      .hud-combo-tricks {
        font-size: 24px;
        color: #FFD700;
      }
      
      .hud-combo-score {
        font-size: 36px;
      }
      
      .hud-combo-multiplier {
        font-size: 28px;
        color: #00FF88;
      }
      
      .hud-trick-popup {
        position: absolute;
        bottom: 40%;
        left: 50%;
        transform: translateX(-50%);
        text-align: center;
        opacity: 0;
        transition: opacity 0.3s, transform 0.3s;
      }
      
      .hud-trick-popup.show {
        opacity: 1;
        animation: trickPop 0.5s ease-out;
      }
      
      @keyframes trickPop {
        0% { transform: translateX(-50%) scale(0.5); opacity: 0; }
        50% { transform: translateX(-50%) scale(1.2); }
        100% { transform: translateX(-50%) scale(1); opacity: 1; }
      }
      
      .hud-trick-name {
        font-size: 32px;
        color: #00FFFF;
      }
      
      .hud-trick-points {
        font-size: 24px;
        color: #00FF88;
      }
      
      .hud-special-meter {
        position: absolute;
        bottom: 20px;
        right: 20px;
        width: 150px;
        height: 20px;
        background: rgba(0,0,0,0.5);
        border: 2px solid #FFD700;
        border-radius: 4px;
        overflow: hidden;
      }
      
      .hud-special-fill {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #FFD700, #FF6B00);
        transition: width 0.3s;
      }
      
      .hud-special-meter.full .hud-special-fill {
        animation: specialPulse 0.5s infinite alternate;
      }
      
      @keyframes specialPulse {
        from { filter: brightness(1); }
        to { filter: brightness(1.5); }
      }
      
      .hud-special-label {
        position: absolute;
        top: -18px;
        right: 0;
        font-size: 14px;
        color: #FFD700;
        letter-spacing: 2px;
      }
      
      .hud-balance-meter {
        position: absolute;
        top: 35%;
        left: 50%;
        transform: translateX(-50%);
        width: 300px;
        height: 20px;
        background: rgba(0,0,0,0.7);
        border: 2px solid #FFD700;
        border-radius: 10px;
        opacity: 0;
        transition: opacity 0.2s;
      }
      
      .hud-balance-meter.active {
        opacity: 1;
      }
      
      .hud-balance-label {
        position: absolute;
        top: -25px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 16px;
        color: #FFD700;
        letter-spacing: 2px;
      }
      
      .hud-balance-zones {
        position: absolute;
        width: 100%;
        height: 100%;
        display: flex;
        border-radius: 8px;
        overflow: hidden;
      }
      
      .hud-balance-danger {
        width: 15%;
        height: 100%;
        background: linear-gradient(90deg, #FF0000, #FF4444);
      }
      
      .hud-balance-safe {
        flex: 1;
        background: linear-gradient(90deg, #44FF44, #00FF88, #44FF44);
      }
      
      .hud-balance-arrow {
        position: absolute;
        top: -12px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 12px solid transparent;
        border-right: 12px solid transparent;
        border-top: 18px solid #FFFFFF;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
        transition: left 0.05s;
      }
      
      .hud-controls {
        position: absolute;
        bottom: 20px;
        left: 20px;
        font-size: 12px;
        font-family: 'Kanit', sans-serif;
        color: rgba(255,255,255,0.6);
        line-height: 1.6;
      }
      
      .hud-title {
        position: absolute;
        top: 20px;
        left: 20px;
        font-size: 24px;
        color: #00FF88;
      }
    `;
    document.head.appendChild(style);
    
    // Create HUD container
    const hud = document.createElement('div');
    hud.className = 'hud-container';
    
    // Title
    const title = document.createElement('div');
    title.className = 'hud-title';
    title.textContent = 'TONY STONKS';
    hud.appendChild(title);
    
    // Stonks counter
    this.scoreElement = document.createElement('div');
    this.scoreElement.className = 'hud-score';
    this.scoreElement.innerHTML = `
      <div class="hud-score-label">📈 STONKS</div>
      <div class="hud-score-value">0</div>
    `;
    hud.appendChild(this.scoreElement);
    
    // Combo display
    this.comboElement = document.createElement('div');
    this.comboElement.className = 'hud-combo';
    this.comboElement.innerHTML = `
      <div class="hud-combo-tricks"></div>
      <div class="hud-combo-score"></div>
      <div class="hud-combo-multiplier"></div>
    `;
    hud.appendChild(this.comboElement);
    
    // Trick popup
    this.trickPopup = document.createElement('div');
    this.trickPopup.className = 'hud-trick-popup';
    this.trickPopup.innerHTML = `
      <div class="hud-trick-name"></div>
      <div class="hud-trick-points"></div>
    `;
    hud.appendChild(this.trickPopup);
    
    // Special meter
    this.specialMeter = document.createElement('div');
    this.specialMeter.className = 'hud-special-meter';
    this.specialMeter.innerHTML = `
      <div class="hud-special-label">SPECIAL</div>
      <div class="hud-special-fill"></div>
    `;
    this.specialFill = this.specialMeter.querySelector('.hud-special-fill')!;
    hud.appendChild(this.specialMeter);
    
    // Balance meter (shown when grinding)
    this.balanceMeter = document.createElement('div');
    this.balanceMeter.className = 'hud-balance-meter';
    this.balanceMeter.innerHTML = `
      <div class="hud-balance-label">⚖️ BALANCE</div>
      <div class="hud-balance-zones">
        <div class="hud-balance-danger"></div>
        <div class="hud-balance-safe"></div>
        <div class="hud-balance-danger"></div>
      </div>
      <div class="hud-balance-arrow"></div>
    `;
    this.balanceArrow = this.balanceMeter.querySelector('.hud-balance-arrow')!;
    hud.appendChild(this.balanceMeter);
    
    // Controls hint
    const controls = document.createElement('div');
    controls.className = 'hud-controls';
    controls.innerHTML = `
      W - Push forward<br>
      S - Brake<br>
      A/D - Turn<br>
      SPACE - Ollie<br>
      ↑ - Grind (near rail)<br>
      ← + WASD - Flip tricks<br>
      → + WASD - Grab tricks<br>
      Q/E - Spin (in air)<br>
      ESC - Pause
    `;
    hud.appendChild(controls);
    
    this.container.appendChild(hud);
  }
  
  /**
   * Update score display
   */
  setScore(score: number): void {
    this.currentScore = score;
  }
  
  /**
   * Update displayed score (called each frame for smooth counting)
   */
  update(dt: number): void {
    // Smooth score counting
    if (this.displayedScore < this.currentScore) {
      const diff = this.currentScore - this.displayedScore;
      const increment = Math.max(1, Math.floor(diff * dt * 5));
      this.displayedScore = Math.min(this.currentScore, this.displayedScore + increment);
      
      const scoreValue = this.scoreElement.querySelector('.hud-score-value');
      if (scoreValue) {
        scoreValue.textContent = this.displayedScore.toLocaleString();
      }
    }
  }
  
  /**
   * Show trick popup
   */
  showTrick(name: string, points: number, multiplier: number): void {
    const nameEl = this.trickPopup.querySelector('.hud-trick-name');
    const pointsEl = this.trickPopup.querySelector('.hud-trick-points');
    
    if (nameEl) nameEl.textContent = name;
    if (pointsEl) pointsEl.textContent = `+${points} × ${multiplier}`;
    
    this.trickPopup.classList.remove('show');
    // Force reflow
    void this.trickPopup.offsetWidth;
    this.trickPopup.classList.add('show');
    
    // Hide after delay
    setTimeout(() => {
      this.trickPopup.classList.remove('show');
    }, 1500);
  }
  
  /**
   * Update combo display
   */
  updateCombo(tricks: ComboTrick[], totalPoints: number, multiplier: number): void {
    const tricksEl = this.comboElement.querySelector('.hud-combo-tricks');
    const scoreEl = this.comboElement.querySelector('.hud-combo-score');
    const multEl = this.comboElement.querySelector('.hud-combo-multiplier');
    
    if (tricks.length > 0) {
      this.comboElement.classList.add('active');
      
      // Show last 5 tricks
      const recentTricks = tricks.slice(-5);
      if (tricksEl) {
        tricksEl.textContent = recentTricks.map(t => t.trick.displayName).join(' + ');
      }
      if (scoreEl) {
        scoreEl.textContent = (totalPoints * multiplier).toLocaleString();
      }
      if (multEl) {
        multEl.textContent = `× ${multiplier}`;
      }
    } else {
      this.comboElement.classList.remove('active');
    }
  }
  
  /**
   * Handle combo events
   */
  onComboEvent(event: ComboEvent): void {
    switch (event.type) {
      case 'trick_added':
        if (event.trick && event.points !== undefined && event.multiplier !== undefined) {
          this.showTrick(event.trick.displayName, event.points, event.multiplier);
        }
        break;
        
      case 'combo_landed':
        if (event.totalScore !== undefined) {
          this.currentScore += event.totalScore;
          // Flash effect
          this.scoreElement.style.color = '#00FF88';
          setTimeout(() => {
            this.scoreElement.style.color = '';
          }, 300);
        }
        this.comboElement.classList.remove('active');
        break;
        
      case 'combo_failed':
        // Red flash
        this.comboElement.style.color = '#FF4444';
        setTimeout(() => {
          this.comboElement.style.color = '';
          this.comboElement.classList.remove('active');
        }, 500);
        break;
    }
  }
  
  /**
   * Update special meter
   */
  setSpecial(amount: number): void {
    this.specialAmount = Math.min(1, Math.max(0, amount));
    this.specialFill.style.width = `${this.specialAmount * 100}%`;
    
    if (this.specialAmount >= 1) {
      this.specialMeter.classList.add('full');
    } else {
      this.specialMeter.classList.remove('full');
    }
  }
  
  /**
   * Show/hide balance meter
   */
  setBalanceVisible(visible: boolean): void {
    if (visible) {
      this.balanceMeter.classList.add('active');
    } else {
      this.balanceMeter.classList.remove('active');
    }
  }
  
  /**
   * Update balance position (0 = left edge, 0.5 = center, 1 = right edge)
   */
  setBalance(position: number): void {
    const percent = Math.min(100, Math.max(0, position * 100));
    this.balanceArrow.style.left = `${percent}%`;
  }
  
  /**
   * Reset HUD for new level
   */
  reset(): void {
    this.currentScore = 0;
    this.displayedScore = 0;
    this.specialAmount = 0;
    
    const scoreValue = this.scoreElement.querySelector('.hud-score-value');
    if (scoreValue) {
      scoreValue.textContent = '0';
    }
    
    this.specialFill.style.width = '0%';
    this.specialMeter.classList.remove('full');
    this.comboElement.classList.remove('active');
    this.trickPopup.classList.remove('show');
    this.balanceMeter.classList.remove('active');
  }
}
