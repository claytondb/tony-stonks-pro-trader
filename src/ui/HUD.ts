/**
 * HUD - Heads Up Display
 * Shows score, combo, timer, and trick popups
 */

import type { ComboState, ScoreEvent } from '../gameplay/ScoreSystem';
import type { GoalProgress } from '../gameplay/GoalSystem';
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
  private speedChartElement!: HTMLElement;
  private speedBars: HTMLElement[] = [];
  private goalsElement!: HTMLElement;
  private goalsList!: HTMLElement;
  private goalPopup!: HTMLElement;
  private wantedElement!: HTMLElement;

  private currentScore = 0;
  private displayedScore = 0;
  private specialAmount = 0;
  private lastMultiplier = 1;
  private controlsHidden = false;
  private goalSignature = '';
  private goalPopupTimer: ReturnType<typeof setTimeout> | null = null;
  private wantedStars = -1;
  
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
        top: 16px;
        right: 20px;
        font-size: 56px;
        text-align: right;
        background: rgba(0,0,0,0.55);
        border: 2px solid #00FF88;
        border-radius: 10px;
        padding: 8px 18px 6px;
        min-width: 220px;
      }
      
      .hud-score-label {
        font-size: 14px;
        color: #00FF88;
        letter-spacing: 3px;
        font-weight: 700;
      }

      .hud-score-value {
        color: #00FF88;
        font-weight: 900;
        letter-spacing: 1px;
        transition: transform 0.1s ease-out;
      }

      .hud-score-value.negative {
        color: #FF4444;
      }

      /* Speed stock chart */
      .hud-speed-chart {
        position: absolute;
        bottom: 60px;
        right: 20px;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
        pointer-events: none;
      }

      .hud-speed-label {
        font-size: 11px;
        color: #00FF88;
        letter-spacing: 2px;
        font-weight: 700;
        opacity: 0.9;
      }

      .hud-speed-bars {
        display: flex;
        align-items: flex-end;
        gap: 2px;
        height: 28px;
      }

      .hud-speed-bar {
        width: 6px;
        border-radius: 2px 2px 0 0;
        background: #00FF88;
        transition: height 0.15s ease-out, background 0.2s;
        min-height: 2px;
      }
      
      .hud-combo {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        opacity: 0;
        transition: opacity 0.2s;
        background: rgba(0,0,0,0.6);
        border: 2px solid rgba(255,215,0,0.4);
        border-radius: 12px;
        padding: 10px 22px 8px;
        backdrop-filter: blur(4px);
      }
      
      .hud-combo.active {
        opacity: 1;
      }
      
      .hud-combo-tricks {
        font-size: 22px;
        color: #FFD700;
      }
      
      .hud-combo-score {
        font-size: 42px;
        font-weight: 900;
        color: #ffffff;
        text-shadow: 0 0 16px rgba(255,255,255,0.5);
      }
      
      .hud-combo-multiplier {
        font-size: 32px;
        font-weight: 700;
        color: #00FF88;
        transition: transform 0.15s ease-out;
        text-shadow: 0 0 12px rgba(0,255,136,0.6);
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
      
      .hud-special-meter.full {
        animation: specialGlow 0.6s infinite alternate ease-in-out;
        border-color: #FFFF00;
      }
      
      .hud-special-meter.full .hud-special-fill {
        animation: specialPulse 0.5s infinite alternate;
      }
      
      .hud-special-meter.full .hud-special-label {
        animation: specialLabelGlow 0.6s infinite alternate ease-in-out;
      }
      
      @keyframes specialPulse {
        from { filter: brightness(1); }
        to { filter: brightness(1.5); }
      }
      
      @keyframes specialGlow {
        from {
          box-shadow: 0 0 10px #FFD700, 0 0 20px rgba(255, 215, 0, 0.5), inset 0 0 10px rgba(255, 215, 0, 0.3);
        }
        to {
          box-shadow: 0 0 20px #FFFF00, 0 0 40px rgba(255, 215, 0, 0.8), 0 0 60px rgba(255, 107, 0, 0.4), inset 0 0 15px rgba(255, 215, 0, 0.5);
        }
      }
      
      @keyframes specialLabelGlow {
        from {
          color: #FFD700;
          text-shadow: 0 0 5px #FFD700;
        }
        to {
          color: #FFFF00;
          text-shadow: 0 0 10px #FFFF00, 0 0 20px #FFD700;
        }
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

      .hud-goals {
        position: absolute;
        top: 120px;
        right: 20px;
        width: 250px;
        font-size: 13px;
        line-height: 1.45;
        text-align: left;
        background: rgba(0,0,0,0.35);
        border-left: 3px solid rgba(0,255,136,0.7);
        padding: 8px 10px;
        border-radius: 3px;
      }
      .hud-goals-title {
        font-size: 11px;
        letter-spacing: 2px;
        color: rgba(255,255,255,0.55);
        margin-bottom: 4px;
      }
      .hud-goal {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        color: rgba(255,255,255,0.85);
      }
      .hud-goal.done { color: #00FF88; text-decoration: line-through; opacity: 0.75; }
      .hud-goal.failed { color: #FF5555; opacity: 0.6; }
      .hud-goal-detail { color: rgba(255,255,255,0.5); font-size: 11px; white-space: nowrap; }

      .hud-goal-popup {
        position: absolute;
        top: 34%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.7);
        font-size: 30px;
        font-weight: 700;
        color: #00FF88;
        opacity: 0;
        transition: opacity 0.25s ease-out, transform 0.25s ease-out;
        text-align: center;
      }
      .hud-goal-popup.show { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      .hud-goal-popup small { display: block; font-size: 16px; color: #FFD700; font-weight: 400; }

      .hud-wanted {
        position: absolute;
        top: 74px;
        right: 20px;
        font-size: 26px;
        letter-spacing: 3px;
        color: #FFB000;
        opacity: 0;
        transition: opacity 0.25s ease-out;
        text-shadow: 0 0 10px rgba(255,60,0,0.8);
      }
      .hud-wanted.active { opacity: 1; }
      .hud-wanted.hot { animation: wantedPulse 0.6s infinite; }
      @keyframes wantedPulse { 0%,100% { color: #FFB000; } 50% { color: #FF3B30; } }
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
    
    // Stonks counter — prominent with $ sign
    this.scoreElement = document.createElement('div');
    this.scoreElement.className = 'hud-score';
    this.scoreElement.innerHTML = `
      <div class="hud-score-label">📈 STONKS</div>
      <div class="hud-score-value">$0</div>
    `;
    hud.appendChild(this.scoreElement);

    // Speed stock chart (bottom-right, above special meter)
    this.speedChartElement = document.createElement('div');
    this.speedChartElement.className = 'hud-speed-chart';
    const barsContainer = document.createElement('div');
    barsContainer.className = 'hud-speed-bars';
    const numBars = 12;
    for (let i = 0; i < numBars; i++) {
      const bar = document.createElement('div');
      bar.className = 'hud-speed-bar';
      bar.style.height = '2px';
      barsContainer.appendChild(bar);
      this.speedBars.push(bar);
    }
    const speedLabel = document.createElement('div');
    speedLabel.className = 'hud-speed-label';
    speedLabel.textContent = '⚡ SPEED';
    this.speedChartElement.appendChild(speedLabel);
    this.speedChartElement.appendChild(barsContainer);
    hud.appendChild(this.speedChartElement);
    
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
    
    // Goal checklist
    this.goalsElement = document.createElement('div');
    this.goalsElement.className = 'hud-goals';
    this.goalsElement.style.display = 'none';
    this.goalsElement.innerHTML = `<div class="hud-goals-title">GOALS</div><div class="hud-goals-list"></div>`;
    this.goalsList = this.goalsElement.querySelector('.hud-goals-list') as HTMLElement;
    hud.appendChild(this.goalsElement);

    // Goal-complete popup
    this.goalPopup = document.createElement('div');
    this.goalPopup.className = 'hud-goal-popup';
    hud.appendChild(this.goalPopup);

    // Wanted stars
    this.wantedElement = document.createElement('div');
    this.wantedElement.className = 'hud-wanted';
    hud.appendChild(this.wantedElement);

    // Controls hint (hidden if player has played before)
    this.controlsHint = document.createElement('div');
    this.controlsHint.className = 'hud-controls';
    this.controlsHint.innerHTML = `
      W - Push &nbsp; S - Brake &nbsp; A/D - Turn<br>
      SPACE - Ollie (hold to charge)<br>
      J - Flip &nbsp; K - Grab (hold) &nbsp; L - Grind<br>
      Arrows - Trick direction<br>
      ↓ then ↑ - Manual &nbsp; ↑ then ↓ - Nose manual<br>
      SHIFT - Revert &nbsp; Q/E - Spin<br>
      J+K - Special (meter full) &nbsp; ESC - Pause
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
   * Pure display sink for the banked balance.
   *
   * This ASSIGNS. It is deliberately the only thing it does: ScoreSystem is the single
   * authority on what the number is, and the HUD's job is to render it. Nothing in this
   * class may add to `currentScore` — that was the old bug where the grind loop's
   * per-frame setScore() stomped the combo points the combo path had just added.
   */
  setScore(score: number): void {
    if (!Number.isFinite(score)) return;
    if (score < this.displayedScore) {
      // A bail took stonks away: snap down rather than counting backwards forever.
      this.displayedScore = score;
      const el = this.scoreElement.querySelector('.hud-score-value') as HTMLElement;
      if (el) el.textContent = '$' + Math.round(score).toLocaleString();
    }
    this.currentScore = score;
  }

  /**
   * Update speed stock-chart indicator
   * @param speed - current speed (0–20 typical)
   */
  setSpeed(speed: number): void {
    const maxSpeed = 20;
    const numBars = this.speedBars.length;

    // Shift history left and append current reading
    // We track the last N speed values (one per bar)
    const normalized = Math.min(1, speed / maxSpeed);
    const maxBarH = 28;

    // Simple: each bar independently represents current speed
    // For a "stock chart" feel, we keep a rolling history
    if (!this._speedHistory) this._speedHistory = new Array(numBars).fill(0);
    this._speedHistory.push(normalized);
    if (this._speedHistory.length > numBars) this._speedHistory.shift();

    for (let i = 0; i < numBars; i++) {
      const val = this._speedHistory[i] ?? 0;
      const h = Math.max(2, Math.round(val * maxBarH));
      const bar = this.speedBars[i];
      bar.style.height = h + 'px';
      // Color: green when climbing, yellow when high, red at max
      if (val < 0.5) {
        bar.style.background = '#00FF88';
      } else if (val < 0.8) {
        bar.style.background = '#FFD700';
      } else {
        bar.style.background = '#FF4444';
      }
    }
  }
  private _speedHistory?: number[];
  
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
        scoreValue.textContent = '$' + this.displayedScore.toLocaleString();
        
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
   * Render the live combo from ScoreSystem's ComboState. Display only — this never
   * touches the banked score.
   */
  setComboState(state: ComboState | null): void {
    const tricksEl = this.comboElement.querySelector('.hud-combo-tricks') as HTMLElement;
    const scoreEl = this.comboElement.querySelector('.hud-combo-score');
    const multEl = this.comboElement.querySelector('.hud-combo-multiplier') as HTMLElement;

    if (!state || !state.open || state.tricks.length === 0) {
      this.comboElement.classList.remove('active');
      this.lastMultiplier = 1;
      return;
    }

    this.comboElement.classList.add('active');

    const recent = state.tricks.slice(-5);
    if (tricksEl) {
      tricksEl.innerHTML = recent
        .map((t) => `<span style="color:#00FFFF">${t.name}</span>`)
        .join(' <span style="color:#888">+</span> ');
    }
    if (scoreEl) scoreEl.textContent = state.formattedUnrealised;
    if (multEl) {
      multEl.textContent = state.formattedMultiplier;
      if (state.multiplier > this.lastMultiplier + 0.001) {
        multEl.classList.remove('pulse');
        void multEl.offsetWidth;
        multEl.classList.add('pulse');
      }
    }
    this.lastMultiplier = state.multiplier;
    this.updateComboTimer(state.timeRemaining, Math.max(1, state.timeRemaining / Math.max(0.001, state.timeFraction)));
  }

  /**
   * React to a ScoreSystem event. Popups and flashes only — the score value itself
   * arrives through setScore(), so there is exactly one path into the number.
   */
  onScoreEvent(event: ScoreEvent): void {
    switch (event.type) {
      case 'trick':
        this.showTrick(event.trick.name, event.points, event.multiplier, trickTypeFor(event.trick.kind));
        break;

      case 'land':
        this.scoreElement.style.color = '#00FF88';
        setTimeout(() => { this.scoreElement.style.color = ''; }, 300);
        this.comboElement.classList.remove('active');
        break;

      case 'bail':
        this.comboElement.style.color = '#FF4444';
        setTimeout(() => {
          this.comboElement.style.color = '';
          this.comboElement.classList.remove('active');
        }, 500);
        this.showGoalBanner(event.headline, event.formattedLoss, '#FF4444');
        break;

      case 'tierReached':
        this.showGoalBanner(event.label, '', '#FFD700');
        break;

      case 'balanceChanged':
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Goals
  // -------------------------------------------------------------------------

  /** Render the level checklist. Cheap to call every frame: it diffs before touching the DOM. */
  setGoals(goals: GoalProgress[]): void {
    if (!goals || goals.length === 0) {
      this.goalsElement.style.display = 'none';
      this.goalSignature = '';
      return;
    }
    this.goalsElement.style.display = '';

    const sig = goals.map((g) => `${g.id}:${g.current}:${g.complete ? 1 : 0}:${g.failed ? 1 : 0}:${g.secret ? 1 : 0}`).join('|');
    if (sig === this.goalSignature) return;
    this.goalSignature = sig;

    this.goalsList.innerHTML = goals
      .map((g) => {
        const cls = g.complete ? 'hud-goal done' : g.failed ? 'hud-goal failed' : 'hud-goal';
        const label = g.secret && !g.complete ? '???' : escapeHtml(g.description);
        const detail = g.secret && !g.complete ? '' : escapeHtml(g.detail ?? '');
        return `<div class="${cls}"><span>${g.complete ? '\u2714 ' : ''}${label}</span><span class="hud-goal-detail">${detail}</span></div>`;
      })
      .join('');
  }

  /** Big centred banner when a goal completes. */
  showGoalComplete(goal: GoalProgress): void {
    this.showGoalBanner('GOAL COMPLETE', `${goal.description}  +$${goal.reward.toLocaleString()}`, '#00FF88');
  }

  private showGoalBanner(title: string, sub: string, color: string): void {
    this.goalPopup.style.color = color;
    this.goalPopup.innerHTML = `${escapeHtml(title)}${sub ? `<small>${escapeHtml(sub)}</small>` : ''}`;
    this.goalPopup.classList.remove('show');
    void this.goalPopup.offsetWidth;
    this.goalPopup.classList.add('show');
    if (this.goalPopupTimer) clearTimeout(this.goalPopupTimer);
    this.goalPopupTimer = setTimeout(() => this.goalPopup.classList.remove('show'), 2200);
  }

  // -------------------------------------------------------------------------
  // Wanted level
  // -------------------------------------------------------------------------

  /** 0..5 stars. 0 hides the indicator. */
  setWanted(stars: number): void {
    const n = Math.max(0, Math.min(5, Math.round(stars)));
    if (n === this.wantedStars) return;
    this.wantedStars = n;
    if (n <= 0) {
      this.wantedElement.classList.remove('active', 'hot');
      this.wantedElement.textContent = '';
      return;
    }
    this.wantedElement.textContent = '\u2605'.repeat(n) + '\u2606'.repeat(5 - n);
    this.wantedElement.classList.add('active');
    this.wantedElement.classList.toggle('hot', n >= 3);
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
    this._speedHistory = new Array(this.speedBars.length).fill(0);
    this.speedBars.forEach(b => { b.style.height = '2px'; b.style.background = '#00FF88'; });
    
    const scoreValue = this.scoreElement.querySelector('.hud-score-value');
    if (scoreValue) {
      scoreValue.textContent = '$0';
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
    this.lastMultiplier = 1;
    this.goalSignature = '';
    this.goalsList.innerHTML = '';
    this.goalsElement.style.display = 'none';
    this.goalPopup.classList.remove('show');
    this.wantedStars = -1;
    this.setWanted(0);
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** ScoreSystem's TrickKind -> the registry's TrickType, for popup colouring. */
function trickTypeFor(kind: string): TrickType {
  switch (kind) {
    case 'grab': return 'grab';
    case 'grind': return 'grind';
    case 'manual': return 'manual';
    case 'special': return 'special';
    default: return 'flip';
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
