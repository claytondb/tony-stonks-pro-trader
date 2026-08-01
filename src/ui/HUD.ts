/**
 * HUD - Heads Up Display
 *
 * Visual language (see refs/scene-outside2.png, refs/scene-office3.png):
 *   chunky rounded panels, dark translucent backing, light outline, bold condensed type,
 *   gold + green accents. Stonks counter top-left, WANTED stars top-right, goal checklist
 *   under the stars, SPEED bottom-left, BOOST bottom-right, combo + balance centre column.
 *
 * Everything is sized off a single CSS unit `--u`, which is `clamp(11px, 1.55vh, 16px)`.
 * That makes the whole HUD scale with viewport height with no JS resize handler:
 *   1600x900  -> u = 13.95px
 *   1920x1080 -> u = 16.00px
 */

import type { ComboState, ScoreEvent } from '../gameplay/ScoreSystem';
import type { GoalProgress } from '../gameplay/GoalSystem';
import { TrickType } from '../tricks/TrickRegistry';

// Color mapping for trick types
const TRICK_TYPE_COLORS: Record<TrickType, string> = {
  flip: '#5FE3FF',    // Cyan
  grab: '#FFC01E',    // Gold
  grind: '#FF8C00',   // Orange
  manual: '#3BE38B',  // Lime
  special: '#FF6BE8', // Magenta
};

const STORAGE_KEY_HAS_PLAYED = 'tonyStonks_hasPlayed';

/** Number of segments in the bottom bars. */
const SPEED_SEGMENTS = 12;
const BOOST_SEGMENTS = 8;
/** WANTED is a four-star system, driven by PoliceSquad.heatLevel (0..1). */
const WANTED_STARS = 4;

interface GoalRow {
  root: HTMLElement;
  text: HTMLElement;
  detail: HTMLElement;
  bar: HTMLElement | null;
  isTier: boolean;
}

export class HUD {
  private container: HTMLElement;
  private scoreElement!: HTMLElement;
  private scoreValue!: HTMLElement;
  private deltaElement!: HTMLElement;
  private comboElement!: HTMLElement;
  private comboTricks!: HTMLElement;
  private comboScore!: HTMLElement;
  private comboMult!: HTMLElement;
  private comboTimerFill!: HTMLElement;
  private trickPopup!: HTMLElement;
  private trickName!: HTMLElement;
  private trickPoints!: HTMLElement;
  private specialMeter!: HTMLElement;
  private specialSegments: HTMLElement[] = [];
  private balanceMeter!: HTMLElement;
  private balanceArrow!: HTMLElement;
  private controlsHint!: HTMLElement;
  private spinCounterElement!: HTMLElement;
  private speedChartElement!: HTMLElement;
  private speedBars: HTMLElement[] = [];
  private goalsElement!: HTMLElement;
  private goalsCount!: HTMLElement;
  private goalsTiers!: HTMLElement;
  private goalsList!: HTMLElement;
  private goalPopup!: HTMLElement;
  private wantedElement!: HTMLElement;
  private wantedStarEls: HTMLElement[] = [];

  private currentScore = 0;
  private displayedScore = 0;
  private specialAmount = 0;
  private lastMultiplier = 1;
  private controlsHidden = false;
  private goalRows = new Map<string, GoalRow>();
  private goalOrderSig = '';
  private goalPopupTimer: ReturnType<typeof setTimeout> | null = null;
  private deltaTimer: ReturnType<typeof setTimeout> | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private wantedStars = -1;
  /** True until the first real setScore(), so the opening balance is not reported as a gain. */
  private suppressDelta = true;

  constructor(container: HTMLElement) {
    this.container = container;
    this.createElements();
  }

