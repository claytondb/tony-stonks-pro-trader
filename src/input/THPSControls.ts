/**
 * THPSControls — a THPS 1+2 faithful control layer for Tony Stonks Pro Trader.
 *
 * This is a NEW, parallel implementation. It does not touch, import or depend on
 * InputManager.ts, Game.ts or any gameplay system. It reads the DOM / Gamepad API
 * and emits one immutable-ish `ControlIntent` snapshot per `update(dt)` call.
 *
 * Design rules this file obeys (they are the fixes for the bugs found in the audit):
 *
 *  1. EDGES ARE EDGES. Every field ending in `Edge` (plus `olliePopped`, `special`,
 *     `pause`) is true for EXACTLY ONE `update()` call per physical press. Both the
 *     keyboard and the gamepad go through the same `DigitalSignal` edge detector, so
 *     the "gamepad returns held state into the just-pressed field" bug cannot happen.
 *  2. NOTHING IS DEAD DATA. Every action in the binding table is read, and every
 *     field of ControlIntent is produced by real logic.
 *  3. BINDINGS ARE DATA. `PROFILES` is a plain table; `setBinding()` / `setBindings()`
 *     let a settings screen rewrite it at runtime with no code changes.
 *
 * THPS scheme reproduced (gamepad is the reference, keyboard mirrors it):
 *   Cross / A            ollie — HOLD to crouch & charge, RELEASE to pop (height scales)
 *   Square / X           flip trick  (+ direction for the variant)
 *   Circle / B           grab trick  (+ direction) — HELD, must be released before landing
 *   Triangle / Y         grind — held; direction at the moment of contact picks the type
 *   L1 / R1              rotate left / right
 *   Down→Up (≤250ms)     manual        Up→Down  nose manual
 *   L2 / R2              revert
 *   Hold Up + ollie      nollie
 *   Two trick buttons together (+dir) with a full special meter → special trick
 *   Start / Escape       pause
 *
 * Typical wiring (fixed timestep):
 *
 *   const controls = new THPSControls(renderer.domElement);
 *   ...
 *   const intent = controls.update(dt);       // once per fixed step, first thing
 *   if (intent.pause) togglePause();
 *   applyMovement(intent, dt);
 *   if (intent.olliePopped) ollie(intent.ollieCharge, intent.nollie);
 *   ...
 *   controls.dispose();                       // on level teardown
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** One frame of player intent. Produced fresh by every `update()` call. */
export interface ControlIntent {
  /** Push / kick. Level (true while held). */
  push: boolean;
  /** Brake / roll backwards. Level. */
  brake: boolean;
  /** Steering, -1 = left … +1 = right. Analog on a stick, smoothed on keys. */
  turn: number;

  /**
   * Ollie crouch charge, 0..1.
   * While the ollie button is held this ramps from `ollieMinCharge` to 1 over
   * `ollieChargeMs`. On the frame `olliePopped` is true it holds the value the
   * charge reached at release — multiply your jump impulse by it.
   * 0 when the ollie button is not involved.
   */
  ollieCharge: number;
  /** Edge: true for exactly one update, on the frame the ollie is released/fired. */
  olliePopped: boolean;

  /** Flip button level. */
  flip: boolean;
  /** Edge: exactly one update per press of the flip button. */
  flipEdge: boolean;
  /** Grab button level. */
  grab: boolean;
  /** Edge: exactly one update per press of the grab button. */
  grabEdge: boolean;
  /** Still holding the grab (alias of `grab`, named for landing checks: `if (grabHeld) bail()`). */
  grabHeld: boolean;

  /** Grind button level. */
  grind: boolean;
  /** Edge: exactly one update per press of the grind button. */
  grindEdge: boolean;
  /** Still holding grind — a grind should end when this goes false. */
  grindHeld: boolean;

  /** Air rotation from the shoulder buttons, -1 = left … +1 = right. */
  spin: number;

  /**
   * Trick direction modifier, quantised to -1 / 0 / +1 per axis.
   * y = +1 is UP (nose), y = -1 is DOWN (tail). x = +1 is RIGHT.
   */
  dir: { x: number; y: number };

  /** Edge: exactly one update when the tap sequence completes. */
  manualEdge: 'none' | 'manual' | 'noseManual';

  /** Edge: exactly one update per revert press. */
  revertEdge: boolean;
  /**
   * True if UP was held during the ollie charge (nollie). Latched at the pop and
   * held until the next ollie press, so it can be read after the pop frame.
   */
  nollie: boolean;
  /** Edge: exactly one update when a two-button special is entered (and the meter is ready). */
  special: boolean;

  /** Edge: exactly one update per pause press. */
  pause: boolean;
}

export type BindingProfile = 'thps-keyboard' | 'thps-gamepad' | 'legacy';

/** Every logical action the layer knows about. Binding tables are keyed by this. */
export type ControlAction =
  | 'push'
  | 'brake'
  | 'turnLeft'
  | 'turnRight'
  | 'ollie'
  | 'flip'
  | 'grab'
  | 'grind'
  | 'spinLeft'
  | 'spinRight'
  | 'revert'
  | 'dirUp'
  | 'dirDown'
  | 'dirLeft'
  | 'dirRight'
  | 'pause';

export const CONTROL_ACTIONS: ControlAction[] = [
  'push', 'brake', 'turnLeft', 'turnRight',
  'ollie', 'flip', 'grab', 'grind',
  'spinLeft', 'spinRight', 'revert',
  'dirUp', 'dirDown', 'dirLeft', 'dirRight',
  'pause',
];

/** Layout-independent pad button names. Layout tables resolve them to indices. */
export type PadButton =
  | 'south' | 'east' | 'west' | 'north'
  | 'l1' | 'r1' | 'l2' | 'r2'
  | 'select' | 'start' | 'l3' | 'r3'
  | 'dup' | 'ddown' | 'dleft' | 'dright'
  | 'home';

