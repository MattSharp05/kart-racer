import type { SimEvent, SimState } from '../sim/types';
import type { AudioView } from './soundManager';

/**
 * Another sound set for some races (MK-129: MK8 Mode's item sounds), registered at runtime by the
 * chunk that brings it, like the HUD's skin (`ui/hud/skin.ts`). For the races it `owns`, each event
 * goes to it first: when it plays the sound itself (or silences it), our synth's cue is skipped.
 */
export interface SoundSkin {
  /** Whether this race's sounds are the skin's to play. */
  owns(state: SimState): boolean;
  /** Plays `event`'s sound for the kart the camera follows; true = handled (no synth cue). */
  play(event: SimEvent, state: SimState, followId: number): boolean;
  /** Whether it plays the star music itself (then our faster star loop isn't played). */
  starMusic(): boolean;
  /**
   * Every frame (MK-111: MK8's engine and terrain loops), for any race; `active` when the race is
   * the skin's and sound is on. Not active, its loops should fall silent.
   */
  update?(state: SimState, view: AudioView, active: boolean): void;
  /** Whether it plays the karts' engines itself (then our synth's engine hum is silent). */
  engines?(): boolean;
}

let current: SoundSkin | undefined;

/** Registers the skin (one at a time; `undefined` removes it). */
export function setSoundSkin(skin: SoundSkin | undefined): void {
  current = skin;
}

export function soundSkin(): SoundSkin | undefined {
  return current;
}
