/**
 * Procedural Sounds — the SFX half of the audio engine.
 *
 * Everything here is synthesised at runtime with the Web Audio API. There are no
 * audio assets and no network fetches; every buffer is generated from noise and
 * every voice from oscillators, filters and envelopes.
 *
 * This file owns three things:
 *   1. The AudioContext and the MIXER (master / music / sfx buses, a shared
 *      reverb send, and a limiter on the way out).
 *   2. The shared noise BUFFERS (white, pink, roll texture, scrape texture),
 *      generated once at init and reused by every voice.
 *   3. Every SOUND EFFECT: the continuous roll bed, the grind, ollie/land/bail,
 *      trick stings, combo escalation, smash impacts and the police layer.
 *
 * The MUSIC engine lives in SoundManager.ts and borrows the buses from here via
 * `proceduralSounds.buses`.
 *
 * ---------------------------------------------------------------------------
 * DESIGN NOTES — what each sound is meant to convey
 * ---------------------------------------------------------------------------
 * The whole soundscape is built as a bed + events, the way a Tony Hawk game is.
 * The bed (roll / grind) is what makes SPEED FELT: it is always there, it always
 * tracks the player's velocity, and it changes texture with the surface so the
 * world is legible with your eyes closed. Events sit on top and are mixed to cut
 * through the bed without ever clipping it — that is what the limiter and the
 * ducking are for.
 *
 * Loudness budget (peak linear gain into the sfx bus, before bus + master):
 *   roll bed        0.02 .. 0.21   continuous, never masks anything
 *   grind bed       0.05 .. 0.30   continuous, louder than roll on purpose
 *   grind anxiety   0.00 .. 0.14   rides on top of the grind bed
 *   trick sting     0.18 .. 0.34   short
 *   land            0.20 .. 0.62   short, scales with drop
 *   bail            ~0.75          the loudest thing in the game
 *   bank payoff     ~0.55          ducks the music so it lands
 *   smash           0.20 .. 0.45   scales with impulse
 * The limiter (ratio 12:1 at -8 dBFS) catches the case where a bail, a bank and
 * three smashes all land on the same frame.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Matches DebrisKind in gameplay/Destructibles without importing it. */
export type SmashMaterial = 'paper' | 'plastic' | 'metal' | 'soil' | 'glass' | 'cardboard';

/** The mixer nodes, shared with the music engine in SoundManager. */
export interface AudioBuses {
  ctx: AudioContext;
  /** Everything ends up here. Master volume lives on this node. */
  master: GainNode;
  /** Music sources connect here. */
  music: GainNode;
  /** Sound effects connect here. */
  sfx: GainNode;
  /** Send a voice here (through your own gain) to put it in the room. */
  reverbSend: GainNode;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v: number) => clamp(v, 0, 1);

/** Semitones above/below a reference frequency. */
const semis = (base: number, n: number) => base * Math.pow(2, n / 12);

/** A minor pentatonic on A — every subset of it is consonant, so stacked
 *  trick stings in a combo can never form a sour interval. */
const PENTATONIC = [0, 3, 5, 7, 10];

/** Pick the n-th degree of the pentatonic scale, wrapping into octaves. */
function pentatonic(n: number): number {
  const oct = Math.floor(n / PENTATONIC.length);
  return PENTATONIC[((n % PENTATONIC.length) + PENTATONIC.length) % PENTATONIC.length] + oct * 12;
}

// ---------------------------------------------------------------------------

export class ProceduralSounds {
  private ctx: AudioContext | null = null;

  // ---- mixer ----------------------------------------------------------------
  private masterGain: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicDuck: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private reverbSendBus: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;

  private masterVolume = 0.85;
  private musicVolume = 0.34;
  private sfxVolume = 1.0;
  private muted = false;

  private isInitialized = false;

  // ---- shared buffers -------------------------------------------------------
  private whiteBuf: AudioBuffer | null = null;
  private pinkBuf: AudioBuffer | null = null;
  private rollBuf: AudioBuffer | null = null;
  private scrapeBuf: AudioBuffer | null = null;
  private crunchCurve: Float32Array<ArrayBuffer> | null = null;

  // ---- voice budget ---------------------------------------------------------
  /** Scheduled end times of live one-shot voices, used for voice stealing. */
  private voices: number[] = [];
  private readonly VOICE_BUDGET = 26;
  /** Per-key rate limiting so a burst of identical events cannot pile up. */
  private lastFire = new Map<string, number>();

  // ---- continuous: roll -----------------------------------------------------
  private rollSrc: AudioBufferSourceNode | null = null;
  private rollCarpetGain: GainNode | null = null;
  private rollHardGain: GainNode | null = null;
  private rollCarpetLP: BiquadFilterNode | null = null;
  private rollHardBP: BiquadFilterNode | null = null;
  private rollOut: GainNode | null = null;
  private casterOsc: OscillatorNode | null = null;
  private casterGain: GainNode | null = null;
  private casterLP: BiquadFilterNode | null = null;
  private rollActive = false;

  // ---- continuous: grind ----------------------------------------------------
  private grindSrc: AudioBufferSourceNode | null = null;
  private grindModes: BiquadFilterNode[] = [];
  private grindBodyLP: BiquadFilterNode | null = null;
  private grindSparkHP: BiquadFilterNode | null = null;
  private grindSparkGain: GainNode | null = null;
  private grindOut: GainNode | null = null;
  private grindActive = false;

  // ---- continuous: grind anxiety (balance) ----------------------------------
  private anxA: OscillatorNode | null = null;
  private anxB: OscillatorNode | null = null;
  private anxBP: BiquadFilterNode | null = null;
  private anxTrem: OscillatorNode | null = null;
  private anxTremDepth: GainNode | null = null;
  private anxOut: GainNode | null = null;
  private anxActive = false;

  // ---- continuous: combo riser ---------------------------------------------
  private riserSrc: AudioBufferSourceNode | null = null;
  private riserBP: BiquadFilterNode | null = null;
  private riserOut: GainNode | null = null;
  private droneA: OscillatorNode | null = null;
  private droneB: OscillatorNode | null = null;
  private droneLP: BiquadFilterNode | null = null;
  private droneOut: GainNode | null = null;
  private comboActive = false;
  private comboTrickIndex = 0;
  private lastMultiplier = 1;

  // ---- continuous: police tension -------------------------------------------
  private heatA: OscillatorNode | null = null;
  private heatB: OscillatorNode | null = null;
  private heatLP: BiquadFilterNode | null = null;
  private heatPulse: OscillatorNode | null = null;
  private heatPulseDepth: GainNode | null = null;
  private heatOut: GainNode | null = null;
  private heatActive = false;
  private heatValue = 0;

  // =========================================================================
  // Lifecycle
  // =========================================================================

