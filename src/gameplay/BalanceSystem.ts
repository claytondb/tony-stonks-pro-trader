/**
 * BalanceSystem — manuals, nose manuals, reverts and the shared balance model for
 * Tony Stonks Pro Trader.
 *
 * WHY THIS EXISTS
 *   In Tony Hawk's Pro Skater the manual is the glue that turns four separate tricks into one
 *   200,000 point line. Without it every combo dies the moment the wheels touch the floor.
 *   This module owns that glue: the manual, the nose manual, the revert window that lets you
 *   roll out of a transition straight into a manual, and the one balance model shared by
 *   manuals, grinds and lip tricks.
 *
 * THE MODEL (not a random walk)
 *   The balance value is an INVERTED PENDULUM. Its acceleration is proportional to its own
 *   displacement, so the further you are from centre the harder it runs away from you:
 *
 *       auth  = 1 - outwardFalloff * clamp01(push * value)     // see below
 *       vel  += (instability * value + disturbance + push * torque * auth) * dt
 *       vel  *= exp(-damping * dt)
 *       value += clamp(vel + push * correctionRate * auth, -rateCap, +rateCap) * dt
 *
 *   `push` is the player's stick, `instability` scales with difficulty, with how long you have
 *   been holding the balance, and — exactly like THPS — with how SLOW you are going. A manual at
 *   walking pace is genuinely hard; a manual at speed is comfortable. The disturbance is two
 *   smooth out-of-phase oscillators plus a constant lean bias picked when the balance starts, so
 *   every manual feels different without ever being frame-to-frame jitter.
 *
 *   |value| >= 1 is a bail. Everything else is recoverable.
 *
 *   TWO TERMS EXIST BECAUSE OF THE KEYBOARD, and they are the difference between a manual you
 *   can hold and one you cannot. A key is not a stick: it produces -1, 0 or +1 and nothing in
 *   between, so "feathering" has to be expressible as alternating taps.
 *
 *     `outwardFalloff` cuts the player's authority when they are pushing FURTHER from centre.
 *       Without it a symmetric stick makes alternating taps a zero-mean input that the unstable
 *       mode simply grows through, and holding the direction that saves you carries straight on
 *       through centre into the opposite bail. Measured, before: a held direction bailed the
 *       manual in 0.39 s, and alternating taps bailed it in ~1.2 s at every rate from 200 ms to
 *       600 ms. After: an alternating input is net-restoring.
 *
 *     `maxRate` gives the meter one readable terminal speed in both directions. The exponential
 *       runaway crossed the last third of the meter in a couple of frames, so reaction time and
 *       not skill decided the outcome — a 150 ms player held a manual indefinitely and a 400 ms
 *       player for 1.2 s. That is a cliff, not a difficulty curve.
 *
 * ONE BALANCE PER LINE, NOT ONE PER FEATURE
 *   The balance is not re-seeded when a rail runs out. Game.ts drops the grind — and therefore
 *   the balance — the instant you leave a ledge, so while a combo is open the creep clock, the
 *   lean and the velocity are handed to whatever you link into next through the CARRY SLOT (see
 *   `carryWindow`). Without it a 70 second run re-seeded the pendulum 49 times, each seed mostly
 *   inside its own grace window, and |value| never got past 0.42 with the player asleep at the
 *   keys. With it the same run bails four times and the meter reaches 0.998.
 *
 *   Measured against the real class (200 trials, a line of 0.5 s rails, difficulty ramping on
 *   ch1_office's rhythm, speed 12 m/s): hands off the keys, a grind bails in 2.63 s and a manual
 *   in 2.12 s. A player actually working at it holds 9.5 s (280 ms hands) to 12.9 s (190 ms).
 *   Twelve seconds into a line those become 0.68 s and 1.1 s — the twentieth trick is roughly
 *   five times harder to hold than the second, which is the whole point.
 *
 * SELF-CONTAINED BY CONTRACT
 *   Imports nothing. No THREE, no Rapier, no Game.ts, no HUD. Everything it needs — dt, the
 *   stick axis, speed, grounded, difficulty — is passed in. It hands back a state struct and
 *   fires callbacks. Wire it from the outside.
 *
 * TYPICAL WIRING (fixed step, see the module report for exact call sites):
 *
 *   const balance = new BalanceSystem();
 *   balance.onBail(() => score.bail('landing'));
 *
 *   // per fixed step, AFTER input and grounding are known:
 *   if (intent.manualEdge !== 'none') {
 *     if (balance.tryStartManual(intent.manualEdge === 'noseManual', grounded, speed)) {
 *       score.startManual(balance.state.mode === 'noseManual');
 *     } else if (!balance.isActive) {
 *       score.endManual();
 *     }
 *   }
 *   const axisInput = balance.axis === 'vertical' ? intent.dir.y : intent.dir.x;
 *   const st = balance.update(dt, axisInput, speed, comboDifficulty);
 *   if (st.mode === 'manual' || st.mode === 'noseManual') score.updateManual(dt, st.balance01);
 *   chairGroup.rotation.x = st.pitchDegrees * DEG;   // see applyVisualTilt()
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type BalanceMode = 'none' | 'manual' | 'noseManual' | 'grind' | 'lip';

/** Which stick axis corrects the current balance. Manuals are up/down, grinds/lips left/right. */
export type BalanceAxis = 'none' | 'vertical' | 'horizontal';

/** Why a balance mode stopped. */
export type BalanceEndReason =
  /** |value| hit 1. The rider is on the floor. */
  | 'bail'
  /**
   * Reserved. Nothing produces this any more: re-tapping the manual input used to drop you out,
   * which on a keyboard meant every correction the player made cancelled the manual they were
   * correcting. Kept in the union so existing switch statements still compile.
   */
  | 'input'
  /** Rolled to a stop — you simply drop out of the manual, no crash. */
  | 'speed'
  /** end() was called by the game (jumped, landed on a rail, level reset...). */
  | 'external';

