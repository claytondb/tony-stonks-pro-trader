#!/usr/bin/env node
/**
 * FEEL harness — measures the micro-level control qualities that separate a AAA
 * skater from a merely functional one.
 *
 * play.mjs measures MACRO flow: is the player moving, grinding, comboing across a
 * whole run. That can look healthy while the game still feels wrong in the hand.
 * This measures the things a player feels within a few frames:
 *
 *   - input latency        frames between pressing a key and the world responding
 *   - acceleration curve   how long to reach cruise, and the SHAPE of getting there
 *   - deceleration/coast   speed should bleed slowly; instant stop kills flow
 *   - ollie consistency    the same input must give the same hop, every time
 *   - landing retention    how much speed survives a landing (THPS keeps nearly all)
 *   - turn response        yaw rate, ramp-in time, and turn radius at cruise
 *   - coyote / buffer      the forgiveness windows that make a game feel fair
 *
 * Each probe runs as an isolated deterministic experiment: reset to a VERIFIED
 * initial condition, step fixedUpdate() at exactly 1/60 with rendering off, dispatch
 * synthetic key events on exact simulated frames, and sample. No wall-clock anywhere,
 * so results are exact and reproducible rather than dependent on machine load.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE IS SHAPED THE WAY IT IS — the confounds that were found, in order.
 * Every one of them produced a confident, wrong number. If you change the harness,
 * do not undo these.
 *
 *  1. STATE INHERITANCE. The coast probe used to inherit the acceleration probe's
 *     state, which had held forward for ten simulated seconds — ~130 m on a 46 m
 *     floorplate. It was measuring a wall collision and reporting it as speed decay.
 *
 *  2. NO REAL RESET. loadLevel() repositions the chair but does not zero its rigid
 *     body, so probes started at ~13 m/s.
 *
 *  3. loadLevel() IS NOT A RESET PRIMITIVE AT ALL, which is the big one:
 *       a. The authored spawn for ch1_office is y = 0.5 while the chair rests at
 *          y = 1.12 there. The collider starts INSIDE the floor and Rapier's
 *          penetration recovery ejects it at ~20 m/s upward and ~10 m sideways. The
 *          chair is then airborne for ~90 frames. Every probe that pressed a key
 *          during that flight measured NOTHING (push and ollie both require ground
 *          contact) — that is exactly why inputLatency read null and why 4 of 5
 *          ollies read 0.000 m.
 *       b. The chair never coasts to rest after the ejection: it lands at speed,
 *          gets kicked by the level's wall-unstick logic and keeps moving. A fixed
 *          "step(55) and hope" settle can never be a defined initial condition.
 *       c. Game state survives loadLevel(): `carriedSpeed` in particular. The speed
 *          restore hands back 93% of carriedSpeed whenever current speed falls below
 *          85% of it — INCLUDING from a standstill — so a probe that zeroed the rigid
 *          body still found itself doing 13 m/s one frame later.
 *       d. Repeated loadLevel() calls eventually crash the level: Destructibles
 *          .stepDynamics() reads `inst.body` off an undefined entry.
 *     So the harness now loads the level ONCE, and reset() teleports the chair to a
 *     calibrated anchor at its measured resting height, clears exactly the player
 *     fields loadCustomLevel() clears, and then VERIFIES rest before returning.
 *
 *  4. NO RUNWAY. ch1_office gives about 4 seconds of clear floor in the best
 *     direction. The old accel probe held forward for 600 frames and the old coast
 *     probe coasted for 900, so both spent most of their window in wall contacts and
 *     ramp launches. Every probe now runs inside a MEASURED clear-lane budget and
 *     reports the frame at which contact/air/ramp first polluted the run.
 *
 *  5. VELOCITY.Y LIES WHILE GROUNDED. The ground-snap writes large negative y
 *     velocities into a body that is not moving (-25 m/s while resting). Anything
 *     vertical — takeoff detection, hop height, airtime, coyote — is therefore
 *     measured from POSITION, never from velocity.y.
 *
 *  6. ASSUMED CONSTANTS. The turn probe hard-coded "full rate = 3.6 rad/s". The game
 *     has said 2.56 for a while. Full rate is now defined as a fraction of the
 *     MEASURED steady rate, so the probe cannot be wrong about the game's intent.
 *
 * Every probe therefore reports `pre` (its preconditions: was the chair grounded, at
 * rest, did it stay on clear floor) and `ok`. A number with ok:false is not a
 * measurement, it is a failure report, and the printed output says so.
 *
 * Usage:
 *   node tools/feel.mjs                      # all probes, human-readable
 *   node tools/feel.mjs --json               # machine-readable
 *   node tools/feel.mjs --level story_3_lobby
 *   node tools/feel.mjs --selfcheck          # run everything twice, report variance,
 *                                            # and flag every metric that did not repeat
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import net from 'node:net';

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  if (i === -1) return d;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const WANT_JSON = argv.includes('--json');
const SELFCHECK = argv.includes('--selfcheck');
const LEVEL = String(arg('level', 'ch1_office'));
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

const freePort = () => new Promise((r) => {
  const s = net.createServer();
  s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); });
});
const waitForServer = async (url, ms = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server never came up');
};

// ===========================================================================
// THE IN-PAGE PASS. Everything below runs inside the browser, owns the clock,
// and returns one complete set of readings.
// ===========================================================================
async function runPass({ level }) {
  const g = window.game;
  const DT = 1 / 60;
  const FRAME_MS = DT * 1000;

  window.gameState?.setState?.('playing');
  g.loadLevel(level);
  g.start(); g.resume?.();
  await new Promise((r) => setTimeout(r, 900));
  g.isRunning = false;                       // we own the clock from here

  // ---- primitives ---------------------------------------------------------
  const fire = (t, code) => window.dispatchEvent(
    new KeyboardEvent(t, { code, key: code, bubbles: true }));
  const held = new Set();
  const down = (c) => { if (!held.has(c)) { fire('keydown', c); held.add(c); } };
  const up = (c) => { if (held.delete(c)) fire('keyup', c); };
  const releaseAll = () => { for (const c of [...held]) up(c); };
  const step = (n = 1) => { for (let i = 0; i < n; i++) g.fixedUpdate(DT); };

  const pos = () => g.physics.getPosition(g.chairBody);
  const vel = () => g.physics.getVelocity(g.chairBody);
  const spd = () => { const v = vel(); return Math.hypot(v.x, v.z); };
  const grounded = () => !!g.playerState?.isGrounded;
  const bodyYaw = () => {
    const q = g.physics.getRotation(g.chairBody);
    return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
  };
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const round = (v, n = 3) => (v === null || v === undefined || !isFinite(v) ? null : +v.toFixed(n));
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const median = (a) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  // Game constants, read from the instance rather than assumed. They are `private
  // readonly` in TypeScript, which is a compile-time fiction: at runtime they are
  // ordinary fields. Reading them lets a reader check a measurement against intent.
  const constants = {
    CRUISE_SPEED: g.CRUISE_SPEED, MAX_SPEED: g.MAX_SPEED, PUSH_ACCEL: g.PUSH_ACCEL,
    ROLL_DRAG: g.ROLL_DRAG, ROLL_DRAG_K: g.ROLL_DRAG_K, GRIP_RATE: g.GRIP_RATE,
    COYOTE_TIME_MS: g.COYOTE_TIME_MS, OLLIE_BUFFER_MS: g.OLLIE_BUFFER_MS,
    OLLIE_LIFT: g.OLLIE_LIFT, OLLIE_LIFT_SECONDS: g.OLLIE_LIFT_SECONDS,
    GROUND_CONTACT_GAP: g.GROUND_CONTACT_GAP, GROUND_STICK_GAP: g.GROUND_STICK_GAP,
    jumpMultiplier: g.jumpMultiplier, speedMultiplier: g.speedMultiplier,
    controls: (() => { try { return g.controls.getConfig(); } catch { return null; } })(),
  };

  // ---- the reset ----------------------------------------------------------
  // Clears exactly the player-facing state loadCustomLevel() clears, teleports to a
  // known anchor, and then PROVES the chair is on the floor and still before any
  // probe is allowed to press a key. Never calls loadLevel(): see note 3 above.
  const clearPlayerState = () => {
    releaseAll();
    step(1);                                  // flush the key-up edges through controls
    try { if (g.grindSystem?.isGrinding?.()) g.grindSystem.forceEndGrind(); } catch {}
    try { g.balance?.reset?.(); } catch {}
    // The WORLD has to be reset too, not just the chair. The office is full of
    // knockable props whose drag takes speed out of a run without touching the
    // heading, and four patrolling officers who move every step of simulated time.
    // Both put the level in a different state for probe 7 than it was in for probe 2 —
    // which is exactly how a harness gets a different answer to the same question.
    // Both reset() calls restore home positions rather than deleting anything.
    try { g.destructibles?.reset?.(); } catch {}
    try { g.police?.reset?.(); } catch {}
    g.carriedSpeed = 0; g.prevSpeed = 0; g.pinnedFor = 0; g.bailRecovery = 0;
    g.spinRotation = 0; g.turnRate = 0; g.turnCommand = 0;
    g.ollieLiftLeft = 0; g.ollieBufferedAt = -Infinity; g.ollieCoyoteUsed = false;
    g.activeTrick = null; g.heldGrabId = null; g.grindTrick = null;
    g.cumulativeSpinDegrees = 0;
    if (g.playerState) {
      g.playerState.isGrounded = true; g.playerState.isAirborne = false;
      g.playerState.isGrinding = false; g.playerState.isManualing = false;
      g.playerState.airTime = 0;
    }
    if (g.chairTilt) g.chairTilt.rotation.set(0, 0, 0);
  };

  const ZERO = { x: 0, y: 0, z: 0 };
  const place = (x, y, z, headingRad) => {
    g.physics.setPosition(g.chairBody, { x, y, z });
    g.physics.setRotationY(g.chairBody, headingRad);
    g.physics.setVelocity(g.chairBody, ZERO);
    g.physics.setAngularVelocity(g.chairBody, ZERO);
  };

  /**
   * Settle the chair and report exactly what happened. `ok` is only true if the chair
   * ends grounded, still (planar speed under 0.03 m/s), and vertically parked
   * (|dy| under 2 mm/frame) for six consecutive frames.
   */
  const settle = (x, y, z, headingRad, cap = 240) => {
    clearPlayerState();
    place(x, y, z, headingRad);
    let stable = 0, frames = 0, peakY = y, lastY = y;
    for (let i = 0; i < cap; i++) {
      step(); frames++;
      const p = pos();
      peakY = Math.max(peakY, p.y);
      const dy = Math.abs(p.y - lastY);
      lastY = p.y;
      if (grounded() && spd() < 0.03 && dy < 0.002) stable++; else stable = 0;
      if (stable >= 6) break;
    }
    const p = pos();
    return {
      ok: stable >= 6, frames, stableFrames: stable,
      restY: round(p.y), peakY: round(peakY),
      pos: [round(p.x, 2), round(p.y, 2), round(p.z, 2)],
      grounded: grounded(), speed: round(spd()),
      surfaceAngle: round(g.surfaceAngle ?? -1, 1),
    };
  };

  // ---- 0. spawn sanity ----------------------------------------------------
  // Not a feel metric: a precondition check on the LEVEL. If the authored spawn
  // point ejects the chair, every reading taken near the spawn is suspect, and the
  // player is being launched at the start of every run.
  const spawnCheck = (() => {
    try {
      const spawnPos = pos();
      clearPlayerState();
      g.physics.setVelocity(g.chairBody, ZERO);
      g.physics.setAngularVelocity(g.chairBody, ZERO);
      g.loadLevel(level);                       // authored spawn, as the player gets it
      g.physics.setVelocity(g.chairBody, ZERO);
      g.physics.setAngularVelocity(g.chairBody, ZERO);
      const p0 = pos();
      let peakY = p0.y, peakSpeed = 0, airFrames = 0;
      for (let i = 0; i < 180; i++) {
        step();
        const p = pos();
        peakY = Math.max(peakY, p.y);
        peakSpeed = Math.max(peakSpeed, spd());
        if (!grounded()) airFrames++;
      }
      const p1 = pos();
      return {
        spawnY: round(p0.y, 2),
        peakYRise: round(peakY - p0.y, 2),
        peakSpeedFromNoInput: round(peakSpeed, 2),
        airborneFrames: airFrames,
        driftMetres: round(Math.hypot(p1.x - p0.x, p1.z - p0.z), 1),
        ejects: (peakY - p0.y) > 0.5 || peakSpeed > 1,
        cameFrom: [round(spawnPos.x, 1), round(spawnPos.y, 1), round(spawnPos.z, 1)],
      };
    } catch (e) { return { error: String(e).slice(0, 160) }; }
  })();

  // ---- 1. calibrate the measurement lane ----------------------------------
  // Find somewhere the chair can actually be measured: flat floor it settles on, and
  // the longest heading with no wall contact, no ramp and no air. Everything after
  // this runs inside that budget and says so.
  const anchorsToTry = [[0, 0], [0, -9], [9, 0], [-9, 0], [0, 9], [-12, -12], [12, 12]];
  const HEADINGS = [0, 45, 90, 135, 180, 225, 270, 315];

  /**
   * Hold push down one heading and report the frame at which the run stopped being clean.
   * "Clean" means: still on the floor, still flat, still pointed where it was put, and
   * never losing speed while the push is held. That last one matters — the office is
   * strewn with knockable props whose drag takes 0.5 m/s out of a run WITHOUT nudging
   * the yaw, so a purely geometric check calls a prop collision a clean measurement.
   */
  // A one-frame speed loss this large is something being hit. Authored rolling drag is
  // 0.013 m/s per frame at cruise, so the threshold has three-quarters of an order of
  // magnitude of headroom over the model's own decay — but not so much that it misses a
  // prop. Set at a flat 0.12 it flagged a 0.145 m/s graze that cost 1.4% of the run and
  // threw away two thirds of a perfectly good coast measurement, so it scales with speed.
  const dipThreshold = (speed) => Math.max(0.2, 0.02 * speed);
  const runwayTrial = (anchor, restY, deg, cap) => {
    const rad = deg * Math.PI / 180;
    const s = settle(anchor[0], restY + 0.02, anchor[1], rad, 90);
    if (!s.ok) return { deg, ok: false, cleanFrames: 0, reason: 'settle failed' };
    const yaw0 = bodyYaw(); const p0 = pos();
    let clean = cap, reason = 'clear', last = spd();
    down('KeyW');
    for (let i = 1; i <= cap; i++) {
      step();
      const sNow = spd();
      if (!grounded()) { clean = i; reason = 'airborne'; break; }
      if (Math.abs(wrap(bodyYaw() - yaw0)) > 0.03) { clean = i; reason = 'obstacle'; break; }
      if ((g.surfaceAngle ?? 0) > 3) { clean = i; reason = 'ramp'; break; }
      if (last - sNow > dipThreshold(last)) { clean = i; reason = 'speed dip (prop?)'; break; }
      last = sNow;
    }
    up('KeyW'); step(1);
    const p = pos();
    return {
      deg, ok: true, cleanFrames: clean, reason,
      metres: round(Math.hypot(p.x - p0.x, p.z - p0.z), 1),
      endSpeed: round(spd(), 2),
    };
  };

  const calibration = { anchors: [], chosen: null };
  for (const a of anchorsToTry) {
    // Drop it in from above so we never start inside geometry (that is what the
    // authored spawn does wrong), then keep the height it comes to rest at.
    const dropped = settle(a[0], 3.0, a[1], 0, 240);
    const rec = { anchor: a, settle: dropped, headings: [] };
    if (dropped.ok && Math.abs(dropped.surfaceAngle) < 3) {
      for (const deg of HEADINGS) rec.headings.push(runwayTrial(a, dropped.restY, deg, 300));
      rec.best = rec.headings.reduce((b, h) => (!b || h.cleanFrames > b.cleanFrames ? h : b), null);
    }
    calibration.anchors.push(rec);
  }
  const usable = calibration.anchors.filter((r) => r.best && r.best.cleanFrames > 0);
  usable.sort((a, b) => b.best.cleanFrames - a.best.cleanFrames);
  if (!usable.length) {
    return { fatal: 'no measurable lane: the chair could not be settled anywhere on this level', calibration, spawnCheck, constants };
  }
  const LANE = {
    anchor: usable[0].anchor,
    restY: usable[0].settle.restY,
    headingDeg: usable[0].best.deg,
    headingRad: usable[0].best.deg * Math.PI / 180,
    cleanFrames: usable[0].best.cleanFrames,
    cleanSeconds: round(usable[0].best.cleanFrames * DT, 2),
    cleanMetres: usable[0].best.metres,
    endedBy: usable[0].best.reason,
  };
  calibration.chosen = LANE;
  calibration.anchors = calibration.anchors.map((r) => ({
    anchor: r.anchor, settled: r.settle.ok, restY: r.settle.restY,
    best: r.best ? { deg: r.best.deg, cleanFrames: r.best.cleanFrames, reason: r.best.reason } : null,
  }));

  /** Every probe starts here, and gets told whether it really did. */
  const reset = () => settle(LANE.anchor[0], LANE.restY + 0.02, LANE.anchor[1], LANE.headingRad, 120);

  /**
   * Step forward while watching for everything that would make the run stop being a
   * measurement of the CHAIR rather than of the LEVEL.
   *
   * The options exist because each probe means something different by "dirty":
   *   watchYaw   off for the turn probe — the chair is SUPPOSED to be rotating there,
   *              so an unexplained-yaw test would report a contact on frame 2 of every
   *              turn (it did, before this).
   *   watchAir   off for hop probes — leaving the floor is the measurement.
   *   watchDip   a speed loss while the push is held; catches the prop collisions that
   *              leave the heading untouched.
   */
  const watcher = ({ watchYaw = true, watchAir = true, watchDip = true } = {}) => {
    const yaw0 = bodyYaw();
    let contactAt = null, airAt = null, rampAt = null, dipAt = null, dips = 0, frame = 0;
    let last = spd(), dipLoss = 0;
    return {
      tick() {
        frame++;
        const sNow = spd();
        if (watchAir && airAt === null && !grounded()) airAt = frame;
        if (watchYaw && contactAt === null && Math.abs(wrap(bodyYaw() - yaw0)) > 0.03) contactAt = frame;
        if (rampAt === null && (g.surfaceAngle ?? 0) > 3) rampAt = frame;
        if (watchDip && grounded() && last - sNow > dipThreshold(last)) {
          dips++; dipLoss += last - sNow; if (dipAt === null) dipAt = frame;
        }
        last = sNow;
        return this.clean();
      },
      clean() { return this.firstDirty() === null; },
      firstDirty() {
        const c = [contactAt, airAt, rampAt, dipAt].filter((v) => v !== null);
        return c.length ? Math.min(...c) : null;
      },
      report() {
        return { contactAt, airAt, rampAt, dipAt, dips, dipLoss: round(dipLoss, 2), dirtyAt: this.firstDirty() };
      },
    };
  };

  const out = { lane: LANE, constants, spawnCheck, calibration };

  // ---- 2. input latency ---------------------------------------------------
  // Old bug: reported null. The chair was mid-flight from the spawn ejection for the
  // whole 30-frame window, and push does nothing in the air. The threshold is now
  // derived from a MEASURED pre-press noise floor instead of a guessed 0.05, and the
  // probe refuses to report unless the chair was verifiably parked before the press.
  {
    const pre = reset();
    const baseline = [];
    for (let i = 0; i < 12; i++) { step(); baseline.push(spd()); }
    const noise = Math.max(...baseline);
    const base = mean(baseline);
    const threshold = Math.max(noise * 3, 0.02);
    const samples = [];
    down('KeyW');
    let frames = null;
    for (let i = 1; i <= 30; i++) {
      step();
      const s = spd();
      if (i <= 8) samples.push(round(s, 4));
      if (frames === null && s > base + threshold) frames = i;
    }
    up('KeyW'); step(1);
    out.inputLatencyFrames = frames;
    out.inputLatencyMs = frames === null ? null : round(frames * FRAME_MS, 1);
    out.inputLatency = {
      frames, ms: frames === null ? null : round(frames * FRAME_MS, 1),
      noiseFloor: round(noise, 4), threshold: round(threshold, 4),
      firstSpeedSamples: samples,
      pre: { settled: pre.ok, grounded: pre.grounded, startSpeed: pre.speed, settleFrames: pre.frames },
      ok: pre.ok && frames !== null,
    };
  }

  // ---- 3. acceleration curve ----------------------------------------------
  // Runs inside the calibrated lane. Anything reached after the run stopped being
  // clean is reported but marked, because past that frame the number is partly the
  // wall-unstick kick, not the push model.
  {
    const pre = reset();
    const cap = Math.min(LANE.cleanFrames, 600);
    const w = watcher();
    const marks = {}; const curve = [];
    let top = 0, topCleanFrames = 0;
    down('KeyW');
    for (let i = 1; i <= cap; i++) {
      step(); const cleanNow = w.tick();
      const s = spd();
      if (i % 6 === 0) curve.push(round(s, 2));
      for (const t of [4, 8, 12, 16]) {
        if (marks[`to${t}`] === undefined && s >= t) marks[`to${t}`] = round(i * DT, 2);
      }
      if (cleanNow) { top = Math.max(top, s); topCleanFrames = i; }
    }
    up('KeyW'); step(1);
    const wr = w.report();
    const dirtyS = wr.dirtyAt === null ? null : round(wr.dirtyAt * DT, 2);
    const suspect = Object.entries(marks)
      .filter(([, v]) => dirtyS !== null && v > dirtyS).map(([k]) => k);
    out.accelStartSpeed = pre.speed;
    out.accelSeconds = marks;
    out.topSpeed = round(top, 2);
    out.accelCurveSampled = curve.slice(0, 40);
    out.accel = {
      startSpeed: pre.speed, marks, curve: curve.slice(0, 40),
      topSpeedInCleanWindow: round(top, 2),
      cleanWindowSeconds: round(topCleanFrames * DT, 2),
      stillRisingAtWindowEnd: curve.length > 2 && curve[curve.length - 1] > curve[curve.length - 3] + 0.05,
      suspectMarks: suspect,
      pre: { settled: pre.ok, startSpeed: pre.speed, laneFrames: cap, ...wr },
      ok: pre.ok && pre.speed < 0.05,
    };
  }

  // ---- 4. coast / deceleration --------------------------------------------
  // Half the lane is spent getting up to speed, the rest is the coast, and the
  // moment the coast stops being clean the measurement stops. The old probe coasted
  // for 900 frames on a lane worth 250 and called the wall "deceleration".
  {
    const pre = reset();
    const runUp = Math.min(120, Math.round(LANE.cleanFrames * 0.45));
    down('KeyW'); step(runUp); up('KeyW'); step(1);
    const s0 = spd();
    const w = watcher();
    const decel = {}; const trace = [];
    let cleanFrames = 0, lastCleanSpeed = s0, i = 0;
    const budget = Math.max(0, LANE.cleanFrames - runUp);
    for (i = 1; i <= budget; i++) {
      step(); const cleanNow = w.tick();
      const s = spd();
      if (i % 12 === 0) trace.push(round(s, 2));
      if (cleanNow) { cleanFrames = i; lastCleanSpeed = s; }
      for (const f of [0.75, 0.5, 0.25]) {
        const k = `to${Math.round(f * 100)}pct`;
        if (decel[k] === undefined && s <= s0 * f) decel[k] = round(i * DT, 2);
      }
      if (s < 0.5) break;
    }
    const wr = w.report();
    const dirtyS = wr.dirtyAt === null ? null : round(wr.dirtyAt * DT, 2);
    const suspect = Object.entries(decel)
      .filter(([, v]) => dirtyS !== null && v > dirtyS).map(([k]) => k);
    const dropPerSec = cleanFrames > 12 ? (s0 - lastCleanSpeed) / (cleanFrames * DT) : null;
    out.coastFromSpeed = round(s0, 2);
    out.coastSeconds = decel;
    out.coast = {
      fromSpeed: round(s0, 2), seconds: decel, trace,
      cleanSeconds: round(cleanFrames * DT, 2),
      speedAfterCleanWindow: round(lastCleanSpeed, 2),
      decayPerSecondInCleanWindow: round(dropPerSec, 3),
      pctKeptOverCleanWindow: s0 > 0.1 ? round(lastCleanSpeed / s0, 3) : null,
      // The lane is not long enough to coast down to half speed anywhere in this level,
      // so this is an EXTRAPOLATION from the measured decay, not a measurement. It is
      // named as one. Treat it as an order-of-magnitude sanity check on "does speed
      // survive between features", not as a number to tune against.
      projectedSecondsTo50pct: dropPerSec > 0.01 ? round((s0 * 0.5) / dropPerSec, 2) : null,
      predictedDecayFromAuthoredDrag: round((constants.ROLL_DRAG ?? 0)
        + (constants.ROLL_DRAG_K ?? 0) * ((s0 + lastCleanSpeed) / 2), 3),
      // A cross-check the probe can make against the game's own numbers. If the coast
      // bleeds faster than the authored drag says it should, the difference is not the
      // model — it is something touching the chair. On ch1_office it is a single 0.145
      // m/s graze that sits just under the dip threshold and inflates the rate by 11%.
      decayVsAuthoredRatio: dropPerSec > 0.01
        ? round(dropPerSec / Math.max(1e-6, (constants.ROLL_DRAG ?? 0)
          + (constants.ROLL_DRAG_K ?? 0) * ((s0 + lastCleanSpeed) / 2)), 2)
        : null,
      suspectMarks: suspect,
      pre: { settled: pre.ok, runUpFrames: runUp, coastBudgetFrames: budget, ...wr },
      ok: pre.ok && cleanFrames > 12,
    };
  }

  // ---- shared: a hop, done properly ---------------------------------------
  // The old ollie probe pressed Space on a fixed frame count after the reset and
  // recorded whatever happened. On four runs in five the chair was mid-flight from
  // the spawn ejection (or off a desk at the end of the run-up), the pop was
  // swallowed for want of a floor, and the probe recorded 0.000 m as if that were
  // the ollie. A hop is now only a measurement if it can prove:
  //   - the chair was grounded and vertically still on the frame Space went down,
  //   - the chair actually left the ground afterwards,
  //   - the landing happened inside the window.
  // Height and airtime come from POSITION, never velocity.y, which lies on the floor.
  const doHop = (holdFrames, runUpFrames) => {
    const pre = reset();
    if (runUpFrames > 0) { down('KeyW'); step(runUpFrames); }
    // Wait for a genuinely stable contact frame before pressing.
    let stable = 0, waited = 0, lastY = pos().y;
    while (stable < 3 && waited < 90) {
      step(); waited++;
      const yNow = pos().y;
      const dy = Math.abs(yNow - lastY); lastY = yNow;
      if (grounded() && dy < 0.01) stable++; else stable = 0;
    }
    const readyOnGround = stable >= 3;
    const groundY = pos().y;
    const takeoffSpeed = spd();
    // Leaving the ground is the point of this probe, and the pop itself costs speed
    // on purpose, so neither counts as contamination here. A wall or a ramp does.
    const w = watcher({ watchAir: false, watchDip: false });

    // Push is RELEASED at the pop. Holding it through the landing meant the chair was
    // being accelerated again on the touchdown frame, so "landing retention" came out
    // at 1.17 — the landing appeared to give speed away for free. What a landing costs
    // is now measured between the frame before touchdown and six frames after, with no
    // push in play at all, and the pop's own forward boost is reported separately
    // instead of being smuggled into the retention number.
    if (runUpFrames > 0) up('KeyW');

    down('Space');
    step(holdFrames);
    up('Space');
    const speedAfterPop = spd();
    let peak = groundY, airFrames = 0, leftGround = false, landedAt = null;
    let speedBeforeLanding = speedAfterPop, prevSpeed = speedAfterPop;
    const AIR_EPS = 0.05;
    for (let i = 1; i <= 240; i++) {
      const sBefore = spd();
      step(); w.tick();
      const p = pos();
      peak = Math.max(peak, p.y);
      const above = p.y > groundY + AIR_EPS;
      if (above) { leftGround = true; airFrames++; prevSpeed = sBefore; }
      else if (leftGround && grounded() && i > holdFrames + 2) { landedAt = i; speedBeforeLanding = prevSpeed; break; }
    }
    const landSpeed = spd();
    step(6);
    const speedAfterLanding = spd();
    step(1);
    return {
      holdFrames, runUpFrames,
      peakHeight: round(peak - groundY),
      airtime: round(airFrames * DT),
      takeoffSpeed: round(takeoffSpeed, 2),
      popForwardBoost: round(speedAfterPop - takeoffSpeed, 2),
      speedBeforeLanding: round(speedBeforeLanding, 2),
      landSpeed: round(landSpeed, 2),
      speedAfterLanding: round(speedAfterLanding, 2),
      // "What does the landing cost?" — the THPS question. Coasting drag over six
      // frames is 0.08 m/s, well under the resolution this is read at.
      retention: speedBeforeLanding > 0.5 ? round(speedAfterLanding / speedBeforeLanding) : null,
      pre: {
        settled: pre.ok, groundedAtPress: readyOnGround, waitedFrames: waited,
        groundY: round(groundY), leftGround, landed: landedAt !== null,
        laneClean: w.clean(), ...w.report(),
      },
      ok: pre.ok && readyOnGround && leftGround && landedAt !== null,
    };
  };

  // ---- 5. ollie: height, airtime, consistency -----------------------------
  {
    const runUp = Math.min(90, Math.round(LANE.cleanFrames * 0.35));
    const hops = [];
    for (let rep = 0; rep < 5; rep++) hops.push(doHop(8, runUp));
    const good = hops.filter((h) => h.ok);
    const hs = good.map((h) => h.peakHeight);
    const ats = good.map((h) => h.airtime);
    const rets = good.map((h) => h.retention).filter((v) => v !== null);
    out.ollie = {
      hops, validHops: good.length, attemptedHops: hops.length,
      meanHeight: round(mean(hs)), heightSpread: hs.length ? round(Math.max(...hs) - Math.min(...hs)) : null,
      meanAirtime: round(mean(ats)), airtimeSpread: ats.length ? round(Math.max(...ats) - Math.min(...ats)) : null,
      meanLandingRetention: rets.length ? round(mean(rets)) : null,
      runUpFrames: runUp,
      ok: good.length === hops.length,
    };
    // Standing-start hop, reported separately. It used to disagree wildly with the
    // moving hop; that disagreement was the spawn ejection, not the game, and if the
    // two ever diverge again this is where it shows up.
    const standing = doHop(8, 0);
    out.ollieStanding = standing;
    out.ollie.standingVsMovingHeightDelta = (standing.ok && out.ollie.meanHeight !== null)
      ? round(standing.peakHeight - out.ollie.meanHeight) : null;
  }

  // ---- 6. hold-to-charge --------------------------------------------------
  {
    const runUp = Math.min(90, Math.round(LANE.cleanFrames * 0.35));
    const charge = [2, 10, 20, 35].map((h) => {
      const hop = doHop(h, runUp);
      return { holdFrames: h, peakHeight: hop.peakHeight, airtime: hop.airtime, ok: hop.ok, pre: hop.pre };
    });
    const good = charge.filter((c) => c.ok);
    const hs = good.map((c) => c.peakHeight);
    let monotonic = true;
    for (let i = 1; i < good.length; i++) if (good[i].peakHeight < good[i - 1].peakHeight - 0.005) monotonic = false;
    out.ollieCharge = charge;
    out.chargeScalesHeight = hs.length > 1 ? round(Math.max(...hs) - Math.min(...hs)) : null;
    out.charge = {
      steps: charge, monotonic, spread: out.chargeScalesHeight,
      validSteps: good.length, ok: good.length === charge.length,
    };
  }

  // ---- 7. turn response ---------------------------------------------------
  // "Full rate" is a fraction of the MEASURED steady rate. The old probe compared
  // against a hard-coded 3.6 rad/s that the game has not used for some time, so it
  // reported "75 frames to full rate" for a turn that was in fact at its own steady
  // rate within a quarter of a second. Yaw comes from the rigid body: the chair MESH
  // gets air-spin and visual lean added to it and is not the steering signal.
  {
    const pre = reset();
    const runUp = Math.min(90, Math.round(LANE.cleanFrames * 0.35));
    down('KeyW'); step(runUp);
    const cruise = spd();
    const rates = []; const speeds = [];
    let prev = bodyYaw();
    // A turning chair carves a circle and will meet the furniture the straight lane
    // avoided, so the measurement runs only as long as it stays clean, and only clean
    // frames feed the steady rate. Yaw cannot be the contact test here: the yaw change
    // IS the signal.
    const w = watcher({ watchYaw: false });
    down('KeyA');
    let cleanRates = 0;
    for (let i = 1; i <= 120; i++) {
      step();
      const cleanNow = w.tick();
      const cur = bodyYaw();
      rates.push(Math.abs(wrap(cur - prev)) / DT);
      speeds.push(spd());
      if (cleanNow) cleanRates = i;
      prev = cur;
    }
    up('KeyA'); up('KeyW'); step(1);
    // Steady rate = median of the settled part of the CLEAN window. Median rather than
    // mean so one solver spike cannot move it.
    const settledFrom = Math.min(30, Math.max(0, cleanRates - 10));
    const tail = rates.slice(settledFrom, cleanRates);
    const steady = median(tail);
    const tailSpread = tail.length ? Math.max(...tail) - Math.min(...tail) : null;
    let ramp90 = null, ramp63 = null;
    for (let i = 0; i < rates.length; i++) {
      if (ramp63 === null && rates[i] >= 0.632 * steady) ramp63 = i + 1;
      if (ramp90 === null && rates[i] >= 0.9 * steady) { ramp90 = i + 1; break; }
    }
    const cruiseDuringTurn = median(speeds.slice(settledFrom, cleanRates));
    out.turn = {
      cruiseSpeed: round(cruise, 2),
      speedDuringTurn: round(cruiseDuringTurn, 2),
      steadyYawRate: round(steady, 2),
      steadyRateSpread: round(tailSpread, 3),
      steadyRateNoisy: tailSpread !== null && tailSpread > 0.4,
      rampToFullRateFrames: ramp90,          // 90% of the MEASURED steady rate
      rampToFullRateMs: ramp90 === null ? null : round(ramp90 * FRAME_MS, 1),
      rampTo63pctFrames: ramp63,
      peakYawRateInCleanWindow: round(Math.max(...rates.slice(0, cleanRates || 1)), 2),
      turnRadiusMetres: steady > 0.01 ? round(cruiseDuringTurn / steady, 2) : null,
      firstRates: rates.slice(0, 8).map((r) => round(r, 2)),
      cleanFrames: cleanRates,
      pre: { settled: pre.ok, runUpFrames: runUp, cleanFrames: cleanRates, ...w.report() },
      ok: pre.ok && steady !== null && steady > 0.05 && cleanRates >= 25 && ramp90 !== null,
    };
  }

  // ---- 8. coyote window ---------------------------------------------------
  // What this measures, precisely: after the wheels leave the floor with no upward
  // speed, how many frames later an ollie press still produces a jump.
  //
  // Two earlier versions of this probe were wrong in different ways.
  //   - The first made its airborne moment by OLLIEING, then pressed again. That cannot
  //     work: the pop writes `newVel.y = max(v.y, impulse)`, so a second pop while
  //     already rising at 12 m/s changes the trajectory by nothing. The probe read "the
  //     jump did not fire" for a jump that fired, and reported a 4-frame window.
  //   - The second rolled off the nearest edge. The only edge near the anchor is a 0.4 m
  //     step, and the chair is airborne over it for about seven frames, so the answer was
  //     capped by the furniture rather than by the game.
  // The airborne moment is now made deliberately: roll along the floor (grounded, so the
  // game's lastGroundedTime is this frame), then lift the body 1.25 m with its velocity
  // untouched. That is exactly the state a player is in one frame after rolling off a
  // ledge, it lasts ~18 frames, and a pop out of it is unmistakable. Where the level does
  // offer a real edge, `ledgeCrossCheck` repeats the first few delays on it, so the
  // artificial setup is checked against the real thing rather than trusted.
  {
    const runUp = Math.min(60, Math.round(LANE.cleanFrames * 0.4));
    const LIFT = 1.25;

    /** Roll, then leave the floor with zero vertical speed on the frame this returns. */
    const liftOff = () => {
      const pre = reset();
      down('KeyW'); step(runUp);
      let stable = 0, guard = 0, lastY = pos().y;
      while (stable < 3 && guard < 90) {
        step(); guard++;
        const yNow = pos().y; const dy = Math.abs(yNow - lastY); lastY = yNow;
        if (grounded() && dy < 0.01) stable++; else stable = 0;
      }
      if (!pre.ok || stable < 3) return false;
      const p = pos(); const v = vel();
      g.physics.setPosition(g.chairBody, { x: p.x, y: p.y + LIFT, z: p.z });
      g.physics.setVelocity(g.chairBody, { x: v.x, y: 0, z: v.z });
      return true;
    };

    // Rise is only counted while the chair is STILL IN THE AIR. Counting past touchdown
    // measures the landing-buffered pop instead of the coyote pop, which is how a
    // 16-frame-late press looked like a successful coyote jump in an earlier version.
    const riseWhileAirborne = (frames) => {
      const y0 = pos().y;
      let rise = 0;
      for (let i = 0; i < frames; i++) {
        step();
        if (grounded() && i > 1) break;
        rise = Math.max(rise, pos().y - y0);
      }
      return rise;
    };
    const airborneMsNow = () => (typeof g.lastGroundedTime === 'number'
      ? (g.simTime - g.lastGroundedTime) * 1000 : null);

    const trials = [];
    // Every frame across the interesting range, not every other one. At 2-frame
    // resolution ch1_office read 8 and story_3_lobby read 6 for what is one constant,
    // purely because the boundary trial landed on different sides of a skipped frame.
    for (const delay of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16]) {
      if (!liftOff()) { up('KeyW'); trials.push({ delay, ok: false }); continue; }
      step(delay);
      const control = riseWhileAirborne(24);
      up('KeyW'); step(1);

      if (!liftOff()) { up('KeyW'); trials.push({ delay, ok: false }); continue; }
      step(delay);
      // The game's OWN coyote clock at the moment of the press: the press is consumed on
      // the next fixed step, which is when the timer will have advanced one more frame.
      const clockAtPress = airborneMsNow();
      const stillUp = delay === 0 ? true : !grounded();
      down('Space');
      const pressed = riseWhileAirborne(24);
      up('Space'); up('KeyW'); step(1);

      trials.push({
        delay, ok: stillUp,
        gameAirborneMsAtPress: round((clockAtPress ?? 0) + FRAME_MS, 1),
        controlRise: round(control), pressedRise: round(pressed),
        jumped: pressed > control + 0.12,
      });
    }
    const valid = trials.filter((t) => t.ok);
    let window = null;
    for (const t of valid) { if (t.jumped) window = t.delay; else break; }
    // The game's test is `airborneMs < COYOTE_TIME_MS`, and a fixed 1/60 step lands one
    // trial exactly ON that boundary, where float accumulation in simTime decides it.
    // The same build answered that trial differently on two levels. Say so, rather than
    // letting a reader think the window itself moved.
    const firstFail = valid.find((t) => !t.jumped);
    const onKnifeEdge = !!(firstFail && constants.COYOTE_TIME_MS
      && Math.abs(firstFail.gameAirborneMsAtPress - constants.COYOTE_TIME_MS) < FRAME_MS * 0.51);

    // Cross-check on a real edge, if the level has one within the lane.
    const crossCheck = (() => {
      for (const deg of [LANE.headingDeg, ...HEADINGS.filter((d) => d !== LANE.headingDeg)]) {
        const rad = deg * Math.PI / 180;
        const pre = settle(LANE.anchor[0], LANE.restY + 0.02, LANE.anchor[1], rad, 120);
        if (!pre.ok) continue;
        down('KeyW');
        let leaveAt = null, ramp = false;
        for (let i = 1; i <= LANE.cleanFrames + 120; i++) {
          step();
          if ((g.surfaceAngle ?? 0) > 8) ramp = true;
          if (!grounded()) { leaveAt = i; break; }
        }
        if (leaveAt === null) { up('KeyW'); step(1); continue; }
        const y0 = pos().y;
        let rise = 0, airFrames = 0;
        for (let i = 0; i < 30; i++) { step(); rise = Math.max(rise, pos().y - y0); if (!grounded()) airFrames++; }
        up('KeyW'); step(1);
        if (ramp || rise > 0.25 || airFrames < 4) continue;
        const rollOff = (extra) => {
          settle(LANE.anchor[0], LANE.restY + 0.02, LANE.anchor[1], rad, 120);
          down('KeyW'); step(leaveAt + extra);
        };
        const ct = [];
        for (const delay of [0, 2, 4]) {
          if (delay >= airFrames) break;
          rollOff(delay);
          const okAir = !grounded();
          const yA = pos().y; let control = 0;
          for (let i = 0; i < 16; i++) { step(); control = Math.max(control, pos().y - yA); }
          up('KeyW'); step(1);
          rollOff(delay);
          const yB = pos().y;
          down('Space'); step(4);
          let pressed = 0;
          for (let i = 0; i < 16; i++) { step(); pressed = Math.max(pressed, pos().y - yB); }
          up('Space'); up('KeyW'); step(1);
          ct.push({ delay, ok: okAir, jumped: pressed > control + 0.12 });
        }
        return { headingDeg: deg, edgeAtFrame: leaveAt, airborneFramesOverEdge: airFrames, trials: ct };
      }
      return null;
    })();

    const ccAgrees = crossCheck
      ? crossCheck.trials.every((t) => !t.ok || (window !== null && t.delay <= window) === t.jumped)
      : null;

    out.coyoteFrames = window;
    out.coyote = {
      windowFrames: window,
      windowMs: window === null ? null : round(window * FRAME_MS, 1),
      gameConstantMs: constants.COYOTE_TIME_MS ?? null,
      gameConstantFrames: constants.COYOTE_TIME_MS ? round(constants.COYOTE_TIME_MS / FRAME_MS, 1) : null,
      method: `controlled ${LIFT}m lift-off from a rolling start, A/B against an unpressed run`,
      firstFrameRefusedMs: firstFail ? firstFail.gameAirborneMsAtPress : null,
      onKnifeEdgeOfGameConstant: onKnifeEdge,
      trials,
      ledgeCrossCheck: crossCheck,
      crossCheckAgrees: ccAgrees,
      ok: valid.length === trials.length && valid.length > 0,
    };
  }

  // ---- 9. ollie input buffer ----------------------------------------------
  // The other half of the fairness pair: press Space slightly BEFORE touchdown and the
  // pop should still come out on landing. Also an A/B — measuring "did it re-pop" by an
  // absolute height threshold counts the height the chair still had in hand from the
  // first hop, which is how a buffer that does nothing can look like a 12-frame buffer.
  {
    const runUp = Math.min(60, Math.round(LANE.cleanFrames * 0.3));
    /** Set up an identical hop and step to `framesBeforeLanding` before touchdown. */
    const toJustBeforeLanding = (early, knownLand) => {
      const pre = reset();
      down('KeyW'); step(runUp);
      let stable = 0, guard = 0, lastY = pos().y;
      while (stable < 3 && guard < 90) {
        step(); guard++;
        const yNow = pos().y; const dy = Math.abs(yNow - lastY); lastY = yNow;
        if (grounded() && dy < 0.01) stable++; else stable = 0;
      }
      if (!pre.ok || stable < 3) return null;
      const groundY = pos().y;
      down('Space'); step(6); up('Space');
      if (knownLand === null) {
        let landIdx = null;
        for (let i = 1; i <= 200; i++) {
          step();
          if (i > 8 && grounded() && pos().y < groundY + 0.06) { landIdx = i; break; }
        }
        up('KeyW'); step(1);
        return { landIdx, groundY };
      }
      step(Math.max(1, knownLand - early));
      return { groundY, landIdx: knownLand };
    };

    const shape = toJustBeforeLanding(0, null);
    const trials = [];
    if (shape && shape.landIdx !== null) {
      for (const early of [2, 4, 6, 8, 10, 12, 16]) {
        // control: same flight, no second press
        const a = toJustBeforeLanding(early, shape.landIdx);
        let controlPeak = 0;
        if (a) {
          const y0 = a.groundY;
          for (let i = 0; i < 80; i++) { step(); controlPeak = Math.max(controlPeak, pos().y - y0); }
          up('KeyW'); step(1);
        }
        // test: press `early` frames before touchdown
        const b = toJustBeforeLanding(early, shape.landIdx);
        let pressedPeak = 0;
        if (b) {
          const y0 = b.groundY;
          down('Space'); step(3); up('Space');
          for (let i = 0; i < 80; i++) { step(); pressedPeak = Math.max(pressedPeak, pos().y - y0); }
          up('KeyW'); step(1);
        }
        trials.push({
          early, ok: !!(a && b),
          controlPeak: round(controlPeak), pressedPeak: round(pressedPeak),
          rePopped: !!(a && b) && pressedPeak > controlPeak + 0.25,
        });
      }
    }
    const valid = trials.filter((t) => t.ok);
    let buffered = null;
    for (const t of valid) { if (t.rePopped) buffered = Math.max(buffered ?? 0, t.early); }
    out.ollieBuffer = {
      framesBeforeLandingStillPops: buffered,
      gameConstantMs: constants.OLLIE_BUFFER_MS ?? null,
      gameConstantFrames: constants.OLLIE_BUFFER_MS ? round(constants.OLLIE_BUFFER_MS / FRAME_MS, 1) : null,
      landingFrameOfReferenceHop: shape ? shape.landIdx : null,
      trials, ok: valid.length === trials.length && valid.length > 0,
    };
  }

  releaseAll();
  g.isRunning = true;
  return out;
}

