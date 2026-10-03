// Course ambience (MK-125): each MK8 course's loops (Stadium's crowd; fountains, fizz, waterfalls
// on the courses to come), listed in its `look.ts`. They play while the race runs and stop when
// it's paused or left (the course look calls `update` every frame and `stop` when the track goes).
// A sound placed `at` a point fades out with the camera's distance from it, to nothing at `radius`.
import { readMuted } from '../../game/storage/settings';
import { browserStore } from '../../game/storage/store';
import type { CourseSound } from '../content/courses/types';
import { Mk8AudioPlayer, type SoundLoop } from './player';
import type { SoundId } from './soundIds';

/** What ambience needs from the audio player. */
export interface LoopPlayer {
  loop(id: SoundId, volume: number): SoundLoop | undefined;
}

declare global {
  interface Window {
    /** Course ambience's starts and stops (`start <sound>` / `stop <sound>`), for e2e tests. */
    __mk8Ambience?: string[];
  }
}

/** The page's record of ambience starts and stops. */
export const ambienceLog: string[] = [];
if (typeof window !== 'undefined') window.__mk8Ambience = ambienceLog;

/** Volume changes smaller than this aren't sent to the player. */
const VOLUME_STEP = 0.01;
/** Frames between reads of the mute setting (it's in storage). */
const MUTE_CHECK_FRAMES = 30;

interface Playing {
  sound: CourseSound;
  loop: SoundLoop | undefined;
  volume: number;
}

export class CourseAmbience {
  private playing: Playing[] | undefined;
  private muted = false;
  private framesToMuteCheck = 0;

  constructor(
    private readonly sounds: readonly CourseSound[],
    private readonly player: LoopPlayer,
    private readonly isMuted: () => boolean = () => false,
    private readonly log: string[] = ambienceLog,
  ) {}

  /** Whether the loops are on (they may still be silent until audio starts). */
  get on(): boolean {
    return this.playing !== undefined;
  }

  /** Every frame: on while the race runs, off while it's paused; volumes from where `listener` is. */
  update(paused: boolean, listener: { x: number; y: number; z: number }): void {
    if (paused) {
      this.stop();
      return;
    }
    if (this.framesToMuteCheck <= 0) {
      this.muted = this.isMuted();
      this.framesToMuteCheck = MUTE_CHECK_FRAMES;
    }
    this.framesToMuteCheck -= 1;
    if (!this.playing) {
      this.playing = this.sounds.map((sound) => ({ sound, loop: undefined, volume: -1 }));
      for (const { sound } of this.playing) this.log.push(`start ${sound.sound}`);
    }
    for (const p of this.playing) {
      const volume = this.muted ? 0 : p.sound.volume * falloff(p.sound, listener);
      if (!p.loop) {
        // Audio starts on the first tap or key press: until then, try again each frame.
        p.loop = this.player.loop(p.sound.sound, volume);
        p.volume = volume;
      } else if (Math.abs(volume - p.volume) >= VOLUME_STEP) {
        p.loop.setVolume(volume);
        p.volume = volume;
      }
    }
  }

  /** Silences every loop (paused, or the course is gone). */
  stop(): void {
    if (!this.playing) return;
    for (const p of this.playing) {
      p.loop?.stop();
      this.log.push(`stop ${p.sound.sound}`);
    }
    this.playing = undefined;
  }
}

/** 1 for a sound everywhere; else fading with the distance from `at`, 0 from `radius` out. */
export function falloff(sound: CourseSound, listener: { x: number; y: number; z: number }): number {
  if (!sound.at || !sound.radius) return 1;
  const [x, y, z] = sound.at;
  const d = Math.hypot(listener.x - x, listener.y - y, listener.z - z);
  return Math.max(0, 1 - d / sound.radius);
}

let player: Mk8AudioPlayer | undefined;

/**
 * The page's ambience player: pack sounds by path (`file`, the loader's), following the game's
 * mute setting. Its own audio context, started by the first tap or key press like the menus'.
 */
export function ambiencePlayer(file: (path: string) => ArrayBuffer | undefined): Mk8AudioPlayer {
  player ??= new Mk8AudioPlayer({ file, isMuted: gameMuted });
  return player;
}

/** The game's mute setting (M key / Settings), as stored. */
export function gameMuted(): boolean {
  try {
    return readMuted(browserStore());
  } catch {
    return false;
  }
}