export interface BalanceState {
  mode: BalanceMode;
  /** -1..1, 0 centred. +1 = tipped fully back (manual) / fully right (grind, lip). */
  value: number;
  /** True once |value| passes the warning threshold — flash the HUD meter red. */
  failing: boolean;
  /** Seconds spent in the current mode. 0 when mode is 'none'. */
  timeInMode: number;
  /** Visual chair pitch in DEGREES, positive = nose up. Smoothed; decays to 0 after a bail. */
  pitchDegrees: number;
  /** Visual chair roll in DEGREES, positive = leaning to the rider's right. Smoothed. */
  rollDegrees: number;

  // --- extras (additive; anything typed to the six fields above still compiles) ---
  /** Same value remapped to ScoreSystem's convention: 0..1 with 0.5 centred. */
  balance01: number;
  /** 0..1 how close to a bail you are. 0 until the warning threshold, 1 at the bail. */
  danger: number;
  /** Which stick axis the player should be feathering right now. */
  axis: BalanceAxis;
}

/** Handed to bail listeners. A plain `() => void` listener is still valid. */
export interface BalanceBailInfo {
  mode: Exclude<BalanceMode, 'none'>;
  /** Signed value at the moment of the bail: +1 = went over backwards, -1 = went over the nose. */
  value: number;
  /** How long the balance had been held, in seconds. */
  duration: number;
  /** Ground speed passed in on the failing frame. */
  speed: number;
}

/** Handed to end listeners for EVERY exit, bails included. */
export interface BalanceEndInfo extends BalanceBailInfo {
  reason: BalanceEndReason;
}

export type BalanceBailListener = (info: BalanceBailInfo) => void;
export type BalanceEndListener = (info: BalanceEndInfo) => void;

/** Per-mode physical character of the balance. */
export interface BalanceModeTuning {
  /** Pendulum gain, 1/s^2. Higher = runs away from centre faster. */
  instability: number;
  /** Velocity damping, 1/s. Higher = heavier, less twitchy. */
  damping: number;
  /** Player torque authority, value-units/s^2 at full stick. */
  torque: number;
  /** Direct player correction rate, value-units/s at full stick. Gives taps their bite. */
  correctionRate: number;
  /** Disturbance amplitude, value-units/s^2. */
  wobble: number;
  /**
   * How much of the player's authority is taken away when they are pushing FURTHER FROM CENTRE,
   * 0..1. 0 = the stick is exactly as strong in both directions (a pure pendulum); 0.8 = pushing
   * out is only 20% as effective as pushing back at full lean.
   *
   * WHY THIS EXISTS — measured, not taste. With a symmetric stick, a keyboard (which can only
   * ever produce -1, 0 or +1) has no way to hold a manual: holding the direction that saves you
   * blasts straight through centre and bails you on the far side in 0.39 s, and alternating taps
   * are a zero-mean input, so the unstable mode just grows through them (measured: ~1.2 s to a
   * bail at every tap frequency from 200 ms to 600 ms). Cutting outward authority makes an
   * alternating input net-RESTORING, which is what turns feathering into a skill a digital
   * controller can actually express, and it gives an over-correction a moment of resistance
   * before it becomes a bail. It does nothing at all when the player is not pressing anything —
   * hands off the stick still bails in about two seconds.
   */
  outwardFalloff: number;
  /**
   * Ceiling on |balance velocity|, value-units/s. 0 disables.
   *
   * The pendulum is exponential, so without this the last 30% of the meter is crossed in a
   * couple of frames and reaction time, not skill, decides the outcome (a 150 ms player held a
   * manual for 30 s, a 400 ms player for 1.2 s — a cliff, not a difficulty curve). Capping the
   * rate keeps the runaway inevitable but gives the fall a readable, constant terminal speed.
   */
  maxRate: number;
  /** Speed at or above which the balance is at its easiest, m/s. 0 disables speed scaling. */
  comfortSpeed: number;
  /** Below this speed a manual drops out (reason 'speed'). Ignored when 0. */
  dropSpeed: number;
  /** Instability multiplier at a dead stop, blended to 1 at comfortSpeed. */
  slowPenalty: number;
  /** Seconds of ramp-in at the start where you cannot bail and the wobble builds. */
  grace: number;
  /** Extra instability per second held, as a fraction. 0.1 = +10% per second. */
  creepPerSecond: number;
  /** Ceiling on the creep multiplier so a long grind stays theoretically holdable. */
  creepCap: number;
  /** Static visual pitch at centre, degrees (positive = nose up). */
  basePitchDegrees: number;
  /** Extra pitch per unit of balance value, degrees. */
  pitchPerValue: number;
  /** Static visual roll at centre, degrees. */
  baseRollDegrees: number;
  /** Roll per unit of balance value, degrees. */
  rollPerValue: number;
}

export interface BalanceTuning {
  manual: BalanceModeTuning;
  noseManual: BalanceModeTuning;
  grind: BalanceModeTuning;
  lip: BalanceModeTuning;
  /**
   * Seconds after a balance releases during which the NEXT balance inherits it — the "carry".
   *
   * THE SINGLE MOST IMPORTANT NUMBER IN THIS FILE. Measured: `Game.endGrind()` calls
   * `balance.end()` the instant a rail runs out, and ch1_office's median grind episode is 0.50 s
   * against a 0.45 s grace window, so a 70 second run re-seeded the balance 49 times and every
   * one of those seeds was mostly invulnerable. The pendulum never got to run: |value| peaked at
   * 0.42 across 70 s of ZERO player input, and 0.26 with the stick jammed hard over for 30 s.
   *
   * One balance problem per LINE, not per feature. While a combo is open, the creep clock, the
   * lean and the difficulty ramp survive from rail to rail to manual, so a fifteen-rail chain is
   * one continuous eight-second balance instead of fifteen half-second freebies. The FIRST
   * balance of a line still gets its full grace and seeds near centre, which is why a newcomer
   * who rides one rail, hops off and banks can still never bail. Chaining is what costs.
   */
  carryWindow: number;
  /** |value| at which `failing` flips true and the meter should go red. */
  warnThreshold: number;
  /** Minimum ground speed needed to pop into a manual, m/s. */
  minManualStartSpeed: number;
  /** Seconds after a bail before a manual can be started again. */
  bailLockout: number;
  /** Revert window after landing off a ramp / quarterpipe, seconds. */
  revertWindowTransition: number;
  /** Revert window after an ordinary flat landing, seconds. Shorter — reverts are for transitions. */
  revertWindowFlat: number;
  /** How long a successful revert holds the combo open for, seconds. */
  revertHold: number;
  /** Refractory period between reverts, seconds. */
  revertCooldown: number;
  /** Visual tilt smoothing rate while a balance is active, 1/s. */
  tiltRateActive: number;
  /** Visual tilt smoothing rate while returning to neutral, 1/s. */
  tiltRateRelease: number;
  /** Largest integration sub-step, seconds. Keeps the exponential term honest on long frames. */
  maxSubStep: number;
}

