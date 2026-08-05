/**
 * Camera Controller
 *
 * In a Tony Hawk game the camera is a gameplay system, not a viewport. It sells speed,
 * keeps the line readable, and tells the player what is about to matter. This file is
 * therefore a small state machine, not a follow-cam:
 *
 *   cruise  — the default line-reading rig. Low and close at speed, tight yaw at walking
 *             pace so the chair is controllable.
 *   air     — pulls BACK and DROPS so the trick reads against the ceiling. Dutch roll is
 *             suppressed here because in the air the chair's yaw rate is a spin trick, not
 *             a turn, and rolling with it just makes the frame tumble.
 *   grind   — swings out to the side and looks further down the line, so the RAIL is the
 *             subject of the shot and the player can see where the grind ends.
 *   manual  — pulls in low and tight. A manual is a balance minigame; the player needs the
 *             chair big in frame and the ground close for the pitch to be legible.
 *   bail    — breaks from the follow rig entirely. See `startBail()`.
 *
 * Every one of those is a `Framing` record; the live framing is a damped blend toward the
 * active state's record, so a state change can never pop and two states can never fight —
 * there is exactly one set of numbers driving the rig at any instant.
 */

import * as THREE from 'three';

/**
 * Frame-rate-independent smoothing factor.
 *
 * Every smoothing term in this file used to be written `lerp(target, k * dt)`, which is
 * only stable while `k * dt < 1`. At 60fps and k=30 that is 0.5 and looks fine — but a
 * single long frame (level load, GC pause, a slower machine, a backgrounded tab) makes
 * `k * dt` exceed 1, and lerp then OVERSHOOTS the target and oscillates. That is what
 * made the camera swing when the chair turned.
 *
 * `1 - exp(-k * dt)` is the exact solution to the same exponential decay. It approaches 1
 * but never reaches or exceeds it, so it cannot overshoot at any frame rate, and the
 * perceived smoothing speed is identical regardless of dt.
 *
 * EVERY smoothing term added to this file from here on must go through this function.
 */
function damp(k: number, dt: number): number {
  return 1 - Math.exp(-k * dt);
}

/** Camera-local forward axis, reused for the dutch-roll quaternion. */
const FORWARD_AXIS = /*@__PURE__*/ new THREE.Vector3(0, 0, 1);
const UP_AXIS = /*@__PURE__*/ new THREE.Vector3(0, 1, 0);

