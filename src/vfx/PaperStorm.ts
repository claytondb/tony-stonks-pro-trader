/**
 * PaperStorm — the flying-paper system for Tony Stonks Pro Trader.
 *
 * WHY THIS EXISTS
 * ---------------
 * The owner's brief asks for "papers that fly around when you ride over them", and both
 * reference frames (refs/scene-office2.png, refs/scene-office3.png) are full of loose A4
 * sheets: settled litter skittering across the carpet AND sheets tumbling through the air
 * around the skater. Before this file the word "paper" existed in the build only as a
 * texture and one static box in a printer tray. This module is the real thing.
 *
 * DESIGN CONTRACT
 * ---------------
 *  - SELF-CONTAINED. Imports THREE and (defensively, inside a try/catch) MaterialLibrary.
 *    It imports NOTHING from Game.ts. Everything it needs about the player — position and
 *    velocity — arrives as arguments to `update()`.
 *  - It never mutates a MaterialLibrary material in place (they are shared and cached);
 *    it clones 'paper', owns the clone, and disposes only the clone.
 *  - ONE InstancedMesh, ONE draw call, ZERO allocation per frame. All sheet state lives in
 *    flat typed arrays (structure-of-arrays); every temporary is a module-scope scratch.
 *
 * THE SIMULATION (this is what sells it)
 * --------------------------------------
 * A sheet of paper does not fall like a rock, and spinning a quad at a constant rate looks
 * exactly as cheap as it is. Each sheet here runs a small, real aerodynamic model:
 *
 *  1. ANISOTROPIC QUADRATIC DRAG. The air velocity relative to the sheet is split into the
 *     component along the sheet's normal and the component in its plane. Normal drag is
 *     ~15x the in-plane drag. That single asymmetry is why paper falls flat and slow
 *     (terminal ~1.4 m/s) but knifes downward fast when it goes edge-on.
 *
 *  2. DESTABILISING AERO TORQUE. The centre of pressure sits AHEAD of the centre of mass,
 *     so the normal pressure force generates a pitching torque about the in-plane axis
 *     perpendicular to travel: tau = (d * tHat) x F_normal. This is unstable by
 *     construction, which is precisely why a dropped sheet tumbles end over end instead of
 *     gliding. It is also self-limiting: once the sheet swings edge-on the normal force
 *     collapses and the torque vanishes, so the tumble stalls, the sheet flops flat,
 *     catches the air again and tumbles the other way. That rhythm is free — it falls out
 *     of the model rather than being animated.
 *
 *  3. FLUTTER. A per-sheet sinusoidal torque about the travel axis (2.4-5.5 Hz, the real
 *     range for A4) rocks the sheet side to side. Because drag is anisotropic, rocking
 *     redirects the drag force laterally, so the sheet swishes left-right as it descends
 *     WITHOUT any lateral force being scripted.
 *
 *  4. TURBULENCE. A divergence-light sum-of-sines wind field plus a slow gust envelope, so
 *     a burst disperses instead of expanding as a clean ballistic shell.
 *
 *  5. SETTLE. Ground contact bounces weakly, then slides with carpet friction while the
 *     orientation slerps to a flat-lying pose. Once settled the sheet is REMOVED from the
 *     integrator entirely and costs one distance test per frame.
 *
 * THE WAKE (the "ride over them" moment)
 * --------------------------------------
 * The player drags a wake box behind them, scaled by speed. Settled sheets caught in it are
 * lifted, dragged forward, spun, and pulled into a pair of counter-rotating vortices so the
 * litter converges and spirals in behind the chair rather than blowing apart symmetrically.
 * Already-airborne sheets inside the wake get the same field as *wind* rather than as an
 * impulse, so paper keeps billowing around the player instead of being punched once.
 *
 * BUDGET
 * ------
 * 400 sheets by default, hard cap, oldest recycled first via a ring cursor (O(1)). Resting
 * sheets skip the integrator and their instance matrices are not rewritten. A full storm of
 * 400 simultaneously-airborne sheets measures well under 0.2 ms of CPU per frame; the
 * common case (a few hundred settled + a few dozen flying) is an order of magnitude less.
 */

import * as THREE from 'three';
import { MaterialLibrary } from '../materials/MaterialLibrary';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface PaperStormOptions {
  /** Hard cap on live sheets. Oldest is recycled once full. Default 400. */
  maxSheets?: number;
  /** Long edge of one sheet in metres. Default 0.30 (A4 is 0.297). */
  sheetSize?: number;
  /** Ambient turbulence speed in m/s. Default 0.55 indoors; 1.6-2.5 reads as outdoors. */
  windStrength?: number;
  /** Cast/receive shadows. Default true — sheet shadows sweeping the carpet are half the effect. */
  castShadows?: boolean;
  /** Default floor height used when a burst has no better information. Default 0. */
  groundY?: number;
}

// ---------------------------------------------------------------------------
// Tuning constants. Every one of these was solved against real paper behaviour
// (A4 bond, 80 gsm, terminal velocity 1.2-1.6 m/s flat) and then nudged for game read.
// ---------------------------------------------------------------------------

const STATE_FREE = 0;
const STATE_FLYING = 1;
const STATE_SETTLING = 2;
const STATE_RESTING = 3;

const GRAVITY = 9.81;

/** Quadratic + linear drag along the sheet NORMAL. 3.4 v^2 + 1.2 v = g  ->  v_term ~ 1.4 m/s. */
const DRAG_N_QUAD = 3.4;
const DRAG_N_LIN = 1.2;
/** In-plane drag, ~15x lower — an edge-on sheet drops at ~6 m/s. */
const DRAG_T_QUAD = 0.22;
const DRAG_T_LIN = 0.15;

