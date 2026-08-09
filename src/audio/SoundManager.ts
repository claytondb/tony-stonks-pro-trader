/**
 * Sound Manager — the procedural MUSIC engine and the audio director.
 *
 * ProceduralSounds.ts owns the AudioContext, the mixer buses and every sound
 * effect. This file borrows those buses and adds the two things that turn a pile
 * of sound effects into a soundtrack:
 *
 *   1. A generative score: drums, bass, comping keys and a lead motif, written
 *      on a lookahead scheduler against the AudioContext clock.
 *   2. A director: one `update()` per frame that reads the game's state and
 *      decides which musical layers are playing and how hard.
 *
 * There are no audio files. Everything is oscillators, filtered noise and
 * envelopes, same as the SFX.
 *
 * ---------------------------------------------------------------------------
 * WHY THE MUSIC IS WRITTEN THIS WAY
 * ---------------------------------------------------------------------------
 * The brief is "pleasant for ten minutes", and the failure mode of generative
 * game music is either (a) a random note generator, which has no memory and
 * therefore no groove, or (b) a four-bar loop, which becomes wallpaper in ninety
 * seconds. This engine avoids both:
 *
 *  KEY      A dorian (A B C D E F# G). Dorian is minor but has a raised 6th, so
 *           it reads as "cool and moving" rather than "sad". It is the mode of
 *           basically every heist/funk cue ever written, which is the register a
 *           game about stealing an office chair should sit in.
 *
 *  HARMONY  A four-bar vamp, Am7 | Am7 | Cmaj7 | D9, repeated as an eight-bar
 *           phrase whose last bar swaps to G6 as a turnaround. Every chord is
 *           diatonic to A dorian, so no voice-leading can produce a wrong note
 *           and the trick stings (A minor pentatonic) are always consonant with
 *           whatever the band is playing. That is the reason the two systems
 *           share a key: SFX and music must never collide.
 *
 *  GROOVE   16th-note grid with ~56% swing. Swing is the single biggest reason
 *           a programmed pattern sounds like music instead of a metronome.
 *           Velocity is accented on the beat and ghosted off it.
 *
 *  REPETITION WITH VARIATION
 *           The engine holds a fixed skeleton (kick on 1 and the "and" of 3,
 *           backbeat snare) so the groove never dissolves, and re-rolls the
 *           decorations — ghost snares, 16th hats, bass passing notes, whether
 *           the lead plays this phrase — from a PRNG that is re-seeded every
 *           eight bars. So it is the same tune every time round and a different
 *           performance every time round. That is what makes it survive ten
 *           minutes; a human drummer does exactly this.
 *
 *  ARRANGEMENT
 *           Layers enter and leave on the game state, always at a bar line so an
 *           entry never sounds like a glitch. Riding around is drums + bass.
 *           Open a combo and the keys come in. Push the multiplier and the lead
 *           motif arrives. Get chased and the tension layer (toms, ride, a
 *           dissonant pad) stacks on top and the tempo pushes up a few BPM.
 *           The score therefore reports on the player's own play.
 */

import { proceduralSounds, type SmashMaterial } from './ProceduralSounds';

// ---------------------------------------------------------------------------
// Music theory constants
// ---------------------------------------------------------------------------

/** A2 = 110 Hz is the tonic. Everything is expressed in semitones from here. */
const TONIC_HZ = 110;

const hz = (semitones: number) => TONIC_HZ * Math.pow(2, semitones / 12);

/** A dorian, in semitones above the tonic. */
const DORIAN = [0, 2, 3, 5, 7, 9, 10];

/**
 * The eight-bar phrase. Each bar names its chord tones (semitones above tonic)
 * and its bass root. Root position is deliberately low; the upper voicings are
 * kept inside a one-octave band around A4 so the comping never gets shrill.
 */
interface Chord {
  name: string;
  /** Bass root, semitones from tonic (may be negative). */
  root: number;
  /** Voicing for the keys, semitones from tonic, already spread. */
  voicing: number[];
  /** Notes the lead is allowed to land on. */
  tones: number[];
}