export type PadAxis = 'lx' | 'ly' | 'rx' | 'ry';

/** How one action is reached on a gamepad. */
export interface PadBinding {
  buttons?: PadButton[];
  /** Optional analog axis trigger, e.g. left stick down for `brake`. */
  axis?: { axis: PadAxis; dir: -1 | 1; threshold?: number };
}

export interface BindingTable {
  /** KeyboardEvent.code values, e.g. 'KeyW', 'Space', 'ArrowLeft'. */
  keyboard: Record<ControlAction, string[]>;
  pad: Record<ControlAction, PadBinding>;
}

export interface ProfileOptions {
  /** Hold-to-charge ollie (THPS) vs. instant fixed pop (legacy). */
  chargeOllie: boolean;
  /** Enable the down→up / up→down manual tap machine. */
  manualEnabled: boolean;
  /** Enable the two-button special input. */
  specialEnabled: boolean;
  /** Read the keyboard at all (pause is always readable so a pad player can still quit). */
  keyboardEnabled: boolean;
  /** Read the gamepad at all. */
  gamepadEnabled: boolean;
}

export interface THPSControlsConfig {
  /** Time to reach a full-power ollie while crouching, ms. */
  ollieChargeMs: number;
  /** Charge value a bare tap produces (so a tap still ollies). */
  ollieMinCharge: number;
  /** Max ms between the two taps of a manual sequence. */
  manualWindowMs: number;
  /** Refractory period after a manual fires, ms. */
  manualCooldownMs: number;
  /** Max ms between the two face buttons of a special. */
  specialWindowMs: number;
  /** Radial deadzone applied to the left stick. */
  stickDeadzone: number;
  /** Analog trigger press threshold (L2/R2). */
  triggerThreshold: number;
  /** Stick magnitude that counts as a direction press (trick dir / manual taps). */
  dirThreshold: number;
  /** Hysteresis: stick must fall below this to release a direction. */
  dirRelease: number;
  /** Stick magnitude that counts as push / brake. */
  moveThreshold: number;
  /** How fast `turn` chases its target, per second (keeps key steering from snapping). */
  turnSmoothing: number;
  /** Ignore keys while an <input>/<textarea>/contenteditable has focus. */
  ignoreInputWhenTyping: boolean;
}

export const DEFAULT_CONFIG: THPSControlsConfig = {
  ollieChargeMs: 380,
  ollieMinCharge: 0.45,
  manualWindowMs: 250,
  manualCooldownMs: 220,
  specialWindowMs: 140,
  stickDeadzone: 0.22,
  triggerThreshold: 0.35,
  dirThreshold: 0.5,
  dirRelease: 0.3,
  moveThreshold: 0.5,
  turnSmoothing: 14,
  ignoreInputWhenTyping: true,
};

// ---------------------------------------------------------------------------
// Gamepad layout tables
// ---------------------------------------------------------------------------

type PadLayoutId = 'standard' | 'ps-legacy' | 'xinput-legacy';
type PadBrand = 'xbox' | 'playstation' | 'generic';

interface PadLayout {
  buttons: Partial<Record<PadButton, number>>;
  axes: Partial<Record<PadAxis, number>>;
  /** Triggers exposed as axes instead of analog buttons (older drivers). */
  triggerAxes?: Partial<Record<'l2' | 'r2', { index: number; bipolar: boolean }>>;
  /** D-pad exposed as an 8-way hat axis instead of buttons. */
  hatAxis?: number;
}

/**
 * W3C "standard" mapping. Both Xbox and modern PlayStation pads report this in
 * Chrome/Edge/Firefox, which is why the THPS face-button assignment below is
 * identical for both: south=Cross/A, east=Circle/B, west=Square/X, north=Triangle/Y.
 */
const LAYOUT_STANDARD: PadLayout = {
  buttons: {
    south: 0, east: 1, west: 2, north: 3,
    l1: 4, r1: 5, l2: 6, r2: 7,
    select: 8, start: 9, l3: 10, r3: 11,
    dup: 12, ddown: 13, dleft: 14, dright: 15,
    home: 16,
  },
  axes: { lx: 0, ly: 1, rx: 2, ry: 3 },
};

/** DualShock 4 / DualSense reported with a non-standard mapping (Safari, some drivers). */
const LAYOUT_PS_LEGACY: PadLayout = {
  buttons: {
    west: 0,   // Square
    south: 1,  // Cross
    east: 2,   // Circle
    north: 3,  // Triangle
    l1: 4, r1: 5, l2: 6, r2: 7,
    select: 8, start: 9, l3: 10, r3: 11,
    home: 12,
  },
  axes: { lx: 0, ly: 1, rx: 2, ry: 5 },
  triggerAxes: { l2: { index: 3, bipolar: true }, r2: { index: 4, bipolar: true } },
  hatAxis: 9,
};

/** Older XInput exposed non-standard (legacy Firefox / some Linux drivers). */
const LAYOUT_XINPUT_LEGACY: PadLayout = {
  buttons: {
    south: 0, east: 1, west: 2, north: 3,
    l1: 4, r1: 5,
    select: 6, start: 7, l3: 8, r3: 9,
    dup: 10, ddown: 11, dleft: 12, dright: 13,
  },
  axes: { lx: 0, ly: 1, rx: 3, ry: 4 },
  triggerAxes: { l2: { index: 2, bipolar: true }, r2: { index: 5, bipolar: true } },
  hatAxis: 9,
};

const PAD_LAYOUTS: Record<PadLayoutId, PadLayout> = {
  'standard': LAYOUT_STANDARD,
  'ps-legacy': LAYOUT_PS_LEGACY,
  'xinput-legacy': LAYOUT_XINPUT_LEGACY,
};

const PS_ID_RE = /054c|0ce6|09cc|05c4|dualshock|dualsense|playstation|\bps[345]\b|wireless controller/i;
const XBOX_ID_RE = /045e|xbox|xinput/i;