// ---------------------------------------------------------------------------
// Defaults — every number here was chosen against the game's own scales:
// top speed 18 m/s (Game.ts), min grind speed 2.5 m/s (GrindSystem.ts).
// ---------------------------------------------------------------------------

export const DEFAULT_BALANCE_TUNING: BalanceTuning = {
  // A manual: chair up on its rear casters. Forgiving at speed, spicy when you bleed off.
  manual: {
    instability: 4.3,
    damping: 3.0,
    torque: 6.5,
    correctionRate: 1.35,
    wobble: 0.34,
    outwardFalloff: 0.78,
    maxRate: 0.95,
    comfortSpeed: 7,
    dropSpeed: 1.8,
    slowPenalty: 2.6,
    grace: 0.18,
    creepPerSecond: 0.05,
    creepCap: 2.0,
    basePitchDegrees: 18,
    pitchPerValue: 9,
    baseRollDegrees: 0,
    rollPerValue: 2.5,
  },
  // Nose manual: balanced over the front casters. Harder, tighter, worth more.
  noseManual: {
    instability: 5.2,
    damping: 3.0,
    torque: 6.8,
    correctionRate: 1.4,
    wobble: 0.42,
    outwardFalloff: 0.76,
    maxRate: 1.05,
    comfortSpeed: 7.5,
    dropSpeed: 2.2,
    slowPenalty: 2.8,
    grace: 0.2,
    creepPerSecond: 0.08,
    creepCap: 2.2,
    basePitchDegrees: -16,
    pitchPerValue: 8,
    baseRollDegrees: 0,
    rollPerValue: 2.5,
  },
  // Grind: easiest of the three, because grinds are meant to last and to be strung together.
  // No dropSpeed — when a grind ends is GrindSystem's call, not ours.
  grind: {
    // MEASURED, not guessed. A grind is corrected on the LEFT/RIGHT axis, which is also the steer
    // axis — the player is reading the level and lining up the next feature, not staring at the
    // balance meter. So an uncorrected grind has to survive a whole rail. ch1_office's rails are
    // 6.85 m at the median and 26.9 m at the longest, i.e. 0.6 s and 2.2 s at a 12 m/s cruise.
    //
    // MEASURED against the real class, 200 trials, a line of 0.5 s rails re-entered exactly the
    // way Game.endGrind()/startGrind() do it, difficulty ramping on ch1_office's own rhythm:
    //
    //           open loop   newcomer(500ms)  competent(280ms)  expert(190ms)  perfect(150ms)
    //   grind     2.63 s        6.95 s           9.50 s          12.88 s        18.92 s
    //   manual    2.12 s        6.15 s           9.53 s          12.13 s        16.45 s
    //
    // and the ramp that makes a long line precarious — remaining hold from H seconds in:
    //   H=0  open 2.63 s  competent  9.5 s      H=6   open 1.08 s  competent 3.8 s
    //   H=4  open 1.37 s  competent  5.8 s      H=12  open 0.68 s  competent 1.1 s
    //
    // So: an untouched grind bails in about two and a half seconds, a player working at it holds
    // ten or more, and the twentieth trick of a line is five times harder to hold than the second.
    // A single rail ridden on its own is still free (median episode 0.50 s, and the first balance
    // of a line keeps its 0.35 s grace); a CHAIN of them is not, because the carry slot makes a
    // chain one balance problem rather than one per rail.
    instability: 4.0,
    damping: 4.0,
    torque: 5.6,
    correctionRate: 1.1,
    wobble: 0.22,
    outwardFalloff: 0.8,
    maxRate: 0.9,
    comfortSpeed: 6,
    dropSpeed: 0,
    slowPenalty: 2.2,
    grace: 0.35,
    creepPerSecond: 0.05,
    creepCap: 2.0,
    basePitchDegrees: 0,
    pitchPerValue: 0,
    baseRollDegrees: 0,
    rollPerValue: 14,
  },
  // Lip trick: stalled on the coping with no speed at all to help you. The hardest hold.
  // comfortSpeed 0 => speed scaling is disabled, a lip is equally hard however you got there.
  lip: {
    instability: 6.0,
    damping: 3.2,
    torque: 7.6,
    correctionRate: 1.6,
    wobble: 0.5,
    outwardFalloff: 0.7,
    maxRate: 1.2,
    comfortSpeed: 0,
    dropSpeed: 0,
    slowPenalty: 1,
    grace: 0.25,
    creepPerSecond: 0.08,
    creepCap: 2.2,
    basePitchDegrees: 14,
    pitchPerValue: 0,
    baseRollDegrees: 0,
    rollPerValue: 22,
  },
  // The creep clock now runs across a whole LINE rather than resetting per feature, so a warning
  // fires once per line rather than once per rail and it has to arrive early enough to act on.
  // Measured time from the meter going red to the bail at 0.72: 0.32 s at line start, 0.17 s
  // mid-line, 0.11 s deep — all below human reaction time, i.e. decoration. At 0.50 those become
  // 0.67 s / 0.35 s / 0.23 s: a real prompt to correct or to bank.
  carryWindow: 1.5,
  warnThreshold: 0.5,
  minManualStartSpeed: 2.4,
  bailLockout: 0.5,
  revertWindowTransition: 1.4,
  revertWindowFlat: 0.9,
  revertHold: 1.2,
  revertCooldown: 0.6,
  tiltRateActive: 12,
  tiltRateRelease: 7,
  maxSubStep: 1 / 120,
};