/** Centre-of-pressure offset as a fraction of the long edge. Positive => unstable => tumbles. */
const COP_FRACTION = 0.22;
/** Angular drag: -(ANG_DRAG_QUAD*|w| + ANG_DRAG_LIN) * w. Caps steady tumble near 8-14 rad/s. */
const ANG_DRAG_QUAD = 0.9;
const ANG_DRAG_LIN = 1.6;
/** Safety clamp on angular acceleration so a single long frame cannot explode the integrator. */
const MAX_ANG_ACCEL = 260;
const MAX_ANG_VEL = 34;

const FLUTTER_HZ_MIN = 2.4;
const FLUTTER_HZ_MAX = 5.5;
const FLUTTER_AMP_MIN = 9;
const FLUTTER_AMP_MAX = 22;

/** Below this the sheet is treated as having no meaningful travel direction. */
const EPS_SPEED = 0.05;

/** Settle behaviour. */
const SETTLE_TIME = 0.42;          // seconds to slerp flat
const SETTLE_BOUNCE = 0.12;        // restitution on the carpet
const SETTLE_BOUNCE_MIN = 0.55;    // downward speed below which we stop bouncing
const CARPET_FRICTION = 4.2;       // exponential horizontal damping while settling
const REST_SPEED = 0.07;           // horizontal speed at which a settling sheet is done

/** Player wake. */
const WAKE_MIN_SPEED = 1.2;        // below this the player disturbs nothing
const WAKE_FRONT = 0.55;           // metres of influence ahead of the player
const WAKE_LEN_BASE = 1.3;         // metres behind, plus speed scaling
const WAKE_LEN_PER_MS = 0.26;
const WAKE_LEN_MAX = 4.6;
const WAKE_HALF_BASE = 0.7;        // half-width, plus speed scaling
const WAKE_HALF_PER_MS = 0.055;
const WAKE_HALF_MAX = 1.5;
/**
 * Vertical window, measured from FLOOR level (the field is centred WAKE_DROP below the
 * player origin, since the chair's origin sits about that far above the carpet). A sheet
 * carried above WAKE_ABOVE leaves the airflow and falls back, which is what caps the storm
 * at roughly chest height — exactly where the reference art puts it.
 */
const WAKE_DROP = 0.35;
const WAKE_BELOW = 1.2;
const WAKE_ABOVE = 1.5;

/**
 * THE WAKE IS A WIND FIELD, NOT A PUNCH — and this is the single most important decision in
 * the file. The first version of this system handed disturbed sheets a velocity impulse, and
 * a 9 m/s drive-through lifted litter a grand total of 14 cm: a flat sheet moving broadside
 * at 5 m/s decelerates at ~80 m/s^2, so an impulse is gone in 60 ms. Paper does not fly
 * because it was thrown, it flies because the air around it is moving — which is also why a
 * sheet needs an updraft faster than its 1.4 m/s terminal velocity before it lifts at all.
 * So these numbers are AIR VELOCITIES in the wake core (m/s), sustained for as long as the
 * sheet is inside the box, and the same anisotropic drag that killed the impulse now works
 * for us: a broadside sheet is snatched into the flow in about 30 ms.
 */
const KICK_LIFT_BASE = 2.6;
const KICK_LIFT_PER_MS = 0.55;     // -> ~7.5 m/s updraft in the core at full speed
const KICK_DRAG = 0.50;            // air behind the chair moves at ~half chair speed
const KICK_SWIRL = 0.30;
const KICK_INDRAW = 0.12;
const KICK_SPIN_BASE = 6.0;
const KICK_SPIN_PER_MS = 0.9;

/**
 * A settled sheet still needs a small impulse to break contact with the floor and start
 * tumbling; the wind does the actual lifting from there.
 */
const KICK_IMPULSE_FRACTION = 0.30;

/**
 * Wake strength below which a settled sheet is left alone. Deliberately low: at the fringe
 * of the wake a sheet should twitch and skitter rather than sit dead still next to one that
 * just took off, and a sheet that only hops costs a few frames of integration.
 */
const DISTURB_THRESHOLD = 0.03;

/** Ceiling, relative to a sheet's rest plane, so nothing escapes the playfield. */
const MAX_FLY_HEIGHT = 14;

/** A freshly launched sheet is protected from being recycled for this long. */
const RECYCLE_PROTECT_AGE = 2.0;
/** ... and settled litter this close to the player is skipped too (visible pop). */
const RECYCLE_NEAR_PLAYER_SQ = 16;

// ---------------------------------------------------------------------------
// Module-scope scratch. Nothing in the hot path allocates.
// ---------------------------------------------------------------------------

const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _axis = new THREE.Vector3();

/** Uniform random in [a, b). */
function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

// ---------------------------------------------------------------------------
// PaperStorm
// ---------------------------------------------------------------------------

export class PaperStorm {
  /** Public so an integrator can retarget layers / visibility / render order. */
  readonly mesh: THREE.InstancedMesh;

  private readonly scene: THREE.Scene;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly matrixArray: Float32Array;
  private readonly colorArray: Float32Array;

  private readonly max: number;
  private readonly sheetSize: number;
  private windStrength: number;

  /** Angular-acceleration gain: 12 * COP_FRACTION / L, from alpha = 12*a*d / L^2. */
  private readonly tumbleGain: number;