// ===========================================================================
// Node side
// ===========================================================================
const METRIC_SPECS = [
  // path, label, tolerance for the self-check (abs), or {rel}
  ['inputLatencyFrames', 'input latency (frames)', { abs: 1 }],
  ['accelSeconds.to4', 'accel: reach 4 m/s (s)', { abs: 0.08 }],
  ['accelSeconds.to8', 'accel: reach 8 m/s (s)', { abs: 0.08 }],
  ['accelSeconds.to12', 'accel: reach 12 m/s (s)', { abs: 0.12 }],
  ['accelSeconds.to16', 'accel: reach 16 m/s (s)', { abs: 0.2 }],
  ['accel.topSpeedInCleanWindow', 'top speed in clean lane (m/s)', { abs: 0.3 }],
  ['coast.fromSpeed', 'coast start speed (m/s)', { abs: 0.3 }],
  ['coast.decayPerSecondInCleanWindow', 'coast decay (m/s per s)', { abs: 0.15 }],
  ['coast.projectedSecondsTo50pct', 'coast to 50% (s, EXTRAPOLATED)', { abs: 1.5 }],
  ['coast.pctKeptOverCleanWindow', 'speed kept over clean coast', { abs: 0.03 }],
  ['coastSeconds.to75pct', 'coast to 75% (s)', { abs: 0.2 }],
  ['coastSeconds.to50pct', 'coast to 50% (s)', { abs: 0.35 }],
  ['ollie.meanHeight', 'ollie height (m)', { abs: 0.03 }],
  ['ollie.heightSpread', 'ollie height spread (m)', { abs: 0.03 }],
  ['ollie.meanAirtime', 'ollie airtime (s)', { abs: 0.04 }],
  ['ollie.meanLandingRetention', 'landing speed retention', { abs: 0.03 }],
  ['ollieStanding.peakHeight', 'standing ollie height (m)', { abs: 0.03 }],
  ['chargeScalesHeight', 'charge height spread (m)', { abs: 0.05 }],
  ['turn.steadyYawRate', 'steady yaw rate (rad/s)', { abs: 0.08 }],
  ['turn.rampToFullRateFrames', 'frames to 90% yaw rate', { abs: 2 }],
  ['turn.turnRadiusMetres', 'turn radius (m)', { abs: 0.3 }],
  ['coyoteFrames', 'coyote window (frames)', { abs: 1 }],
  ['ollieBuffer.framesBeforeLandingStillPops', 'ollie buffer (frames)', { abs: 2 }],
];
const dig = (o, path) => path.split('.').reduce((a, k) => (a === null || a === undefined ? undefined : a[k]), o);