const Am7: Chord  = { name: 'Am7',   root: 0,  voicing: [12, 15, 19, 22], tones: [0, 3, 7, 10] };
const Cmaj7: Chord = { name: 'Cmaj7', root: 3,  voicing: [15, 19, 22, 26], tones: [3, 7, 10, 14] };
const D9: Chord   = { name: 'D9',    root: 5,  voicing: [17, 21, 15, 19], tones: [5, 9, 0, 3, 7] };
const G6: Chord   = { name: 'G6',    root: -2, voicing: [10, 14, 17, 19], tones: [10, 2, 5, 7] };

/** Bars 0..7 of the phrase. Bar 7 is the turnaround. */
const PHRASE: Chord[] = [Am7, Am7, Cmaj7, D9, Am7, Am7, Cmaj7, G6];

const STEPS_PER_BAR = 16;   // 16th notes
const BARS = PHRASE.length;
const TOTAL_STEPS = STEPS_PER_BAR * BARS;

/** Fraction of a 16th that the off-16ths are pushed late. 0.5 => straight. */
const SWING = 0.56;

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v: number) => clamp(v, 0, 1);

/** mulberry32 — small, fast, and reproducible from a seed. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Director input
// ---------------------------------------------------------------------------

/** Everything the audio director needs to know, sampled once per frame. */
export interface AudioGameState {
  /** Player speed, m/s. */
  speed: number;
  /** Grounded and rolling (not grinding, not airborne). */
  rolling: boolean;
  /** 0 = carpet, 1 = hard floor. */
  hardness: number;
  /** Currently locked onto a rail. */
  grinding: boolean;
  /** Grind/manual balance, 0..1 with 0.5 centred. */
  balance: number;
  /** Is a combo line open. */
  comboOpen: boolean;
  /** Current combo multiplier. */
  multiplier: number;
  /** PoliceSquad.heatLevel, 0..1. */
  heat: number;
}

/** Legacy names kept so older call sites keep compiling. */
export type SoundName =
  | 'push' | 'jump' | 'land' | 'grind' | 'grindLoop' | 'grindEnd'
  | 'trick' | 'combo' | 'special' | 'bail' | 'menuSelect' | 'menuBack' | 'pause';

// ---------------------------------------------------------------------------

export class SoundManager {
  private started = false;

  // ---- music transport ------------------------------------------------------
  private playing = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;                 // 0 .. TOTAL_STEPS-1
  private nextStepTime = 0;         // AudioContext time of the next 16th
  private bpm = 102;
  private targetBpm = 102;
  private rng = makeRng(0x5f3a91);
  private phraseSeed = 1;

  /** Decorations re-rolled once per phrase; see the class docstring. */
  private decor = {
    ghostSnare: false,
    hats16: false,
    bassCell: 0,
    leadThisPhrase: true,
    leadOctave: 0,
  };

  private readonly LOOKAHEAD = 0.12;   // seconds of notes scheduled in advance
  private readonly TICK_MS = 25;

  // ---- music mixer ----------------------------------------------------------
  private drumGain: GainNode | null = null;
  private bassGain: GainNode | null = null;
  private keysGain: GainNode | null = null;
  private leadGain: GainNode | null = null;
  private tensionGain: GainNode | null = null;
  private leadDelay: DelayNode | null = null;

  // ---- director state -------------------------------------------------------
  /** Smoothed 0..1 "how much is going on", drives which layers are up. */
  private intensity = 0;
  /** Layer levels are only committed at a bar line; these are the pending ones. */
  private pendingLevels = { keys: 0, lead: 0, tension: 0, bass: 1 };

  private prevComboOpen = false;
  /** True once a chase got properly hot; gates the one "lost them" cadence. */
  private chaseArmed = false;

  // =========================================================================
  // Lifecycle
  // =========================================================================