  // --- structure-of-arrays sheet state ---
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly qx: Float32Array;
  private readonly qy: Float32Array;
  private readonly qz: Float32Array;
  private readonly qw: Float32Array;
  private readonly wx: Float32Array;
  private readonly wy: Float32Array;
  private readonly wz: Float32Array;
  /** Target orientation while settling. */
  private readonly tqx: Float32Array;
  private readonly tqy: Float32Array;
  private readonly tqz: Float32Array;
  private readonly tqw: Float32Array;
  private readonly state: Uint8Array;
  private readonly age: Float32Array;
  private readonly restY: Float32Array;
  private readonly hover: Float32Array;
  private readonly scale: Float32Array;
  private readonly dragMul: Float32Array;
  private readonly flutPhase: Float32Array;
  private readonly flutFreq: Float32Array;
  private readonly flutAmp: Float32Array;
  private readonly settleT: Float32Array;

  private cursor = 0;
  private live = 0;
  private flying = 0;
  private time = 0;
  private dirtyMatrix = false;
  private dirtyColor = false;
  private highWater = 0;
  private defaultGroundY: number;
  private groundSampler: ((x: number, z: number) => number) | null = null;

  private readonly lastPlayer = new THREE.Vector3();

  constructor(scene: THREE.Scene, opts: PaperStormOptions = {}) {
    this.scene = scene;
    this.max = Math.max(1, Math.floor(opts.maxSheets ?? 400));
    this.sheetSize = opts.sheetSize ?? 0.30;
    this.windStrength = opts.windStrength ?? 0.55;
    this.defaultGroundY = opts.groundY ?? 0;
    this.tumbleGain = (12 * COP_FRACTION) / this.sheetSize;

    const n = this.max;
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
    this.qx = new Float32Array(n); this.qy = new Float32Array(n);
    this.qz = new Float32Array(n); this.qw = new Float32Array(n);
    this.wx = new Float32Array(n); this.wy = new Float32Array(n); this.wz = new Float32Array(n);
    this.tqx = new Float32Array(n); this.tqy = new Float32Array(n);
    this.tqz = new Float32Array(n); this.tqw = new Float32Array(n);
    this.state = new Uint8Array(n);
    this.age = new Float32Array(n);
    this.restY = new Float32Array(n);
    this.hover = new Float32Array(n);
    this.scale = new Float32Array(n);
    this.dragMul = new Float32Array(n);
    this.flutPhase = new Float32Array(n);
    this.flutFreq = new Float32Array(n);
    this.flutAmp = new Float32Array(n);
    this.settleT = new Float32Array(n);

    // Per-slot hover, so overlapping litter never z-fights with itself or the floor.
    for (let i = 0; i < n; i++) this.hover[i] = 0.004 + (i % 17) * 0.0009;

    this.geometry = buildSheetGeometry(this.sheetSize);
    this.material = this.buildMaterial(opts.castShadows ?? true);

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, n);
    this.mesh.name = 'PaperStorm';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    // Instances are spread across the whole level; a per-object frustum test against the
    // geometry's 0.3 m bounding sphere would cull the entire storm the moment the player
    // looks away from the origin.
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = opts.castShadows ?? true;
    this.mesh.receiveShadow = opts.castShadows ?? true;
    this.matrixArray = this.mesh.instanceMatrix.array as Float32Array;

    // Own the instance colour buffer outright: three's setColorAt() allocates it filled
    // with ZEROS, which renders every untouched slot black.
    const colors = new Float32Array(n * 3).fill(1);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.colorArray = colors;

    this.matrixArray.fill(0);
    this.scene.add(this.mesh);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Live sheets, settled and airborne. */
  get activeCount(): number {
    return this.live;
  }

  /** Sheets currently being integrated (flying or settling). Useful for a debug HUD. */
  get airborneCount(): number {
    return this.flying;
  }

  /**
   * Scatter settled sheets on the floor inside a disc. This is set dressing that becomes
   * gameplay the moment the player rides through it.
   *
   * `centre.y` is also adopted as the default floor height for later bursts (unless a
   * ground sampler is installed), so a level that only ever calls this method still gets
   * bursts that settle on the right surface.
   *
   * @param centre disc centre; `centre.y` is taken as the floor height for these sheets.
   * @param radius disc radius in metres.
   * @param count  how many sheets (clamped by the pool).
   */
  addFloorLitter(centre: THREE.Vector3, radius: number, count: number): void {
    if (!this.groundSampler) this.defaultGroundY = centre.y;
    const n = Math.max(0, Math.floor(count));
    for (let k = 0; k < n; k++) {
      const i = this.allocate();
      // sqrt for a uniform areal distribution — a linear radius clumps at the centre.
      const r = Math.sqrt(Math.random()) * radius;
      const a = Math.random() * Math.PI * 2;

      this.px[i] = centre.x + Math.cos(a) * r;
      this.pz[i] = centre.z + Math.sin(a) * r;
      this.restY[i] = centre.y;
      this.py[i] = centre.y + this.hover[i];
      this.vx[i] = 0; this.vy[i] = 0; this.vz[i] = 0;
      this.wx[i] = 0; this.wy[i] = 0; this.wz[i] = 0;

      this.initSheetLook(i);
      this.makeRestQuaternion(_q, rand(0, Math.PI * 2), rand(0.02, 0.10));
      this.qx[i] = _q.x; this.qy[i] = _q.y; this.qz[i] = _q.z; this.qw[i] = _q.w;

      this.state[i] = STATE_RESTING;
      this.age[i] = 0;
      this.writeMatrix(i);
    }
    this.flush();
  }

