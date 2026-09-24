import type { SoundId } from './soundMap';

/** MIDI note → Hz. */
const hz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

/**
 * All game audio is synthesized with the Web Audio API (MK-26, ADR 0004): no sound files to
 * download or license. Each effect is a few oscillators or a noise burst with an envelope.
 */
export class Synth {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly sfx: GainNode;
  readonly music: GainNode;
  private noise: AudioBuffer;

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 0.55;
    this.sfx.connect(this.master);
    this.music = this.ctx.createGain();
    this.music.gain.value = 0.22;
    this.music.connect(this.master);
    const length = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    // Fixed pseudo-random noise (no Math.random needed).
    let seed = 1;
    for (let i = 0; i < length; i += 1) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }
  }

  /** One enveloped oscillator note. */
  tone(
    freq: number,
    duration: number,
    {
      type = 'square' as OscillatorType,
      volume = 0.3,
      at = 0,
      slideTo,
      out = this.sfx,
    }: {
      type?: OscillatorType;
      volume?: number;
      at?: number;
      slideTo?: number;
      out?: AudioNode;
    } = {},
  ): void {
    const t = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  /** A filtered noise burst (whooshes, thuds, crashes). */
  whoosh(duration: number, { volume = 0.3, from = 800, to = 3000, at = 0, q = 1 } = {}): void {
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(gain).connect(this.sfx);
    src.start(t, Math.abs(Math.sin(t)) * 0.5);
    src.stop(t + duration + 0.02);
  }

  /** Plays a sound effect. `v` scales loudness, `pitch` shifts some sounds (drift tier, etc.). */
  play(id: SoundId, v = 1, pitch = 0): void {
    const n = (note: number, d: number, o: Parameters<Synth['tone']>[2] = {}) =>
      this.tone(hz(note), d, { ...o, volume: (o.volume ?? 0.25) * v });
    switch (id) {
      case 'countBeep':
        return n(69, 0.25, { type: 'square', volume: 0.22 });
      case 'goBeep':
        return n(81, 0.5, { type: 'square', volume: 0.25 });
      case 'rocket':
        this.whoosh(0.6, { volume: 0.35 * v, from: 400, to: 4000 });
        return n(72, 0.3, { slideTo: hz(84), type: 'sawtooth', volume: 0.15 });
      case 'stall':
        return n(40, 0.5, { type: 'sawtooth', slideTo: hz(30), volume: 0.2 });
      case 'lap':
        n(76, 0.12);
        return n(81, 0.2, { at: 0.12 });
      case 'finalLap':
        [72, 76, 79, 84].forEach((note, i) => n(note, 0.18, { at: i * 0.11, volume: 0.22 }));
        return;
      case 'finish':
        [72, 76, 79, 84, 79, 84].forEach((note, i) =>
          n(note, i === 5 ? 0.6 : 0.15, { at: i * 0.12, volume: 0.24 }),
        );
        return;
      case 'respawn':
        return n(60, 0.4, { type: 'triangle', slideTo: hz(79), volume: 0.25 });
      case 'itemBox':
        n(84, 0.08, { type: 'triangle' });
        return n(91, 0.12, { type: 'triangle', at: 0.06 });
      case 'itemGet':
        n(79, 0.1, { type: 'triangle' });
        return n(86, 0.2, { type: 'triangle', at: 0.08 });
      case 'mushroom':
        return n(60, 0.35, { type: 'sawtooth', slideTo: hz(84), volume: 0.15 });
      case 'banana':
        return n(67, 0.15, { type: 'triangle', slideTo: hz(55), volume: 0.25 });
      case 'shell':
        this.whoosh(0.3, { volume: 0.25 * v, from: 2000, to: 600, q: 3 });
        return;
      case 'hit':
        this.whoosh(0.35, { volume: 0.4 * v, from: 300, to: 120, q: 0.7 });
        return n(55, 0.4, { type: 'square', slideTo: hz(40), volume: 0.15 });
      case 'starOn':
        [72, 76, 79, 83, 86, 88].forEach((note, i) =>
          n(note, 0.1, { at: i * 0.05, type: 'triangle', volume: 0.2 }),
        );
        return;
      case 'zap':
        this.whoosh(0.8, { volume: 0.5 * v, from: 6000, to: 200, q: 0.5 });
        return n(36, 0.8, { type: 'sawtooth', volume: 0.2 });
      case 'wall':
        return this.whoosh(0.18, { volume: 0.35 * v, from: 200, to: 90, q: 0.8 });
      case 'bump':
        return this.whoosh(0.15, { volume: 0.3 * v, from: 350, to: 150, q: 1 });
      case 'hop':
        return n(64, 0.08, { type: 'triangle', slideTo: hz(71), volume: 0.12 });
      case 'driftStart':
        return this.whoosh(0.25, { volume: 0.12 * v, from: 3000, to: 1500, q: 4 });
      case 'driftTier':
        return n(76 + pitch * 4, 0.12, { type: 'triangle', volume: 0.2 });
      case 'fizzle':
        return this.whoosh(0.2, { volume: 0.1 * v, from: 1500, to: 400, q: 2 });
      case 'miniTurbo':
        this.whoosh(0.4 + pitch * 0.15, { volume: 0.3 * v, from: 500, to: 5000 });
        return n(60 + pitch * 5, 0.3, {
          type: 'sawtooth',
          slideTo: hz(72 + pitch * 5),
          volume: 0.1,
        });
      case 'boostPad':
        return this.whoosh(0.5, { volume: 0.3 * v, from: 600, to: 4000 });
      case 'launch':
        return this.whoosh(0.4, { volume: 0.2 * v, from: 800, to: 2500 });
      case 'trick':
        n(79, 0.08);
        return n(84, 0.12, { at: 0.07 });
      case 'land':
        return this.whoosh(0.2, { volume: 0.35 * v, from: 160, to: 80, q: 0.8 });
    }
  }
}

export { hz };
