/**
 * ScoreSystem — the single authoritative scoring + "stonks" economy for Tony Stonks Pro Trader.
 *
 * THE RULE (from the owner):
 *   "you make money when you earn points through completing tricks, or you lose money if you
 *    crash after racking up points during a trick."
 *
 * So this module models a combo as an OPEN POSITION:
 *   - Every trick you stack while the combo is open is UNREALISED gain. It is not money yet.
 *   - land()  -> the position closes green. Unrealised points are converted to stonks and BANKED.
 *   - bail()  -> the position closes red. You forfeit the whole unrealised amount AND you eat a
 *                MARGIN CALL: a fraction of your banked stonks, scaled by how big the combo you
 *                were risking was relative to your net worth. Capped so one bail can never wipe you out.
 *
 * This file is deliberately self-contained: it imports NOTHING from the game, the renderer, THREE,
 * Rapier, the HUD or Game.ts. Everything it needs is passed in. Wire it from the outside.
 *
 * Point values are consistent with src/tricks/TrickRegistry.ts (flips 400-1000, grabs 400-800,
 * grinds 300-600, manuals 200-250, specials 3000-5000).
 */

// ---------------------------------------------------------------------------
// Public data types
// ---------------------------------------------------------------------------

export type TrickKind =
  | 'flip'
  | 'grab'
  | 'grind'
  | 'manual'
  | 'spin'
  | 'revert'
  | 'gap'
  | 'special';

/** One scoreable action handed to the score system. */
export interface TrickScore {
  id: string;
  name: string;
  basePoints: number;
  kind: TrickKind;
}

/** A single line of the live combo readout. */
export interface ComboEntry {
  name: string;
  points: number;
}

/** Snapshot of the open position. Safe to hand straight to the HUD every frame. */
export interface ComboState {
  /** Is a combo currently open (i.e. is there an unrealised position)? */
  open: boolean;
  /** Ordered trick list, live grind/manual/spin entries included and updating. */
  tricks: ComboEntry[];
  /** Raw accumulated points before the multiplier. */
  base: number;
  /** Current combo multiplier (float, e.g. 5.8). */
  multiplier: number;
  /** floor(base * multiplier) — what you'd bank if you landed this instant. */
  unrealised: number;
  /** Milliseconds left on the combo clock before it auto-cashes-out. */
  timeRemaining: number;
  inGrind: boolean;
  inManual: boolean;
  // --- extras beyond the required shape, all cheap and useful to the HUD ---
  /** Total ms this combo has been open. */
  duration: number;
  /** Seconds spent grinding during this combo. */
  grindTime: number;
  /** Seconds spent manualing during this combo. */
  manualTime: number;
  /** Seconds of airtime accumulated during this combo. */
  airTime: number;
  /** Distinct trick ids used (drives the multiplier). */
  distinctTricks: number;
  /** "Kickflip + 50-50 + 360 Spin" */
  comboString: string;
  /** "$12,400" */
  formattedUnrealised: string;
  /** "x 5.8" */
  formattedMultiplier: string;
  /** 0..1 fraction of the combo clock left, for a timer bar. */
  timeFraction: number;
}

export type BailReason = 'grind' | 'landing' | 'collision' | 'police';

export type ScoreTier = 'high' | 'pro' | 'sick';

export interface ScoreTargets {
  high: number;
  pro: number;
  sick: number;
}

/** Why the banked balance moved. */
export type BalanceChangeReason =
  | 'land'
  | 'bail'
  | 'award'
  | 'spend'
  | 'set'
  | 'reset';

interface ScoreEventBase {
  type: 'trick' | 'land' | 'bail' | 'tierReached' | 'balanceChanged';
  /** Banked stonks AFTER this event was applied. */
  balance: number;
  /** performance.now() at emit time. */
  time: number;
}

/** A trick was added to the open position (nothing banked yet). */
export interface TrickScoreEvent extends ScoreEventBase {
  type: 'trick';
  trick: TrickScore;
  /** Points this trick contributed to `base` (after the repeat penalty). */
  points: number;
  /** How many times this id had already been used this combo (0 = first). */
  repeatCount: number;
  multiplier: number;
  unrealised: number;
  comboString: string;
  /** "+$500" style label for the trick popup. */
  formattedPoints: string;
}

/** The position closed green. Stonks were banked. */
export interface LandScoreEvent extends ScoreEventBase {
  type: 'land';
  /** Stonks added to the balance (always >= 0). */
  gained: number;
  base: number;
  multiplier: number;
  tricks: ComboEntry[];
  comboString: string;
  /** Combo duration in ms. */
  duration: number;
  /** True when the combo cashed out because the combo clock expired rather than a land() call. */
  viaTimeout: boolean;
  /** "+$12,400" */
  formattedGain: string;
}

/** The position closed red. */
export interface BailScoreEvent extends ScoreEventBase {
  type: 'bail';
  reason: BailReason;
  /** Unrealised stonks that evaporated (>= 0). Never touched the balance. */
  forfeited: number;
  /** Stonks removed from the banked balance. Negative. */
  loss: number;
  /** Fraction of the banked balance that was taken, 0..maxBailLossFraction. */
  lossFraction: number;
  tricks: ComboEntry[];
  comboString: string;
  /** 'MARGIN CALL' for a painful bail, 'CORRECTION' mid, 'DIP' for a cheap one. */
  headline: string;
  /** "-$3,120" */
  formattedLoss: string;
  /** "-$12,400 unrealised" */
  formattedForfeit: string;
}

/** Session score crossed a High / Pro / Sick target. */
export interface TierScoreEvent extends ScoreEventBase {
  type: 'tierReached';
  tier: ScoreTier;
  target: number;
  /** Gross points banked this run. */
  sessionScore: number;
  /** 'HIGH SCORE' | 'PRO SCORE' | 'SICK SCORE' */
  label: string;
}