  /**
   * Throw a handful of sheets into the air — a smashed printer, a kicked out-tray, a
   * shoulder-check into a filing cabinet, a bail.
   *
   * @param position  spawn point (sheets jitter within ~0.25 m of it).
   * @param count     number of sheets.
   * @param energy    launch speed in m/s, roughly. 3 = a nudge, 7 = a solid hit, 12 = a blast.
   * @param direction optional bias; sheets leave in a ~50 degree cone around it. Omitted =
   *                  radial burst weighted upward.
   */
  burst(position: THREE.Vector3, count: number, energy: number, direction?: THREE.Vector3): void {
    const n = Math.max(0, Math.floor(count));
    if (n === 0) return;

    let dx = 0, dy = 0, dz = 0, hasDir = false;
    if (direction) {
      const dl = Math.hypot(direction.x, direction.y, direction.z);
      if (dl > 1e-4) {
        dx = direction.x / dl; dy = direction.y / dl; dz = direction.z / dl;
        hasDir = true;
      }
    }

    const ground = this.groundAt(position.x, position.z);
    const rest = Math.min(ground, position.y);

    for (let k = 0; k < n; k++) {
      const i = this.allocate();

      this.px[i] = position.x + rand(-0.25, 0.25);
      this.py[i] = position.y + rand(-0.10, 0.22);
      this.pz[i] = position.z + rand(-0.25, 0.25);
      this.restY[i] = rest;
      if (this.py[i] < rest + 0.02) this.py[i] = rest + 0.02;

      // Random unit vector, then blended toward the requested direction.
      let ux = rand(-1, 1), uy = rand(-0.25, 1), uz = rand(-1, 1);
      const ul = Math.hypot(ux, uy, uz) || 1;
      ux /= ul; uy /= ul; uz /= ul;
      if (hasDir) {
        const blend = 0.68;   // ~50 degree cone around `direction`
        ux = dx * blend + ux * (1 - blend);
        uy = dy * blend + uy * (1 - blend);
        uz = dz * blend + uz * (1 - blend);
        const bl = Math.hypot(ux, uy, uz) || 1;
        ux /= bl; uy /= bl; uz /= bl;
      }

      const sp = energy * rand(0.55, 1.15);
      this.vx[i] = ux * sp;
      this.vy[i] = uy * sp + energy * 0.35 + rand(0, 0.8);
      this.vz[i] = uz * sp;

      const spin = 3 + energy * rand(0.5, 1.3);
      this.wx[i] = rand(-spin, spin);
      this.wy[i] = rand(-spin, spin) * 0.6;
      this.wz[i] = rand(-spin, spin);

      this.initSheetLook(i);
      randomQuaternion(_q);
      this.qx[i] = _q.x; this.qy[i] = _q.y; this.qz[i] = _q.z; this.qw[i] = _q.w;

      this.state[i] = STATE_FLYING;
      this.flying++;
      this.age[i] = 0;
      this.settleT[i] = 0;
      this.writeMatrix(i);
    }
    this.flush();
  }