function verdicts(p) {
  const v = [];
  const bad = [];
  const okOf = (path) => { const n = dig(p, path); return n === undefined ? true : n !== false; };
  for (const [probe, label] of [
    ['inputLatency.ok', 'input latency'], ['accel.ok', 'acceleration'], ['coast.ok', 'coast'],
    ['ollie.ok', 'ollie'], ['charge.ok', 'ollie charge'], ['turn.ok', 'turn'],
    ['coyote.ok', 'coyote'], ['ollieBuffer.ok', 'ollie buffer'],
  ]) if (!okOf(probe)) bad.push(label);
  if (bad.length) v.push(`PROBE PRECONDITIONS FAILED (readings not trustworthy): ${bad.join(', ')}`);

  if (p.spawnCheck?.ejects) {
    v.push(`GAME BUG — SPAWN EJECTS THE PLAYER: loading the level throws the chair `
      + `${p.spawnCheck.peakYRise}m up and ${p.spawnCheck.peakSpeedFromNoInput}m/s sideways with no input, `
      + `${p.spawnCheck.airborneFrames} frames airborne. Every run starts with a launch.`);
  }
  if (p.inputLatency?.ok && p.inputLatencyFrames > 3) {
    v.push(`SLUGGISH: ${p.inputLatencyFrames} frames (${p.inputLatencyMs}ms) before pushing does anything; AAA is 1-2`);
  }
  if (p.accel?.ok) {
    if (p.accelSeconds?.to12 === undefined) {
      v.push(`CANNOT REACH CRUISE IN THE AVAILABLE RUNWAY: ${p.lane?.cleanSeconds}s of clear floor `
        + `(${p.lane?.cleanMetres}m) was not enough to reach 12 m/s`);
    } else if (p.accelSeconds.to12 > 3) v.push(`SLOW OFF THE MARK: ${p.accelSeconds.to12}s to reach 12`);
  }
  if (p.coast?.ok && p.coastSeconds?.to50pct !== undefined && p.coastSeconds.to50pct < 2
      && !p.coast.suspectMarks?.includes('to50pct')) {
    v.push(`SPEED DIES: half your speed gone in ${p.coastSeconds.to50pct}s of coasting; THPS carries speed for many seconds`);
  }
  if (p.ollie?.ok) {
    if (p.ollie.heightSpread > 0.08) v.push(`INCONSISTENT OLLIE: same input varies ${p.ollie.heightSpread}m in height — the player cannot learn it`);
    if (p.ollie.meanLandingRetention !== null && p.ollie.meanLandingRetention < 0.85)
      v.push(`LANDINGS KILL SPEED: only ${Math.round(p.ollie.meanLandingRetention * 100)}% retained; THPS keeps ~95%+`);
    if (p.ollie.meanAirtime < 0.45) v.push(`NOT ENOUGH AIRTIME: ${p.ollie.meanAirtime}s leaves no room for a trick`);
    if (p.ollie.standingVsMovingHeightDelta !== null && Math.abs(p.ollie.standingVsMovingHeightDelta) > 0.15)
      v.push(`OLLIE DEPENDS ON SPEED: a standing pop differs from a rolling pop by ${p.ollie.standingVsMovingHeightDelta}m`);
  }
  if (p.charge?.ok) {
    if (p.chargeScalesHeight < 0.05) v.push(`HOLD-TO-CHARGE DOES NOTHING: height varies only ${p.chargeScalesHeight}m between a tap and a full hold`);
    if (!p.charge.monotonic) v.push('HOLD-TO-CHARGE IS NOT MONOTONIC: holding longer sometimes jumps lower — unlearnable');
  }
  if (p.turn?.ok) {
    if (p.turn.rampToFullRateFrames === null) v.push('TURN NEVER REACHES ITS OWN STEADY RATE');
    else if (p.turn.rampToFullRateFrames > 12) v.push(`TURN FEELS HEAVY: ${p.turn.rampToFullRateFrames} frames to reach 90% of its steady rate`);
    if (p.turn.turnRadiusMetres > 6) v.push(`WIDE TURNS: ${p.turn.turnRadiusMetres}m radius at cruise makes tight lines impossible`);
  }
  if (p.coyote?.ok && p.coyoteFrames === 0) v.push('NO COYOTE TIME: leaving a ledge one frame early eats the jump — a classic unfairness');
  if (p.ollieBuffer?.ok && p.ollieBuffer.framesBeforeLandingStillPops === null)
    v.push('NO LANDING BUFFER: an ollie asked for just before touchdown is swallowed');
  return v;
}