/** Shortest signed angular difference, wrapped to [-pi, pi]. */
function angleDelta(to: number, from: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Which rig is driving the frame. `bail` is an overlay, so it is not in this union. */
type RideState = 'cruise' | 'air' | 'grind' | 'manual';

/**
 * One complete camera framing. Everything the rig needs is in here, so blending states
 * is a single loop over these fields and no two systems can ever pull the same number in
 * two directions at once.
 */
interface Framing {
  /** Boom length behind the chair, metres. */
  dist: number;
  /** Boom height above the chair, metres. */
  height: number;
  /** Boom offset along the chair's right, metres. Breaks the one-point-perspective. */
  lateral: number;
  /** Height of the look-at point above the chair. dist/(height-lookHeight) sets the pitch. */
  lookHeight: number;
  /** Look-at offset along the chair's right. Smaller than `lateral`, so the vanishing
   *  point sits off-centre instead of the whole shot sliding sideways. */
  lookLateral: number;
  /** How far ahead of the chair to aim. Higher = more road, more speed. */
  lookAhead: number;
  /** Damping rate at which the boom's yaw chases the chair's yaw. Higher = tighter. */
  yawFollow: number;
  /** Hard cap on how far the boom may trail the chair, radians. */
  yawLag: number;
  /** Damping rate for camera position. */
  posFollow: number;
  /** Degrees added to the speed-derived FOV. */
  fovBias: number;
  /** Multiplier on the dutch roll. */
  rollScale: number;
  /** How strongly the speed shaping below applies in this state. */
  speedShape: number;
}

/**
 * The framing table. These are the whole look of the game's camera; everything else in
 * this file is machinery for getting between them without popping.
 */
const FRAMING: Record<RideState, Framing> = {
  // The baseline. 58 deg vertical fov (~85 horizontal) is a skate lens, not a fisheye;
  // a look-at ~1.05 m below the camera over a 3.4 m boom is ~17 deg of downward pitch,
  // which puts the ceiling line in the top ~20% of frame instead of giving away 40% of
  // the screen to untextured tile.
  cruise: {
    dist: 3.40, height: 1.70, lateral: 0.50,
    lookHeight: 0.66, lookLateral: 0.16, lookAhead: 0.50,
    yawFollow: 7.0, yawLag: 0.60, posFollow: 18,
    fovBias: 0, rollScale: 1.0, speedShape: 1.0,
  },
  // Back and down. The drop is the important half: from below the chair's own height the
  // rider breaks the ceiling line and a flip reads as a silhouette instead of a smudge.
  // Yaw follow is loosened a lot because a spin should sweep the world past the lens.
  air: {
    dist: 4.15, height: 1.24, lateral: 0.34,
    lookHeight: 0.98, lookLateral: 0.10, lookAhead: 0.12,
    yawFollow: 4.0, yawLag: 0.95, posFollow: 13,
    fovBias: 3.0, rollScale: 0.15, speedShape: 0.35,
  },
  // Swung out and aimed down the line. `lookAhead` is what makes a grind readable: the
  // subject of the shot is the rest of the rail, not the chair sitting on it.
  grind: {
    dist: 3.75, height: 1.46, lateral: 0.98,
    lookHeight: 0.72, lookLateral: 0.34, lookAhead: 1.35,
    yawFollow: 5.0, yawLag: 0.78, posFollow: 15,
    fovBias: -1.5, rollScale: 0.7, speedShape: 0.6,
  },
  // In, low, and tight. The balance meter is on the HUD but the read the player actually
  // uses is the chair's pitch against the floor, so put the floor in frame.
  manual: {
    dist: 2.95, height: 1.22, lateral: 0.42,
    lookHeight: 0.58, lookLateral: 0.14, lookAhead: 0.95,
    yawFollow: 9.0, yawLag: 0.42, posFollow: 20,
    fovBias: 1.5, rollScale: 1.1, speedShape: 1.0,
  },
};

const FRAMING_KEYS: (keyof Framing)[] = [
  'dist', 'height', 'lateral', 'lookHeight', 'lookLateral', 'lookAhead',
  'yawFollow', 'yawLag', 'posFollow', 'fovBias', 'rollScale', 'speedShape',
];

function cloneFraming(f: Framing): Framing {
  return { ...f };
}

/**
 * Smooth, deterministic 1-D noise in [-1, 1].
 *
 * Deliberately NOT Math.random(): per-frame white noise reads as pixel crawl rather than
 * an impact, and — more importantly — the play harness measures flow by stepping the game
 * deterministically, so a camera that draws from the global RNG would perturb every other
 * consumer of it and make the flow benchmark irreproducible. Two incommensurable sines
 * give a shake that is smooth, loops on no audible period, and costs nothing.
 */
function shakeNoise(t: number, seed: number): number {
  return Math.sin(t * 27.3 + seed * 1.7) * 0.62 + Math.sin(t * 41.9 + seed * 4.1) * 0.38;
}

export class CameraController {
  /**
   * Set false to stop the controller writing to the camera at all, leaving an
   * external owner (the screenshot harness, a cutscene) in control of it.
   */
  enabled = true;

  private camera: THREE.PerspectiveCamera;
  private target: THREE.Object3D | null = null;

  // ---- state machine --------------------------------------------------------
  private rideState: RideState = 'cruise';
  private airborne = false;
  private airTimeSec = 0;
  private grinding = false;
  private manualing = false;
  /** The live, blended framing. Nothing downstream reads FRAMING directly. */
  private frame: Framing = cloneFraming(FRAMING.cruise);
  /** How fast the rig moves between framings. Fast enough to feel like a cut motivated
   *  by the trick, slow enough that it is a move and not a jump. */
  private framingBlend = 8;

  /** Baseline boom, kept for setZoom() and for the NaN re-seed. */
  private offset = new THREE.Vector3(0, 1.7, -3.4);
  private zoomScale = 1;

  // ---- yaw trailing ---------------------------------------------------------
  // The boom used to be rotated by the chair's yaw directly, so the camera was welded
  // to the chair and inherited every bit of its angular velocity — turn the chair at
  // 258 deg/s and the entire view rotated at 258 deg/s. THPS cameras TRAIL: the boom
  // lags the board through a turn and catches up on the way out, which is what makes a
  // fast turn readable instead of nauseating.
  //
  // `camYaw` is the boom's own yaw. It damps toward the chair's yaw and is hard-limited
  // to the framing's `yawLag` radians behind it, so it always catches up but never snaps.
  //
  // The lag is then modulated by SPEED as well as by state: tight at walking pace, where
  // the player is placing the chair and needs the camera to be an extension of the input,
  // and progressively looser at speed, where the trail is the drama.
  private camYaw = 0;
  private hasCamYaw = false;

  // ---- FOV ------------------------------------------------------------------
  private baseFOV = 58;      // vertical; ~85 deg horizontal at 16:9
  private maxFOV = 72;       // FOV at max speed
  private currentFOV = 58;
  private targetFOV = 58;
  private fovSmoothSpeed = 6;
  /** Everything that touches FOV is summed once, here, and clamped once. */
  private readonly minRenderFOV = 42;
  private readonly maxRenderFOV = 90;

  // ---- dutch roll -----------------------------------------------------------
  // A still frame has to sell velocity on its own. Rolling the camera into turns by
  // a few degrees is the cheapest, most legible speed cue there is.
  private lastSpeed = 0;
  private prevTargetYaw = 0;
  private hasPrevYaw = false;
  private rollCurrent = 0;
  private readonly maxRoll = 0.075;   // ~4.3 degrees
  private readonly rollQuat = new THREE.Quaternion();

  // Current state
  private currentOffset = new THREE.Vector3();
  private currentLookAt = new THREE.Vector3();

  // ---- shake ----------------------------------------------------------------
  private shakeIntensity = 0;
  private shakeDuration = 0;
  private shakeTimeRemaining = 0;
  private shakeClock = 0;
  private shakeOffset = new THREE.Vector3();

  // ---- boom collision -------------------------------------------------------
  // Nothing may ever put the camera inside geometry. `occlusionProbe` is injected by the
  // game (it wraps the physics world's ray cast) so this file stays free of any physics
  // dependency and degrades to "no collision" in the screenshot harness.
  private occlusionProbe: ((origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number) => number | null) | null = null;
  /** Fraction of the boom currently permitted, 1 = clear. */
  private boomScale = 1;
  /** Never let the boom collapse entirely; at 0.22 the camera is still outside the chair. */
  private readonly minBoomScale = 0.22;
  /** Keep this much clear of the wall. near is 0.3, so 0.42 never clips the plane. */
  private readonly boomMargin = 0.42;
  /** Pull IN fast (a frame of wall in shot is a bug); ease back OUT slowly (a pop is a bug too). */
  private readonly boomInRate = 26;
  private readonly boomOutRate = 3.2;

  // ---- bail rig -------------------------------------------------------------
  private bailTimer = 0;
  private bailBlend = 0;
  private bailPivot = new THREE.Vector3();
  private bailAngle = 0;
  private bailRadius = 4;
  private bailHeight = 1.3;
  private bailDrift = 0.55;
  private bailElapsed = 0;

  // Mouse orbit state
  private isDragging = false;
  private orbitAngleX = 0;  // Horizontal orbit (yaw)
  private orbitAngleY = 0;  // Vertical orbit (pitch)
  private targetOrbitX = 0;
  private targetOrbitY = 0;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private orbitSensitivity = 0.003;
  private orbitReturnSpeed = 8;  // Very fast snap back — always behind player
  private maxOrbitY = Math.PI / 6;  // Minimal vertical orbit
  private minOrbitY = -Math.PI / 12;

  // ---- scratch --------------------------------------------------------------
  // update() runs every frame; these exist so it allocates nothing.
  private _desiredOffset = new THREE.Vector3();
  private _desiredPos = new THREE.Vector3();
  private _followPos = new THREE.Vector3();
  private _desiredLookAt = new THREE.Vector3();
  private _followLookAt = new THREE.Vector3();
  private _forward = new THREE.Vector3();
  private _right = new THREE.Vector3();
  private _pivot = new THREE.Vector3();
  private _probeDir = new THREE.Vector3();
  private _probeTo = new THREE.Vector3();
  private _boomVec = new THREE.Vector3();
  private _whiskerRight = new THREE.Vector3();
  private _euler = new THREE.Euler();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.currentOffset.copy(this.offset);
  }

  /**
   * Set up mouse event listeners for orbit control
   */
  setupMouseControls(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) {  // Left or right click
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      }
    });

    canvas.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    canvas.addEventListener('mouseleave', () => {
      this.isDragging = false;
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;

      const deltaX = e.clientX - this.lastMouseX;
      const deltaY = e.clientY - this.lastMouseY;

      this.targetOrbitX += deltaX * this.orbitSensitivity;
      this.targetOrbitY += deltaY * this.orbitSensitivity;

      // Clamp vertical orbit
      this.targetOrbitY = Math.max(this.minOrbitY, Math.min(this.maxOrbitY, this.targetOrbitY));

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    // Prevent context menu on right click
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * Reset orbit to default view
   */
  resetOrbit(): void {
    this.targetOrbitX = 0;
    this.targetOrbitY = 0;
  }

  /**
   * Inject the world-occlusion test used by the boom collision whisker.
   *
   * Contract: cast a ray from `origin` along the unit vector `dir` for at most `maxDist`
   * metres and return the distance to the first hit, or null for a clear line. The game
   * wires this to the physics world with the player's own body excluded.
   */
  setOcclusionProbe(
    probe: ((origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number) => number | null) | null,
  ): void {
    this.occlusionProbe = probe;
  }

  setTarget(target: THREE.Object3D): void {
    this.target = target;

    // Initialize camera position
    if (target) {
      this.currentLookAt.copy(target.position);
      this.camera.position.copy(target.position).add(this.offset);
      // Re-seed the trailing yaw on the next update rather than swinging round from
      // whatever the previous target's heading was.
      this.hasCamYaw = false;
      this.hasPrevYaw = false;
      this.rollCurrent = 0;
      this.boomScale = 1;
      this.bailTimer = 0;
      this.bailBlend = 0;
      this.frame = cloneFraming(FRAMING.cruise);
    }
  }

  // ===========================================================================
  // State inputs (called by the game once per frame)
  // ===========================================================================

  /**
   * Air state. Named `setTrickZoom` because that is what the game already calls; it is
   * now the AIR STATE input, and the pull-back it used to apply as a separate zoom
   * multiplier is folded into the `air` framing so the two can never fight.
   * @param isAirborne - Whether player is in the air
   * @param airTime - Time in air. Milliseconds (the game's own unit) or seconds; both work.
   */
  setTrickZoom(isAirborne: boolean, airTime: number = 0): void {
    this.airborne = isAirborne;
    // The game stores airTime in ms. Anything above 5 cannot be seconds of hangtime.
    this.airTimeSec = isAirborne ? (airTime > 5 ? airTime / 1000 : airTime) : 0;
  }

  /** Reset trick zoom to default */
  resetTrickZoom(): void {
    this.airborne = false;
    this.airTimeSec = 0;
  }

  /** Manual/nose-manual state: pulls the rig in low and tight. */
  setManualing(isManualing: boolean): void {
    this.manualing = isManualing;
  }

  /**
   * Update FOV based on player speed
   * Creates a sense of velocity - wider FOV when moving fast
   * @param speed - Current player speed (0 to maxSpeed)
   * @param maxSpeed - Speed at which FOV reaches maximum (e.g., 18)
   */
  updateFOVFromSpeed(speed: number, maxSpeed: number = 18): void {
    this.lastSpeed = speed;
    this.speedRatio = Math.min(Math.max(speed / maxSpeed, 0), 1);

    // Ease, but not as a pure square — squaring meant the FOV ramp, like the radial
    // blur, only arrived at terminal velocity and was invisible at cruise.
    const easedRatio = Math.pow(this.speedRatio, 1.35);

    // Interpolate between base and max FOV
    this.targetFOV = this.baseFOV + (this.maxFOV - this.baseFOV) * easedRatio;
  }

  /** 0..1 speed, shared by the FOV ramp, the framing shaping and the speed rumble. */
  private speedRatio = 0;

  /** Reset FOV to default (for menus, pauses, etc.) */
  resetFOV(): void {
    this.targetFOV = this.baseFOV;
  }

  /**
   * Zoom in/out
   */
  setZoom(zoom: number): void {
    // Scaled from the same framing baseline as the cruise record, not from the old
    // 4.2/2.2 pair, or calling setZoom(1) would silently undo the whole composition fix.
    this.zoomScale = zoom;
    this.offset.z = -FRAMING.cruise.dist * zoom;
    this.offset.y = FRAMING.cruise.height * zoom;
  }

  // ===========================================================================
  // The main update
  // ===========================================================================

  update(dt: number): void {
    if (!this.enabled) return;
    if (!this.target) return;
    // A pathological frame (tab restore, breakpoint) should not be integrated literally.
    // damp() is stable at any dt, but the bail clock and the shake are not interesting
    // when advanced by a whole second.
    if (!(dt > 0)) return;
    if (dt > 0.25) dt = 0.25;

    // Smoothly return orbit to default when not dragging.
    // This was `*= (1 - orbitReturnSpeed * dt)`, which goes NEGATIVE once dt exceeds
    // 1/orbitReturnSpeed (0.125s here) — flipping the sign of the orbit angle every
    // frame and turning the return-to-centre into an oscillator. Exponential decay
    // cannot change sign.
    if (!this.isDragging) {
      const keep = Math.exp(-this.orbitReturnSpeed * dt);
      this.targetOrbitX *= keep;
      this.targetOrbitY *= keep;
    }

    // Smooth orbit angle transitions
    const orbitK = damp(5, dt);
    this.orbitAngleX += (this.targetOrbitX - this.orbitAngleX) * orbitK;
    this.orbitAngleY += (this.targetOrbitY - this.orbitAngleY) * orbitK;

    // ---- 1. resolve the ride state and blend the framing ---------------------
    this.rideState = this.grinding ? 'grind'
      : this.airborne ? 'air'
      : this.manualing ? 'manual'
      : 'cruise';

    const want = FRAMING[this.rideState];
    // Leaving the air is a landing: snap back a little harder than a normal blend so the
    // rig is home by the time the player is looking for the next feature.
    const blendK = this.framingBlend * (this.rideState === 'air' ? 0.85 : 1.15);
    const fk = damp(blendK, dt);
    for (const key of FRAMING_KEYS) {
      this.frame[key] += (want[key] - this.frame[key]) * fk;
    }

    // Deeper air = further back. Hangtime is the reward, so let the shot open up with it.
    const airDepth = this.airborne ? Math.min(this.airTimeSec / 0.55, 1) : 0;
    const airPull = airDepth * airDepth * 0.55;

    // ---- 2. speed shaping ----------------------------------------------------
    // "Low and close at speed." The camera drops and tucks in, and the aim point runs
    // further ahead, so the frame fills with oncoming floor instead of trailing chair.
    // The look-at drops with the camera so the pitch stays near 15 deg and the ceiling
    // never takes the frame back.
    const sr = this.speedRatio;
    const shape = this.frame.speedShape;
    const dist = (this.frame.dist + airPull - 0.25 * sr * shape) * this.zoomScale;
    const height = (this.frame.height - 0.30 * sr * shape) * this.zoomScale;
    const lookHeight = this.frame.lookHeight - 0.12 * sr * shape;
    const lookAhead = this.frame.lookAhead + 1.0 * sr * shape;

    // ---- 3. yaw trail --------------------------------------------------------
    // Tighter at low speed for control, looser at high speed for drama.
    const yawFollow = this.frame.yawFollow * (1 - 0.45 * sr);
    const yawLag = this.frame.yawLag * (1 + 0.30 * sr);

    const targetRotationY = this._euler.setFromQuaternion(this.target.quaternion, 'YXZ').y;

    if (!this.hasCamYaw) {
      this.camYaw = targetRotationY;
      this.hasCamYaw = true;
    }
    this.camYaw += angleDelta(targetRotationY, this.camYaw) * damp(yawFollow, dt);
    const lag = angleDelta(targetRotationY, this.camYaw);
    if (lag > yawLag) this.camYaw = targetRotationY - yawLag;
    else if (lag < -yawLag) this.camYaw = targetRotationY + yawLag;

    // ---- 4. build the boom ---------------------------------------------------
    this._desiredOffset.set(this.frame.lateral, height, -dist);
    this._desiredOffset.applyAxisAngle(UP_AXIS, this.camYaw);
    this._desiredOffset.applyAxisAngle(UP_AXIS, this.orbitAngleX);

    // Grind swing: rotate the boom around to put the rail line across the frame.
    this.updateGrindCamera(dt);
    if (Math.abs(this.grindCameraAngle) > 0.001) {
      this._desiredOffset.applyAxisAngle(UP_AXIS, this.grindCameraAngle);
    }

    // Vertical orbit (pitch) — rotate around the horizontal axis perpendicular to offset
    if (Math.abs(this.orbitAngleY) > 0.0005) {
      this._right.set(-this._desiredOffset.z, 0, this._desiredOffset.x).normalize();
      this._desiredOffset.applyAxisAngle(this._right, this.orbitAngleY);
    }

    // Smooth offset transition (the boom's own swing, separate from the chase)
    this.currentOffset.lerp(this._desiredOffset, damp(14, dt));

    // ---- 5. boom collision ---------------------------------------------------
    // Applied AFTER the boom smoothing and BEFORE the position chase, so a pull-in is a
    // change to the boom's LENGTH rather than a fight with the follow spring.
    //
    // The pivot is a point inside the rider, at roughly the height the lens is aimed at.
    // Casting from the chair's origin instead would start the ray in the floor.
    this._pivot.copy(this.target.position);
    this._pivot.y += lookHeight + 0.30;
    // The real boom is pivot -> (chair + offset), which is not `currentOffset` itself:
    // the pivot is raised above the chair, so the vertical component differs.
    this._boomVec.copy(this.target.position).add(this.currentOffset).sub(this._pivot);
    this.applyBoomCollision(dt);

    // Sliding the lens down the boom toward the pivot is what a pull-in IS.
    this._followPos.copy(this._pivot).addScaledVector(this._boomVec, this.boomScale);

    // ---- 6. look-at ----------------------------------------------------------
    this._forward.set(0, 0, 1).applyQuaternion(this.target.quaternion);
    this._right.set(1, 0, 0).applyQuaternion(this.target.quaternion);
    this._followLookAt.copy(this.target.position)
      .addScaledVector(UP_AXIS, lookHeight)
      .addScaledVector(this._right, this.frame.lookLateral)
      .addScaledVector(this._forward, lookAhead);

    // ---- 7. the bail overlay -------------------------------------------------
    const posFollow = this.updateBail(dt);

    // ---- 8. chase ------------------------------------------------------------
    this.camera.position.lerp(this._desiredPos, damp(posFollow, dt));
    this.currentLookAt.lerp(this._desiredLookAt, damp(posFollow, dt));

    // ---- 9. shake ------------------------------------------------------------
    this.applyShake(dt);

    // ---- 10. orientation -----------------------------------------------------
    this.camera.lookAt(this.currentLookAt);
    this.applyRoll(dt, targetRotationY);

    // ---- 11. hard anti-clip --------------------------------------------------
    // The damped boom scale is what stops the camera POPPING; this is what stops it ever
    // being INSIDE something. It runs on the final, shaken, post-chase position, so no
    // later stage can put geometry between the lens and the player.
    this.enforceNoClip();

    // Last line of defence. A single NaN anywhere upstream (a degenerate normalize, a
    // divide by a zero dt) propagates into the camera transform and never clears itself,
    // because every subsequent frame lerps from the poisoned value. Detect it and
    // re-seed from the target rather than leaving the player with a broken view.
    if (
      !Number.isFinite(this.camera.position.x) ||
      !Number.isFinite(this.camera.position.y) ||
      !Number.isFinite(this.camera.position.z) ||
      !Number.isFinite(this.currentLookAt.x) ||
      !Number.isFinite(this.currentOffset.x) ||
      !Number.isFinite(this.boomScale)
    ) {
      console.warn('[CameraController] non-finite transform — re-seeding from target');
      this.currentOffset.copy(this.offset);
      this.currentLookAt.copy(this.target.position);
      this.camera.position.copy(this.target.position).add(this.offset);
      this.camera.up.set(0, 1, 0);
      this.camera.quaternion.identity();
      this.rollCurrent = 0;
      this.boomScale = 1;
      this.bailBlend = 0;
      this.bailTimer = 0;
      this.hasCamYaw = false;
      this.hasPrevYaw = false;
      this.frame = cloneFraming(FRAMING.cruise);
      this.camera.lookAt(this.currentLookAt);
    }

    // ---- 12. FOV -------------------------------------------------------------
    // ONE sum, ONE clamp. Speed ramp, state bias, bail widen and the landing punch all
    // land here as addends so they cannot cancel or stack into a fisheye.
    this.updateImpactZoom(dt);
    const effectiveFOV = THREE.MathUtils.clamp(
      this.targetFOV + this.frame.fovBias + this.bailBlend * 5 - this.impactZoomCurrent,
      this.minRenderFOV,
      this.maxRenderFOV,
    );
    this.currentFOV += (effectiveFOV - this.currentFOV) * damp(this.fovSmoothSpeed, dt);
    this.camera.fov = this.currentFOV;
    this.camera.updateProjectionMatrix();
  }

  // ===========================================================================
  // Boom collision
  // ===========================================================================

  /**
   * Whisker test. Three rays from a pivot inside the player out to where the camera wants
   * to be — one down the boom and one to each side — so a corner post catches the boom
   * before it slides behind the wall rather than after.
   *
   * Pulling in is fast and pushing out is slow, which is the whole trick: the player
   * never sees a wall, and never sees the camera snap back out of one either.
   */
  private applyBoomCollision(dt: number): void {
    let allowed = 1;

    if (this.occlusionProbe) {
      const len = this._boomVec.length();
      if (len > 0.05) {
        // Horizontal perpendicular to the boom, for the two side whiskers.
        this._whiskerRight.set(-this._boomVec.z, 0, this._boomVec.x);
        const wlen = this._whiskerRight.length();
        if (wlen > 1e-4) this._whiskerRight.divideScalar(wlen);
        else this._whiskerRight.set(1, 0, 0);

        for (let i = -1; i <= 1; i++) {
          this._probeTo.copy(this._pivot)
            .add(this._boomVec)
            .addScaledVector(this._whiskerRight, i * 0.45);
          this._probeDir.copy(this._probeTo).sub(this._pivot);
          const d = this._probeDir.length();
          if (d < 1e-4) continue;
          this._probeDir.divideScalar(d);

          const hit = this.occlusionProbe(this._pivot, this._probeDir, d + this.boomMargin);
          if (hit === null || !Number.isFinite(hit)) continue;
          // A hit right on top of the origin means the PIVOT is embedded in geometry —
          // the chair has been shoved into a desk. There is no useful boom length in that
          // case, and collapsing to the minimum would slam the lens into the rider, so
          // ignore the whisker and let the rig ride it out.
          if (hit < 0.15) continue;
          const ratio = Math.max(0, hit - this.boomMargin) / d;
          if (ratio < allowed) allowed = ratio;
        }
      }
    }

    allowed = THREE.MathUtils.clamp(allowed, this.minBoomScale, 1);
    const rate = allowed < this.boomScale ? this.boomInRate : this.boomOutRate;
    this.boomScale += (allowed - this.boomScale) * damp(rate, dt);
    this.boomScale = THREE.MathUtils.clamp(this.boomScale, this.minBoomScale, 1);
  }

  /**
   * Absolute guarantee, run on the final transform: if there is world between the pivot
   * and the lens, move the lens to just this side of it. Undamped on purpose — by the
   * time this binds, a pop is strictly better than a wall filling the screen. In practice
   * the damped boom scale above means it almost never does.
   */
  private enforceNoClip(): void {
    if (!this.occlusionProbe || !this.target) return;
    this._probeDir.copy(this.camera.position).sub(this._pivot);
    const d = this._probeDir.length();
    if (d < 0.05) return;
    this._probeDir.divideScalar(d);
    const hit = this.occlusionProbe(this._pivot, this._probeDir, d);
    if (hit === null || !Number.isFinite(hit)) return;
    if (hit < 0.15) return;    // pivot embedded in geometry; see applyBoomCollision
    const safe = Math.max(0.35, hit - 0.2);
    if (safe >= d) return;
    this.camera.position.copy(this._pivot).addScaledVector(this._probeDir, safe);
  }

  // ===========================================================================
  // Bail
  // ===========================================================================

  /**
   * Break from the follow rig and show the wipeout.
   *
   * The rig plants itself at the crash site at chair height, drifts slowly around it, and
   * keeps the (still sliding, still tumbling) player framed. That is the THPS bail: the
   * world stops chasing you and watches you go down. It is an OVERLAY, not a framing
   * state — the follow rig keeps running underneath and `bailBlend` cross-fades between
   * them, so the recovery is the same damped return as everything else and there is no
   * discontinuity to catch up on when it ends.
   */
  startBail(duration = 1.35): void {
    if (!this.target) return;
    // Already showing a wipeout: extend it rather than restarting the move.
    if (this.bailTimer > 0) {
      this.bailTimer = Math.max(this.bailTimer, duration);
      return;
    }

    this.bailPivot.copy(this.target.position);
    const dx = this.camera.position.x - this.bailPivot.x;
    const dz = this.camera.position.z - this.bailPivot.z;
    const r = Math.hypot(dx, dz);
    this.bailRadius = THREE.MathUtils.clamp(r, 3.0, 4.0);
    this.bailAngle = Math.atan2(dx, dz);
    // Low: looking slightly up at the wipeout is what makes it read as a fall.
    this.bailHeight = THREE.MathUtils.clamp(this.camera.position.y - this.bailPivot.y, 0.85, 1.8);
    // Drift away from the side the chair was already leaning towards, so the move looks
    // motivated by the crash rather than arbitrary.
    this.bailDrift = (this.rollCurrent >= 0 ? 1 : -1) * 0.6;
    this.bailTimer = duration;
    this.bailElapsed = 0;
    // A wipeout is worth a jolt even if nothing else calls shake().
    this.shake(0.35, 0.25);
  }

  /** True while the bail rig owns the frame. */
  get isBailing(): boolean {
    return this.bailTimer > 0;
  }

  /**
   * Advance the bail rig and write `_desiredPos` / `_desiredLookAt`, cross-faded with the
   * follow rig. Returns the position damping rate to use this frame.
   */
  private updateBail(dt: number): number {
    if (this.bailTimer > 0) {
      this.bailTimer -= dt;
      this.bailElapsed += dt;
    }
    const wantBlend = this.bailTimer > 0 ? 1 : 0;
    this.bailBlend += (wantBlend - this.bailBlend) * damp(wantBlend > 0 ? 12 : 2.2, dt);
    if (this.bailBlend < 0.002) {
      this.bailBlend = 0;
      this._desiredPos.copy(this._followPos);
      this._desiredLookAt.copy(this._followLookAt);
      return this.frame.posFollow;
    }

    // The pivot starts PLANTED at the crash site and then catches up.
    //
    // A fully planted rig was the first attempt and it is wrong for this game: the chair
    // is not a ragdoll, it keeps rolling, and a capture at 0.7 s after the bail had the
    // rider 10.5 m away and four pixels tall. So the plant is a moment, not the whole
    // shot — the camera holds while the wipeout leaves it, then swings after it. The
    // leash below is the hard guarantee that the subject is never lost.
    this.bailPivot.lerp(this.target!.position, damp(2.0 + this.bailElapsed * 7.0, dt));
    const lx = this.target!.position.x - this.bailPivot.x;
    const lz = this.target!.position.z - this.bailPivot.z;
    const lead = Math.hypot(lx, lz);
    const MAX_LEAD = 2.0;
    if (lead > MAX_LEAD) {
      const k = (lead - MAX_LEAD) / lead;
      this.bailPivot.x += lx * k;
      this.bailPivot.z += lz * k;
    }
    this.bailPivot.y += (this.target!.position.y - this.bailPivot.y) * damp(3, dt);

    // Slow arc around the crash site, easing outward so the shot opens as the tumble ends.
    this.bailAngle += this.bailDrift * dt;
    const r = this.bailRadius + Math.min(this.bailElapsed, 2) * 0.20;
    this._desiredPos.set(
      this.bailPivot.x + Math.sin(this.bailAngle) * r,
      this.bailPivot.y + this.bailHeight,
      this.bailPivot.z + Math.cos(this.bailAngle) * r,
    );
    // Frame the player, not the crater — the chair keeps sliding and must stay in shot.
    this._desiredLookAt.copy(this.target!.position);
    this._desiredLookAt.y += 0.55;
    this._desiredLookAt.lerp(this.bailPivot, 0.2);

    this._desiredPos.lerp(this._followPos, 1 - this.bailBlend);
    this._desiredLookAt.lerp(this._followLookAt, 1 - this.bailBlend);

    // Slower than the follow rig — that difference is what reads as the camera losing
    // its grip on the player — but not so slow that a chair still doing 14 m/s outruns
    // it. Measured: at 2.6 the lens trailed the wipeout by 5.6 m all on its own, on top
    // of the pivot's own lag, and the rider was a speck.
    return THREE.MathUtils.lerp(this.frame.posFollow, 9.0, this.bailBlend);
  }

  // ===========================================================================
  // Shake / roll
  // ===========================================================================

  /**
   * Shake camera (for impacts, bails)
   * @param intensity - Shake strength (0.1 = subtle, 1 = strong)
   * @param duration - Shake duration in seconds
   */
  shake(intensity = 0.5, duration = 0.3): void {
    // Only start new shake if it would be more intense
    const remaining = this.shakeDuration > 0
      ? this.shakeIntensity * (this.shakeTimeRemaining / this.shakeDuration)
      : 0;
    if (intensity > remaining) {
      this.shakeIntensity = intensity;
      this.shakeDuration = duration;
      this.shakeTimeRemaining = duration;
    }
  }

  /**
   * One offset for every kind of shake there is, so they add instead of fighting:
   * the impact impulse (decaying) and a speed rumble that only exists on the ground and
   * only above about half speed. Both ride the same smooth noise, so a landing at speed
   * reads as one camera, not two.
   */
  private applyShake(dt: number): void {
    this.shakeClock += dt;

    let amp = 0;
    if (this.shakeTimeRemaining > 0) {
      this.shakeTimeRemaining -= dt;
      const progress = Math.max(0, this.shakeTimeRemaining) / this.shakeDuration;
      amp += this.shakeIntensity * progress * progress;   // squared: a hit, not a wobble
    }
    if (!this.airborne) {
      // Chair casters on office carpet at 15 m/s. Subtle, but it is the difference
      // between "fast" and "a photograph moving".
      amp += 0.012 * this.speedRatio * this.speedRatio;
    }

    if (amp <= 1e-4) return;
    const t = this.shakeClock;
    this.shakeOffset.set(
      shakeNoise(t, 0) * amp,
      shakeNoise(t, 1) * amp * 0.8,
      shakeNoise(t, 2) * amp * 0.6,
    );
    this.camera.position.add(this.shakeOffset);
  }

  /**
   * Dutch roll into turns. Lateral acceleration ~ yaw rate * forward speed. Applied AFTER
   * lookAt(), which has just overwritten the whole quaternion.
   *
   * The roll is applied as a rotation about the camera's OWN forward axis.
   *
   * This used to be `this.camera.rotation.z = this.rollCurrent`, which is what was
   * flipping the camera upside-down. `camera.rotation` is an Euler with order 'XYZ',
   * and after lookAt() all three of its components are non-zero and COUPLED — the z
   * term is not camera roll, it is the third factor of an XYZ decomposition. Writing
   * it in isolation both applies the wrong rotation and, as the pitch term approaches
   * the XYZ gimbal singularity, recomposes into a wildly different orientation. Skate
   * around long enough to swing the camera through that heading and it inverts.
   *
   * A quaternion multiply on the local Z axis is an exact camera-space roll with no
   * singularity anywhere. Do not "simplify" this back to an Euler write.
   */
  private applyRoll(dt: number, targetRotationY: number): void {
    let yawRate = 0;
    if (this.hasPrevYaw) {
      yawRate = angleDelta(targetRotationY, this.prevTargetYaw) / dt;
    }
    this.prevTargetYaw = targetRotationY;
    this.hasPrevYaw = true;

    const lateral = yawRate * Math.min(this.lastSpeed, 24);
    // Per-state scale, and killed off entirely while the bail rig owns the frame — a
    // canted horizon there would fight the arc instead of adding to it.
    const scale = this.frame.rollScale * (1 - this.bailBlend);
    const limit = this.maxRoll * Math.max(scale, 0.001);
    let targetRoll = THREE.MathUtils.clamp(-lateral * 0.010 * scale, -limit, limit);
    // A single deliberate cant on the wipeout, in the direction the camera is drifting.
    targetRoll += this.bailBlend * 0.085 * Math.sign(this.bailDrift);

    this.rollCurrent += (targetRoll - this.rollCurrent) * damp(8, dt);

    if (Math.abs(this.rollCurrent) > 1e-4) {
      this.rollQuat.setFromAxisAngle(FORWARD_AXIS, this.rollCurrent);
      this.camera.quaternion.multiply(this.rollQuat);
    }
  }

  // ===========================================================================
  // Impact zoom / grind swing
  // ===========================================================================

  // Impact zoom pulse state (brief zoom on big landings)
  private impactZoomCurrent = 0;      // Current FOV reduction
  private impactZoomDecay = 8;        // How fast the pulse fades (higher = faster)

  // Grind camera settings (rotation of the boom to put the rail across the frame)
  private grindCameraAngle = 0;           // Current grind camera rotation
  private targetGrindAngle = 0;           // Target rotation
  private grindAngleMax = Math.PI / 9;    // 20 degrees max rotation
  private grindAngleSmoothSpeed = 4;      // How fast to transition
  private grindRailDirection = new THREE.Vector3();  // Direction of current rail

  /**
   * Trigger an impact zoom pulse on big landings
   * Briefly narrows FOV then returns to normal, creating a "punch" effect
   * @param points - Points scored on this landing (used to scale intensity)
   */
  impactZoomPulse(points: number): void {
    // Only trigger for landings worth 5000+ points
    if (points < 5000) return;

    // Scale intensity based on points (5000 = subtle, 50000+ = dramatic)
    // FOV reduction: 5-15 degrees based on points
    const pointsFactor = Math.min((points - 5000) / 45000, 1); // 0 at 5000, 1 at 50000
    const fovReduction = 5 + pointsFactor * 10; // 5 to 15 degrees

    // Set the impact zoom (will decay back to 0)
    this.impactZoomCurrent = fovReduction;
  }

  /**
   * Update impact zoom (call in main update loop)
   */
  updateImpactZoom(dt: number): void {
    // Decay the impact zoom effect
    if (this.impactZoomCurrent > 0.1) {
      this.impactZoomCurrent -= this.impactZoomCurrent * damp(this.impactZoomDecay, dt);
    } else {
      this.impactZoomCurrent = 0;
    }
  }

  /**
   * Set grind camera state — swings the boom so the RAIL, not the chair, is the subject.
   * Called once on grind entry (the sign is decided from the approach and then held; if
   * it were recomputed every frame the cross product would go to zero as the chair
   * aligned with the rail and the sign would flip back and forth).
   * @param isGrinding - Whether player is currently grinding
   * @param railStart - Start point of the rail (optional, for direction)
   * @param railEnd - End point of the rail (optional, for direction)
   */
  setGrindCamera(isGrinding: boolean, railStart?: THREE.Vector3, railEnd?: THREE.Vector3): void {
    this.grinding = isGrinding;

    if (isGrinding && railStart && railEnd) {
      // Calculate rail direction
      this.grindRailDirection.subVectors(railEnd, railStart).normalize();

      // Rotate the camera to the side the rail is arriving from, so the line ahead opens
      // up across the frame instead of disappearing behind the rider.
      if (this.target) {
        const playerForward = this._forward.set(0, 0, 1).applyQuaternion(this.target.quaternion);

        // Cross product to determine which side the rail is approaching from.
        // Positive Y = rail is to the right, rotate camera left (positive angle).
        const cross = this._right.crossVectors(playerForward, this.grindRailDirection);
        this.targetGrindAngle = cross.y > 0 ? this.grindAngleMax : -this.grindAngleMax;
      }
    } else if (!isGrinding) {
      this.targetGrindAngle = 0;
    }
  }

  /**
   * Update grind camera angle (call in main update loop)
   */
  private updateGrindCamera(dt: number): void {
    // Smoothly transition grind camera angle
    this.grindCameraAngle += (this.targetGrindAngle - this.grindCameraAngle) * damp(this.grindAngleSmoothSpeed, dt);

    // Snap to zero when very close (avoid floating point drift)
    if (Math.abs(this.grindCameraAngle) < 0.001 && Math.abs(this.targetGrindAngle) < 0.001) {
      this.grindCameraAngle = 0;
    }
  }

}