  private createElements(): void {
    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
      .hud-container {
        --u: clamp(11px, 1.55vh, 16px);
        --gold: #FFC01E;
        --green: #3BE38B;
        --red: #FF5A3C;
        --ink: rgba(255,255,255,0.92);
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        font-family: 'Kanit', 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif;
        font-stretch: condensed;
        color: var(--ink);
        text-shadow: 0 calc(var(--u) * 0.12) calc(var(--u) * 0.2) rgba(0,0,0,0.85);
        -webkit-font-smoothing: antialiased;
      }

      /* ---- shared chunky panel ------------------------------------------ */
      .hud-panel {
        background: linear-gradient(180deg, rgba(26,29,38,0.88) 0%, rgba(9,10,14,0.92) 100%);
        border: calc(var(--u) * 0.15) solid rgba(255,255,255,0.24);
        border-radius: calc(var(--u) * 0.85);
        box-shadow:
          0 calc(var(--u) * 0.25) calc(var(--u) * 0.9) rgba(0,0,0,0.55),
          inset 0 calc(var(--u) * 0.09) 0 rgba(255,255,255,0.14);
      }

      /* ---- STONKS hero counter (top-left) -------------------------------- */
      .hud-stonks {
        position: absolute;
        top: calc(var(--u) * 1.0);
        left: calc(var(--u) * 1.1);
        display: flex;
        align-items: center;
        gap: calc(var(--u) * 0.65);
        padding: calc(var(--u) * 0.42) calc(var(--u) * 1.0) calc(var(--u) * 0.42) calc(var(--u) * 0.42);
      }
      .hud-coin {
        width: calc(var(--u) * 2.15);
        height: calc(var(--u) * 2.15);
        flex: 0 0 auto;
        border-radius: 50%;
        background: radial-gradient(circle at 34% 28%, #FFEFAF 0%, #FFC01E 52%, #C88300 100%);
        border: calc(var(--u) * 0.13) solid rgba(120,76,0,0.9);
        box-shadow: inset 0 calc(var(--u) * -0.14) calc(var(--u) * 0.2) rgba(120,76,0,0.55);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: calc(var(--u) * 1.25);
        font-weight: 900;
        color: #6B4400;
        text-shadow: 0 1px 0 rgba(255,255,255,0.45);
      }
      .hud-stonks-text { display: flex; flex-direction: column; line-height: 1; }
      .hud-stonks-label {
        font-size: calc(var(--u) * 0.66);
        font-weight: 800;
        letter-spacing: calc(var(--u) * 0.16);
        color: var(--green);
        margin-bottom: calc(var(--u) * 0.13);
      }
      .hud-stonks-value {
        font-size: calc(var(--u) * 1.95);
        font-weight: 900;
        letter-spacing: calc(var(--u) * 0.01);
        color: #FFFFFF;
        font-variant-numeric: tabular-nums;
        transition: color 0.15s, transform 0.1s ease-out;
        transform-origin: left center;
      }
      .hud-stonks-value.gain { color: var(--green); }
      .hud-stonks-value.loss { color: var(--red); }

      /* rising / falling delta ticker */
      .hud-delta {
        position: absolute;
        top: calc(var(--u) * 4.55);
        left: calc(var(--u) * 1.55);
        font-size: calc(var(--u) * 1.05);
        font-weight: 900;
        letter-spacing: calc(var(--u) * 0.04);
        font-variant-numeric: tabular-nums;
        opacity: 0;
        transform: translateY(0);
        transition: opacity 0.35s ease-out, transform 0.35s ease-out;
        white-space: nowrap;
      }
      .hud-delta.up { color: var(--green); text-shadow: 0 0 calc(var(--u) * 0.6) rgba(59,227,139,0.6), 0 2px 3px rgba(0,0,0,0.9); }
      .hud-delta.down { color: var(--red); text-shadow: 0 0 calc(var(--u) * 0.6) rgba(255,90,60,0.6), 0 2px 3px rgba(0,0,0,0.9); }
      .hud-delta.show { opacity: 1; }
      .hud-delta.show.up { transform: translateY(calc(var(--u) * -0.45)); }
      .hud-delta.show.down { transform: translateY(calc(var(--u) * 0.45)); }

      /* ---- WANTED (top-right) ------------------------------------------- */
      .hud-wanted {
        position: absolute;
        top: calc(var(--u) * 1.0);
        right: calc(var(--u) * 1.1);
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: calc(var(--u) * 0.28);
        opacity: 0;
        transition: opacity 0.25s ease-out;
      }
      .hud-wanted.active { opacity: 1; }
      .hud-wanted-stars {
        display: flex;
        gap: calc(var(--u) * 0.18);
        padding: calc(var(--u) * 0.22) calc(var(--u) * 0.5);
      }
      .hud-star {
        font-size: calc(var(--u) * 1.5);
        line-height: 1;
        color: #444B57;
        text-shadow: 0 1px 0 rgba(0,0,0,0.8);
        transition: color 0.2s, text-shadow 0.2s;
      }
      .hud-star.on {
        color: var(--gold);
        text-shadow: 0 0 calc(var(--u) * 0.5) rgba(255,150,0,0.9), 0 1px 0 rgba(0,0,0,0.8);
      }
      .hud-wanted-tag {
        padding: calc(var(--u) * 0.12) calc(var(--u) * 0.65) calc(var(--u) * 0.2);
        font-size: calc(var(--u) * 0.9);
        font-weight: 900;
        letter-spacing: calc(var(--u) * 0.16);
        color: #FFFFFF;
      }
      .hud-wanted.hot .hud-wanted-tag { animation: wantedPulse 0.7s infinite; }
      @keyframes wantedPulse { 0%,100% { color: #FFFFFF; } 50% { color: var(--red); } }

      /* ---- GOAL PANEL (top-right, under WANTED) -------------------------- */
      .hud-goals {
        position: absolute;
        top: calc(var(--u) * 6.4);
        right: calc(var(--u) * 1.1);
        width: calc(var(--u) * 20.5);
        padding: calc(var(--u) * 0.55) calc(var(--u) * 0.7) calc(var(--u) * 0.6);
        text-align: left;
      }
      .hud-goals-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: calc(var(--u) * 0.4);
      }
      .hud-goals-title {
        font-size: calc(var(--u) * 0.72);
        font-weight: 900;
        letter-spacing: calc(var(--u) * 0.18);
        color: rgba(255,255,255,0.6);
      }
      .hud-goals-count {
        font-size: calc(var(--u) * 0.8);
        font-weight: 900;
        color: var(--gold);
        font-variant-numeric: tabular-nums;
      }

      /* score tiers get their own gold-tinted block */
      .hud-goals-tiers {
        background: rgba(255,192,30,0.09);
        border: 1px solid rgba(255,192,30,0.32);
        border-radius: calc(var(--u) * 0.45);
        padding: calc(var(--u) * 0.32) calc(var(--u) * 0.45) calc(var(--u) * 0.38);
        margin-bottom: calc(var(--u) * 0.45);
      }
      .hud-goals-tiers::before {
        content: 'SCORE GOALS';
        display: block;
        font-size: calc(var(--u) * 0.62);
        font-weight: 900;
        letter-spacing: calc(var(--u) * 0.14);
        color: rgba(255,192,30,0.85);
        margin-bottom: calc(var(--u) * 0.22);
      }
      .hud-tier {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        column-gap: calc(var(--u) * 0.5);
        align-items: baseline;
      }
      .hud-tier + .hud-tier { margin-top: calc(var(--u) * 0.26); }
      .hud-tier-name {
        font-size: calc(var(--u) * 0.86);
        font-weight: 900;
        letter-spacing: calc(var(--u) * 0.05);
        color: #FFF0CC;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .hud-tier-detail {
        font-size: calc(var(--u) * 0.74);
        color: rgba(255,255,255,0.62);
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .hud-tier-bar {
        grid-column: 1 / 3;
        height: calc(var(--u) * 0.26);
        margin-top: calc(var(--u) * 0.14);
        background: rgba(0,0,0,0.55);
        border-radius: 99px;
        overflow: hidden;
      }
      .hud-tier-bar > i {
        display: block;
        height: 100%;
        width: 0%;
        border-radius: 99px;
        background: linear-gradient(90deg, #FFC01E, #FF8A00);
        transition: width 0.2s ease-out;
      }
      .hud-tier.done .hud-tier-name { color: var(--green); }
      .hud-tier.done .hud-tier-detail { color: var(--green); opacity: 0.85; }
      .hud-tier.done .hud-tier-bar > i { background: linear-gradient(90deg, #3BE38B, #17A96A); }

      /* one objective per row: description left, progress right, never overlapping */
      .hud-goal {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        column-gap: calc(var(--u) * 0.55);
        align-items: start;
        padding: calc(var(--u) * 0.22) 0;
        border-top: 1px solid rgba(255,255,255,0.08);
      }
      .hud-goal:first-child { border-top: none; }
      .hud-goal-text {
        font-size: calc(var(--u) * 0.84);
        line-height: 1.16;
        color: rgba(255,255,255,0.88);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        overflow-wrap: anywhere;
        min-width: 0;
      }
      .hud-goal-detail {
        font-size: calc(var(--u) * 0.72);
        line-height: 1.35;
        color: rgba(255,255,255,0.5);
        white-space: nowrap;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .hud-goal.done .hud-goal-text { color: var(--green); }
      .hud-goal.done .hud-goal-detail { color: var(--green); opacity: 0.8; }
      .hud-goal.failed .hud-goal-text,
      .hud-goal.failed .hud-goal-detail { color: #FF7A66; opacity: 0.65; }
      .hud-goal.secret .hud-goal-text { color: rgba(255,255,255,0.45); letter-spacing: 0.15em; }

      /* ---- COMBO (top-centre) ------------------------------------------- */
      .hud-combo {
        position: absolute;
        top: calc(var(--u) * 1.0);
        left: 50%;
        transform: translateX(-50%) scale(0.94);
        transform-origin: top center;
        text-align: center;
        min-width: calc(var(--u) * 20);
        max-width: min(46vw, calc(var(--u) * 40));
        padding: calc(var(--u) * 0.45) calc(var(--u) * 1.0) calc(var(--u) * 0.6);
        opacity: 0;
        transition: opacity 0.18s ease-out, transform 0.18s ease-out;
        border-color: rgba(255,192,30,0.45);
      }
      .hud-combo.active { opacity: 1; transform: translateX(-50%) scale(1); }
      .hud-combo-tricks {
        font-size: calc(var(--u) * 0.92);
        font-weight: 600;
        line-height: 1.18;
        color: #7FE9FF;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        overflow-wrap: anywhere;
      }
      .hud-combo-main {
        display: flex;
        align-items: baseline;
        justify-content: center;
        gap: calc(var(--u) * 0.7);
        margin-top: calc(var(--u) * 0.1);
      }
      .hud-combo-score {
        font-size: calc(var(--u) * 2.0);
        font-weight: 900;
        color: #FFFFFF;
        font-variant-numeric: tabular-nums;
        text-shadow: 0 0 calc(var(--u) * 0.8) rgba(255,255,255,0.35), 0 2px 4px rgba(0,0,0,0.9);
      }
      .hud-combo-multiplier {
        font-size: calc(var(--u) * 1.45);
        font-weight: 900;
        color: var(--green);
        font-variant-numeric: tabular-nums;
        text-shadow: 0 0 calc(var(--u) * 0.7) rgba(59,227,139,0.6), 0 2px 4px rgba(0,0,0,0.9);
      }
      .hud-combo-multiplier.pulse { animation: multiplierPulse 0.3s ease-out; }
      @keyframes multiplierPulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.35); color: #FFF06B; }
        100% { transform: scale(1); }
      }
      .hud-combo-timer {
        height: calc(var(--u) * 0.42);
        margin-top: calc(var(--u) * 0.35);
        background: rgba(0,0,0,0.6);
        border-radius: 99px;
        overflow: hidden;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12);
      }
      .hud-combo-timer-fill {
        height: 100%;
        width: 100%;
        border-radius: 99px;
        background: linear-gradient(90deg, #FF5A3C, #FFC01E 45%, #3BE38B);
        transition: width 0.05s linear;
      }
      .hud-combo-timer-fill.urgent { animation: timerUrgent 0.35s infinite; }
      @keyframes timerUrgent {
        0%, 100% { filter: brightness(1); }
        50% { filter: brightness(1.8); }
      }

      /* ---- BALANCE METER (centre, under combo) --------------------------- */
      .hud-balance-meter {
        position: absolute;
        top: 24%;
        left: 50%;
        transform: translateX(-50%) scale(0.95);
        width: calc(var(--u) * 24);
        padding: calc(var(--u) * 0.35) calc(var(--u) * 0.5) calc(var(--u) * 0.45);
        opacity: 0;
        transition: opacity 0.18s ease-out, transform 0.18s ease-out;
        border-color: rgba(255,192,30,0.5);
      }
      .hud-balance-meter.active { opacity: 1; transform: translateX(-50%) scale(1); }
      .hud-balance-label {
        font-size: calc(var(--u) * 0.72);
        font-weight: 900;
        letter-spacing: calc(var(--u) * 0.16);
        color: var(--gold);
        text-align: center;
        margin-bottom: calc(var(--u) * 0.25);
      }
      .hud-balance-track {
        position: relative;
        height: calc(var(--u) * 1.05);
        border-radius: calc(var(--u) * 0.5);
        overflow: hidden;
        box-shadow: inset 0 0 0 1px rgba(0,0,0,0.6);
      }
      .hud-balance-zones { display: flex; width: 100%; height: 100%; }
      .hud-balance-danger {
        width: 16%;
        background: linear-gradient(180deg, #FF7A3C, #C81E00);
      }
      .hud-balance-safe {
        flex: 1;
        background: linear-gradient(180deg, #57F0A2, #17A96A);
      }
      .hud-balance-arrow {
        position: absolute;
        top: 0;
        left: 50%;
        width: calc(var(--u) * 0.42);
        height: 100%;
        margin-left: calc(var(--u) * -0.21);
        background: #FFFFFF;
        border-radius: calc(var(--u) * 0.2);
        box-shadow: 0 0 calc(var(--u) * 0.5) rgba(0,0,0,0.9), 0 0 calc(var(--u) * 0.4) rgba(255,255,255,0.9);
        transition: left 0.05s linear;
      }
      .hud-balance-meter.danger { border-color: var(--red); }
      .hud-balance-meter.danger .hud-balance-label { color: var(--red); animation: wantedPulse 0.4s infinite; }

      /* ---- transient centre elements ------------------------------------- */
      .hud-spin-counter {
        position: absolute;
        top: 33%;
        left: 50%;
        transform: translateX(-50%);
        font-size: calc(var(--u) * 3.2);
        font-weight: 900;
        color: var(--gold);
        text-shadow: 0 0 calc(var(--u) * 1.2) rgba(255,192,30,0.8), 0 3px 6px rgba(0,0,0,0.9);
        opacity: 0;
        transition: opacity 0.15s ease-out;
        letter-spacing: calc(var(--u) * 0.2);
      }
      .hud-spin-counter.active { opacity: 1; animation: spinPulse 0.15s ease-out; }
      @keyframes spinPulse {
        0% { transform: translateX(-50%) scale(1.3); }
        100% { transform: translateX(-50%) scale(1); }
      }

      .hud-trick-popup {
        position: absolute;
        top: 43%;
        left: 50%;
        transform: translateX(-50%);
        text-align: center;
        opacity: 0;
        transition: opacity 0.3s;
      }
      .hud-trick-popup.show { opacity: 1; animation: trickPop 0.5s ease-out; }
      @keyframes trickPop {
        0% { transform: translateX(-50%) scale(0.5); opacity: 0; }
        50% { transform: translateX(-50%) scale(1.18); }
        100% { transform: translateX(-50%) scale(1); opacity: 1; }
      }
      .hud-trick-name { font-size: calc(var(--u) * 2.1); font-weight: 900; color: #5FE3FF; }
      .hud-trick-points { font-size: calc(var(--u) * 1.4); font-weight: 800; color: var(--green); }

      .hud-goal-popup {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.7);
        font-size: calc(var(--u) * 2.1);
        font-weight: 900;
        letter-spacing: calc(var(--u) * 0.08);
        color: var(--green);
        opacity: 0;
        transition: opacity 0.25s ease-out, transform 0.25s ease-out;
        text-align: center;
      }
      .hud-goal-popup.show { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      .hud-goal-popup small {
        display: block;
        font-size: calc(var(--u) * 1.05);
        color: var(--gold);
        font-weight: 600;
        letter-spacing: 0;
        margin-top: calc(var(--u) * 0.2);
      }

      /* ---- bottom bars (SPEED left, BOOST right) -------------------------- */
      .hud-bar {
        position: absolute;
        bottom: calc(var(--u) * 1.1);
        display: flex;
        align-items: center;
        gap: calc(var(--u) * 0.6);
        padding: calc(var(--u) * 0.38) calc(var(--u) * 0.75);
      }
      .hud-bar.left { left: calc(var(--u) * 1.1); }
      .hud-bar.right { right: calc(var(--u) * 1.1); }
      .hud-bar-icon {
        width: calc(var(--u) * 1.7);
        height: calc(var(--u) * 1.7);
        flex: 0 0 auto;
        border-radius: calc(var(--u) * 0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: calc(var(--u) * 1.0);
        text-shadow: none;
      }
      .hud-bar-icon.speed { background: linear-gradient(180deg, #57F0A2, #17A96A); }
      .hud-bar-icon.boost { background: linear-gradient(180deg, #7BFFC2, #21C97C); }
      .hud-bar-label {
        font-size: calc(var(--u) * 0.85);
        font-weight: 900;
        letter-spacing: calc(var(--u) * 0.13);
        color: #FFFFFF;
        margin-bottom: calc(var(--u) * 0.22);
      }
      .hud-bar-track {
        display: flex;
        gap: calc(var(--u) * 0.13);
        width: calc(var(--u) * 13);
        height: calc(var(--u) * 0.95);
        padding: calc(var(--u) * 0.13);
        background: rgba(0,0,0,0.62);
        border-radius: calc(var(--u) * 0.28);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12);
      }
      .hud-seg {
        flex: 1;
        border-radius: calc(var(--u) * 0.08);
        background: rgba(255,255,255,0.07);
        transition: background 0.12s linear;
      }
      .hud-seg.on { background: var(--green); }
      .hud-seg.on.warm { background: var(--gold); }
      .hud-seg.on.hot { background: var(--red); }
      .hud-seg.boost.on { background: linear-gradient(180deg, #FFD75E, #FF9A00); }
      .hud-bar.full { border-color: rgba(255,215,0,0.9); animation: boostGlow 0.6s infinite alternate ease-in-out; }
      @keyframes boostGlow {
        from { box-shadow: 0 0 calc(var(--u) * 0.6) rgba(255,192,30,0.5); }
        to   { box-shadow: 0 0 calc(var(--u) * 1.4) rgba(255,192,30,0.95); }
      }

      /* ---- controls hint -------------------------------------------------- */
      .hud-controls {
        position: absolute;
        bottom: calc(var(--u) * 4.4);
        left: calc(var(--u) * 1.1);
        font-size: calc(var(--u) * 0.72);
        color: rgba(255,255,255,0.62);
        line-height: 1.55;
        padding: calc(var(--u) * 0.4) calc(var(--u) * 0.7);
        max-width: calc(var(--u) * 22);
      }
    `;
    document.head.appendChild(style);

    // Create HUD container
    const hud = document.createElement('div');
    hud.className = 'hud-container';

    // ---- STONKS hero counter (top-left) ---------------------------------
    this.scoreElement = document.createElement('div');
    this.scoreElement.className = 'hud-stonks hud-panel';
    this.scoreElement.innerHTML = `
      <div class="hud-coin">$</div>
      <div class="hud-stonks-text">
        <div class="hud-stonks-label">STONKS</div>
        <div class="hud-stonks-value">$0</div>
      </div>
    `;
    this.scoreValue = this.scoreElement.querySelector('.hud-stonks-value') as HTMLElement;
    hud.appendChild(this.scoreElement);

    this.deltaElement = document.createElement('div');
    this.deltaElement.className = 'hud-delta';
    hud.appendChild(this.deltaElement);

    // ---- WANTED stars (top-right) ---------------------------------------
    this.wantedElement = document.createElement('div');
    this.wantedElement.className = 'hud-wanted';
    const starRow = document.createElement('div');
    starRow.className = 'hud-wanted-stars hud-panel';
    for (let i = 0; i < WANTED_STARS; i++) {
      const s = document.createElement('span');
      s.className = 'hud-star';
      s.textContent = '★';
      starRow.appendChild(s);
      this.wantedStarEls.push(s);
    }
    const wantedTag = document.createElement('div');
    wantedTag.className = 'hud-wanted-tag hud-panel';
    wantedTag.textContent = 'WANTED';
    this.wantedElement.appendChild(starRow);
    this.wantedElement.appendChild(wantedTag);
    hud.appendChild(this.wantedElement);

    // ---- Goal panel (top-right, under WANTED) ---------------------------
    this.goalsElement = document.createElement('div');
    this.goalsElement.className = 'hud-goals hud-panel';
    this.goalsElement.style.display = 'none';
    this.goalsElement.innerHTML = `
      <div class="hud-goals-head">
        <div class="hud-goals-title">GOALS</div>
        <div class="hud-goals-count">0/0</div>
      </div>
      <div class="hud-goals-tiers"></div>
      <div class="hud-goals-list"></div>
    `;
    this.goalsCount = this.goalsElement.querySelector('.hud-goals-count') as HTMLElement;
    this.goalsTiers = this.goalsElement.querySelector('.hud-goals-tiers') as HTMLElement;
    this.goalsList = this.goalsElement.querySelector('.hud-goals-list') as HTMLElement;
    hud.appendChild(this.goalsElement);

    // ---- Combo (top-centre) ---------------------------------------------
    this.comboElement = document.createElement('div');
    this.comboElement.className = 'hud-combo hud-panel';
    this.comboElement.innerHTML = `
      <div class="hud-combo-tricks"></div>
      <div class="hud-combo-main">
        <div class="hud-combo-score"></div>
        <div class="hud-combo-multiplier"></div>
      </div>
      <div class="hud-combo-timer"><div class="hud-combo-timer-fill"></div></div>
    `;
    this.comboTricks = this.comboElement.querySelector('.hud-combo-tricks') as HTMLElement;
    this.comboScore = this.comboElement.querySelector('.hud-combo-score') as HTMLElement;
    this.comboMult = this.comboElement.querySelector('.hud-combo-multiplier') as HTMLElement;
    this.comboTimerFill = this.comboElement.querySelector('.hud-combo-timer-fill') as HTMLElement;
    hud.appendChild(this.comboElement);

    // ---- Balance meter ---------------------------------------------------
    this.balanceMeter = document.createElement('div');
    this.balanceMeter.className = 'hud-balance-meter hud-panel';
    this.balanceMeter.innerHTML = `
      <div class="hud-balance-label">BALANCE</div>
      <div class="hud-balance-track">
        <div class="hud-balance-zones">
          <div class="hud-balance-danger"></div>
          <div class="hud-balance-safe"></div>
          <div class="hud-balance-danger"></div>
        </div>
        <div class="hud-balance-arrow"></div>
      </div>
    `;
    this.balanceArrow = this.balanceMeter.querySelector('.hud-balance-arrow') as HTMLElement;
    hud.appendChild(this.balanceMeter);

    // ---- Spin counter ----------------------------------------------------
    this.spinCounterElement = document.createElement('div');
    this.spinCounterElement.className = 'hud-spin-counter';
    hud.appendChild(this.spinCounterElement);

    // ---- Trick popup -----------------------------------------------------
    this.trickPopup = document.createElement('div');
    this.trickPopup.className = 'hud-trick-popup';
    this.trickPopup.innerHTML = `
      <div class="hud-trick-name"></div>
      <div class="hud-trick-points"></div>
    `;
    this.trickName = this.trickPopup.querySelector('.hud-trick-name') as HTMLElement;
    this.trickPoints = this.trickPopup.querySelector('.hud-trick-points') as HTMLElement;
    hud.appendChild(this.trickPopup);

    // ---- Goal-complete banner -------------------------------------------
    this.goalPopup = document.createElement('div');
    this.goalPopup.className = 'hud-goal-popup';
    hud.appendChild(this.goalPopup);

    // ---- SPEED bar (bottom-left) ----------------------------------------
    this.speedChartElement = document.createElement('div');
    this.speedChartElement.className = 'hud-bar left hud-panel';
    this.speedChartElement.appendChild(makeBarIcon('speed', '⚡'));
    const speedCol = document.createElement('div');
    const speedLabel = document.createElement('div');
    speedLabel.className = 'hud-bar-label';
    speedLabel.textContent = 'SPEED';
    const speedTrack = document.createElement('div');
    speedTrack.className = 'hud-bar-track';
    for (let i = 0; i < SPEED_SEGMENTS; i++) {
      const seg = document.createElement('div');
      seg.className = 'hud-seg';
      speedTrack.appendChild(seg);
      this.speedBars.push(seg);
    }
    speedCol.appendChild(speedLabel);
    speedCol.appendChild(speedTrack);
    this.speedChartElement.appendChild(speedCol);
    hud.appendChild(this.speedChartElement);

    // ---- BOOST / SPECIAL bar (bottom-right) ------------------------------
    this.specialMeter = document.createElement('div');
    this.specialMeter.className = 'hud-bar right hud-panel';
    this.specialMeter.appendChild(makeBarIcon('boost', '⚡'));
    const boostCol = document.createElement('div');
    const boostLabel = document.createElement('div');
    boostLabel.className = 'hud-bar-label';
    boostLabel.textContent = 'BOOST';
    const boostTrack = document.createElement('div');
    boostTrack.className = 'hud-bar-track';
    for (let i = 0; i < BOOST_SEGMENTS; i++) {
      const seg = document.createElement('div');
      seg.className = 'hud-seg boost';
      boostTrack.appendChild(seg);
      this.specialSegments.push(seg);
    }
    boostCol.appendChild(boostLabel);
    boostCol.appendChild(boostTrack);
    this.specialMeter.appendChild(boostCol);
    hud.appendChild(this.specialMeter);

    // ---- Controls hint ---------------------------------------------------
    this.controlsHint = document.createElement('div');
    this.controlsHint.className = 'hud-controls hud-panel';
    this.controlsHint.innerHTML = `
      W - Push &nbsp; S - Brake &nbsp; A/D - Turn<br>
      SPACE - Ollie (hold to charge)<br>
      J - Flip &nbsp; K - Grab (hold) &nbsp; L - Grind<br>
      Arrows - Trick direction<br>
      ↓ then ↑ - Manual &nbsp; ↑ then ↓ - Nose manual<br>
      SHIFT - Revert &nbsp; Q/E - Spin<br>
      J+K - Special (meter full) &nbsp; ESC - Pause
    `;
    const hasPlayed = localStorage.getItem(STORAGE_KEY_HAS_PLAYED) === 'true';
    if (hasPlayed) {
      this.controlsHint.style.display = 'none';
      this.controlsHidden = true;
    }
    hud.appendChild(this.controlsHint);

    this.container.appendChild(hud);
  }

  // -------------------------------------------------------------------------
  // Score
  // -------------------------------------------------------------------------

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

    const delta = score - this.currentScore;
    if (this.suppressDelta) {
      this.suppressDelta = false;
    } else if (Math.abs(delta) >= 1) {
      this.showDelta(delta);
    }

    if (score < this.displayedScore) {
      // A bail took stonks away: snap down rather than counting backwards forever.
      this.displayedScore = score;
      this.scoreValue.textContent = '$' + Math.round(score).toLocaleString();
    }
    this.currentScore = score;
  }

  /** Flash the rising/falling ticker under the hero counter. */
  private showDelta(delta: number): void {
    const up = delta > 0;
    const amount = Math.abs(Math.round(delta)).toLocaleString();
    this.deltaElement.textContent = `${up ? '▲ +$' : '▼ -$'}${amount}`;
    this.deltaElement.className = 'hud-delta';
    void this.deltaElement.offsetWidth;
    this.deltaElement.className = `hud-delta show ${up ? 'up' : 'down'}`;

    this.scoreValue.classList.remove('gain', 'loss');
    this.scoreValue.classList.add(up ? 'gain' : 'loss');

    if (this.deltaTimer) clearTimeout(this.deltaTimer);
    this.deltaTimer = setTimeout(() => {
      this.deltaElement.classList.remove('show');
    }, 1300);

    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this.scoreValue.classList.remove('gain', 'loss');
    }, 550);
  }

  /**
   * Update the SPEED bar (segmented, bottom-left).
   * @param speed - current speed (0–20 typical)
   */
  setSpeed(speed: number): void {
    const maxSpeed = 20;
    const normalized = Math.max(0, Math.min(1, speed / maxSpeed));
    const lit = Math.round(normalized * SPEED_SEGMENTS);
    for (let i = 0; i < this.speedBars.length; i++) {
      const seg = this.speedBars[i];
      const on = i < lit;
      const frac = (i + 1) / SPEED_SEGMENTS;
      seg.className = 'hud-seg' + (on ? ' on' + (frac > 0.85 ? ' hot' : frac > 0.65 ? ' warm' : '') : '');
    }
  }

  /**
   * Update displayed score (called each frame for smooth counting)
   * Uses ease-out curve for satisfying score counting
   */
  update(dt: number): void {
    if (this.displayedScore < this.currentScore) {
      const diff = this.currentScore - this.displayedScore;
      const speed = Math.max(10, diff * 3);
      const increment = Math.max(1, Math.round(speed * dt));

      const prevScore = this.displayedScore;
      this.displayedScore = Math.min(this.currentScore, this.displayedScore + increment);
      this.scoreValue.textContent = '$' + this.displayedScore.toLocaleString();

      if (diff > 100 && this.displayedScore !== prevScore) {
        const scale = 1 + Math.min(0.12, increment / 500);
        this.scoreValue.style.transform = `scale(${scale})`;
        setTimeout(() => { this.scoreValue.style.transform = 'scale(1)'; }, 50);
      }
    }
  }

  /**
   * Show trick popup with color based on trick type
   */
  showTrick(name: string, points: number, multiplier: number, trickType?: TrickType): void {
    this.trickName.textContent = name;
    this.trickName.style.color = trickType ? TRICK_TYPE_COLORS[trickType] : '#5FE3FF';
    this.trickPoints.textContent = `+${points} × ${multiplier}`;

    this.trickPopup.classList.remove('show');
    void this.trickPopup.offsetWidth;
    this.trickPopup.classList.add('show');

    setTimeout(() => { this.trickPopup.classList.remove('show'); }, 1500);
  }

  /**
   * Update combo timer bar
   * @param timeRemaining - Time left in ms to extend combo
   * @param maxTime - Maximum combo time in ms
   */
  updateComboTimer(timeRemaining: number, maxTime: number): void {
    const percent = Math.max(0, Math.min(100, (timeRemaining / maxTime) * 100));
    this.comboTimerFill.style.width = `${percent}%`;
    this.comboTimerFill.classList.toggle('urgent', percent < 30 && percent > 0);
  }

  /**
   * Render the live combo from ScoreSystem's ComboState. Display only — this never
   * touches the banked score.
   */
  setComboState(state: ComboState | null): void {
    if (!state || !state.open || state.tricks.length === 0) {
      this.comboElement.classList.remove('active');
      this.lastMultiplier = 1;
      return;
    }

    this.comboElement.classList.add('active');

    const recent = state.tricks.slice(-6).map((t) => t.name);
    const prefix = state.tricks.length > recent.length ? '… ' : '';
    this.comboTricks.textContent = prefix + recent.join('  +  ');

    this.comboScore.textContent = state.formattedUnrealised;
    this.comboMult.textContent = state.formattedMultiplier;
    if (state.multiplier > this.lastMultiplier + 0.001) {
      this.comboMult.classList.remove('pulse');
      void this.comboMult.offsetWidth;
      this.comboMult.classList.add('pulse');
    }
    this.lastMultiplier = state.multiplier;

    const pct = Math.max(0, Math.min(1, state.timeFraction)) * 100;
    this.comboTimerFill.style.width = `${pct}%`;
    this.comboTimerFill.classList.toggle('urgent', pct < 30);
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
        this.comboElement.classList.remove('active');
        break;

      case 'bail':
        this.comboElement.classList.remove('active');
        this.showGoalBanner('BAILED', `${event.headline}  ${event.formattedLoss}`, '#FF5A3C');
        break;

      case 'tierReached':
        this.showGoalBanner(event.label, '', '#FFC01E');
        break;

      case 'balanceChanged':
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Goals
  // -------------------------------------------------------------------------

  /**
   * Render the level checklist. Cheap to call every frame: rows are built once and then
   * only their text / classes / progress bars are touched.
   *
   * Layout contract: every goal is its own grid row, `description | progress`, with the
   * description clamped to two lines and ellipsised. Nothing can wrap into the value
   * column, which was the r4 defect.
   */
  setGoals(goals: GoalProgress[]): void {
    if (!goals || goals.length === 0) {
      this.goalsElement.style.display = 'none';
      this.goalOrderSig = '';
      this.goalRows.clear();
      this.goalsTiers.innerHTML = '';
      this.goalsList.innerHTML = '';
      return;
    }
    this.goalsElement.style.display = '';

    const orderSig = goals.map((g) => g.id + (g.kind === 'scoreTier' ? 'T' : '')).join('|');
    if (orderSig !== this.goalOrderSig) {
      this.goalOrderSig = orderSig;
      this.rebuildGoalRows(goals);
    }

    let done = 0;
    for (const g of goals) {
      if (g.complete) done++;
      const row = this.goalRows.get(g.id);
      if (!row) continue;

      const hidden = g.secret && !g.complete;
      const label = row.isTier
        ? (g.tier ? g.tier.toUpperCase() + ' SCORE' : g.description)
        : hidden
          ? '? ? ?'
          : g.description;
      const tick = g.complete ? '✔ ' : '';
      const nextText = tick + label;
      if (row.text.textContent !== nextText) row.text.textContent = nextText;

      const detail = hidden ? '' : (g.detail ?? '');
      if (row.detail.textContent !== detail) row.detail.textContent = detail;

      const base = row.isTier ? 'hud-tier' : 'hud-goal';
      const cls =
        base +
        (g.complete ? ' done' : '') +
        (!g.complete && g.failed ? ' failed' : '') +
        (!row.isTier && hidden ? ' secret' : '');
      if (row.root.className !== cls) row.root.className = cls;

      if (row.bar) {
        const pct = Math.round(Math.max(0, Math.min(1, g.fraction)) * 100);
        const w = pct + '%';
        if (row.bar.style.width !== w) row.bar.style.width = w;
      }
    }

    const countText = `${done}/${goals.length}`;
    if (this.goalsCount.textContent !== countText) this.goalsCount.textContent = countText;
  }

  private rebuildGoalRows(goals: GoalProgress[]): void {
    this.goalRows.clear();
    this.goalsTiers.innerHTML = '';
    this.goalsList.innerHTML = '';

    const tiers = goals.filter((g) => g.kind === 'scoreTier');
    const others = goals.filter((g) => g.kind !== 'scoreTier');
    this.goalsTiers.style.display = tiers.length > 0 ? '' : 'none';

    for (const g of tiers) {
      const root = document.createElement('div');
      root.className = 'hud-tier';
      const name = document.createElement('div');
      name.className = 'hud-tier-name';
      const detail = document.createElement('div');
      detail.className = 'hud-tier-detail';
      const barWrap = document.createElement('div');
      barWrap.className = 'hud-tier-bar';
      const bar = document.createElement('i');
      barWrap.appendChild(bar);
      root.appendChild(name);
      root.appendChild(detail);
      root.appendChild(barWrap);
      this.goalsTiers.appendChild(root);
      this.goalRows.set(g.id, { root, text: name, detail, bar, isTier: true });
    }

    for (const g of others) {
      const root = document.createElement('div');
      root.className = 'hud-goal';
      const text = document.createElement('div');
      text.className = 'hud-goal-text';
      const detail = document.createElement('div');
      detail.className = 'hud-goal-detail';
      root.appendChild(text);
      root.appendChild(detail);
      this.goalsList.appendChild(root);
      this.goalRows.set(g.id, { root, text, detail, bar: null, isTier: false });
    }
  }

  /** Big centred banner when a goal completes. */
  showGoalComplete(goal: GoalProgress): void {
    this.showGoalBanner('GOAL COMPLETE', `${goal.description}  +$${goal.reward.toLocaleString()}`, '#3BE38B');
  }

  private showGoalBanner(title: string, sub: string, color: string): void {
    this.goalPopup.style.color = color;
    this.goalPopup.textContent = title;
    if (sub) {
      const small = document.createElement('small');
      small.textContent = sub;
      this.goalPopup.appendChild(small);
    }
    this.goalPopup.classList.remove('show');
    void this.goalPopup.offsetWidth;
    this.goalPopup.classList.add('show');
    if (this.goalPopupTimer) clearTimeout(this.goalPopupTimer);
    this.goalPopupTimer = setTimeout(() => this.goalPopup.classList.remove('show'), 2200);
  }

  // -------------------------------------------------------------------------
  // Wanted level
  // -------------------------------------------------------------------------

  /**
   * Drive the WANTED row straight from PoliceSquad.heatLevel (0..1).
   * Four stars; anything above zero heat shows at least one.
   */
  setHeat(heat01: number): void {
    if (!Number.isFinite(heat01)) return;
    const h = Math.max(0, Math.min(1, heat01));
    this.applyStars(h <= 0.001 ? 0 : Math.max(1, Math.ceil(h * WANTED_STARS)));
  }

  /** Legacy entry point: a star count. Values above 4 are rescaled onto the four-star row. */
  setWanted(stars: number): void {
    if (!Number.isFinite(stars)) return;
    const n = Math.max(0, Math.round(stars));
    this.applyStars(n <= 0 ? 0 : Math.min(WANTED_STARS, Math.ceil((n / 5) * WANTED_STARS)));
  }

  private applyStars(n: number): void {
    const lit = Math.max(0, Math.min(WANTED_STARS, n));
    if (lit === this.wantedStars) return;
    this.wantedStars = lit;
    for (let i = 0; i < this.wantedStarEls.length; i++) {
      this.wantedStarEls[i].classList.toggle('on', i < lit);
    }
    this.wantedElement.classList.toggle('active', lit > 0);
    this.wantedElement.classList.toggle('hot', lit >= 3);
  }

  /**
   * Update the BOOST (special) meter, 0..1.
   */
  setSpecial(amount: number): void {
    this.specialAmount = Math.min(1, Math.max(0, amount));
    const lit = Math.round(this.specialAmount * BOOST_SEGMENTS);
    for (let i = 0; i < this.specialSegments.length; i++) {
      this.specialSegments[i].classList.toggle('on', i < lit);
    }
    this.specialMeter.classList.toggle('full', this.specialAmount >= 1);
  }

  /**
   * Show/hide balance meter
   */
  setBalanceVisible(visible: boolean): void {
    this.balanceMeter.classList.toggle('active', visible);
  }

  /**
   * Update balance position (0 = left edge, 0.5 = center, 1 = right edge)
   */
  setBalance(position: number): void {
    const p = Math.min(1, Math.max(0, position));
    this.balanceArrow.style.left = `${p * 100}%`;
    this.balanceMeter.classList.toggle('danger', Math.abs(p - 0.5) > 0.34);
  }

  /**
   * Reset HUD for new level
   */
  reset(): void {
    this.currentScore = 0;
    this.displayedScore = 0;
    this.specialAmount = 0;
    this.suppressDelta = true;

    this.scoreValue.textContent = '$0';
    this.scoreValue.classList.remove('gain', 'loss');
    this.deltaElement.className = 'hud-delta';

    this.setSpeed(0);
    this.setSpecial(0);

    this.comboElement.classList.remove('active');
    this.comboTimerFill.style.width = '100%';
    this.comboTimerFill.classList.remove('urgent');
    this.trickPopup.classList.remove('show');
    this.balanceMeter.classList.remove('active', 'danger');
    this.spinCounterElement.classList.remove('active');
    this.spinCounterElement.textContent = '';
    this.lastMultiplier = 1;

    this.goalOrderSig = '';
    this.goalRows.clear();
    this.goalsTiers.innerHTML = '';
    this.goalsList.innerHTML = '';
    this.goalsElement.style.display = 'none';
    this.goalPopup.classList.remove('show');

    this.wantedStars = -1;
    this.applyStars(0);
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
      if (this.spinCounterElement.textContent !== newText) {
        this.spinCounterElement.textContent = newText;
        this.spinCounterElement.classList.remove('active');
        void this.spinCounterElement.offsetWidth;
        this.spinCounterElement.classList.add('active');
      }
    } else {
      this.spinCounterElement.classList.remove('active');
    }
  }

  /**
   * Hide controls hint and mark player as having played
   * Called on first input to remember the player knows the controls
   */
  hideControlsHint(): void {
    if (this.controlsHidden) return;

    this.controlsHint.style.transition = 'opacity 0.5s ease-out';
    this.controlsHint.style.opacity = '0';
    setTimeout(() => { this.controlsHint.style.display = 'none'; }, 500);

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

function makeBarIcon(kind: 'speed' | 'boost', glyph: string): HTMLElement {
  const el = document.createElement('div');
  el.className = `hud-bar-icon ${kind}`;
  el.textContent = glyph;
  return el;
}

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