/** The banked balance moved for any reason. */
export interface BalanceScoreEvent extends ScoreEventBase {
  type: 'balanceChanged';
  /** Signed change. */
  delta: number;
  reason: BalanceChangeReason;
  /** Short human label, e.g. 'Combo landed', 'Margin call', 'Goal reward'. */
  label: string;
  /** "+$1,200" / "-$450" */
  formattedDelta: string;
}

/**
 * Discriminated union of everything ScoreSystem emits. Switch on `.type`.
 * (Declared as a union rather than one wide interface so the HUD gets exhaustive checking.)
 */
export type ScoreEvent =
  | TrickScoreEvent
  | LandScoreEvent
  | BailScoreEvent
  | TierScoreEvent
  | BalanceScoreEvent;

export type ScoreListener = (event: ScoreEvent) => void;

/** One entry of the stock-ticker strip. */
export interface TickerEntry {
  text: string;
  amount: number;
  kind: 'gain' | 'loss';
  /** ms since the entry was pushed. */
  age: number;
  /** 1 -> 0 as the entry ages out. */
  life: number;
}

/** Everything about a run, for level-complete payout / StoryProgress. */
export interface RunSummary {
  balance: number;
  /** Gross points banked this run. This is what High/Pro/Sick compare against. */
  sessionScore: number;
  /** Stonks earned this run (gross, before bail losses). */
  sessionEarned: number;
  /** Stonks lost to bails this run. Positive number. */
  sessionLost: number;
  bestCombo: number;
  bestMultiplier: number;
  longestGrind: number;
  landedCombos: number;
  bails: number;
  tiersReached: ScoreTier[];
  targets: ScoreTargets;
  /** 0..1 progress toward the Sick target. */
  tierProgress: number;
}

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

export interface ScoreTuning {
  /** Stonks awarded per combo point. 1 point = $1. */
  stonksPerPoint: number;
  /** Stonks the player starts with. */
  startingBalance: number;
  /** ms the combo clock runs for once nothing is holding it open. */
  comboWindowMs: number;
  /** Repeating a trick id multiplies its points by this ^ repeatCount (THPS halves). */
  repeatFalloff: number;
  /** Repeats never fall below this fraction of base. */
  minRepeatFactor: number;

  /** Multiplier added per DISTINCT trick id in the combo. */
  multiplierPerDistinctTrick: number;
  /** Multiplier added per repeated trick (repeats are worth much less). */
  multiplierPerRepeatTrick: number;
  /** Extra multiplier for landing a special. */
  multiplierPerSpecial: number;
  /** Multiplier added per second of grinding. */
  multiplierPerGrindSecond: number;
  /** Multiplier added per second of manualing. */
  multiplierPerManualSecond: number;
  /** Cap on the grind+manual time contribution so an endless rail isn't infinite money. */
  maxTimeMultiplier: number;
  /** Hard ceiling on the multiplier. */
  maxMultiplier: number;

  /** Base points/sec for a 400-point grind at perfect balance is grindPointsPerSecond * 1.5. */
  grindPointsPerSecond: number;
  /** Base points/sec for a 200-point manual. */
  manualPointsPerSecond: number;
  /** Bonus for hopping rail-to-rail without dropping the combo. */
  transferBonus: number;
  /** ms after a grind ends during which a new grind counts as a transfer. */
  transferWindowMs: number;

  /** Points for a 180. Scales quadratically: points = spin180Points * steps^2. */
  spin180Points: number;

  /** Points for a revert. Reverts hold the combo open but do not add multiplier. */
  revertPoints: number;

  /** Airtime beyond this many seconds starts paying a Big Air bonus. */
  bigAirThreshold: number;
  /** Points per second of airtime past the threshold. */
  bigAirPointsPerSecond: number;

  /** Floor of the bail loss fraction, applied to any bail with an open combo. */
  minBailLossFraction: number;
  /** How hard the (combo / net worth) ratio pushes the loss fraction up. */
  bailRiskAversion: number;
  /** Absolute cap on the fraction of banked stonks a single bail can take. */
  maxBailLossFraction: number;
  /** Per-reason multiplier on the loss fraction. */
  bailReasonMultiplier: Record<BailReason, number>;
  /** Flat stonks taken even with no combo open (e.g. the cops fine you). */
  bailFlatPenalty: Record<BailReason, number>;
  /** Unrealised stonks at or above this get the red "MARGIN CALL" headline. */
  marginCallThreshold: number;
  /** Below this the bail is just a "DIP". */
  dipThreshold: number;
  /** If false the balance clamps at 0 instead of going negative. */
  allowNegativeBalance: boolean;

  /** ms a ticker entry stays on screen. */
  tickerLifetimeMs: number;
  /** Max ticker entries retained. */
  tickerMaxEntries: number;
}

export const DEFAULT_SCORE_TUNING: ScoreTuning = {
  stonksPerPoint: 1,
  startingBalance: 0,
  comboWindowMs: 2500,
  repeatFalloff: 0.5,
  minRepeatFactor: 0.05,

  multiplierPerDistinctTrick: 1.0,
  multiplierPerRepeatTrick: 0.25,
  multiplierPerSpecial: 1.0,
  multiplierPerGrindSecond: 0.4,
  multiplierPerManualSecond: 0.3,
  maxTimeMultiplier: 12,
  maxMultiplier: 99,

  grindPointsPerSecond: 120,
  manualPointsPerSecond: 60,
  transferBonus: 250,
  transferWindowMs: 1500,

  spin180Points: 100,

  revertPoints: 100,

  bigAirThreshold: 1.0,
  bigAirPointsPerSecond: 400,

  minBailLossFraction: 0.02,
  bailRiskAversion: 0.25,
  maxBailLossFraction: 0.30,
  bailReasonMultiplier: {
    grind: 0.9,
    landing: 0.8,
    collision: 1.0,
    police: 1.25,
  },
  bailFlatPenalty: {
    grind: 0,
    landing: 0,
    collision: 0,
    police: 250,
  },
  marginCallThreshold: 5000,
  dipThreshold: 1000,
  allowNegativeBalance: false,

  tickerLifetimeMs: 4000,
  tickerMaxEntries: 6,
};