function compare(a, b) {
  const rows = [];
  for (const [path, label, tol] of METRIC_SPECS) {
    const x = dig(a, path), y = dig(b, path);
    const both = [x, y].every((v) => typeof v === 'number');
    let reproducible, delta = null;
    if (x === undefined && y === undefined) continue;
    if (!both) reproducible = (x === y);
    else { delta = Math.abs(x - y); reproducible = delta <= (tol.abs ?? 0); }
    rows.push({ metric: path, label, runA: x ?? null, runB: y ?? null, delta: delta === null ? null : +delta.toFixed(4), tolerance: tol.abs ?? null, reproducible });
  }
  return rows;
}

async function main() {
  if (!existsSync(`${ROOT}/dist/index.html`)) {
    console.error('dist/ missing — run `npm run build` first');
    process.exit(2);
  }
  const port = await freePort();
  const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const report = { level: LEVEL, errors: [] };
  let code = 0;

  const onePass = async () => {
    // A FRESH PAGE per pass. The self-check is worth nothing if both passes share a
    // session: the leaks this harness exists to catch live in shared state.
    const page = await (await browser.newContext({ viewport: { width: 320, height: 180 } })).newPage();
    page.on('pageerror', (e) => report.errors.push(String(e).slice(0, 200)));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.game, null, { timeout: 90000 });
    await page.waitForTimeout(400);
    const res = await page.evaluate(runPass, { level: LEVEL });
    await page.context().close().catch(() => {});
    return res;
  };

  try {
    await waitForServer(url);
    report.probes = await onePass();
    if (SELFCHECK) {
      report.probesRunB = await onePass();
      report.selfcheck = compare(report.probes, report.probesRunB);
      report.unreliable = report.selfcheck.filter((r) => !r.reproducible);
    }
  } catch (e) {
    report.errors.push(`HARNESS: ${String(e).slice(0, 400)}`);
    code = 1;
  } finally {
    await browser.close().catch(() => {});
    server.kill('SIGKILL');
  }

  const p = report.probes || {};
  report.verdicts = p.fatal ? [`FATAL: ${p.fatal}`] : verdicts(p);

  if (WANT_JSON) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
  process.exit(code);
}

