// MK8 sampled-audio player (MK-104): plays the pack's `.m4a` sounds (MK-94) through Web Audio
// buffers, decoded once from the bytes the loader holds. A sound the pack doesn't have yet (no
// pack, or not converted) plays a short synthesized stand-in, so the menus are never silent.
// Like the game's SoundManager, audio starts on the first tap or key press (iOS needs a gesture).
import { listenForAudioGestures } from '../../audio/soundManager';
import { soundPath, type SoundId } from './soundIds';

/** The menu sounds the UI kit plays. */
export const MENU_SOUNDS = ['ui/cursor', 'ui/decide', 'ui/back', 'ui/name-appear'] as const;
export type MenuSoundId = (typeof MENU_SOUNDS)[number];

/** What MK8 screens need to make a sound. */
export interface SoundPlayer {
  play(id: SoundId): void;
  /** Starts audio inside a user gesture (MK8's "press start"), where the player can. */
  unlock?(): void;
}

/** Loudness of sampled sounds and of the stand-ins. */
const SAMPLE_VOLUME = 0.8;
const SYNTH_VOLUME = 0.2;

/** A stand-in note: frequency (Hz), start and length (s), optional slide target (Hz). */
interface Note {
  hz: number;
  at: number;
  seconds: number;
  slideTo?: number;
  type?: OscillatorType;
}

/** Synthesized stand-ins, in the spirit of MK8's menu blips. */
const STAND_INS: Record<MenuSoundId, Note[]> = {
  'ui/cursor': [{ hz: 1568, at: 0, seconds: 0.05, type: 'triangle' }],
  'ui/decide': [
    { hz: 988, at: 0, seconds: 0.07, type: 'square' },
    { hz: 1480, at: 0.06, seconds: 0.14, type: 'square' },
  ],
  'ui/back': [{ hz: 880, at: 0, seconds: 0.12, slideTo: 440, type: 'triangle' }],
  'ui/name-appear': [
    { hz: 1047, at: 0, seconds: 0.08, type: 'sine' },
    { hz: 1319, at: 0.05, seconds: 0.08, type: 'sine' },
    { hz: 1568, at: 0.1, seconds: 0.18, type: 'sine' },
  ],
};
const DEFAULT_STAND_IN: Note[] = [{ hz: 1200, at: 0, seconds: 0.06, type: 'triangle' }];

export interface PlayerOptions {
  /** A pack file's bytes by manifest path (the loader's `file`). */
  file?: (path: string) => ArrayBuffer | undefined;
  /** The game's mute setting (M key / Settings). */
  isMuted?: () => boolean;
  /** Makes the audio context; none where Web Audio is missing. */
  createContext?: () => AudioContext;
  /** Where the first tap or key press is listened for; `window` in the game. */
  gestures?: EventTarget;
}

export class Mk8AudioPlayer implements SoundPlayer {
  /** Every sound asked for, in order (the e2e tests read it via `window.__mk8`). */
  readonly played: SoundId[] = [];
  private ctx: AudioContext | undefined;
  private out: GainNode | undefined;
  private readonly buffers = new Map<SoundId, Promise<AudioBuffer | undefined>>();
  private readonly file: (path: string) => ArrayBuffer | undefined;
  private readonly isMuted: () => boolean;
  private readonly createContext: (() => AudioContext) | undefined;

  constructor(options: PlayerOptions = {}) {
    this.file = options.file ?? (() => undefined);
    this.isMuted = options.isMuted ?? (() => false);
    this.createContext =
      options.createContext ??
      (typeof AudioContext === 'undefined' ? undefined : () => new AudioContext());
    const gestures = options.gestures ?? (typeof window === 'undefined' ? undefined : window);
    if (gestures) listenForAudioGestures(gestures, () => this.unlock());
  }

  /** Whether audio has started. */
  get unlocked(): boolean {
    return this.ctx !== undefined;
  }

  /** Starts (or resumes) audio inside a user gesture; then decodes the menu sounds. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state !== 'running') void this.ctx.resume();
      return;
    }
    if (!this.createContext) return;
    try {
      const ctx = this.createContext();
      this.out = ctx.createGain();
      this.out.connect(ctx.destination);
      // iOS only starts a context that plays something inside the gesture: a one-sample silence.
      const blip = ctx.createBufferSource();
      blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      blip.connect(ctx.destination);
      blip.start();
      void ctx.resume();
      this.ctx = ctx;
      for (const id of MENU_SOUNDS) void this.buffer(id);
    } catch {
      this.ctx = undefined; // no audio on this device; the menus still work
    }
  }

  play(id: SoundId): void {
    this.played.push(id);
    const ctx = this.ctx;
    if (!ctx || this.isMuted()) return;
    if (!this.file(soundPath(id))) {
      this.synth(ctx, id);
      return;
    }
    void this.buffer(id).then((buffer) => {
      if (!buffer || !this.out) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = SAMPLE_VOLUME;
      source.buffer = buffer;
      source.connect(gain).connect(this.out);
      source.start();
    });
  }

  /** The decoded sound, once per id; undefined when the pack hasn't got it or it won't decode. */
  private buffer(id: SoundId): Promise<AudioBuffer | undefined> {
    let decoded = this.buffers.get(id);
    if (!decoded) {
      const bytes = this.file(soundPath(id));
      const ctx = this.ctx;
      if (!bytes || !ctx) return Promise.resolve(undefined);
      // decodeAudioData takes the buffer over; the loader keeps its own copy.
      decoded = ctx.decodeAudioData(bytes.slice(0)).catch(() => undefined);
      this.buffers.set(id, decoded);
    }
    return decoded;
  }

  private synth(ctx: AudioContext, id: SoundId): void {
    const out = this.out;
    if (!out) return;
    const notes = (STAND_INS as Partial<Record<SoundId, Note[]>>)[id] ?? DEFAULT_STAND_IN;
    for (const note of notes) {
      const t = ctx.currentTime + note.at;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = note.type ?? 'triangle';
      osc.frequency.setValueAtTime(note.hz, t);
      if (note.slideTo) osc.frequency.exponentialRampToValueAtTime(note.slideTo, t + note.seconds);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(SYNTH_VOLUME, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + note.seconds);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + note.seconds + 0.02);
    }
  }
}