export const DEFAULT_SCORE_TARGETS: ScoreTargets = {
  high: 10000,
  pro: 30000,
  sick: 75000,
};

// ---------------------------------------------------------------------------
// Formatting helpers (pure, exported so the HUD can use them without an instance)
// ---------------------------------------------------------------------------

/** "$12,400", "$1.24M", "-$450". Stonks are money — always show the sign for negatives. */
export function formatStonks(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (abs >= 1e9) return `${sign}$${trimZeros(abs / 1e9)}B`;
  if (abs >= 1e6) return `${sign}$${trimZeros(abs / 1e6)}M`;
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
}

/** "+$1,200" / "-$450" — for the delta ticker. */
export function formatStonksDelta(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  if (value === 0) return '$0';
  return `${value > 0 ? '+' : ''}${formatStonks(value)}`;
}

/** "x 5.8" (drops the decimal when it's whole). */
export function formatMultiplier(multiplier: number): string {
  const m = Number.isFinite(multiplier) ? multiplier : 1;
  const rounded = Math.round(m * 10) / 10;
  return Number.isInteger(rounded) ? `x ${rounded}` : `x ${rounded.toFixed(1)}`;
}

/** "Kickflip + 50-50 + 360 Shove-it" */
export function formatComboString(tricks: ComboEntry[]): string {
  if (tricks.length === 0) return '';
  return tricks.map((t) => t.name).join(' + ');
}

/** Name for a spin of n * 180 degrees: "360 Spin", "900 Spin". */
export function formatSpinName(degrees: number): string {
  return `${Math.round(degrees)} Spin`;
}