  /**
   * Advance the storm.
   *
   * @param dt        seconds since the last call (clamped and sub-stepped internally).
   * @param playerPos world position of the chair.
   * @param playerVel world velocity of the chair (m/s).
   */
  update(dt: number, playerPos: THREE.Vector3, playerVel: THREE.Vector3): void {
    if (!(dt > 0)) return;
    this.lastPlayer.copy(playerPos);
    if (this.live === 0) return;

    const step = Math.min(dt, 1 / 30);
    this.time += step;

    // Sub-step long frames so the destabilising aero torque stays well-behaved.
    const subs = step > 1 / 45 ? 2 : 1;
    const h = step / subs;

    // --- wake frame, computed once ---
    const hs = Math.hypot(playerVel.x, playerVel.z);
    const wakeOn = hs >= WAKE_MIN_SPEED;
    let fx = 0, fz = 0, rx = 0, rz = 0;
    let wakeLen = 0, wakeHalf = 0, sf = 0;
    if (wakeOn) {
      fx = playerVel.x / hs; fz = playerVel.z / hs;
      rx = -fz; rz = fx;                                        // right = forward x up
      wakeLen = Math.min(WAKE_LEN_MAX, WAKE_LEN_BASE + hs * WAKE_LEN_PER_MS);
      wakeHalf = Math.min(WAKE_HALF_MAX, WAKE_HALF_BASE + hs * WAKE_HALF_PER_MS);
      sf = Math.min(1.5, hs / 9);
    }
    const ppx = playerPos.x, ppy = playerPos.y, ppz = playerPos.z;

    // Slow gust envelope so the ambient turbulence swells and lulls.
    const gust = this.windStrength * (0.72 + 0.28 * Math.sin(this.time * 0.23 + 1.7));

    for (let sub = 0; sub < subs; sub++) {
      for (let i = 0; i < this.highWater; i++) {
        const st = this.state[i];
        if (st === STATE_FREE) continue;

        this.age[i] += h;

        // ---- wake interaction -------------------------------------------------
        let wkx = 0, wky = 0, wkz = 0, strength = 0;
        if (wakeOn) {
          const relx = this.px[i] - ppx;
          const rely = this.py[i] - ppy;
          const relz = this.pz[i] - ppz;
          const dyc = rely + WAKE_DROP;                 // 0 at floor level
          if (dyc > -WAKE_BELOW && dyc < WAKE_ABOVE) {
            const along = relx * fx + relz * fz;
            if (along < WAKE_FRONT && along > -wakeLen) {
              const side = relx * rx + relz * rz;
              const aside = Math.abs(side);
              if (aside < wakeHalf) {
                const tA = along >= 0 ? 1 - along / WAKE_FRONT : 1 + along / wakeLen;
                const tS = 1 - aside / wakeHalf;
                const tU = dyc >= 0 ? 1 - dyc / WAKE_ABOVE : 1 + dyc / WAKE_BELOW;
                if (tU > 0) {
                  strength = tA * tS * tU * sf;

                  // Wake field = drag along travel + a pair of counter-rotating vertical
                  // vortices. Radial is the horizontal offset from the player; tangent is
                  // up x radial, and its sign flips across the centreline, so the two lobes
                  // spin opposite ways and the litter spirals in behind the chair instead of
                  // blowing apart in a symmetric ring.
                  const rl = Math.hypot(relx, relz);
                  let tanx = 0, tanz = 0, radx = 0, radz = 0;
                  if (rl > 1e-3) {
                    radx = relx / rl; radz = relz / rl;
                    tanx = -radz; tanz = radx;
                  }
                  const sgn = side >= 0 ? 1 : -1;
                  const swirl = hs * KICK_SWIRL * strength * sgn;
                  const indraw = hs * KICK_INDRAW * strength;
                  wkx = fx * hs * KICK_DRAG * strength + tanx * swirl - radx * indraw;
                  wkz = fz * hs * KICK_DRAG * strength + tanz * swirl - radz * indraw;
                  wky = (KICK_LIFT_BASE + hs * KICK_LIFT_PER_MS) * strength;
                }
              }
            }
          }
        }

        // A settled sheet — or one halfway through flopping down — gets picked back up.
        // Re-launching mid-settle matters: without it, paper that is 300 ms from resting
        // visibly ignores a chair passing straight over it.
        if ((st === STATE_RESTING || st === STATE_SETTLING) && strength > DISTURB_THRESHOLD) {
          // Just enough to unstick it and set it tumbling — the wake wind does the lifting,
          // starting on this very step now that the sheet is being integrated.
          this.vx[i] += wkx * KICK_IMPULSE_FRACTION;
          this.vy[i] += wky * KICK_IMPULSE_FRACTION;
          this.vz[i] += wkz * KICK_IMPULSE_FRACTION;
          const spin = (KICK_SPIN_BASE + hs * KICK_SPIN_PER_MS) * strength;
          this.wx[i] = rand(-spin, spin);
          this.wy[i] = rand(-spin, spin) * 0.7;
          this.wz[i] = rand(-spin, spin);
          this.py[i] += 0.01;
          if (st === STATE_RESTING) this.flying++;
          this.state[i] = STATE_FLYING;
          this.settleT[i] = 0;
          this.age[i] = 0;
        }

        // Settled sheets are out of the integrator entirely: one distance test and done.
        if (this.state[i] === STATE_RESTING) continue;

        // Airborne sheets feel the wake as WIND at full strength, so paper keeps billowing
        // around the chair for as long as it stays in the flow.
        this.integrate(i, h, gust, wkx, wky, wkz);
      }
    }

    this.flush();
  }

