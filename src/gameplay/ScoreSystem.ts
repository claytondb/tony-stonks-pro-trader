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
  /**
   * What bailing RIGHT NOW would cost: the forfeited unrealised position plus the margin call
   * against the bank. This is the number that makes "bank it or push for one more feature" a
   * real decision instead of a shrug — the HUD should show it the moment it gets scary.
   */
  atRisk: number;
  /** Stonks a bail would take out of the BANKED balance right now (the margin call alone). */
  bankAtRisk: number;
  /** "-$14,900" */
  formattedAtRisk: string;
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
  /** Simulated ms since the ScoreSystem was created (see ScoreSystem.clockMs). */
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
  /**
   * ms the combo clock runs for once nothing is holding it open.
   *
   * TUNED FROM MEASUREMENT, not taste, and re-measured with the play harness rather than from the
   * level file. What matters is not the distance between rails but how long the combo clock is
   * actually RUNNING between features — airtime, grinds and manuals all hold it. Instrumenting a
   * 24 s ch1_office run (W + grind held, 12 grind episodes, 12 m/s median) gave the real
   * distribution of clock-ticking gaps between features:
   *
   *     median 0.45 s   p90 1.30 s   worst 1.35 s
   *
   * and the rail graph itself has a median rail-to-rail hop of 1.14 m (p90 2.48 m, worst 4.70 m).
   * 2200 ms therefore clears the worst gap that level design actually produces with ~60% headroom
   * — enough that a missed rail or a wide turn does not end the line — while still being 26 m at
   * cruise, well under a lap of the 41x43 m floorplate. Standing still ends the combo in 2.2 s,
   * so the clock is still a real clock.
   *
   * NOTE: this window was NEVER the thing killing lines. Game.ts force-banked the position 0.4 s
   * after every touchdown (LANDING_GRACE), which is below the MEDIAN gap between features — every
   * measured combo closed with `viaTimeout: false`, i.e. an explicit land(), never a lapsed clock.
   */
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
  /**
   * Minimum ms off the rail before a new grind counts as a transfer rather than the same ledge
   * continuing. Below this you never actually left, so there is nothing to reward.
   */
  transferMinGapMs: number;

  /** Points for a 180. Scales quadratically: points = spin180Points * steps^2. */
  spin180Points: number;

  /** Points for a revert. Reverts hold the combo open but do not add multiplier. */
  revertPoints: number;
  /**
   * ms a revert HOLDS the combo clock open, on top of resetting it.
   *
   * Revert-into-manual is the classic THPS glue, and it only works if the revert buys you enough
   * time to actually get the manual out. Resetting the clock is not enough on its own: the revert
   * is pressed on the landing frame, when the player still has to read the ground, find the next
   * feature and tap down-up. A hold means the clock is frozen for this long, so the revert is a
   * commitment that pays, not a coin flip.
   */
  revertHoldMs: number;

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

  /**
   * Whether addStonks() (pickups, goal rewards, level payouts) counts toward `sessionScore`.
   *
   * It used to, and that quietly destroyed the score tiers: a 60 s run of holding W in a straight
   * line, landing nothing, banked 9,750 session "score" in ch1_office — 9,150 of it pickups and
   * goal rewards — and cleared HIGH SCORE (8,000) without a single trick. HIGH/PRO/SICK have to
   * measure skating. Awards still hit the WALLET (`balance`, `sessionEarned`); they just no longer
   * buy you a tier.
   */
  awardsCountTowardSessionScore: boolean;

  /** ms a ticker entry stays on screen. */
  tickerLifetimeMs: number;
  /** Max ticker entries retained. */
  tickerMaxEntries: number;
}

