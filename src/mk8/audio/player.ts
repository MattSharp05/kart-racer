// MK8 sampled-audio player (MK-104): plays the pack's `.m4a` sounds (MK-94) through Web Audio
// buffers, decoded once from the bytes the loader holds. A sound the pack doesn't have yet (no
// pack, or not converted) plays a short synthesized stand-in, so the menus are never silent.
// Like the game's SoundManager, audio starts on the first tap or key press (iOS needs a gesture).
import { listenForAudioGestures } from '../../audio/soundManager';
import { soundPath, type SoundId } from './soundIds';
import type { VoiceEvent } from './voiceEvents';
import {
  parseVoiceIndex,
  voiceSoundId,
  VOICES_PATH,
  type VoiceIndex,
  type VoiceOptions,
  type VoiceSoundId,
} from './voices';

/** The menu sounds the UI kit plays. */
export const MENU_SOUNDS = ['ui/cursor', 'ui/decide', 'ui/back', 'ui/name-appear'] as const;
export type MenuSoundId = (typeof MENU_SOUNDS)[number];

/** What MK8 screens need to make a sound. */
export interface SoundPlayer {
  /** Plays a sound at `volume` (0..1, default 1: MK-129's item sounds fade with distance). */
  play(id: SoundId, volume?: number): void;
  /**
   * A racer's voice line (MK-117), by the pipeline's voice id (`mario`, `shy-guy`). Silent when
   * the pack hasn't got the clip: there is no stand-in for a voice. MK-110's race lines pass a
   * volume (distance) and a seeded `pick` of the event's clips; without one the clips take turns.
   */
  voice?(racer: string, event: VoiceEvent, options?: VoiceOptions): void;
  /** Starts audio inside a user gesture (MK8's "press start"), where the player can. */
  unlock?(): void;
}

/** A looping sound (MK-125: course ambience) playing until stopped. */
export interface SoundLoop {
  /** 0–1, eased over a moment so changes don't click. */
  setVolume(volume: number): void;
  /** Playback rate (MK-111: an engine's pitch by speed), eased like the volume. */
  setRate?(rate: number): void;
  stop(): void;
}

/** How quickly a loop's volume follows `setVolume`, s (time constant). */
const LOOP_EASE = 0.15;
/** Playback-rate changes smaller than this aren't sent (every frame would otherwise). */
const RATE_STEP = 0.005;

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
  /** Every sound and voice line asked for, in order (the e2e tests read it via `window.__mk8`). */
  readonly played: (SoundId | VoiceSoundId)[] = [];
  private ctx: AudioContext | undefined;
  private out: GainNode | undefined;
  /** Decoded sounds by pack path. */
  private readonly buffers = new Map<string, Promise<AudioBuffer | undefined>>();
  private voices: VoiceIndex | undefined;
  /** How many times each racer's event has played: its clips take turns. */
  private readonly voiceTurns = new Map<string, number>();
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
      for (const id of MENU_SOUNDS) void this.buffer(soundPath(id));
    } catch {
      this.ctx = undefined; // no audio on this device; the menus still work
    }
  }

  play(id: SoundId, volume = 1): void {
    this.played.push(id);
    const ctx = this.ctx;
    if (!ctx || this.isMuted()) return;
    const path = soundPath(id);
    if (!this.file(path)) {
      this.synth(ctx, id);
      return;
    }
    this.sample(ctx, path, volume);
  }

  /** Whether the pack's file for `id` is loaded (MK-129: else the race's synth sound plays). */
  has(id: SoundId): boolean {
    return this.file(soundPath(id)) !== undefined;
  }

  /**
   * Loops `id` at `volume` until stopped. Undefined until audio has started (the first tap or
   * key press); silent when the pack hasn't got the sound (no stand-in loops).
   */
  loop(id: SoundId, volume: number): SoundLoop | undefined {
    const ctx = this.ctx;
    const out = this.out;
    if (!ctx || !out) return undefined;
    const gain = ctx.createGain();
    gain.gain.value = volume * SAMPLE_VOLUME;
    gain.connect(out);
    let source: AudioBufferSourceNode | undefined;
    let stopped = false;
    let rate = 1;
    void this.buffer(soundPath(id)).then((buffer) => {
      if (!buffer || stopped) return;
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      if (rate !== 1) source.playbackRate.value = rate;
      source.connect(gain);
      source.start();
    });
    return {
      setVolume: (v) => gain.gain.setTargetAtTime(v * SAMPLE_VOLUME, ctx.currentTime, LOOP_EASE),
      setRate: (r) => {
        if (Math.abs(r - rate) < RATE_STEP) return;
        rate = r;
        source?.playbackRate.setTargetAtTime(r, ctx.currentTime, LOOP_EASE);
      },
      stop: () => {
        stopped = true;
        source?.stop();
        gain.disconnect();
      },
    };
  }

  voice(racer: string, event: VoiceEvent, options: VoiceOptions = {}): void {
    this.played.push(voiceSoundId(racer, event));
    const ctx = this.ctx;
    if (!ctx || this.isMuted()) return;
    const clips = this.voiceIndex()?.[racer]?.[event] ?? [];
    if (clips.length === 0) return;
    let index: number;
    if (options.pick !== undefined) {
      index = Math.min(clips.length - 1, Math.floor(options.pick * clips.length));
    } else {
      const key = `${racer}/${event}`;
      index = this.voiceTurns.get(key) ?? 0;
      this.voiceTurns.set(key, index + 1);
    }
    const path = clips[index % clips.length];
    if (path && this.file(path)) this.sample(ctx, path, options.volume);
  }

  /** The pack's voice index, once it is loaded (parsed once). */
  private voiceIndex(): VoiceIndex | undefined {
    if (!this.voices) {
      const bytes = this.file(VOICES_PATH);
      if (bytes) this.voices = parseVoiceIndex(bytes);
    }
    return this.voices;
  }

  private sample(ctx: AudioContext, path: string, volume = 1): void {
    void this.buffer(path).then((buffer) => {
      if (!buffer || !this.out) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = SAMPLE_VOLUME * volume;
      source.buffer = buffer;
      source.connect(gain).connect(this.out);
      source.start();
    });
  }

  /** The decoded file, once per path; undefined when the pack hasn't got it or it won't decode. */
  private buffer(path: string): Promise<AudioBuffer | undefined> {
    let decoded = this.buffers.get(path);
    if (!decoded) {
      const bytes = this.file(path);
      const ctx = this.ctx;
      if (!bytes || !ctx) return Promise.resolve(undefined);
      // decodeAudioData takes the buffer over; the loader keeps its own copy.
      decoded = ctx.decodeAudioData(bytes.slice(0)).catch(() => undefined);
      this.buffers.set(path, decoded);
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
