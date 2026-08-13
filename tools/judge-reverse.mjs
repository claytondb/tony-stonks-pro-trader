#!/usr/bin/env node
/**
 * JUDGE-REVERSE — an independent probe for one question only:
 *
 *   Does the chair travel backwards relative to the way it is pointing?
 *
 * Written from scratch for the judgement pass. It does NOT import or reuse any of the
 * game's own harnesses, so a bug that hides the reversal inside feel.mjs/play.mjs cannot
 * hide it here.
 *
 * DEFINITION OF THE DEFECT. For every simulated frame:
 *     f  = the chair's forward in world space  = (sin yaw, 0, cos yaw), yaw read off the
 *          rigid body's quaternion with atan2(2(wy+xz), 1-2(yy+zz)) — never Euler.y,
 *          which folds past +/-90 degrees.
 *     v  = planar velocity (vx, 0, vz)
 *   A frame is BACKWARDS when |v| >= MOVING (0.5 m/s, below which a heading is noise)
 *   and dot(v, f) < 0, i.e. the chair is travelling more than 90 degrees off its nose.
 *   Reported: % of moving frames backwards, the worst dot(v,f) in m/s (how fast it was
 *   going backwards), and the longest unbroken backwards streak in frames — because a
 *   player feels duration, not percentage.
 *
 * Both the BODY yaw (what gameplay uses) and the VISUAL group yaw (what the player sees)
 * are measured, so a divergence between them shows up as its own number.
 *
 * Scenarios: pure coast, coast + turning, collision run through props, grind entry+exit,
 * landing from a big drop, brake tap, and brake-from-standstill (is S a reverse gear?).
 *
 * Usage: node tools/judge-reverse.mjs [--json] [--level ch1_office]
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

async function runPass({ level }) {
  const g = window.game;
  const DT = 1 / 60;
  const MOVING = 0.5;          // m/s below which "which way am I going" is meaningless

  window.gameState?.setState?.('playing');
  g.loadLevel(level);
  g.start(); g.resume?.();
  await new Promise((r) => setTimeout(r, 900));
  g.isRunning = false;         // we own the clock

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
  const round = (v, n = 3) => (v === null || v === undefined || !isFinite(v) ? null : +v.toFixed(n));
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const yawQ = (q) => Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
  const bodyYaw = () => yawQ(g.physics.getRotation(g.chairBody));
  const visYaw = () => yawQ(g.chair.quaternion);

  // ---- the sampler --------------------------------------------------------
  const makeSampler = () => {
    const s = {
      frames: 0, moving: 0, back: 0, backVis: 0,
      worstDot: 0, worstDotVis: 0, worstSpeedAtWorst: 0,
      streak: 0, longestStreak: 0, maxYawSplit: 0,
      maxSpeed: 0, samples: [], events: [], byState: {},
    };
    return {
      stats: s,
      tick(tag) {
        const v = vel();
        const speed = Math.hypot(v.x, v.z);
        // Which state the frame was in. A backwards frame IN THE AIR is not the same
        // defect as a backwards frame on the floor: nothing steers velocity in the air by
        // design (you spin, your trajectory does not), so those frames are a separate
        // count and must not be pooled with the ground model's behaviour.
        const st = g.grindSystem?.isGrinding?.() ? 'grind' : (grounded() ? 'ground' : 'air');
        s.byState[st] = s.byState[st] || { frames: 0, moving: 0, back: 0, worst: 0, longest: 0, streak: 0 };
        const bs = s.byState[st];
        const by = bodyYaw(), vy = visYaw();
        const f = { x: Math.sin(by), z: Math.cos(by) };
        const fv = { x: Math.sin(vy), z: Math.cos(vy) };
        const dot = v.x * f.x + v.z * f.z;         // m/s along the nose (signed)
        const dotVis = v.x * fv.x + v.z * fv.z;
        s.frames++; bs.frames++;
        s.maxSpeed = Math.max(s.maxSpeed, speed);
        s.maxYawSplit = Math.max(s.maxYawSplit, Math.abs(wrap(by - vy)));
        if (speed >= MOVING) {
          s.moving++; bs.moving++;
          if (dot < 0) {
            bs.back++; bs.streak++;
            bs.longest = Math.max(bs.longest, bs.streak);
            bs.worst = Math.min(bs.worst, dot);
            s.back++; s.streak++;
            s.longestStreak = Math.max(s.longestStreak, s.streak);
            if (dot < s.worstDot) { s.worstDot = dot; s.worstSpeedAtWorst = speed; }
            if (s.samples.length < 24) {
              s.samples.push({ f: s.frames, tag: tag || null, dot: round(dot, 2), speed: round(speed, 2) });
            }
          } else { s.streak = 0; bs.streak = 0; }
          if (dotVis < 0) {
            s.backVis++;
            if (dotVis < s.worstDotVis) s.worstDotVis = dotVis;
          }
        } else { s.streak = 0; bs.streak = 0; }
      },
      report(extra = {}) {
        return {
          frames: s.frames,
          movingFrames: s.moving,
          backwardFrames: s.back,
          pctBackward: s.moving ? round(100 * s.back / s.moving, 2) : null,
          pctBackwardVisual: s.moving ? round(100 * s.backVis / s.moving, 2) : null,
          worstBackwardMS: round(s.worstDot, 2),
          worstBackwardVisualMS: round(s.worstDotVis, 2),
          speedAtWorst: round(s.worstSpeedAtWorst, 2),
          longestStreakFrames: s.longestStreak,
          longestStreakMs: round(s.longestStreak * DT * 1000, 0),
          maxBodyVsVisualYawDeg: round(s.maxYawSplit * 180 / Math.PI, 1),
          maxSpeed: round(s.maxSpeed, 2),
          firstBackwardFrames: s.samples,
          byState: Object.fromEntries(Object.entries(s.byState).map(([k, b]) => [k, {
            frames: b.frames, movingFrames: b.moving, backwardFrames: b.back,
            pctBackward: b.moving ? round(100 * b.back / b.moving, 2) : null,
            worstBackwardMS: round(b.worst, 2), longestStreakFrames: b.longest,
          }])),
          ...extra,
        };
      },
    };
  };

  // ---- reset primitives (the confounds feel.mjs documents apply here too) --
  const clearPlayerState = () => {
    releaseAll();
    step(1);
    try { if (g.grindSystem?.isGrinding?.()) g.grindSystem.forceEndGrind(); } catch {}
    try { g.balance?.reset?.(); } catch {}
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
  const place = (x, y, z, heading) => {
    g.physics.setPosition(g.chairBody, { x, y, z });
    g.physics.setRotationY(g.chairBody, heading);
    g.physics.setVelocity(g.chairBody, ZERO);
    g.physics.setAngularVelocity(g.chairBody, ZERO);
  };
  const settle = (x, y, z, heading, cap = 240) => {
    clearPlayerState();
    place(x, y, z, heading);
    let stable = 0, lastY = y;
    for (let i = 0; i < cap; i++) {
      step();
      const p = pos();
      const dy = Math.abs(p.y - lastY); lastY = p.y;
      if (grounded() && spd() < 0.03 && dy < 0.002) stable++; else stable = 0;
      if (stable >= 6) break;
    }
    const p = pos();
    return { ok: stable >= 6, restY: round(p.y, 3), pos: [round(p.x, 2), round(p.y, 2), round(p.z, 2)],
      grounded: grounded(), speed: round(spd(), 3), surfaceAngle: round(g.surfaceAngle ?? -1, 1) };
  };

  // ---- lane calibration ---------------------------------------------------
  // Find flat floor and the CLEAREST heading (for coast/brake/landing) and the
  // MOST OBSTRUCTED heading (for the deliberate collision run).
  const anchors = [[0, 0], [0, -9], [9, 0], [-9, 0], [0, 9], [-12, -12], [12, 12]];
  const HEADINGS = [0, 45, 90, 135, 180, 225, 270, 315];
  const trial = (a, restY, deg, cap = 300) => {
    const rad = deg * Math.PI / 180;
    const s = settle(a[0], restY + 0.02, a[1], rad, 90);
    if (!s.ok) return { deg, clean: 0 };
    const yaw0 = bodyYaw();
    let clean = cap, last = spd();
    down('KeyW');
    for (let i = 1; i <= cap; i++) {
      step();
      const now = spd();
      if (!grounded()) { clean = i; break; }
      if (Math.abs(wrap(bodyYaw() - yaw0)) > 0.03) { clean = i; break; }
      if ((g.surfaceAngle ?? 0) > 3) { clean = i; break; }
      if (last - now > Math.max(0.2, 0.02 * last)) { clean = i; break; }
      last = now;
    }
    up('KeyW'); step(1);
    return { deg, clean };
  };
  let LANE = null;
  const calib = [];
  for (const a of anchors) {
    const dropped = settle(a[0], 3.0, a[1], 0, 240);
    if (!dropped.ok || Math.abs(dropped.surfaceAngle) >= 3) { calib.push({ a, ok: false }); continue; }
    const hs = HEADINGS.map((d) => trial(a, dropped.restY, d));
    const best = hs.reduce((b, h) => (!b || h.clean > b.clean ? h : b), null);
    const worst = hs.reduce((b, h) => (!b || h.clean < b.clean ? h : b), null);
    calib.push({ a, restY: dropped.restY, best, worst });
    if (!LANE || best.clean > LANE.clean) {
      LANE = { anchor: a, restY: dropped.restY, deg: best.deg, rad: best.deg * Math.PI / 180,
        clean: best.clean, worstDeg: worst.deg, worstClean: worst.clean };
    }
  }
  if (!LANE) return { fatal: 'no flat lane found on this level', calib };
  const reset = () => settle(LANE.anchor[0], LANE.restY + 0.02, LANE.anchor[1], LANE.rad, 120);
  const out = { lane: LANE, calib, level, MOVING };

  // ---- 1. PURE COAST ------------------------------------------------------
  // Hold push to cruise, release, coast straight. Nothing should ever point backwards.
  // Two windows: the WHOLE 5 s coast (which will run out of clear floor on a level this
  // size and start grazing furniture — that is a real coast, and it is counted), and the
  // CLEAN sub-window up to the first contact, which isolates the movement model alone. If
  // the model itself ever points the velocity backwards with nothing touching the chair,
  // it shows in the clean window and nowhere else.
  {
    const pre = reset();
    down('KeyW'); step(180); up('KeyW'); step(1);
    const entry = round(spd(), 2);
    const s = makeSampler();
    const clean = makeSampler();
    const yaw0 = bodyYaw();
    let last = spd(), dirtyAt = null;
    for (let i = 1; i <= 300; i++) {
      step(); s.tick('coast');
      const now = spd();
      if (dirtyAt === null) {
        if (!grounded() || Math.abs(wrap(bodyYaw() - yaw0)) > 0.03
          || (g.surfaceAngle ?? 0) > 3 || last - now > Math.max(0.2, 0.02 * last)) dirtyAt = i;
        else clean.tick('cleanCoast');
      }
      last = now;
    }
    releaseAll(); step(1);
    out.pureCoast = { pre, entrySpeed: entry, endSpeed: round(spd(), 2),
      firstContactFrame: dirtyAt, ...s.report() };
    out.pureCoastClean = { framesBeforeAnyContact: dirtyAt ?? 300, ...clean.report() };
  }

  // ---- 2. COAST + TURNING (the original 20 s reproduction) ----------------
  // Push 3 s, release, then 20 s of alternating carves. This is the run that read 35%.
  {
    const pre = reset();
    down('KeyW'); step(180); up('KeyW'); step(1);
    const entry = round(spd(), 2);
    const s = makeSampler();
    let key = 'KeyA';
    for (let block = 0; block < 20; block++) {          // 20 x 60 frames = 20 s
      down(key);
      for (let i = 0; i < 45; i++) { step(); s.tick('turn'); }
      up(key);
      for (let i = 0; i < 15; i++) { step(); s.tick('straight'); }
      key = key === 'KeyA' ? 'KeyD' : 'KeyA';
    }
    releaseAll(); step(1);
    out.coastAndTurn = { pre, entrySpeed: entry, endSpeed: round(spd(), 2), ...s.report() };
  }

  // ---- 3. COLLISION RUN ---------------------------------------------------
  // Deliberately the most obstructed heading from the anchor, push held for 10 s: this is
  // the player ploughing through furniture, which is where the reversals came from.
  {
    const pre = settle(LANE.anchor[0], LANE.restY + 0.02, LANE.anchor[1], LANE.worstDeg * Math.PI / 180, 120);
    const s = makeSampler();
    down('KeyW');
    let contacts = 0, lastSpeed = spd();
    for (let i = 0; i < 600; i++) {
      step(); s.tick('collide');
      const now = spd();
      if (lastSpeed - now > Math.max(0.2, 0.02 * lastSpeed)) contacts++;
      lastSpeed = now;
    }
    releaseAll(); step(1);
    out.collisionRun = { pre, headingDeg: LANE.worstDeg, cleanFramesInThisHeading: LANE.worstClean,
      contactEvents: contacts, endSpeed: round(spd(), 2), ...s.report() };
  }

  // ---- 4. GRIND ENTRY AND EXIT -------------------------------------------
  {
    const rails = (g.grindSystem?.rails ?? []).filter(
      (r) => r.length > 5 && r.height < 1.0 && Math.abs(r.direction.y) < 0.1);
    if (!rails.length) {
      out.grind = { error: 'no low, long, level rail available to test' };
    } else {
      // Nearest usable rail to the lane anchor, so the approach runs over known floor.
      rails.sort((a, b) => a.start.distanceTo({ x: LANE.anchor[0], y: LANE.restY, z: LANE.anchor[1] })
        - b.start.distanceTo({ x: LANE.anchor[0], y: LANE.restY, z: LANE.anchor[1] }));
      const rail = rails[0];
      const dir = rail.direction;
      const head = Math.atan2(dir.x, dir.z);
      const approach = 4;
      const p = settle(rail.start.x - dir.x * approach, rail.height + 0.9,
        rail.start.z - dir.z * approach, head, 200);
      const s = makeSampler();
      // Drive at the rail with the grind button held.
      g.physics.setVelocity(g.chairBody, { x: dir.x * 10, y: 0, z: dir.z * 10 });
      g.carriedSpeed = 10;
      down('KeyW'); down('KeyL');
      let started = null, ended = null;
      for (let i = 0; i < 900; i++) {
        step(); s.tick(started === null ? 'approach' : (ended === null ? 'grinding' : 'exit'));
        const gr = !!g.grindSystem?.isGrinding?.();
        if (gr && started === null) started = i;
        if (!gr && started !== null && ended === null) ended = i;
        if (ended !== null && i > ended + 180) break;
      }
      releaseAll(); step(1);
      // Isolate the exit itself: 120 frames from the frame the grind released.
      const exitStats = { note: 'exit measured inside the same sampler; see streak/worst' };
      out.grind = { railId: rail.id, railLength: round(rail.length, 1), railHeight: round(rail.height, 2),
        approachSettled: p.ok, grindStartedAtFrame: started, grindEndedAtFrame: ended,
        grindHappened: started !== null, ...s.report(exitStats) };
    }
  }

  // ---- 4b. GRIND EXIT IN ISOLATION ---------------------------------------
  // Same setup, but only sampled from the frame the grind ends. The exit forces both
  // rotation and velocity, so if either convention is inverted it shows here alone.
  if (out.grind && out.grind.grindHappened) {
    const rails = (g.grindSystem?.rails ?? []).filter(
      (r) => r.id === out.grind.railId);
    const rail = rails[0];
    const dir = rail.direction;
    const head = Math.atan2(dir.x, dir.z);
    settle(rail.start.x - dir.x * 4, rail.height + 0.9, rail.start.z - dir.z * 4, head, 200);
    g.physics.setVelocity(g.chairBody, { x: dir.x * 10, y: 0, z: dir.z * 10 });
    g.carriedSpeed = 10;
    down('KeyW'); down('KeyL');
    let started = false, ended = false;
    const s = makeSampler();
    for (let i = 0; i < 900; i++) {
      step();
      const gr = !!g.grindSystem?.isGrinding?.();
      if (gr) started = true;
      if (started && !gr) ended = true;
      if (ended) s.tick('afterExit');
      if (s.stats.frames >= 180) break;
    }
    releaseAll(); step(1);
    out.grindExitOnly = { sampledFrames: s.stats.frames, ...s.report() };
  }

  // ---- 5. LANDING FROM A BIG DROP ----------------------------------------
  {
    reset();
    const a = LANE.anchor;
    place(a[0], LANE.restY + 7, a[1], LANE.rad);
    g.physics.setVelocity(g.chairBody, { x: Math.sin(LANE.rad) * 11, y: 0, z: Math.cos(LANE.rad) * 11 });
    g.carriedSpeed = 11;
    if (g.playerState) { g.playerState.isGrounded = false; g.playerState.isAirborne = true; }
    let touchdown = null;
    const s = makeSampler();
    for (let i = 0; i < 400; i++) {
      step();
      if (touchdown === null && grounded() && i > 4) touchdown = i;
      if (touchdown !== null) s.tick('landed');
      if (touchdown !== null && i > touchdown + 180) break;
    }
    releaseAll(); step(1);
    out.bigDropLanding = { touchdownFrame: touchdown, sampledFrames: s.stats.frames,
      landedSpeed: round(spd(), 2), ...s.report() };
  }

  // ---- 6. BRAKE TAP -------------------------------------------------------
  {
    const pre = reset();
    down('KeyW'); step(180); up('KeyW'); step(1);
    const before = round(spd(), 2);
    const yaw0 = bodyYaw();
    const p0 = pos();
    const s = makeSampler();
    down('KeyS');
    for (let i = 0; i < 30; i++) { step(); s.tick('braking'); }
    up('KeyS'); step(1);
    const afterBrake = round(spd(), 2);
    for (let i = 0; i < 120; i++) { step(); s.tick('afterBrake'); }
    releaseAll(); step(1);
    const p1 = pos();
    const travelAlongNose = (p1.x - p0.x) * Math.sin(yaw0) + (p1.z - p0.z) * Math.cos(yaw0);
    out.brakeTap = { pre, speedBeforeBrake: before, speedAfterBrake: afterBrake,
      netTravelAlongFacing: round(travelAlongNose, 2), ...s.report() };
  }

  // ---- 7. IS S A REVERSE GEAR? -------------------------------------------
  // Hold brake from a standstill for two seconds. A reverse gear would move the chair
  // backwards; a brake does nothing at all.
  {
    const pre = reset();
    const p0 = pos();
    const yaw0 = bodyYaw();
    const s = makeSampler();
    down('KeyS');
    for (let i = 0; i < 120; i++) { step(); s.tick('brakeFromRest'); }
    up('KeyS'); step(1);
    const p1 = pos();
    const along = (p1.x - p0.x) * Math.sin(yaw0) + (p1.z - p0.z) * Math.cos(yaw0);
    out.brakeFromStandstill = { pre, netTravelAlongFacing: round(along, 3),
      maxSpeed: round(s.stats.maxSpeed, 3), movedBackwards: along < -0.25, ...s.report() };
  }

  // ---- 8. WORST CASE ON PURPOSE: velocity injected dead astern -----------
  // Not a player scenario — an adversarial one. Slam the body's velocity to full speed
  // straight backwards (which is what a solver impulse can do in one frame) and count how
  // long the model lets that persist. This is the state the player was complaining about.
  {
    reset();
    const f = { x: Math.sin(LANE.rad), z: Math.cos(LANE.rad) };
    g.physics.setVelocity(g.chairBody, { x: -f.x * 12, y: 0, z: -f.z * 12 });
    g.carriedSpeed = 12;
    const s = makeSampler();
    let recoveredAt = null;
    for (let i = 0; i < 240; i++) {
      step(); s.tick('astern');
      const v = vel(); const by = bodyYaw();
      const dot = v.x * Math.sin(by) + v.z * Math.cos(by);
      const sp = Math.hypot(v.x, v.z);
      if (recoveredAt === null && (sp < 0.5 || dot >= 0)) recoveredAt = i + 1;
    }
    releaseAll(); step(1);
    out.injectedReversal = { recoveredAfterFrames: recoveredAt,
      recoveredAfterMs: recoveredAt === null ? null : round(recoveredAt * DT * 1000, 0),
      ...s.report() };
  }

  // ---- 9. PUSH WHILE REVERSED --------------------------------------------
  // The player's instinct when shoved backwards is to hold forward. That must not
  // accelerate them further backwards.
  {
    reset();
    const f = { x: Math.sin(LANE.rad), z: Math.cos(LANE.rad) };
    g.physics.setVelocity(g.chairBody, { x: -f.x * 12, y: 0, z: -f.z * 12 });
    g.carriedSpeed = 12;
    const s = makeSampler();
    down('KeyW');
    let recoveredAt = null, worstBackSpeed = 0;
    for (let i = 0; i < 240; i++) {
      step(); s.tick('pushWhileReversed');
      const v = vel(); const by = bodyYaw();
      const dot = v.x * Math.sin(by) + v.z * Math.cos(by);
      worstBackSpeed = Math.min(worstBackSpeed, dot);
      if (recoveredAt === null && (Math.hypot(v.x, v.z) < 0.5 || dot >= 0)) recoveredAt = i + 1;
    }
    releaseAll(); step(1);
    out.pushWhileReversed = { recoveredAfterFrames: recoveredAt,
      worstBackwardsWhilePushing: round(worstBackSpeed, 2), ...s.report() };
  }

  // ---- 10. THE LOW-SPEED HOLE --------------------------------------------
  // The anti-reverse rules are gated on speed > REALIGN_MIN_SPEED (0.9 m/s). Below that
  // the chair is declared "too slow for a heading to mean anything" — but carriedSpeed is
  // untouched, and the speed restore hands back 93% of it along whatever direction the
  // velocity currently points. So: park a slow BACKWARDS velocity while the entitlement is
  // full, and see whether the restore re-inflates a reversed line. This is exactly the
  // frame pair the grind-exit case caught (0.53 m/s astern -> 11.9 m/s astern).
  {
    reset();
    const f = { x: Math.sin(LANE.rad), z: Math.cos(LANE.rad) };
    for (const inject of [0.5, 0.85, 1.2]) {
      reset();
      g.physics.setVelocity(g.chairBody, { x: -f.x * inject, y: 0, z: -f.z * inject });
      g.carriedSpeed = 12;                 // as if the player had just been at full speed
      const trace = [];
      let peakBackwards = 0;
      for (let i = 0; i < 30; i++) {
        step();
        const v = vel(); const by = bodyYaw();
        const dot = v.x * Math.sin(by) + v.z * Math.cos(by);
        const sp = Math.hypot(v.x, v.z);
        peakBackwards = Math.min(peakBackwards, dot);
        if (i < 8) trace.push({ f: i + 1, speed: round(sp, 2), dot: round(dot, 2) });
      }
      (out.lowSpeedHole ??= []).push({ injectedBackwardsMS: inject,
        peakBackwardsMS: round(peakBackwards, 2), firstFrames: trace });
    }
    releaseAll(); step(1);
  }

  // ---- 11. AIR SPIN: DOES THE PLAYER SEE A DIFFERENT CHAIR? --------------
  // The visual group takes spinRotation*dt on top of the body's rotation. If the body
  // never receives the spin, the player watches the chair point one way and land pointing
  // another — which reads as "it rolled off backwards" without any velocity ever reversing.
  {
    reset();
    down('KeyW'); step(120); up('KeyW');
    down('Space'); step(2); up('Space');
    down('KeyQ');
    let maxSplit = 0, airFrames = 0, splitAtLanding = null, wasAir = false;
    let bodyYawStart = null, visYawStart = null, bodyYawEnd = null, visYawEnd = null;
    for (let i = 0; i < 200; i++) {
      step();
      const split = Math.abs(wrap(bodyYaw() - visYaw()));
      if (!grounded()) {
        if (!wasAir) { bodyYawStart = bodyYaw(); visYawStart = visYaw(); wasAir = true; }
        airFrames++; maxSplit = Math.max(maxSplit, split);
      } else if (wasAir) { splitAtLanding = split; bodyYawEnd = bodyYaw(); visYawEnd = visYaw(); break; }
    }
    up('KeyQ'); releaseAll(); step(1);
    out.airSpinVisualSplit = {
      airFrames,
      maxBodyVsVisualYawDeg: round(maxSplit * 180 / Math.PI, 1),
      splitAtLandingDeg: splitAtLanding === null ? null : round(splitAtLanding * 180 / Math.PI, 1),
      bodyYawTurnedDeg: bodyYawEnd === null ? null : round(wrap(bodyYawEnd - bodyYawStart) * 180 / Math.PI, 1),
      visualYawTurnedDeg: visYawEnd === null ? null : round(wrap(visYawEnd - visYawStart) * 180 / Math.PI, 1),
    };
  }

  // ---- 12. A 60 SECOND PLAYER-LIKE RUN -----------------------------------
  // Everything above is an isolated experiment. This is the closest thing to the session
  // the owner actually played: start at the AUTHORED spawn, hold the push, steer with a
  // seeded pseudo-random hand, ollie and reach for rails, and never reset. It crosses the
  // whole level, hits whatever it hits, and counts every frame.
  {
    clearPlayerState();
    g.loadLevel(level);
    g.physics.setVelocity(g.chairBody, ZERO);
    g.physics.setAngularVelocity(g.chairBody, ZERO);
    step(60);                                   // let the spawn settle
    let seed = 1337;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const s = makeSampler();
    let turnKey = null, turnLeft = 0;
    down('KeyW');
    for (let i = 0; i < 3600; i++) {
      if (turnLeft <= 0) {
        if (turnKey) { up(turnKey); turnKey = null; }
        const r = rnd();
        if (r < 0.4) { turnKey = 'KeyA'; down(turnKey); }
        else if (r < 0.8) { turnKey = 'KeyD'; down(turnKey); }
        turnLeft = 20 + Math.floor(rnd() * 60);
      }
      turnLeft--;
      if (i % 90 === 0) down('Space'); else if (i % 90 === 3) up('Space');
      if (i % 150 === 0) down('KeyL'); else if (i % 150 === 60) up('KeyL');
      step(); s.tick('freerun');
    }
    releaseAll(); step(1);
    out.freeRun60s = { ...s.report() };
  }

  // ---- 13. THE SAME RUN, BUT NEVER STEERING IN THE AIR -------------------
  // Discriminator for the air frames. Nothing steers a ballistic trajectory, so if the
  // player holds a turn through a hop the chair rotates and the velocity does not — which
  // this probe scores as "backwards" even though the player asked for every degree of it.
  // Repeat the run with the turn released the instant the wheels leave the floor: what is
  // left in the air column is rotation NOBODY asked for.
  {
    clearPlayerState();
    g.loadLevel(level);
    g.physics.setVelocity(g.chairBody, ZERO);
    g.physics.setAngularVelocity(g.chairBody, ZERO);
    step(60);
    let seed = 1337;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const s = makeSampler();
    let turnKey = null, turnLeft = 0;
    down('KeyW');
    for (let i = 0; i < 3600; i++) {
      if (turnLeft <= 0) {
        if (turnKey) { up(turnKey); turnKey = null; }
        const r = rnd();
        if (r < 0.4) turnKey = 'KeyA'; else if (r < 0.8) turnKey = 'KeyD';
        turnLeft = 20 + Math.floor(rnd() * 60);
      }
      turnLeft--;
      // The only difference from probe 12.
      if (turnKey) { if (grounded()) down(turnKey); else up(turnKey); }
      if (i % 90 === 0) down('Space'); else if (i % 90 === 3) up('Space');
      if (i % 150 === 0) down('KeyL'); else if (i % 150 === 60) up('KeyL');
      step(); s.tick('freerunNoAirTurn');
    }
    releaseAll(); step(1);
    out.freeRun60sNoAirSteering = { ...s.report() };
  }

  return out;
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
  try {
    await waitForServer(url);
    const page = await (await browser.newContext({ viewport: { width: 320, height: 180 } })).newPage();
    page.on('pageerror', (e) => report.errors.push(String(e).slice(0, 200)));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.game, null, { timeout: 90000 });
    await page.waitForTimeout(400);
    report.probes = await page.evaluate(runPass, { level: LEVEL });
    await page.context().close().catch(() => {});
  } catch (e) {
    report.errors.push(`HARNESS: ${String(e).slice(0, 400)}`);
    code = 1;
  } finally {
    await browser.close().catch(() => {});
    server.kill('SIGKILL');
  }

  if (WANT_JSON) { console.log(JSON.stringify(report, null, 2)); process.exit(code); }

  const p = report.probes || {};
  if (p.fatal) { console.log('FATAL:', p.fatal); process.exit(1); }
  const row = (name, r) => {
    if (!r) { console.log(`  ${name.padEnd(22)} —`); return; }
    if (r.error) { console.log(`  ${name.padEnd(22)} ${r.error}`); return; }
    console.log(`  ${name.padEnd(22)} ${String(r.pctBackward).padStart(6)}%  worst ${String(r.worstBackwardMS).padStart(7)} m/s  `
      + `streak ${String(r.longestStreakFrames).padStart(3)}f (${r.longestStreakMs}ms)  `
      + `moving ${r.movingFrames}/${r.frames}f  visual ${r.pctBackwardVisual}% split ${r.maxBodyVsVisualYawDeg}deg`);
  };
  console.log(`\nJUDGE-REVERSE — ${report.level}   (backwards = |v|>=${p.MOVING} m/s and v·forward < 0)`);
  console.log(`  lane: anchor ${JSON.stringify(p.lane?.anchor)} clear heading ${p.lane?.deg}deg `
    + `(${p.lane?.clean} clean frames), most obstructed ${p.lane?.worstDeg}deg (${p.lane?.worstClean})\n`);
  row('pure coast', p.pureCoast);
  row('  ...clean window', p.pureCoastClean);
  row('coast + turning 20s', p.coastAndTurn);
  row('collision run 10s', p.collisionRun);
  row('grind entry+exit', p.grind);
  row('grind exit only', p.grindExitOnly);
  row('big drop landing', p.bigDropLanding);
  row('brake tap', p.brakeTap);
  row('brake from standstill', p.brakeFromStandstill);
  row('injected reversal', p.injectedReversal);
  row('push while reversed', p.pushWhileReversed);
  row('60s player-like run', p.freeRun60s);
  row('  ...no air steering', p.freeRun60sNoAirSteering);
  console.log('');
  if (p.brakeTap) console.log(`  brake tap: ${p.brakeTap.speedBeforeBrake} -> ${p.brakeTap.speedAfterBrake} m/s, `
    + `net travel along facing ${p.brakeTap.netTravelAlongFacing} m (negative = drove backwards)`);
  if (p.brakeFromStandstill) console.log(`  S held 2 s from rest: moved ${p.brakeFromStandstill.netTravelAlongFacing} m `
    + `along facing, peak speed ${p.brakeFromStandstill.maxSpeed} m/s -> reverse gear: `
    + `${p.brakeFromStandstill.movedBackwards ? 'YES' : 'no'}`);
  if (p.injectedReversal) console.log(`  full-speed reversal injected: recovered after `
    + `${p.injectedReversal.recoveredAfterFrames} frames (${p.injectedReversal.recoveredAfterMs} ms)`);
  if (p.grind) console.log(`  grind: rail ${p.grind.railId}, started frame ${p.grind.grindStartedAtFrame}, `
    + `ended frame ${p.grind.grindEndedAtFrame}`);
  if (report.errors.length) console.log('\nerrors:', report.errors.slice(0, 3).join(' | '));
  process.exit(code);
}

main();