  init(): void {
    if (this.isInitialized) return;

    const Ctor: typeof AudioContext | undefined =
      typeof window !== 'undefined'
        ? (window.AudioContext ||
           (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined;
    if (!Ctor) {
      console.warn('[audio] Web Audio API unavailable; running silent.');
      return;
    }

    try {
      const ctx = new Ctor();
      this.ctx = ctx;

      // ---- mixer graph ----------------------------------------------------
      // sfx ──────────┐
      // music -> duck ─┼-> master -> limiter -> destination
      // reverb return ┘
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -8;
      this.limiter.knee.value = 2;
      this.limiter.ratio.value = 12;      // brick-ish: catches simultaneous events
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.14;
      this.limiter.connect(ctx.destination);

      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this.masterVolume;
      this.masterGain.connect(this.limiter);

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = this.sfxVolume;
      this.sfxBus.connect(this.masterGain);

      this.musicDuck = ctx.createGain();
      this.musicDuck.gain.value = 1;
      this.musicDuck.connect(this.masterGain);

      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicVolume;
      this.musicBus.connect(this.musicDuck);

      // ---- shared buffers --------------------------------------------------
      this.buildBuffers(ctx);

      // ---- reverb ----------------------------------------------------------
      // One small room shared by everything. Dry-heavy: this is a game, not a
      // cathedral. It exists so stingers and bells do not sound like a test tone.
      const convolver = ctx.createConvolver();
      convolver.buffer = this.buildImpulseResponse(ctx, 1.5);
      const reverbReturn = ctx.createGain();
      reverbReturn.gain.value = 0.5;
      convolver.connect(reverbReturn);
      reverbReturn.connect(this.masterGain);

      this.reverbSendBus = ctx.createGain();
      this.reverbSendBus.gain.value = 1;
      this.reverbSendBus.connect(convolver);

      this.isInitialized = true;

      // Browsers start the context suspended until a gesture. Unlock on the
      // first real input; harmless if it never comes (everything no-ops).
      this.installUnlockHandlers();
    } catch (e) {
      console.warn('[audio] init failed; running silent:', e);
      this.ctx = null;
    }
  }

  private installUnlockHandlers(): void {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      void this.resume();
      if (this.ctx?.state === 'running') {
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('touchstart', unlock);
      }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
  }

  async resume(): Promise<void> {
    if (this.ctx?.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        /* the browser said no; stay silent */
      }
    }
  }

  /** True once the context exists AND is actually running (post-gesture). */
  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Mixer handles for the music engine. Null until init() succeeds. */
  get buses(): AudioBuses | null {
    if (!this.ctx || !this.masterGain || !this.musicBus || !this.sfxBus || !this.reverbSendBus) return null;
    return {
      ctx: this.ctx,
      master: this.masterGain,
      music: this.musicBus,
      sfx: this.sfxBus,
      reverbSend: this.reverbSendBus,
    };
  }

  // =========================================================================
  // Mixer controls
  // =========================================================================

  /** Master volume, 0..1. Kept as `setVolume` for the existing call sites. */
  setVolume(v: number): void {
    this.setMasterVolume(v);
  }

  setMasterVolume(v: number): void {
    this.masterVolume = clamp01(v);
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.masterVolume, this.ctx.currentTime, 0.02);
    }
  }

  setMusicVolume(v: number): void {
    this.musicVolume = clamp01(v);
    if (this.musicBus && this.ctx) {
      this.musicBus.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.05);
    }
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = clamp01(v);
    if (this.sfxBus && this.ctx) {
      this.sfxBus.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.02);
    }
  }

  getMasterVolume(): number { return this.masterVolume; }
  getMusicVolume(): number { return this.musicVolume; }
  getSfxVolume(): number { return this.sfxVolume; }
  isMuted(): boolean { return this.muted; }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(m ? 0 : this.masterVolume, this.ctx.currentTime, 0.02);
    }
  }

  /**
   * Dip the music so a stinger cuts through, then recover.
   * @param amount 0..1, how far down to pull the music (0.5 = half gain)
   * @param hold   seconds at the dipped level before the release ramp
   */
  duckMusic(amount = 0.45, hold = 0.12): void {
    if (!this.ctx || !this.musicDuck) return;
    const t = this.ctx.currentTime;
    const g = this.musicDuck.gain;
    const floor = clamp(1 - amount, 0.05, 1);
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(floor, t + 0.012);   // fast pull-down, like a real ducker
    g.setValueAtTime(floor, t + 0.012 + hold);
    g.setTargetAtTime(1, t + 0.012 + hold, 0.22);  // slow, musical recovery
  }

  // =========================================================================
  // Voice budget
  // =========================================================================

  /** Prune finished voices and report how many are live. */
  private liveVoices(now: number): number {
    if (this.voices.length === 0) return 0;
    let w = 0;
    for (let i = 0; i < this.voices.length; i++) {
      if (this.voices[i] > now) this.voices[w++] = this.voices[i];
    }
    this.voices.length = w;
    return w;
  }

  /**
   * Claim a one-shot voice slot.
   * @param priority 0 = ambient garnish, 1 = normal, 2 = must always be heard
   * @param dur      how long the voice will sound, seconds
   */
  private claim(priority: number, dur: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    const live = this.liveVoices(now);
    // Priority 2 always plays (bail, bank). Priority 1 needs headroom.
    // Priority 0 gets cut first when things get busy.
    const budget = priority >= 2
      ? this.VOICE_BUDGET + 6
      : priority >= 1 ? this.VOICE_BUDGET : this.VOICE_BUDGET * 0.6;
    if (live >= budget) return false;
    this.voices.push(now + dur);
    return true;
  }

  /** Rate limit by key: returns false if the key fired less than `gap` seconds ago. */
  private throttle(key: string, gap: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    const last = this.lastFire.get(key);
    if (last !== undefined && now - last < gap) return false;
    this.lastFire.set(key, now);
    return true;
  }

  // =========================================================================
  // Buffer generation
  // =========================================================================

  private buildBuffers(ctx: AudioContext): void {
    const sr = ctx.sampleRate;
    const n = Math.floor(sr * 2); // 2 s loops: long enough that the period is not audible

    // --- white ------------------------------------------------------------
    const white = ctx.createBuffer(1, n, sr);
    const w = white.getChannelData(0);
    for (let i = 0; i < n; i++) w[i] = Math.random() * 2 - 1;
    this.seamCrossfade(w, sr);
    this.whiteBuf = white;

    // --- pink (Paul Kellet's economy filter) -------------------------------
    // Pink noise falls at 3 dB/octave, which is what real rolling/rumbling
    // sounds like. White noise alone reads as "hiss", pink reads as "mass".
    const pink = ctx.createBuffer(1, n, sr);
    const p = pink.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const wn = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + wn * 0.0555179;
      b1 = 0.99332 * b1 + wn * 0.0750759;
      b2 = 0.96900 * b2 + wn * 0.1538520;
      b3 = 0.86650 * b3 + wn * 0.3104856;
      b4 = 0.55000 * b4 + wn * 0.5329522;
      b5 = -0.7616 * b5 - wn * 0.0168980;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + wn * 0.5362) * 0.4;
      b6 = wn * 0.115926;
    }
    this.normalize(p, 0.9);
    this.seamCrossfade(p, sr);
    this.pinkBuf = pink;

    // --- roll texture ------------------------------------------------------
    // Office chair casters on a floor: mostly pink rumble, plus a weak periodic
    // component (the caster spinning in its fork) and a slow amplitude wander
    // (floor grain passing under the wheel). The periodic part is deliberately
    // NON-harmonic with the loop length so the 2 s repeat is hard to hear.
    const roll = ctx.createBuffer(1, n, sr);
    const r = roll.getChannelData(0);
    let rb0 = 0, rb1 = 0, rb2 = 0;
    for (let i = 0; i < n; i++) {
      const wn = Math.random() * 2 - 1;
      // 3-pole pink-ish shaping, cheaper than the full Kellet chain
      rb0 = 0.997 * rb0 + wn * 0.045;
      rb1 = 0.985 * rb1 + wn * 0.083;
      rb2 = 0.930 * rb2 + wn * 0.210;
      const body = rb0 + rb1 + rb2 + wn * 0.18;
      const t = i / sr;
      const spin = Math.sin(2 * Math.PI * 37.3 * t) * 0.10;                // caster bearing tone
      const grain = 0.78 + 0.22 * Math.sin(2 * Math.PI * 0.83 * t + 1.1);  // floor grain
      r[i] = (body * grain + spin) * 0.8;
    }
    this.normalize(r, 0.95);
    this.seamCrossfade(r, sr);
    this.rollBuf = roll;

    // --- scrape texture ----------------------------------------------------
    // Metal on metal is not smooth noise: it is thousands of tiny stick-slip
    // events. We model that as broadband noise multiplied by a fast, irregular
    // amplitude envelope, plus sparse impulsive "catches" that make the ear
    // hear a hard edge dragging rather than a hiss.
    const scrape = ctx.createBuffer(1, n, sr);
    const s = scrape.getChannelData(0);
    let chatter = 0.6;
    let chatterTarget = 0.6;
    let nextChange = 0;
    for (let i = 0; i < n; i++) {
      if (i >= nextChange) {
        // stick-slip rate ~180-900 Hz: new amplitude target every 1.1-5.5 ms
        nextChange = i + Math.floor(sr * (0.0011 + Math.random() * 0.0044));
        chatterTarget = 0.25 + Math.random() * 0.95;
      }
      chatter += (chatterTarget - chatter) * 0.02; // slew, so it grinds not clicks
      let v = (Math.random() * 2 - 1) * chatter;
      // ~14 catches per second: a short, loud transient
      if (Math.random() < 14 / sr) v += (Math.random() * 2 - 1) * 2.2;
      s[i] = v;
    }
    this.normalize(s, 0.95);
    this.seamCrossfade(s, sr);
    this.scrapeBuf = scrape;

    // --- distortion curve for the bail crunch ------------------------------
    // tanh soft clip at a hard drive: adds odd harmonics and squashes the
    // dynamics into a flat, ugly wall. That ugliness is the point.
    const cn = 1024;
    const curve = new Float32Array(cn);
    const drive = 7;
    for (let i = 0; i < cn; i++) {
      const x = (i / (cn - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }
    this.crunchCurve = curve;
  }

  /** Equal-power crossfade of the loop seam so looping buffers do not tick. */
  private seamCrossfade(data: Float32Array, sr: number): void {
    const fade = Math.min(Math.floor(sr * 0.02), Math.floor(data.length / 4));
    if (fade <= 1) return;
    const tail = data.length - fade;
    for (let i = 0; i < fade; i++) {
      const x = i / fade;
      const a = Math.cos(x * Math.PI * 0.5); // outgoing (tail)
      const b = Math.sin(x * Math.PI * 0.5); // incoming (head)
      data[tail + i] = data[tail + i] * a + data[i] * b;
    }
  }

  private normalize(data: Float32Array, peak: number): void {
    let m = 0;
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i]);
      if (a > m) m = a;
    }
    if (m < 1e-6) return;
    const k = peak / m;
    for (let i = 0; i < data.length; i++) data[i] *= k;
  }

  /**
   * A small room. Exponentially decaying noise with a one-pole lowpass whose
   * coefficient shrinks over the tail, so high frequencies die first — which is
   * what air absorption actually does.
   */
  private buildImpulseResponse(ctx: AudioContext, seconds: number): AudioBuffer {
    const sr = ctx.sampleRate;
    const n = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(2, n, sr);
    const preDelay = Math.floor(sr * 0.012);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        if (i < preDelay) { d[i] = 0; continue; }
        const t = (i - preDelay) / (n - preDelay);
        const a = 0.30 - 0.25 * t;                 // filter closes as the tail decays
        lp += a * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * Math.pow(1 - t, 2.6);
      }
      this.normalize(d, 0.7);
    }
    return buf;
  }

  // =========================================================================
  // Voice construction helpers
  // =========================================================================

  private noiseSource(buf: AudioBuffer | null, loop: boolean, rate = 1): AudioBufferSourceNode | null {
    if (!this.ctx || !buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    src.playbackRate.value = rate;
    return src;
  }

  /** Percussive envelope: near-instant attack, exponential-ish decay. */
  private perc(g: GainNode, t0: number, peak: number, attack: number, decay: number): void {
    const gp = g.gain;
    gp.setValueAtTime(0.0001, t0);
    gp.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + Math.max(0.0005, attack));
    gp.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  /** Route a voice into the room as well as the dry bus. */
  private sendReverb(node: AudioNode, amount: number): void {
    if (!this.ctx || !this.reverbSendBus || amount <= 0) return;
    const g = this.ctx.createGain();
    g.gain.value = amount;
    node.connect(g);
    g.connect(this.reverbSendBus);
  }

  // =========================================================================
  // CONTINUOUS BED 1: THE ROLL
  // =========================================================================
  //
  // INTENT: this is the floor of the mix and the primary speed cue. If the
  // player is moving, they hear it; the faster they move the brighter, louder
  // and higher-pitched it gets. Because it is a *buffer* played back at a
  // speed-dependent playbackRate, the pitch shift is real — the caster bearing
  // tone baked into the buffer rises with velocity exactly the way a real wheel
  // does, rather than a filter sweep faking it.
  //
  // TEXTURE: two parallel filter chains fed from the same source and crossfaded
  // by a `hardness` parameter.
  //   carpet (h=0): steep lowpass, no top end. Absorbent, soft, "shhhh".
  //   hard   (h=1): presence peak up top plus an audible caster tone.
  //                 Bright, hollow, "brrrrr" — tile, laminate, concrete.
  // Crossfading rather than switching means rolling from carpet onto a desk and
  // back is a continuous timbral morph, not a click.

  startWheelRoll(): void { this.startRoll(); }

  startRoll(): void {
    if (!this.ctx || !this.sfxBus || this.rollActive) return;
    const ctx = this.ctx;

    const src = this.noiseSource(this.rollBuf, true, 1);
    if (!src) return;

    this.rollOut = ctx.createGain();
    this.rollOut.gain.value = 0;
    this.rollOut.connect(this.sfxBus);

    // --- carpet chain: two cascaded lowpasses = 24 dB/oct, genuinely dark ---
    this.rollCarpetLP = ctx.createBiquadFilter();
    this.rollCarpetLP.type = 'lowpass';
    this.rollCarpetLP.frequency.value = 340;
    this.rollCarpetLP.Q.value = 0.5;
    const carpetLP2 = ctx.createBiquadFilter();
    carpetLP2.type = 'lowpass';
    carpetLP2.frequency.value = 900;
    carpetLP2.Q.value = 0.4;
    this.rollCarpetGain = ctx.createGain();
    this.rollCarpetGain.gain.value = 1;

    src.connect(this.rollCarpetLP);
    this.rollCarpetLP.connect(carpetLP2);
    carpetLP2.connect(this.rollCarpetGain);
    this.rollCarpetGain.connect(this.rollOut);

    // --- hard chain: highpass out the mud, presence peak for the top end ---
    const hardHP = ctx.createBiquadFilter();
    hardHP.type = 'highpass';
    hardHP.frequency.value = 150;
    this.rollHardBP = ctx.createBiquadFilter();
    this.rollHardBP.type = 'peaking';
    this.rollHardBP.frequency.value = 1200;
    this.rollHardBP.Q.value = 1.1;
    this.rollHardBP.gain.value = 8;
    this.rollHardGain = ctx.createGain();
    this.rollHardGain.gain.value = 0;

    src.connect(hardHP);
    hardHP.connect(this.rollHardBP);
    this.rollHardBP.connect(this.rollHardGain);
    this.rollHardGain.connect(this.rollOut);

    // --- caster tone -------------------------------------------------------
    // A 32 mm caster at v m/s turns at v / (2*pi*0.016) ~= 10*v rev/s, and the
    // fork/bearing rattle sits around six times that in the audible range. We
    // use f = 6.2*v Hz (~90 Hz at the game's 14.6 m/s cruise) which is a low
    // buzz you feel more than hear. Carpet kills it; hard floors transmit it.
    this.casterOsc = ctx.createOscillator();
    this.casterOsc.type = 'sawtooth';
    this.casterOsc.frequency.value = 40;
    this.casterLP = ctx.createBiquadFilter();
    this.casterLP.type = 'lowpass';
    this.casterLP.frequency.value = 420;
    this.casterLP.Q.value = 1.6;
    this.casterGain = ctx.createGain();
    this.casterGain.gain.value = 0;
    this.casterOsc.connect(this.casterLP);
    this.casterLP.connect(this.casterGain);
    this.casterGain.connect(this.rollOut);

    src.start();
    this.casterOsc.start();
    this.rollSrc = src;
    this.rollActive = true;
  }

  /**
   * @param speed    m/s
   * @param rolling  grounded and not grinding
   * @param hardness 0 = carpet, 1 = hard surface (tile / laminate / concrete)
   */
  updateWheelRoll(speed: number, rolling: boolean, hardness = 0): void {
    if (!this.ctx || !this.rollOut || !this.rollSrc) return;
    const t = this.ctx.currentTime;

    if (!rolling || speed < 0.4) {
      // Fast but not instant: a 60 ms fall reads as "wheels left the floor",
      // an instant cut reads as a bug.
      this.rollOut.gain.setTargetAtTime(0, t, 0.02);
      if (this.casterGain) this.casterGain.gain.setTargetAtTime(0, t, 0.02);
      return;
    }

    const norm = clamp01(speed / 18);
    const h = clamp01(hardness);

    // Volume: sqrt-ish so the low end of the speed range is still audible.
    const vol = 0.02 + 0.19 * Math.pow(norm, 0.75);
    this.rollOut.gain.setTargetAtTime(vol, t, 0.05);

    // Pitch: linear in speed, 0.55x standing-start to 1.65x flat out.
    this.rollSrc.playbackRate.setTargetAtTime(0.55 + 1.10 * norm, t, 0.06);

    // Surface crossfade. Equal-power so the total energy stays constant.
    const cx = Math.cos(h * Math.PI * 0.5);
    const hx = Math.sin(h * Math.PI * 0.5);
    this.rollCarpetGain?.gain.setTargetAtTime(cx, t, 0.08);
    this.rollHardGain?.gain.setTargetAtTime(hx * 0.85, t, 0.08);

    // Both chains open up with speed; the hard chain opens further.
    this.rollCarpetLP?.frequency.setTargetAtTime(300 + 520 * norm, t, 0.06);
    this.rollHardBP?.frequency.setTargetAtTime(900 + 2400 * norm, t, 0.06);

    // Caster tone: audible only on hard floors and only above a walking pace.
    if (this.casterOsc && this.casterGain && this.casterLP) {
      this.casterOsc.frequency.setTargetAtTime(clamp(6.2 * speed, 24, 220), t, 0.05);
      this.casterLP.frequency.setTargetAtTime(260 + 700 * norm, t, 0.06);
      this.casterGain.gain.setTargetAtTime(h * 0.05 * clamp01((speed - 2) / 6), t, 0.08);
    }
  }

  stopWheelRoll(): void { this.stopRoll(); }

  stopRoll(): void {
    if (this.rollSrc) { try { this.rollSrc.stop(); } catch { /* already stopped */ } }
    if (this.casterOsc) { try { this.casterOsc.stop(); } catch { /* already stopped */ } }
    this.rollSrc = null;
    this.casterOsc = null;
    this.casterGain = null;
    this.casterLP = null;
    this.rollOut = null;
    this.rollCarpetGain = null;
    this.rollHardGain = null;
    this.rollCarpetLP = null;
    this.rollHardBP = null;
    this.rollActive = false;
  }

  // =========================================================================
  // CONTINUOUS BED 2: THE GRIND
  // =========================================================================
  //
  // INTENT: the single most important sound in the game. A grind has to feel
  // dangerous and expensive — a hard edge dragging across steel, right at the
  // limit. It is mixed louder than the roll on purpose: when you lock on, the
  // world's texture changes and you know it instantly.
  //
  // SYNTHESIS: the scrape buffer supplies the stick-slip transients. It is then
  // fed through three resonant bandpasses tuned to INHARMONIC ratios
  // (1 : 2.14 : 3.42). Harmonic ratios sound like a pitched instrument; metal
  // bars ring at inharmonic partials, so those ratios are what makes the ear
  // say "metal" rather than "someone playing a note". A fourth path adds
  // high-passed sparks and a fifth adds low body so it has weight.
  //
  // The whole thing tracks speed via playbackRate (faster drag = faster
  // stick-slip = higher perceived pitch) and via the mode centre frequency.

  private static readonly GRIND_MODE_RATIOS = [1, 2.14, 3.42];
  private static readonly GRIND_MODE_Q = [9, 14, 18];
  private static readonly GRIND_MODE_GAIN = [7, 4, 2.2];

  startGrindLoop(): void {
    if (!this.ctx || !this.sfxBus || this.grindActive) return;
    const ctx = this.ctx;

    const src = this.noiseSource(this.scrapeBuf, true, 1);
    if (!src) return;

    this.grindOut = ctx.createGain();
    this.grindOut.gain.value = 0.0001;
    this.grindOut.connect(this.sfxBus);
    this.sendReverb(this.grindOut, 0.16); // a rail in a big room

    // --- inharmonic metal modes -------------------------------------------
    this.grindModes = [];
    for (let i = 0; i < 3; i++) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1500 * ProceduralSounds.GRIND_MODE_RATIOS[i];
      bp.Q.value = ProceduralSounds.GRIND_MODE_Q[i];
      const g = ctx.createGain();
      g.gain.value = ProceduralSounds.GRIND_MODE_GAIN[i];
      src.connect(bp);
      bp.connect(g);
      g.connect(this.grindOut);
      this.grindModes.push(bp);
    }

    // --- body: the low rumble transmitted through the chair frame ----------
    this.grindBodyLP = ctx.createBiquadFilter();
    this.grindBodyLP.type = 'lowpass';
    this.grindBodyLP.frequency.value = 260;
    this.grindBodyLP.Q.value = 0.8;
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 3.2;
    src.connect(this.grindBodyLP);
    this.grindBodyLP.connect(bodyGain);
    bodyGain.connect(this.grindOut);

    // --- sparks: the top-end fizz, scales hard with speed ------------------
    this.grindSparkHP = ctx.createBiquadFilter();
    this.grindSparkHP.type = 'highpass';
    this.grindSparkHP.frequency.value = 5200;
    this.grindSparkGain = ctx.createGain();
    this.grindSparkGain.gain.value = 0.1;
    src.connect(this.grindSparkHP);
    this.grindSparkHP.connect(this.grindSparkGain);
    this.grindSparkGain.connect(this.grindOut);

    src.start();
    this.grindSrc = src;
    this.grindActive = true;

    // ~25 ms fade-in: the transient is supplied by playGrindStart(), so the bed
    // itself must not add a second click. This uses setTargetAtTime rather than
    // a ramp on purpose — updateGrind() writes setTargetAtTime to the same param
    // every frame, and a scheduled ramp ending later than those writes would
    // override them and pin the level at the fade-in value.
    this.grindOut.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.grindOut.gain.setTargetAtTime(0.12, ctx.currentTime, 0.008);
  }

  /**
   * @param speed     m/s along the rail
   * @param balance01 0..1, 0.5 centred — used to brighten the rail as you wobble;
   *                  the anxiety layer proper is updateBalanceWarning.
   */
  updateGrind(speed: number, balance01 = 0.5): void {
    if (!this.ctx || !this.grindOut || !this.grindSrc) return;
    const t = this.ctx.currentTime;
    const norm = clamp01(speed / 18);
    const danger = clamp01((Math.abs(balance01 - 0.5) - 0.12) / 0.28);

    // Volume floor is high: even a slow grind is a loud, present sound.
    this.grindOut.gain.setTargetAtTime(0.05 + 0.25 * Math.pow(norm, 0.6), t, 0.05);
    this.grindSrc.playbackRate.setTargetAtTime(0.7 + 0.9 * norm, t, 0.06);

    // Mode centre rises with speed, and rises further as you lose balance —
    // the rail literally starts to scream when you are about to go.
    const f0 = (1400 + 1500 * norm) * (1 + 0.22 * danger);
    for (let i = 0; i < this.grindModes.length; i++) {
      this.grindModes[i].frequency.setTargetAtTime(
        clamp(f0 * ProceduralSounds.GRIND_MODE_RATIOS[i], 60, 16000), t, 0.05,
      );
    }
    this.grindBodyLP?.frequency.setTargetAtTime(180 + 220 * norm, t, 0.06);
    // The spark band climbs too, so fast grinds fizz rather than hiss.
    this.grindSparkHP?.frequency.setTargetAtTime(4200 + 3000 * norm, t, 0.06);
    this.grindSparkGain?.gain.setTargetAtTime(0.04 + 0.22 * norm * norm, t, 0.06);
  }

  stopGrindLoop(): void {
    const src = this.grindSrc;
    const out = this.grindOut;
    this.grindSrc = null;
    this.grindOut = null;
    this.grindModes = [];
    this.grindBodyLP = null;
    this.grindSparkHP = null;
    this.grindSparkGain = null;
    this.grindActive = false;
    if (!this.ctx || !src) return;
    const t = this.ctx.currentTime;
    // Release: pitch and level fall together over 110 ms, which reads as the
    // chair lifting off the rail rather than the sound being switched off.
    if (out) {
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(Math.max(0.0002, out.gain.value), t);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    }
    src.playbackRate.setTargetAtTime(0.45, t, 0.05);
    try { src.stop(t + 0.14); } catch { /* already stopped */ }
  }

  /** The metal "catch" as the chair frame lands on the rail. */
  playGrindStart(): void {
    if (!this.ctx || !this.sfxBus || !this.claim(1, 0.3)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Bright contact transient, swept down: hard edge meeting hard edge.
    const src = this.noiseSource(this.scrapeBuf, false, 1.4);
    if (!src) return;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(4200, t);
    bp.frequency.exponentialRampToValueAtTime(1500, t + 0.16);
    bp.Q.value = 4;
    const g = ctx.createGain();
    this.perc(g, t, 1.8, 0.004, 0.2);
    src.connect(bp); bp.connect(g); g.connect(this.sfxBus);
    this.sendReverb(g, 0.2);
    src.start(t);
    src.stop(t + 0.25);

    // A short metallic ring so the catch has pitch as well as noise.
    const ring = ctx.createOscillator();
    ring.type = 'triangle';
    ring.frequency.setValueAtTime(880, t);
    ring.frequency.exponentialRampToValueAtTime(620, t + 0.12);
    const rg = ctx.createGain();
    this.perc(rg, t, 0.16, 0.003, 0.13);
    ring.connect(rg); rg.connect(this.sfxBus);
    ring.start(t); ring.stop(t + 0.16);
  }

  // -------------------------------------------------------------------------
  // Grind anxiety layer (balance)
  // -------------------------------------------------------------------------
  //
  // INTENT: the player must be able to feel the balance meter without looking
  // at it. Two sawtooths a beating 9 cents apart, bandpassed, with a tremolo
  // whose RATE climbs from 3 Hz to 14 Hz as you approach the edge. Rate, not
  // just level: an accelerating pulse is the most reliable "you are running out
  // of time" cue there is, and it is what makes a long grind feel like a held
  // breath rather than a free ride.

  startBalanceWarning(): void {
    if (!this.ctx || !this.sfxBus || this.anxActive) return;
    const ctx = this.ctx;

    this.anxOut = ctx.createGain();
    this.anxOut.gain.value = 0;
    this.anxOut.connect(this.sfxBus);

    this.anxBP = ctx.createBiquadFilter();
    this.anxBP.type = 'bandpass';
    this.anxBP.frequency.value = 320;
    this.anxBP.Q.value = 4;
    this.anxBP.connect(this.anxOut);

    // Tremolo: an LFO writing into a gain that sits between the oscillators and
    // the filter. Base 0.55 + depth means it pulses to near-silence at full
    // depth without ever fully gating (a full gate clicks).
    const tremGain = ctx.createGain();
    tremGain.gain.value = 0.55;
    tremGain.connect(this.anxBP);
    this.anxTrem = ctx.createOscillator();
    this.anxTrem.type = 'sine';
    this.anxTrem.frequency.value = 3;
    this.anxTremDepth = ctx.createGain();
    this.anxTremDepth.gain.value = 0;
    this.anxTrem.connect(this.anxTremDepth);
    this.anxTremDepth.connect(tremGain.gain);

    this.anxA = ctx.createOscillator();
    this.anxA.type = 'sawtooth';
    this.anxA.frequency.value = 220;
    this.anxB = ctx.createOscillator();
    this.anxB.type = 'sawtooth';
    this.anxB.frequency.value = 220;
    this.anxB.detune.value = 9; // 9 cents => ~1.1 Hz beating at 220 Hz: uneasy
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    this.anxA.connect(mix); this.anxB.connect(mix);
    mix.connect(tremGain);

    this.anxA.start(); this.anxB.start(); this.anxTrem.start();
    this.anxActive = true;
  }

  /** @param balance 0..1, 0.5 = centred. */
  updateBalanceWarning(balance: number): void {
    if (!this.ctx || !this.anxOut || !this.anxA || !this.anxB
        || !this.anxBP || !this.anxTrem || !this.anxTremDepth) return;
    const t = this.ctx.currentTime;

    // Dead zone to 0.12 either side of centre; full panic by 0.40 (i.e. 0.10/0.90).
    const dist = Math.abs(balance - 0.5);
    const danger = clamp01((dist - 0.12) / 0.28);

    if (danger <= 0) {
      this.anxOut.gain.setTargetAtTime(0, t, 0.08);
      return;
    }

    // Level curve is convex: barely there at the edge of the dead zone, urgent
    // at the end. A linear ramp here nags during normal riding.
    this.anxOut.gain.setTargetAtTime(0.14 * danger * danger, t, 0.04);
    this.anxTremDepth.gain.setTargetAtTime(0.20 + 0.25 * danger, t, 0.06);
    this.anxTrem.frequency.setTargetAtTime(3 + 11 * danger, t, 0.06);

    const f = 200 + 340 * danger;
    this.anxA.frequency.setTargetAtTime(f, t, 0.05);
    this.anxB.frequency.setTargetAtTime(f, t, 0.05);
    this.anxBP.frequency.setTargetAtTime(f * 1.6, t, 0.05);
  }

  stopBalanceWarning(): void {
    const nodes = [this.anxA, this.anxB, this.anxTrem];
    const out = this.anxOut;
    this.anxA = null; this.anxB = null; this.anxTrem = null;
    this.anxBP = null; this.anxTremDepth = null; this.anxOut = null;
    this.anxActive = false;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (out) {
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(0, t + 0.05);
    }
    for (const n of nodes) { if (n) { try { n.stop(t + 0.07); } catch { /* already stopped */ } } }
  }

  // =========================================================================
  // OLLIE / LAND / BAIL
  // =========================================================================

  /**
   * OLLIE — a crisp pop. Three layers:
   *   body   a sine falling 240 -> 90 Hz in 70 ms. This is the "thock" of the
   *          chair frame taking the load. Falling pitch = mass leaving the floor.
   *   click  a few ms of bandpassed noise at 2.2 kHz. This is the ATTACK; without
   *          it the ollie sounds soft and the input feels laggy.
   *   whoosh a rising bandpass sweep, only on a charged pop, so holding the
   *          button is audibly worth something.
   * @param charge 0..1 hold charge
   */
  playOllie(charge = 0.5): void {
    if (!this.ctx || !this.sfxBus) return;
    if (!this.throttle('ollie', 0.05)) return;
    if (!this.claim(1, 0.3)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const c = clamp01(charge);

    const body = ctx.createOscillator();
    body.type = 'sine';
    const f0 = 240 * (0.85 + 0.32 * c);
    body.frequency.setValueAtTime(f0, t);
    body.frequency.exponentialRampToValueAtTime(90, t + 0.07);
    const bg = ctx.createGain();
    this.perc(bg, t, 0.42 + 0.16 * c, 0.002, 0.1);
    body.connect(bg); bg.connect(this.sfxBus);
    body.start(t); body.stop(t + 0.14);

    const click = this.noiseSource(this.whiteBuf, false, 1);
    if (click) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2200;
      bp.Q.value = 2;
      const cg = ctx.createGain();
      this.perc(cg, t, 0.36, 0.001, 0.028);
      click.connect(bp); bp.connect(cg); cg.connect(this.sfxBus);
      click.start(t); click.stop(t + 0.04);
    }

    if (c > 0.3) {
      const wh = this.noiseSource(this.pinkBuf, false, 1);
      if (wh) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(500, t);
        bp.frequency.exponentialRampToValueAtTime(1800, t + 0.16);
        bp.Q.value = 1.4;
        const wg = ctx.createGain();
        this.perc(wg, t, 0.06 + 0.06 * c, 0.03, 0.14);
        wh.connect(bp); bp.connect(wg); wg.connect(this.sfxBus);
        wh.start(t); wh.stop(t + 0.2);
      }
    }
  }

  /** Legacy name; the ollie is the jump. */
  playJump(charge = 0.5): void { this.playOllie(charge); }

  /**
   * LAND — a weighted thud that scales with the drop.
   *   thud   sine 150 -> 42 Hz. Longer and louder the harder you land.
   *   slap   lowpassed noise: the wheels hitting. Gets brighter with impact.
   *   rattle three bandpassed clicks at 1.4/2.1/3.0 kHz, only on hard landings,
   *          staggered 18/37/58 ms — the chair's parts arriving out of sync.
   *   sub    a 60 -> 35 Hz sine on a big drop, for the chest hit.
   * @param intensity 0..1 (air time or drop height normalised by the caller)
   */
  playLand(intensity = 0.35): void {
    if (!this.ctx || !this.sfxBus) return;
    if (!this.throttle('land', 0.06)) return;
    if (!this.claim(1, 0.5)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const i = clamp01(intensity);

    const thud = ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(150 + 40 * i, t);
    thud.frequency.exponentialRampToValueAtTime(42, t + 0.07 + 0.06 * i);
    const tg = ctx.createGain();
    this.perc(tg, t, 0.26 + 0.44 * i, 0.002, 0.12 + 0.12 * i);
    thud.connect(tg); tg.connect(this.sfxBus);
    thud.start(t); thud.stop(t + 0.3);

    const slap = this.noiseSource(this.pinkBuf, false, 1);
    if (slap) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(350 + 1500 * i, t);
      lp.frequency.exponentialRampToValueAtTime(220, t + 0.09);
      lp.Q.value = 0.9;
      const sg = ctx.createGain();
      this.perc(sg, t, 0.16 + 0.34 * i, 0.001, 0.06 + 0.05 * i);
      slap.connect(lp); lp.connect(sg); sg.connect(this.sfxBus);
      this.sendReverb(sg, 0.1 + 0.2 * i);
      slap.start(t); slap.stop(t + 0.16);
    }

    if (i > 0.45) {
      const freqs = [1400, 2100, 3000];
      const offs = [0.018, 0.037, 0.058];
      for (let k = 0; k < 3; k++) {
        if (!this.claim(0, 0.06)) break;
        const n = this.noiseSource(this.whiteBuf, false, 1);
        if (!n) break;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = freqs[k];
        bp.Q.value = 7;
        const g = ctx.createGain();
        this.perc(g, t + offs[k], 0.07 * i, 0.001, 0.035);
        n.connect(bp); bp.connect(g); g.connect(this.sfxBus);
        n.start(t + offs[k]); n.stop(t + offs[k] + 0.05);
      }
    }

    if (i > 0.7) {
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(60, t);
      sub.frequency.exponentialRampToValueAtTime(35, t + 0.18);
      const g = ctx.createGain();
      this.perc(g, t, 0.16 * i, 0.006, 0.22);
      sub.connect(g); g.connect(this.sfxBus);
      sub.start(t); sub.stop(t + 0.35);
    }
  }

  /**
   * BAIL — deliberately unpleasant. Failure has to land emotionally, so this is
   * the only sound in the game built to be ugly rather than pretty.
   *   crunch  broadband noise through a tanh waveshaper (odd harmonics, flat
   *           squashed dynamics) then RING-MODULATED at 43 Hz. Ring modulation
   *           produces inharmonic sum/difference partials — the ear reads it as
   *           "broken", which is exactly the message.
   *   chirp   a sawtooth falling 320 -> 38 Hz, also distorted: the descent.
   *   cluster two sawtooths a semitone apart (155/164 Hz). A minor 2nd is the
   *           most reliably sour interval in western listening.
   *   tumble  four scattered low thumps over 550 ms: the chair still moving
   *           after you stopped. This tail is what stops it feeling like a beep.
   * Also ducks the music hard, so the failure is a hole in the mix.
   */
  playBail(): void {
    if (!this.ctx || !this.sfxBus) return;
    if (!this.throttle('bail', 0.35)) return;
    this.claim(2, 0.8);
    const ctx = this.ctx;
    const t = ctx.currentTime;

    this.duckMusic(0.55, 0.18);

    const shaper = ctx.createWaveShaper();
    if (this.crunchCurve) shaper.curve = this.crunchCurve;
    shaper.oversample = '2x';
    const shaperOut = ctx.createGain();
    shaperOut.gain.value = 1;
    shaper.connect(shaperOut);
    shaperOut.connect(this.sfxBus);
    this.sendReverb(shaperOut, 0.25);

    // --- ring-modulated crunch --------------------------------------------
    // A GainNode with gain.value = 0 whose gain AudioParam is driven by an
    // oscillator is a multiplier: out = in * osc. That is true ring modulation,
    // not tremolo, because the modulator swings through zero.
    const crunch = this.noiseSource(this.whiteBuf, false, 0.8);
    if (crunch) {
      const ringGain = ctx.createGain();
      ringGain.gain.value = 0;
      const ringOsc = ctx.createOscillator();
      ringOsc.type = 'square';
      ringOsc.frequency.setValueAtTime(43, t);
      ringOsc.frequency.exponentialRampToValueAtTime(21, t + 0.4);
      ringOsc.connect(ringGain.gain);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2400, t);
      lp.frequency.exponentialRampToValueAtTime(500, t + 0.35);

      const eg = ctx.createGain();
      this.perc(eg, t, 0.45, 0.004, 0.42);

      crunch.connect(ringGain);
      ringGain.connect(lp);
      lp.connect(eg);
      eg.connect(shaper);
      crunch.start(t); crunch.stop(t + 0.5);
      ringOsc.start(t); ringOsc.stop(t + 0.5);
    }

    // --- falling chirp -----------------------------------------------------
    const chirp = ctx.createOscillator();
    chirp.type = 'sawtooth';
    chirp.frequency.setValueAtTime(320, t);
    chirp.frequency.exponentialRampToValueAtTime(38, t + 0.4);
    const cg = ctx.createGain();
    this.perc(cg, t, 0.22, 0.003, 0.4);
    chirp.connect(cg); cg.connect(shaper);
    chirp.start(t); chirp.stop(t + 0.45);

    // --- sour cluster ------------------------------------------------------
    for (const f of [155, 164.2]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1400, t);
      lp.frequency.exponentialRampToValueAtTime(300, t + 0.3);
      const g = ctx.createGain();
      this.perc(g, t, 0.1, 0.006, 0.3);
      o.connect(lp); lp.connect(g); g.connect(this.sfxBus);
      o.start(t); o.stop(t + 0.36);
    }

    // --- tumble tail -------------------------------------------------------
    const tumbleAt = [0.09, 0.21, 0.34, 0.52];
    for (let k = 0; k < tumbleAt.length; k++) {
      if (!this.claim(0, 0.2)) break;
      const at = t + tumbleAt[k] + Math.random() * 0.03;
      const o = ctx.createOscillator();
      o.type = 'sine';
      const base = 130 - k * 16;
      o.frequency.setValueAtTime(base, at);
      o.frequency.exponentialRampToValueAtTime(base * 0.45, at + 0.07);
      const g = ctx.createGain();
      this.perc(g, at, 0.16 * (1 - k * 0.18), 0.002, 0.1);
      o.connect(g); g.connect(this.sfxBus);
      this.sendReverb(g, 0.18);
      o.start(at); o.stop(at + 0.16);

      const n = this.noiseSource(this.pinkBuf, false, 1);
      if (n) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900 - k * 130;
        const ng = ctx.createGain();
        this.perc(ng, at, 0.09 * (1 - k * 0.18), 0.001, 0.05);
        n.connect(lp); lp.connect(ng); ng.connect(this.sfxBus);
        n.start(at); n.stop(at + 0.09);
      }
    }
  }

  /** Push / kick — a soft shove against the floor. */
  playPush(): void {
    if (!this.ctx || !this.sfxBus) return;
    if (!this.throttle('push', 0.14)) return;
    if (!this.claim(0, 0.2)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(96, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.1);
    const g = ctx.createGain();
    this.perc(g, t, 0.28, 0.004, 0.12);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + 0.18);

    // Shoe scuff: brief midrange noise, so it reads as a foot not a drum.
    const n = this.noiseSource(this.pinkBuf, false, 1);
    if (n) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(900, t);
      bp.frequency.exponentialRampToValueAtTime(1900, t + 0.1);
      bp.Q.value = 1.2;
      const ng = ctx.createGain();
      this.perc(ng, t, 0.09, 0.008, 0.1);
      n.connect(bp); bp.connect(ng); ng.connect(this.sfxBus);
      n.start(t); n.stop(t + 0.16);
    }
  }

  // =========================================================================
  // TRICK STINGS AND COMBO ESCALATION
  // =========================================================================
  //
  // INTENT: every trick must be legible as "bigger" or "smaller" than the last
  // one, and a long line must audibly build. Two mechanisms do that:
  //   1. Trick VALUE picks the register: cheap tricks are low and short, a
  //      special is high, long and has a low octave doubled under it for weight.
  //   2. Trick ORDER within a combo walks UP a minor pentatonic. The 1st trick
  //      in a line is the root, the 8th is nearly two octaves up. That rising
  //      line is what makes a combo feel like it is going somewhere, and because
  //      the scale is pentatonic it cannot land on a sour interval no matter
  //      how many tricks are strung together.
  //
  // Voice: two-operator FM (carrier sine + modulator sine at 3.0x with a fast
  // decaying index). A decaying modulation index gives a bright attack that
  // mellows into a pure tone — the classic bell/mallet envelope. Cheaper and
  // more musical than a filtered saw.

  /**
   * @param points base points of the trick (roughly 100 .. 3000)
   */
  playTrick(points = 500): void {
    if (!this.ctx || !this.sfxBus) return;
    if (!this.throttle('trick', 0.045)) return;
    if (!this.claim(1, 0.6)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const v = clamp01((points - 100) / 2200);   // value 0..1

    // Register from value (0..4 scale steps), position from the combo index.
    // Capped so a 30-trick line does not end up as a dog whistle.
    const degree = Math.min(14, Math.round(v * 4) + this.comboTrickIndex);
    const freq = semis(220, pentatonic(degree));
    this.comboTrickIndex = Math.min(this.comboTrickIndex + 1, 11);

    const decay = 0.16 + 0.30 * v;
    const modRatio = 3.0;
    const modIndexHz = freq * (1.6 + 2.4 * v);  // peak deviation in Hz

    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = freq;

    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = freq * modRatio;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(modIndexHz, t);
    // Index falls to 3% in a third of the decay: bright ping, clean tail.
    modGain.gain.exponentialRampToValueAtTime(modIndexHz * 0.03, t + decay * 0.35);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    const g = ctx.createGain();
    this.perc(g, t, 0.26 + 0.24 * v, 0.003, decay);
    carrier.connect(g); g.connect(this.sfxBus);
    this.sendReverb(g, 0.22);

    carrier.start(t); carrier.stop(t + decay + 0.06);
    mod.start(t); mod.stop(t + decay + 0.06);

    // Big tricks get an octave-down sine for body, so "big" is felt not just heard.
    if (v > 0.5) {
      const sub = ctx.createOscillator();
      sub.type = 'triangle';
      sub.frequency.value = freq * 0.5;
      const sg = ctx.createGain();
      this.perc(sg, t, 0.09 * v, 0.006, decay * 0.8);
      sub.connect(sg); sg.connect(this.sfxBus);
      sub.start(t); sub.stop(t + decay);
    }

    // Attack transient so the sting cuts through the roll/grind bed.
    const click = this.noiseSource(this.whiteBuf, false, 1);
    if (click) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3500;
      const cg = ctx.createGain();
      this.perc(cg, t, 0.10 + 0.08 * v, 0.001, 0.02);
      click.connect(hp); hp.connect(cg); cg.connect(this.sfxBus);
      click.start(t); click.stop(t + 0.035);
    }
  }

  /**
   * Combo state, called every frame while a line is open.
   * @param open       is the combo still running
   * @param multiplier current combo multiplier (1..n)
   *
   * INTENT: a sustained riser under a long line. A noise band that climbs and
   * narrows, plus a root+fifth drone that opens its filter as the multiplier
   * grows. Both are quiet — this is tension you notice when it STOPS, which is
   * what makes banking a combo feel like a release.
   */
  setComboState(open: boolean, multiplier: number): void {
    if (!this.ctx || !this.sfxBus) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    if (open && !this.comboActive) this.startComboRiser();
    if (!open && this.comboActive) { this.stopComboRiser(); return; }
    if (!this.comboActive) return;

    const m = clamp(multiplier, 1, 12);
    const climb = clamp01((m - 1) / 7);          // 0 at x1, 1 at x8+

    // A tick each time the multiplier steps up: a short pip an octave over the
    // current trick register. This is the "you just went up a gear" cue.
    if (multiplier > this.lastMultiplier) this.playMultiplierPip(multiplier);
    this.lastMultiplier = multiplier;

    this.riserBP?.frequency.setTargetAtTime(400 + 2600 * climb, t, 0.4);
    this.riserBP?.Q.setTargetAtTime(1.5 + 5 * climb, t, 0.4);
    this.riserOut?.gain.setTargetAtTime(0.012 + 0.045 * climb, t, 0.35);

    this.droneLP?.frequency.setTargetAtTime(180 + 900 * climb, t, 0.4);
    this.droneOut?.gain.setTargetAtTime(0.02 + 0.05 * climb, t, 0.35);
  }

  private startComboRiser(): void {
    if (!this.ctx || !this.sfxBus || this.comboActive) return;
    const ctx = this.ctx;

    this.riserOut = ctx.createGain();
    this.riserOut.gain.value = 0;
    this.riserOut.connect(this.sfxBus);
    this.sendReverb(this.riserOut, 0.3);

    this.riserBP = ctx.createBiquadFilter();
    this.riserBP.type = 'bandpass';
    this.riserBP.frequency.value = 400;
    this.riserBP.Q.value = 1.5;
    this.riserBP.connect(this.riserOut);

    const src = this.noiseSource(this.pinkBuf, true, 1);
    if (src) { src.connect(this.riserBP); src.start(); this.riserSrc = src; }

    // Root + fifth on A: the most stable dyad there is, so it never fights the
    // music no matter what chord the music engine happens to be on.
    this.droneOut = ctx.createGain();
    this.droneOut.gain.value = 0;
    this.droneOut.connect(this.sfxBus);
    this.droneLP = ctx.createBiquadFilter();
    this.droneLP.type = 'lowpass';
    this.droneLP.frequency.value = 180;
    this.droneLP.Q.value = 2.5;
    this.droneLP.connect(this.droneOut);
    this.droneA = ctx.createOscillator();
    this.droneA.type = 'sawtooth';
    this.droneA.frequency.value = 55;      // A1
    this.droneB = ctx.createOscillator();
    this.droneB.type = 'sawtooth';
    this.droneB.frequency.value = 82.4;    // E2
    const dm = ctx.createGain();
    dm.gain.value = 0.5;
    this.droneA.connect(dm); this.droneB.connect(dm);
    dm.connect(this.droneLP);
    this.droneA.start(); this.droneB.start();

    this.comboActive = true;
    this.lastMultiplier = 1;
  }

  private stopComboRiser(): void {
    const src = this.riserSrc;
    const a = this.droneA, b = this.droneB;
    const ro = this.riserOut, dOut = this.droneOut;
    this.riserSrc = null; this.riserBP = null; this.riserOut = null;
    this.droneA = null; this.droneB = null; this.droneLP = null; this.droneOut = null;
    this.comboActive = false;
    this.comboTrickIndex = 0;
    this.lastMultiplier = 1;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const g of [ro, dOut]) {
      if (!g) continue;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 0.12);
    }
    for (const n of [src, a, b]) { if (n) { try { n.stop(t + 0.15); } catch { /* ok */ } } }
  }

  /** Short pip on a multiplier step-up. */
  private playMultiplierPip(multiplier: number): void {
    if (!this.ctx || !this.sfxBus) return;
    if (!this.throttle('mulpip', 0.12)) return;
    if (!this.claim(1, 0.3)) return;
    const ctx = this.ctx;
    const sfx = this.sfxBus;
    const t = ctx.currentTime;
    const deg = Math.min(16, 5 + Math.round(multiplier));
    const f = semis(220, pentatonic(deg));
    for (let k = 0; k < 2; k++) {
      const o = ctx.createOscillator();
      o.type = k === 0 ? 'triangle' : 'sine';
      o.frequency.value = f * (k === 0 ? 1 : 2);
      const g = ctx.createGain();
      this.perc(g, t + k * 0.045, 0.11 - k * 0.045, 0.002, 0.13);
      o.connect(g); g.connect(sfx);
      this.sendReverb(g, 0.3);
      o.start(t + k * 0.045); o.stop(t + k * 0.045 + 0.2);
    }
  }

  /**
   * BANKING A COMBO — the payoff. A cash register, because the score is money.
   *   cha     lowpassed noise + a 210 -> 85 Hz sine: the drawer.
   *   ching   an inharmonic bell (partials at 1 : 2.41 : 3.86 — close to the low
   *           modes of a real struck bell) an octave up.
   *   coins   up to 12 short pentatonic pings scattered over 400 ms. The count
   *           and the register both scale with the score, so a huge bank is
   *           audibly a bigger pile of money and not just a louder ding.
   *   sub     a 55 Hz swell on a monster bank.
   * Ducks the music so it always cuts through.
   */
  playChaChing(score = 1000): void {
    if (!this.ctx || !this.sfxBus) return;
    if (!this.throttle('bank', 0.12)) return;
    this.claim(2, 1.0);
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const s = clamp01(score / 25000);

    this.duckMusic(0.28 + 0.22 * s, 0.1);

    // --- cha ---------------------------------------------------------------
    const drawer = ctx.createOscillator();
    drawer.type = 'sine';
    drawer.frequency.setValueAtTime(210, t);
    drawer.frequency.exponentialRampToValueAtTime(85, t + 0.08);
    const dg = ctx.createGain();
    this.perc(dg, t, 0.3, 0.002, 0.13);
    drawer.connect(dg); dg.connect(this.sfxBus);
    drawer.start(t); drawer.stop(t + 0.2);

    const chaN = this.noiseSource(this.pinkBuf, false, 1);
    if (chaN) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const g = ctx.createGain();
      this.perc(g, t, 0.16, 0.001, 0.07);
      chaN.connect(lp); lp.connect(g); g.connect(this.sfxBus);
      chaN.start(t); chaN.stop(t + 0.12);
    }

    // --- ching -------------------------------------------------------------
    const base = 1046.5 * (1 + 0.22 * s);   // C6, brighter the bigger the bank
    const partials = [1, 2.41, 3.86];
    const partialGain = [0.2, 0.1, 0.055];
    for (let k = 0; k < partials.length; k++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * partials[k];
      const g = ctx.createGain();
      this.perc(g, t + 0.02, partialGain[k] * (0.7 + 0.5 * s), 0.004, 0.5 + 0.5 * s);
      o.connect(g); g.connect(this.sfxBus);
      this.sendReverb(g, 0.35);
      o.start(t + 0.02); o.stop(t + 1.2);
    }

    // --- coins -------------------------------------------------------------
    const coins = Math.min(12, Math.round(2 + s * 12));
    for (let k = 0; k < coins; k++) {
      if (!this.claim(0, 0.2)) break;
      const at = t + 0.05 + Math.random() * 0.4;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = semis(1760, pentatonic(Math.floor(Math.random() * 8)));
      const g = ctx.createGain();
      this.perc(g, at, 0.05, 0.001, 0.07 + Math.random() * 0.06);
      o.connect(g); g.connect(this.sfxBus);
      this.sendReverb(g, 0.4);
      o.start(at); o.stop(at + 0.18);
    }

    // --- sub ---------------------------------------------------------------
    if (s > 0.35) {
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = 55;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2 * s, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      sub.connect(g); g.connect(this.sfxBus);
      sub.start(t); sub.stop(t + 0.75);
    }
  }

  /**
   * Resolving cadence when a line is banked. Rises through the multiplier as an
   * arpeggio, so a x7 line resolves higher and longer than a x2.
   */
  playComboLanded(multiplier: number): void {
    if (!this.ctx || !this.sfxBus) return;
    if (!this.throttle('comboLanded', 0.2)) return;
    const ctx = this.ctx;
    const sfx = this.sfxBus;
    const t0 = ctx.currentTime;
    const n = clamp(Math.round(multiplier), 1, 6);

    for (let i = 0; i < n; i++) {
      if (!this.claim(1, 0.4)) break;
      const at = t0 + 0.03 + i * 0.055;
      const f = semis(440, pentatonic(i + 2));
      // Triangle + a quiet sine an octave up: sweet, not piercing.
      for (let k = 0; k < 2; k++) {
        const o = ctx.createOscillator();
        o.type = k === 0 ? 'triangle' : 'sine';
        o.frequency.value = f * (k === 0 ? 1 : 2);
        const g = ctx.createGain();
        this.perc(g, at, (k === 0 ? 0.13 : 0.05) * (0.7 + 0.3 * (i + 1) / n), 0.004, 0.22);
        o.connect(g); g.connect(sfx);
        this.sendReverb(g, 0.3);
        o.start(at); o.stop(at + 0.3);
      }
    }
    this.comboTrickIndex = 0;
  }

  /** Special meter full — a bright, unmistakable major triad + shimmer. */
  playSpecialReady(): void {
    if (!this.ctx || !this.sfxBus) return;
    if (!this.throttle('special', 0.6)) return;
    this.claim(2, 1.2);
    const ctx = this.ctx;
    const sfx = this.sfxBus;
    const t = ctx.currentTime;
    this.duckMusic(0.3, 0.14);

    // A major (A C# E A) — deliberately MAJOR against the game's minor score, so
    // it reads as an unlock rather than as part of the music.
    const chord = [440, 554.37, 659.25, 880];
    chord.forEach((f, i) => {
      const at = t + i * 0.035;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.12, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.85);
      o.connect(g); g.connect(sfx);
      this.sendReverb(g, 0.4);
      o.start(at); o.stop(at + 0.9);
    });

    // Shimmer: fast upward pings so the chord has motion.
    for (let k = 0; k < 6; k++) {
      if (!this.claim(0, 0.3)) break;
      const at = t + 0.06 + k * 0.045;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = semis(1760, pentatonic(k + 3));
      const g = ctx.createGain();
      this.perc(g, at, 0.05, 0.002, 0.16);
      o.connect(g); g.connect(sfx);
      this.sendReverb(g, 0.45);
      o.start(at); o.stop(at + 0.25);
    }
  }

  // =========================================================================
  // SMASH IMPACTS
  // =========================================================================
  //
  // INTENT: you should know what you just destroyed without looking. Each
  // material gets a different physical model:
  //   paper     no pitch at all. Highpassed noise in three staggered flutters.
  //   cardboard a dull box: a woody 180 Hz resonance plus midrange noise.
  //   plastic   a bright, fast, hollow clack with a short pitched ring.
  //   metal     inharmonic partials that RING — the only long impact.
  //   soil      lowpassed, dead, no ring, with granular scatter.
  //   glass     a bright noise burst plus a scatter of high sine shards.
  //
  // The tell is decay time and harmonicity, which is genuinely how these
  // materials differ: metal is long and inharmonic, glass is short and very
  // high, soil is short and has no partials at all.

  /**
   * @param material debris kind from the SmashEvent
   * @param impulse  closing momentum in kg m/s (roughly 5 .. 150)
   */
  playSmash(material: SmashMaterial, impulse = 40): void {
    if (!this.ctx || !this.sfxBus) return;
    // Ploughing through a row of props can fire many of these in a few frames.
    if (!this.throttle('smash', 0.035)) return;
    if (!this.claim(1, 0.9)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const e = clamp01(impulse / 120);            // energy 0..1
    const amp = 0.2 + 0.25 * e;

    switch (material) {
      case 'paper': {
        // Three overlapping flutters, each a short highpassed noise swell.
        for (let k = 0; k < 3; k++) {
          const n = this.noiseSource(this.whiteBuf, false, 0.85 + Math.random() * 0.4);
          if (!n) break;
          const hp = ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 1800 + k * 900;
          const pk = ctx.createBiquadFilter();
          pk.type = 'peaking';
          pk.frequency.value = 4200;
          pk.Q.value = 0.8;
          pk.gain.value = 5;
          const g = ctx.createGain();
          const at = t + k * 0.045;
          // Slow attack: paper swells, it does not click.
          this.perc(g, at, amp * 0.5 * (1 - k * 0.2), 0.02, 0.16);
          n.connect(hp); hp.connect(pk); pk.connect(g); g.connect(this.sfxBus);
          n.start(at); n.stop(at + 0.22);
        }
        break;
      }

      case 'cardboard': {
        const n = this.noiseSource(this.pinkBuf, false, 1);
        if (n) {
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 1600;
          const g = ctx.createGain();
          this.perc(g, t, amp * 1.8, 0.002, 0.13);
          n.connect(lp); lp.connect(g); g.connect(this.sfxBus);
          n.start(t); n.stop(t + 0.2);
        }
        // The box itself: a low woody mode with a quick decay.
        for (const [f, gv] of [[180, 1.6], [297, 0.7]] as const) {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.setValueAtTime(f, t);
          o.frequency.exponentialRampToValueAtTime(f * 0.85, t + 0.12);
          const g = ctx.createGain();
          this.perc(g, t, amp * gv, 0.003, 0.14);
          o.connect(g); g.connect(this.sfxBus);
          o.start(t); o.stop(t + 0.22);
        }
        break;
      }

      case 'plastic': {
        const n = this.noiseSource(this.whiteBuf, false, 1);
        if (n) {
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.setValueAtTime(2600, t);
          bp.frequency.exponentialRampToValueAtTime(1500, t + 0.06);
          bp.Q.value = 2.2;
          const g = ctx.createGain();
          this.perc(g, t, amp * 2.6, 0.001, 0.055);
          n.connect(bp); bp.connect(g); g.connect(this.sfxBus);
          n.start(t); n.stop(t + 0.09);
        }
        // Hollow ring: two close partials, short. Plastic rings, but not for long.
        for (const [ratio, gv] of [[1, 1.3], [2.7, 0.6]] as const) {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = 640 * ratio * (0.9 + 0.25 * e);
          const g = ctx.createGain();
          this.perc(g, t, amp * gv, 0.002, 0.1);
          o.connect(g); g.connect(this.sfxBus);
          o.start(t); o.stop(t + 0.16);
        }
        break;
      }

      case 'metal': {
        // The only impact with a real tail. Five inharmonic modes taken from a
        // struck-bar series; each decays at its own rate (higher = faster),
        // which is what makes a clang evolve instead of just fading.
        const f0 = 420 * (0.85 + 0.35 * e);
        const ratios = [1, 2.76, 5.40, 8.93, 13.34];
        const gains = [0.5, 0.34, 0.2, 0.12, 0.07];
        for (let k = 0; k < ratios.length; k++) {
          if (!this.claim(0, 1.0)) break;
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = f0 * ratios[k];
          const g = ctx.createGain();
          this.perc(g, t, amp * gains[k], 0.002, (0.9 + 0.5 * e) / (1 + k * 0.7));
          o.connect(g); g.connect(this.sfxBus);
          this.sendReverb(g, 0.3);
          o.start(t); o.stop(t + 1.6);
        }
        // Strike transient.
        const n = this.noiseSource(this.whiteBuf, false, 1);
        if (n) {
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = 3800;
          bp.Q.value = 1.4;
          const g = ctx.createGain();
          this.perc(g, t, amp * 0.7, 0.001, 0.04);
          n.connect(bp); bp.connect(g); g.connect(this.sfxBus);
          n.start(t); n.stop(t + 0.07);
        }
        break;
      }

      case 'soil': {
        // No partials at all: dirt does not ring. Just a lowpassed thump and
        // a spray of tiny grains.
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(110, t);
        o.frequency.exponentialRampToValueAtTime(46, t + 0.09);
        const og = ctx.createGain();
        this.perc(og, t, amp * 1.7, 0.003, 0.1);
        o.connect(og); og.connect(this.sfxBus);
        o.start(t); o.stop(t + 0.18);

        const n = this.noiseSource(this.pinkBuf, false, 1);
        if (n) {
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(1100, t);
          lp.frequency.exponentialRampToValueAtTime(380, t + 0.2);
          const g = ctx.createGain();
          this.perc(g, t, amp * 1.2, 0.004, 0.22);
          n.connect(lp); lp.connect(g); g.connect(this.sfxBus);
          n.start(t); n.stop(t + 0.3);
        }
        break;
      }

      case 'glass': {
        const n = this.noiseSource(this.whiteBuf, false, 1.2);
        if (n) {
          const hp = ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 2600;
          const g = ctx.createGain();
          this.perc(g, t, amp * 1.2, 0.001, 0.09);
          n.connect(hp); hp.connect(g); g.connect(this.sfxBus);
          this.sendReverb(g, 0.3);
          n.start(t); n.stop(t + 0.14);
        }
        // Shards: very high, very short sines scattered over 300 ms.
        const shards = 5 + Math.round(e * 5);
        for (let k = 0; k < shards; k++) {
          if (!this.claim(0, 0.2)) break;
          const at = t + Math.random() * 0.3;
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = 2200 + Math.random() * 4200;
          const g = ctx.createGain();
          this.perc(g, at, amp * 0.26, 0.001, 0.05 + Math.random() * 0.08);
          o.connect(g); g.connect(this.sfxBus);
          this.sendReverb(g, 0.35);
          o.start(at); o.stop(at + 0.16);
        }
        break;
      }
    }
  }

  // =========================================================================
  // POLICE
  // =========================================================================
  //
  // INTENT: three distinct states the player must never confuse.
  //   SPOTTED  a whistle. Sharp, human, unmistakable, and it is the one sound
  //            in the game with a fast trill in it so nothing else masks it.
  //   PURSUIT  a low, pulsing tension bed whose pulse RATE and filter both open
  //            with heat. It sits under everything and makes the room feel small.
  //   LOST     a falling perfect fifth, the tension bed released. Relief.

  /**
   * A real whistle is a jet-edge tone plus a "pea" rattling in the chamber. The
   * pea shows up as a ~28 Hz frequency modulation of the tone, which is why a
   * referee whistle warbles. That warble is the entire character of the sound.
   */
  playPoliceWhistle(): void {
    if (!this.ctx || !this.sfxBus) return;
    if (!this.throttle('whistle', 0.9)) return;
    this.claim(2, 0.8);
    const ctx = this.ctx;
    const sfx = this.sfxBus;
    const t0 = ctx.currentTime;
    this.duckMusic(0.3, 0.2);

    const blasts = [
      { at: 0.0, dur: 0.17 },
      { at: 0.26, dur: 0.30 },
    ];

    for (const b of blasts) {
      const t = t0 + b.at;
      const f = 2450;

      // Tone + pea trill
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const pea = ctx.createOscillator();
      pea.type = 'sine';
      pea.frequency.value = 28;
      const peaDepth = ctx.createGain();
      peaDepth.gain.value = 110;             // +/-110 Hz warble
      pea.connect(peaDepth);
      peaDepth.connect(o.frequency);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.012);   // sharp onset
      g.gain.setValueAtTime(0.2, t + b.dur - 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + b.dur);
      o.connect(g); g.connect(sfx);
      this.sendReverb(g, 0.35);
      o.start(t); o.stop(t + b.dur + 0.02);
      pea.start(t); pea.stop(t + b.dur + 0.02);

      // Breath: narrow bandpassed noise at the same pitch, so it sounds blown.
      const n = this.noiseSource(this.whiteBuf, false, 1);
      if (n) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f;
        bp.Q.value = 16;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.13, t + 0.014);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + b.dur);
        n.connect(bp); bp.connect(ng); ng.connect(sfx);
        n.start(t); n.stop(t + b.dur + 0.02);
      }

      // A second partial an octave and a bit up: whistles are not pure tones.
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = f * 2.06;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(0.05, t + 0.014);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + b.dur);
      o2.connect(g2); g2.connect(sfx);
      o2.start(t); o2.stop(t + b.dur + 0.02);
    }
  }

  private startHeatBed(): void {
    if (!this.ctx || !this.sfxBus || this.heatActive) return;
    const ctx = this.ctx;

    this.heatOut = ctx.createGain();
    this.heatOut.gain.value = 0;
    this.heatOut.connect(this.sfxBus);
    this.sendReverb(this.heatOut, 0.2);

    this.heatLP = ctx.createBiquadFilter();
    this.heatLP.type = 'lowpass';
    this.heatLP.frequency.value = 200;
    this.heatLP.Q.value = 3;
    this.heatLP.connect(this.heatOut);

    // Pulse: an LFO into a gain, base 0.6 with growing depth, so the bed
    // breathes. Rate climbs with heat — the room's heartbeat speeding up.
    const pulseGain = ctx.createGain();
    pulseGain.gain.value = 0.6;
    pulseGain.connect(this.heatLP);
    this.heatPulse = ctx.createOscillator();
    this.heatPulse.type = 'sine';
    this.heatPulse.frequency.value = 1.6;
    this.heatPulseDepth = ctx.createGain();
    this.heatPulseDepth.gain.value = 0.25;
    this.heatPulse.connect(this.heatPulseDepth);
    this.heatPulseDepth.connect(pulseGain.gain);

    // Root + minor sixth (55 / 87.3 Hz). A minor 6th is unstable and wants to
    // resolve; leaving it unresolved is what makes the bed feel like a threat.
    this.heatA = ctx.createOscillator();
    this.heatA.type = 'sawtooth';
    this.heatA.frequency.value = 55;
    this.heatB = ctx.createOscillator();
    this.heatB.type = 'sawtooth';
    this.heatB.frequency.value = 87.3;
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    this.heatA.connect(mix); this.heatB.connect(mix);
    mix.connect(pulseGain);

    this.heatA.start(); this.heatB.start(); this.heatPulse.start();
    this.heatActive = true;
  }

  /**
   * @param heat 0..1 from PoliceSquad.heatLevel
   */
  updatePolice(heat: number): void {
    if (!this.ctx || !this.sfxBus) return;
    const h = clamp01(heat);
    this.heatValue = h;

    if (h > 0.02 && !this.heatActive) this.startHeatBed();
    if (!this.heatActive) return;

    const t = this.ctx.currentTime;
    this.heatOut?.gain.setTargetAtTime(h < 0.02 ? 0 : 0.02 + 0.075 * h * h, t, 0.5);
    this.heatLP?.frequency.setTargetAtTime(180 + 820 * h, t, 0.5);
    this.heatPulse?.frequency.setTargetAtTime(1.6 + 4.4 * h, t, 0.6);
    this.heatPulseDepth?.gain.setTargetAtTime(0.18 + 0.3 * h, t, 0.6);
  }

  getHeat(): number { return this.heatValue; }

  /** Relief: a falling perfect fifth, and the tension bed lets go. */
  playPoliceLost(): void {
    if (!this.ctx || !this.sfxBus) return;
    if (!this.throttle('policeLost', 0.8)) return;
    const ctx = this.ctx;
    const sfx = this.sfxBus;
    const t = ctx.currentTime;

    // E5 -> A4: a falling fifth is the most conclusive "it's over" gesture in
    // tonal music, which is exactly the feeling of shaking a pursuit.
    const notes = [659.25, 440];
    notes.forEach((f, i) => {
      if (!this.claim(1, 0.7)) return;
      const at = t + i * 0.16;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(3000, at);
      lp.frequency.exponentialRampToValueAtTime(700, at + 0.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
      o.connect(lp); lp.connect(g); g.connect(sfx);
      this.sendReverb(g, 0.4);
      o.start(at); o.stop(at + 0.6);
    });

    this.heatOut?.gain.setTargetAtTime(0, t, 0.35);
  }

  stopPolice(): void {
    const nodes = [this.heatA, this.heatB, this.heatPulse];
    const out = this.heatOut;
    this.heatA = null; this.heatB = null; this.heatPulse = null;
    this.heatLP = null; this.heatPulseDepth = null; this.heatOut = null;
    this.heatActive = false;
    this.heatValue = 0;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (out) {
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(0, t + 0.2);
    }
    for (const n of nodes) { if (n) { try { n.stop(t + 0.25); } catch { /* ok */ } } }
  }

  // =========================================================================
  // UI
  // =========================================================================

  playMenuSelect(): void {
    if (!this.ctx || !this.sfxBus || !this.claim(1, 0.2)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (let k = 0; k < 2; k++) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = k === 0 ? 660 : 880;
      const g = ctx.createGain();
      this.perc(g, t + k * 0.05, 0.1, 0.002, 0.09);
      o.connect(g); g.connect(this.sfxBus);
      o.start(t + k * 0.05); o.stop(t + k * 0.05 + 0.14);
    }
  }

  playMenuBack(): void {
    if (!this.ctx || !this.sfxBus || !this.claim(1, 0.2)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (let k = 0; k < 2; k++) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = k === 0 ? 520 : 392;
      const g = ctx.createGain();
      this.perc(g, t + k * 0.05, 0.09, 0.002, 0.09);
      o.connect(g); g.connect(this.sfxBus);
      o.start(t + k * 0.05); o.stop(t + k * 0.05 + 0.14);
    }
  }

  // =========================================================================
  // Teardown
  // =========================================================================

  /** Silence every continuous bed. Called on level unload / game over. */
  stopAllLoops(): void {
    this.stopRoll();
    this.stopGrindLoop();
    this.stopBalanceWarning();
    this.stopComboRiser();
    this.stopPolice();
  }

  get rollRunning(): boolean { return this.rollActive; }
  get grindRunning(): boolean { return this.grindActive; }
  get anxietyRunning(): boolean { return this.anxActive; }
}

// Singleton
export const proceduralSounds = new ProceduralSounds();
