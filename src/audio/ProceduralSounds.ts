/**
 * Procedural Sounds
 * Generates simple sound effects using Web Audio API
 * No external files needed - great for prototyping
 */

export class ProceduralSounds {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isInitialized = false;
  
  // Wheel roll sound system
  private wheelRollNoise: AudioBufferSourceNode | null = null;
  private wheelRollGain: GainNode | null = null;
  private wheelRollFilter: BiquadFilterNode | null = null;
  private wheelRollActive = false;
  
  /**
   * Initialize audio context (must be called after user interaction)
   */
  init(): void {
    if (this.isInitialized) return;
    
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 0.5;
      this.masterGain.connect(this.audioContext.destination);
      this.isInitialized = true;
      console.log('Procedural audio initialized');
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
    }
  }
  
  /**
   * Resume audio context if suspended (browser autoplay policy)
   */
  async resume(): Promise<void> {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }
  
  /**
   * Set master volume (0-1)
   */
  setVolume(volume: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }
  
  /**
   * Play push/kick sound - short thump
   */
  playPush(): void {
    if (!this.audioContext || !this.masterGain) return;
    
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, this.audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.audioContext.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.4, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.audioContext.currentTime + 0.15);
  }
  
  /**
   * Play jump sound - rising whoosh
   */
  playJump(): void {
    if (!this.audioContext || !this.masterGain) return;
    
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const filter = this.audioContext.createBiquadFilter();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, this.audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, this.audioContext.currentTime + 0.15);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, this.audioContext.currentTime);
    
    gain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.audioContext.currentTime + 0.2);
  }
  
  /**
   * Play land sound - impact thud
   */
  playLand(): void {
    if (!this.audioContext || !this.masterGain) return;
    
    // White noise burst for impact
    const bufferSize = this.audioContext.sampleRate * 0.1;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    
    const noise = this.audioContext.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    
    const gain = this.audioContext.createGain();
    gain.gain.value = 0.3;
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    
    noise.start();
  }
  
  /**
   * Play grind start sound - metal scrape
   */
  playGrindStart(): void {
    if (!this.audioContext || !this.masterGain) return;
    
    // White noise with resonant filter for metallic scrape
    const bufferSize = this.audioContext.sampleRate * 0.2;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.audioContext.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3000;
    filter.Q.value = 5;
    
    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(0.15, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    
    noise.start();
  }
  
  private grindOscillator: OscillatorNode | null = null;
  private grindGain: GainNode | null = null;
  
  /**
   * Start continuous grind loop
   */
  startGrindLoop(): void {
    if (!this.audioContext || !this.masterGain || this.grindOscillator) return;
    
    // Create grinding noise
    const bufferSize = this.audioContext.sampleRate * 2;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      // Scratchy noise
      data[i] = (Math.random() * 2 - 1) * (0.3 + Math.sin(i * 0.01) * 0.2);
    }
    
    const noise = this.audioContext.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2500;
    filter.Q.value = 3;
    
    this.grindGain = this.audioContext.createGain();
    this.grindGain.gain.value = 0.08;
    
    noise.connect(filter);
    filter.connect(this.grindGain);
    this.grindGain.connect(this.masterGain);
    
    noise.start();
    this.grindOscillator = noise as unknown as OscillatorNode;
  }
  
  /**
   * Stop grind loop
   */
  stopGrindLoop(): void {
    if (this.grindOscillator) {
      (this.grindOscillator as unknown as AudioBufferSourceNode).stop();
      this.grindOscillator = null;
      this.grindGain = null;
    }
  }
  
  /**
   * Play trick success sound - bright ding
   * Pitch varies based on trick points: higher value tricks = higher pitch
   * @param points - Base points of the trick (typically 100-2000+)
   */
  playTrick(points: number = 500): void {
    if (!this.audioContext || !this.masterGain) return;
    
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    
    // Calculate pitch multiplier based on points
    // Low tricks (~100 pts): 0.8x pitch
    // Medium tricks (~500 pts): 1.0x pitch  
    // High tricks (~1000+ pts): 1.3x+ pitch
    // Special tricks (~2000+ pts): 1.6x+ pitch
    const normalizedPoints = Math.max(100, Math.min(2500, points));
    const pitchMultiplier = 0.7 + (normalizedPoints / 2500) * 0.9; // 0.7 to 1.6 range
    
    const baseFreq = 880 * pitchMultiplier;
    const peakFreq = 1100 * pitchMultiplier;
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, this.audioContext.currentTime);
    osc.frequency.setValueAtTime(peakFreq, this.audioContext.currentTime + 0.05);
    
    // Slightly louder for bigger tricks
    const volumeBoost = 0.15 + (pitchMultiplier - 0.7) * 0.1; // 0.15 to 0.24
    gain.gain.setValueAtTime(volumeBoost, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.audioContext.currentTime + 0.3);
  }
  
  /**
   * Play combo landed sound - ascending arpeggio
   */
  playComboLanded(multiplier: number): void {
    if (!this.audioContext || !this.masterGain) return;
    
    const baseFreq = 440;
    const notes = [0, 4, 7, 12]; // Major chord
    const noteCount = Math.min(multiplier, 4);
    
    for (let i = 0; i < noteCount; i++) {
      setTimeout(() => {
        if (!this.audioContext || !this.masterGain) return;
        
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.type = 'triangle';
        const freq = baseFreq * Math.pow(2, notes[i] / 12);
        osc.frequency.value = freq;
        
        gain.gain.setValueAtTime(0.15, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start();
        osc.stop(this.audioContext.currentTime + 0.2);
      }, i * 50);
    }
  }
  
  /**
   * Play bail/crash sound - discordant noise
   */
  playBail(): void {
    if (!this.audioContext || !this.masterGain) return;
    
    // Impact
    const bufferSize = this.audioContext.sampleRate * 0.3;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
    }
    
    const noise = this.audioContext.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    
    const gain = this.audioContext.createGain();
    gain.gain.value = 0.4;
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    
    noise.start();
    
    // Dissonant tone
    const osc = this.audioContext.createOscillator();
    const oscGain = this.audioContext.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, this.audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, this.audioContext.currentTime + 0.3);
    
    oscGain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
    
    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.audioContext.currentTime + 0.3);
  }
  
  /**
   * Play special meter full sound - triumphant chord
   */
  playSpecialReady(): void {
    if (!this.audioContext || !this.masterGain) return;
    
    const freqs = [523.25, 659.25, 783.99, 1046.50]; // C major chord
    
    freqs.forEach((freq, i) => {
      setTimeout(() => {
        if (!this.audioContext || !this.masterGain) return;
        
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.type = 'triangle';
        osc.frequency.value = freq;
        
        gain.gain.setValueAtTime(0.1, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start();
        osc.stop(this.audioContext.currentTime + 0.5);
      }, i * 30);
    });
  }
  
  /**
   * Play menu select sound
   */
  playMenuSelect(): void {
    if (!this.audioContext || !this.masterGain) return;
    
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(440, this.audioContext.currentTime);
    osc.frequency.setValueAtTime(550, this.audioContext.currentTime + 0.05);
    
    gain.gain.setValueAtTime(0.1, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.audioContext.currentTime + 0.1);
  }
  
  /**
   * Start continuous wheel roll sound
   * Creates a rumbling noise that varies with speed
   */
  startWheelRoll(): void {
    if (!this.audioContext || !this.masterGain || this.wheelRollActive) return;
    
    // Create a long looping noise buffer for rolling sound
    const bufferSize = this.audioContext.sampleRate * 2; // 2 second loop
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Generate rumbling noise with some periodic variation (simulates wheel rotation)
    for (let i = 0; i < bufferSize; i++) {
      // Base random noise
      const noise = Math.random() * 2 - 1;
      // Add subtle periodic component for wheel rotation feel
      const periodic = Math.sin(i * 0.02) * 0.3;
      // Combine with envelope variation for texture
      const texture = 0.7 + Math.sin(i * 0.001) * 0.3;
      data[i] = noise * texture * 0.5 + periodic * 0.2;
    }
    
    this.wheelRollNoise = this.audioContext.createBufferSource();
    this.wheelRollNoise.buffer = buffer;
    this.wheelRollNoise.loop = true;
    
    // Low-pass filter - frequency will be modulated by speed
    this.wheelRollFilter = this.audioContext.createBiquadFilter();
    this.wheelRollFilter.type = 'lowpass';
    this.wheelRollFilter.frequency.value = 200; // Start low
    this.wheelRollFilter.Q.value = 1;
    
    // Gain control - will be modulated by speed
    this.wheelRollGain = this.audioContext.createGain();
    this.wheelRollGain.gain.value = 0; // Start silent
    
    // Connect the chain
    this.wheelRollNoise.connect(this.wheelRollFilter);
    this.wheelRollFilter.connect(this.wheelRollGain);
    this.wheelRollGain.connect(this.masterGain);
    
    this.wheelRollNoise.start();
    this.wheelRollActive = true;
  }
  
  /**
   * Update wheel roll sound based on current speed
   * @param speed - Current player speed (0-18 typical range)
   * @param isGrounded - Whether player is on the ground
   */
  updateWheelRoll(speed: number, isGrounded: boolean): void {
    if (!this.wheelRollGain || !this.wheelRollFilter || !this.audioContext) return;
    
    // Only play when grounded and moving
    if (!isGrounded || speed < 0.5) {
      // Fade out quickly
      this.wheelRollGain.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
      return;
    }
    
    // Normalize speed (0-18 range to 0-1)
    const normalizedSpeed = Math.min(1, speed / 18);
    
    // Volume increases with speed (0.02 to 0.12 range - subtle but present)
    const targetVolume = 0.02 + normalizedSpeed * 0.10;
    this.wheelRollGain.gain.linearRampToValueAtTime(targetVolume, this.audioContext.currentTime + 0.05);
    
    // Filter frequency increases with speed (200Hz to 800Hz)
    // Higher speed = more high frequencies = brighter, more energetic sound
    const targetFreq = 200 + normalizedSpeed * 600;
    this.wheelRollFilter.frequency.linearRampToValueAtTime(targetFreq, this.audioContext.currentTime + 0.05);
  }
  
  /**
   * Stop wheel roll sound
   */
  stopWheelRoll(): void {
    if (this.wheelRollNoise) {
      this.wheelRollNoise.stop();
      this.wheelRollNoise = null;
      this.wheelRollGain = null;
      this.wheelRollFilter = null;
      this.wheelRollActive = false;
    }
  }
}

// Singleton
export const proceduralSounds = new ProceduralSounds();