/**
 * The readable report. A measurement is printed with the conditions it was taken
 * under, because a reader who cannot see the conditions cannot tell a measurement
 * from a failure — which is how this harness got into trouble in the first place.
 */
function printReport(report) {
  const p = report.probes || {};
  const flagged = new Set((report.unreliable || []).map((r) => r.metric));
  const line = (label, value, note = '') => {
    const v = value === null || value === undefined ? '—' : String(value);
    console.log(`  ${label.padEnd(26)} ${v.padEnd(24)} ${note}`);
  };
  const trust = (probe, metricPaths = []) => {
    const bits = [];
    if (probe && probe.ok === false) bits.push('PRECONDITIONS FAILED');
    for (const m of metricPaths) if (flagged.has(m)) bits.push('NOT REPRODUCIBLE');
    return bits.length ? `<< ${[...new Set(bits)].join(' / ')}` : '';
  };

  if (p.fatal) { console.log(`FATAL: ${p.fatal}`); return; }

  console.log(`FEEL — ${report.level}`);
  if (p.lane) {
    console.log(`  measurement lane: anchor (${p.lane.anchor}) heading ${p.lane.headingDeg}deg, `
      + `${p.lane.cleanFrames} clean frames (${p.lane.cleanSeconds}s / ${p.lane.cleanMetres}m), `
      + `ended by ${p.lane.endedBy}`);
  }
  if (p.spawnCheck) {
    console.log(`  authored spawn:   y=${p.spawnCheck.spawnY}, `
      + (p.spawnCheck.ejects
        ? `EJECTS the chair ${p.spawnCheck.peakYRise}m up / ${p.spawnCheck.peakSpeedFromNoInput}m/s with no input`
        : 'settles cleanly'));
  }
  console.log('');
  line('input latency', p.inputLatencyFrames === null ? null : `${p.inputLatencyFrames} frames (${p.inputLatencyMs}ms)`,
    trust(p.inputLatency, ['inputLatencyFrames']));
  const a = p.accelSeconds || {};
  line('accel to 4 / 8 / 12 / 16', `${a.to4 ?? '—'} / ${a.to8 ?? '—'} / ${a.to12 ?? '—'} / ${a.to16 ?? '—'} s`,
    trust(p.accel, ['accelSeconds.to4', 'accelSeconds.to8', 'accelSeconds.to12', 'accelSeconds.to16']));
  line('top speed in lane', p.accel && `${p.accel.topSpeedInCleanWindow} m/s`,
    (p.accel?.stillRisingAtWindowEnd ? '(still rising — lane ran out, not a top speed) ' : '')
    + trust(p.accel, ['accel.topSpeedInCleanWindow']));
  if (p.coast) {
    line('coast decay', `${p.coast.decayPerSecondInCleanWindow} m/s per s from ${p.coast.fromSpeed}`,
      `(authored drag predicts ${p.coast.predictedDecayFromAuthoredDrag}`
      + (p.coast.decayVsAuthoredRatio > 1.05
        ? ` — measured is ${Math.round((p.coast.decayVsAuthoredRatio - 1) * 100)}% higher, so something `
          + 'light is grazing the chair inside the window; treat the authored figure as the model'
        : '') + ') '
      + trust(p.coast, ['coast.decayPerSecondInCleanWindow']));
    line('coast to 50%', `${p.coast.projectedSecondsTo50pct} s`,
      'EXTRAPOLATED — no lane in this level is long enough to measure it '
      + trust(p.coast, ['coast.projectedSecondsTo50pct']));
  }
  if (p.ollie) {
    line('ollie height', `${p.ollie.meanHeight} m  (spread ${p.ollie.heightSpread})`,
      `${p.ollie.validHops}/${p.ollie.attemptedHops} hops valid `
      + trust(p.ollie, ['ollie.meanHeight', 'ollie.heightSpread']));
    line('ollie airtime', `${p.ollie.meanAirtime} s`, trust(p.ollie, ['ollie.meanAirtime']));
    line('landing retention', p.ollie.meanLandingRetention,
      'speed before touchdown vs 6 frames after ' + trust(p.ollie, ['ollie.meanLandingRetention']));
    line('standing vs rolling pop', p.ollie.standingVsMovingHeightDelta === null ? null
      : `${p.ollie.standingVsMovingHeightDelta} m`, trust(p.ollieStanding, ['ollieStanding.peakHeight']));
  }
  if (p.charge) {
    line('hold-to-charge', `${p.chargeScalesHeight} m over ${p.charge.steps.length} hold lengths`,
      (p.charge.monotonic ? 'monotonic ' : 'NOT MONOTONIC ') + trust(p.charge, ['chargeScalesHeight']));
    console.log('    ' + p.charge.steps.map((c) => `${c.holdFrames}f:${c.peakHeight}`).join('  '));
  }
  if (p.turn) {
    line('steady yaw rate', `${p.turn.steadyYawRate} rad/s`,
      `spread ${p.turn.steadyRateSpread}${p.turn.steadyRateNoisy ? ' (NOISY — median used)' : ''} `
      + `over ${p.turn.cleanFrames} clean frames ` + trust(p.turn, ['turn.steadyYawRate']));
    line('turn ramp to 90%', p.turn.rampToFullRateFrames === null ? null
      : `${p.turn.rampToFullRateFrames} frames (${p.turn.rampToFullRateMs}ms)`,
      'of its own measured rate ' + trust(p.turn, ['turn.rampToFullRateFrames']));
    line('turn radius', p.turn.turnRadiusMetres === null ? null
      : `${p.turn.turnRadiusMetres} m at ${p.turn.speedDuringTurn} m/s`,
      trust(p.turn, ['turn.turnRadiusMetres']));
  }
  if (p.coyote) {
    line('coyote window', p.coyote.windowFrames === null ? null
      : `${p.coyote.windowFrames} frames (${p.coyote.windowMs}ms)`,
      `game says ${p.coyote.gameConstantMs}ms; edge cross-check `
      + (p.coyote.crossCheckAgrees === null ? 'unavailable' : p.coyote.crossCheckAgrees ? 'agrees' : 'DISAGREES')
      + (p.coyote.onKnifeEdgeOfGameConstant
        ? `; the next frame sits exactly on the ${p.coyote.gameConstantMs}ms limit, so +/-1 frame here is float rounding, not a change`
        : '')
      + ' ' + trust(p.coyote, ['coyoteFrames']));
  }
  if (p.ollieBuffer) {
    line('ollie landing buffer', p.ollieBuffer.framesBeforeLandingStillPops === null ? null
      : `${p.ollieBuffer.framesBeforeLandingStillPops} frames`,
      `game says ${p.ollieBuffer.gameConstantMs}ms `
      + trust(p.ollieBuffer, ['ollieBuffer.framesBeforeLandingStillPops']));
  }

  if (report.selfcheck) {
    console.log('\nSELF-CHECK (two independent runs, fresh page each):');
    for (const r of report.selfcheck) {
      const flag = r.reproducible ? ' ok ' : 'FLAG';
      console.log(`  [${flag}] ${r.label.padEnd(34)} A=${r.runA}  B=${r.runB}  d=${r.delta}  tol=${r.tolerance}`);
    }
    if (report.unreliable.length) {
      console.log('\nUNRELIABLE — these did not repeat and must not be used for tuning:');
      for (const r of report.unreliable) console.log(`  ${r.label}: ${r.runA} vs ${r.runB}`);
    } else {
      console.log('\nEvery metric above repeated within tolerance. Note that this proves the '
        + 'harness is REPEATABLE, not that it is right — read each probe\'s `pre` block in --json for that.');
    }
  }
  if (report.verdicts.length) console.log('\nFEEL VERDICTS:\n  ' + report.verdicts.join('\n  '));
  else console.log('\nFEEL VERDICTS: none — all measured qualities within AAA expectations');
  console.log('\n(--json for every sample, every precondition and the lane calibration)');
  if (report.errors.length) console.log('errors:', report.errors.slice(0, 3).join(' | '));
}

main();