function trimZeros(v: number): string {
  return (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Signed yaw delta in DEGREES between two yaw angles in radians, wrapped into (-180, 180].
 *
 * The old spin code took a raw absolute delta, which breaks the moment yaw wraps past +/-pi
 * (you get a phantom 360). Feed consecutive yaw samples through this and hand the result to
 * addSpin() and spins stay correct across the wrap and keep their direction.
 */
export function yawDeltaDegrees(previousYawRad: number, currentYawRad: number): number {
  let d = currentYawRad - previousYawRad;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return (d * 180) / Math.PI;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface InternalEntry {
  id: string;
  name: string;
  kind: TrickKind;
  points: number;
  /** 0 = first use of this id in the combo. */
  repeatCount: number;
  /** Set for entries that keep accruing points (grind / manual / spin). */
  live: boolean;
}

const TIER_LABEL: Record<ScoreTier, string> = {
  high: 'HIGH SCORE',
  pro: 'PRO SCORE',
  sick: 'SICK SCORE',
};

const TIER_ORDER: ScoreTier[] = ['high', 'pro', 'sick'];

// ---------------------------------------------------------------------------
// ScoreSystem
// ---------------------------------------------------------------------------

export class ScoreSystem {
  private readonly tuning: ScoreTuning;

  // --- banked economy ---
  private _balance: number;

  // --- run stats ---
  private _sessionScore = 0;     // gross points banked this run (never decreases)
  private _sessionEarned = 0;    // gross stonks banked this run
  private _sessionLost = 0;      // stonks removed by bails this run
  private _bestCombo = 0;
  private _bestMultiplier = 1;
  private _longestGrind = 0;
  private _landedCombos = 0;
  private _bails = 0;

  // --- open position ---
  private open = false;
  private entries: InternalEntry[] = [];
  private basePoints = 0;
  private timer = 0;              // ms left on the combo clock
  private comboStart = 0;         // performance.now() when the combo opened
  private idCounts = new Map<string, number>();
  private distinctCount = 0;
  private repeatEntryCount = 0;
  private specialCount = 0;

  // --- continuous states ---
  private grindEntry: InternalEntry | null = null;
  private grindTime = 0;
  private grindTimeWeighted = 0;
  private currentGrindTime = 0;
  private grindBasePoints = 400;
  private lastGrindEndTime = -Infinity;

  private manualEntry: InternalEntry | null = null;
  private manualTime = 0;
  private manualTimeWeighted = 0;
  private manualBase = 200;

  // --- spin tracking ---
  private spinEntry: InternalEntry | null = null;
  private spinAccum = 0;
  private spinPeak = 0;
  private spinStepsAwarded = 0;

  // --- air ---
  private airborne = false;
  private airTime = 0;

  // --- targets ---
  private targetsValue: ScoreTargets = { ...DEFAULT_SCORE_TARGETS };
  private tiersHit = new Set<ScoreTier>();

  // --- ticker ---
  private ticker: { text: string; amount: number; kind: 'gain' | 'loss'; born: number }[] = [];

  // --- listeners ---
  private listeners: ScoreListener[] = [];

  constructor(tuning: Partial<ScoreTuning> = {}) {
    this.tuning = {
      ...DEFAULT_SCORE_TUNING,
      ...tuning,
      bailReasonMultiplier: {
        ...DEFAULT_SCORE_TUNING.bailReasonMultiplier,
        ...(tuning.bailReasonMultiplier ?? {}),
      },
      bailFlatPenalty: {
        ...DEFAULT_SCORE_TUNING.bailFlatPenalty,
        ...(tuning.bailFlatPenalty ?? {}),
      },
    };
    this._balance = this.tuning.startingBalance;
  }

  // =========================================================================
  // Events
  // =========================================================================

  /** Subscribe. Returns an unsubscribe function. */
  on(cb: ScoreListener): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private emit(event: ScoreEvent): void {
    // Copy so a listener that unsubscribes mid-dispatch can't corrupt the walk,
    // and isolate listener errors so a HUD bug can never take the game loop down.
    for (const l of [...this.listeners]) {
      try {
        l(event);
      } catch (err) {
        console.error('[ScoreSystem] listener threw', err);
      }
    }
  }

  // =========================================================================
  // Tricks
  // =========================================================================

  /**
   * Add a discrete trick to the open position. Opens the position if it isn't open.
   * Repeats of the same id within one combo are worth progressively less (THPS halves them).
   */
  addTrick(t: TrickScore): void {
    if (!t || !Number.isFinite(t.basePoints)) return;

    this.ensureOpen();

    const repeatCount = this.idCounts.get(t.id) ?? 0;
    this.idCounts.set(t.id, repeatCount + 1);

    const factor = Math.max(
      this.tuning.minRepeatFactor,
      Math.pow(this.tuning.repeatFalloff, repeatCount)
    );
    const points = Math.max(1, Math.floor(t.basePoints * factor));

    if (repeatCount === 0) this.distinctCount++;
    else this.repeatEntryCount++;
    if (t.kind === 'special') this.specialCount++;

    const entry: InternalEntry = {
      id: t.id,
      name: t.name,
      kind: t.kind,
      points,
      repeatCount,
      live: false,
    };
    this.entries.push(entry);
    this.basePoints += points;
    this.refreshTimer();

    const ev: TrickScoreEvent = {
      type: 'trick',
      trick: t,
      points,
      repeatCount,
      multiplier: this.multiplier,
      unrealised: this.unrealised,
      comboString: this.comboString,
      formattedPoints: formatStonksDelta(points * this.tuning.stonksPerPoint),
      balance: this._balance,
      time: now(),
    };
    this.emit(ev);
  }

  // =========================================================================
  // Grinds
  // =========================================================================

  /**
   * Begin a named grind (e.g. "50-50", "Smith Grind"). Call this the frame the grind starts.
   * Starting a grind again while already grinding, or within transferWindowMs of the last grind
   * ending, pays a transfer bonus — that's the rail-to-rail chain from THPS.
   *
   * @param name  Display name from TrickRegistry (TrickDetector.detectGrindType gives you one).
   * @param basePoints Optional base value for the grind (defaults to 400, the registry mid-point).
   */
  startGrind(name: string, basePoints = 400): void {
    if (this.grindEntry) this.endGrind();

    this.ensureOpen();

    const id = `grind:${name}`;
    const repeatCount = this.idCounts.get(id) ?? 0;
    this.idCounts.set(id, repeatCount + 1);
    if (repeatCount === 0) this.distinctCount++;
    else this.repeatEntryCount++;

    const factor = Math.max(
      this.tuning.minRepeatFactor,
      Math.pow(this.tuning.repeatFalloff, repeatCount)
    );

    this.grindBasePoints = Math.max(50, basePoints);
    const entryPoints = Math.max(1, Math.floor(this.grindBasePoints * factor));

    const entry: InternalEntry = {
      id,
      name,
      kind: 'grind',
      points: entryPoints,
      repeatCount,
      live: true,
    };
    this.entries.push(entry);
    this.basePoints += entryPoints;
    this.grindEntry = entry;
    this.currentGrindTime = 0;

    // Rail-to-rail transfer bonus.
    if (now() - this.lastGrindEndTime <= this.tuning.transferWindowMs) {
      const bonus = this.tuning.transferBonus;
      this.entries.push({
        id: 'transfer',
        name: 'Transfer',
        kind: 'gap',
        points: bonus,
        repeatCount: 0,
        live: false,
      });
      this.basePoints += bonus;
    }

    this.refreshTimer();

    const ev: TrickScoreEvent = {
      type: 'trick',
      trick: { id, name, basePoints: this.grindBasePoints, kind: 'grind' },
      points: entryPoints,
      repeatCount,
      multiplier: this.multiplier,
      unrealised: this.unrealised,
      comboString: this.comboString,
      formattedPoints: formatStonksDelta(entryPoints * this.tuning.stonksPerPoint),
      balance: this._balance,
      time: now(),
    };
    this.emit(ev);
  }

  /**
   * Accrue grind points. Call every fixed step while grinding.
   * @param dt seconds
   * @param balance01 grind balance, 0..1, 0.5 = centred. Centred pays more.
   */
  updateGrind(dt: number, balance01: number): void {
    const step = sanitizeDt(dt);
    if (step <= 0 || !this.grindEntry) return;

    const quality = balanceQuality(balance01);
    const scale = this.grindBasePoints / 400;
    const gained = this.tuning.grindPointsPerSecond * scale * (0.5 + quality) * step;

    this.grindEntry.points += gained;
    this.basePoints += gained;
    this.grindTime += step;
    this.currentGrindTime += step;
    // Balance quality feeds the multiplier clock too, but only partially — even a sloppy
    // grind is still holding the combo together.
    this.grindTimeWeighted += step * (0.6 + 0.4 * quality);

    if (this.currentGrindTime > this._longestGrind) {
      this._longestGrind = this.currentGrindTime;
    }

    this.refreshTimer();
  }

  /** End the current grind. Freezes its accrued points into the combo. Combo stays open. */
  endGrind(): void {
    if (!this.grindEntry) return;
    this.grindEntry.points = Math.floor(this.grindEntry.points);
    this.grindEntry.live = false;
    this.grindEntry = null;
    this.currentGrindTime = 0;
    this.lastGrindEndTime = now();
    this.refreshTimer();
  }

  // =========================================================================
  // Manuals
  // =========================================================================

  /** Begin a manual. `nose` picks Nose Manual (250) over Manual (200), matching the registry. */
  startManual(nose: boolean): void {
    if (this.manualEntry) this.endManual();

    this.ensureOpen();

    const id = nose ? 'nose_manual' : 'manual';
    const name = nose ? 'Nose Manual' : 'Manual';
    const base = nose ? 250 : 200;

    const repeatCount = this.idCounts.get(id) ?? 0;
    this.idCounts.set(id, repeatCount + 1);
    if (repeatCount === 0) this.distinctCount++;
    else this.repeatEntryCount++;

    const factor = Math.max(
      this.tuning.minRepeatFactor,
      Math.pow(this.tuning.repeatFalloff, repeatCount)
    );
    const entryPoints = Math.max(1, Math.floor(base * factor));

    const entry: InternalEntry = {
      id,
      name,
      kind: 'manual',
      points: entryPoints,
      repeatCount,
      live: true,
    };
    this.entries.push(entry);
    this.basePoints += entryPoints;
    this.manualEntry = entry;
    this.manualBase = base;
    this.refreshTimer();

    const ev: TrickScoreEvent = {
      type: 'trick',
      trick: { id, name, basePoints: base, kind: 'manual' },
      points: entryPoints,
      repeatCount,
      multiplier: this.multiplier,
      unrealised: this.unrealised,
      comboString: this.comboString,
      formattedPoints: formatStonksDelta(entryPoints * this.tuning.stonksPerPoint),
      balance: this._balance,
      time: now(),
    };
    this.emit(ev);
  }

  /**
   * Accrue manual points. Call every fixed step while manualing.
   * @param balance01 manual balance, 0..1, 0.5 = centred.
   */
  updateManual(dt: number, balance01: number): void {
    const step = sanitizeDt(dt);
    if (step <= 0 || !this.manualEntry) return;

    const quality = balanceQuality(balance01);
    const scale = this.manualBase / 200;
    const gained = this.tuning.manualPointsPerSecond * scale * (0.5 + quality) * step;

    this.manualEntry.points += gained;
    this.basePoints += gained;
    this.manualTime += step;
    this.manualTimeWeighted += step * (0.6 + 0.4 * quality);

    this.refreshTimer();
  }

  /** End the manual. Combo stays open. */
  endManual(): void {
    if (!this.manualEntry) return;
    this.manualEntry.points = Math.floor(this.manualEntry.points);
    this.manualEntry.live = false;
    this.manualEntry = null;
    this.refreshTimer();
  }

  // =========================================================================
  // Spins
  // =========================================================================

  /**
   * Feed SIGNED yaw change in degrees (use yawDeltaDegrees() to produce it).
   * Accumulates a signed total and awards 180 / 360 / 540 / 720 / 900 / ... as one entry that
   * upgrades in place, so a 900 reads as "900 Spin" and not "180 + 360 + 540 + 720 + 900".
   * Reversing direction closes the current spin and starts a new one.
   */
  addSpin(signedDegrees: number): void {
    if (!Number.isFinite(signedDegrees) || signedDegrees === 0) return;

    this.spinAccum += signedDegrees;
    const magnitude = Math.abs(this.spinAccum);
    if (magnitude > this.spinPeak) this.spinPeak = magnitude;

    // Genuine direction reversal: the player has unwound more than a half rotation from the peak
    // of this run. Close the run out (it keeps the points it already earned) and start counting
    // the new direction from zero. Small jitter never trips this.
    if (this.spinPeak - magnitude > 180) {
      this.closeSpin();
      return;
    }

    const steps = Math.floor(magnitude / 180);
    if (steps <= this.spinStepsAwarded) return;

    // New threshold crossed — award (or upgrade) the spin entry.
    this.ensureOpen();

    const degrees = steps * 180;
    const total = this.tuning.spin180Points * steps * steps;
    const name = formatSpinName(degrees);

    if (!this.spinEntry) {
      const id = 'spin';
      const repeatCount = this.idCounts.get(id) ?? 0;
      this.idCounts.set(id, repeatCount + 1);
      if (repeatCount === 0) this.distinctCount++;
      else this.repeatEntryCount++;

      this.spinEntry = {
        id,
        name,
        kind: 'spin',
        points: 0,
        repeatCount,
        live: true,
      };
      this.entries.push(this.spinEntry);
    }

    const repeatFactor = Math.max(
      this.tuning.minRepeatFactor,
      Math.pow(this.tuning.repeatFalloff, this.spinEntry.repeatCount)
    );
    const scaled = Math.floor(total * repeatFactor);
    const delta = scaled - this.spinEntry.points;

    this.spinEntry.name = name;
    this.spinEntry.points = scaled;
    this.basePoints += delta;
    this.spinStepsAwarded = steps;
    this.refreshTimer();

    const ev: TrickScoreEvent = {
      type: 'trick',
      trick: { id: `spin_${degrees}`, name, basePoints: total, kind: 'spin' },
      points: delta,
      repeatCount: this.spinEntry.repeatCount,
      multiplier: this.multiplier,
      unrealised: this.unrealised,
      comboString: this.comboString,
      formattedPoints: formatStonksDelta(delta * this.tuning.stonksPerPoint),
      balance: this._balance,
      time: now(),
    };
    this.emit(ev);
  }

  /** Finish the current spin run without ending the combo (called on landing). */
  private closeSpin(): void {
    if (this.spinEntry) {
      this.spinEntry.live = false;
      this.spinEntry = null;
    }
    this.spinAccum = 0;
    this.spinPeak = 0;
    this.spinStepsAwarded = 0;
  }

  // =========================================================================
  // Revert
  // =========================================================================

  /**
   * Revert. The combo glue: small flat points, no multiplier, but it re-opens the combo clock so
   * you can roll into a manual and keep the position open. Only meaningful with a combo open —
   * a revert with nothing at stake does nothing.
   */
  revert(): void {
    if (!this.open) return;

    const points = this.tuning.revertPoints;
    this.entries.push({
      id: 'revert',
      name: 'Revert',
      kind: 'revert',
      points,
      repeatCount: this.idCounts.get('revert') ?? 0,
      live: false,
    });
    this.idCounts.set('revert', (this.idCounts.get('revert') ?? 0) + 1);
    this.basePoints += points;
    this.refreshTimer();

    const ev: TrickScoreEvent = {
      type: 'trick',
      trick: { id: 'revert', name: 'Revert', basePoints: points, kind: 'revert' },
      points,
      repeatCount: 0,
      multiplier: this.multiplier,
      unrealised: this.unrealised,
      comboString: this.comboString,
      formattedPoints: formatStonksDelta(points * this.tuning.stonksPerPoint),
      balance: this._balance,
      time: now(),
    };
    this.emit(ev);
  }

  // =========================================================================
  // Airborne state
  // =========================================================================

  /**
   * Tell the system whether the player is in the air. REQUIRED WIRING — call it every frame or on
   * every transition. It does three things:
   *   1. Pauses the combo clock while airborne (hangtime must never kill a combo).
   *   2. Accrues airtime for the Big Air bonus paid on landing.
   *   3. Closes the spin run on touchdown so ground swivel doesn't award phantom 360s.
   */
  setAirborne(airborne: boolean): void {
    if (airborne === this.airborne) return;
    this.airborne = airborne;
    if (!airborne) this.closeSpin();
    else this.refreshTimer();
  }

  // =========================================================================
  // Tick
  // =========================================================================

  /**
   * Tick the combo clock. Call once per frame with dt in seconds.
   *
   * The clock is HELD (does not tick down) while airborne, grinding or manualing — that is the
   * THPS combo-glue loop. When it does run out, the position auto-cashes-out as a LAND (you keep
   * the money; only a bail loses it).
   */
  update(dt: number): void {
    const step = sanitizeDt(dt);
    this.pruneTicker();
    if (step <= 0) return;

    if (this.airborne && this.open) {
      this.airTime += step;
    }

    if (!this.open) return;

    const held = this.airborne || this.grindEntry !== null || this.manualEntry !== null;
    if (held) {
      this.timer = this.tuning.comboWindowMs;
      return;
    }

    this.timer -= step * 1000;
    if (this.timer <= 0) {
      this.timer = 0;
      this.cashOut(true);
    }
  }

  // =========================================================================
  // Close the position
  // =========================================================================

  /**
   * Land the combo. Converts the unrealised position into banked stonks.
   * @returns stonks gained (0 when nothing was open).
   */
  land(): number {
    if (!this.open) {
      this.closeSpin();
      return 0;
    }
    return this.cashOut(false);
  }

  private cashOut(viaTimeout: boolean): number {
    // Freeze any live entries first so the numbers in the event are final.
    this.endGrind();
    this.endManual();
    this.closeSpin();

    // Big Air bonus.
    if (this.airTime > this.tuning.bigAirThreshold) {
      const bonus = Math.floor(
        (this.airTime - this.tuning.bigAirThreshold) * this.tuning.bigAirPointsPerSecond
      );
      if (bonus > 0) {
        this.entries.push({
          id: 'big_air',
          name: 'Big Air',
          kind: 'gap',
          points: bonus,
          repeatCount: 0,
          live: false,
        });
        this.basePoints += bonus;
      }
    }

    const base = Math.floor(this.basePoints);
    const multiplier = this.multiplier;
    const points = Math.floor(base * multiplier);
    const gained = Math.max(0, Math.floor(points * this.tuning.stonksPerPoint));
    const tricks = this.snapshotEntries();
    const comboString = formatComboString(tricks);
    const duration = now() - this.comboStart;

    this._sessionScore += points;
    this._sessionEarned += gained;
    this._landedCombos++;
    if (points > this._bestCombo) this._bestCombo = points;
    if (multiplier > this._bestMultiplier) this._bestMultiplier = multiplier;

    this.applyBalance(gained, 'land', 'Combo landed');
    this.resetCombo();

    const ev: LandScoreEvent = {
      type: 'land',
      gained,
      base,
      multiplier,
      tricks,
      comboString,
      duration,
      viaTimeout,
      formattedGain: formatStonksDelta(gained),
      balance: this._balance,
      time: now(),
    };
    this.emit(ev);

    if (gained > 0) {
      this.pushTicker(comboString || 'Combo', gained, 'gain');
    }

    this.checkTiers();
    return gained;
  }

  /**
   * Bail. You forfeit the entire unrealised position AND take a margin call against your banked
   * stonks, sized by how big the combo was relative to your net worth and capped so a single bail
   * can never wipe you out.
   *
   * @returns stonks LOST as a NEGATIVE number (0 when nothing was lost).
   */
  bail(reason: BailReason): number {
    // Freeze live entries so the forfeited figure is honest.
    this.endGrind();
    this.endManual();
    this.closeSpin();

    const forfeitedPoints = this.open ? Math.floor(this.basePoints * this.multiplier) : 0;
    const forfeited = Math.max(0, Math.floor(forfeitedPoints * this.tuning.stonksPerPoint));
    const tricks = this.snapshotEntries();
    const comboString = formatComboString(tricks);

    const reasonMul = this.tuning.bailReasonMultiplier[reason] ?? 1;

    let lossFraction = 0;
    if (forfeited > 0) {
      const netWorth = Math.max(1, this._balance);
      const risk = forfeited / netWorth; // combo size relative to what you own
      lossFraction = (this.tuning.minBailLossFraction + risk * this.tuning.bailRiskAversion) * reasonMul;
      lossFraction = clamp(lossFraction, 0, this.tuning.maxBailLossFraction);
    }

    let loss = Math.floor(Math.max(0, this._balance) * lossFraction);
    // Flat fine even with nothing at stake (the cops don't care about your combo).
    const flat = Math.floor((this.tuning.bailFlatPenalty[reason] ?? 0) * reasonMul);
    loss += flat;

    if (!this.tuning.allowNegativeBalance) {
      loss = Math.min(loss, Math.max(0, this._balance));
    }

    this._bails++;
    if (forfeited > 0 || loss > 0) this._sessionLost += loss;

    if (loss > 0) {
      this.applyBalance(-loss, 'bail', reason === 'police' ? 'Asset seizure' : 'Margin call');
    }

    this.resetCombo();

    const headline =
      forfeited >= this.tuning.marginCallThreshold
        ? 'MARGIN CALL'
        : forfeited >= this.tuning.dipThreshold
          ? 'CORRECTION'
          : 'DIP';

    const ev: BailScoreEvent = {
      type: 'bail',
      reason,
      forfeited,
      loss: loss > 0 ? -loss : 0,
      lossFraction: this._balance + loss > 0 ? loss / (this._balance + loss) : 0,
      tricks,
      comboString,
      headline,
      formattedLoss: formatStonksDelta(-loss),
      formattedForfeit: `${formatStonks(forfeited)} unrealised`,
      balance: this._balance,
      time: now(),
    };
    this.emit(ev);

    if (loss > 0 || forfeited > 0) {
      this.pushTicker(headline, -(loss > 0 ? loss : forfeited), 'loss');
    }

    return loss > 0 ? -loss : 0;
  }

  // =========================================================================
  // Economy (collectibles, goal rewards, the upgrade shop)
  // =========================================================================

  /** Award stonks outside the combo loop — collectibles, goal rewards, level payouts. */
  addStonks(amount: number, label = 'Bonus'): void {
    const value = Math.floor(amount);
    if (!Number.isFinite(value) || value === 0) return;
    if (value > 0) {
      this._sessionEarned += value;
      this._sessionScore += Math.floor(value / Math.max(1e-6, this.tuning.stonksPerPoint));
    }
    this.applyBalance(value, 'award', label);
    this.pushTicker(label, value, value >= 0 ? 'gain' : 'loss');
    this.checkTiers();
  }

  /** Spend stonks (upgrade shop / cosmetics). Returns false and changes nothing if too poor. */
  spendStonks(amount: number, label = 'Purchase'): boolean {
    const value = Math.floor(Math.abs(amount));
    if (value === 0) return true;
    if (this._balance < value) return false;
    this.applyBalance(-value, 'spend', label);
    this.pushTicker(label, -value, 'loss');
    return true;
  }

  /** Hard-set the balance (e.g. seeding from saved StoryProgress at level load). */
  setBalance(amount: number, label = 'Sync'): void {
    const target = Math.floor(amount);
    if (!Number.isFinite(target)) return;
    const delta = target - this._balance;
    if (delta === 0) return;
    this.applyBalance(delta, 'set', label);
  }

  private applyBalance(delta: number, reason: BalanceChangeReason, label: string): void {
    this._balance += delta;
    if (!this.tuning.allowNegativeBalance && this._balance < 0) this._balance = 0;

    const ev: BalanceScoreEvent = {
      type: 'balanceChanged',
      delta,
      reason,
      label,
      formattedDelta: formatStonksDelta(delta),
      balance: this._balance,
      time: now(),
    };
    this.emit(ev);
  }

  // =========================================================================
  // High / Pro / Sick score tiers
  // =========================================================================

  /** Set this level's High / Pro / Sick point targets (from LevelData goals). */
  setScoreTargets(targets: Partial<ScoreTargets>): void {
    this.targetsValue = { ...this.targetsValue, ...targets };
    this.checkTiers();
  }

  get targets(): ScoreTargets {
    return { ...this.targetsValue };
  }

  /** Tiers reached this run, in order. */
  get tiersReached(): ScoreTier[] {
    return TIER_ORDER.filter((t) => this.tiersHit.has(t));
  }

  /** Highest tier reached this run, or null. */
  get highestTier(): ScoreTier | null {
    let best: ScoreTier | null = null;
    for (const t of TIER_ORDER) if (this.tiersHit.has(t)) best = t;
    return best;
  }

  private checkTiers(): void {
    for (const tier of TIER_ORDER) {
      const target = this.targetsValue[tier];
      if (target <= 0 || this.tiersHit.has(tier)) continue;
      if (this._sessionScore < target) continue;

      this.tiersHit.add(tier);
      const ev: TierScoreEvent = {
        type: 'tierReached',
        tier,
        target,
        sessionScore: this._sessionScore,
        label: TIER_LABEL[tier],
        balance: this._balance,
        time: now(),
      };
      this.emit(ev);
    }
  }

  // =========================================================================
  // Read-only views
  // =========================================================================

  get state(): ComboState {
    const tricks = this.snapshotEntries();
    const multiplier = this.multiplier;
    const unrealisedPoints = Math.floor(this.basePoints * multiplier);
    const unrealised = Math.max(0, Math.floor(unrealisedPoints * this.tuning.stonksPerPoint));
    return {
      open: this.open,
      tricks,
      base: Math.floor(this.basePoints),
      multiplier,
      unrealised,
      timeRemaining: this.timer,
      inGrind: this.grindEntry !== null,
      inManual: this.manualEntry !== null,
      duration: this.open ? now() - this.comboStart : 0,
      grindTime: this.grindTime,
      manualTime: this.manualTime,
      airTime: this.airTime,
      distinctTricks: this.distinctCount,
      comboString: formatComboString(tricks),
      formattedUnrealised: formatStonks(unrealised),
      formattedMultiplier: formatMultiplier(multiplier),
      timeFraction: clamp(this.timer / this.tuning.comboWindowMs, 0, 1),
    };
  }

  /** Banked stonks. The number the HUD shows next to the $. */
  get balance(): number {
    return this._balance;
  }

  /** "$12,400" */
  get formattedBalance(): string {
    return formatStonks(this._balance);
  }

  /** Gross points banked this run. This is what High/Pro/Sick compare against. */
  get sessionScore(): number {
    return this._sessionScore;
  }

  /** Unrealised stonks currently at risk. */
  get unrealised(): number {
    if (!this.open) return 0;
    return Math.max(0, Math.floor(this.basePoints * this.multiplier * this.tuning.stonksPerPoint));
  }

  /** Live combo multiplier. */
  get multiplier(): number {
    if (!this.open) return 1;
    const timeMult = Math.min(
      this.tuning.maxTimeMultiplier,
      this.grindTimeWeighted * this.tuning.multiplierPerGrindSecond +
        this.manualTimeWeighted * this.tuning.multiplierPerManualSecond
    );
    const m =
      1 +
      this.distinctCount * this.tuning.multiplierPerDistinctTrick +
      this.repeatEntryCount * this.tuning.multiplierPerRepeatTrick +
      this.specialCount * this.tuning.multiplierPerSpecial +
      timeMult;
    return Math.min(this.tuning.maxMultiplier, Math.round(m * 100) / 100);
  }

  /** "Kickflip + 50-50 + 360 Spin" */
  get comboString(): string {
    return formatComboString(this.snapshotEntries());
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Recent gains/losses for the stock-ticker strip, newest last. */
  getTicker(): TickerEntry[] {
    const t = now();
    return this.ticker.map((e) => {
      const age = t - e.born;
      return {
        text: e.text,
        amount: e.amount,
        kind: e.kind,
        age,
        life: clamp(1 - age / this.tuning.tickerLifetimeMs, 0, 1),
      };
    });
  }

  /** One-line ticker, e.g. "▲ Kickflip + 50-50 +$4,200   ▼ MARGIN CALL -$800". */
  getTickerLine(): string {
    return this.getTicker()
      .map((e) => `${e.kind === 'gain' ? '▲' : '▼'} ${e.text} ${formatStonksDelta(e.amount)}`)
      .join('   ');
  }

  getRunSummary(): RunSummary {
    return {
      balance: this._balance,
      sessionScore: this._sessionScore,
      sessionEarned: this._sessionEarned,
      sessionLost: this._sessionLost,
      bestCombo: this._bestCombo,
      bestMultiplier: this._bestMultiplier,
      longestGrind: this._longestGrind,
      landedCombos: this._landedCombos,
      bails: this._bails,
      tiersReached: this.tiersReached,
      targets: this.targets,
      tierProgress:
        this.targetsValue.sick > 0
          ? clamp(this._sessionScore / this.targetsValue.sick, 0, 1)
          : 0,
    };
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  /** Full reset: combo, run stats, tiers, ticker AND balance (back to startingBalance). */
  reset(): void {
    this.resetCombo();
    this.startRun();
    const delta = this.tuning.startingBalance - this._balance;
    if (delta !== 0) this.applyBalance(delta, 'reset', 'Reset');
  }

  /** Start a fresh run/level: clears the combo, run stats and tiers. KEEPS the banked balance. */
  startRun(): void {
    this.resetCombo();
    this._sessionScore = 0;
    this._sessionEarned = 0;
    this._sessionLost = 0;
    this._bestCombo = 0;
    this._bestMultiplier = 1;
    this._longestGrind = 0;
    this._landedCombos = 0;
    this._bails = 0;
    this.tiersHit.clear();
    this.ticker.length = 0;
    this.airborne = false;
  }

  /** Drop the open position without banking or penalising it (level reload, teleport, cutscene). */
  resetCombo(): void {
    this.open = false;
    this.entries = [];
    this.basePoints = 0;
    this.timer = 0;
    this.comboStart = 0;
    this.idCounts.clear();
    this.distinctCount = 0;
    this.repeatEntryCount = 0;
    this.specialCount = 0;
    this.grindEntry = null;
    this.grindTime = 0;
    this.grindTimeWeighted = 0;
    this.currentGrindTime = 0;
    this.manualEntry = null;
    this.manualTime = 0;
    this.manualTimeWeighted = 0;
    this.spinEntry = null;
    this.spinAccum = 0;
    this.spinPeak = 0;
    this.spinStepsAwarded = 0;
    this.airTime = 0;
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private ensureOpen(): void {
    if (this.open) return;
    this.open = true;
    this.comboStart = now();
    this.timer = this.tuning.comboWindowMs;
    this.airTime = 0;
  }

  private refreshTimer(): void {
    if (!this.open) return;
    this.timer = this.tuning.comboWindowMs;
  }

  private snapshotEntries(): ComboEntry[] {
    return this.entries.map((e) => ({ name: e.name, points: Math.floor(e.points) }));
  }

  private pushTicker(text: string, amount: number, kind: 'gain' | 'loss'): void {
    this.ticker.push({ text, amount, kind, born: now() });
    while (this.ticker.length > this.tuning.tickerMaxEntries) this.ticker.shift();
  }

  private pruneTicker(): void {
    if (this.ticker.length === 0) return;
    const t = now();
    this.ticker = this.ticker.filter((e) => t - e.born < this.tuning.tickerLifetimeMs);
  }
}

// ---------------------------------------------------------------------------
// module-local utilities
// ---------------------------------------------------------------------------

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** 1 at perfectly centred balance, 0 at the bail edge. */
function balanceQuality(balance01: number): number {
  const b = Number.isFinite(balance01) ? clamp(balance01, 0, 1) : 0.5;
  return 1 - Math.min(1, Math.abs(b - 0.5) * 2);
}

/** Guard against NaN / paused-tab dt spikes awarding a fortune in one frame. */
function sanitizeDt(dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  return Math.min(dt, 0.25);
}
