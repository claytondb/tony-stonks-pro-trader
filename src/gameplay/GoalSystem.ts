/**
 * GoalSystem — the THPS goal/objective layer for Tony Stonks Pro Trader.
 *
 * WHAT THIS IS
 * Every Tony Hawk level hands you a checklist you chip away at across runs: three score tiers
 * (HIGH / PRO / SICK), the letters, the secret tape, "smash the 5 X", "trick at Y", a big combo,
 * a gap list, a timed objective. This module is that checklist, generalised to the office-heist
 * fiction: the letters spell S-T-O-N-K-S and the secret tape is the CONFIDENTIAL FILE.
 *
 * DESIGN RULES THIS FILE OBEYS
 *  - It imports NOTHING. Not THREE, not Rapier, not Game.ts, not LevelData.ts. Everything it needs
 *    is handed to it. That makes it trivially unit-testable and impossible to break by editing the
 *    renderer.
 *  - It is a pure state machine over `notifyX()` calls. It never reads the world, so the integrator
 *    decides what counts as "collected" or "smashed".
 *  - Every placement it needs (letters, the hidden file, smash props, trick zones, gap volumes) is
 *    DATA carried on the goal definitions, with real world-space coordinates authored against the
 *    actual level geometry in src/story/StoryLevels.ts and src/levels/LevelData.ts. The integrator
 *    spawns pickups/props/trigger volumes from `tracker.letterPlacements` etc. — it does not have to
 *    invent positions.
 *  - Nothing here is a stub. Every exported symbol is reachable from the documented wiring.
 *
 * TYPICAL WIRING (see the bottom of this file for the full recipe):
 *    const goals = new GoalTracker(defaultGoalSetFor(level.id));
 *    score.setScoreTargets({ high: goals.set.highScore, pro: goals.set.proScore, sick: goals.set.sickScore });
 *    goals.on(g => hud.showGoalComplete(g.description, g.reward));
 *    // per frame:  goals.update(dt); goals.notifyScore(score.sessionScore);
 *    // on land:    goals.notifyCombo(landEvent.gained);
 *    // on end:     onLevelComplete(score, time, goals.completedCount, goals.totalCount);
 */

// ---------------------------------------------------------------------------
// Public data types
// ---------------------------------------------------------------------------

export type GoalKind =
  | 'scoreTier'
  | 'collectLetters'
  | 'hiddenItem'
  | 'smash'
  | 'trickAt'
  | 'combo'
  | 'escape'
  | 'gapList'
  | 'time';

/** World-space position, matching the [x, y, z] tuples used everywhere in level data. */
export type Vec3 = [number, number, number];

/** Which of the three score tiers a `scoreTier` goal represents. */
export type ScoreTierName = 'high' | 'pro' | 'sick';

/** What a collect goal is made of. `letter` = S-T-O-N-K-S, `cash` = money/documents. */
export type CollectKind = 'letter' | 'hiddenItem' | 'cash';

/** A S-T-O-N-K-S letter the integrator should spawn as a floating pickup. */
export interface LetterPlacement {
  /** Unique within the level. The id you pass back to notifyCollect('letter', id). */
  id: string;
  /** The glyph to render: S, T, O, N, K or S. */
  letter: string;
  position: Vec3;
}

/** A cash / document / hidden-file pickup the integrator should spawn. */
export interface PickupPlacement {
  id: string;
  label: string;
  position: Vec3;
  /** Bonus stonks for grabbing it, on top of any goal reward. */
  value?: number;
}

/** A prop that must be destroyed. The integrator spawns a dynamic, breakable body here. */
export interface SmashTarget {
  id: string;
  label: string;
  position: Vec3;
}

/**
 * A named place in the level. Used for "trick at X" goals and for escape/exit triggers.
 * Modelled as an upright cylinder: |xz - center| <= radius and |y - center.y| <= height/2.
 * Use `zoneContains()` to test it.
 */
export interface TrickZone {
  id: string;
  label: string;
  center: Vec3;
  radius: number;
  /** Full height of the cylinder. Defaults to 8 when omitted. */
  height?: number;
}

/** A named gap, THPS-style: clear the space between `from` and `to` in one hop. */
export interface GapDef {
  id: string;
  name: string;
  /** Stonks awarded for clearing it (also paid every time it is re-hit). */
  bonus: number;
  from: Vec3;
  to: Vec3;
  /** How wide the takeoff/landing trigger volumes are. Defaults to 3. */
  radius?: number;
}

/**
 * One checklist entry. `kind` decides which of the optional fields matter:
 *
 *   scoreTier      -> tier
 *   collectLetters -> collectKind, letters (for 'letter') or pickups (for 'cash')
 *   hiddenItem     -> pickups[0]
 *   smash          -> smashTargets
 *   trickAt        -> zone, trickIds
 *   combo          -> target only
 *   escape         -> escapeMode, exitZone
 *   gapList        -> gaps
 *   time           -> timeMode
 */
export interface GoalDef {
  id: string;
  kind: GoalKind;
  /** Shown verbatim in the goal list, e.g. "Grind the boardroom table". */
  description: string;
  /** How many units of progress complete it. Always >= 1. */
  target: number;
  /** Stonks paid out on completion. */
  reward: number;

  /** scoreTier: which tier. */
  tier?: ScoreTierName;

  /** collectLetters: what is being collected. Defaults to 'letter'. */
  collectKind?: CollectKind;
  /** collectLetters: the six S-T-O-N-K-S placements. */
  letters?: LetterPlacement[];
  /** hiddenItem / cash collect goals: what to spawn. */
  pickups?: PickupPlacement[];

  /** smash: the props that count. Empty/omitted = any smashed object counts. */
  smashTargets?: SmashTarget[];

  /** trickAt: where it has to happen. Omitted = anywhere in the level. */
  zone?: TrickZone;
  /**
   * trickAt: which tricks count. Omitted = any trick.
   * Matching is lenient (case/punctuation-insensitive, substring both ways) so both the registry id
   * `50_50` and the display name `50-50` satisfy the same entry.
   */
  trickIds?: string[];

  /** gapList: the gaps to clear. */
  gaps?: GapDef[];

  /** time: 'under' = finish the level inside `target` seconds, 'survive' = last `target` seconds. */
  timeMode?: 'under' | 'survive';

  /** escape: 'reach' = get to `exitZone`, 'survive' = evade the cops for `target` seconds. */
  escapeMode?: 'reach' | 'survive';
  /** escape (reach mode): the trigger volume that ends the run. */
  exitZone?: TrickZone;

  /** Secret goals render as "???" until they are found (the hidden file). */
  secret?: boolean;
}

/** Per-goal readout. Rebuilt on demand; safe to call every frame. */
export interface GoalProgress {
  id: string;
  description: string;
  current: number;
  target: number;
  complete: boolean;
  reward: number;
  // --- extras beyond the required shape, all cheap and all used by the HUD ---
  kind: GoalKind;
  /** 0..1, clamped. */
  fraction: number;
  /** True once this goal can no longer be completed this run (a blown "under N seconds"). */
  failed: boolean;
  /** True while the goal is unrevealed (secret goals that have not been found). */
  secret: boolean;
  /** Short status line: "S T O _ _ _", "3 / 5 smashed", "1:04 left". */
  detail: string;
  /** Set only on scoreTier goals. */
  tier?: ScoreTierName;
}

/** The whole level checklist. */
export interface LevelGoalSet {
  levelId: string;
  /** Session points needed for HIGH SCORE. */
  highScore: number;
  /** Session points needed for PRO SCORE. */
  proScore: number;
  /** Session points needed for SICK SCORE. */
  sickScore: number;
  goals: GoalDef[];
  /** Optional display name, handy for the goal panel header. */
  levelName?: string;
}

export type GoalRank = 'S' | 'A' | 'B' | 'C' | 'D';

/** Everything the level-complete screen needs. */
export interface GoalRunSummary {
  levelId: string;
  completed: number;
  total: number;
  /** completed / total, 0 when there are no goals (never NaN — that was the old 0/0 bug). */
  goalPercent: number;
  /** Reward-weighted completion, 0..1. This is what drives the rank. */
  weightedPercent: number;
  rank: GoalRank;
  /** Stonks earned from goal rewards this run. */
  rewardEarned: number;
  /** Stonks earned from named gaps this run (paid separately from goal rewards). */
  gapBonus: number;
  /** Ids of every goal completed, in completion order. */
  completedIds: string[];
  /** Highest score tier reached, or null. */
  highestTier: ScoreTierName | null;
  elapsed: number;
}

export type GoalListener = (goal: GoalProgress) => void;