export const DEFAULT_SCORE_TUNING: ScoreTuning = {
  stonksPerPoint: 1,
  startingBalance: 0,
  comboWindowMs: 2200,
  repeatFalloff: 0.5,
  minRepeatFactor: 0.05,

  multiplierPerDistinctTrick: 1.0,
  // THPS counts EVERY trick in the line toward the multiplier; only the points fall off on a
  // repeat. At 0.25 an eight-rail chain down the cubicle wall — the signature line of a level made
  // of 211 near-identical desk rails — was worth x2.75, so the correct play was to stop chaining
  // and start a fresh combo. At 0.5 it is worth x4.5 and chaining is always the better play, while
  // the 0.5^n falloff on the points still makes VARIETY worth more than spam.
  multiplierPerRepeatTrick: 0.5,
  multiplierPerSpecial: 1.0,
  multiplierPerGrindSecond: 0.45,
  multiplierPerManualSecond: 0.35,
  maxTimeMultiplier: 12,
  maxMultiplier: 99,

  grindPointsPerSecond: 120,
  manualPointsPerSecond: 60,
  transferBonus: 300,
  transferWindowMs: 1200,
  transferMinGapMs: 150,

  spin180Points: 100,

  revertPoints: 100,
  revertHoldMs: 1200,

  // A tap ollie now clears ~0.6 s of hangtime, a kicker rather more. At the old 1.0 s threshold
  // Big Air only ever paid off a ramp launch; at 0.8 s an ollie'd gap over the aisle pays too,
  // which is what makes players jump instead of hugging the floor.
  bigAirThreshold: 0.8,
  bigAirPointsPerSecond: 500,

  // THE RISK CURVE.
  // Bailing always forfeits 100% of the unrealised position — that is the real sting, and it is
  // self-scaling: the bigger the line you were riding, the more evaporates. The margin call on the
  // BANK on top of it exists to stop "just bail, I'll rebuild" being free, and is deliberately
  // proportional: it is a fraction of what you own, scaled by how big the position was RELATIVE to
  // your net worth, so an early bail costs pocket change and a bail with a 40k position on a 20k
  // bank hurts. Capped at 22% so no single mistake ever ends a session — a punished player stops
  // taking risks, and a player who stops taking risks stops playing this game.
  minBailLossFraction: 0.03,
  bailRiskAversion: 0.20,
  maxBailLossFraction: 0.22,
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
  // Headline bands, set against measured combo sizes in ch1_office: a competent line banks
  // 3-9k, a good one 15-40k. So CORRECTION starts where a real line starts and MARGIN CALL is
  // reserved for losing something you will actually remember losing.
  marginCallThreshold: 12000,
  dipThreshold: 2000,
  allowNegativeBalance: false,
  awardsCountTowardSessionScore: false,

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

  /**
   * SIMULATED milliseconds, advanced only by update(dt). Everything time-shaped in here — combo
   * duration, the rail-transfer window, ticker ageing — reads this and never performance.now().
   *
   * Wall clock was wrong twice over. In game it kept running through a pause, so a paused combo
   * aged and the ticker emptied behind the menu. And under tools/play.mjs, which steps fixedUpdate()
   * as fast as the CPU allows, 20 s of simulated skating passes in ~0.4 s of wall clock: the 1500 ms
   * transfer window covered the ENTIRE run, so every grind paid a transfer bonus and the harness
   * measured a game nobody was playing. Sim time makes the economy deterministic and reproducible,
   * which is the only way any of the numbers below can be trusted.
   */
  private clockMs = 0;

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
  private comboStart = 0;         // sim ms when the combo opened
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
  /** Sim ms until which a revert is freezing the combo clock. See ScoreTuning.revertHoldMs. */
  private revertHoldUntil = -Infinity;
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
      time: this.clockMs,
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
    //
    // Two guards, both measured. The gap has to be a real hop: ch1_office's 211 rails are one
    // connected graph (median 0.40 m between rail ends), so without a floor the grind system
    // re-captures the next collinear segment on the following frame and pays a full transfer for
    // riding a straight ledge. And the bonus takes the same repeat falloff as everything else —
    // flat 300s made a "hold the grind button" run 34 % transfer money, i.e. the most profitable
    // play in the game was pressing one key. The first hop in a line is the exciting one; after
    // that the MULTIPLIER is what should be paying you to keep chaining.
    const sinceLastGrind = this.clockMs - this.lastGrindEndTime;
    if (sinceLastGrind >= this.tuning.transferMinGapMs && sinceLastGrind <= this.tuning.transferWindowMs) {
      const transfers = this.idCounts.get('transfer') ?? 0;
      this.idCounts.set('transfer', transfers + 1);
      const bonus = Math.max(
        1,
        Math.floor(
          this.tuning.transferBonus *
            Math.max(this.tuning.minRepeatFactor, Math.pow(this.tuning.repeatFalloff, transfers))
        )
      );
      this.entries.push({
        id: 'transfer',
        name: 'Transfer',
        kind: 'gap',
        points: bonus,
        repeatCount: transfers,
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
      time: this.clockMs,
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
    this.lastGrindEndTime = this.clockMs;
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
      time: this.clockMs,
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
      time: this.clockMs,
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
    this.revertHoldUntil = this.clockMs + this.tuning.revertHoldMs;
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
      time: this.clockMs,
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
    // The sim clock is the ONLY thing that advances time in here, so a paused game freezes the
    // combo, the transfer window and the ticker exactly as a player would expect.
    this.clockMs += step * 1000;
    this.pruneTicker();
    if (step <= 0) return;

    if (this.airborne && this.open) {
      this.airTime += step;
    }

    if (!this.open) return;

    const held =
      this.airborne ||
      this.grindEntry !== null ||
      this.manualEntry !== null ||
      this.clockMs < this.revertHoldUntil;
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
    const duration = this.clockMs - this.comboStart;

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
      time: this.clockMs,
    };
    this.emit(ev);

    if (gained > 0) {
      this.pushTicker(comboString || 'Combo', gained, 'gain');
    }

    this.checkTiers();
    return gained;
  }

  /**
   * The margin call a bail would take out of the BANK, given the position it would forfeit.
   *
   * Shared by bail() and by `state.bankAtRisk`, so the number the HUD threatens you with and the
   * number you actually pay are the same number. They used to be computed in two places, which is
   * how a risk mechanic quietly becomes a lie.
   */
  private bankLossFor(reason: BailReason, forfeited: number): number {
    const reasonMul = this.tuning.bailReasonMultiplier[reason] ?? 1;

    let lossFraction = 0;
    if (forfeited > 0) {
      const netWorth = Math.max(1, this._balance);
      const risk = forfeited / netWorth; // position size relative to what you own
      lossFraction = (this.tuning.minBailLossFraction + risk * this.tuning.bailRiskAversion) * reasonMul;
      lossFraction = clamp(lossFraction, 0, this.tuning.maxBailLossFraction);
    }

    let loss = Math.floor(Math.max(0, this._balance) * lossFraction);
    // Flat fine even with nothing at stake (the cops don't care about your combo).
    loss += Math.floor((this.tuning.bailFlatPenalty[reason] ?? 0) * reasonMul);

    if (!this.tuning.allowNegativeBalance) {
      loss = Math.min(loss, Math.max(0, this._balance));
    }
    return loss;
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

    let loss = this.bankLossFor(reason, forfeited);

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
      time: this.clockMs,
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
      // Awards are money, not skating. They only move the tier bar when a level explicitly opts in.
      if (this.tuning.awardsCountTowardSessionScore) {
        this._sessionScore += Math.floor(value / Math.max(1e-6, this.tuning.stonksPerPoint));
      }
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
      time: this.clockMs,
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
        time: this.clockMs,
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
    // Worst realistic case, so the warning never under-promises: a collision bail (x1.0).
    const bankAtRisk = this.open ? this.bankLossFor('collision', unrealised) : 0;
    return {
      open: this.open,
      tricks,
      base: Math.floor(this.basePoints),
      multiplier,
      unrealised,
      timeRemaining: this.timer,
      inGrind: this.grindEntry !== null,
      inManual: this.manualEntry !== null,
      duration: this.open ? this.clockMs - this.comboStart : 0,
      grindTime: this.grindTime,
      manualTime: this.manualTime,
      airTime: this.airTime,
      distinctTricks: this.distinctCount,
      comboString: formatComboString(tricks),
      formattedUnrealised: formatStonks(unrealised),
      formattedMultiplier: formatMultiplier(multiplier),
      timeFraction: clamp(this.timer / this.tuning.comboWindowMs, 0, 1),
      atRisk: unrealised + bankAtRisk,
      bankAtRisk,
      formattedAtRisk: formatStonksDelta(-(unrealised + bankAtRisk)),
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
    const t = this.clockMs;
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
    this.revertHoldUntil = -Infinity;
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private ensureOpen(): void {
    if (this.open) return;
    this.open = true;
    this.comboStart = this.clockMs;
    this.timer = this.tuning.comboWindowMs;
    this.revertHoldUntil = -Infinity;
    this.airTime = 0;
  }

  /**
   * How much extra balance difficulty the CURRENT open position has earned, 0 .. 2.2.
   *
   * Feed this to BalanceSystem as `difficulty = 1 + comboPressure`. It is what stops a long line
   * from being free: the balance model's own `creep` only ramps within a single manual or grind,
   * and a line made of sixteen short grinds glued by manuals re-seeds that ramp sixteen times, so
   * without this a 35-trick combo balanced exactly as easily as the first rail of the run (a
   * measured 24 s / 35-trick unbroken line came out of the harness before this existed).
   *
   * Both halves matter. Trick COUNT is what the player is being paid for, so it should be what
   * they are charged for; DURATION stops a slow, cautious, low-scoring line from being safe just
   * because it is not stacking entries. The caps keep the top end at difficulty 3.2, which is
   * hairy — a ~2 s uncorrected grind, a ~3 s manual for an average pair of hands — but still
   * inside the model's controllable range, so a great player can hold it and a good one cannot.
   */
  get comboPressure(): number {
    if (!this.open) return 0;
    const seconds = (this.clockMs - this.comboStart) / 1000;
    return Math.min(1.4, this.entries.length * 0.07) + Math.min(0.8, seconds * 0.045);
  }

  /**
   * The combo clock's full length, in SECONDS.
   *
   * Exposed so the game does not have to keep a second, shorter combo timer of its own. It used
   * to: Game.ts banked the position 0.4 s after every touchdown, which is shorter than the median
   * measured gap between features (0.45 s), so the real combo window never got to run and every
   * line died on the first landing. There must be exactly one clock.
   */
  get comboWindowSeconds(): number {
    return this.tuning.comboWindowMs / 1000;
  }

  private refreshTimer(): void {
    if (!this.open) return;
    this.timer = this.tuning.comboWindowMs;
  }

  private snapshotEntries(): ComboEntry[] {
    return this.entries.map((e) => ({ name: e.name, points: Math.floor(e.points) }));
  }

  private pushTicker(text: string, amount: number, kind: 'gain' | 'loss'): void {
    this.ticker.push({ text, amount, kind, born: this.clockMs });
    while (this.ticker.length > this.tuning.tickerMaxEntries) this.ticker.shift();
  }

  private pruneTicker(): void {
    if (this.ticker.length === 0) return;
    const t = this.clockMs;
    this.ticker = this.ticker.filter((e) => t - e.born < this.tuning.tickerLifetimeMs);
  }
}

// ---------------------------------------------------------------------------
// module-local utilities
// ---------------------------------------------------------------------------

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
