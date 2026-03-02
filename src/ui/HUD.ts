/**
 * HUD - Heads Up Display
 * Shows score, combo, timer, and trick popups
 */

import { ComboEvent, ComboTrick } from '../tricks/ComboSystem';
import { TrickType } from '../tricks/TrickRegistry';

// Color mapping for trick types
const TRICK_TYPE_COLORS: Record<TrickType, string> = {
  flip: '#00FFFF',    // Cyan
  grab: '#FFD700',    // Gold
  grind: '#FF8C00',   // Orange
  manual: '#32CD32',  // Lime
  special: '#FF00FF', // Magenta/Purple
};

const STORAGE_KEY_HAS_PLAYED = 'tonyStonks_hasPlayed';

export class HUD {
  private container: HTMLElement;
  private scoreElement!: HTMLElement;
  private comboElement!: HTMLElement;
  private comboTimerFill!: HTMLElement;
  private trickPopup!: HTMLElement;
  private specialMeter!: HTMLElement;
  private specialFill!: HTMLElement;
  private balanceMeter!: HTMLElement;
  private balanceArrow!: HTMLElement;
  private controlsHint!: HTMLElement;
  private spinCounterElement!: HTMLElement;
  
  private currentScore = 0;
  private displayedScore = 0;
  private specialAmount = 0;
  private lastMultiplier = 1;
  private controlsHidden = false;
  
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
        transition: transform 0.15s ease-out;
      }
      
      .hud-combo-multiplier.pulse {
        animation: multiplierPulse 0.3s ease-out;
      }
      
      @keyframes multiplierPulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.4); color: #FFFF00; }
        100% { transform: scale(1); }
      }
      
      .hud-combo-timer {
        width: 200px;
        height: 6px;
        background: rgba(0,0,0,0.5);
        border-radius: 3px;
        margin-top: 8px;
        overflow: hidden;
        opacity: 0;
        transition: opacity 0.2s;
      }
      
      .hud-combo.active .hud-combo-timer {
        opacity: 1;
      }
      
      .hud-combo-timer-fill {
        height: 100%;
        width: 100%;
        background: linear-gradient(90deg, #FF4444, #FFD700, #00FF88);
        border-radius: 3px;
        transition: width 0.05s linear;
        transform-origin: left;
      }
      
      .hud-combo-timer-fill.urgent {
        animation: timerUrgent 0.3s infinite;
      }
      
      @keyframes timerUrgent {
        0%, 100% { filter: brightness(1); }
        50% { filter: brightness(1.5); background: #FF4444; }
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
      
      .hud-spin-counter {
        position: absolute;
        top: 25%;
        left: 50%;
        transform: translateX(-50%);
        font-size: 48px;
        font-weight: bold;
        color: #FFD700;
        text-shadow: 0 0 20px rgba(255,215,0,0.8), 3px 3px 6px rgba(0,0,0,0.9);
        opacity: 0;
        transition: opacity 0.15s ease-out;
        letter-spacing: 4px;
      }
      
      .hud-spin-counter.active {
        opacity: 1;
        animation: spinPulse 0.15s ease-out;
      }
      
      @keyframes spinPulse {
        0% { transform: translateX(-50%) scale(1.3); }
        100% { transform: translateX(-50%) scale(1); }
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
      <div class="hud-combo-timer">
        <div class="hud-combo-timer-fill"></div>
      </div>
    `;
    this.comboTimerFill = this.comboElement.querySelector('.hud-combo-timer-fill')!;
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
    
    // Spin counter (shown during air spins)
    this.spinCounterElement = document.createElement('div');
    this.spinCounterElement.className = 'hud-spin-counter';
    hud.appendChild(this.spinCounterElement);
    
    // Controls hint (hidden if player has played before)
    this.controlsHint = document.createElement('div');
    this.controlsHint.className = 'hud-controls';
    this.controlsHint.innerHTML = `
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
    
    // Check if player has played before
    const hasPlayed = localStorage.getItem(STORAGE_KEY_HAS_PLAYED) === 'true';
    if (hasPlayed) {
      this.controlsHint.style.display = 'none';
      this.controlsHidden = true;
    }
    
    hud.appendChild(this.controlsHint);
    
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
   * Uses ease-out curve for satisfying score counting
   */
  update(dt: number): void {
    // Smooth score counting with ease-out
    if (this.displayedScore < this.currentScore) {
      const diff = this.currentScore - this.displayedScore;
      
      // Ease-out: fast at first, slows down as it approaches target
      // The larger the diff, the faster we count
      // Minimum speed of 10/sec, max proportional to difference
      const speed = Math.max(10, diff * 3); // Increased speed multiplier for snappier feel
      const increment = Math.max(1, Math.round(speed * dt));
      
      const prevScore = this.displayedScore;
      this.displayedScore = Math.min(this.currentScore, this.displayedScore + increment);
      
      const scoreValue = this.scoreElement.querySelector('.hud-score-value') as HTMLElement;
      if (scoreValue) {
        scoreValue.textContent = this.displayedScore.toLocaleString();
        
        // Add subtle scale pop when score is actively counting up big numbers
        if (diff > 100 && this.displayedScore !== prevScore) {
          // Calculate scale based on how fast we're counting (more = bigger pop)
          const scale = 1 + Math.min(0.15, (increment / 500));
          scoreValue.style.transform = `scale(${scale})`;
          scoreValue.style.transition = 'transform 0.1s ease-out';
          
          // Reset scale shortly after
          setTimeout(() => {
            scoreValue.style.transform = 'scale(1)';
          }, 50);
        }
      }
    }
  }
  
  /**
   * Show trick popup with color based on trick type
   */
  showTrick(name: string, points: number, multiplier: number, trickType?: TrickType): void {
    const nameEl = this.trickPopup.querySelector('.hud-trick-name') as HTMLElement;
    const pointsEl = this.trickPopup.querySelector('.hud-trick-points');
    
    if (nameEl) {
      nameEl.textContent = name;
      // Color based on trick type
      nameEl.style.color = trickType ? TRICK_TYPE_COLORS[trickType] : '#00FFFF';
    }
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
   * Update combo timer bar
   * @param timeRemaining - Time left in ms to extend combo
   * @param maxTime - Maximum combo time in ms
   */
  updateComboTimer(timeRemaining: number, maxTime: number): void {
    const percent = Math.max(0, Math.min(100, (timeRemaining / maxTime) * 100));
    this.comboTimerFill.style.width = `${percent}%`;
    
    // Add urgent animation when timer is low (< 30%)
    if (percent < 30 && percent > 0) {
      this.comboTimerFill.classList.add('urgent');
    } else {
      this.comboTimerFill.classList.remove('urgent');
    }
  }
  
  /**
   * Update combo display with multiplier pulse animation
   */
  updateCombo(tricks: ComboTrick[], totalPoints: number, multiplier: number): void {
    const tricksEl = this.comboElement.querySelector('.hud-combo-tricks') as HTMLElement;
    const scoreEl = this.comboElement.querySelector('.hud-combo-score');
    const multEl = this.comboElement.querySelector('.hud-combo-multiplier') as HTMLElement;
    
    if (tricks.length > 0) {
      this.comboElement.classList.add('active');
      
      // Show last 5 tricks with color coding
      const recentTricks = tricks.slice(-5);
      if (tricksEl) {
        // Create colored spans for each trick
        tricksEl.innerHTML = recentTricks.map(t => {
          const color = TRICK_TYPE_COLORS[t.trick.type] || '#00FFFF';
          return `<span style="color:${color}">${t.trick.displayName}</span>`;
        }).join(' <span style="color:#888">+</span> ');
      }
      if (scoreEl) {
        scoreEl.textContent = (totalPoints * multiplier).toLocaleString();
      }
      if (multEl) {
        multEl.textContent = `× ${multiplier}`;
        
        // Pulse animation when multiplier increases
        if (multiplier > this.lastMultiplier) {
          multEl.classList.remove('pulse');
          void multEl.offsetWidth; // Force reflow
          multEl.classList.add('pulse');
        }
      }
      
      this.lastMultiplier = multiplier;
    } else {
      this.comboElement.classList.remove('active');
      this.lastMultiplier = 1;
    }
  }
  
  /**
   * Handle combo events
   */
  onComboEvent(event: ComboEvent): void {
    switch (event.type) {
      case 'trick_added':
        if (event.trick && event.points !== undefined && event.multiplier !== undefined) {
          this.showTrick(event.trick.displayName, event.points, event.multiplier, event.trick.type);
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
    this.comboTimerFill.style.width = '100%';
    this.comboTimerFill.classList.remove('urgent');
    this.trickPopup.classList.remove('show');
    this.balanceMeter.classList.remove('active');
    this.spinCounterElement.classList.remove('active');
    this.spinCounterElement.textContent = '';
  }
  
  /**
   * Update spin counter display
   * Shows "180", "360", "540", etc. during air spins
   * Pass 0 to hide the counter
   */
  setSpinCounter(degrees: number): void {
    if (degrees >= 180) {
      const displayDegrees = Math.floor(degrees / 180) * 180;
      const newText = `${displayDegrees}°`;
      
      // Only update if changed (avoids animation spam)
      if (this.spinCounterElement.textContent !== newText) {
        this.spinCounterElement.textContent = newText;
        this.spinCounterElement.classList.remove('active');
        void this.spinCounterElement.offsetWidth; // Force reflow
        this.spinCounterElement.classList.add('active');
      }
    } else {
      // Hide when < 180
      this.spinCounterElement.classList.remove('active');
    }
  }
  
  /**
   * Hide controls hint and mark player as having played
   * Called on first input to remember the player knows the controls
   */
  hideControlsHint(): void {
    if (this.controlsHidden) return;
    
    // Fade out the controls hint
    this.controlsHint.style.transition = 'opacity 0.5s ease-out';
    this.controlsHint.style.opacity = '0';
    
    // Hide completely after fade
    setTimeout(() => {
      this.controlsHint.style.display = 'none';
    }, 500);
    
    // Remember for next time
    try {
      localStorage.setItem(STORAGE_KEY_HAS_PLAYED, 'true');
    } catch {
      // localStorage might be unavailable
    }
    
    this.controlsHidden = true;
  }
}
