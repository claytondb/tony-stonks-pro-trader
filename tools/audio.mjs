#!/usr/bin/env node
/**
 * AUDIO harness for Tony Stonks Pro Trader.
 *
 * You cannot hear a screenshot, and a sound system that never fires looks
 * finished from the outside. This harness answers two different questions with
 * two different mechanisms:
 *
 *   --mode events   (default)
 *     Replaces window.AudioContext with a RECORDING STUB before the app loads,
 *     then drives the game through a scripted run using the same
 *     fixedUpdate-stepping approach as tools/play.mjs. The stub's clock is the
 *     SIMULATION clock, so throttles, voice lifetimes and the music scheduler
 *     all behave in simulated time. It reports every audio call that fired, when
 *     it fired, and a 20 Hz timeline of every continuous bed's gain — so
 *     "silent" is a measurement, not an opinion.
 *
 *   --mode levels
 *     Renders each sound for real through an OfflineAudioContext (Chromium
 *     renders these properly) and measures true peak and RMS dBFS at the
 *     destination, through the actual limiter. This is the only way to check
 *     gain staging and clipping honestly.
 *
 * Usage:
 *   node tools/audio.mjs --mode events --level ch1_office --script "..." --duration 26
 *   node tools/audio.mjs --mode levels
 *   node tools/audio.mjs --mode events --json > /tmp/audio.json
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import net from 'node:net';

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  if (i === -1) return d;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const has = (n) => argv.includes(`--${n}`);

const MODE = String(arg('mode', 'events'));
const LEVEL = String(arg('level', 'ch1_office'));
const DEFAULT_SCRIPT =
  'W:0-26,L:0-26,Down:6@tap,Up:6.12@tap,Space:12@tap,J:12.2@tap,Down:15@tap,Up:15.12@tap,K:19@tap';
const SCRIPT = String(arg('script', DEFAULT_SCRIPT));
const DURATION = Number(arg('duration', 26));
const WANT_JSON = has('json');
const SAVE = arg('save', null);
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

const KEYMAP = {
  W: 'KeyW', A: 'KeyA', S: 'KeyS', D: 'KeyD', Space: 'Space',
  Shift: 'ShiftLeft', Ctrl: 'ControlLeft', J: 'KeyJ', K: 'KeyK', L: 'KeyL',
  E: 'KeyE', Q: 'KeyQ', Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight',
};

function parseScript(s) {
  const out = [];
  for (const partRaw of s.split(',')) {
    const part = partRaw.trim();
    if (!part) continue;
    const [key, spec] = part.split(':');
    if (!spec) continue;
    if (spec.endsWith('@tap')) {
      const t = Number(spec.slice(0, -4));
      out.push({ key, down: t, up: t + 0.12 });
    } else {
      const [a, b] = spec.split('-').map(Number);
      out.push({ key, down: a, up: b });
    }
  }
  return out.sort((x, y) => x.down - y.down);
}

const freePort = () => new Promise((res) => {
  const s = net.createServer();
  s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); });
});

const waitForServer = async (url, ms = 30000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try { if ((await fetch(url)).ok) return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server never came up at ${url}`);
};

// ---------------------------------------------------------------------------
// The recording AudioContext stub, injected before any app code runs.
// ---------------------------------------------------------------------------
const STUB = `(() => {
  const REC = { events: [], nodes: 0, clock: 0, intervals: [] };
  window.__arec = REC;

  const now = () => REC.clock;

  // --- AudioParam with real-enough scheduling so .value reads are meaningful --
  class P {
    constructor(owner, name, v) { this.__o = owner; this.__n = name; this._base = v; this._ev = []; }
    _push(e) {
      this._ev.push(e);
      this._ev.sort((a, b) => a.t - b.t);
      REC.events.push({ k: 'param', o: this.__o, p: this.__n, op: e.type, v: e.v, t: e.t, at: now() });
    }
    get value() { return this._eval(now()); }
    set value(v) { this._base = v; this._ev.length = 0; }
    setValueAtTime(v, t) { this._push({ type: 'set', v, t }); return this; }
    linearRampToValueAtTime(v, t) { this._push({ type: 'lin', v, t }); return this; }
    exponentialRampToValueAtTime(v, t) { this._push({ type: 'exp', v, t }); return this; }
    setTargetAtTime(v, t, tc) { this._push({ type: 'tgt', v, t, tc }); return this; }
    setValueCurveAtTime(c, t) { this._push({ type: 'set', v: c[c.length - 1], t }); return this; }
    cancelScheduledValues(t) { this._ev = this._ev.filter((e) => e.t < t); return this; }
    cancelAndHoldAtTime(t) { return this.cancelScheduledValues(t); }
    _eval(t) {
      let v = this._base, lastT = -1e9;
      for (let i = 0; i < this._ev.length; i++) {
        const e = this._ev[i];
        if (e.t <= t) {
          if (e.type === 'tgt') {
            const next = this._ev[i + 1];
            const end = next && next.t <= t ? next.t : t;
            v = e.v + (v - e.v) * Math.exp(-(end - e.t) / Math.max(1e-6, e.tc));
            lastT = end;
            if (next && next.t <= t) continue;
            return v;
          }
          v = e.v; lastT = e.t; continue;
        }
        // event is in the future: ramps interpolate, everything else holds
        if (e.type === 'lin') {
          const a = (t - lastT) / Math.max(1e-9, e.t - lastT);
          return v + (e.v - v) * Math.max(0, Math.min(1, a));
        }
        if (e.type === 'exp') {
          const a = (t - lastT) / Math.max(1e-9, e.t - lastT);
          const v0 = Math.max(1e-9, v), v1 = Math.max(1e-9, e.v);
          return v0 * Math.pow(v1 / v0, Math.max(0, Math.min(1, a)));
        }
        return v;
      }
      return v;
    }
  }

  let ID = 0;
  class N {
    constructor(kind) {
      this.__id = ++ID; this.__kind = kind; this.__out = [];
      this.numberOfInputs = 1; this.numberOfOutputs = 1;
      this.channelCount = 2;
    }
    __p(name, v) { const p = new P(this.__kind + '#' + this.__id, name, v); this[name] = p; return p; }
    connect(dst) { this.__out.push(dst); REC.events.push({ k: 'connect', from: this.__kind + '#' + this.__id, to: (dst && dst.__kind ? dst.__kind + '#' + dst.__id : (dst && dst.__o ? dst.__o + '.' + dst.__n : 'destination')), at: now() }); return dst; }
    disconnect() { this.__out.length = 0; }
    addEventListener() {} removeEventListener() {}
  }

  class Src extends N {
    constructor(kind) { super(kind); this.__started = false; }
    start(t) { this.__started = true; this.__t0 = (t === undefined ? now() : t); REC.events.push({ k: 'start', kind: this.__kind, id: this.__id, t: this.__t0, at: now() }); }
    stop(t) { this.__t1 = (t === undefined ? now() : t); REC.events.push({ k: 'stop', kind: this.__kind, id: this.__id, t: this.__t1, at: now() }); }
  }

  class StubCtx {
    constructor() {
      this.sampleRate = 48000;
      this.destination = new N('destination');
      this.listener = { positionX: new P('listener', 'x', 0) };
      REC.ctx = this;
    }
    get currentTime() { return REC.clock; }
    get state() { return 'running'; }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
    createGain() { const n = new N('gain'); n.__p('gain', 1); return n; }
    createOscillator() { const n = new Src('osc'); n.type = 'sine'; n.__p('frequency', 440); n.__p('detune', 0); return n; }
    createBufferSource() { const n = new Src('buf'); n.buffer = null; n.loop = false; n.__p('playbackRate', 1); n.__p('detune', 0); return n; }
    createBiquadFilter() { const n = new N('biquad'); n.type = 'lowpass'; n.__p('frequency', 350); n.__p('Q', 1); n.__p('gain', 0); n.__p('detune', 0); return n; }
    createDynamicsCompressor() { const n = new N('comp'); n.__p('threshold', -24); n.__p('knee', 30); n.__p('ratio', 12); n.__p('attack', 0.003); n.__p('release', 0.25); n.reduction = 0; return n; }
    createWaveShaper() { const n = new N('shaper'); n.curve = null; n.oversample = 'none'; return n; }
    createConvolver() { const n = new N('conv'); n.buffer = null; n.normalize = true; return n; }
    createDelay(max) { const n = new N('delay'); n.__p('delayTime', 0); n.__max = max; return n; }
    createStereoPanner() { const n = new N('panner'); n.__p('pan', 0); return n; }
    createPanner() { const n = new N('panner3d'); n.__p('positionX', 0); return n; }
    createAnalyser() { const n = new N('analyser'); n.fftSize = 2048; n.frequencyBinCount = 1024; n.getByteFrequencyData = () => {}; n.getFloatTimeDomainData = () => {}; return n; }
    createChannelMerger() { return new N('merger'); }
    createChannelSplitter() { return new N('splitter'); }
    createBuffer(ch, len, sr) {
      const data = []; for (let i = 0; i < ch; i++) data.push(new Float32Array(len));
      return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: (i) => data[i] };
    }
    decodeAudioData() { return Promise.reject(new Error('no assets')); }
  }

  window.AudioContext = StubCtx;
  window.webkitAudioContext = StubCtx;

  // Capture the music scheduler's interval so the harness can tick it against
  // simulated time instead of wall clock.
  const realSetInterval = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...rest) => {
    REC.intervals.push({ fn, ms });
    return realSetInterval(fn, ms, ...rest);
  };
})();`;

// ---------------------------------------------------------------------------
// MODE: events
// ---------------------------------------------------------------------------
async function runEvents(page, report) {
  const events = parseScript(SCRIPT);

  await page.evaluate(async ({ level }) => {
    const g = window.game;
    window.gameState?.setState?.('playing');
    g.loadLevel(level);
    g.start(); g.resume?.();
    g.postFX?.setQuality?.('off');
    if (g.renderer?.shadowMap) g.renderer.shadowMap.enabled = false;
    document.getElementById('ui-overlay')?.style.setProperty('visibility', 'hidden');
  }, { level: LEVEL });

  await page.waitForTimeout(800);

  // Instrument every public audio entry point.
  await page.evaluate(() => {
    const calls = [];
    window.__acalls = calls;
    const wrap = (obj, label) => {
      const proto = Object.getPrototypeOf(obj);
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === 'constructor') continue;
        const d = Object.getOwnPropertyDescriptor(proto, name);
        if (!d || typeof d.value !== 'function') continue;
        const orig = d.value;
        obj[name] = function (...args) {
          // A call is not a sound. Throttles, voice-budget refusals and latches
          // all make a method return without touching the audio graph, so the
          // only honest measure of "did this actually fire" is whether the call
          // created any graph events at all.
          const before = window.__arec.events.length;
          const r = orig.apply(this, args);
          calls.push({
            n: label + '.' + name,
            t: +(window.__arec.clock).toFixed(3),
            d: window.__arec.events.length - before,
            a: args.map((v) => (typeof v === 'number' ? +v.toFixed(3) : typeof v === 'object' ? '{}' : v)),
          });
          return r;
        };
      }
    };
    wrap(window.proceduralSounds, 'sfx');
    wrap(window.soundManager, 'music');
  });

  await page.evaluate(({ events, runFor, keymap }) => {
    const g = window.game;
    const ps = window.proceduralSounds;
    const sm = window.soundManager;
    const REC = window.__arec;
    const DT = 1 / 60;
    window.__tel = { t: 0, samples: [], done: false };
    const tel = window.__tel;

    g.isRunning = false;
    const fire = (type, code) => window.dispatchEvent(
      new KeyboardEvent(type, { code, key: code, bubbles: true }));
    const held = new Set();
    let steps = 0;
    let nextMusicTick = 0;

    const gv = (n) => (n ? +n.gain.value.toFixed(4) : null);
    const sample = () => {
      const s = g.playerState || {};
      let vel = { x: 0, y: 0, z: 0 };
      try { vel = g.physics.getVelocity(g.chairBody); } catch { /* pre-spawn */ }
      let combo = null;
      try { combo = g.score?.state || null; } catch { /* no score yet */ }
      tel.samples.push({
        t: +tel.t.toFixed(3),
        spd: +Math.hypot(vel.x, vel.z).toFixed(2),
        grind: !!s.isGrinding, air: !!s.isAirborne,
        bal: +(g.balance?.balance01 ?? 0.5).toFixed(3),
        comboOpen: !!combo?.open,
        mult: +(g.score?.multiplier ?? 1).toFixed(2),
        heat: +(g.police?.heatLevel ?? 0).toFixed(3),
        // --- the audio engine's own continuous state ---
        roll: gv(ps.rollOut),
        rollRate: ps.rollSrc ? +ps.rollSrc.playbackRate.value.toFixed(3) : null,
        caster: gv(ps.casterGain),
        grindG: gv(ps.grindOut),
        grindRate: ps.grindSrc ? +ps.grindSrc.playbackRate.value.toFixed(3) : null,
        grindF0: ps.grindModes && ps.grindModes[0] ? Math.round(ps.grindModes[0].frequency.value) : null,
        anx: gv(ps.anxOut),
        anxHz: ps.anxTrem ? +ps.anxTrem.frequency.value.toFixed(2) : null,
        riser: gv(ps.riserOut),
        drone: gv(ps.droneOut),
        heatG: gv(ps.heatOut),
        duck: gv(ps.musicDuck),
        keys: gv(sm.keysGain), lead: gv(sm.leadGain), tension: gv(sm.tensionGain),
        bpm: +(sm.bpm ?? 0).toFixed(1),
        intensity: +(sm.intensity ?? 0).toFixed(3),
        voices: ps.voices ? ps.voices.length : 0,
      });
    };

    const CHUNK = 240;
    const runChunk = () => {
      let n = 0;
      while (tel.t < runFor && n < CHUNK) {
        for (const e of events) {
          const code = keymap[e.key] || e.key;
          if (tel.t >= e.down && tel.t < e.up && !held.has(code)) { fire('keydown', code); held.add(code); }
          if (tel.t >= e.up && held.has(code)) { fire('keyup', code); held.delete(code); }
        }
        REC.clock = tel.t;
        try { g.fixedUpdate(DT); } catch (err) {
          tel.error = String(err).slice(0, 300); tel.done = true; return;
        }
        tel.t += DT; steps++; n++;
        // Drive the music scheduler against SIM time, not wall clock.
        if (tel.t >= nextMusicTick) {
          nextMusicTick = tel.t + 0.025;
          for (const iv of REC.intervals) { try { iv.fn(); } catch { /* scheduler guard */ } }
        }
        if (steps % 3 === 0) sample();
      }
      if (tel.t >= runFor) {
        for (const c of held) fire('keyup', c);
        tel.done = true;
        g.isRunning = true;
      } else setTimeout(runChunk, 0);
    };
    runChunk();
  }, { events, runFor: DURATION, keymap: KEYMAP });

  await page.waitForFunction(() => window.__tel?.done === true, null, { timeout: 600000 });

  const raw = await page.evaluate(() => {
    const REC = window.__arec;
    const calls = window.__acalls;
    // Count node starts by kind — proof that synthesis actually ran.
    const starts = {};
    for (const e of REC.events) if (e.k === 'start') starts[e.kind] = (starts[e.kind] || 0) + 1;
    return {
      samples: window.__tel.samples,
      error: window.__tel.error || null,
      calls,
      nodeStarts: starts,
      totalGraphEvents: REC.events.length,
    };
  });

  if (raw.error) report.errors.push(`SIM: ${raw.error}`);

  // ---- fold the call log -----------------------------------------------------
  const byName = {};
  for (const c of raw.calls) {
    // update()/updateGrind()/updateWheelRoll() fire every frame; they are noise
    const b = (byName[c.n] ||= { calls: 0, sounded: 0, firstSoundedT: null, lastSoundedT: null, sampleArgs: null });
    b.calls++;
    if (c.d > 0) {
      b.sounded++;
      if (b.firstSoundedT === null) { b.firstSoundedT = c.t; b.sampleArgs = c.a; }
      b.lastSoundedT = c.t;
    }
  }
  const oneShots = Object.fromEntries(
    Object.entries(byName).filter(([k]) => !/\.(update|updateGrind|updateWheelRoll|updateBalanceWarning|updatePolice|setComboState)$/.test(k)),
  );

  const S = raw.samples;
  const at = (f) => S.filter(f);
  const max = (k) => S.reduce((m, s) => (s[k] != null && s[k] > m ? s[k] : m), 0);
  const nonNull = (k) => S.filter((s) => s[k] != null && s[k] > 1e-4).length;

  const rolling = at((s) => !s.grind && !s.air && s.spd > 2);
  const grinding = at((s) => s.grind);
  const corr = (xs, ys) => {
    const n = xs.length; if (n < 3) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx < 1e-9 || syy < 1e-9 ? null : +(sxy / Math.sqrt(sxx * syy)).toFixed(3);
  };

  report.audio = {
    simSeconds: S.length ? S[S.length - 1].t : 0,
    graphEvents: raw.totalGraphEvents,
    nodeStarts: raw.nodeStarts,
    oneShotCalls: oneShots,
    beds: {
      roll: {
        framesAudible: nonNull('roll'), peakGain: +max('roll').toFixed(4),
        peakRate: +max('rollRate').toFixed(3),
        gainVsSpeed: corr(rolling.map((s) => s.spd), rolling.map((s) => s.roll ?? 0)),
        rateVsSpeed: corr(rolling.map((s) => s.spd), rolling.map((s) => s.rollRate ?? 0)),
        peakCaster: +max('caster').toFixed(4),
      },
      grind: {
        grindFrames: grinding.length,
        framesAudible: nonNull('grindG'), peakGain: +max('grindG').toFixed(4),
        gainVsSpeed: corr(grinding.map((s) => s.spd), grinding.map((s) => s.grindG ?? 0)),
        peakF0: max('grindF0'),
      },
      anxiety: {
        framesAudible: nonNull('anx'), peakGain: +max('anx').toFixed(4),
        peakTremHz: +max('anxHz').toFixed(2),
        worstBalanceOffset: +Math.max(...S.map((s) => Math.abs(s.bal - 0.5))).toFixed(3),
      },
      comboRiser: {
        framesAudible: nonNull('riser'), peakRiser: +max('riser').toFixed(4),
        peakDrone: +max('drone').toFixed(4), maxMultiplier: +max('mult').toFixed(2),
      },
      heat: { framesAudible: nonNull('heatG'), peakGain: +max('heatG').toFixed(4), peakHeat: +max('heat').toFixed(3) },
    },
    music: {
      peakKeys: +max('keys').toFixed(3), peakLead: +max('lead').toFixed(3),
      peakTension: +max('tension').toFixed(3),
      peakIntensity: +max('intensity').toFixed(3),
      bpmRange: [Math.min(...S.map((s) => s.bpm)), Math.max(...S.map((s) => s.bpm))],
      keysFrames: nonNull('keys'), leadFrames: nonNull('lead'), tensionFrames: nonNull('tension'),
      notesScheduled: (raw.nodeStarts.osc || 0),
    },
    ducking: {
      minDuck: +Math.min(...S.map((s) => (s.duck == null ? 1 : s.duck))).toFixed(3),
      framesDucked: S.filter((s) => s.duck != null && s.duck < 0.97).length,
    },
    voices: { peakLive: max('voices'), budget: 26 },
  };
  report.series = S;
  return report;
}

