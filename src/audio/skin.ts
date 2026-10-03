import type { SimEvent, SimState } from '../sim/types';

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
}

let current: SoundSkin | undefined;

/** Registers the skin (one at a time; `undefined` removes it). */
export function setSoundSkin(skin: SoundSkin | undefined): void {
  current = skin;
}

export function soundSkin(): SoundSkin | undefined {
  return current;
}
