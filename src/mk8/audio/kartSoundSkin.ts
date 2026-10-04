// MK8 races' kart sounds (MK-111) over our game's (`src/audio/skin.ts`): kart events play the
// pack's samples (`./kartSounds.ts`), and every frame `./mixer.ts` keeps the engine and terrain
// loops going. Wraps the skin already there (MK-129's item sounds, MK-110's voices): every event
// goes on to it, and decides our synth's sound unless it's a kart event. Without the pack, or for a sound the pack hasn't got, our synth
// plays as ever; a sound the table silences stays silent only while the pack's sounds cover it.
import { setSoundSkin, soundSkin } from '../../audio/skin';
import type { SimEvent, SimState } from '../../sim/types';
import { isMk8Race } from '../ui/hud';
import { kartCue, KART_SAMPLES, SYNTH } from './kartSounds';
import { KartSoundMixer, type MixerPlayer } from './mixer';
import type { SoundId } from './soundIds';

/** Kart sounds from other karts fade out over this distance, m (as our synth's). */
export const KART_HEARING_RANGE = 60;

/** What kart sounds need from MK8's player (`Mk8AudioPlayer`). */
export interface KartSoundPlayer extends MixerPlayer {
  play(id: SoundId, volume?: number): void;
}

declare global {
  interface Window {
    /** Kart loops' starts and stops (`start <sound>` / `stop <sound>`), for e2e tests (MK-111). */
    __mk8KartLoops?: string[];
  }
}

/** The page's record of kart loop starts and stops. */
export const kartLoopLog: string[] = [];
if (typeof window !== 'undefined') window.__mk8KartLoops = kartLoopLog;

/**
 * Plays `event`'s kart sound with `player` for the kart `followId` follows; true when it did (or
 * silenced it), false to leave it to our synth (or the skin below), undefined when it isn't a
 * kart event.
 */
export function playKartSound(
  player: KartSoundPlayer,
  event: SimEvent,
  state: SimState,
  followId: number,
): boolean | undefined {
  const cue = kartCue(event, state);
  if (!cue) return undefined;
  if (cue.sound === SYNTH) return false;
  // Silenced only when the pack's kart sounds are here (without them nothing would cover it).
  if (cue.sound === null) return KART_SAMPLES.some((id) => player.has(id));
  if (!player.has(cue.sound)) return false;
  let volume = cue.volume ?? 1;
  if (cue.kartId !== followId) {
    if (cue.scope === 'player') return true;
    const me = state.karts[followId];
    const from = state.karts[cue.kartId];
    if (!me || !from) return true;
    const d = Math.hypot(
      from.position.x - me.position.x,
      from.position.y - me.position.y,
      from.position.z - me.position.z,
    );
    if (d > KART_HEARING_RANGE) return true;
    volume *= 1 - d / KART_HEARING_RANGE;
  }
  player.play(cue.sound, volume);
  return true;
}

/**
 * Registers MK8's kart sounds over the sound skin already there (once per page, after the item
 * sounds and voices). The samples load with the race (`loadKartSounds` in `../index.ts`).
 */
export function installMk8KartSounds(
  player: () => KartSoundPlayer,
  now: () => number = () => performance.now() / 1000,
): KartSoundMixer {
  const mixer = new KartSoundMixer(player, { log: kartLoopLog });
  const inner = soundSkin();
  setSoundSkin({
    owns: (state) => inner?.owns(state) ?? isMk8Race(state),
    play: (event, state, followId) => {
      // Every event goes on to the skins below too (MK-110's voices speak on kart events).
      const below = inner?.play(event, state, followId) ?? false;
      const played = isMk8Race(state) ? playKartSound(player(), event, state, followId) : undefined;
      return played ?? below;
    },
    starMusic: () => inner?.starMusic() ?? false,
    update: (state, view, active) => {
      inner?.update?.(state, view, active);
      mixer.update(state, view.followId, active && isMk8Race(state), now());
    },
    engines: () => mixer.hasEngines() || inner?.engines?.() === true,
  });
  return mixer;
}