  /**
   * Build the music mixer on top of the SFX engine's buses. Safe to call more
   * than once and safe to call before any user gesture — the scheduler refuses
   * to run until the context is actually running.
   */
  init(): void {
    if (this.started) return;
    proceduralSounds.init();
    const buses = proceduralSounds.buses;
    if (!buses) return;
    const { ctx, music, reverbSend } = buses;

    this.drumGain = ctx.createGain();
    this.drumGain.gain.value = 0.78;
    this.drumGain.connect(music);

    this.bassGain = ctx.createGain();
    this.bassGain.gain.value = 0.9;
    this.bassGain.connect(music);

    this.keysGain = ctx.createGain();
    this.keysGain.gain.value = 0;
    this.keysGain.connect(music);
    const keysVerb = ctx.createGain();
    keysVerb.gain.value = 0.22;
    this.keysGain.connect(keysVerb);
    keysVerb.connect(reverbSend);

    this.leadGain = ctx.createGain();
    this.leadGain.gain.value = 0;
    this.leadGain.connect(music);

    // Dotted-8th delay on the lead. At 102 BPM a dotted 8th is 0.441 s. Feedback
    // is low enough that the echoes fall inside the next bar instead of smearing
    // the harmony, which is what makes a delay feel like part of the groove.
    this.leadDelay = ctx.createDelay(1.5);
    this.leadDelay.delayTime.value = (60 / this.bpm) * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.34;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2400;      // each repeat is darker: depth without mud
    const wet = ctx.createGain();
    wet.gain.value = 0.34;
    this.leadGain.connect(this.leadDelay);
    this.leadDelay.connect(damp);
    damp.connect(fb);
    fb.connect(this.leadDelay);
    damp.connect(wet);
    wet.connect(music);
    const leadVerb = ctx.createGain();
    leadVerb.gain.value = 0.18;
    this.leadGain.connect(leadVerb);
    leadVerb.connect(reverbSend);

    this.tensionGain = ctx.createGain();
    this.tensionGain.gain.value = 0;
    this.tensionGain.connect(music);
    const tenVerb = ctx.createGain();
    tenVerb.gain.value = 0.25;
    this.tensionGain.connect(tenVerb);
    tenVerb.connect(reverbSend);

    this.started = true;
  }

  /** Start the score. No-op until the AudioContext has been unlocked. */
  startMusic(): void {
    if (!this.started) this.init();
    if (this.playing) return;
    const buses = proceduralSounds.buses;
    if (!buses) return;

    this.playing = true;
    this.step = 0;
    this.nextStepTime = buses.ctx.currentTime + 0.08;
    this.rollPhrase(0);

    if (this.timer === null) {
      this.timer = setInterval(() => this.scheduleAhead(), this.TICK_MS);
    }
  }