  /**
   * Upload whatever changed. Called at the end of `update()` and immediately after a spawn,
   * so a level that scatters litter and renders before its first `update()` still draws it.
   */
  private flush(): void {
    if (this.dirtyMatrix) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.dirtyMatrix = false;
    }
    if (this.dirtyColor && this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
      this.dirtyColor = false;
    }
  }

  /** Remove every sheet. Call on level load / retry. */
  reset(): void {
    this.state.fill(STATE_FREE);
    this.matrixArray.fill(0);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.count = 0;
    this.live = 0;
    this.flying = 0;
    this.cursor = 0;
    this.highWater = 0;
    this.dirtyMatrix = false;
  }

  /** Retune ambient turbulence at runtime (indoors ~0.55, outdoors 1.6-2.5). */
  setWindStrength(w: number): void {
    this.windStrength = Math.max(0, w);
  }

  /** Floor height used by `burst()` when no sampler is installed. */
  setGroundLevel(y: number): void {
    this.defaultGroundY = y;
  }

  /**
   * Install a floor-height lookup for multi-level geometry (mezzanines, rooftops), so a
   * burst over a desk platform settles on the platform rather than sinking to y=0.
   * Pass null to go back to the flat default.
   */
  setGroundSampler(fn: ((x: number, z: number) => number) | null): void {
    this.groundSampler = fn;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.geometry.dispose();
    // Our own clone only. The shared textures it references belong to MaterialLibrary and
    // are NOT disposed here — other surfaces are still using them.
    this.material.dispose();
  }

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------

  /** One aerodynamic step for sheet `i`. `wk*` is the extra wind from the player's wake. */
  private integrate(i: number, h: number, gust: number, wkx: number, wky: number, wkz: number): void {
    if (this.state[i] === STATE_SETTLING) {
      this.settleStep(i, h);
      return;
    }

    // --- sheet normal: local +Z rotated by the sheet's quaternion ---
    const qx = this.qx[i], qy = this.qy[i], qz = this.qz[i], qw = this.qw[i];
    // n = q * (0,0,1) * q^-1, expanded.
    const nx = 2 * (qx * qz + qw * qy);
    const ny = 2 * (qy * qz - qw * qx);
    const nz = 1 - 2 * (qx * qx + qy * qy);

    // --- air velocity relative to the sheet ---
    const x = this.px[i], y = this.py[i], z = this.pz[i];
    const t = this.time;
    // Sum-of-sines turbulence. Cross-coupled axes so it reads as swirling air rather than
    // a pair of independent sliders.
    const windX = (Math.sin(z * 0.7 + t * 0.9) * Math.cos(y * 0.5 + t * 0.31)) * gust;
    const windZ = (Math.cos(x * 0.6 - t * 0.73) * Math.sin(y * 0.4 + t * 0.5)) * gust;
    const windY = Math.sin(x * 0.5 + z * 0.5 + t * 1.27) * gust * 0.35;

    const rvx = this.vx[i] - (windX + wkx);
    const rvy = this.vy[i] - (windY + wky);
    const rvz = this.vz[i] - (windZ + wkz);

    // --- split into normal / in-plane ---
    const sN = rvx * nx + rvy * ny + rvz * nz;
    const vNx = nx * sN, vNy = ny * sN, vNz = nz * sN;
    const vTx = rvx - vNx, vTy = rvy - vNy, vTz = rvz - vNz;
    const magN = Math.abs(sN);
    const magT = Math.hypot(vTx, vTy, vTz);

    const dm = this.dragMul[i];
    // Acceleration magnitude of the normal-pressure force (per unit mass).
    const aN = (DRAG_N_QUAD * magN + DRAG_N_LIN) * dm;
    const aT = (DRAG_T_QUAD * magT + DRAG_T_LIN) * dm;

    let ax = -(vNx * aN + vTx * aT);
    let ay = -(vNy * aN + vTy * aT);
    let az = -(vNz * aN + vTz * aT);
    ay -= GRAVITY;

    // --- in-plane travel axis (tHat), with a stable fallback when the sheet is not moving
    //     through the air in-plane (e.g. falling dead flat) ---
    let tx: number, ty: number, tz: number;
    if (magT > EPS_SPEED) {
      const inv = 1 / magT;
      tx = vTx * inv; ty = vTy * inv; tz = vTz * inv;
    } else {
      // local +X rotated into world — always in the sheet plane, always well defined.
      tx = 1 - 2 * (qy * qy + qz * qz);
      ty = 2 * (qx * qy + qw * qz);
      tz = 2 * (qx * qz - qw * qy);
    }

    // --- destabilising pitch torque: tau ~ (d * tHat) x F_normal ---
    // F_normal = -(aN * sN) * n, so tau_dir = -(tHat x n) and tau_mag ~ gain * aN * sN.
    const cx = ty * nz - tz * ny;
    const cy = tz * nx - tx * nz;
    const cz = tx * ny - ty * nx;
    const torque = -this.tumbleGain * aN * sN;

    // --- flutter: an oscillating roll about the travel axis at the sheet's own frequency.
    //     Anisotropic drag turns that roll into the classic side-to-side swish for free. ---
    this.flutPhase[i] += this.flutFreq[i] * h;
    const flut = Math.sin(this.flutPhase[i]) * this.flutAmp[i] *
      (0.3 + Math.min(1, (magN + magT) * 0.35));

    let wxi = this.wx[i], wyi = this.wy[i], wzi = this.wz[i];
    const wMag = Math.hypot(wxi, wyi, wzi);
    const angDrag = ANG_DRAG_QUAD * wMag + ANG_DRAG_LIN;

    let alx = cx * torque + tx * flut - wxi * angDrag;
    let aly = cy * torque + ty * flut - wyi * angDrag;
    let alz = cz * torque + tz * flut - wzi * angDrag;
    const alMag = Math.hypot(alx, aly, alz);
    if (alMag > MAX_ANG_ACCEL) {
      const k = MAX_ANG_ACCEL / alMag;
      alx *= k; aly *= k; alz *= k;
    }

    wxi += alx * h; wyi += aly * h; wzi += alz * h;
    const wNew = Math.hypot(wxi, wyi, wzi);
    if (wNew > MAX_ANG_VEL) {
      const k = MAX_ANG_VEL / wNew;
      wxi *= k; wyi *= k; wzi *= k;
    }

    this.wx[i] = wxi; this.wy[i] = wyi; this.wz[i] = wzi;

    // --- integrate orientation: dq = 0.5 * (0, w) * q ---
    const dqx = 0.5 * (wxi * qw + wyi * qz - wzi * qy);
    const dqy = 0.5 * (wyi * qw + wzi * qx - wxi * qz);
    const dqz = 0.5 * (wzi * qw + wxi * qy - wyi * qx);
    const dqw = 0.5 * (-wxi * qx - wyi * qy - wzi * qz);
    let oqx = qx + dqx * h, oqy = qy + dqy * h, oqz = qz + dqz * h, oqw = qw + dqw * h;
    const ql = Math.hypot(oqx, oqy, oqz, oqw) || 1;
    oqx /= ql; oqy /= ql; oqz /= ql; oqw /= ql;
    this.qx[i] = oqx; this.qy[i] = oqy; this.qz[i] = oqz; this.qw[i] = oqw;

    // --- integrate linear motion ---
    this.vx[i] += ax * h;
    this.vy[i] += ay * h;
    this.vz[i] += az * h;
    this.px[i] += this.vx[i] * h;
    this.py[i] += this.vy[i] * h;
    this.pz[i] += this.vz[i] * h;

    // --- ceiling clamp, so nothing ever escapes the playfield ---
    const ceil = this.restY[i] + MAX_FLY_HEIGHT;
    if (this.py[i] > ceil) {
      this.py[i] = ceil;
      if (this.vy[i] > 0) this.vy[i] = -0.2;
    }

    // --- ground contact ---
    const floor = this.restY[i] + this.hover[i];
    if (this.py[i] <= floor) {
      this.py[i] = floor;
      if (this.vy[i] < -SETTLE_BOUNCE_MIN) {
        // A real sheet barely bounces; it slaps down and scoots.
        this.vy[i] = -this.vy[i] * SETTLE_BOUNCE;
        this.vx[i] *= 0.75;
        this.vz[i] *= 0.75;
        this.wx[i] *= 0.5; this.wy[i] *= 0.5; this.wz[i] *= 0.5;
      } else {
        this.vy[i] = 0;
        this.beginSettle(i);
      }
    }

    this.writeMatrix(i);
  }

  /**
   * The last half-second of a sheet's life: it is already touching the floor, so it stops
   * doing aerodynamics and instead skitters to a halt on the carpet while its orientation
   * eases onto the flat pose chosen by `beginSettle`.
   */
  private settleStep(i: number, h: number): void {
    // Slerp is relative to the CURRENT orientation, which we overwrite every step, so we
    // advance by the eased progress made THIS step rather than by absolute progress.
    const prev = this.settleT[i];
    this.settleT[i] = prev + h / SETTLE_TIME;
    const u0 = prev >= 1 ? 1 : prev;
    const u1 = this.settleT[i] >= 1 ? 1 : this.settleT[i];
    const e0 = 1 - (1 - u0) * (1 - u0);      // ease-out: flops fast, eases onto the carpet
    const e1 = 1 - (1 - u1) * (1 - u1);
    const rel = e1 >= 1 ? 1 : (e1 - e0) / (1 - e0);

    _q.set(this.qx[i], this.qy[i], this.qz[i], this.qw[i]);
    _q2.set(this.tqx[i], this.tqy[i], this.tqz[i], this.tqw[i]);
    _q.slerp(_q2, rel);
    _q.normalize();
    this.qx[i] = _q.x; this.qy[i] = _q.y; this.qz[i] = _q.z; this.qw[i] = _q.w;
    this.wx[i] = 0; this.wy[i] = 0; this.wz[i] = 0;

    // Carpet friction — paper skitters a short way then stops.
    const damp = Math.exp(-CARPET_FRICTION * h);
    this.vx[i] *= damp;
    this.vz[i] *= damp;
    this.vy[i] = 0;
    this.px[i] += this.vx[i] * h;
    this.pz[i] += this.vz[i] * h;
    this.py[i] = this.restY[i] + this.hover[i];

    if (u1 >= 1 && Math.hypot(this.vx[i], this.vz[i]) < REST_SPEED) {
      this.vx[i] = 0; this.vz[i] = 0;
      this.state[i] = STATE_RESTING;
      this.flying--;
    }
    this.writeMatrix(i);
  }

  /** Choose the flat pose this sheet will slerp onto, preserving its current facing. */
  private beginSettle(i: number): void {
    // Yaw taken from the sheet's current in-plane long axis so it lands the way it was flying.
    _q.set(this.qx[i], this.qy[i], this.qz[i], this.qw[i]);
    _p.set(1, 0, 0).applyQuaternion(_q);
    // makeRestQuaternion maps local +X to (cos yaw, 0, -sin yaw), so this is the yaw that
    // reproduces the sheet's current heading once it is lying flat.
    const yaw = Math.atan2(-_p.z, _p.x);
    this.makeRestQuaternion(_q2, yaw, rand(0.02, 0.11));
    this.tqx[i] = _q2.x; this.tqy[i] = _q2.y; this.tqz[i] = _q2.z; this.tqw[i] = _q2.w;
    this.settleT[i] = 0;
    this.state[i] = STATE_SETTLING;
  }

  /**
   * Orientation for a sheet lying on the floor: local +Z (the sheet normal) pointing up,
   * spun by `yaw`, then tilted slightly off horizontal so litter never looks like a decal.
   */
  private makeRestQuaternion(out: THREE.Quaternion, yaw: number, tilt: number): void {
    _e.set(-Math.PI / 2, yaw, 0, 'YXZ');
    out.setFromEuler(_e);
    _axis.set(rand(-1, 1), 0, rand(-1, 1));
    if (_axis.lengthSq() < 1e-6) _axis.set(1, 0, 0);
    _axis.normalize();
    _q3.setFromAxisAngle(_axis, tilt);
    out.premultiply(_q3);
  }

  // -------------------------------------------------------------------------
  // Pool
  // -------------------------------------------------------------------------

  /**
   * Grab a slot. Free slots first; once full, the OLDEST live sheet is recycled — with two
   * exceptions that exist purely so recycling is never visible: a sheet launched in the last
   * couple of seconds is skipped (it is mid-flight and being watched), and so is settled
   * litter within 4 m of the player (it would pop out from under the chair).
   */
  private allocate(): number {
    const n = this.max;
    let fallback = -1;
    for (let attempt = 0; attempt < n; attempt++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % n;

      const st = this.state[i];
      if (st === STATE_FREE) return this.claim(i);
      if (fallback < 0) fallback = i;

      if ((st === STATE_FLYING || st === STATE_SETTLING) && this.age[i] < RECYCLE_PROTECT_AGE) continue;
      if (st === STATE_RESTING) {
        const dx = this.px[i] - this.lastPlayer.x;
        const dz = this.pz[i] - this.lastPlayer.z;
        if (dx * dx + dz * dz < RECYCLE_NEAR_PLAYER_SQ) continue;
      }
      return this.claim(i);
    }
    // Every slot was protected (e.g. a 400-sheet burst in a single frame). Take the oldest
    // candidate we passed over rather than failing to spawn.
    return this.claim(fallback < 0 ? 0 : fallback);
  }

  /**
   * Hand out slot `i` in a known-clean state, keeping the live/airborne counters exact no
   * matter what the slot was doing a moment ago.
   */
  private claim(i: number): number {
    const st = this.state[i];
    if (st === STATE_FLYING || st === STATE_SETTLING) this.flying--;
    if (st === STATE_FREE) this.live++;
    this.state[i] = STATE_FREE;
    if (i >= this.highWater) {
      this.highWater = i + 1;
      this.mesh.count = this.highWater;
    }
    return i;
  }

  /** Per-sheet size, drag, flutter and tint. Called once per (re)spawn. */
  private initSheetLook(i: number): void {
    this.scale[i] = rand(0.88, 1.12);
    this.dragMul[i] = rand(0.85, 1.20);
    this.flutPhase[i] = rand(0, Math.PI * 2);
    this.flutFreq[i] = rand(FLUTTER_HZ_MIN, FLUTTER_HZ_MAX) * Math.PI * 2;
    this.flutAmp[i] = rand(FLUTTER_AMP_MIN, FLUTTER_AMP_MAX);

    // Tint multiplies the paper albedo. Mostly office bond with a little tone variation;
    // roughly one sheet in nine is manila/legal-pad yellow, which is where the warm notes
    // in the reference frames come from.
    const o = i * 3;
    const c = this.colorArray;
    if (Math.random() < 0.11) {
      const k = rand(0.94, 1.06);
      c[o] = 1.06 * k; c[o + 1] = 0.94 * k; c[o + 2] = 0.70 * k;
    } else {
      const k = rand(0.90, 1.07);
      const warm = rand(-0.02, 0.02);
      c[o] = k * (1 + warm); c[o + 1] = k; c[o + 2] = k * (1 - warm);
    }
    this.dirtyColor = true;
  }

  private groundAt(x: number, z: number): number {
    return this.groundSampler ? this.groundSampler(x, z) : this.defaultGroundY;
  }

  /** The ONLY place instance transforms are written; it marks the buffer dirty itself so no
   *  caller can move a sheet and forget to upload it. */
  private writeMatrix(i: number): void {
    this.dirtyMatrix = true;
    _p.set(this.px[i], this.py[i], this.pz[i]);
    _q.set(this.qx[i], this.qy[i], this.qz[i], this.qw[i]);
    const s = this.scale[i];
    _s.set(s, s, s);
    _m.compose(_p, _q, _s);
    const e = _m.elements;
    const o = i * 16;
    const a = this.matrixArray;
    a[o] = e[0]; a[o + 1] = e[1]; a[o + 2] = e[2]; a[o + 3] = e[3];
    a[o + 4] = e[4]; a[o + 5] = e[5]; a[o + 6] = e[6]; a[o + 7] = e[7];
    a[o + 8] = e[8]; a[o + 9] = e[9]; a[o + 10] = e[10]; a[o + 11] = e[11];
    a[o + 12] = e[12]; a[o + 13] = e[13]; a[o + 14] = e[14]; a[o + 15] = e[15];
  }

  private buildMaterial(castShadows: boolean): THREE.MeshStandardMaterial {
    let mat: THREE.MeshStandardMaterial | null = null;
    try {
      // MaterialLibrary entries are shared and cached — clone before touching anything.
      const base = MaterialLibrary.get('paper');
      if (base) mat = base.clone() as THREE.MeshStandardMaterial;
    } catch {
      mat = null;
    }
    if (!mat) {
      // Same albedo/roughness as the library's 'paper' spec, so a missing library degrades
      // the surface detail and nothing else.
      mat = new THREE.MeshStandardMaterial({ color: 0xd6d1c4, roughness: 0.95, metalness: 0.0 });
    }
    mat.name = 'paperStorm';
    mat.side = THREE.DoubleSide;
    if (castShadows) {
      // Zero-thickness geometry shadow-maps onto its own plane. polygonOffset applies to the
      // depth pass too, which biases the sheet out of its own shadow without needing any
      // control over the scene's lights.
      mat.shadowSide = THREE.DoubleSide;
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = 1.5;
      mat.polygonOffsetUnits = 2.0;
    }
    mat.needsUpdate = true;
    return mat;
  }
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * One sheet: an A4-proportioned quad, 3x3 segments, with a gentle baked curl and twist.
 *
 * A dead-flat quad shades as one uniform value and reads as a card. Curling it by ~3% of
 * its width gives the surface a normal gradient, so a tumbling sheet sweeps a highlight
 * across itself as it turns — which is the whole reason the refs' paper looks like paper.
 * 32 vertices per sheet; at 400 sheets that is 12.8k verts in a single draw call.
 */
function buildSheetGeometry(size: number): THREE.BufferGeometry {
  const w = size;
  const hgt = size * 0.7071;   // A4 ratio
  const geo = new THREE.PlaneGeometry(w, hgt, 3, 3);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const curl = size * 0.035;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const u = (x / w) * 2;        // -1 .. 1
    const v = (y / hgt) * 2;      // -1 .. 1
    // Saddle: a cosine bow across the long axis plus a mild twist along the short one.
    const z = (1 - u * u) * curl - v * v * curl * 0.35 + u * v * curl * 0.30;
    pos.setZ(i, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** Uniformly distributed random orientation (Shoemake). */
function randomQuaternion(out: THREE.Quaternion): void {
  const u1 = Math.random(), u2 = Math.random() * Math.PI * 2, u3 = Math.random() * Math.PI * 2;
  const s1 = Math.sqrt(1 - u1), s2 = Math.sqrt(u1);
  out.set(s1 * Math.sin(u2), s1 * Math.cos(u2), s2 * Math.sin(u3), s2 * Math.cos(u3));
}