// ---------------------------------------------------------------------------
// MODE: levels — real OfflineAudioContext renders
// ---------------------------------------------------------------------------
async function runLevels(page, report) {
  report.levels = await page.evaluate(async () => {
    const SR = 44100;
    const analyse = (buf) => {
      let peak = 0, sum = 0, n = 0, clipped = 0;
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
          const a = Math.abs(d[i]);
          if (a > peak) peak = a;
          if (a >= 0.999) clipped++;
          sum += d[i] * d[i]; n++;
        }
      }
      const db = (x) => (x < 1e-7 ? -140 : +(20 * Math.log10(x)).toFixed(2));
      return { peakDb: db(peak), peak: +peak.toFixed(4), rmsDb: db(Math.sqrt(sum / Math.max(1, n))), clippedSamples: clipped };
    };

    const render = async (seconds, setup) => {
      const OAC = window.OfflineAudioContext;
      const ctx = new OAC(2, Math.floor(SR * seconds), SR);
      const RealCtor = window.AudioContext;
      window.AudioContext = function () { return ctx; };
      const ps = new window.ProceduralSounds();
      ps.init();
      window.AudioContext = RealCtor;
      setup(ps, ctx);
      const buf = await ctx.startRendering();
      return analyse(buf);
    };

    const out = {};
    const one = (name, seconds, fn) => render(seconds, fn).then((r) => { out[name] = r; });

    await one('ollie_charged', 0.6, (ps) => ps.playOllie(1));
    await one('ollie_flat', 0.6, (ps) => ps.playOllie(0));
    await one('land_soft', 0.8, (ps) => ps.playLand(0.2));
    await one('land_hard', 1.0, (ps) => ps.playLand(1));
    await one('bail', 1.4, (ps) => ps.playBail());
    await one('push', 0.5, (ps) => ps.playPush());
    await one('trick_small', 0.8, (ps) => ps.playTrick(150));
    await one('trick_big', 1.0, (ps) => ps.playTrick(2500));
    await one('bank_small', 1.6, (ps) => ps.playChaChing(800));
    await one('bank_huge', 2.0, (ps) => ps.playChaChing(40000));
    await one('comboLanded_x6', 1.2, (ps) => ps.playComboLanded(6));
    await one('specialReady', 1.6, (ps) => ps.playSpecialReady());
    await one('grindStart', 0.6, (ps) => ps.playGrindStart());
    await one('whistle', 1.0, (ps) => ps.playPoliceWhistle());
    // The "lost them" cue is latched behind a pursuit that actually got hot.
    await one('policeLost', 1.2, (ps) => { ps.updatePolice(0.9); ps.playPoliceLost(); });
    await one('policeLost_noChase', 1.2, (ps) => ps.playPoliceLost());   // must be silent
    for (const m of ['paper', 'plastic', 'metal', 'soil', 'glass', 'cardboard']) {
      await one('smash_' + m, 1.8, (ps) => ps.playSmash(m, 90));
    }

    // Continuous beds: start, drive to the target state at t=0, render.
    await one('roll_fast_hard', 1.5, (ps) => { ps.startRoll(); ps.updateWheelRoll(16, true, 1); });
    await one('roll_slow_carpet', 1.5, (ps) => { ps.startRoll(); ps.updateWheelRoll(5, true, 0); });
    await one('grind_fast', 1.5, (ps) => { ps.startGrindLoop(); ps.updateGrind(15, 0.5); });
    await one('grind_edge', 1.5, (ps) => {
      ps.startGrindLoop(); ps.updateGrind(15, 0.93);
      ps.startBalanceWarning(); ps.updateBalanceWarning(0.93);
    });
    await one('combo_riser_x8', 1.5, (ps) => { ps.setComboState(true, 8); ps.setComboState(true, 8); });
    await one('heat_full', 1.5, (ps) => ps.updatePolice(1));

    // --- the music bus, one bar of the full arrangement --------------------
    // SoundManager borrows the singleton's buses, so the singleton has to be
    // re-inited onto the offline context for this one render.
    {
      const OAC = window.OfflineAudioContext;
      const octx = new OAC(2, Math.floor(SR * 2.6), SR);
      const RealCtor = window.AudioContext;
      const ps = window.proceduralSounds;
      const sm = window.soundManager;
      ps.isInitialized = false; ps.ctx = null;
      sm.started = false;
      window.AudioContext = function () { return octx; };
      ps.init(); sm.init();
      window.AudioContext = RealCtor;
      sm.keysGain.gain.value = 0.9;
      sm.leadGain.gain.value = 0.8;
      sm.tensionGain.gain.value = 0.85;
      const beat = 60 / 102;
      const Am7 = { name: 'Am7', root: 0, voicing: [12, 15, 19, 22], tones: [0, 3, 7, 10] };
      for (let b = 0; b < 4; b++) sm.kick(octx, 0.02 + b * beat, b === 0 ? 1 : 0.82);
      sm.snare(octx, 0.02 + beat, 1); sm.snare(octx, 0.02 + 3 * beat, 1);
      for (let i = 0; i < 8; i++) sm.hat(octx, 0.02 + i * beat * 0.5, i % 2 ? 0.3 : 0.5, false);
      sm.bassNote(octx, 0.02, 55, beat * 0.55, 1);
      sm.bassNote(octx, 0.02 + beat * 1.5, 110, beat * 0.22, 0.7);
      sm.bassNote(octx, 0.02 + beat * 2.5, 55, beat * 0.4, 0.85);
      sm.keyStab(octx, 0.02 + beat * 1.5, Am7, 0.85);
      sm.keyStab(octx, 0.02 + beat * 3.5, Am7, 0.6);
      sm.leadNote(octx, 0.02 + beat * 0.5, 440, beat * 0.9);
      sm.leadNote(octx, 0.02 + beat * 2.5, 587.33, beat * 1.2);
      for (let i = 0; i < 8; i++) sm.ride(octx, 0.02 + i * beat * 0.5, i % 2 ? 0.2 : 0.34);
      sm.tensionPad(octx, 0.02, Am7);
      out.MUSIC_full_bar = analyse(await octx.startRendering());
      // Put the singletons back on a live context so nothing downstream breaks.
      ps.isInitialized = false; ps.ctx = null; sm.started = false;
      ps.init(); sm.init();
    }

    // --- voice budget: does the cap actually steal? -------------------------
    {
      const ps = new window.ProceduralSounds();
      ps.init();   // real context; suspended, so currentTime is frozen at 0
      let p1 = 0, p2 = 0, p0 = 0;
      for (let i = 0; i < 300; i++) if (ps.claim(1, 0.5)) p1++;
      for (let i = 0; i < 100; i++) if (ps.claim(2, 0.5)) p2++;
      for (let i = 0; i < 100; i++) if (ps.claim(0, 0.5)) p0++;
      out.VOICE_CAP = {
        budget: ps.VOICE_BUDGET,
        normalGrantedFrom300: p1,
        criticalGrantedAfterSaturation: p2,
        ambientGrantedAfterSaturation: p0,
        liveAfter: ps.voices.length,
      };
    }

    // The worst case the limiter has to survive: everything on one frame.
    await one('WORST_CASE_pileup', 2.0, (ps) => {
      ps.startRoll(); ps.updateWheelRoll(17, true, 1);
      ps.startGrindLoop(); ps.updateGrind(17, 0.9);
      ps.startBalanceWarning(); ps.updateBalanceWarning(0.93);
      ps.setComboState(true, 10); ps.setComboState(true, 10);
      ps.updatePolice(1);
      ps.playBail();
      ps.playChaChing(40000);
      ps.playLand(1);
      for (const m of ['metal', 'glass', 'plastic']) ps.playSmash(m, 120);
      ps.playTrick(2500);
    });
    return out;
  });
  return report;
}

// ---------------------------------------------------------------------------

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
      '--enable-webgl', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox',
      '--autoplay-policy=no-user-gesture-required'],
  });

  const report = { mode: MODE, level: LEVEL, script: SCRIPT, errors: [] };
  let code = 0;
  try {
    await waitForServer(url);
    const ctx = await browser.newContext({ viewport: { width: 320, height: 180 } });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') report.errors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => report.errors.push(`PAGEERROR: ${String(e).slice(0, 300)}`));

    if (MODE === 'events') await page.addInitScript(STUB);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.game && !!window.proceduralSounds, null, { timeout: 90000 });
    await page.waitForTimeout(400);

    if (MODE === 'levels') await runLevels(page, report);
    else await runEvents(page, report);
  } catch (e) {
    report.errors.push(`HARNESS: ${String(e).slice(0, 500)}`);
    code = 1;
  } finally {
    await browser.close().catch(() => {});
    server.kill('SIGKILL');
  }

  if (SAVE) {
    const p = resolve(String(SAVE));
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(report, null, 2));
  }
  const { series, ...slim } = report;
  console.log(JSON.stringify(WANT_JSON ? report : slim, null, 2));
  process.exit(code);
}

main();