const PAD_LABELS: Record<PadBrand, Record<PadButton, string>> = {
  xbox: {
    south: 'A', east: 'B', west: 'X', north: 'Y',
    l1: 'LB', r1: 'RB', l2: 'LT', r2: 'RT',
    select: 'View', start: 'Menu', l3: 'LS', r3: 'RS',
    dup: 'D-Pad ↑', ddown: 'D-Pad ↓', dleft: 'D-Pad ←', dright: 'D-Pad →',
    home: 'Guide',
  },
  playstation: {
    south: '✕', east: '◯', west: '▢', north: '△',
    l1: 'L1', r1: 'R1', l2: 'L2', r2: 'R2',
    select: 'Share', start: 'Options', l3: 'L3', r3: 'R3',
    dup: 'D-Pad ↑', ddown: 'D-Pad ↓', dleft: 'D-Pad ←', dright: 'D-Pad →',
    home: 'PS',
  },
  generic: {
    south: 'Btn 1', east: 'Btn 2', west: 'Btn 3', north: 'Btn 4',
    l1: 'L1', r1: 'R1', l2: 'L2', r2: 'R2',
    select: 'Select', start: 'Start', l3: 'L3', r3: 'R3',
    dup: 'D-Pad ↑', ddown: 'D-Pad ↓', dleft: 'D-Pad ←', dright: 'D-Pad →',
    home: 'Home',
  },
};

const AXIS_LABELS: Record<PadAxis, { neg: string; pos: string }> = {
  lx: { neg: 'L-Stick ←', pos: 'L-Stick →' },
  ly: { neg: 'L-Stick ↑', pos: 'L-Stick ↓' },
  rx: { neg: 'R-Stick ←', pos: 'R-Stick →' },
  ry: { neg: 'R-Stick ↑', pos: 'R-Stick ↓' },
};

const KEY_LABELS: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift',
  ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
  AltLeft: 'Alt', AltRight: 'Alt',
  Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backquote: '`',
};

