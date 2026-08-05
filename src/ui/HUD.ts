/**
 * HUD - Heads Up Display
 *
 * Visual language (see refs/scene-outside2.png, refs/scene-office3.png):
 *   chunky rounded panels, dark translucent backing, light outline, bold condensed type,
 *   gold + green accents.
 *
 * Layout
 *   top-left      STONKS hero counter + gain/loss ticker
 *   top-centre    COMBO readout — the most important element on screen
 *   top-right     WANTED stars, then the GOAL panel
 *   right-centre  MANUAL balance meter (VERTICAL — matches the ↑/↓ axis that corrects it)
 *   bottom-centre GRIND balance meter (HORIZONTAL — matches the ←/→ axis) above the minimap
 *   bottom-left   SPEED bar (+ controls hint while learning)
 *   bottom-right  BOOST bar
 *
 * Everything is sized off a single CSS unit `--u`, `clamp(11px, 1.55vh, 16px)`, so the whole
 * HUD scales with viewport height with no JS resize handler:
 *   1600x900  -> u = 13.95px
 *   1920x1080 -> u = 16.00px
 */

import * as THREE from 'three';
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

/**
 * Unrealised-stonks thresholds for the combo readout's tension tiers.
 * Lines in ch1_office top out around 155k, so tier 4 is genuinely rare and genuinely loud.
 */
const COMBO_TENSION_STEPS = [6_000, 20_000, 60_000, 120_000];

/** Minimap backing-store size in device pixels. */
const MAP_W = 340;
const MAP_H = 236;

/** Which balance axis the player is fighting. Mirrors BalanceSystem's BalanceMode. */
export type HUDBalanceMode = 'none' | 'manual' | 'noseManual' | 'grind' | 'lip';

/** One level object flattened to its XZ footprint, for the minimap. */
export interface MinimapFootprint {
  x: number;
  z: number;
  w: number;
  d: number;
  /** Long + thin => draw as a rail. */
  rail: boolean;
}

interface GoalRow {
  root: HTMLElement;
  box: HTMLElement;
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

  private comboWrap!: HTMLElement;
  private comboCount!: HTMLElement;
  private comboClock!: HTMLElement;
  private comboTricks!: HTMLElement;
  private comboTricksOld!: HTMLElement;
  private comboTricksNew!: HTMLElement;
  private comboScore!: HTMLElement;
  private comboMult!: HTMLElement;
  private comboRisk!: HTMLElement;
  private comboRiskValue!: HTMLElement;
  private comboTimerFill!: HTMLElement;

  private trickPopup!: HTMLElement;
  private trickName!: HTMLElement;
  private trickPoints!: HTMLElement;
  private specialMeter!: HTMLElement;
  private specialSegments: HTMLElement[] = [];

  private balanceH!: HTMLElement;
  private balanceHArrow!: HTMLElement;
  private balanceHLeft!: HTMLElement;
  private balanceHRight!: HTMLElement;
  private balanceHLabel!: HTMLElement;
  private balanceV!: HTMLElement;
  private balanceVArrow!: HTMLElement;
  private balanceVUp!: HTMLElement;
  private balanceVDown!: HTMLElement;
  private balanceVLabel!: HTMLElement;

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

  private mapWrap!: HTMLElement;
  private mapCanvas!: HTMLCanvasElement;
  private mapCtx!: CanvasRenderingContext2D;
  private mapStatic: HTMLCanvasElement | null = null;
  private mapTransform: { ox: number; oz: number; s: number } | null = null;
  private mapPlayer = { x: 0, z: 0, yaw: 0 };
  private mapDirty = false;

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