/** Structural mirror of LevelData.GoalDefinition. Declared here so this file imports nothing. */
export interface LegacyGoalDefinition {
  type: 'score' | 'collect' | 'combo' | 'grind' | 'escape' | 'time';
  target: number;
  description: string;
  reward?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The letters, in order. Two S's, so the ids are S1 and S2. */
export const STONKS_LETTERS: readonly string[] = ['S', 'T', 'O', 'N', 'K', 'S'];
export const STONKS_LETTER_IDS: readonly string[] = ['S1', 'T', 'O', 'N', 'K', 'S2'];

/** Every grind id in src/tricks/TrickRegistry.ts. Copied, not imported, on purpose. */
export const GRIND_TRICK_IDS: readonly string[] = [
  '50_50',
  'nosegrind',
  'tailslide',
  'smith',
  'feeble',
  'crooked',
  'bluntslide',
  'boardslide',
];

/** Every manual id in the registry. */
export const MANUAL_TRICK_IDS: readonly string[] = ['manual', 'nose_manual'];

/** Every special id in the registry. */
export const SPECIAL_TRICK_IDS: readonly string[] = [
  'quarterly_report',
  'golden_parachute',
  'hostile_takeover',
  'pink_slip',
];

export const TIER_LABEL: Record<ScoreTierName, string> = {
  high: 'HIGH SCORE',
  pro: 'PRO SCORE',
  sick: 'SICK SCORE',
};

const TIER_ORDER: ScoreTierName[] = ['high', 'pro', 'sick'];

const DEFAULT_ZONE_HEIGHT = 8;
const DEFAULT_GAP_RADIUS = 3;

// ---------------------------------------------------------------------------
// Small pure helpers (exported — the integrator needs the zone/gap maths too)
// ---------------------------------------------------------------------------

export function zoneContains(zone: TrickZone, x: number, y: number, z: number): boolean {
  const dx = x - zone.center[0];
  const dz = z - zone.center[2];
  if (dx * dx + dz * dz > zone.radius * zone.radius) return false;
  const half = (zone.height ?? DEFAULT_ZONE_HEIGHT) * 0.5;
  return Math.abs(y - zone.center[1]) <= half;
}

/** Straight-line length of a gap, for HUD text ("Copier Gap — 14m"). */
export function gapLength(gap: GapDef): number {
  return distance3(gap.from, gap.to);
}

/** Trigger radius of a gap's takeoff/landing volumes. */
export function gapTriggerRadius(gap: GapDef): number {
  return gap.radius ?? DEFAULT_GAP_RADIUS;
}

/**
 * Gap detection, ready to use: call it once on every landing with the position the player left the
 * ground from and the position they touched down at. Returns the gap that was cleared (the longest
 * one when several match), or null.
 *
 * Gaps are bi-directional — clearing the Fountain Gap from either side counts. Hand the result to
 * `notifyGap(gap.id, gap.bonus)` and pay `gap.bonus` into the score system.
 */
export function matchGap(gaps: GapDef[], takeoff: Vec3, landing: Vec3): GapDef | null {
  let best: GapDef | null = null;
  let bestLength = -1;
  for (const gap of gaps) {
    const r = gapTriggerRadius(gap);
    const forward = distance3(takeoff, gap.from) <= r && distance3(landing, gap.to) <= r;
    const backward = distance3(takeoff, gap.to) <= r && distance3(landing, gap.from) <= r;
    if (!forward && !backward) continue;
    const len = gapLength(gap);
    if (len > bestLength) {
      bestLength = len;
      best = gap;
    }
  }
  return best;
}

function distance3(a: Vec3, b: Vec3): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** "1:04" */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Lenient trick-id match: '50-50' == '50_50', 'Smith Grind' == 'smith'. */
export function trickIdMatches(candidate: string, wanted: string): boolean {
  const a = normalizeId(candidate);
  const b = normalizeId(wanted);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function normalizeId(v: string): string {
  return (v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function sanitizeDt(dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  return Math.min(dt, 0.25);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ---------------------------------------------------------------------------
// GoalTracker
// ---------------------------------------------------------------------------

interface GoalState {
  def: GoalDef;
  current: number;
  complete: boolean;
  failed: boolean;
  revealed: boolean;
  /** Unique ids banked for collect / smash / gap goals. */
  hits: Set<string>;
}

export class GoalTracker {
  readonly set: LevelGoalSet;

  private states: GoalState[] = [];
  private byId = new Map<string, GoalState>();

  private listeners: GoalListener[] = [];

  private _elapsed = 0;
  private _finished = false;
  private _pursuit = false;
  private _pursuitSeconds = 0;
  private _escapeSeconds = 0;
  private _bestCombo = 0;
  private _sessionScore = 0;

  private _completedIds: string[] = [];
  private _rewardEarned = 0;
  private _unpaidReward = 0;
  private _gapBonus = 0;
  private _gapsCleared = new Set<string>();

  constructor(set: LevelGoalSet) {
    // Defensive copy: the caller keeps its authored data, we keep ours.
    this.set = clone(set);
    if (!Array.isArray(this.set.goals)) this.set.goals = [];
    this.buildStates();
  }

  private buildStates(): void {
    this.states = [];
    this.byId.clear();
    for (const def of this.set.goals) {
      const target = Math.max(1, Math.floor(def.target ?? 1));
      const state: GoalState = {
        def: { ...def, target, reward: Math.max(0, Math.floor(def.reward ?? 0)) },
        current: 0,
        complete: false,
        failed: false,
        revealed: !def.secret,
        hits: new Set<string>(),
      };
      this.states.push(state);
      this.byId.set(def.id, state);
    }
  }

  // =========================================================================
  // Subscription
  // =========================================================================

  /** Fires once per goal, the moment it completes. Returns an unsubscribe function. */
  on(cb: GoalListener): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private emitComplete(state: GoalState): void {
    const snapshot = this.snapshot(state);
    for (const l of [...this.listeners]) {
      try {
        l(snapshot);
      } catch (err) {
        // A HUD bug must never take the game loop down.
        console.error('[GoalSystem] listener threw', err);
      }
    }
  }

  // =========================================================================
  // Notifications — the integrator calls these
  // =========================================================================

  /**
   * Session score changed. Pass the GROSS points banked this run
   * (ScoreSystem.sessionScore), not the wallet balance.
   */
  notifyScore(total: number): void {
    if (!Number.isFinite(total)) return;
    this._sessionScore = Math.max(this._sessionScore, Math.floor(total));
    for (const s of this.states) {
      if (s.def.kind !== 'scoreTier' || s.complete) continue;
      s.current = Math.min(this._sessionScore, s.def.target);
      if (this._sessionScore >= s.def.target) this.complete(s);
    }
  }

  /** A combo was LANDED for `total` stonks. Call from the land event, never mid-combo. */
  notifyCombo(total: number): void {
    if (!Number.isFinite(total) || total <= 0) return;
    const value = Math.floor(total);
    if (value > this._bestCombo) this._bestCombo = value;
    for (const s of this.states) {
      if (s.def.kind !== 'combo' || s.complete) continue;
      s.current = Math.min(this._bestCombo, s.def.target);
      if (this._bestCombo >= s.def.target) this.complete(s);
    }
  }

  /**
   * A pickup was taken.
   *  - 'letter'     -> id must be one of the goal's LetterPlacement ids ('S1','T','O','N','K','S2')
   *  - 'hiddenItem' -> id must be the hidden goal's pickup id
   *  - 'cash'       -> id of a PickupPlacement on a cash-collect goal
   * Duplicate ids are ignored, so re-triggering a pickup can never double-count.
   */
  notifyCollect(kind: CollectKind, id: string): void {
    if (!id) return;
    for (const s of this.states) {
      if (s.complete) continue;
      if (s.def.kind !== 'collectLetters' && s.def.kind !== 'hiddenItem') continue;

      // THE ID WINS OVER THE LABEL.
      //
      // A goal that explicitly lists this pickup id owns it, whatever `kind` the integrator
      // decided to pass. Game.spawnCollectibles() spawns every entry of `pickupPlacements` —
      // which includes the cash-collect goals' pickups — as kind 'hiddenItem', so under the old
      // strict kind match the five shredded-document pickups in ch1_office could be picked up all
      // day and their goal could never complete. A collect goal you cannot complete is worse than
      // no goal at all: it sits on the checklist teaching the player that the checklist lies.
      // Kind matching still decides for goals that list no placements at all.
      if (!this.listsPickupId(s, id)) {
        if (this.hasPickupList(s)) continue;
        const goalKind = s.def.kind === 'hiddenItem' ? 'hiddenItem' : (s.def.collectKind ?? 'letter');
        if (goalKind !== kind) continue;
      }
      if (s.def.kind === 'hiddenItem') s.revealed = true;

      if (s.hits.has(id)) continue;
      s.hits.add(id);
      s.current = Math.min(s.hits.size, s.def.target);
      if (s.hits.size >= s.def.target) this.complete(s);
    }
  }

  /** A breakable prop was destroyed. `objectId` should match a SmashTarget id when the goal lists them. */
  notifySmash(objectId: string): void {
    if (!objectId) return;
    for (const s of this.states) {
      if (s.def.kind !== 'smash' || s.complete) continue;
      const targets = s.def.smashTargets;
      if (targets && targets.length > 0 && !targets.some((t) => t.id === objectId)) continue;
      if (s.hits.has(objectId)) continue;
      s.hits.add(objectId);
      s.current = Math.min(s.hits.size, s.def.target);
      if (s.hits.size >= s.def.target) this.complete(s);
    }
  }

  /**
   * A trick was LANDED at a named place. Call it once per landed trick with the zone the player was
   * in (use `zoneContains` against `tracker.zones` to find it). Pass '' for "not in any zone".
   * For a continuous grind, call it once when the grind ends, not every frame.
   */
  notifyTrickAt(trickId: string, zoneId: string): void {
    if (!trickId) return;
    const zone = zoneId ?? '';
    for (const s of this.states) {
      if (s.def.kind !== 'trickAt' || s.complete) continue;

      const wantedZone = s.def.zone;
      if (wantedZone && normalizeId(wantedZone.id) !== normalizeId(zone)) continue;

      const wantedTricks = s.def.trickIds;
      if (wantedTricks && wantedTricks.length > 0) {
        if (!wantedTricks.some((w) => trickIdMatches(trickId, w))) continue;
      }

      s.current = Math.min(s.current + 1, s.def.target);
      if (s.current >= s.def.target) this.complete(s);
    }
  }

  /**
   * A named gap was cleared. The bonus is banked every time (THPS pays repeat gaps); the gap-list
   * goal only counts each gap once.
   */
  notifyGap(gapId: string, bonus: number): void {
    if (!gapId) return;
    const value = Number.isFinite(bonus) ? Math.max(0, Math.floor(bonus)) : 0;
    this._gapBonus += value;
    this._gapsCleared.add(gapId);

    for (const s of this.states) {
      if (s.def.kind !== 'gapList' || s.complete) continue;
      const gaps = s.def.gaps;
      if (gaps && gaps.length > 0 && !gaps.some((g) => g.id === gapId)) continue;
      if (s.hits.has(gapId)) continue;
      s.hits.add(gapId);
      s.current = Math.min(s.hits.size, s.def.target);
      if (s.hits.size >= s.def.target) this.complete(s);
    }
  }

  /**
   * Total seconds survived under police pursuit this run. Monotonic — pass the running total, not a
   * delta. If you prefer, call `setPursuit(true/false)` instead and let `update(dt)` do the counting.
   */
  notifyEscapeTime(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    if (seconds <= this._escapeSeconds) return;
    this._escapeSeconds = seconds;
    this.applyEscapeTime();
  }

  /**
   * Toggle police pursuit. While true, `update(dt)` accrues escape time automatically, so a chase
   * system that only knows "am I being chased" needs no timer of its own.
   */
  setPursuit(active: boolean): void {
    this._pursuit = !!active;
  }

  /**
   * The player entered a named zone. Completes `escape` goals in 'reach' mode whose exitZone matches
   * (and, when that escape goal is the level's finish line, the timed "finish under N" goal too).
   */
  notifyZoneEntered(zoneId: string): void {
    if (!zoneId) return;
    let reachedFinish = false;
    for (const s of this.states) {
      if (s.def.kind !== 'escape' || s.complete) continue;
      if ((s.def.escapeMode ?? 'reach') !== 'reach') continue;
      const exit = s.def.exitZone;
      if (exit && normalizeId(exit.id) !== normalizeId(zoneId)) continue;
      s.current = s.def.target;
      this.complete(s);
      reachedFinish = true;
    }
    if (reachedFinish) this.notifyFinish();
  }

  /**
   * The run ended successfully (exit reached / level complete). Settles every 'reach' escape goal
   * and every "finish in under N seconds" goal against the elapsed clock.
   */
  notifyFinish(): void {
    if (this._finished) return;
    this._finished = true;

    for (const s of this.states) {
      if (s.complete) continue;
      if (s.def.kind === 'escape' && (s.def.escapeMode ?? 'reach') === 'reach') {
        s.current = s.def.target;
        this.complete(s);
      } else if (s.def.kind === 'time' && (s.def.timeMode ?? 'under') === 'under') {
        if (this._elapsed <= s.def.target) {
          s.current = s.def.target;
          this.complete(s);
        } else {
          s.failed = true;
        }
      }
    }
  }

  // =========================================================================
  // Tick
  // =========================================================================

  /** Advance the level clock. Call once per frame with dt in seconds. */
  update(dt: number): void {
    const step = sanitizeDt(dt);
    if (step <= 0) return;

    if (!this._finished) this._elapsed += step;

    if (this._pursuit) {
      this._pursuitSeconds += step;
      if (this._pursuitSeconds > this._escapeSeconds) {
        this._escapeSeconds = this._pursuitSeconds;
        this.applyEscapeTime();
      }
    }

    for (const s of this.states) {
      if (s.def.kind !== 'time' || s.complete || s.failed) continue;
      const mode = s.def.timeMode ?? 'under';
      if (mode === 'survive') {
        s.current = Math.min(this._elapsed, s.def.target);
        if (this._elapsed >= s.def.target) this.complete(s);
      } else {
        // "Finish in under N": `current` is the budget left, and the goal dies when it runs out.
        s.current = Math.max(0, s.def.target - this._elapsed);
        if (this._elapsed > s.def.target) s.failed = true;
      }
    }
  }

  private applyEscapeTime(): void {
    for (const s of this.states) {
      if (s.def.kind !== 'escape' || s.complete) continue;
      if ((s.def.escapeMode ?? 'reach') !== 'survive') continue;
      s.current = Math.min(this._escapeSeconds, s.def.target);
      if (this._escapeSeconds >= s.def.target) this.complete(s);
    }
  }

  // =========================================================================
  // Completion / payout
  // =========================================================================

  private complete(state: GoalState): void {
    if (state.complete) return;
    state.complete = true;
    state.failed = false;
    state.revealed = true;
    state.current = state.def.target;
    this._completedIds.push(state.def.id);
    this._rewardEarned += state.def.reward;
    this._unpaidReward += state.def.reward;
    this.emitComplete(state);
  }

  /** Force a goal complete by id (debug menu, cheat, scripted story beat). Pays out normally. */
  forceComplete(goalId: string): boolean {
    const s = this.byId.get(goalId);
    if (!s || s.complete) return false;
    this.complete(s);
    return true;
  }

  /**
   * Rewards banked since the last call, then zeroed. Drain it once a frame and hand the result to
   * ScoreSystem.addStonks() (or storyProgress.addStonks()) so goal money actually reaches the wallet.
   * If you pay inside the `on()` callback instead, don't also call this.
   */
  takeUnpaidReward(): number {
    const v = this._unpaidReward;
    this._unpaidReward = 0;
    return v;
  }

  // =========================================================================
  // Read-only views
  // =========================================================================

  get progress(): GoalProgress[] {
    return this.states.map((s) => this.snapshot(s));
  }

  /** One goal's progress, or undefined. */
  getGoal(goalId: string): GoalProgress | undefined {
    const s = this.byId.get(goalId);
    return s ? this.snapshot(s) : undefined;
  }

  get completedCount(): number {
    let n = 0;
    for (const s of this.states) if (s.complete) n++;
    return n;
  }

  get totalCount(): number {
    return this.states.length;
  }

  /** Reward-weighted completion, 0..1. Big goals count for more than small ones. */
  get weightedPercent(): number {
    let total = 0;
    let done = 0;
    for (const s of this.states) {
      const w = Math.max(1, s.def.reward);
      total += w;
      if (s.complete) done += w;
    }
    return total > 0 ? clamp01(done / total) : 0;
  }

  /**
   * S requires a clean sweep — every goal, including SICK SCORE. Deliberately computed from the raw
   * completed/total count (not the reward weighting) so it agrees exactly with the rank
   * GameStateManager derives from the (goalsCompleted, totalGoals) pair we hand to onLevelComplete.
   */
  get rank(): GoalRank {
    const total = this.totalCount;
    if (total === 0) return 'D';
    const completed = this.completedCount;
    if (completed >= total) return 'S';
    const p = completed / total;
    if (p >= 0.75) return 'A';
    if (p >= 0.5) return 'B';
    if (p >= 0.25) return 'C';
    return 'D';
  }

  get highestTier(): ScoreTierName | null {
    let best: ScoreTierName | null = null;
    for (const tier of TIER_ORDER) {
      const hit = this.states.some((s) => s.def.kind === 'scoreTier' && s.def.tier === tier && s.complete);
      if (hit) best = tier;
    }
    return best;
  }

  /** Score targets, for ScoreSystem.setScoreTargets(). */
  get scoreTargets(): { high: number; pro: number; sick: number } {
    return { high: this.set.highScore, pro: this.set.proScore, sick: this.set.sickScore };
  }

  get elapsed(): number {
    return this._elapsed;
  }

  get finished(): boolean {
    return this._finished;
  }

  get bestCombo(): number {
    return this._bestCombo;
  }

  get gapBonus(): number {
    return this._gapBonus;
  }

  get gapsCleared(): string[] {
    return [...this._gapsCleared];
  }

  get rewardEarned(): number {
    return this._rewardEarned;
  }

  get summary(): GoalRunSummary {
    const total = this.totalCount;
    const completed = this.completedCount;
    return {
      levelId: this.set.levelId,
      completed,
      total,
      goalPercent: total > 0 ? completed / total : 0,
      weightedPercent: this.weightedPercent,
      rank: this.rank,
      rewardEarned: this._rewardEarned,
      gapBonus: this._gapBonus,
      completedIds: [...this._completedIds],
      highestTier: this.highestTier,
      elapsed: this._elapsed,
    };
  }

  // --- placement accessors: what the integrator has to spawn ----------------

  /** Every S-T-O-N-K-S letter in the level, with world positions. */
  get letterPlacements(): LetterPlacement[] {
    const out: LetterPlacement[] = [];
    for (const s of this.states) {
      if (s.def.kind !== 'collectLetters') continue;
      if ((s.def.collectKind ?? 'letter') !== 'letter') continue;
      out.push(...(s.def.letters ?? []));
    }
    return out;
  }

  /** Cash / document / hidden-file pickups, with world positions. */
  get pickupPlacements(): PickupPlacement[] {
    const out: PickupPlacement[] = [];
    for (const s of this.states) {
      if (s.def.kind !== 'hiddenItem' && s.def.kind !== 'collectLetters') continue;
      out.push(...(s.def.pickups ?? []));
    }
    return out;
  }

  /** Breakable props to spawn as dynamic bodies. */
  get smashTargets(): SmashTarget[] {
    const out: SmashTarget[] = [];
    for (const s of this.states) {
      if (s.def.kind !== 'smash') continue;
      out.push(...(s.def.smashTargets ?? []));
    }
    return out;
  }

  /** Every named zone in the level (trick zones + escape exits). */
  get zones(): TrickZone[] {
    const out: TrickZone[] = [];
    for (const s of this.states) {
      if (s.def.zone) out.push(s.def.zone);
      if (s.def.exitZone) out.push(s.def.exitZone);
    }
    return out;
  }

  /** Every named gap, for the gap detector. */
  get gaps(): GapDef[] {
    const out: GapDef[] = [];
    for (const s of this.states) {
      if (s.def.kind !== 'gapList') continue;
      out.push(...(s.def.gaps ?? []));
    }
    return out;
  }

  /**
   * Convenience: which named zone contains this point (nearest centre wins when they overlap).
   * Feed the result straight into notifyTrickAt().
   */
  zoneAt(x: number, y: number, z: number): TrickZone | null {
    let best: TrickZone | null = null;
    let bestDist = Infinity;
    for (const zone of this.zones) {
      if (!zoneContains(zone, x, y, z)) continue;
      const dx = x - zone.center[0];
      const dz = z - zone.center[2];
      const d = dx * dx + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = zone;
      }
    }
    return best;
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  /** Wipe all progress and start the level over. Keeps the same goal set. */
  reset(): void {
    this.buildStates();
    this._elapsed = 0;
    this._finished = false;
    this._pursuit = false;
    this._pursuitSeconds = 0;
    this._escapeSeconds = 0;
    this._bestCombo = 0;
    this._sessionScore = 0;
    this._completedIds = [];
    this._rewardEarned = 0;
    this._unpaidReward = 0;
    this._gapBonus = 0;
    this._gapsCleared.clear();
  }

  /**
   * Re-apply goals completed on a previous run (from a save file), so a returning player sees the
   * ticks they already earned. Does NOT pay the rewards again.
   */
  restoreCompleted(goalIds: string[]): void {
    for (const id of goalIds ?? []) {
      const s = this.byId.get(id);
      if (!s || s.complete) continue;
      s.complete = true;
      s.revealed = true;
      s.current = s.def.target;
      this._completedIds.push(id);
    }
  }

  // =========================================================================
  // Internals
  // =========================================================================

  /** Does this goal author an explicit placement list at all? */
  private hasPickupList(state: GoalState): boolean {
    const def = state.def;
    return (def.letters?.length ?? 0) > 0 || (def.pickups?.length ?? 0) > 0;
  }

  /** Does this goal explicitly name this pickup id, as a letter or as a pickup? */
  private listsPickupId(state: GoalState, id: string): boolean {
    const def = state.def;
    if (def.letters?.some((l) => l.id === id)) return true;
    return !!def.pickups?.some((p) => p.id === id);
  }

  private snapshot(s: GoalState): GoalProgress {
    const hidden = !!s.def.secret && !s.revealed && !s.complete;
    return {
      id: s.def.id,
      description: hidden ? '???' : s.def.description,
      current: Math.floor(s.current),
      target: s.def.target,
      complete: s.complete,
      reward: s.def.reward,
      kind: s.def.kind,
      fraction: clamp01(s.current / s.def.target),
      failed: s.failed,
      secret: hidden,
      detail: hidden ? '???' : this.detailFor(s),
      tier: s.def.tier,
    };
  }

  private detailFor(s: GoalState): string {
    const def = s.def;
    switch (def.kind) {
      case 'scoreTier':
        return s.complete
          ? `${TIER_LABEL[def.tier ?? 'high']} — CLEARED`
          : `${Math.floor(s.current).toLocaleString('en-US')} / ${def.target.toLocaleString('en-US')}`;

      case 'collectLetters': {
        if ((def.collectKind ?? 'letter') === 'letter') {
          const letters = def.letters ?? [];
          if (letters.length > 0) {
            return letters.map((l) => (s.hits.has(l.id) ? l.letter : '_')).join(' ');
          }
          return STONKS_LETTERS.map((l, i) => (i < s.hits.size ? l : '_')).join(' ');
        }
        return `${s.hits.size} / ${def.target} collected`;
      }

      case 'hiddenItem':
        return s.complete ? 'FOUND' : 'Somewhere in the level...';

      case 'smash':
        return `${s.hits.size} / ${def.target} smashed`;

      case 'trickAt':
        return def.zone
          ? `${Math.floor(s.current)} / ${def.target} at ${def.zone.label}`
          : `${Math.floor(s.current)} / ${def.target}`;

      case 'combo':
        return `Best $${Math.floor(this._bestCombo).toLocaleString('en-US')} / $${def.target.toLocaleString('en-US')}`;

      case 'escape':
        if ((def.escapeMode ?? 'reach') === 'survive') {
          return `${formatClock(this._escapeSeconds)} / ${formatClock(def.target)} evaded`;
        }
        return s.complete ? 'ESCAPED' : def.exitZone ? `Head for ${def.exitZone.label}` : 'Find the exit';

      case 'gapList': {
        const gaps = def.gaps ?? [];
        const names = gaps.filter((g) => s.hits.has(g.id)).map((g) => g.name);
        const head = `${s.hits.size} / ${def.target} gaps`;
        return names.length > 0 ? `${head} — ${names[names.length - 1]}` : head;
      }

      case 'time':
        if ((def.timeMode ?? 'under') === 'survive') {
          return `${formatClock(this._elapsed)} / ${formatClock(def.target)}`;
        }
        if (s.complete) return `Finished in ${formatClock(this._elapsed)}`;
        if (s.failed) return 'Time expired';
        return `${formatClock(Math.max(0, def.target - this._elapsed))} left`;

      default:
        return `${Math.floor(s.current)} / ${def.target}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Authoring helpers for the goal-set tables below
// ---------------------------------------------------------------------------

function letters(positions: Vec3[]): LetterPlacement[] {
  return positions.slice(0, 6).map((position, i) => ({
    id: STONKS_LETTER_IDS[i],
    letter: STONKS_LETTERS[i],
    position,
  }));
}

interface TierRewards {
  high: number;
  pro: number;
  sick: number;
}

/**
 * One tier goal on its own, so a level can INTERLEAVE its tiers with the rest of the checklist
 * instead of stacking all three at the top. Order is pacing: a checklist that opens with three
 * score bars tells a new player nothing about where to skate.
 */
function scoreTierGoal(tier: ScoreTierName, target: number, reward: number): GoalDef {
  const id = tier === 'high' ? 'high_score' : tier === 'pro' ? 'pro_score' : 'sick_score';
  return {
    id,
    kind: 'scoreTier',
    tier,
    description: `${TIER_LABEL[tier]} — bank ${target.toLocaleString('en-US')} stonks`,
    target,
    reward,
  };
}

function scoreTierGoals(high: number, pro: number, sick: number, rewards: TierRewards): GoalDef[] {
  return [
    {
      id: 'high_score',
      kind: 'scoreTier',
      tier: 'high',
      description: `HIGH SCORE — bank ${high.toLocaleString('en-US')} stonks`,
      target: high,
      reward: rewards.high,
    },
    {
      id: 'pro_score',
      kind: 'scoreTier',
      tier: 'pro',
      description: `PRO SCORE — bank ${pro.toLocaleString('en-US')} stonks`,
      target: pro,
      reward: rewards.pro,
    },
    {
      id: 'sick_score',
      kind: 'scoreTier',
      tier: 'sick',
      description: `SICK SCORE — bank ${sick.toLocaleString('en-US')} stonks`,
      target: sick,
      reward: rewards.sick,
    },
  ];
}

function lettersGoal(placements: LetterPlacement[], reward: number): GoalDef {
  return {
    id: 'stonks_letters',
    kind: 'collectLetters',
    collectKind: 'letter',
    description: 'Collect S-T-O-N-K-S',
    target: placements.length,
    reward,
    letters: placements,
  };
}

function hiddenFileGoal(position: Vec3, reward: number, hint: string): GoalDef {
  return {
    id: 'confidential_file',
    kind: 'hiddenItem',
    description: `Find the Confidential File (${hint})`,
    target: 1,
    reward,
    secret: true,
    pickups: [{ id: 'confidential_file', label: 'Confidential File', position, value: 2500 }],
  };
}

function smashGoal(description: string, target: number, reward: number, targets: SmashTarget[]): GoalDef {
  return {
    id: 'smash',
    kind: 'smash',
    description,
    target,
    reward,
    smashTargets: targets,
  };
}

function trickAtGoal(
  id: string,
  description: string,
  zone: TrickZone,
  trickIds: readonly string[],
  target: number,
  reward: number
): GoalDef {
  return {
    id,
    kind: 'trickAt',
    description,
    target,
    reward,
    zone,
    trickIds: [...trickIds],
  };
}

function comboGoal(target: number, reward: number, description?: string): GoalDef {
  return {
    id: 'big_combo',
    kind: 'combo',
    description: description ?? `Land a ${target.toLocaleString('en-US')} stonks combo`,
    target,
    reward,
  };
}

function gapListGoal(gaps: GapDef[], reward: number, description?: string): GoalDef {
  return {
    id: 'gap_list',
    kind: 'gapList',
    description: description ?? `Clear all ${gaps.length} named gaps`,
    target: gaps.length,
    reward,
    gaps,
  };
}

function escapeReachGoal(description: string, zone: TrickZone, reward: number): GoalDef {
  return {
    id: 'escape',
    kind: 'escape',
    escapeMode: 'reach',
    description,
    target: 1,
    reward,
    exitZone: zone,
  };
}

function escapeSurviveGoal(seconds: number, reward: number, description?: string): GoalDef {
  return {
    id: 'evade_police',
    kind: 'escape',
    escapeMode: 'survive',
    description: description ?? `Evade the cops for ${seconds} seconds`,
    target: seconds,
    reward,
  };
}

function timeGoal(mode: 'under' | 'survive', seconds: number, reward: number, description?: string): GoalDef {
  return {
    id: mode === 'under' ? 'speed_run' : 'survive_timer',
    kind: 'time',
    timeMode: mode,
    description:
      description ??
      (mode === 'under' ? `Finish in under ${seconds} seconds` : `Survive for ${seconds} seconds`),
    target: seconds,
    reward,
  };
}

function cashGoal(id: string, description: string, reward: number, pickups: PickupPlacement[]): GoalDef {
  return {
    id,
    kind: 'collectLetters',
    collectKind: 'cash',
    description,
    target: pickups.length,
    reward,
    pickups,
  };
}

// ---------------------------------------------------------------------------
// THE GOAL SETS — one hand-authored checklist per level.
//
// Every coordinate below was taken off the actual object list for that level in
// src/story/StoryLevels.ts / src/levels/LevelData.ts, so letters sit on rails and fun boxes,
// smash props sit where the props already are, trick zones sit on real grindable geometry, and
// gaps span real ramps. Letters are lifted ~1.5-2m above the surface they belong to so they read
// as pickups rather than decals.
// ---------------------------------------------------------------------------

/**
 * WHY THE SCORE TIERS LOOK THE WAY THEY DO.
 *
 * Every High/Pro/Sick number below used to be authored against a scoring model where pickups and
 * goal rewards counted toward the session score. They do not any more (see
 * ScoreTuning.awardsCountTowardSessionScore) — the tiers now measure skating and nothing else —
 * and the feel pass turned a chair that could not move into one that cruises at 12-14 m/s, which
 * moved the achievable score by an order of magnitude. So the tiers were re-derived, from runs
 * measured through tools/play.mjs rather than from taste.
 *
 * The ch1_office measurements, all 120 s sessions at a fixed 1/60 step:
 *
 *   push only, a few ollies and flips ......  3,766   <- a first run that never lands a line
 *   grind holds + flips + manual attempts .. 20,580   <- knows the buttons, links nothing
 *   hold the grind button for two minutes .. 53,329   <- the ceiling of playing badly on purpose
 *   one 12 s linked line, priced out ....... ~47,000  <- what LINKING is worth, in one combo
 *
 * From which: HIGH = 8,000 (first run, but you must land something), PRO = 60,000 (above the
 * entire no-linking ceiling — unreachable without building lines), SICK = 150,000 (three or four
 * genuinely good lines, or one enormous one).
 *
 * The other levels are not individually measured — that is eleven more harness sessions and the
 * geometry work on them is still in flight — so they keep their authored HIGH (which was always
 * the "landed something" bar and still reads correctly) and take ch1_office's measured spread for
 * the top two tiers: PRO = 3.0x its old value, SICK = 2.5x. Their relative ordering across the
 * campaign is untouched. Re-measure each one as its level lands.
 */
const GOAL_SETS: Record<string, LevelGoalSet> = {};

function register(set: LevelGoalSet): void {
  GOAL_SETS[set.levelId] = set;
}

// =========================================================================
// STORY 1 — Office Escape. 390x390 floor, cubicle blocks at |x| = 70 and 130,
// wide-open centre aisle, stairwell exit at z = +160.
// =========================================================================
register({
  levelId: 'story_1_office',
  levelName: 'Office Escape',
  highScore: 10000,
  proScore: 90000,
  sickScore: 190000,
  goals: [
    ...scoreTierGoals(10000, 90000, 190000, { high: 1500, pro: 4000, sick: 10000 }),

    lettersGoal(
      letters([
        [-80, 4.5, -140], // S — over the welcome ramp in front of spawn
        [0, 7.5, -160], // T — on top of the big fun box
        [-40, 3.0, -100], // O — beside the west water cooler
        [0, 3.5, -25], // N — floating over the long boardroom rail
        [40, 7.0, 75], // K — on the east fun box
        [0, 4.0, 150], // S — at the foot of the stairwell
      ]),
      3000
    ),

    hiddenFileGoal([-186, 2.0, -80], 5000, 'behind the west filing cabinets'),

    smashGoal('Smash 5 water coolers and printers', 5, 2500, [
      { id: 'cooler_w', label: 'Water Cooler', position: [-40, 0, -100] },
      { id: 'cooler_e', label: 'Water Cooler', position: [40, 0, -100] },
      { id: 'cooler_c', label: 'Water Cooler', position: [0, 0, -20] },
      { id: 'printer_nw', label: 'Printer', position: [-90, 0, -155] },
      { id: 'printer_ne', label: 'Printer', position: [90, 0, -155] },
      { id: 'printer_sw', label: 'Printer', position: [-90, 0, 45] },
      { id: 'printer_se', label: 'Printer', position: [90, 0, 45] },
    ]),

    trickAtGoal(
      'grind_boardroom',
      'Grind the boardroom table',
      { id: 'boardroom_table', label: 'the boardroom table', center: [0, 1.2, -25], radius: 42, height: 10 },
      GRIND_TRICK_IDS,
      3,
      2000
    ),

    comboGoal(60000, 3000),

    gapListGoal(
      [
        { id: 'copier_gap', name: 'Copier Gap', bonus: 500, from: [-25, 0, -60], to: [-5, 0, -60], radius: 4 },
        { id: 'aisle_gap', name: 'Cubicle Aisle Gap', bonus: 750, from: [25, 0, -60], to: [5, 0, -60], radius: 4 },
        { id: 'watercooler_gap', name: 'Water Cooler Gap', bonus: 600, from: [-14, 0, -20], to: [14, 0, -20], radius: 5 },
        { id: 'breakroom_gap', name: 'Break Room Gap', bonus: 1000, from: [0, 0, 90], to: [0, 0, 120], radius: 6 },
      ],
      2500
    ),

    cashGoal('shredded_docs', 'Grab the shredded documents', 1500, [
      { id: 'doc_w', label: 'Shredded Document', position: [-100, 1.5, -90], value: 200 },
      { id: 'doc_e', label: 'Shredded Document', position: [100, 1.5, -90], value: 200 },
      { id: 'doc_c', label: 'Shredded Document', position: [0, 2, -25], value: 500 },
    ]),

    escapeReachGoal('Reach the stairwell', {
      id: 'stairwell_exit',
      label: 'the stairwell',
      center: [0, 2, 158],
      radius: 18,
      height: 14,
    }, 2000),

    timeGoal('under', 90, 2500, 'Escape the floor in under 90 seconds'),
  ],
});

// =========================================================================
// STORY 2 — Stairwell Descent. A 50-floor helix from y=50 down to y=0, bounds +/-18.
// =========================================================================
register({
  levelId: 'story_2_stairwell',
  levelName: 'Stairwell Descent',
  highScore: 12000,
  proScore: 95000,
  sickScore: 195000,
  goals: [
    ...scoreTierGoals(12000, 95000, 195000, { high: 1750, pro: 4500, sick: 11000 }),

    lettersGoal(
      letters([
        [0, 52.0, -10], // S — over the top rail
        [8, 42.0, 0], // T — floor 45 rail
        [0, 32.0, 10], // O — floor 40 rail
        [-8, 22.0, 0], // N — floor 35 rail
        [0, 12.0, -10], // K — floor 30 rail
        [0, 3.0, 5], // S — the last landing
      ]),
      3500
    ),

    hiddenFileGoal([5, 11.0, -5], 5000, 'on the floor-30 ramp ledge'),

    smashGoal('Smash 4 fire buckets on the landings', 4, 2000, [
      { id: 'bucket_50', label: 'Fire Bucket', position: [-4, 50, -8] },
      { id: 'bucket_45', label: 'Fire Bucket', position: [6, 40, 3] },
      { id: 'bucket_40', label: 'Fire Bucket', position: [3, 30, 8] },
      { id: 'bucket_35', label: 'Fire Bucket', position: [-6, 20, -3] },
      { id: 'bucket_30', label: 'Fire Bucket', position: [4, 10, -8] },
    ]),

    trickAtGoal(
      'grind_handrails',
      'Grind 5 stairwell handrails',
      { id: 'stairwell_shaft', label: 'the stairwell', center: [0, 25, 0], radius: 20, height: 56 },
      GRIND_TRICK_IDS,
      5,
      2500
    ),

    comboGoal(70000, 3500),

    gapListGoal(
      [
        { id: 'floor_45_gap', name: 'Floor 45 Drop', bonus: 750, from: [0, 50, -6], to: [8, 40, 0], radius: 5 },
        { id: 'floor_40_gap', name: 'Landing Leap', bonus: 900, from: [8, 40, 4], to: [0, 30, 10], radius: 5 },
        { id: 'floor_35_gap', name: 'Switchback Gap', bonus: 1100, from: [0, 30, 4], to: [-8, 20, 0], radius: 5 },
        { id: 'lobby_drop', name: 'Ten Floor Drop', bonus: 2000, from: [0, 10, -10], to: [0, 2, 5], radius: 6 },
      ],
      3000
    ),

    escapeReachGoal('Reach the lobby', {
      id: 'lobby_exit',
      label: 'the lobby door',
      center: [0, 0.8, 10],
      radius: 8,
      height: 10,
    }, 2500),

    timeGoal('under', 60, 3000, 'Hit the lobby in under 60 seconds'),
  ],
});

// =========================================================================
// STORY 3 — Lobby Showdown. 90x90 marble hall, reception rail at z=-25,
// fountain fun box at origin, glass doors at z=+40.
// =========================================================================
register({
  levelId: 'story_3_lobby',
  levelName: 'Lobby Showdown',
  highScore: 15000,
  proScore: 120000,
  sickScore: 225000,
  goals: [
    ...scoreTierGoals(15000, 120000, 225000, { high: 2000, pro: 5000, sick: 12500 }),

    lettersGoal(
      letters([
        [0, 3.0, -25], // S — over the reception counter
        [-20, 2.5, -20], // T — on the northwest planter
        [20, 2.5, 0], // O — on the east planter
        [0, 3.0, 0], // N — above the fountain
        [-10, 1.8, 10], // K — on the southwest bench
        [10, 1.8, 30], // S — by the exit ramp
      ]),
      3500
    ),

    hiddenFileGoal([-40, 2.5, -2], 6000, 'on top of the west quarter pipe'),

    smashGoal('Smash 6 lobby planters', 6, 3000, [
      { id: 'planter_nw', label: 'Marble Planter', position: [-20, 0, -20] },
      { id: 'planter_ne', label: 'Marble Planter', position: [20, 0, -20] },
      { id: 'planter_w', label: 'Marble Planter', position: [-20, 0, 0] },
      { id: 'planter_e', label: 'Marble Planter', position: [20, 0, 0] },
      { id: 'planter_sw', label: 'Marble Planter', position: [-20, 0, 20] },
      { id: 'planter_se', label: 'Marble Planter', position: [20, 0, 20] },
      { id: 'column_nw', label: 'Marble Column', position: [-30, 0, -15] },
      { id: 'column_ne', label: 'Marble Column', position: [30, 0, -15] },
    ]),

    trickAtGoal(
      'grind_reception',
      'Grind the reception desk',
      { id: 'reception_desk', label: 'the reception desk', center: [0, 1.4, -25], radius: 14, height: 8 },
      GRIND_TRICK_IDS,
      3,
      2500
    ),

    comboGoal(80000, 4000),

    gapListGoal(
      [
        { id: 'fountain_gap', name: 'Fountain Gap', bonus: 1000, from: [-7, 0, 0], to: [7, 0, 0], radius: 5 },
        { id: 'reception_gap', name: 'Over The Desk', bonus: 900, from: [0, 0, -30], to: [0, 0, -20], radius: 5 },
        { id: 'bench_to_bench', name: 'Bench To Bench', bonus: 750, from: [-10, 0, -10], to: [-10, 0, 10], radius: 5 },
        { id: 'glass_doors', name: 'Glass Door Gap', bonus: 2500, from: [0, 0, 30], to: [0, 0, 42], radius: 8 },
      ],
      3500
    ),

    cashGoal('lobby_cash', 'Grab the petty cash', 2000, [
      { id: 'cash_desk', label: 'Petty Cash', position: [0, 2, -25], value: 2000 },
      { id: 'cash_w', label: 'Petty Cash', position: [-20, 1.5, 0], value: 1000 },
      { id: 'cash_e', label: 'Petty Cash', position: [20, 1.5, 0], value: 1000 },
    ]),

    escapeReachGoal('Crash through the front doors', {
      id: 'front_doors',
      label: 'the front doors',
      center: [0, 1, 40],
      radius: 14,
      height: 10,
    }, 3000),
  ],
});

// =========================================================================
// STORY 4 — Highway Havoc. A 190-long corridor, z in [-30, 30], barrier rails
// at z = +/-25 and a centre divider, exit ramp at x = +85.
// =========================================================================
register({
  levelId: 'story_4_highway',
  levelName: 'Highway Havoc',
  highScore: 18000,
  proScore: 145000,
  sickScore: 260000,
  goals: [
    ...scoreTierGoals(18000, 145000, 260000, { high: 2250, pro: 6000, sick: 15000 }),

    lettersGoal(
      letters([
        [-70, 2.5, -25], // S — on the north barrier near spawn
        [-40, 2.0, 12], // T — over the stopped traffic
        [-10, 2.5, 25], // O — on the south barrier
        [0, 4.0, -8], // N — above the construction quarter pipe
        [35, 2.0, 0], // K — over the centre divider
        [80, 3.0, 0], // S — at the exit ramp
      ]),
      4000
    ),

    hiddenFileGoal([60, 2.2, -10], 6000, 'in the boot of a stopped sedan'),

    smashGoal('Flatten 6 construction cones', 6, 2500, [
      { id: 'cone_1', label: 'Traffic Cone', position: [-5, 0, -5] },
      { id: 'cone_2', label: 'Traffic Cone', position: [0, 0, -5] },
      { id: 'cone_3', label: 'Traffic Cone', position: [5, 0, -5] },
      { id: 'cone_4', label: 'Traffic Cone', position: [-5, 0, 5] },
      { id: 'cone_5', label: 'Traffic Cone', position: [0, 0, 5] },
      { id: 'cone_6', label: 'Traffic Cone', position: [5, 0, 5] },
    ]),

    trickAtGoal(
      'grind_barriers',
      'Grind the highway barriers',
      { id: 'highway_barriers', label: 'the highway barriers', center: [0, 1.2, 0], radius: 95, height: 8 },
      GRIND_TRICK_IDS,
      8,
      3000
    ),

    comboGoal(90000, 4500),

    gapListGoal(
      [
        { id: 'traffic_gap_w', name: 'Traffic Jam Gap', bonus: 1000, from: [-45, 0, -8], to: [-35, 0, -8], radius: 5 },
        { id: 'median_gap', name: 'Median Gap', bonus: 1200, from: [0, 0, -12], to: [0, 0, 8], radius: 6 },
        { id: 'construction_gap', name: 'Construction Gap', bonus: 1500, from: [-12, 0, 0], to: [12, 0, 0], radius: 6 },
        { id: 'offramp_gap', name: 'Off-Ramp Gap', bonus: 2500, from: [82, 0, 0], to: [93, 0, 0], radius: 7 },
      ],
      4000
    ),

    escapeReachGoal('Make it to the suburbs', {
      id: 'suburbs_exit',
      label: 'the off-ramp',
      center: [88, 1, 0],
      radius: 12,
      height: 12,
    }, 3500),

    timeGoal('under', 90, 3000, 'Cross the highway in under 90 seconds'),
  ],
});

// =========================================================================
// STORY 5 — Home Sweet Home... Not. 76x76 yard, house at z=-15, FBI SUVs at z=+5,
// fence rails at x = +/-30, forest edge at z=+35.
// =========================================================================
register({
  levelId: 'story_5_home',
  levelName: 'Home Sweet Home... Not',
  highScore: 16000,
  proScore: 125000,
  sickScore: 240000,
  goals: [
    ...scoreTierGoals(16000, 125000, 240000, { high: 2000, pro: 5500, sick: 13500 }),

    lettersGoal(
      letters([
        [-30, 2.5, 8], // S — on the west fence rail
        [-15, 2.2, 5], // T — over the west SUV
        [0, 2.2, 10], // O — over the roadblock SUV
        [30, 2.5, 8], // N — on the east fence rail
        [-15, 3.0, 25], // K — over the west backyard ramp
        [15, 3.0, 25], // S — over the east backyard ramp
      ]),
      3500
    ),

    hiddenFileGoal([0, 9.0, -15], 6000, 'on your own roof'),

    smashGoal('Trash 4 neighbourhood shrubs', 4, 2000, [
      { id: 'shrub_w1', label: 'Shrub', position: [-25, 0, 10] },
      { id: 'shrub_w2', label: 'Shrub', position: [-25, 0, 20] },
      { id: 'shrub_e1', label: 'Shrub', position: [25, 0, 10] },
      { id: 'shrub_e2', label: 'Shrub', position: [25, 0, 20] },
    ]),

    trickAtGoal(
      'grind_fence',
      'Grind the neighbours’ fence',
      { id: 'back_fence', label: 'the back fence', center: [0, 1.2, 15], radius: 34, height: 8 },
      GRIND_TRICK_IDS,
      4,
      2500
    ),

    comboGoal(70000, 4000),

    gapListGoal(
      [
        { id: 'suv_gap', name: 'Roadblock Gap', bonus: 1200, from: [0, 0, 4], to: [0, 0, 16], radius: 5 },
        { id: 'hedge_gap', name: 'Hedge Hop', bonus: 800, from: [-25, 0, 6], to: [-25, 0, 24], radius: 5 },
        { id: 'backyard_gap', name: 'Backyard Gap', bonus: 1500, from: [-15, 0, 27], to: [15, 0, 27], radius: 7 },
      ],
      3000
    ),

    escapeSurviveGoal(30, 3000, 'Keep the FBI off you for 30 seconds'),

    escapeReachGoal('Escape into the forest', {
      id: 'forest_edge',
      label: 'the tree line',
      center: [0, 1, 34],
      radius: 16,
      height: 12,
    }, 2500),

    timeGoal('under', 45, 3500, 'Get out in under 45 seconds'),
  ],
});

// =========================================================================
// STORY 6 — Forest Chase. 140x80 wooded corridor, fallen-log rails, active chase.
// =========================================================================
register({
  levelId: 'story_6_forest',
  levelName: 'Forest Chase',
  highScore: 22000,
  proScore: 175000,
  sickScore: 310000,
  goals: [
    ...scoreTierGoals(22000, 175000, 310000, { high: 2750, pro: 7000, sick: 17500 }),

    lettersGoal(
      letters([
        [-45, 2.2, 0], // S — over the first fallen log
        [-20, 2.2, 10], // T — second log
        [-15, 3.0, -20], // O — over the dirt-mound ramp
        [5, 2.2, -8], // N — third log
        [30, 2.2, 12], // K — fourth log
        [55, 2.2, -3], // S — the last log before the tree line
      ]),
      4500
    ),

    hiddenFileGoal([20, 3.5, 0], 7000, 'on top of the stream crossing'),

    smashGoal('Flatten 5 shrubs', 5, 2500, [
      { id: 'shrub_a', label: 'Shrub', position: [-55, 0, -8] },
      { id: 'shrub_b', label: 'Shrub', position: [-38, 0, 22] },
      { id: 'shrub_c', label: 'Shrub', position: [-12, 0, -28] },
      { id: 'shrub_d', label: 'Shrub', position: [8, 0, 28] },
      { id: 'shrub_e', label: 'Shrub', position: [28, 0, -28] },
      { id: 'shrub_f', label: 'Shrub', position: [48, 0, 15] },
    ]),

    trickAtGoal(
      'grind_logs',
      'Grind 5 fallen logs',
      { id: 'log_run', label: 'the fallen logs', center: [5, 1.2, 0], radius: 70, height: 10 },
      GRIND_TRICK_IDS,
      5,
      3000
    ),

    comboGoal(100000, 5000),

    gapListGoal(
      [
        { id: 'creek_gap', name: 'Creek Gap', bonus: 1500, from: [14, 0, 0], to: [26, 0, 0], radius: 6 },
        { id: 'log_to_log', name: 'Log To Log', bonus: 1200, from: [-45, 0, 0], to: [-20, 0, 10], radius: 6 },
        { id: 'ravine_gap', name: 'Ravine Gap', bonus: 1800, from: [-15, 0, -20], to: [5, 0, -8], radius: 6 },
        { id: 'thicket_gap', name: 'Thicket Gap', bonus: 2000, from: [35, 0, -18], to: [55, 0, -3], radius: 7 },
      ],
      4500
    ),

    escapeSurviveGoal(60, 4000, 'Stay ahead of the agents for 60 seconds'),

    escapeReachGoal('Escape through the forest', {
      id: 'forest_exit',
      label: 'the far tree line',
      center: [62, 1, 0],
      radius: 14,
      height: 12,
    }, 4000),
  ],
});

// =========================================================================
// STORY 7 — Train Yard Takeoff. 190x100 yard, five long track rails, freight
// train platform at x = +80.
// =========================================================================
register({
  levelId: 'story_7_trainyard',
  levelName: 'Train Yard Takeoff',
  highScore: 26000,
  proScore: 205000,
  sickScore: 375000,
  goals: [
    ...scoreTierGoals(26000, 205000, 375000, { high: 3250, pro: 8500, sick: 21000 }),

    lettersGoal(
      letters([
        [-60, 5.0, -25], // S — on the first train car
        [-30, 2.2, -20], // T — over the second track
        [0, 2.2, 0], // O — the centre track
        [10, 5.0, 25], // N — on the north train car
        [45, 5.0, 25], // K — on the far train car
        [80, 6.0, 0], // S — on the departing freight
      ]),
      5000
    ),

    hiddenFileGoal([-20, 7.0, 40], 8000, 'on the yard office roof'),

    smashGoal('Smash 4 oil barrels', 4, 3000, [
      { id: 'barrel_a', label: 'Oil Barrel', position: [-55, 0, 35] },
      { id: 'barrel_b', label: 'Oil Barrel', position: [-45, 0, 35] },
      { id: 'barrel_c', label: 'Oil Barrel', position: [25, 0, -40] },
      { id: 'barrel_d', label: 'Oil Barrel', position: [35, 0, -40] },
    ]),

    trickAtGoal(
      'grind_tracks',
      'Grind 10 railroad tracks',
      { id: 'railroad', label: 'the railroad tracks', center: [0, 1.2, 0], radius: 95, height: 10 },
      GRIND_TRICK_IDS,
      10,
      3500
    ),

    comboGoal(120000, 6000),

    gapListGoal(
      [
        { id: 'track_gap_1', name: 'Track To Track', bonus: 1200, from: [-40, 0, -30], to: [-40, 0, -20], radius: 5 },
        { id: 'boxcar_gap', name: 'Boxcar Gap', bonus: 2000, from: [-60, 3, -25], to: [-35, 3, -25], radius: 7 },
        { id: 'crossing_gap', name: 'Level Crossing Gap', bonus: 1500, from: [-30, 0, 0], to: [30, 0, 0], radius: 8 },
        { id: 'freight_gap', name: 'Catch The Freight', bonus: 4000, from: [70, 0, 0], to: [80, 4, 0], radius: 8 },
      ],
      5000
    ),

    cashGoal('yard_cash', 'Grab the shipping payouts', 2500, [
      { id: 'cash_car_w', label: 'Cash Bundle', position: [-50, 4, -25], value: 2000 },
      { id: 'cash_car_e', label: 'Cash Bundle', position: [20, 4, 25], value: 2000 },
    ]),

    escapeReachGoal('Catch the freight train', {
      id: 'freight_train',
      label: 'the freight train',
      center: [80, 4.5, 0],
      radius: 12,
      height: 14,
    }, 5000),
  ],
});

// =========================================================================
// STORY 8 — Rooftop Run. Nine rooftops from y=18 to y=30 across 190 units of x.
// =========================================================================
register({
  levelId: 'story_8_rooftops',
  levelName: 'Rooftop Run',
  highScore: 32000,
  proScore: 255000,
  sickScore: 450000,
  goals: [
    ...scoreTierGoals(32000, 255000, 450000, { high: 4000, pro: 10000, sick: 25000 }),

    lettersGoal(
      letters([
        [-65, 22.0, -12], // S — over the first railing
        [-50, 24.5, 20], // T — the raised north-west roof
        [-25, 26.5, 10], // O — over the long railing
        [0, 29.0, 5], // N — the angled rail
        [30, 30.5, -12], // K — the big east roof rail
        [80, 33.0, 0], // S — over the helipad
      ]),
      5500
    ),

    hiddenFileGoal([-70, 22.0, 10], 9000, 'behind the west AC unit'),

    smashGoal('Wreck 3 AC units', 3, 3500, [
      { id: 'ac_west', label: 'AC Unit', position: [-70, 20, 10] },
      { id: 'ac_mid', label: 'AC Unit', position: [-20, 25, -8] },
      { id: 'ac_east', label: 'AC Unit', position: [35, 28, 10] },
    ]),

    trickAtGoal(
      'grind_rooftop_rails',
      'Grind 8 rooftop railings',
      { id: 'skyline', label: 'the rooftop railings', center: [0, 25, 0], radius: 95, height: 24 },
      GRIND_TRICK_IDS,
      8,
      4000
    ),

    comboGoal(140000, 7000),

    gapListGoal(
      [
        { id: 'alley_gap_1', name: 'Alley Gap', bonus: 2000, from: [-60, 18, 0], to: [-50, 20, -20], radius: 7 },
        { id: 'alley_gap_2', name: 'Fire Escape Gap', bonus: 2200, from: [-38, 22, 15], to: [-25, 23, 0], radius: 7 },
        { id: 'boulevard_gap', name: 'Boulevard Gap', bonus: 3000, from: [-12, 23, 0], to: [0, 25, -15], radius: 8 },
        { id: 'skyline_gap', name: 'Skyline Gap', bonus: 3500, from: [12, 25, 10], to: [30, 26, 0], radius: 8 },
        { id: 'helipad_gap', name: 'Helipad Gap', bonus: 5000, from: [70, 28, 5], to: [80, 30, 0], radius: 9 },
      ],
      6000
    ),

    escapeReachGoal('Reach the helipad', {
      id: 'helipad',
      label: 'the helipad',
      center: [80, 31, 0],
      radius: 14,
      height: 16,
    }, 6000),

    timeGoal('under', 150, 4000, 'Cross the skyline in under 150 seconds'),
  ],
});

// =========================================================================
// STORY 9 — The Great Escape. 140x80 finale gauntlet, chase active, chopper at x=+60.
// =========================================================================
register({
  levelId: 'story_9_finale',
  levelName: 'The Great Escape',
  highScore: 40000,
  proScore: 300000,
  sickScore: 625000,
  goals: [
    ...scoreTierGoals(40000, 300000, 625000, { high: 5000, pro: 12500, sick: 35000 }),

    lettersGoal(
      letters([
        [-45, 2.5, -15], // S — over the first SEC cruiser
        [-20, 2.5, -20], // T — north rail
        [-20, 2.5, 20], // O — south rail
        [0, 5.0, 0], // N — over the quarter pipe lip
        [20, 2.0, 0], // K — in the cone gauntlet
        [40, 5.0, 0], // S — on the final fun box
      ]),
      6000
    ),

    hiddenFileGoal([-30, 2.5, 0], 10000, 'in the SEC cruiser blocking the road'),

    smashGoal('Total 5 SEC roadblocks', 5, 4000, [
      { id: 'cone_a', label: 'Roadblock Cone', position: [20, 0, -5] },
      { id: 'cone_b', label: 'Roadblock Cone', position: [20, 0, 0] },
      { id: 'cone_c', label: 'Roadblock Cone', position: [20, 0, 5] },
      { id: 'bin_n', label: 'Barrel', position: [25, 0, -15] },
      { id: 'bin_s', label: 'Barrel', position: [25, 0, 15] },
      { id: 'barrier_n', label: 'Barrier', position: [15, 0, -10] },
      { id: 'barrier_s', label: 'Barrier', position: [15, 0, 10] },
    ]),

    trickAtGoal(
      'special_on_helipad',
      'Land a special on the helipad',
      { id: 'chopper_pad', label: 'the helipad', center: [60, 5, 0], radius: 12, height: 14 },
      SPECIAL_TRICK_IDS,
      1,
      8000
    ),

    comboGoal(200000, 8000),

    gapListGoal(
      [
        { id: 'cruiser_gap', name: 'Cruiser Gap', bonus: 2000, from: [-45, 0, -15], to: [-45, 0, 15], radius: 7 },
        { id: 'rail_transfer', name: 'Rail Transfer', bonus: 2500, from: [-20, 0, -20], to: [-20, 0, 0], radius: 7 },
        { id: 'gauntlet_gap', name: 'Gauntlet Gap', bonus: 3000, from: [12, 0, 0], to: [28, 0, 0], radius: 8 },
        { id: 'liftoff_gap', name: 'Liftoff Gap', bonus: 6000, from: [50, 2, 0], to: [60, 4, 0], radius: 9 },
      ],
      7500
    ),

    escapeSurviveGoal(45, 6000, 'Outrun the SEC for 45 seconds'),

    escapeReachGoal('REACH THE HELICOPTER', {
      id: 'helicopter',
      label: 'the helicopter',
      center: [60, 5, 0],
      radius: 12,
      height: 16,
    }, 10000),

    timeGoal('under', 60, 8000, 'Escape in under 60 seconds'),
  ],
});

// =========================================================================
// FREE SKATE — ch1_office. 48x48 cubicle farm. buildOfficeInterior() carves a SPINE corridor
// along Z (|x| < 5.2) and a CROSS corridor along X (|z| < 4.6), both walled with continuous
// grindable cubicle cap rails at y = 1.4, meeting at the spawn. Inside the spine sit floor rails
// at x = +/-4.0 (z -21.5..-5.5 and +5.5..+21.5), four kickers facing ALONG Z at (+/-2.4, -/+8.5)
// and (+/-2.4, -/+13.0), the conference-table fun box at z = -18 and the stairs at z = +20.
//
// GOAL ORDER IS THE TUTORIAL. The checklist is read top-down, so it is authored as a route:
// grind the rails two metres either side of spawn, bank the first tier off it, take the two
// water coolers that sit in the spine, learn the kickers through the gap list, then let the
// letters walk you around the whole loop before the checklist starts asking for real lines.
// Nothing above position 7 requires a skill the goal above it has not already taught.
// =========================================================================
register({
  levelId: 'ch1_office',
  levelName: 'Cubicle Chaos',
  // MEASURED, not guessed — see the tier note above GOAL_SETS.
  // 120 s sessions driven through tools/play.mjs: pushing with a few ollies and flips banks 3,766;
  // holding the grind button through the whole session with no linking at all banks 53,329.
  // So HIGH is set where "you landed something" lands, PRO is set ABOVE the entire button-holding
  // ceiling so it cannot be reached without linking features into a line, and SICK needs three or
  // four genuinely good lines (one 12 s linked line prices at ~47,000).
  highScore: 8000,
  proScore: 75000,
  sickScore: 150000,
  goals: [
    // 1. The first thing you should ever do here: grind. The spine cap rails are 2 m either side
    //    of the spawn point, so this completes itself if the player just points at a wall.
    trickAtGoal(
      'grind_desk_rails',
      'Grind 3 desk rails',
      { id: 'desk_rails', label: 'the desk rails', center: [0, 1.0, 0], radius: 24, height: 8 },
      GRIND_TRICK_IDS,
      3,
      1500
    ),

    // 2. HIGH SCORE falls out of doing goal 1 properly.
    scoreTierGoal('high', 8000, 2000),

    // 3. Both coolers stand in the spine corridor, on the line the player is already riding.
    smashGoal('Smash both water coolers', 2, 1000, [
      { id: 'cooler_nw', label: 'Water Cooler', position: [-4.6, 0, -6.6] },
      { id: 'cooler_se', label: 'Water Cooler', position: [4.6, 0, 6.6] },
    ]),

    // 4. The gaps ARE the kickers. Two kicker-to-kicker hops (the ramps face each other 4.5 m
    //    apart, one pair per spine direction), the conference table, and the stairs — i.e. every
    //    piece of air the level actually contains, named so the player learns where it is.
    gapListGoal(
      [
        { id: 'kicker_gap_n', name: 'Kicker Gap', bonus: 750, from: [2.4, 0, -8.5], to: [2.4, 0, -13.0], radius: 3.5 },
        { id: 'kicker_gap_s', name: 'Kicker Gap South', bonus: 750, from: [-2.4, 0, 8.5], to: [-2.4, 0, 13.0], radius: 3.5 },
        { id: 'table_gap', name: 'Conference Table Gap', bonus: 600, from: [0, 0, -21], to: [0, 0, -15], radius: 4 },
        { id: 'stair_gap', name: 'Stairwell Gap', bonus: 900, from: [0, 0, 17.5], to: [0, 0, 23], radius: 4 },
      ],
      1500
    ),

    // 5. The letters trace the level's main loop in order, so collecting them IS the line:
    //    kicker -> floor rail -> conference table -> floor rail back -> kicker -> stairs.
    lettersGoal(
      letters([
        [2.4, 2.0, -8.5], // S — over the north kicker, where you pop
        [4.0, 1.8, -16], // T — down the north-east floor rail
        [0, 2.2, -18], // O — on the conference table
        [-4.0, 1.8, -13.5], // N — the north-west floor rail, coming back
        [-2.4, 2.0, 8.5], // K — over the south kicker
        [0, 1.8, 19], // S — the top of the stairs
      ]),
      2000
    ),

    // 6. Paper money, strung along the same spine so it pays for riding the line cleanly.
    cashGoal('office_papers', 'Collect all shredded documents', 2000, [
      { id: 'doc_a', label: 'Shredded Document', position: [-4.2, 1, -10], value: 100 },
      { id: 'doc_b', label: 'Shredded Document', position: [4.2, 1, -10], value: 100 },
      { id: 'doc_c', label: 'Shredded Document', position: [0, 2, 14], value: 250 },
      { id: 'cash_w', label: 'Petty Cash', position: [-3, 1, 0], value: 500 },
      { id: 'cash_e', label: 'Petty Cash', position: [3, 1, 0], value: 500 },
    ]),

    // 7. The first goal that demands a LINE. Holding the grind button for two solid minutes
    //    produced a best combo of 10,710; 25,000 needs features linked through manuals and
    //    reverts, which is exactly the skill everything above has been building toward.
    comboGoal(25000, 4000, 'Land a $25,000 combo in one line'),

    // 8. PRO SCORE. Unreachable without goal 7's skill.
    scoreTierGoal('pro', 75000, 6000),

    // 9. Hidden, and deliberately NOT on the floor: the pickup sphere sits 3.9 m up at the far
    //    end of the north-west cap rail, out of reach of a chair on the carpet. You get it by
    //    riding that rail to its end. A secret should cost a line, not a stroll.
    hiddenFileGoal([-5.2, 2.8, -20.6], 3000, 'ride the north-west cubicle rail to the end'),

    // 10. SICK SCORE.
    scoreTierGoal('sick', 150000, 15000),

    // 11. Stay out for the full session.
    timeGoal('survive', 120, 1500, 'Skate the full 2 minute session'),
  ],
});

// =========================================================================
// FREE SKATE — ch1_garage. 90x90 parking deck, car rows at x = +/-20,
// concrete barrier rails across z, quarter pipes on the side walls.
// =========================================================================
register({
  levelId: 'ch1_garage',
  levelName: 'Parking Lot Panic',
  highScore: 12000,
  proScore: 105000,
  sickScore: 200000,
  goals: [
    ...scoreTierGoals(12000, 105000, 200000, { high: 1750, pro: 4500, sick: 11000 }),

    lettersGoal(
      letters([
        [-20, 2.5, -30], // S — on the first parked car
        [0, 2.0, -35], // T — over the north barrier rail
        [20, 2.5, -10], // O — on an east-row car
        [0, 2.0, -15], // N — the middle barrier rail
        [-38, 4.0, 0], // K — in the west quarter pipe
        [0, 2.0, 5], // S — the south barrier rail
      ]),
      2500
    ),

    hiddenFileGoal([38, 4.0, 0], 4000, 'in the east quarter pipe'),

    smashGoal('Flatten the cone line', 3, 1500, [
      { id: 'cone_w', label: 'Traffic Cone', position: [-5, 0, 30] },
      { id: 'cone_c', label: 'Traffic Cone', position: [0, 0, 30] },
      { id: 'cone_e', label: 'Traffic Cone', position: [5, 0, 30] },
    ]),

    trickAtGoal(
      'grind_barriers',
      'Grind the concrete barriers',
      { id: 'concrete_barriers', label: 'the concrete barriers', center: [0, 1.0, -15], radius: 40, height: 8 },
      GRIND_TRICK_IDS,
      5,
      2000
    ),

    comboGoal(40000, 2500),

    gapListGoal(
      [
        { id: 'row_gap', name: 'Parking Row Gap', bonus: 800, from: [-20, 0, -25], to: [-20, 0, -15], radius: 5 },
        { id: 'aisle_gap', name: 'Garage Aisle Gap', bonus: 1000, from: [-10, 0, 25], to: [10, 0, 25], radius: 6 },
        { id: 'pipe_transfer', name: 'Pipe Transfer', bonus: 1500, from: [-38, 0, 0], to: [38, 0, 0], radius: 8 },
      ],
      2500
    ),

    escapeReachGoal('Reach the exit ramp', {
      id: 'exit_ramp',
      label: 'the exit ramp',
      center: [0, 1, 36],
      radius: 12,
      height: 10,
    }, 3000),

    timeGoal('under', 120, 2000, 'Clear the garage in under 2 minutes'),
  ],
});

// =========================================================================
// FREE SKATE — ch2_downtown. 140x140 plaza, benches at x = +/-15, stair set and
// handrails at z=-50, half pipe at z=+30.
// =========================================================================
register({
  levelId: 'ch2_downtown',
  levelName: 'Street Smart',
  highScore: 20000,
  proScore: 165000,
  sickScore: 300000,
  goals: [
    ...scoreTierGoals(20000, 165000, 300000, { high: 2500, pro: 6500, sick: 16000 }),

    lettersGoal(
      letters([
        [-3, 2.5, -50], // S — over the west handrail
        [3, 2.5, -50], // T — over the east handrail
        [-15, 1.8, -20], // O — on a west bench
        [15, 1.8, 0], // N — on an east bench
        [-30, 2.2, -30], // K — on the north-west planter
        [0, 4.0, 30], // S — in the half pipe
      ]),
      3000
    ),

    hiddenFileGoal([30, 2.2, 30], 5000, 'inside the south-east planter'),

    smashGoal('Smash 2 trash cans and 4 planters', 4, 2500, [
      { id: 'bin_w', label: 'Trash Can', position: [-25, 0, 0] },
      { id: 'bin_e', label: 'Trash Can', position: [25, 0, 0] },
      { id: 'planter_nw', label: 'Planter', position: [-30, 0, -30] },
      { id: 'planter_ne', label: 'Planter', position: [30, 0, -30] },
      { id: 'planter_sw', label: 'Planter', position: [-30, 0, 30] },
      { id: 'planter_se', label: 'Planter', position: [30, 0, 30] },
    ]),

    trickAtGoal(
      'grind_handrails',
      'Grind the stair handrails',
      { id: 'stair_set', label: 'the stair set', center: [0, 1.5, -50], radius: 14, height: 12 },
      GRIND_TRICK_IDS,
      4,
      2500
    ),

    trickAtGoal(
      'bench_run',
      'Grind 6 plaza benches',
      { id: 'plaza', label: 'the plaza', center: [0, 1.0, -20], radius: 45, height: 10 },
      GRIND_TRICK_IDS,
      6,
      2000
    ),

    comboGoal(50000, 3000),

    gapListGoal(
      [
        { id: 'stair_gap', name: 'Nine Stair Gap', bonus: 1500, from: [0, 0, -55], to: [0, 0, -45], radius: 6 },
        { id: 'bench_gap', name: 'Bench To Bench', bonus: 900, from: [-15, 0, -40], to: [-15, 0, -20], radius: 5 },
        { id: 'plaza_gap', name: 'Plaza Gap', bonus: 1200, from: [-15, 0, 0], to: [15, 0, 0], radius: 7 },
        { id: 'pipe_gap', name: 'Half Pipe Channel', bonus: 2000, from: [-7, 0, 30], to: [7, 0, 30], radius: 6 },
      ],
      3500
    ),

    timeGoal('survive', 120, 2500, 'Survive downtown for 2 minutes'),
  ],
});

// ---------------------------------------------------------------------------
// Lookup + legacy adapter
// ---------------------------------------------------------------------------

/** Every level id that has a hand-authored goal set. */
export const GOAL_SET_IDS: readonly string[] = Object.keys(GOAL_SETS);

export function hasGoalSetFor(levelId: string): boolean {
  return Object.prototype.hasOwnProperty.call(GOAL_SETS, levelId);
}

/**
 * The hand-authored checklist for a level. Always returns a usable set: unknown ids (custom levels
 * from the editor) get a generic score/combo/gap-free set rather than undefined, so the goal HUD and
 * the rank never fall back to the old NaN.
 *
 * The returned object is a deep copy — mutate it freely.
 */
export function defaultGoalSetFor(levelId: string): LevelGoalSet {
  const authored = GOAL_SETS[levelId];
  if (authored) return clone(authored);

  const high = 10000;
  const pro = 90000;
  const sick = 190000;
  return {
    levelId,
    levelName: levelId,
    highScore: high,
    proScore: pro,
    sickScore: sick,
    goals: [
      ...scoreTierGoals(high, pro, sick, { high: 1500, pro: 4000, sick: 10000 }),
      comboGoal(40000, 2500),
      {
        id: 'grind_anything',
        kind: 'trickAt',
        description: 'Grind 5 rails',
        target: 5,
        reward: 2000,
        trickIds: [...GRIND_TRICK_IDS],
      },
      timeGoal('survive', 120, 1500, 'Skate for 2 minutes'),
    ],
  };
}

/**
 * Adapter for the goals already written in LevelData.ts / StoryLevels.ts.
 *
 * Pass `level.id` and `level.goals` straight in (the shape matches LevelData.GoalDefinition, no
 * import needed). Every legacy goal maps onto a real GoalDef:
 *
 *   score  -> three scoreTier goals (the legacy target becomes HIGH; PRO = 2.5x, SICK = 5x)
 *   collect-> a cash-collect goal with no placements (any pickup id counts)
 *   combo  -> a combo goal
 *   grind  -> a zone-less trickAt goal restricted to the grind trick ids
 *   escape -> a zone-less 'reach' escape goal, settled by notifyFinish()
 *   time   -> 'under' when the text says under/within/less than, otherwise 'survive'
 *
 * Legacy data carries no letters, no hidden file, no gaps and no smash props, so a converted set is
 * strictly poorer than defaultGoalSetFor(). Use this only to migrate a level that has no authored
 * set (e.g. one built in the level editor); `mergeAuthored` (default true) folds in the authored set
 * when one exists so nothing is lost.
 */
export function fromLegacyGoals(
  levelId: string,
  legacyGoals: LegacyGoalDefinition[] | undefined,
  mergeAuthored = true
): LevelGoalSet {
  if (mergeAuthored && hasGoalSetFor(levelId)) return defaultGoalSetFor(levelId);

  const goals: GoalDef[] = [];
  let high = 0;
  let pro = 0;
  let sick = 0;
  let counter = 0;

  for (const legacy of legacyGoals ?? []) {
    const reward = Math.max(0, Math.floor(legacy.reward ?? 0));
    const target = Math.max(1, Math.floor(legacy.target ?? 1));
    const text = (legacy.description ?? '').toLowerCase();
    counter++;

    switch (legacy.type) {
      case 'score': {
        // Only the first score goal defines the tiers; later ones become extra combo-free tiers.
        if (high === 0) {
          high = target;
          // Tier spread measured in ch1_office (see the tier note above GOAL_SETS): HIGH is "you landed
          // something", PRO is ~9x that and sits above what button-holding can reach, SICK is
          // ~19x and needs several linked lines. The old 2.5x / 5x spread put PRO and SICK inside
          // the range a player clears without ever building a combo.
          pro = Math.round((target * 9) / 500) * 500;
          sick = Math.round((target * 19) / 500) * 500;
          goals.unshift(
            ...scoreTierGoals(high, pro, sick, {
              high: reward || Math.round(target * 0.15),
              pro: Math.round((reward || target * 0.15) * 2.5),
              sick: Math.round((reward || target * 0.15) * 6),
            })
          );
        }
        break;
      }

      case 'collect':
        goals.push({
          id: `legacy_collect_${counter}`,
          kind: 'collectLetters',
          collectKind: 'cash',
          description: legacy.description,
          target,
          reward,
        });
        break;

      case 'combo':
        goals.push({
          id: `legacy_combo_${counter}`,
          kind: 'combo',
          description: legacy.description,
          target,
          reward,
        });
        break;

      case 'grind':
        goals.push({
          id: `legacy_grind_${counter}`,
          kind: 'trickAt',
          description: legacy.description,
          target,
          reward,
          trickIds: [...GRIND_TRICK_IDS],
        });
        break;

      case 'escape':
        goals.push({
          id: `legacy_escape_${counter}`,
          kind: 'escape',
          escapeMode: 'reach',
          description: legacy.description,
          target: 1,
          reward,
        });
        break;

      case 'time':
        goals.push({
          id: `legacy_time_${counter}`,
          kind: 'time',
          timeMode: /under|within|less than|in under/.test(text) ? 'under' : 'survive',
          description: legacy.description,
          target,
          reward,
        });
        break;

      default:
        break;
    }
  }

  if (high === 0) {
    const fallback = defaultGoalSetFor(levelId);
    high = fallback.highScore;
    pro = fallback.proScore;
    sick = fallback.sickScore;
    goals.unshift(
      ...scoreTierGoals(high, pro, sick, { high: 1500, pro: 4000, sick: 10000 })
    );
  }

  return { levelId, highScore: high, proScore: pro, sickScore: sick, goals };
}

// ---------------------------------------------------------------------------
// INTEGRATION RECIPE (for whoever wires this into Game.ts)
// ---------------------------------------------------------------------------
//
// 1. Game.loadLevel(levelId), after `this.currentLevelId = level.id`:
//
//      this.goals = new GoalTracker(defaultGoalSetFor(level.id));
//      this.scoreSystem.setScoreTargets(this.goals.scoreTargets);
//      this.goals.on(g => {
//        this.hud.showTrick(g.description, g.reward, 1);       // goal-complete popup
//        this.scoreSystem.addStonks(g.reward, 'Goal');          // pay the reward
//      });
//      // spawn the pickups/props this level's checklist needs:
//      for (const l of this.goals.letterPlacements) this.spawnLetterPickup(l);
//      for (const p of this.goals.pickupPlacements) this.spawnPickup(p);
//      for (const t of this.goals.smashTargets)     this.spawnBreakable(t);
//      for (const g of this.goals.gaps)             this.gapDetector.register(g);
//
// 2. Game.update(dt), once per frame:
//
//      this.goals.update(dt);
//      this.goals.notifyScore(this.scoreSystem.sessionScore);
//      this.goals.setPursuit(this.chaseMechanic.isActive);      // drives the "evade" goals
//      const zone = this.goals.zoneAt(pos.x, pos.y, pos.z);     // remember it for step 3
//
// 3. Event hooks:
//      ScoreSystem 'land' event        -> this.goals.notifyCombo(ev.gained)
//      grind ends                      -> this.goals.notifyTrickAt(grindTrickId, zoneIdAtGrindStart)
//      trick lands                     -> this.goals.notifyTrickAt(trick.id, zone?.id ?? '')
//      pickup touched                  -> this.goals.notifyCollect('letter' | 'cash' | 'hiddenItem', pickup.id)
//      breakable destroyed             -> this.goals.notifySmash(prop.id)
//      landed after air                -> const gap = matchGap(this.goals.gaps, takeoffPos, landingPos);
//                                         if (gap) { this.goals.notifyGap(gap.id, gap.bonus);
//                                                    this.scoreSystem.addStonks(gap.bonus, gap.name); }
//      exit trigger entered            -> this.goals.notifyZoneEntered(zone.id)     (this also calls notifyFinish)
//
// 4. Game.endLevel(success):
//
//      if (success) this.goals.notifyFinish();
//      const s = this.goals.summary;
//      this.onLevelComplete?.(this.scoreSystem.sessionScore, this.levelTime, s.completed, s.total);
//      // s.rank matches what GameStateManager computes, and s.goalPercent is never NaN.
//
// 5. Game.restoreCheckpoint(): leave the tracker alone — goals already earned stay earned. Only call
//    goals.reset() on a full level restart.