function keyLabel(code: string): string {
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

// ---------------------------------------------------------------------------
// Binding profiles (DATA — a settings screen can clone and rewrite these)
// ---------------------------------------------------------------------------

function emptyPadTable(): Record<ControlAction, PadBinding> {
  const t = {} as Record<ControlAction, PadBinding>;
  for (const a of CONTROL_ACTIONS) t[a] = {};
  return t;
}

/** THPS pad layout — shared by both THPS profiles. */
function thpsPadTable(): Record<ControlAction, PadBinding> {
  const t = emptyPadTable();
  t.push = { buttons: ['dup'], axis: { axis: 'ly', dir: -1 } };
  t.brake = { buttons: ['ddown'], axis: { axis: 'ly', dir: 1 } };
  t.turnLeft = { buttons: ['dleft'] };
  t.turnRight = { buttons: ['dright'] };
  t.ollie = { buttons: ['south'] };
  t.flip = { buttons: ['west'] };
  t.grab = { buttons: ['east'] };
  t.grind = { buttons: ['north'] };
  t.spinLeft = { buttons: ['l1'] };
  t.spinRight = { buttons: ['r1'] };
  t.revert = { buttons: ['l2', 'r2'] };
  t.dirUp = { buttons: ['dup'] };
  t.dirDown = { buttons: ['ddown'] };
  t.dirLeft = { buttons: ['dleft'] };
  t.dirRight = { buttons: ['dright'] };
  t.pause = { buttons: ['start'] };
  return t;
}

interface ProfileDef {
  label: string;
  keyboard: Record<ControlAction, string[]>;
  pad: Record<ControlAction, PadBinding>;
  options: ProfileOptions;
}

/**
 * THPS keyboard defaults: WASD move, Space ollie (hold to charge), J flip, K grab,
 * L grind, Q/E spin, Shift revert, arrow keys = trick direction + manual taps.
 */
const THPS_KEYBOARD: Record<ControlAction, string[]> = {
  push: ['KeyW'],
  brake: ['KeyS'],
  turnLeft: ['KeyA'],
  turnRight: ['KeyD'],
  ollie: ['Space'],
  flip: ['KeyJ'],
  grab: ['KeyK'],
  grind: ['KeyL'],
  spinLeft: ['KeyQ'],
  spinRight: ['KeyE'],
  revert: ['ShiftLeft', 'ShiftRight'],
  dirUp: ['ArrowUp'],
  dirDown: ['ArrowDown'],
  dirLeft: ['ArrowLeft'],
  dirRight: ['ArrowRight'],
  pause: ['Escape'],
};

/** The pre-existing scheme, kept so nobody's muscle memory for the old build breaks. */
const LEGACY_KEYBOARD: Record<ControlAction, string[]> = {
  push: ['KeyW'],
  brake: ['KeyS'],
  turnLeft: ['KeyA'],
  turnRight: ['KeyD'],
  ollie: ['Space'],
  flip: ['ArrowLeft'],
  grab: ['ArrowRight'],
  grind: ['ArrowUp'],
  spinLeft: ['KeyQ'],
  spinRight: ['KeyE'],
  revert: ['ControlLeft', 'ControlRight'],
  dirUp: ['KeyW'],
  dirDown: ['KeyS'],
  dirLeft: ['KeyA'],
  dirRight: ['KeyD'],
  pause: ['Escape'],
};

function cloneKeyboard(src: Record<ControlAction, string[]>): Record<ControlAction, string[]> {
  const out = {} as Record<ControlAction, string[]>;
  for (const a of CONTROL_ACTIONS) out[a] = [...(src[a] ?? [])];
  return out;
}

function clonePad(src: Record<ControlAction, PadBinding>): Record<ControlAction, PadBinding> {
  const out = {} as Record<ControlAction, PadBinding>;
  for (const a of CONTROL_ACTIONS) {
    const b = src[a] ?? {};
    out[a] = {
      buttons: b.buttons ? [...b.buttons] : undefined,
      axis: b.axis ? { ...b.axis } : undefined,
    };
  }
  return out;
}

export const PROFILES: Record<BindingProfile, ProfileDef> = {
  'thps-keyboard': {
    label: 'THPS (Keyboard)',
    keyboard: THPS_KEYBOARD,
    pad: thpsPadTable(),
    options: {
      chargeOllie: true,
      manualEnabled: true,
      specialEnabled: true,
      keyboardEnabled: true,
      gamepadEnabled: true,
    },
  },
  'thps-gamepad': {
    label: 'THPS (Controller)',
    keyboard: THPS_KEYBOARD,
    pad: thpsPadTable(),
    options: {
      chargeOllie: true,
      manualEnabled: true,
      specialEnabled: true,
      // Controller-only: stray keyboard presses can't steer or trick. Pause still works.
      keyboardEnabled: false,
      gamepadEnabled: true,
    },
  },
  'legacy': {
    label: 'Legacy (pre-1.0 build)',
    keyboard: LEGACY_KEYBOARD,
    // The old pad mapping was already Xbox face-button order, so it matches the
    // THPS table; only the keyboard half and the options differ.
    pad: thpsPadTable(),
    options: {
      // Legacy jump was a fixed impulse and had no manual, so charging/manual are off.
      chargeOllie: false,
      manualEnabled: false,
      specialEnabled: false,
      keyboardEnabled: true,
      gamepadEnabled: true,
    },
  },
};

// ---------------------------------------------------------------------------
// Edge detector — ONE implementation, used for every action on every device.
// ---------------------------------------------------------------------------

class DigitalSignal {
  down = false;
  /** True for exactly one update() per press. */
  pressed = false;
  /** True for exactly one update() per release. */
  released = false;
  /** Seconds the signal has been continuously down (0 on the press frame). */
  heldTime = 0;
  /** Internal clock stamp (ms) of the last press. */
  pressTime = -Infinity;

  update(next: boolean, dt: number, nowMs: number): void {
    this.pressed = next && !this.down;
    this.released = !next && this.down;
    if (this.pressed) {
      this.heldTime = 0;
      this.pressTime = nowMs;
    } else if (next) {
      this.heldTime += dt;
    } else {
      this.heldTime = 0;
    }
    this.down = next;
  }

  reset(): void {
    this.down = false;
    this.pressed = false;
    this.released = false;
    this.heldTime = 0;
    this.pressTime = -Infinity;
  }
}

// ---------------------------------------------------------------------------
// THPSControls
// ---------------------------------------------------------------------------

export class THPSControls {
  private config: THPSControlsConfig;
  private profile: BindingProfile = 'thps-keyboard';
  private bindings: BindingTable;
  private options: ProfileOptions;

  // --- keyboard state -------------------------------------------------------
  private target: HTMLElement | Window;
  private held = new Set<string>();
  /** Keys pressed since the last update, even if already released (fast taps). */
  private pressLatch = new Set<string>();
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundBlur: () => void;
  private boundVisibility: () => void;
  private boundPadConnect: (e: GamepadEvent) => void;
  private boundPadDisconnect: (e: GamepadEvent) => void;
  private disposed = false;

  // --- gamepad state --------------------------------------------------------
  private padIndex: number | null = null;
  private pad: Gamepad | null = null;
  private layoutId: PadLayoutId = 'standard';
  private brand: PadBrand = 'generic';

  // --- per-action edge detectors -------------------------------------------
  private signals = new Map<ControlAction, DigitalSignal>();

  // --- derived state --------------------------------------------------------
  private timeMs = 0;
  private turnValue = 0;
  private ollieChargeMs = 0;
  private nollieArmed = false;
  private nollieLatched = false;
  private specialReady = true;
  private specialLatched = new Set<string>();
  private vertical: -1 | 0 | 1 = 0;
  private manualState: 'idle' | 'down' | 'up' = 'idle';
  private manualStamp = 0;
  private manualCooldownUntil = -Infinity;
  private lastIntent: ControlIntent = makeEmptyIntent();

  constructor(target?: HTMLElement, config?: Partial<THPSControlsConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...(config ?? {}) };
    this.target = target ?? (typeof window !== 'undefined' ? window : (undefined as unknown as Window));

    const p = PROFILES['thps-keyboard'];
    this.bindings = { keyboard: cloneKeyboard(p.keyboard), pad: clonePad(p.pad) };
    this.options = { ...p.options };

    for (const a of CONTROL_ACTIONS) this.signals.set(a, new DigitalSignal());

    // A focusable target is required for it to receive key events at all.
    if (target && target.tabIndex < 0) target.tabIndex = 0;

    this.boundKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
    this.boundKeyUp = (e: KeyboardEvent) => this.onKeyUp(e);
    this.boundBlur = () => this.clearKeys();
    this.boundVisibility = () => { if (document.hidden) this.clearKeys(); };
    this.boundPadConnect = (e: GamepadEvent) => this.onPadConnected(e);
    this.boundPadDisconnect = (e: GamepadEvent) => this.onPadDisconnected(e);

    if (typeof window !== 'undefined') {
      this.target.addEventListener('keydown', this.boundKeyDown as EventListener);
      this.target.addEventListener('keyup', this.boundKeyUp as EventListener);
      window.addEventListener('blur', this.boundBlur);
      window.addEventListener('gamepadconnected', this.boundPadConnect as EventListener);
      window.addEventListener('gamepaddisconnected', this.boundPadDisconnect as EventListener);
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', this.boundVisibility);
      }
      // Pick up a pad that was already connected before we existed.
      this.scanForPad();
    }
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /**
   * Sample every device and produce this frame's intent.
   * Call once per fixed step, BEFORE any gameplay reads input. `dt` in seconds.
   * Calling it twice in one frame is safe: the second call simply sees no new
   * edges (that is the point of routing everything through DigitalSignal).
   */
  update(dt: number): ControlIntent {
    const cfg = this.config;
    this.timeMs += dt * 1000;
    this.pollGamepad();

    // --- 1. resolve every action to a level, then run the edge detectors ----
    for (const action of CONTROL_ACTIONS) {
      this.signals.get(action)!.update(this.actionDown(action), dt, this.timeMs);
    }
    this.pressLatch.clear();

    const sig = (a: ControlAction) => this.signals.get(a)!;

    // --- 2. sticks ----------------------------------------------------------
    const [lx, ly] = this.leftStick();

    // --- 3. movement --------------------------------------------------------
    const push = sig('push').down || -ly >= cfg.moveThreshold;
    const brake = sig('brake').down || ly >= cfg.moveThreshold;

    let turnTarget = (sig('turnRight').down ? 1 : 0) - (sig('turnLeft').down ? 1 : 0);
    if (turnTarget === 0) turnTarget = lx;
    turnTarget = clamp(turnTarget, -1, 1);
    const k = Math.min(1, dt * cfg.turnSmoothing);
    this.turnValue += (turnTarget - this.turnValue) * k;
    if (Math.abs(this.turnValue) < 0.005) this.turnValue = 0;

    // --- 4. trick direction (quantised 9-way, keys + d-pad + stick) ---------
    let dirX = (sig('dirRight').down ? 1 : 0) - (sig('dirLeft').down ? 1 : 0);
    let dirY = (sig('dirUp').down ? 1 : 0) - (sig('dirDown').down ? 1 : 0);
    if (dirX === 0 && Math.abs(lx) >= cfg.dirThreshold) dirX = Math.sign(lx);
    if (dirY === 0 && Math.abs(ly) >= cfg.dirThreshold) dirY = -Math.sign(ly);

    // --- 5. ollie charge / pop ---------------------------------------------
    const ollie = sig('ollie');
    let ollieCharge = 0;
    let olliePopped = false;

    if (ollie.pressed) {
      this.ollieChargeMs = 0;
      this.nollieArmed = dirY > 0;
      this.nollieLatched = false;
    }

    if (this.options.chargeOllie) {
      if (ollie.down) {
        this.ollieChargeMs += dt * 1000;
        if (dirY > 0) this.nollieArmed = true;
        ollieCharge = this.chargeCurve(this.ollieChargeMs);
      }
      if (ollie.released) {
        ollieCharge = this.chargeCurve(this.ollieChargeMs);
        olliePopped = true;
        this.nollieLatched = this.nollieArmed;
        this.ollieChargeMs = 0;
      }
    } else if (ollie.pressed) {
      // Legacy: fixed-impulse pop the moment the button goes down.
      ollieCharge = 1;
      olliePopped = true;
      this.nollieLatched = this.nollieArmed;
    }

    // --- 6. trick buttons ---------------------------------------------------
    const flipSig = sig('flip');
    const grabSig = sig('grab');
    const grindSig = sig('grind');
    let flipEdge = flipSig.pressed;
    let grabEdge = grabSig.pressed;
    let grindEdge = grindSig.pressed;

    // --- 7. special: two trick buttons within specialWindowMs ---------------
    let special = false;
    if (this.options.specialEnabled) {
      const pairs: Array<[ControlAction, ControlAction]> = [
        ['flip', 'grab'],
        ['flip', 'grind'],
        ['grab', 'grind'],
      ];
      for (const [a, b] of pairs) {
        const key = a + '+' + b;
        const sa = sig(a);
        const sb = sig(b);
        if (!sa.down || !sb.down) {
          this.specialLatched.delete(key);
          continue;
        }
        if (this.specialLatched.has(key)) continue;
        const simultaneous = Math.abs(sa.pressTime - sb.pressTime) <= cfg.specialWindowMs;
        if (simultaneous && (sa.pressed || sb.pressed)) {
          this.specialLatched.add(key);
          if (this.specialReady) {
            special = true;
            // Swallow the second button's edge so the trick system doesn't also
            // fire a plain flip/grab on the same frame as the special.
            if (sa.pressed) { if (a === 'flip') flipEdge = false; else if (a === 'grab') grabEdge = false; else grindEdge = false; }
            if (sb.pressed) { if (b === 'flip') flipEdge = false; else if (b === 'grab') grabEdge = false; else grindEdge = false; }
          }
        }
      }
    } else {
      this.specialLatched.clear();
    }

    // --- 8. manual tap machine ---------------------------------------------
    const manualEdge = this.updateManual(dirY, lx, ly);

    // --- 9. assemble --------------------------------------------------------
    const intent: ControlIntent = {
      push,
      brake,
      turn: this.turnValue,
      ollieCharge,
      olliePopped,
      flip: flipSig.down,
      flipEdge,
      grab: grabSig.down,
      grabEdge,
      grabHeld: grabSig.down,
      grind: grindSig.down,
      grindEdge,
      grindHeld: grindSig.down,
      spin: (sig('spinRight').down ? 1 : 0) - (sig('spinLeft').down ? 1 : 0),
      dir: { x: dirX, y: dirY },
      manualEdge,
      revertEdge: sig('revert').pressed,
      nollie: this.nollieLatched,
      special,
      pause: sig('pause').pressed,
    };

    this.lastIntent = intent;
    return intent;
  }

  /** The most recent intent, for systems that run outside the fixed step (HUD, camera). */
  getIntent(): ControlIntent {
    return this.lastIntent;
  }

  /** Swap binding profile. Any per-action overrides made with setBinding() are dropped. */
  setProfile(p: BindingProfile): void {
    if (!PROFILES[p]) return;
    this.profile = p;
    const def = PROFILES[p];
    this.bindings = { keyboard: cloneKeyboard(def.keyboard), pad: clonePad(def.pad) };
    this.options = { ...def.options };
    this.resetTransientState();
  }

  getProfile(): BindingProfile {
    return this.profile;
  }

  /** Live binding table (a copy — feed it back through setBindings() to apply edits). */
  getBindings(): BindingTable {
    return { keyboard: cloneKeyboard(this.bindings.keyboard), pad: clonePad(this.bindings.pad) };
  }

  /** Wholesale rewrite, e.g. from a saved settings blob. Unknown actions are ignored. */
  setBindings(table: Partial<BindingTable>): void {
    if (table.keyboard) {
      for (const a of CONTROL_ACTIONS) {
        if (table.keyboard[a]) this.bindings.keyboard[a] = [...table.keyboard[a]];
      }
    }
    if (table.pad) {
      for (const a of CONTROL_ACTIONS) {
        const b = table.pad[a];
        if (b) this.bindings.pad[a] = { buttons: b.buttons ? [...b.buttons] : undefined, axis: b.axis ? { ...b.axis } : undefined };
      }
    }
    this.resetTransientState();
  }

  /** Rebind a single action (settings screen "press a key" flow). */
  setBinding(action: ControlAction, keys: string[], pad?: PadBinding): void {
    if (!CONTROL_ACTIONS.includes(action)) return;
    this.bindings.keyboard[action] = [...keys];
    if (pad) this.bindings.pad[action] = { buttons: pad.buttons ? [...pad.buttons] : undefined, axis: pad.axis ? { ...pad.axis } : undefined };
    this.signals.get(action)!.reset();
  }

  /** Restore the current profile's defaults. */
  resetBindings(): void {
    this.setProfile(this.profile);
  }

  /** Tunables (charge time, tap windows, deadzone…). */
  getConfig(): THPSControlsConfig {
    return { ...this.config };
  }

  setConfig(patch: Partial<THPSControlsConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  /**
   * Gate the two-button special on the special meter.
   * Defaults to TRUE so specials are reachable even before the meter is wired up —
   * call this every frame with `meter >= 100` once it is.
   */
  setSpecialReady(ready: boolean): void {
    this.specialReady = ready;
  }

  /** 'gamepad' when a pad is connected and enabled by the profile, else 'keyboard'. */
  getActiveDevice(): 'keyboard' | 'gamepad' {
    return this.pad && this.options.gamepadEnabled ? 'gamepad' : 'keyboard';
  }

  /** Connected pad id, or null. Useful for a "Controller detected" toast. */
  getGamepadName(): string | null {
    return this.pad ? this.pad.id : null;
  }

  /** Rows for a controls / how-to-play screen. Pad labels follow the connected brand. */
  getBindingHelp(): { action: string; keyboard: string; gamepad: string }[] {
    const kb = (a: ControlAction) => this.bindings.keyboard[a].map(keyLabel).join(' / ') || '—';
    const gp = (a: ControlAction) => this.padBindingLabel(this.bindings.pad[a]);
    const dirKb = `${kb('dirUp')}${kb('dirDown')}${kb('dirLeft')}${kb('dirRight')}`;
    const rows: { action: string; keyboard: string; gamepad: string }[] = [
      { action: 'Push', keyboard: kb('push'), gamepad: gp('push') },
      { action: 'Brake / Reverse', keyboard: kb('brake'), gamepad: gp('brake') },
      { action: 'Steer', keyboard: `${kb('turnLeft')} / ${kb('turnRight')}`, gamepad: 'L-Stick / D-Pad ←→' },
      {
        action: this.options.chargeOllie ? 'Ollie (hold to charge)' : 'Ollie',
        keyboard: kb('ollie'),
        gamepad: gp('ollie'),
      },
      { action: 'Flip trick (+ direction)', keyboard: `${kb('flip')} + ${dirKb}`, gamepad: `${gp('flip')} + D-Pad` },
      { action: 'Grab trick (hold, release to land)', keyboard: `${kb('grab')} + ${dirKb}`, gamepad: `${gp('grab')} + D-Pad` },
      { action: 'Grind (hold, direction = type)', keyboard: `${kb('grind')} + ${dirKb}`, gamepad: `${gp('grind')} + D-Pad` },
      { action: 'Spin left / right', keyboard: `${kb('spinLeft')} / ${kb('spinRight')}`, gamepad: `${gp('spinLeft')} / ${gp('spinRight')}` },
      { action: 'Revert', keyboard: kb('revert'), gamepad: gp('revert') },
      { action: 'Trick direction', keyboard: dirKb, gamepad: 'D-Pad / L-Stick' },
    ];
    if (this.options.manualEnabled) {
      rows.push(
        { action: 'Manual', keyboard: `${kb('dirDown')} then ${kb('dirUp')}`, gamepad: 'D-Pad ↓ then ↑' },
        { action: 'Nose manual', keyboard: `${kb('dirUp')} then ${kb('dirDown')}`, gamepad: 'D-Pad ↑ then ↓' },
      );
    }
    rows.push({ action: 'Nollie', keyboard: `Hold ${kb('dirUp')} + ${kb('ollie')}`, gamepad: `Hold D-Pad ↑ + ${gp('ollie')}` });
    if (this.options.specialEnabled) {
      rows.push({
        action: 'Special (meter full)',
        keyboard: `${kb('flip')}+${kb('grab')} / ${kb('grab')}+${kb('grind')}`,
        gamepad: `${gp('flip')}+${gp('grab')} / ${gp('grab')}+${gp('grind')}`,
      });
    }
    rows.push({ action: 'Pause', keyboard: kb('pause'), gamepad: gp('pause') });
    return rows;
  }

  /** Detach every listener. Safe to call twice. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (typeof window !== 'undefined') {
      this.target.removeEventListener('keydown', this.boundKeyDown as EventListener);
      this.target.removeEventListener('keyup', this.boundKeyUp as EventListener);
      window.removeEventListener('blur', this.boundBlur);
      window.removeEventListener('gamepadconnected', this.boundPadConnect as EventListener);
      window.removeEventListener('gamepaddisconnected', this.boundPadDisconnect as EventListener);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', this.boundVisibility);
      }
    }
    this.clearKeys();
    this.pad = null;
    this.padIndex = null;
  }

  // =========================================================================
  // Internals
  // =========================================================================

  private resetTransientState(): void {
    for (const s of this.signals.values()) s.reset();
    this.turnValue = 0;
    this.ollieChargeMs = 0;
    this.nollieArmed = false;
    this.nollieLatched = false;
    this.specialLatched.clear();
    this.vertical = 0;
    this.manualState = 'idle';
    this.manualCooldownUntil = -Infinity;
  }

  private chargeCurve(ms: number): number {
    const t = clamp(ms / this.config.ollieChargeMs, 0, 1);
    return this.config.ollieMinCharge + (1 - this.config.ollieMinCharge) * t;
  }

  // --- keyboard -------------------------------------------------------------

  private isTyping(e: KeyboardEvent): boolean {
    if (!this.config.ignoreInputWhenTyping) return false;
    const t = e.target as HTMLElement | null;
    if (!t) return false;
    const tag = t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable === true;
  }

  private isBoundKey(code: string): boolean {
    for (const a of CONTROL_ACTIONS) {
      if (this.bindings.keyboard[a].includes(code)) return true;
    }
    return false;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.isTyping(e)) return;
    if (this.isBoundKey(e.code)) {
      // Stop Space/arrows scrolling the page under the canvas.
      e.preventDefault();
      if (!this.held.has(e.code)) this.pressLatch.add(e.code);
      this.held.add(e.code);
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (this.isTyping(e)) return;
    if (this.held.delete(e.code)) e.preventDefault();
  }

  private clearKeys(): void {
    this.held.clear();
    this.pressLatch.clear();
  }

  /**
   * Level of a key for this update. `pressLatch` means a tap that happened and
   * ended between two updates still yields exactly one press edge and, next
   * update, exactly one release edge.
   */
  private keyLevel(code: string): boolean {
    return this.held.has(code) || this.pressLatch.has(code);
  }

  // --- gamepad --------------------------------------------------------------

  private onPadConnected(e: GamepadEvent): void {
    this.adoptPad(e.gamepad);
  }

  private onPadDisconnected(e: GamepadEvent): void {
    if (this.padIndex === e.gamepad.index) {
      this.pad = null;
      this.padIndex = null;
      this.scanForPad();
    }
  }

  private scanForPad(): void {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    for (const p of pads) {
      if (p && p.connected) {
        this.adoptPad(p);
        return;
      }
    }
  }

  private adoptPad(p: Gamepad): void {
    this.padIndex = p.index;
    this.pad = p;
    this.layoutId = detectLayout(p);
    this.brand = detectBrand(p);
  }

  private pollGamepad(): void {
    if (!this.options.gamepadEnabled) { this.pad = null; return; }
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    if (this.padIndex !== null) {
      const p = pads[this.padIndex];
      // Gamepad objects are snapshots in Chrome — must be re-read every poll.
      this.pad = p && p.connected ? p : null;
      if (!this.pad) this.padIndex = null;
    }
    if (this.padIndex === null) this.scanForPad();
  }

  private get layout(): PadLayout {
    return PAD_LAYOUTS[this.layoutId];
  }

  /** Analog value 0..1 for a semantic pad button, handling axis-triggers and hat d-pads. */
  private padButtonValue(name: PadButton): number {
    const pad = this.pad;
    if (!pad) return 0;
    const layout = this.layout;

    // Triggers exposed on an axis by legacy drivers.
    if ((name === 'l2' || name === 'r2') && layout.triggerAxes && layout.triggerAxes[name]) {
      const t = layout.triggerAxes[name]!;
      const raw = pad.axes[t.index] ?? (t.bipolar ? -1 : 0);
      return clamp(t.bipolar ? (raw + 1) / 2 : raw, 0, 1);
    }

    // D-pad exposed as a hat axis by legacy drivers.
    if (isDpad(name) && layout.buttons[name] === undefined && layout.hatAxis !== undefined) {
      return hatHas(pad.axes[layout.hatAxis] ?? 9, name) ? 1 : 0;
    }

    const idx = layout.buttons[name];
    if (idx === undefined) return 0;
    const btn = pad.buttons[idx];
    if (!btn) return 0;
    if (typeof btn.value === 'number' && btn.value > 0) return clamp(btn.value, 0, 1);
    return btn.pressed ? 1 : 0;
  }

  private padButtonDown(name: PadButton): boolean {
    const v = this.padButtonValue(name);
    const threshold = name === 'l2' || name === 'r2' ? this.config.triggerThreshold : 0.5;
    return v >= threshold;
  }

  private padAxisRaw(name: PadAxis): number {
    const idx = this.layout.axes[name];
    if (idx === undefined || !this.pad) return 0;
    return this.pad.axes[idx] ?? 0;
  }

  /** Left stick with a radial deadzone and rescale. Returns [x, y] with y down-positive. */
  private leftStick(): [number, number] {
    if (!this.pad || !this.options.gamepadEnabled) return [0, 0];
    const x = this.padAxisRaw('lx');
    const y = this.padAxisRaw('ly');
    const mag = Math.hypot(x, y);
    const dz = this.config.stickDeadzone;
    if (mag <= dz) return [0, 0];
    const scaled = Math.min(1, (mag - dz) / (1 - dz)) / mag;
    return [clamp(x * scaled, -1, 1), clamp(y * scaled, -1, 1)];
  }

  private padBindingDown(b: PadBinding | undefined): boolean {
    if (!b || !this.pad) return false;
    if (b.buttons) {
      for (const name of b.buttons) if (this.padButtonDown(name)) return true;
    }
    if (b.axis) {
      const threshold = b.axis.threshold ?? this.config.moveThreshold;
      const [lx, ly] = this.leftStick();
      const v = b.axis.axis === 'lx' ? lx : b.axis.axis === 'ly' ? ly : this.padAxisRaw(b.axis.axis);
      if (b.axis.dir > 0 ? v >= threshold : v <= -threshold) return true;
    }
    return false;
  }

  private padBindingLabel(b: PadBinding | undefined): string {
    if (!b) return '—';
    const parts: string[] = [];
    if (b.buttons) for (const n of b.buttons) parts.push(PAD_LABELS[this.brand][n]);
    if (b.axis) parts.push(b.axis.dir > 0 ? AXIS_LABELS[b.axis.axis].pos : AXIS_LABELS[b.axis.axis].neg);
    return parts.length ? parts.join(' / ') : '—';
  }

  // --- action resolution ----------------------------------------------------

  private actionDown(action: ControlAction): boolean {
    // Pause is always readable from the keyboard, even in controller-only mode.
    if (this.options.keyboardEnabled || action === 'pause') {
      for (const code of this.bindings.keyboard[action]) {
        if (this.keyLevel(code)) return true;
      }
    }
    if (this.options.gamepadEnabled && this.pad) {
      if (this.padBindingDown(this.bindings.pad[action])) return true;
    }
    return false;
  }

  // --- manual tap-sequence state machine ------------------------------------

  /**
   * Real tap sequence: DOWN then UP (or UP then DOWN) with both transitions inside
   * `manualWindowMs`. Holding a direction cannot false-fire, because the pending
   * state times out after the window and a stale first tap is discarded.
   *
   * `dirY` covers keys and the d-pad; the stick is folded in with hysteresis so a
   * wobbling analog stick can't machine-gun the sequence.
   */
  private updateManual(dirY: number, _lx: number, ly: number): 'none' | 'manual' | 'noseManual' {
    if (!this.options.manualEnabled) {
      this.vertical = 0;
      this.manualState = 'idle';
      return 'none';
    }

    const cfg = this.config;
    let v: -1 | 0 | 1 = dirY > 0 ? 1 : dirY < 0 ? -1 : 0;
    if (v === 0 && this.pad && this.options.gamepadEnabled) {
      const up = -ly;
      // Hysteresis: enter a direction at dirThreshold, keep it until dirRelease.
      if (this.vertical === 1 && up > cfg.dirRelease) v = 1;
      else if (this.vertical === -1 && up < -cfg.dirRelease) v = -1;
      else if (up >= cfg.dirThreshold) v = 1;
      else if (up <= -cfg.dirThreshold) v = -1;
    }

    const prev = this.vertical;
    this.vertical = v;
    if (v === prev) {
      // Expire a stale first tap so holding a direction never completes later.
      if (this.manualState !== 'idle' && this.timeMs - this.manualStamp > cfg.manualWindowMs) {
        this.manualState = 'idle';
      }
      return 'none';
    }

    if (this.timeMs < this.manualCooldownUntil) {
      // Still refractory: track the transition but don't fire.
      if (v !== 0) { this.manualState = v === -1 ? 'down' : 'up'; this.manualStamp = this.timeMs; }
      return 'none';
    }

    const fresh = this.timeMs - this.manualStamp <= cfg.manualWindowMs;

    if (v === -1) {
      if (this.manualState === 'up' && fresh) {
        this.manualState = 'idle';
        this.manualCooldownUntil = this.timeMs + cfg.manualCooldownMs;
        return 'noseManual';
      }
      this.manualState = 'down';
      this.manualStamp = this.timeMs;
      return 'none';
    }

    if (v === 1) {
      if (this.manualState === 'down' && fresh) {
        this.manualState = 'idle';
        this.manualCooldownUntil = this.timeMs + cfg.manualCooldownMs;
        return 'manual';
      }
      this.manualState = 'up';
      this.manualStamp = this.timeMs;
      return 'none';
    }

    // Returned to neutral: keep the pending tap alive until the window expires.
    if (this.manualState !== 'idle' && this.timeMs - this.manualStamp > cfg.manualWindowMs) {
      this.manualState = 'idle';
    }
    return 'none';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function isDpad(name: PadButton): boolean {
  return name === 'dup' || name === 'ddown' || name === 'dleft' || name === 'dright';
}

/**
 * Decode a standard 8-way hat axis. Neutral is reported as a value outside
 * [-1, 1] (typically 1.2857 / 9-over-7) by every driver that uses this encoding.
 */
function hatHas(value: number, dir: PadButton): boolean {
  if (!(value >= -1.05 && value <= 1.05)) return false;
  const octant = Math.round((value + 1) * 3.5) % 8; // 0=up, 1=up-right, 2=right, …
  switch (dir) {
    case 'dup': return octant === 7 || octant === 0 || octant === 1;
    case 'dright': return octant === 1 || octant === 2 || octant === 3;
    case 'ddown': return octant === 3 || octant === 4 || octant === 5;
    case 'dleft': return octant === 5 || octant === 6 || octant === 7;
    default: return false;
  }
}

function detectLayout(p: Gamepad): PadLayoutId {
  if (p.mapping === 'standard') return 'standard';
  if (PS_ID_RE.test(p.id)) return 'ps-legacy';
  if (XBOX_ID_RE.test(p.id)) return 'xinput-legacy';
  // Unknown pad with a non-standard mapping: standard indices are still the best guess.
  return 'standard';
}

function detectBrand(p: Gamepad): PadBrand {
  if (PS_ID_RE.test(p.id)) return 'playstation';
  if (XBOX_ID_RE.test(p.id)) return 'xbox';
  return 'generic';
}

function makeEmptyIntent(): ControlIntent {
  return {
    push: false,
    brake: false,
    turn: 0,
    ollieCharge: 0,
    olliePopped: false,
    flip: false,
    flipEdge: false,
    grab: false,
    grabEdge: false,
    grabHeld: false,
    grind: false,
    grindEdge: false,
    grindHeld: false,
    spin: 0,
    dir: { x: 0, y: 0 },
    manualEdge: 'none',
    revertEdge: false,
    nollie: false,
    special: false,
    pause: false,
  };
}