  // combo render caches — setComboState runs every frame, so nothing touches the DOM
  // unless the value it renders actually changed.
  private comboSig = '';
  private comboTier = -1;
  private comboScoreText = '';
  private comboMultText = '';
  private comboRiskText = '';
  private comboClockText = '';
  private comboUrgent = false;
  private balanceMode: HUDBalanceMode = 'none';
  private balanceVisible = false;

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
        background: linear-gradient(180deg, rgba(26,29,38,0.88) 0%, rgba(9,10,14,0.93) 100%);
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
        padding: calc(var(--u) * 0.42) calc(var(--u) * 1.05) calc(var(--u) * 0.42) calc(var(--u) * 0.42);
        transition: border-color 0.2s ease-out, box-shadow 0.2s ease-out;
      }
      .hud-stonks.gain {
        border-color: rgba(59,227,139,0.85);
        box-shadow: 0 0 calc(var(--u) * 1.1) rgba(59,227,139,0.5),
                    inset 0 calc(var(--u) * 0.09) 0 rgba(255,255,255,0.14);
      }
      .hud-stonks.loss {
        border-color: rgba(255,90,60,0.9);
        box-shadow: 0 0 calc(var(--u) * 1.1) rgba(255,90,60,0.55),
                    inset 0 calc(var(--u) * 0.09) 0 rgba(255,255,255,0.14);
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
        top: calc(var(--u) * 4.6);
        left: calc(var(--u) * 1.6);
        font-size: calc(var(--u) * 1.1);
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
      .hud-delta.show.up { transform: translateY(calc(var(--u) * -0.5)); }
      .hud-delta.show.down { transform: translateY(calc(var(--u) * 0.5)); }

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
        gap: calc(var(--u) * 0.2);
        padding: calc(var(--u) * 0.24) calc(var(--u) * 0.55);
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
        padding: calc(var(--u) * 0.12) calc(var(--u) * 0.7) calc(var(--u) * 0.2);
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
        width: calc(var(--u) * 22);
        padding: calc(var(--u) * 0.55) calc(var(--u) * 0.7) calc(var(--u) * 0.55);
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
        font-size: calc(var(--u) * 0.82);
        font-weight: 900;
        color: var(--gold);
        font-variant-numeric: tabular-nums;
      }

      /* score tiers get their own gold-tinted block, visually separate from objectives */
      .hud-goals-tiers {
        background: linear-gradient(180deg, rgba(255,192,30,0.14), rgba(255,140,0,0.06));
        border: 1px solid rgba(255,192,30,0.4);
        border-radius: calc(var(--u) * 0.5);
        padding: calc(var(--u) * 0.34) calc(var(--u) * 0.48) calc(var(--u) * 0.42);
        margin-bottom: calc(var(--u) * 0.5);
      }
      .hud-goals-tiers::before {
        content: 'SCORE GOALS';
        display: block;
        font-size: calc(var(--u) * 0.62);
        font-weight: 900;
        letter-spacing: calc(var(--u) * 0.14);
        color: rgba(255,214,120,0.95);
        margin-bottom: calc(var(--u) * 0.28);
      }
      .hud-tier {
        display: grid;
        grid-template-columns: calc(var(--u) * 0.95) minmax(0, 1fr) auto;
        column-gap: calc(var(--u) * 0.35);
        align-items: baseline;
      }
      .hud-tier + .hud-tier { margin-top: calc(var(--u) * 0.32); }
      .hud-tier-box {
        font-size: calc(var(--u) * 0.8);
        font-weight: 900;
        line-height: 1;
        color: rgba(255,192,30,0.5);
        text-align: center;
      }
      .hud-tier-name {
        font-size: calc(var(--u) * 0.88);
        font-weight: 900;
        letter-spacing: calc(var(--u) * 0.05);
        color: #FFF0CC;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .hud-tier-detail {
        font-size: calc(var(--u) * 0.74);
        color: rgba(255,255,255,0.66);
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .hud-tier-bar {
        grid-column: 2 / 4;
        height: calc(var(--u) * 0.3);
        margin-top: calc(var(--u) * 0.16);
        background: rgba(0,0,0,0.6);
        border-radius: 99px;
        overflow: hidden;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1);
      }
      .hud-tier-bar > i {
        display: block;
        height: 100%;
        width: 0%;
        border-radius: 99px;
        background: linear-gradient(90deg, #FFC01E, #FF8A00);
        transition: width 0.25s ease-out;
      }
      .hud-tier.done .hud-tier-box { color: var(--green); }
      .hud-tier.done .hud-tier-name { color: var(--green); }
      .hud-tier.done .hud-tier-detail { color: var(--green); opacity: 0.85; }
      .hud-tier.done .hud-tier-bar > i { background: linear-gradient(90deg, #3BE38B, #17A96A); }

      /* one objective per row: tick | description | progress. Three columns, so a long
         description can never run under its own value. */
      .hud-goal {
        display: grid;
        grid-template-columns: calc(var(--u) * 0.95) minmax(0, 1fr) auto;
        column-gap: calc(var(--u) * 0.35);
        align-items: start;
        padding: calc(var(--u) * 0.24) 0;
        border-top: 1px solid rgba(255,255,255,0.08);
      }
      .hud-goal:first-child { border-top: none; }
      .hud-goal-box {
        font-size: calc(var(--u) * 0.8);
        font-weight: 900;
        line-height: 1.22;
        color: rgba(255,255,255,0.28);
        text-align: center;
      }
      .hud-goal-text {
        font-size: calc(var(--u) * 0.84);
        line-height: 1.18;
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
        line-height: 1.38;
        color: rgba(255,255,255,0.55);
        white-space: nowrap;
        text-align: right;
        font-variant-numeric: tabular-nums;
        max-width: calc(var(--u) * 8.6);
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .hud-goal.done { background: rgba(59,227,139,0.09); border-radius: calc(var(--u) * 0.3); }
      .hud-goal.done .hud-goal-box { color: var(--green); }
      .hud-goal.done .hud-goal-text { color: var(--green); }
      .hud-goal.done .hud-goal-detail { color: var(--green); opacity: 0.8; }
      .hud-goal.failed .hud-goal-box { color: #FF7A66; }
      .hud-goal.failed .hud-goal-text,
      .hud-goal.failed .hud-goal-detail { color: #FF7A66; opacity: 0.6; text-decoration: line-through; }
      .hud-goal.secret .hud-goal-text { color: rgba(255,255,255,0.45); letter-spacing: 0.15em; }

      /* ---- COMBO (top-centre) — the hero readout -------------------------- */
      .hud-combo {
        position: absolute;
        top: calc(var(--u) * 0.9);
        left: 50%;
        transform: translateX(-50%);
        width: min(48vw, calc(var(--u) * 40));
        opacity: 0;
        transition: opacity 0.16s ease-out;
      }
      .hud-combo.active { opacity: 1; }
      .hud-combo-card {
        padding: calc(var(--u) * 0.42) calc(var(--u) * 0.9) calc(var(--u) * 0.55);
        transform: scale(0.94);
        transition: transform 0.18s ease-out, border-color 0.25s ease-out, box-shadow 0.25s ease-out;
        border-color: rgba(255,255,255,0.26);
      }
      .hud-combo.active .hud-combo-card { transform: scale(1); }

      /* meta row: what it is / how long is left */
      .hud-combo-meta {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: calc(var(--u) * 0.6);
        margin-bottom: calc(var(--u) * 0.14);
      }
      .hud-combo-count {
        font-size: calc(var(--u) * 0.66);
        font-weight: 900;
        letter-spacing: calc(var(--u) * 0.15);
        color: rgba(255,255,255,0.55);
        white-space: nowrap;
      }
      .hud-combo-hint {
        font-size: calc(var(--u) * 0.7);
        font-weight: 900;
        letter-spacing: calc(var(--u) * 0.12);
        color: var(--gold);
        opacity: 0;
        transition: opacity 0.2s;
        white-space: nowrap;
      }
      .hud-combo-clock {
        font-size: calc(var(--u) * 0.78);
        font-weight: 900;
        color: rgba(255,255,255,0.7);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .hud-combo-clock.urgent { color: var(--red); }

      /* the trick string: history dims out to the left, the newest trick is bright */
      .hud-combo-tricks {
        font-size: calc(var(--u) * 0.92);
        font-weight: 700;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        direction: rtl;
        text-align: left;
        -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 14%);
        mask-image: linear-gradient(90deg, transparent 0%, #000 14%);
      }
      .hud-combo-tricks > span { direction: ltr; unicode-bidi: embed; }
      .hud-combo-old { color: rgba(140,214,255,0.62); }
      .hud-combo-new { color: #A9F0FF; text-shadow: 0 0 calc(var(--u) * 0.5) rgba(95,227,255,0.55), 0 2px 3px rgba(0,0,0,0.9); }

      .hud-combo-main {
        display: flex;
        align-items: baseline;
        justify-content: center;
        gap: calc(var(--u) * 0.75);
        margin-top: calc(var(--u) * 0.06);
      }
      .hud-combo-score {
        font-size: calc(var(--u) * 2.35);
        font-weight: 900;
        color: #FFFFFF;
        font-variant-numeric: tabular-nums;
        letter-spacing: calc(var(--u) * -0.01);
        text-shadow: 0 0 calc(var(--u) * 0.8) rgba(255,255,255,0.35), 0 2px 4px rgba(0,0,0,0.9);
        transition: color 0.25s ease-out, text-shadow 0.25s ease-out;
      }
      .hud-combo-multiplier {
        font-size: calc(var(--u) * 1.6);
        font-weight: 900;
        color: #0B0D12;
        background: linear-gradient(180deg, #7BFFC2, #21C97C);
        border-radius: calc(var(--u) * 0.4);
        padding: 0 calc(var(--u) * 0.42) calc(var(--u) * 0.06);
        font-variant-numeric: tabular-nums;
        text-shadow: none;
        box-shadow: 0 calc(var(--u) * 0.12) calc(var(--u) * 0.35) rgba(0,0,0,0.6);
      }
      .hud-combo-multiplier.pulse { animation: multiplierPulse 0.32s ease-out; }
      @keyframes multiplierPulse {
        0% { transform: scale(1); }
        45% { transform: scale(1.32); background: linear-gradient(180deg, #FFF6B0, #FFC01E); }
        100% { transform: scale(1); }
      }

      /* what a bail costs right now — appears only once it actually hurts */
      .hud-combo-risk {
        display: flex;
        align-items: baseline;
        justify-content: center;
        gap: calc(var(--u) * 0.4);
        height: 0;
        overflow: hidden;
        opacity: 0;
        transition: opacity 0.2s ease-out;
      }
      .hud-combo-risk.show { height: auto; opacity: 1; margin-top: calc(var(--u) * 0.06); }
      .hud-combo-risk-label {
        font-size: calc(var(--u) * 0.64);
        font-weight: 900;
        letter-spacing: calc(var(--u) * 0.14);
        color: rgba(255,140,110,0.85);
      }
      .hud-combo-risk-value {
        font-size: calc(var(--u) * 0.92);
        font-weight: 900;
        color: #FF7A66;
        font-variant-numeric: tabular-nums;
      }

      .hud-combo-timer {
        height: calc(var(--u) * 0.46);
        margin-top: calc(var(--u) * 0.34);
        background: rgba(0,0,0,0.65);
        border-radius: 99px;
        overflow: hidden;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.14);
      }
      .hud-combo-timer-fill {
        height: 100%;
        width: 100%;
        border-radius: 99px;
        background: linear-gradient(90deg, #17A96A, #3BE38B);
        transition: width 0.05s linear, background 0.3s linear;
      }
      .hud-combo-timer-fill.urgent {
        background: linear-gradient(90deg, #C81E00, #FF5A3C);
        animation: timerUrgent 0.3s infinite;
      }
      @keyframes timerUrgent {
        0%, 100% { filter: brightness(1); }
        50% { filter: brightness(1.9); }
      }

      /* --- tension tiers: the bigger the open position, the louder the panel --- */
      .hud-combo.t1 .hud-combo-card { border-color: rgba(255,192,30,0.6); }
      .hud-combo.t1 .hud-combo-score { color: #FFE9A8; }

      .hud-combo.t2 .hud-combo-card {
        border-color: rgba(255,150,20,0.85);
        box-shadow: 0 0 calc(var(--u) * 1.1) rgba(255,150,20,0.4),
                    0 calc(var(--u) * 0.25) calc(var(--u) * 0.9) rgba(0,0,0,0.55),
                    inset 0 calc(var(--u) * 0.09) 0 rgba(255,255,255,0.14);
      }
      .hud-combo.t2 .hud-combo-score {
        color: var(--gold);
        text-shadow: 0 0 calc(var(--u) * 0.9) rgba(255,192,30,0.55), 0 2px 4px rgba(0,0,0,0.9);
      }
      .hud-combo.t2.active .hud-combo-card { transform: scale(1.035); }

      .hud-combo.t3 .hud-combo-card {
        border-color: rgba(255,110,50,0.95);
        animation: comboBreath 0.85s ease-in-out infinite;
      }
      .hud-combo.t3 .hud-combo-score {
        color: #FFB13C;
        text-shadow: 0 0 calc(var(--u) * 1.1) rgba(255,140,0,0.75), 0 2px 4px rgba(0,0,0,0.9);
      }
      .hud-combo.t3.active .hud-combo-card { transform: scale(1.07); }
      .hud-combo.t3 .hud-combo-hint { opacity: 1; }

      .hud-combo.t4 .hud-combo-card {
        border-color: #FF3B20;
        animation: comboBreath 0.45s ease-in-out infinite;
      }
      .hud-combo.t4 .hud-combo-score {
        color: #FF8B5E;
        text-shadow: 0 0 calc(var(--u) * 1.5) rgba(255,60,20,0.9), 0 2px 4px rgba(0,0,0,0.9);
      }
      .hud-combo.t4.active .hud-combo-card { transform: scale(1.1); }
      .hud-combo.t4 .hud-combo-hint { opacity: 1; animation: wantedPulse 0.4s infinite; }
      .hud-combo.t4 .hud-combo-tricks { -webkit-mask-image: none; mask-image: none; }

      @keyframes comboBreath {
        0%, 100% { box-shadow: 0 0 calc(var(--u) * 0.8) rgba(255,90,40,0.45),
                               0 calc(var(--u) * 0.25) calc(var(--u) * 0.9) rgba(0,0,0,0.55),
                               inset 0 calc(var(--u) * 0.09) 0 rgba(255,255,255,0.14); }
        50%      { box-shadow: 0 0 calc(var(--u) * 2.2) rgba(255,90,40,0.95),
                               0 calc(var(--u) * 0.25) calc(var(--u) * 0.9) rgba(0,0,0,0.55),
                               inset 0 calc(var(--u) * 0.09) 0 rgba(255,255,255,0.14); }
      }

      /* ---- BALANCE METERS ------------------------------------------------- */
      /* Two separate widgets, and which one you get IS the instruction:
         a horizontal bar for grinds (corrected with ← / →) and a vertical bar for
         manuals (corrected with ↑ / ↓). The arrow you must press lights up. */
      .hud-bal {
        position: absolute;
        opacity: 0;
        transition: opacity 0.15s ease-out, transform 0.15s ease-out;
        pointer-events: none;
      }
      .hud-bal-label {
        font-size: calc(var(--u) * 0.7);
        font-weight: 900;
        letter-spacing: calc(var(--u) * 0.16);
        color: var(--gold);
        text-align: center;
      }
      .hud-bal-key {
        font-size: calc(var(--u) * 1.25);
        font-weight: 900;
        line-height: 1;
        color: rgba(255,255,255,0.26);
        transition: color 0.1s linear, text-shadow 0.1s linear, transform 0.1s ease-out;
        flex: 0 0 auto;
      }
      .hud-bal-key.press {
        color: #FFFFFF;
        text-shadow: 0 0 calc(var(--u) * 0.7) rgba(255,255,255,0.95);
        transform: scale(1.25);
      }
      .hud-bal-zone-bad { background: linear-gradient(90deg, #C81E00, #FF7A3C); }
      .hud-bal-zone-ok { background: linear-gradient(180deg, #57F0A2, #17A96A); }
      .hud-bal-pip {
        position: absolute;
        background: #FFFFFF;
        border-radius: calc(var(--u) * 0.2);
        box-shadow: 0 0 calc(var(--u) * 0.5) rgba(0,0,0,0.95), 0 0 calc(var(--u) * 0.45) rgba(255,255,255,0.9);
        transition: left 0.05s linear, bottom 0.05s linear;
      }
      .hud-bal.danger .hud-bal-label { color: var(--red); animation: wantedPulse 0.35s infinite; }

      /* grind: horizontal, bottom-centre above the map */
      .hud-bal-h {
        bottom: calc(var(--u) * 11.4);
        left: 50%;
        transform: translateX(-50%) scale(0.95);
        width: calc(var(--u) * 24);
        padding: calc(var(--u) * 0.32) calc(var(--u) * 0.55) calc(var(--u) * 0.42);
      }
      .hud-bal-h.active { opacity: 1; transform: translateX(-50%) scale(1); }
      .hud-bal-h-row {
        display: flex;
        align-items: center;
        gap: calc(var(--u) * 0.45);
        margin-top: calc(var(--u) * 0.22);
      }
      .hud-bal-h-track {
        position: relative;
        flex: 1;
        display: flex;
        height: calc(var(--u) * 1.0);
        border-radius: calc(var(--u) * 0.5);
        overflow: hidden;
        box-shadow: inset 0 0 0 1px rgba(0,0,0,0.65);
      }
      .hud-bal-h-track .hud-bal-zone-bad { width: 17%; }
      .hud-bal-h-track .hud-bal-zone-ok { flex: 1; }
      .hud-bal-h .hud-bal-pip {
        top: 0;
        height: 100%;
        width: calc(var(--u) * 0.42);
        margin-left: calc(var(--u) * -0.21);
      }

      /* manual: vertical, right of centre */
      .hud-bal-v {
        top: 50%;
        right: calc(var(--u) * 3.2);
        transform: translateY(-50%) scale(0.95);
        padding: calc(var(--u) * 0.42) calc(var(--u) * 0.42) calc(var(--u) * 0.34);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: calc(var(--u) * 0.28);
      }
      .hud-bal-v.active { opacity: 1; transform: translateY(-50%) scale(1); }
      .hud-bal-v-track {
        position: relative;
        display: flex;
        flex-direction: column;
        width: calc(var(--u) * 1.0);
        height: calc(var(--u) * 9);
        border-radius: calc(var(--u) * 0.5);
        overflow: hidden;
        box-shadow: inset 0 0 0 1px rgba(0,0,0,0.65);
      }
      .hud-bal-v-track .hud-bal-zone-bad { height: 17%; background: linear-gradient(180deg, #C81E00, #FF7A3C); }
      .hud-bal-v-track .hud-bal-zone-ok { flex: 1; }
      .hud-bal-v .hud-bal-pip {
        left: 0;
        width: 100%;
        height: calc(var(--u) * 0.42);
        margin-bottom: calc(var(--u) * -0.21);
      }
      .hud-bal-v .hud-bal-label { writing-mode: horizontal-tb; }

      /* ---- MINIMAP (bottom-centre) ---------------------------------------- */
      .hud-map {
        position: absolute;
        bottom: calc(var(--u) * 1.1);
        left: 50%;
        transform: translateX(-50%);
        padding: calc(var(--u) * 0.3);
        opacity: 0;
        transition: opacity 0.3s ease-out;
      }
      .hud-map.active { opacity: 1; }
      .hud-map canvas {
        display: block;
        width: calc(var(--u) * 14.5);
        height: calc(var(--u) * 10);
        border-radius: calc(var(--u) * 0.5);
        background: rgba(0,0,0,0.42);
      }

      /* ---- transient centre elements ------------------------------------- */
      .hud-spin-counter {
        position: absolute;
        top: 30%;
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
        top: 41%;
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
        top: 52%;
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
    this.comboWrap = document.createElement('div');
    this.comboWrap.className = 'hud-combo';
    this.comboWrap.innerHTML = `
      <div class="hud-combo-card hud-panel">
        <div class="hud-combo-meta">
          <div class="hud-combo-count">COMBO</div>
          <div class="hud-combo-hint">BANK IT</div>
          <div class="hud-combo-clock">0.0s</div>
        </div>
        <div class="hud-combo-tricks"><span class="hud-combo-old"></span><span class="hud-combo-new"></span></div>
        <div class="hud-combo-main">
          <div class="hud-combo-score">$0</div>
          <div class="hud-combo-multiplier">x1.0</div>
        </div>
        <div class="hud-combo-risk">
          <div class="hud-combo-risk-label">BAIL COSTS</div>
          <div class="hud-combo-risk-value"></div>
        </div>
        <div class="hud-combo-timer"><div class="hud-combo-timer-fill"></div></div>
      </div>
    `;
    this.comboCount = this.comboWrap.querySelector('.hud-combo-count') as HTMLElement;
    this.comboClock = this.comboWrap.querySelector('.hud-combo-clock') as HTMLElement;
    this.comboTricks = this.comboWrap.querySelector('.hud-combo-tricks') as HTMLElement;
    this.comboTricksOld = this.comboWrap.querySelector('.hud-combo-old') as HTMLElement;
    this.comboTricksNew = this.comboWrap.querySelector('.hud-combo-new') as HTMLElement;
    this.comboScore = this.comboWrap.querySelector('.hud-combo-score') as HTMLElement;
    this.comboMult = this.comboWrap.querySelector('.hud-combo-multiplier') as HTMLElement;
    this.comboRisk = this.comboWrap.querySelector('.hud-combo-risk') as HTMLElement;
    this.comboRiskValue = this.comboWrap.querySelector('.hud-combo-risk-value') as HTMLElement;
    this.comboTimerFill = this.comboWrap.querySelector('.hud-combo-timer-fill') as HTMLElement;
    hud.appendChild(this.comboWrap);

    // ---- Balance meters --------------------------------------------------
    this.balanceH = document.createElement('div');
    this.balanceH.className = 'hud-bal hud-bal-h hud-panel';
    this.balanceH.innerHTML = `
      <div class="hud-bal-label">GRIND BALANCE</div>
      <div class="hud-bal-h-row">
        <div class="hud-bal-key hud-bal-left">&#9664;</div>
        <div class="hud-bal-h-track">
          <div class="hud-bal-zone-bad"></div>
          <div class="hud-bal-zone-ok"></div>
          <div class="hud-bal-zone-bad"></div>
          <div class="hud-bal-pip"></div>
        </div>
        <div class="hud-bal-key hud-bal-right">&#9654;</div>
      </div>
    `;
    this.balanceHLabel = this.balanceH.querySelector('.hud-bal-label') as HTMLElement;
    this.balanceHArrow = this.balanceH.querySelector('.hud-bal-pip') as HTMLElement;
    this.balanceHLeft = this.balanceH.querySelector('.hud-bal-left') as HTMLElement;
    this.balanceHRight = this.balanceH.querySelector('.hud-bal-right') as HTMLElement;
    hud.appendChild(this.balanceH);

    this.balanceV = document.createElement('div');
    this.balanceV.className = 'hud-bal hud-bal-v hud-panel';
    this.balanceV.innerHTML = `
      <div class="hud-bal-key hud-bal-up">&#9650;</div>
      <div class="hud-bal-v-track">
        <div class="hud-bal-zone-bad"></div>
        <div class="hud-bal-zone-ok"></div>
        <div class="hud-bal-zone-bad"></div>
        <div class="hud-bal-pip"></div>
      </div>
      <div class="hud-bal-key hud-bal-down">&#9660;</div>
      <div class="hud-bal-label">MANUAL</div>
    `;
    this.balanceVLabel = this.balanceV.querySelector('.hud-bal-label') as HTMLElement;
    this.balanceVArrow = this.balanceV.querySelector('.hud-bal-pip') as HTMLElement;
    this.balanceVUp = this.balanceV.querySelector('.hud-bal-up') as HTMLElement;
    this.balanceVDown = this.balanceV.querySelector('.hud-bal-down') as HTMLElement;
    hud.appendChild(this.balanceV);

    // ---- Minimap (bottom-centre) ----------------------------------------
    this.mapWrap = document.createElement('div');
    this.mapWrap.className = 'hud-map hud-panel';
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = MAP_W;
    this.mapCanvas.height = MAP_H;
    this.mapWrap.appendChild(this.mapCanvas);
    this.mapCtx = this.mapCanvas.getContext('2d') as CanvasRenderingContext2D;
    hud.appendChild(this.mapWrap);

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
      Arrows - Trick direction &amp; balance<br>
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
      this.displayedScore = score;
      this.scoreValue.textContent = '$' + Math.round(score).toLocaleString();
    } else if (Math.abs(delta) >= 1) {
      this.showDelta(delta);
    }

    this.currentScore = score;
  }

  /** Flash the rising/falling ticker under the hero counter. */
  private showDelta(delta: number): void {
    const up = delta > 0;
    const amount = Math.abs(Math.round(delta)).toLocaleString();
    this.deltaElement.textContent = `${up ? '▲ +$' : '▼ −$'}${amount}`;
    this.deltaElement.className = 'hud-delta';
    void this.deltaElement.offsetWidth;
    this.deltaElement.className = `hud-delta show ${up ? 'up' : 'down'}`;

    this.scoreValue.classList.remove('gain', 'loss');
    this.scoreValue.classList.add(up ? 'gain' : 'loss');
    this.scoreElement.classList.remove('gain', 'loss');
    this.scoreElement.classList.add(up ? 'gain' : 'loss');

    if (this.deltaTimer) clearTimeout(this.deltaTimer);
    this.deltaTimer = setTimeout(() => {
      this.deltaElement.classList.remove('show');
    }, 1500);

    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this.scoreValue.classList.remove('gain', 'loss');
      this.scoreElement.classList.remove('gain', 'loss');
    }, 850);
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
      const cls = 'hud-seg' + (on ? ' on' + (frac > 0.85 ? ' hot' : frac > 0.65 ? ' warm' : '') : '');
      if (seg.className !== cls) seg.className = cls;
    }
  }

  /**
   * Update displayed score (called each frame for smooth counting).
   * Counts BOTH ways: a bail's loss ticks down visibly instead of snapping, so the player
   * actually sees the money leave.
   */
  update(dt: number): void {
    if (this.displayedScore !== this.currentScore) {
      const diff = this.currentScore - this.displayedScore;
      const mag = Math.abs(diff);
      // Losses tick roughly twice as fast as gains: painful, but not a long wait.
      const speed = Math.max(10, mag * (diff < 0 ? 6 : 3));
      const step = Math.max(1, Math.round(speed * dt));

      const prevScore = this.displayedScore;
      this.displayedScore =
        diff > 0
          ? Math.min(this.currentScore, this.displayedScore + step)
          : Math.max(this.currentScore, this.displayedScore - step);
      this.scoreValue.textContent = '$' + Math.round(this.displayedScore).toLocaleString();

      if (mag > 100 && this.displayedScore !== prevScore) {
        const scale = 1 + Math.min(0.12, step / 500);
        this.scoreValue.style.transform = `scale(${scale})`;
        setTimeout(() => { this.scoreValue.style.transform = 'scale(1)'; }, 50);
      }
    }

    if (this.mapDirty) this.drawMinimap();
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
    this.setTimerUrgent(percent < 30 && percent > 0);
  }

  private setTimerUrgent(on: boolean): void {
    if (on === this.comboUrgent) return;
    this.comboUrgent = on;
    this.comboTimerFill.classList.toggle('urgent', on);
    this.comboClock.classList.toggle('urgent', on);
  }

  /**
   * Render the live combo from ScoreSystem's ComboState. Display only — this never
   * touches the banked score.
   *
   * Runs every frame, so every write is guarded behind a cached value: on a settled frame
   * this touches the DOM exactly twice (timer width + nothing else).
   */
  setComboState(state: ComboState | null): void {
    if (!state || !state.open || state.tricks.length === 0) {
      if (this.comboWrap.classList.contains('active')) {
        this.comboWrap.classList.remove('active');
        this.comboSig = '';
      }
      this.lastMultiplier = 1;
      return;
    }

    this.comboWrap.classList.add('active');

    // --- trick string: dim history, bright newest -------------------------
    const n = state.tricks.length;
    const last = state.tricks[n - 1].name;
    const sig = n + '|' + last;
    if (sig !== this.comboSig) {
      this.comboSig = sig;
      const shown = state.tricks.slice(Math.max(0, n - 7), n - 1).map((t) => t.name);
      const prefix = n - 1 > shown.length ? '… ' : '';
      this.comboTricksOld.textContent = shown.length ? prefix + shown.join('  +  ') + '  +  ' : prefix;
      this.comboTricksNew.textContent = last;
      // rtl container keeps the tail visible; nudge the scroll home for browsers that don't.
      this.comboTricks.scrollLeft = 0;

      const label = n === 1 ? 'COMBO · 1 TRICK' : `COMBO · ${n} TRICKS`;
      if (this.comboCount.textContent !== label) this.comboCount.textContent = label;
    }

    // --- the numbers ------------------------------------------------------
    if (state.formattedUnrealised !== this.comboScoreText) {
      this.comboScoreText = state.formattedUnrealised;
      this.comboScore.textContent = state.formattedUnrealised;
    }
    if (state.formattedMultiplier !== this.comboMultText) {
      this.comboMultText = state.formattedMultiplier;
      this.comboMult.textContent = state.formattedMultiplier;
    }
    if (state.multiplier > this.lastMultiplier + 0.001) {
      this.comboMult.classList.remove('pulse');
      void this.comboMult.offsetWidth;
      this.comboMult.classList.add('pulse');
    }
    this.lastMultiplier = state.multiplier;

    // --- tension: how loud should this thing be? --------------------------
    const tier = tensionTier(state.unrealised);
    if (tier !== this.comboTier) {
      this.comboTier = tier;
      this.comboWrap.className = 'hud-combo active' + (tier > 0 ? ' t' + tier : '');
    }

    // --- what a bail costs right now --------------------------------------
    const atRisk = Math.round(state.atRisk);
    const showRisk = atRisk >= 2000;
    const riskText = showRisk ? '−$' + atRisk.toLocaleString() : '';
    if (riskText !== this.comboRiskText) {
      this.comboRiskText = riskText;
      this.comboRiskValue.textContent = riskText;
      this.comboRisk.classList.toggle('show', showRisk);
    }

    // --- the clock --------------------------------------------------------
    const pct = Math.max(0, Math.min(1, state.timeFraction)) * 100;
    this.comboTimerFill.style.width = `${pct}%`;
    this.setTimerUrgent(pct < 30);

    const secs = Math.max(0, state.timeRemaining) / 1000;
    const clockText = secs.toFixed(1) + 's';
    if (clockText !== this.comboClockText) {
      this.comboClockText = clockText;
      this.comboClock.textContent = clockText;
    }
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
        this.closeCombo();
        if (event.gained > 0) {
          this.showGoalBanner('BANKED', `${event.formattedGain}  ·  ${event.tricks.length} tricks`, '#3BE38B');
        }
        break;

      case 'bail':
        this.closeCombo();
        this.showGoalBanner(event.headline, `${event.formattedForfeit}  ·  ${event.formattedLoss} banked`, '#FF5A3C');
        break;

      case 'tierReached':
        this.showGoalBanner(event.label, '', '#FFC01E');
        break;

      case 'balanceChanged':
        break;
    }
  }

  private closeCombo(): void {
    this.comboWrap.className = 'hud-combo';
    this.comboSig = '';
    this.comboTier = -1;
    this.lastMultiplier = 1;
  }

  // -------------------------------------------------------------------------
  // Goals
  // -------------------------------------------------------------------------

  /**
   * Render the level checklist. Cheap to call every frame: rows are built once and then
   * only their text / classes / progress bars are touched.
   *
   * Layout contract: every row is a three-column grid — `tick | description | progress`.
   * The tick lives in its own fixed column so completing a goal never reflows the text,
   * and the description is clamped to two lines so it can never run under its own value.
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
      if (row.text.textContent !== label) row.text.textContent = label;

      const mark = g.complete ? '✔' : (!row.isTier && g.failed ? '✕' : row.isTier ? '◆' : '□');
      if (row.box.textContent !== mark) row.box.textContent = mark;

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
      const box = document.createElement('div');
      box.className = 'hud-tier-box';
      box.textContent = '◆';
      const name = document.createElement('div');
      name.className = 'hud-tier-name';
      const detail = document.createElement('div');
      detail.className = 'hud-tier-detail';
      const barWrap = document.createElement('div');
      barWrap.className = 'hud-tier-bar';
      const bar = document.createElement('i');
      barWrap.appendChild(bar);
      root.appendChild(box);
      root.appendChild(name);
      root.appendChild(detail);
      root.appendChild(barWrap);
      this.goalsTiers.appendChild(root);
      this.goalRows.set(g.id, { root, box, text: name, detail, bar, isTier: true });
    }

    for (const g of others) {
      const root = document.createElement('div');
      root.className = 'hud-goal';
      const box = document.createElement('div');
      box.className = 'hud-goal-box';
      box.textContent = '□';
      const text = document.createElement('div');
      text.className = 'hud-goal-text';
      const detail = document.createElement('div');
      detail.className = 'hud-goal-detail';
      root.appendChild(box);
      root.appendChild(text);
      root.appendChild(detail);
      this.goalsList.appendChild(root);
      this.goalRows.set(g.id, { root, box, text, detail, bar: null, isTier: false });
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
    this.goalPopupTimer = setTimeout(() => this.goalPopup.classList.remove('show'), 2000);
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

  // -------------------------------------------------------------------------
  // Balance
  // -------------------------------------------------------------------------

  /**
   * Tell the HUD which balance the player is currently fighting, so it can show the meter
   * whose ORIENTATION matches the axis that corrects it: a manual is the vertical (↑/↓)
   * axis, a grind is the horizontal (←/→) axis.
   *
   * Safe to call every frame. Pass 'none' to hide.
   */
  setBalanceMode(mode: HUDBalanceMode): void {
    if (mode === this.balanceMode) return;
    this.balanceMode = mode;

    const vertical = mode === 'manual' || mode === 'noseManual';
    const horizontal = mode === 'grind' || mode === 'lip';
    if (vertical) this.balanceVLabel.textContent = mode === 'noseManual' ? 'NOSE MANUAL' : 'MANUAL';
    if (horizontal) this.balanceHLabel.textContent = mode === 'lip' ? 'LIP BALANCE' : 'GRIND BALANCE';

    this.applyBalanceVisibility();
  }

  /**
   * Show/hide the balance meter. Which meter appears is decided by setBalanceMode();
   * with no mode set this falls back to the horizontal (grind) meter.
   */
  setBalanceVisible(visible: boolean): void {
    if (visible === this.balanceVisible) return;
    this.balanceVisible = visible;
    this.applyBalanceVisibility();
  }

  private applyBalanceVisibility(): void {
    const vertical = this.balanceMode === 'manual' || this.balanceMode === 'noseManual';
    this.balanceV.classList.toggle('active', this.balanceVisible && vertical);
    this.balanceH.classList.toggle('active', this.balanceVisible && !vertical);
  }

  /**
   * Update balance position. 0 = left / nose-down edge, 0.5 = centre, 1 = right / tail-down edge.
   * The end arrow the player must PRESS lights up — you correct by leaning the other way.
   */
  setBalance(position: number): void {
    const p = Math.min(1, Math.max(0, position));
    const off = p - 0.5;
    const danger = Math.abs(off) > 0.34;
    const pressLow = off > 0.06;   // drifting to the +1 end -> press ◀ / ▼
    const pressHigh = off < -0.06; // drifting to the 0 end  -> press ▶ / ▲

    if (this.balanceMode === 'manual' || this.balanceMode === 'noseManual') {
      // Vertical track: 1 = tail down (pip at the top), 0 = nose down (pip at the bottom).
      this.balanceVArrow.style.bottom = `${p * 100}%`;
      this.balanceV.classList.toggle('danger', danger);
      this.balanceVDown.classList.toggle('press', pressLow);
      this.balanceVUp.classList.toggle('press', pressHigh);
    } else {
      this.balanceHArrow.style.left = `${p * 100}%`;
      this.balanceH.classList.toggle('danger', danger);
      this.balanceHLeft.classList.toggle('press', pressLow);
      this.balanceHRight.classList.toggle('press', pressHigh);
    }
  }

  // -------------------------------------------------------------------------
  // Minimap
  // -------------------------------------------------------------------------

  /**
   * Hand the HUD the level's XZ footprints once, at load. Everything static is baked into
   * an offscreen canvas here so the per-frame cost is one drawImage plus a triangle.
   */
  setMinimapLayout(prints: MinimapFootprint[]): void {
    this.mapStatic = null;
    this.mapTransform = null;
    this.mapWrap.classList.remove('active');
    if (!prints || prints.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of prints) {
      minX = Math.min(minX, p.x - p.w / 2);
      maxX = Math.max(maxX, p.x + p.w / 2);
      minZ = Math.min(minZ, p.z - p.d / 2);
      maxZ = Math.max(maxZ, p.z + p.d / 2);
    }
    if (!isFinite(minX) || maxX - minX < 1 || maxZ - minZ < 1) return;

    const spanX = (maxX - minX) * 1.06;
    const spanZ = (maxZ - minZ) * 1.06;
    const s = Math.min(MAP_W / spanX, MAP_H / spanZ);
    const ox = MAP_W / 2 - ((minX + maxX) / 2) * s;
    const oz = MAP_H / 2 - ((minZ + maxZ) / 2) * s;
    this.mapTransform = { ox, oz, s };

    // Anything covering a big share of the level is the floor or a wall — skip it.
    const areaCap = spanX * spanZ * 0.16;

    const off = document.createElement('canvas');
    off.width = MAP_W;
    off.height = MAP_H;
    const ctx = off.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, MAP_W, MAP_H);
    for (const p of prints) {
      if (p.w * p.d > areaCap) continue;
      const w = Math.max(1.5, p.w * s);
      const h = Math.max(1.5, p.d * s);
      const x = ox + p.x * s - w / 2;
      const y = oz + p.z * s - h / 2;
      ctx.fillStyle = p.rail ? 'rgba(255,192,30,0.75)' : 'rgba(190,205,230,0.34)';
      ctx.fillRect(x, y, w, h);
    }

    this.mapStatic = off;
    this.mapWrap.classList.add('active');
    this.mapDirty = true;
  }

  /** Per-frame player position in world space plus heading (radians, THREE yaw). */
  setMinimapPlayer(x: number, z: number, yaw: number): void {
    this.mapPlayer.x = x;
    this.mapPlayer.z = z;
    this.mapPlayer.yaw = yaw;
    this.mapDirty = true;
  }

  private drawMinimap(): void {
    this.mapDirty = false;
    const t = this.mapTransform;
    const ctx = this.mapCtx;
    if (!t || !this.mapStatic || !ctx) return;

    ctx.clearRect(0, 0, MAP_W, MAP_H);
    ctx.drawImage(this.mapStatic, 0, 0);

    const px = t.ox + this.mapPlayer.x * t.s;
    const py = t.oz + this.mapPlayer.z * t.s;
    // A THREE object with rotation.y = yaw points its local -Z at this world direction.
    const fx = -Math.sin(this.mapPlayer.yaw);
    const fz = -Math.cos(this.mapPlayer.yaw);
    const r = 11;

    ctx.beginPath();
    ctx.moveTo(px + fx * r, py + fz * r);
    ctx.lineTo(px - fx * r * 0.65 - fz * r * 0.6, py - fz * r * 0.65 + fx * r * 0.6);
    ctx.lineTo(px - fx * r * 0.65 + fz * r * 0.6, py - fz * r * 0.65 - fx * r * 0.6);
    ctx.closePath();
    ctx.fillStyle = '#3BE38B';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fill();
  }

  // -------------------------------------------------------------------------

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
    this.scoreElement.classList.remove('gain', 'loss');
    this.deltaElement.className = 'hud-delta';

    this.setSpeed(0);
    this.setSpecial(0);

    this.closeCombo();
    this.comboTimerFill.style.width = '100%';
    this.comboUrgent = true;
    this.setTimerUrgent(false);
    this.comboScoreText = '';
    this.comboMultText = '';
    this.comboRiskText = '';
    this.comboClockText = '';
    this.comboRisk.classList.remove('show');
    this.trickPopup.classList.remove('show');

    this.balanceVisible = false;
    this.balanceMode = 'none';
    this.balanceH.classList.remove('active', 'danger');
    this.balanceV.classList.remove('active', 'danger');
    this.balanceHLeft.classList.remove('press');
    this.balanceHRight.classList.remove('press');
    this.balanceVUp.classList.remove('press');
    this.balanceVDown.classList.remove('press');

    this.spinCounterElement.classList.remove('active');
    this.spinCounterElement.textContent = '';

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

/**
 * Flatten a level's meshes to XZ footprints for the minimap.
 *
 * Lives here rather than in Game.ts so the wiring is a single call: the HUD owns everything
 * about how the map is built. Ground planes, walls and merged instanced batches produce
 * boxes far larger than any real feature and are dropped by setMinimapLayout's area cap.
 */
export function minimapFootprints(objects: THREE.Object3D[]): MinimapFootprint[] {
  const box = new THREE.Box3();
  const out: MinimapFootprint[] = [];
  for (const o of objects) {
    if (!o || !o.visible) continue;
    box.makeEmpty();
    try {
      box.setFromObject(o);
    } catch {
      continue;
    }
    if (box.isEmpty() || !isFinite(box.min.x) || !isFinite(box.max.z)) continue;
    const w = box.max.x - box.min.x;
    const d = box.max.z - box.min.z;
    const h = box.max.y - box.min.y;
    if (w < 0.15 || d < 0.15) continue;
    if (h > 25) continue; // ceilings, walls, light rigs
    const longSide = Math.max(w, d);
    const shortSide = Math.min(w, d);
    out.push({
      x: (box.min.x + box.max.x) / 2,
      z: (box.min.z + box.max.z) / 2,
      w,
      d,
      rail: longSide > 3 && shortSide < 1.2,
    });
  }
  return out;
}

/** How loud the combo panel should be, from the size of the open position. */
function tensionTier(unrealised: number): number {
  let t = 0;
  for (let i = 0; i < COMBO_TENSION_STEPS.length; i++) {
    if (unrealised >= COMBO_TENSION_STEPS[i]) t = i + 1;
  }
  return t;
}

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