// ---------------------------------------------------------------------------
// Small pure helpers (exported — the HUD and tests want these too)
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;
const DEG2RAD = Math.PI / 180;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** NaN / paused-tab guard. A 3 second frame must not instantly bail the player. */
function sanitizeDt(dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  return Math.min(dt, 0.25);
}

function sanitizeAxis(v: number): number {
  return Number.isFinite(v) ? clamp(v, -1, 1) : 0;
}

function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** Frame-rate independent exponential approach. */
function approach(current: number, target: number, rate: number, dt: number): number {
  if (rate <= 0 || dt <= 0) return current;
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** -1..1 signed balance -> ScoreSystem's 0..1 (0.5 = centred). */
export function toBalance01(value: number): number {
  return clamp01(0.5 + clamp(Number.isFinite(value) ? value : 0, -1, 1) * 0.5);
}

/** Which stick axis corrects a given mode. */
export function axisForMode(mode: BalanceMode): BalanceAxis {
  switch (mode) {
    case 'manual':
    case 'noseManual':
      return 'vertical';
    case 'grind':
    case 'lip':
      return 'horizontal';
    default:
      return 'none';
  }
}

/**
 * Sign that converts a RAW stick axis into a push on `value`.
 *
 * Vertical: the stick's +1 is UP, which throws the rider's weight FORWARD, i.e. towards
 * value = -1. So the vertical axis is inverted. Horizontal: +1 is RIGHT and leaning right
 * is value = +1, so it is not.
 */
function pushSignFor(mode: BalanceMode): number {
  return axisForMode(mode) === 'vertical' ? -1 : 1;
}

/**
 * Convenience for the renderer. Writes pitch/roll straight onto a THREE Euler
 * (structurally: anything with numeric `x` and `z`) with the right signs for the model's
 * facing. ChairModel builds the chair facing -Z, which is the three.js default, so the
 * default argument is the one you want.
 *
 * The chair's rigid body has enabledRotations(false, true, false) and can never pitch or
 * roll, so this MUST be applied to the visual group, not the body.
 *
 * IMPORTANT: it also forces the Euler order to 'YXZ'. Three.js defaults to 'XYZ', which
 * composes as Rx·Ry·Rz — the pitch would then be taken about the WORLD x axis and the chair
 * would tip sideways whenever it is not facing down -Z. 'YXZ' applies the existing yaw first
 * and then pitches/rolls in the chair's own frame, which is what a vehicle wants. Setting it
 * every call is free and means the caller cannot forget.
 */
export function applyVisualTilt(
  rotation: { x: number; z: number; order?: string },
  state: BalanceState,
  forwardAxis: '-z' | '+z' = '-z'
): void {
  const s = forwardAxis === '-z' ? 1 : -1;
  if (rotation.order !== undefined && rotation.order !== 'YXZ') rotation.order = 'YXZ';
  rotation.x = state.pitchDegrees * DEG2RAD * s;
  rotation.z = -state.rollDegrees * DEG2RAD * s;
}

// ---------------------------------------------------------------------------
// BalanceSystem
// ---------------------------------------------------------------------------

export class BalanceSystem {
  private readonly tuning: BalanceTuning;

  // --- balance integrator state ---
  private mode: BalanceMode = 'none';
  private value = 0;
  private vel = 0;
  private timeInMode = 0;
  /**
   * Seconds of CONTINUOUS balancing, carried across a manual <-> nose-manual switch and reset
   * only when the balance actually ends. `timeInMode` restarts on every switch; if creep read
   * that, shuffling manual/nose every half second would reset the difficulty ramp and buy an
   * infinite manual for two keys. Creep reads this instead, so the shuffle costs you points'
   * worth of variety but buys you nothing on the meter.
   */
  private heldTime = 0;
  /**
   * Grace window actually in force for the CURRENT entry, seconds. Normally the mode's `grace`;
   * 0 when this entry inherited a carry, because a carried entry is the middle of a balance the
   * player is already holding, not the start of a new one.
   */
  private entryGrace = 0;
  /**
   * THE CARRY SLOT. Survives a mode change — grind to grind, grind to manual, manual to nose —
   * for `carryWindow` seconds, so one open combo is one continuous balance problem. Cleared by a
   * bail, by `clearCarry()`, and automatically whenever the game reports no combo pressure (see
   * `update()`), which is what a bank looks like from in here.
   */
  private carry: {
    heldTime: number;
    sign: number;
    /** |value| at the moment the previous feature released. THE LEAN CARRIES, see enter(). */
    magnitude: number;
    vel: number;
    axis: BalanceAxis;
    at: number;
  } | null = null;
  /** Last `difficulty` handed to update(). Game.ts passes 1 + ScoreSystem.comboPressure. */
  private lastDifficulty = 1;

  // --- disturbance oscillators (deterministic between re-seeds, re-seeded per entry) ---
  private phaseA = 0;
  private phaseB = 0;
  private freqA = 0.7;
  private freqB = 1.9;
  private driftBias = 0;

  // --- visual ---
  private visualPitch = 0;
  private visualRoll = 0;

  // --- clocks (seconds, advanced only by update(); pausing the game pauses these) ---
  private clock = 0;
  private bailLockoutUntil = -Infinity;
  private landTime = -Infinity;
  private landWindow = 0;
  private revertActiveUntil = -Infinity;
  private revertReadyAt = -Infinity;
  private stanceSwitch = false;

  // --- last known speed, so bail info is truthful even if end() comes from outside ---
  private lastSpeed = 0;

  // --- listeners ---
  private bailListeners: BalanceBailListener[] = [];
  private endListeners: BalanceEndListener[] = [];

  private readonly _state: BalanceState = {
    mode: 'none',
    value: 0,
    failing: false,
    timeInMode: 0,
    pitchDegrees: 0,
    rollDegrees: 0,
    balance01: 0.5,
    danger: 0,
    axis: 'none',
  };

  constructor(tuning?: Partial<BalanceTuning>) {
    this.tuning = {
      ...DEFAULT_BALANCE_TUNING,
      ...tuning,
      manual: { ...DEFAULT_BALANCE_TUNING.manual, ...tuning?.manual },
      noseManual: { ...DEFAULT_BALANCE_TUNING.noseManual, ...tuning?.noseManual },
      grind: { ...DEFAULT_BALANCE_TUNING.grind, ...tuning?.grind },
      lip: { ...DEFAULT_BALANCE_TUNING.lip, ...tuning?.lip },
    };
    this.syncState();
  }

  // =========================================================================
  // Entry points
  // =========================================================================

  /**
   * Try to pop into a manual (down-up) or nose manual (up-down).
   *
   * Returns true only when a NEW manual actually started — that is the frame on which the
   * integrator should call `ScoreSystem.startManual(nose)`.
   *
   * Rules, in THPS order:
   *   - airborne, too slow, or locked out after a bail -> false, nothing happens.
   *   - already grinding or in a lip trick -> false, nothing happens (you can't manual a rail).
   *   - already in the SAME manual -> nothing happens, returns false. This USED to end the
   *     manual, and it was the single biggest thing stopping lines from lasting: the only way to
   *     correct a manual on a keyboard is to alternate Down and Up, and Down-then-Up IS the
   *     manual input, so the player's correction cancelled the manual. You leave a manual by
   *     ollieing, grinding, rolling to a stop, or eating it.
   *   - already in the OTHER manual -> switches manual <-> nose manual, keeping the balance
   *     value (which is now working against you), and returns true. This is the manual/nose
   *     manual shuffle that keeps a long line scoring.
   */
  tryStartManual(nose: boolean, grounded: boolean, speed: number): boolean {
    const target: BalanceMode = nose ? 'noseManual' : 'manual';
    const spd = Number.isFinite(speed) ? Math.abs(speed) : 0;
    this.lastSpeed = spd;

    // Re-tapping the SAME manual used to drop you out of it. On a keyboard that is fatal: the
    // only way to correct a manual is to alternate Down and Up, and Down-then-Up IS the manual
    // input, so every correction the player made cancelled the thing they were correcting.
    // A repeat is now a no-op — you leave a manual by ollieing, grinding, rolling to a stop or
    // eating it, exactly as in THPS.
    if (this.mode === target) return false;

    if (this.mode === 'grind' || this.mode === 'lip') return false;
    if (!grounded) return false;
    if (spd < this.tuning.minManualStartSpeed) return false;
    if (this.clock < this.bailLockoutUntil) return false;

    const switching = this.mode === 'manual' || this.mode === 'noseManual';
    if (switching) {
      // Keep the lean but flip which way it is dangerous: an over-rotated manual becomes a
      // nearly-blown nose manual. Cheeky, survivable, and it rewards a clean shuffle.
      const carried = clamp(-this.value * 0.6, -0.55, 0.55);
      this.enter(target, carried, -this.vel * 0.4);
    } else {
      this.enter(target, 0, 0);
    }
    return true;
  }

  /**
   * Begin balancing a grind. Call this from the frame the grind actually latches on.
   * Always succeeds and always replaces whatever was being balanced (an existing manual is
   * ended with reason 'external' — you manualled onto a rail, the manual is over, the combo
   * is not).
   */
  startGrind(): void {
    if (this.mode === 'grind') return;
    this.enter('grind', 0, 0);
  }

  /** Begin balancing a lip trick / stall. Same replacement semantics as startGrind(). */
  startLip(): void {
    if (this.mode === 'lip') return;
    this.enter('lip', 0, 0);
  }

  /**
   * Forget the carried balance, so the next grind / manual starts a genuinely fresh problem with
   * its full grace window and a near-centre seed.
   *
   * Call it wherever a LINE ends rather than a feature: on land()/cash-out and on bail(). A bail
   * already clears it internally, and a bank is detected automatically from `difficulty` in
   * update(), so this is belt and braces — but it is cheap, idempotent, and it is the honest
   * place to express "that position is closed".
   */
  clearCarry(): void {
    this.carry = null;
  }

  /**
   * Stop balancing, cleanly, with no bail. Call on jump, on landing from a manual into the
   * air, when the grind releases, on level reset, on death. Safe to call when idle.
   */
  end(): void {
    if (this.mode === 'none') return;
    this.finish('external');
  }

  // =========================================================================
  // Revert
  // =========================================================================

  /**
   * Tell the system the player just touched down. REQUIRED for reverts to work — the revert
   * window is measured from here.
   *
   * @param fromTransition true when the landing came off a ramp / quarterpipe / any curved
   *        transition. Transition landings get the full window; flat landings get a short one,
   *        because in THPS the revert is a transition trick.
   * @param speed ground speed at touchdown, m/s. Optional: it refreshes the cached speed so a
   *        manual popped on the same frame as the landing reports the truth if it bails.
   */
  notifyLanded(fromTransition = false, speed = 0): void {
    this.landTime = this.clock;
    this.landWindow = fromTransition
      ? this.tuning.revertWindowTransition
      : this.tuning.revertWindowFlat;
    if (Number.isFinite(speed) && speed > 0) this.lastSpeed = Math.abs(speed);
  }

  /**
   * Try to revert. Returns true when the revert took — that is the frame on which the
   * integrator should call `ScoreSystem.revert()` (which re-opens the combo clock) and play
   * the revert animation.
   *
   * A revert only lands inside the window opened by `notifyLanded()`. Passing
   * `landedFromTransition = true` here also opens that window on the spot, so a caller that
   * knows it just landed off a ramp can drive this with a single call and skip notifyLanded().
   *
   * On success the stance flips (regular <-> switch) and `revertTimeRemaining` starts running:
   * that is the window in which the player is expected to tap into a manual to keep the
   * position open.
   */
  tryRevert(landedFromTransition: boolean): boolean {
    if (landedFromTransition && this.clock - this.landTime > this.tuning.revertWindowTransition) {
      // Caller is asserting a fresh transition landing we were never told about.
      this.notifyLanded(true, this.lastSpeed);
    }
    if (this.isActive) return false;
    if (this.clock < this.revertReadyAt) return false;

    const window = landedFromTransition
      ? Math.max(this.landWindow, this.tuning.revertWindowTransition)
      : this.landWindow;
    if (this.clock - this.landTime > window) return false;

    this.revertActiveUntil = this.clock + this.tuning.revertHold;
    this.revertReadyAt = this.clock + this.tuning.revertCooldown;
    this.stanceSwitch = !this.stanceSwitch;
    // Consume the landing so one touchdown cannot be reverted twice.
    this.landTime = -Infinity;
    return true;
  }

  /** Seconds left of the post-revert window. > 0 means "keep the combo open". */
  get revertTimeRemaining(): number {
    return Math.max(0, this.revertActiveUntil - this.clock);
  }

  /** True while a revert is holding the combo open. */
  get isReverting(): boolean {
    return this.revertTimeRemaining > 0;
  }

  /** Seconds left in which `tryRevert()` could still succeed. Drive a HUD prompt off this. */
  get revertWindowRemaining(): number {
    if (this.isActive || this.clock < this.revertReadyAt) return 0;
    return Math.max(0, this.landTime + this.landWindow - this.clock);
  }

  /** Reverts flip you between regular and switch stance, like they should. */
  get stance(): 'regular' | 'switch' {
    return this.stanceSwitch ? 'switch' : 'regular';
  }

  // =========================================================================
  // Tick
  // =========================================================================

  /**
   * Advance the balance. Call once per fixed step, every step, even when nothing is being
   * balanced — the visual tilt decay, the revert window and the bail lockout all live on this
   * clock.
   *
   * @param dt      seconds.
   * @param input   RAW stick axis, -1..1. Pass `dir.y` when `axis === 'vertical'` (manuals) and
   *                `dir.x` when `axis === 'horizontal'` (grinds, lips). The sign flip that makes
   *                "press up to save a backwards manual" work is applied in here.
   * @param speed   ground speed, m/s. Slow is hard.
   * @param difficulty 1 = the standard game. 0 = beginner-stable, 2 = twice as lively. Feed the
   *                combo length in here to make long lines progressively hairier.
   */
  update(dt: number, input: number, speed: number, difficulty: number): BalanceState {
    const step = sanitizeDt(dt);
    this.clock += step;

    const spd = Number.isFinite(speed) ? Math.abs(speed) : 0;
    this.lastSpeed = spd;
    const stick = sanitizeAxis(input);
    const diff = Number.isFinite(difficulty) ? clamp(difficulty, 0, 4) : 1;
    this.lastDifficulty = diff;

    // A CLOSED position has no carry. `difficulty` is 1 + ScoreSystem.comboPressure, so a value
    // of exactly 1 with nothing being balanced means the line banked (or never opened) and the
    // next grind starts a genuinely fresh balance with its full grace. This is the automatic half
    // of the contract; `clearCarry()` is the explicit half, and calling both is harmless.
    if (this.mode === 'none' && this.carry !== null && diff <= 1.0001) this.carry = null;

    if (this.mode !== 'none' && step > 0) {
      const t = this.tuningFor(this.mode);

      // Roll out of a manual you no longer have the speed to hold. Not a crash — you just
      // put the casters down. The combo survives; the manual entry stops accruing.
      if (t.dropSpeed > 0 && spd < t.dropSpeed) {
        this.finish('speed');
      } else {
        this.integrate(step, stick, spd, diff, t);
      }
    }

    this.updateVisual(step);
    this.syncState();
    return this._state;
  }

  // =========================================================================
  // Queries
  // =========================================================================

  /** Live view of the balance. Read it, don't store it — the object is reused every frame. */
  get state(): BalanceState {
    return this._state;
  }

  get isActive(): boolean {
    return this.mode !== 'none';
  }

  /** True while a manual or nose manual is being held. */
  get isManualing(): boolean {
    return this.mode === 'manual' || this.mode === 'noseManual';
  }

  /** Which stick axis the player should be feathering right now. */
  get axis(): BalanceAxis {
    return axisForMode(this.mode);
  }

  /** ScoreSystem's convention: 0..1, 0.5 centred. Feed straight to update{Manual,Grind}. */
  get balance01(): number {
    return toBalance01(this.value);
  }

  // =========================================================================
  // Events
  // =========================================================================

  /** Subscribe to bails. Returns an unsubscribe function. */
  onBail(cb: BalanceBailListener): () => void {
    this.bailListeners.push(cb);
    return () => {
      const i = this.bailListeners.indexOf(cb);
      if (i >= 0) this.bailListeners.splice(i, 1);
    };
  }

  /** Subscribe to EVERY exit, bails included. Returns an unsubscribe function. */
  onEnd(cb: BalanceEndListener): () => void {
    this.endListeners.push(cb);
    return () => {
      const i = this.endListeners.indexOf(cb);
      if (i >= 0) this.endListeners.splice(i, 1);
    };
  }

  /** Full reset — new level, new run, respawn. Keeps listeners, drops all state. */
  reset(): void {
    this.mode = 'none';
    this.value = 0;
    this.vel = 0;
    this.timeInMode = 0;
    this.heldTime = 0;
    this.entryGrace = 0;
    this.carry = null;
    this.lastDifficulty = 1;
    this.visualPitch = 0;
    this.visualRoll = 0;
    this.clock = 0;
    this.bailLockoutUntil = -Infinity;
    this.landTime = -Infinity;
    this.landWindow = 0;
    this.revertActiveUntil = -Infinity;
    this.revertReadyAt = -Infinity;
    this.stanceSwitch = false;
    this.lastSpeed = 0;
    this.syncState();
  }

  // =========================================================================
  // Internals
  // =========================================================================

  private tuningFor(mode: BalanceMode): BalanceModeTuning {
    switch (mode) {
      case 'noseManual':
        return this.tuning.noseManual;
      case 'grind':
        return this.tuning.grind;
      case 'lip':
        return this.tuning.lip;
      default:
        return this.tuning.manual;
    }
  }

  private enter(mode: BalanceMode, startValue: number, startVel: number): void {
    const shuffling =
      (this.mode === 'manual' && mode === 'noseManual') ||
      (this.mode === 'noseManual' && mode === 'manual');
    const carriedHeldTime = this.heldTime;
    if (this.mode !== 'none' && this.mode !== mode) {
      // Replacing one balance with another is an exit, so score listeners can close the
      // old entry before the new one opens.
      this.finish('external');
    }
    // Inherit the line's balance if one released recently enough. `finish()` wrote the carry on
    // the way out of the previous feature (including the finish() two lines above), so a rail ->
    // rail hop, a rail -> manual link and a manual <-> nose shuffle all land here with the creep
    // clock intact and NO fresh grace. That is the whole fix: the difficulty ramp belongs to the
    // combo, not to the feature.
    const carry = this.carry;
    const inherits =
      carry !== null &&
      this.clock - carry.at <= this.tuning.carryWindow &&
      this.lastDifficulty > 1.0001; // i.e. a position really is open, per ScoreSystem
    const t = this.tuningFor(mode);

    this.mode = mode;
    this.timeInMode = 0;
    this.heldTime = inherits ? carry!.heldTime : shuffling ? carriedHeldTime : 0;
    this.entryGrace = inherits ? 0 : t.grace;

    // Re-seed the disturbance so no two manuals drift the same way.
    this.phaseA = Math.random() * TAU;
    this.phaseB = Math.random() * TAU;
    this.freqA = 0.55 + Math.random() * 0.35;
    this.freqB = 1.6 + Math.random() * 0.9;
    this.driftBias = (Math.random() * 2 - 1) * 0.45;

    // Never start dead centre. A perfectly balanced pendulum with a symmetric disturbance
    // would sit there for a beat before departing, which reads as "the manual is free for the
    // first second". Seed a small lean in the direction the drift is already pulling, so the
    // balance starts moving on frame one and the player is on it immediately.
    if (startValue !== 0) {
      // An explicit seed (the manual <-> nose shuffle's flipped lean) always wins.
      this.value = clamp(startValue, -0.9, 0.9);
      this.vel = Number.isFinite(startVel) ? clamp(startVel, -2, 2) : 0;
    } else if (inherits) {
      // THE LEAN CARRIES, and this is the half of the carry that is easiest to get wrong.
      //
      // Re-seeding a carried entry from `heldTime` alone — which is what the first cut of this
      // did — caps the lean at 0.40, so hopping to a new rail every half second actively RESCUES
      // a balance that was about to blow. Measured with that version: an uncorrected line of
      // 0.5 s rails took 12.2 s to bail instead of the intended ~2, because every hop pulled the
      // meter back from the edge. A rail hop must not be a get-out-of-jail card.
      //
      // So the magnitude carries. `floor` is the spec's held-time seed and still applies: deep in
      // a line you start every rail already leaning even if you had just centred it. Changing
      // AXIS (grind -> manual) is worth a genuine 35% reprieve, because the player is being asked
      // a different question with a different key, and only there is the velocity dropped — a
      // carried velocity across an axis change is unreadable.
      const sameAxis = axisForMode(mode) === carry!.axis;
      const floor = 0.06 + 0.34 * clamp01(carry!.heldTime / 8);
      const mag = clamp(Math.max(carry!.magnitude * (sameAxis ? 1 : 0.65), floor), 0, 0.92);
      this.value = carry!.sign * mag;
      this.vel = sameAxis ? clamp(carry!.vel, -2, 2) : 0;
    } else {
      const dir = this.driftBias >= 0 ? 1 : -1;
      this.value = dir * (0.06 + Math.random() * 0.1);
      this.vel = Number.isFinite(startVel) ? clamp(startVel, -2, 2) : 0;
    }

    this.syncState();
  }

  /** One integration pass, sub-stepped so a long frame can't teleport the pendulum. */
  private integrate(
    dt: number,
    stick: number,
    speed: number,
    difficulty: number,
    t: BalanceModeTuning
  ): void {
    const push = stick * pushSignFor(this.mode);

    // Difficulty: 0 -> 0.35x (training wheels but still unstable), 1 -> 1x, 4 -> 2.95x.
    const diffScale = 0.35 + 0.65 * difficulty;

    // Speed: at a dead stop the balance is slowPenalty times as lively, easing to 1x at
    // comfortSpeed. comfortSpeed 0 (lip tricks) disables the whole term.
    let speedScale = 1;
    let authority = 1;
    if (t.comfortSpeed > 0) {
      const lo = t.dropSpeed;
      const s = clamp01((speed - lo) / Math.max(0.001, t.comfortSpeed - lo));
      speedScale = t.slowPenalty + (1 - t.slowPenalty) * smoothstep(s);
      // You also have marginally less to work with when you're barely rolling.
      authority = 0.78 + 0.22 * smoothstep(s);
    }

    let remaining = dt;
    const maxStep = Math.max(1 / 480, this.tuning.maxSubStep);

    while (remaining > 0) {
      const h = Math.min(remaining, maxStep);
      remaining -= h;

      this.timeInMode += h;

      // Grace: instability and wobble fade in over the first fraction of a second, so a
      // manual popped at the wrong moment doesn't die instantly. `entryGrace` is 0 for a carried
      // entry — the middle of a line is not the start of one.
      const grace = this.entryGrace;
      const graceMix = grace > 0 ? smoothstep(this.timeInMode / grace) : 1;

      // Creep: the longer you hold it, the harder it gets. This is what stops an infinite
      // manual and makes a 20 second grind an actual achievement.
      this.heldTime += h;
      const creep = Math.min(t.creepCap, 1 + this.heldTime * t.creepPerSecond);

      const instability = t.instability * diffScale * speedScale * creep * graceMix;

      // Smooth disturbance: two out-of-phase oscillators plus a constant lean picked at entry.
      this.phaseA += this.freqA * TAU * h;
      this.phaseB += this.freqB * TAU * h;
      const wobble =
        (Math.sin(this.phaseA) * 0.62 + Math.sin(this.phaseB) * 0.38 + this.driftBias) *
        t.wobble *
        diffScale *
        speedScale *
        graceMix;

      // Player authority is asymmetric: full strength pulling back towards centre, cut by
      // `outwardFalloff` when pushing further out. `push * value` is positive exactly when the
      // stick is driving the lean the way it is already falling.
      const outward = clamp01(push * this.value);
      const auth = authority * (1 - t.outwardFalloff * outward);

      // Inverted pendulum: acceleration grows with displacement. Genuinely unstable.
      const accel = instability * this.value + wobble + push * t.torque * auth;

      this.vel += accel * h;
      this.vel *= Math.exp(-t.damping * h);

      // Terminal speed. The rate cap covers the pendulum AND the player's direct correction, so
      // the meter has one readable top speed in both directions: you can always see the fall
      // coming, and you can never snap back from the edge in a single frame. It scales with
      // difficulty, creep and slow speed, so a twenty-trick line falls visibly faster than the
      // first manual of the run.
      let rate = this.vel + push * t.correctionRate * auth;
      if (t.maxRate > 0) {
        // The upper clamp is what keeps the fall READABLE deep in a line. Difficulty x creep x
        // slow-speed used to compound to ~4x, and the meter crossed its last third in about
        // 60 ms — under a frame of reaction time, so the twentieth trick was decided by luck
        // rather than by hands. 2.2 caps terminal speed at ~1.98 value/s, i.e. the fall always
        // takes long enough to see and act on, while still being visibly faster than the first
        // manual of the run.
        const scale = Math.min(2.2, Math.max(0.5, diffScale * creep * Math.min(speedScale, 1.6)));
        const cap = t.maxRate * scale;
        rate = clamp(rate, -cap, cap);
      }
      this.value += rate * h;

      if (this.timeInMode < grace) {
        // Can't bail during the ramp-in, but the value is still pinned so it doesn't get
        // to store up an impossible position while it's invulnerable.
        this.value = clamp(this.value, -0.9, 0.9);
        this.vel = clamp(this.vel, -3, 3);
        continue;
      }

      if (this.value >= 1 || this.value <= -1) {
        this.value = this.value > 0 ? 1 : -1;
        this.finish('bail');
        return;
      }
    }
  }

  private updateVisual(dt: number): void {
    let targetPitch = 0;
    let targetRoll = 0;
    if (this.mode !== 'none') {
      const t = this.tuningFor(this.mode);
      targetPitch = t.basePitchDegrees + this.value * t.pitchPerValue;
      targetRoll = t.baseRollDegrees + this.value * t.rollPerValue;
    }
    const rate = this.mode === 'none' ? this.tuning.tiltRateRelease : this.tuning.tiltRateActive;
    this.visualPitch = approach(this.visualPitch, targetPitch, rate, dt);
    this.visualRoll = approach(this.visualRoll, targetRoll, rate, dt);
    // Kill denormal drift so the chair genuinely settles.
    if (this.mode === 'none') {
      if (Math.abs(this.visualPitch) < 0.01) this.visualPitch = 0;
      if (Math.abs(this.visualRoll) < 0.01) this.visualRoll = 0;
    }
  }

  private finish(reason: BalanceEndReason): void {
    if (this.mode === 'none') return;

    const info: BalanceEndInfo = {
      mode: this.mode as Exclude<BalanceMode, 'none'>,
      value: this.value,
      duration: this.timeInMode,
      speed: this.lastSpeed,
      reason,
    };

    // Hand the line's balance on to whatever the player links into next. A bail is the one exit
    // that does NOT carry: the position is gone, so the next entry is a fresh problem.
    if (reason === 'bail') {
      this.carry = null;
    } else if (this.tuning.carryWindow > 0) {
      this.carry = {
        heldTime: this.heldTime,
        sign: Math.sign(this.value) || 1,
        magnitude: Math.abs(this.value),
        vel: this.vel,
        axis: axisForMode(info.mode),
        at: this.clock,
      };
    }

    this.mode = 'none';
    this.timeInMode = 0;
    this.heldTime = 0;
    this.entryGrace = 0;
    this.vel = 0;
    if (reason === 'bail') {
      this.bailLockoutUntil = this.clock + this.tuning.bailLockout;
      // A bail cancels any revert grace — the position is closed, there is nothing to keep open.
      this.revertActiveUntil = -Infinity;
      this.landTime = -Infinity;
    } else {
      this.value = 0;
    }

    this.syncState();

    if (reason === 'bail') {
      const bailInfo: BalanceBailInfo = {
        mode: info.mode,
        value: info.value,
        duration: info.duration,
        speed: info.speed,
      };
      for (const cb of this.bailListeners.slice()) cb(bailInfo);
    }
    for (const cb of this.endListeners.slice()) cb(info);

    // The lean is only zeroed after listeners have seen it, so a bail listener can read the
    // direction the rider went over.
    if (reason === 'bail') {
      this.value = 0;
      this.syncState();
    }
  }

  private syncState(): void {
    const s = this._state;
    const warn = this.tuning.warnThreshold;
    const mag = Math.abs(this.value);
    s.mode = this.mode;
    s.value = this.mode === 'none' ? 0 : this.value;
    s.failing = this.mode !== 'none' && mag >= warn;
    s.timeInMode = this.timeInMode;
    s.pitchDegrees = this.visualPitch;
    s.rollDegrees = this.visualRoll;
    s.balance01 = toBalance01(s.value);
    s.danger = this.mode === 'none' ? 0 : clamp01((mag - warn) / Math.max(0.001, 1 - warn));
    s.axis = axisForMode(this.mode);
  }
}

export default BalanceSystem;
