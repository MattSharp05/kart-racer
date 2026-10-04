// MK8 races' racer voices (MK-110), hooked into our game's sounds through the sound skin
// (`src/audio/skin.ts`): every event of an MK8 race goes to `RaceVoices` (./voices.ts), then on to
// the skin already there (MK-129's item sounds), which decides whether our synth plays it too. A
// voice is said over the other sounds, never instead of them.
import { setSoundSkin, soundSkin } from '../../audio/skin';
import { isMk8Race } from '../ui/hud';
import { RaceVoices, type RaceVoicePlayer } from './voices';

/**
 * Adds MK8's race voices to the sound skin (once per page, after `installMk8ItemSounds`).
 * `load` fetches racers' voice lines (`Mk8Loader.loadVoices`); without a pack it fails quietly
 * and the voices stay silent.
 */
export function installMk8Voices(
  player: () => RaceVoicePlayer,
  load: (voiceIds: string[]) => Promise<void>,
): RaceVoices {
  const voices = new RaceVoices(player, {
    load: (ids) => void load(ids).catch(() => undefined),
  });
  const inner = soundSkin();
  setSoundSkin({
    owns: (state) => inner?.owns(state) ?? isMk8Race(state),
    play: (event, state, followId) => {
      if (isMk8Race(state)) voices.onEvent(event, state, followId);
      return inner?.play(event, state, followId) ?? false;
    },
    starMusic: () => inner?.starMusic() ?? false,
  });
  return voices;
}