  stopMusic(): void {
    this.playing = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  get musicPlaying(): boolean { return this.playing; }

  /** Silence everything and release the continuous SFX beds. */
  shutdown(): void {
    this.stopMusic();
    proceduralSounds.stopAllLoops();
  }

  // =========================================================================
  // Mixer passthrough
  // =========================================================================

  setMasterVolume(v: number): void { proceduralSounds.setMasterVolume(v); }
  setMusicVolume(v: number): void { proceduralSounds.setMusicVolume(v); }
  setSfxVolume(v: number): void { proceduralSounds.setSfxVolume(v); }
  getMasterVolume(): number { return proceduralSounds.getMasterVolume(); }
  getMusicVolume(): number { return proceduralSounds.getMusicVolume(); }
  getSfxVolume(): number { return proceduralSounds.getSfxVolume(); }
  setMuted(m: boolean): void { proceduralSounds.setMuted(m); }
  isMuted(): boolean { return proceduralSounds.isMuted(); }

  pauseAll(): void { proceduralSounds.setMuted(true); }
  resumeAll(): void { proceduralSounds.setMuted(false); }

  /** Legacy one-shot dispatch, mapped onto the procedural voices. */
  play(name: SoundName): void {
    switch (name) {
      case 'push': proceduralSounds.playPush(); break;
      case 'jump': proceduralSounds.playOllie(0.5); break;
      case 'land': proceduralSounds.playLand(0.4); break;
      case 'grind': proceduralSounds.playGrindStart(); break;
      case 'grindLoop': proceduralSounds.startGrindLoop(); break;
      case 'grindEnd': proceduralSounds.stopGrindLoop(); break;
      case 'trick': proceduralSounds.playTrick(500); break;
      case 'combo': proceduralSounds.playComboLanded(2); break;
      case 'special': proceduralSounds.playSpecialReady(); break;
      case 'bail': proceduralSounds.playBail(); break;
      case 'menuSelect': proceduralSounds.playMenuSelect(); break;
      case 'menuBack': proceduralSounds.playMenuBack(); break;
      case 'pause': proceduralSounds.playMenuBack(); break;
    }
  }

  // Convenience wrappers so callers only need one import.
  smash(material: SmashMaterial, impulse: number): void { proceduralSounds.playSmash(material, impulse); }
  policeSpotted(): void { proceduralSounds.playPoliceWhistle(); }
  policeLost(): void { proceduralSounds.playPoliceLost(); }

  // =========================================================================
  // THE DIRECTOR
  // =========================================================================

  /**
   * Sample the game once per frame. This drives the continuous SFX beds that
   * need per-frame parameters and decides the musical arrangement.
   *
   * @param dt frame time in seconds
   */
  update(dt: number, s: AudioGameState): void {
    // ---- continuous SFX beds ---------------------------------------------
    proceduralSounds.updateWheelRoll(s.speed, s.rolling, s.hardness);
    if (s.grinding) proceduralSounds.updateGrind(s.speed, s.balance);
    proceduralSounds.setComboState(s.comboOpen, s.multiplier);
    proceduralSounds.updatePolice(s.heat);

    // ---- edge events the director owns ------------------------------------
    // Latched, not level-triggered. Heat rattles across any fixed threshold as a
    // pursuit peters out; the probe caught the "lost them" cadence firing seven
    // times in 26 s. The latch only arms once the chase was genuinely on (0.5)
    // and only fires once it is genuinely over (0.06).
    if (s.heat > 0.5) this.chaseArmed = true;
    if (this.chaseArmed && s.heat < 0.06) {
      this.chaseArmed = false;
      proceduralSounds.playPoliceLost();
    }
    this.prevComboOpen = s.comboOpen;

    // ---- musical intensity -------------------------------------------------
    // Three independent drivers, taken at their max so any one can carry the
    // arrangement: how big the current line is, how hot the chase is, how fast
    // the player is going.
    //
    // The combo term used to be 0.35 + (m-1)/8, which saturates at x9. Measured
    // play reaches x25, so across a whole benchmark run the intensity sat at
    // 1.000 and keys, lead and tension were all up for 92% of the samples — the
    // "reactive" score was a static one. Logarithmic over a x28 range means the
    // arrangement is still opening up on the twentieth trick of a line.
    const comboDrive = s.comboOpen
      ? clamp01(0.30 + 0.62 * Math.log(Math.max(1, s.multiplier)) / Math.log(28))
      : 0;
    const speedDrive = clamp01((s.speed - 4) / 12) * 0.35;
    const target = clamp01(Math.max(comboDrive, s.heat, speedDrive));

    // Rise fast (the music should react), fall slow (no flapping between layers).
    const tau = target > this.intensity ? 0.5 : 2.5;
    this.intensity += (target - this.intensity) * (1 - Math.exp(-dt / tau));

    // Chase pushes the tempo. 102 -> 112 BPM is enough to feel without the
    // groove changing character.
    this.targetBpm = 102 + 10 * clamp01(s.heat);

    // Layer levels are staged here and committed at the next bar line, so a
    // part never enters in the middle of a beat.
    const i = this.intensity;
    this.pendingLevels.bass = 1;
    this.pendingLevels.keys = i > 0.30 ? clamp01((i - 0.30) / 0.28) * 0.9 : 0;
    this.pendingLevels.lead = i > 0.62 ? clamp01((i - 0.62) / 0.26) * 0.8 : 0;
    // Tension is the chase layer, but a monster line earns it too: a x20 combo
    // is its own kind of danger and the ride pattern is what makes the top of a
    // line feel like it is running out of road.
    const heatTension = s.heat > 0.4 ? clamp01((s.heat - 0.4) / 0.4) * 0.85 : 0;
    const comboTension = i > 0.86 ? clamp01((i - 0.86) / 0.12) * 0.55 : 0;
    this.pendingLevels.tension = Math.max(heatTension, comboTension);
  }

  /** Was a combo open on the previous director frame. */
  get lastComboOpen(): boolean { return this.prevComboOpen; }

  // =========================================================================
  // Scheduler
  // =========================================================================

  private scheduleAhead(): void {
    const buses = proceduralSounds.buses;
    if (!buses || !this.playing) return;
    const ctx = buses.ctx;
    // Nothing may be scheduled while the context is suspended: currentTime is
    // frozen, so the while-loop below would never terminate.
    if (ctx.state !== 'running') return;

    // If the tab was backgrounded the clock ran on without us. Resync rather
    // than trying to catch up by playing a hundred notes at once.
    if (this.nextStepTime < ctx.currentTime - 0.25) {
      this.nextStepTime = ctx.currentTime + 0.02;
    }

    let guard = 0;
    while (this.nextStepTime < ctx.currentTime + this.LOOKAHEAD && guard++ < 64) {
      const barStep = this.step % STEPS_PER_BAR;

      if (barStep === 0) this.onBarLine(ctx, this.step / STEPS_PER_BAR);

      // Swing: push the odd 16ths late. Only the off-16ths move; the 8th-note
      // grid stays put, which is what a shuffle actually is.
      const sec16 = (60 / this.bpm) / 4;
      const swingOffset = (this.step % 2 === 1) ? (SWING - 0.5) * 2 * sec16 * 0.5 : 0;
      this.scheduleStep(ctx, this.step, this.nextStepTime + swingOffset);

      this.nextStepTime += sec16;
      this.step = (this.step + 1) % TOTAL_STEPS;
    }
  }

  /** Commit staged layer levels and re-roll the decorations at phrase starts. */
  private onBarLine(ctx: AudioContext, bar: number): void {
    const t = ctx.currentTime;
    // 120 ms crossfade: long enough not to click, short enough to feel deliberate.
    this.keysGain?.gain.setTargetAtTime(this.pendingLevels.keys, t, 0.12);
    this.leadGain?.gain.setTargetAtTime(this.pendingLevels.lead, t, 0.12);
    this.tensionGain?.gain.setTargetAtTime(this.pendingLevels.tension, t, 0.15);
    this.bassGain?.gain.setTargetAtTime(this.pendingLevels.bass, t, 0.12);

    // Tempo only moves at a bar line, so the delay time and the grid stay sane.
    this.bpm += (this.targetBpm - this.bpm) * 0.5;
    if (this.leadDelay) {
      this.leadDelay.delayTime.setTargetAtTime((60 / this.bpm) * 0.75, t, 0.3);
    }

    if (bar === 0) this.rollPhrase(++this.phraseSeed);
  }

  /**
   * Re-roll the decorations for the next eight bars. The skeleton (kick on 1
   * and the "and" of 3, backbeat snare, root bass on the downbeat) is never
   * touched — only the ornaments change, which is exactly how a band keeps a
   * vamp alive without losing it.
   */
  private rollPhrase(seed: number): void {
    this.rng = makeRng(0x5f3a91 ^ (seed * 2654435761));
    const r = this.rng;
    this.decor.ghostSnare = r() < 0.65;
    this.decor.hats16 = r() < 0.55;
    this.decor.bassCell = Math.floor(r() * 3);
    // The lead rests roughly one phrase in three. Silence is what stops a motif
    // becoming a nag over ten minutes.
    this.decor.leadThisPhrase = r() < 0.68;
    this.decor.leadOctave = r() < 0.3 ? 12 : 0;
  }

  // =========================================================================
  // Pattern
  // =========================================================================

  private scheduleStep(ctx: AudioContext, step: number, t: number): void {
    const bar = Math.floor(step / STEPS_PER_BAR);
    const s = step % STEPS_PER_BAR;
    const chord = PHRASE[bar];
    const lastBar = bar === BARS - 1;
    const r = this.rng;

    // ---------------- drums ------------------------------------------------
    // Skeleton kick: 1 and the "and" of 3. Everything else is decoration.
    let kick = s === 0 || s === 10;
    if (bar % 2 === 0 && s === 6) kick = true;
    if (lastBar && s === 14) kick = true;
    if (kick) this.kick(ctx, t, s === 0 ? 1 : 0.82);

    // Backbeat.
    if (s === 4 || s === 12) this.snare(ctx, t, 1);
    else if (this.decor.ghostSnare && (s === 7 || s === 15) && r() < 0.5) {
      this.snare(ctx, t, 0.22);   // ghost: felt, not heard
    }

    // Hats. 8ths always; 16ths when the decoration is up. Accent on the beat.
    if (s % 4 === 0) this.hat(ctx, t, 0.5, false);
    else if (s % 2 === 0) this.hat(ctx, t, 0.3, false);
    else if (this.decor.hats16) this.hat(ctx, t, 0.16, false);
    if (s === 14 && bar % 2 === 1) this.hat(ctx, t, 0.32, true);   // open hat lift

    // End-of-phrase fill.
    if (lastBar && s >= 12) {
      this.tom(ctx, t, 150 + (s - 12) * 34, 0.45);
    }

    // ---------------- bass -------------------------------------------------
    this.scheduleBass(ctx, t, s, chord, bar);

    // ---------------- keys -------------------------------------------------
    // Off-beat comping on the "and" of 2 and the "and" of 4: the classic funk
    // placement. Landing chords on the beat would fight the kick.
    if (this.pendingLevels.keys > 0.01) {
      if (s === 6 || s === 14) this.keyStab(ctx, t, chord, s === 6 ? 0.85 : 0.6);
      else if (s === 3 && r() < 0.25) this.keyStab(ctx, t, chord, 0.35);
    }

    // ---------------- lead -------------------------------------------------
    if (this.pendingLevels.lead > 0.01 && this.decor.leadThisPhrase) {
      this.scheduleLead(ctx, t, s, bar, chord);
    }

    // ---------------- tension ---------------------------------------------
    if (this.pendingLevels.tension > 0.01) {
      if (s % 2 === 0) this.ride(ctx, t, s % 4 === 0 ? 0.34 : 0.2);
      if (s === 0 && bar % 4 === 2) this.tensionPad(ctx, t, chord);
    }
  }

  /**
   * Bass. Root on the downbeat every bar (the anchor), then one of three
   * syncopated cells for the rest. Passing notes are drawn from the dorian
   * scale so a wrong note is not reachable.
   */
  private scheduleBass(ctx: AudioContext, t: number, s: number, chord: Chord, bar: number): void {
    const root = chord.root - 12;    // an octave below the tonic register
    const beat = 60 / this.bpm;

    if (s === 0) { this.bassNote(ctx, t, hz(root), beat * 0.55, 1); return; }

    switch (this.decor.bassCell) {
      case 0: // straight-ish: root, octave push, fifth
        if (s === 6) this.bassNote(ctx, t, hz(root + 12), beat * 0.22, 0.7);
        else if (s === 10) this.bassNote(ctx, t, hz(root), beat * 0.4, 0.85);
        else if (s === 14) this.bassNote(ctx, t, hz(root + 7), beat * 0.22, 0.6);
        break;
      case 1: // busier: 16th pickup into 3
        if (s === 3) this.bassNote(ctx, t, hz(root + 7), beat * 0.18, 0.5);
        else if (s === 6) this.bassNote(ctx, t, hz(root), beat * 0.22, 0.72);
        else if (s === 9) this.bassNote(ctx, t, hz(root + 10), beat * 0.2, 0.55);
        else if (s === 10) this.bassNote(ctx, t, hz(root + 12), beat * 0.35, 0.8);
        break;
      default: // sparse and heavy
        if (s === 8) this.bassNote(ctx, t, hz(root), beat * 0.5, 0.9);
        else if (s === 14) this.bassNote(ctx, t, hz(root + 5), beat * 0.25, 0.6);
        break;
    }

    // Walk into the next bar on the last 16th of odd bars.
    if (s === 15 && bar % 2 === 1) {
      const next = PHRASE[(bar + 1) % BARS].root - 12;
      const approach = next - 1;     // chromatic-from-below, the oldest trick there is
      this.bassNote(ctx, t, hz(approach), beat * 0.2, 0.55);
    }
  }

  /**
   * The lead motif: a four-note cell placed on chord tones, played over the
   * first half of each four-bar group and then answered an octave apart. It is
   * intentionally short and leaves two bars of air.
   */
  private scheduleLead(ctx: AudioContext, t: number, s: number, bar: number, chord: Chord): void {
    const half = bar % 4;
    if (half > 1) return;                        // two bars of motif, two of rest
    const beat = 60 / this.bpm;
    const oct = 12 + this.decor.leadOctave;

    // Cell rhythm: an anticipation on the "e" of 1, the beat 2 answer, and a
    // held note on 3. Same shape both bars, different chord tones underneath.
    const cell: Array<[number, number, number]> = half === 0
      ? [[2, 0, 0.55], [6, 1, 0.5], [10, 2, 0.9]]
      : [[0, 2, 0.5], [4, 1, 0.5], [7, 0, 0.7], [12, 3, 1.0]];

    for (const [at, toneIdx, len] of cell) {
      if (at !== s) continue;
      const tone = chord.tones[toneIdx % chord.tones.length];
      this.leadNote(ctx, t, hz(tone + oct), beat * len);
      // A quiet diatonic neighbour a third above thickens the line without
      // needing a second melodic decision.
      if (len > 0.6) {
        const third = DORIAN[(DORIAN.indexOf(((tone % 12) + 12) % 12) + 2) % DORIAN.length];
        this.leadNote(ctx, t + 0.012, hz(third + oct + 12), beat * len * 0.7, 0.4);
      }
    }
  }

  // =========================================================================
  // Instruments
  // =========================================================================

  /**
   * KICK — sine with a fast downward pitch env (110 -> 45 Hz in 55 ms) plus a
   * 3 ms noise click. The pitch env is the whole sound: without it a sine is a
   * hum, with it the ear hears a beater hitting a head.
   */
  private kick(ctx: AudioContext, t: number, vel: number): void {
    const dst = this.drumGain;
    if (!dst) return;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.055);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(dst);
    o.start(t); o.stop(t + 0.34);

    const c = ctx.createOscillator();
    c.type = 'square';
    c.frequency.value = 620;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t);
    cg.gain.exponentialRampToValueAtTime(0.05 * vel, t + 0.001);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.014);
    c.connect(cg); cg.connect(dst);
    c.start(t); c.stop(t + 0.02);
  }

  /**
   * SNARE — two detuned triangles (the drum's two lowest modes, 185/238 Hz)
   * plus bandpassed noise (the wires). The wires decay slower than the shell,
   * which is why a snare has a "tssh" tail rather than a click.
   */
  private snare(ctx: AudioContext, t: number, vel: number): void {
    const dst = this.drumGain;
    if (!dst) return;
    for (const f of [185, 238]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16 * vel, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g); g.connect(dst);
      o.start(t); o.stop(t + 0.12);
    }
    const n = this.noise(ctx, 0.2);
    if (n) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1900;
      bp.Q.value = 0.8;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 700;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3 * vel, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11 + 0.06 * vel);
      n.connect(hp); hp.connect(bp); bp.connect(g); g.connect(dst);
      n.start(t); n.stop(t + 0.25);
    }
  }

  /** HAT — highpassed noise. Closed is 35 ms, open is 220 ms. */
  private hat(ctx: AudioContext, t: number, vel: number, open: boolean): void {
    const dst = this.drumGain;
    if (!dst) return;
    const n = this.noise(ctx, open ? 0.35 : 0.08);
    if (!n) return;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7200;
    const pk = ctx.createBiquadFilter();
    pk.type = 'peaking';
    pk.frequency.value = 10500;
    pk.Q.value = 1.2;
    pk.gain.value = 6;
    const g = ctx.createGain();
    const dur = open ? 0.22 : 0.035;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13 * vel, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(hp); hp.connect(pk); pk.connect(g); g.connect(dst);
    n.start(t); n.stop(t + dur + 0.05);
  }

  /** TOM — a sine with a slower pitch drop than the kick, plus a little noise. */
  private tom(ctx: AudioContext, t: number, f: number, vel: number): void {
    const dst = this.tensionGain ?? this.drumGain;
    if (!dst) return;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.62, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3 * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(dst);
    o.start(t); o.stop(t + 0.26);
  }

  /** RIDE — three inharmonic partials, short. A cymbal is not a pitch. */
  private ride(ctx: AudioContext, t: number, vel: number): void {
    const dst = this.tensionGain;
    if (!dst) return;
    const base = 780;
    for (const [ratio, gv] of [[1, 0.5], [1.83, 0.3], [3.11, 0.18]] as const) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = base * ratio;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 4000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.035 * vel * gv, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(hp); hp.connect(g); g.connect(dst);
      o.start(t); o.stop(t + 0.2);
    }
  }

  /**
   * BASS — sawtooth + a sine sub an octave down, through a lowpass with its own
   * envelope (180 -> 900 -> 260 Hz). The filter envelope is what makes a synth
   * bass "pluck" instead of "drone", and the sub is what makes it audible on
   * laptop speakers where the fundamental is gone.
   */
  private bassNote(ctx: AudioContext, t: number, f: number, dur: number, vel: number): void {
    const dst = this.bassGain;
    if (!dst) return;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.exponentialRampToValueAtTime(300 + 900 * vel, t + 0.03);
    lp.frequency.exponentialRampToValueAtTime(260, t + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3 * vel, t + 0.008);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.8, 0.05);
    lp.connect(g); g.connect(dst);

    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = f;
    saw.connect(lp);
    saw.start(t); saw.stop(t + dur + 0.2);

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = f * 0.5;
    const sg = ctx.createGain();
    sg.gain.value = 0.55;
    sub.connect(sg); sg.connect(lp);
    sub.start(t); sub.stop(t + dur + 0.2);
  }

  /**
   * KEYS — a four-note voicing on detuned triangles through a lowpass with a
   * short decay. Detuning the pairs by a few cents gives the chorus-y width
   * that stops a stack of oscillators sounding like an organ test tone.
   */
  private keyStab(ctx: AudioContext, t: number, chord: Chord, vel: number): void {
    const dst = this.keysGain;
    if (!dst) return;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(700 + 1800 * vel, t);
    lp.frequency.exponentialRampToValueAtTime(600, t + 0.35);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1 * vel, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    lp.connect(g); g.connect(dst);

    for (let i = 0; i < chord.voicing.length; i++) {
      const f = hz(chord.voicing[i]);
      for (const detune of [-5, 5]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        o.detune.value = detune;
        const vg = ctx.createGain();
        vg.gain.value = 0.4 / chord.voicing.length;
        o.connect(vg); vg.connect(lp);
        o.start(t); o.stop(t + 0.4);
      }
    }
  }

  /**
   * LEAD — a square through a resonant lowpass with a gentle attack and a small
   * vibrato that only arrives after 120 ms, the way a player would add it. The
   * delayed vibrato is a small detail that does most of the work in making a
   * synth line sound performed rather than sequenced.
   */
  private leadNote(ctx: AudioContext, t: number, f: number, dur: number, vel = 1): void {
    const dst = this.leadGain;
    if (!dst) return;

    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;

    const vib = ctx.createOscillator();
    vib.type = 'sine';
    vib.frequency.value = 5.2;
    const vibDepth = ctx.createGain();
    vibDepth.gain.setValueAtTime(0, t);
    vibDepth.gain.setValueAtTime(0, t + 0.12);
    vibDepth.gain.linearRampToValueAtTime(f * 0.008, t + Math.max(0.16, dur * 0.6));
    vib.connect(vibDepth);
    vibDepth.connect(o.frequency);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 5;
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(3200, t + 0.05);
    lp.frequency.exponentialRampToValueAtTime(1100, t + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13 * vel, t + 0.018);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.75, 0.06);

    o.connect(lp); lp.connect(g); g.connect(dst);
    o.start(t); o.stop(t + dur + 0.3);
    vib.start(t); vib.stop(t + dur + 0.3);
  }

  /**
   * TENSION PAD — the chord's root and flat-fifth-ish colour tone held under
   * the band during a chase, filtered down so it is felt as pressure rather
   * than heard as a part.
   */
  private tensionPad(ctx: AudioContext, t: number, chord: Chord): void {
    const dst = this.tensionGain;
    if (!dst) return;
    const dur = (60 / this.bpm) * 4 * 2;   // two bars
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3;
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.linearRampToValueAtTime(1100, t + dur * 0.7);
    lp.frequency.linearRampToValueAtTime(400, t + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.4);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.7, 0.5);
    lp.connect(g); g.connect(dst);

    for (const st of [chord.root - 12, chord.root - 12 + 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(st);
      o.detune.value = st === chord.root - 12 ? -4 : 6;
      const vg = ctx.createGain();
      vg.gain.value = 0.4;
      o.connect(vg); vg.connect(lp);
      o.start(t); o.stop(t + dur + 0.6);
    }
  }

  /** Short white-noise source. Cheap enough to build per hit at these rates. */
  private noise(ctx: AudioContext, seconds: number): AudioBufferSourceNode | null {
    const n = Math.max(64, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }
}

// Singleton instance
export const soundManager = new SoundManager();

// Debug handle for tools/audio.mjs; see the note in ProceduralSounds.ts.
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).soundManager = soundManager;
}
