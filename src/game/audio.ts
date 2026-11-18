class StudioAudioEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType = 'triangle',
    gainPeak = 0.08,
    delay = 0,
    slideToFreq?: number
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideToFreq) {
      osc.frequency.exponentialRampToValueAtTime(slideToFreq, now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playStep(): void {
    this.tone(130, 0.055, 'triangle', 0.035, 0, 95);
  }

  public playBump(): void {
    this.tone(92, 0.09, 'sawtooth', 0.045, 0, 62);
  }

  public playPickup(combo: number): void {
    const pentatonic = [329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];
    const base = pentatonic[Math.min(combo, pentatonic.length - 1)];
    this.tone(base, 0.14, 'triangle', 0.09, 0);
    this.tone(base * 1.5, 0.18, 'sine', 0.06, 0.05);
  }

  public playPlatinum(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      this.tone(n, 0.22, 'triangle', 0.08, idx * 0.055);
    });
  }

  public playPedal(): void {
    this.tone(240, 0.08, 'square', 0.05, 0, 480);
    this.tone(587.33, 0.2, 'triangle', 0.07, 0.06);
  }

  public playExitUnlock(): void {
    this.tone(392.0, 0.18, 'triangle', 0.07, 0);
    this.tone(493.88, 0.18, 'triangle', 0.07, 0.07);
    this.tone(587.33, 0.28, 'sine', 0.08, 0.14);
  }

  public playHit(): void {
    this.tone(155, 0.22, 'sawtooth', 0.1, 0, 58);
    this.tone(110, 0.24, 'square', 0.06, 0.03, 48);
  }

  public playEmote(): void {
    const chord = [261.63, 329.63, 392.0, 523.25];
    chord.forEach((freq, i) => {
      this.tone(freq, 0.24, 'triangle', 0.055, i * 0.035);
    });
  }

  public playRoomClear(): void {
    const riff = [392.0, 493.88, 587.33, 783.99];
    riff.forEach((freq, i) => {
      this.tone(freq, 0.26, 'triangle', 0.085, i * 0.085);
    });
  }

  public playGameOver(): void {
    const down = [329.63, 293.66, 246.94, 196.0];
    down.forEach((freq, i) => {
      this.tone(freq, 0.28, 'sawtooth', 0.06, i * 0.12);
    });
  }
}

export const studioAudio = new StudioAudioEngine();
