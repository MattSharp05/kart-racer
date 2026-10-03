// MK8 races' item sounds (MK-129), as a skin over our game's sounds (`src/audio/skin.ts`): in MK8
// races, item events play the pack's samples (`./itemSounds.ts`) through MK8's player. Without the
// pack, or for a sound the pack hasn't got, our synth plays as ever; a sound the table silences
// stays silent only while the pack's sounds are there to cover it.
import { setSoundSkin } from '../../audio/skin';
import type { SimEvent, SimState } from '../../sim/types';
import { isMk8Race } from '../ui/hud';
import { itemCue, ITEM_SAMPLES, STAR_MUSIC, SYNTH } from './itemSounds';
import type { SoundId } from './soundIds';

/** Item sounds from other karts fade out over this distance, m (as our synth's). */
export const ITEM_HEARING_RANGE = 60;

/** What the skin needs from MK8's sampled-audio player (`Mk8AudioPlayer`). */
export interface ItemSoundPlayer {
  play(id: SoundId, volume?: number): void;
  /** Whether the pack's file for `id` is loaded. */
  has(id: SoundId): boolean;
}

/**
 * Plays `event`'s item sound with `player` for the kart `followId` follows; true when it did (or
 * silenced it), false to leave it to our synth.
 */
export function playItemSound(
  player: ItemSoundPlayer,
  event: SimEvent,
  state: SimState,
  followId: number,
): boolean {
  const cue = itemCue(event);
  if (!cue || cue.sound === SYNTH) return false;
  // Silenced only when the pack's item sounds are here (without them nothing would cover it).
  if (cue.sound === null) return ITEM_SAMPLES.some((id) => player.has(id));
  if (!player.has(cue.sound)) return false;
  const me = state.karts[followId];
  const from = state.karts[cue.kartId];
  let volume = 1;
  if (cue.scope !== 'all' && cue.kartId !== followId) {
    if (cue.scope === 'player' || !me || !from) return true;
    const d = Math.hypot(
      from.position.x - me.position.x,
      from.position.y - me.position.y,
      from.position.z - me.position.z,
    );
    if (d > ITEM_HEARING_RANGE) return true;
    volume = 1 - d / ITEM_HEARING_RANGE;
  }
  player.play(cue.sound, volume);
  if (event.type === 'star' && event.kartId === followId && player.has(STAR_MUSIC)) {
    player.play(STAR_MUSIC);
  }
  return true;
}

/** Registers MK8's item sounds over our game's (once per page); `player` is MK8's player. */
export function installMk8ItemSounds(player: () => ItemSoundPlayer): void {
  setSoundSkin({
    owns: isMk8Race,
    play: (event, state, followId) => playItemSound(player(), event, state, followId),
    starMusic: () => player().has(STAR_MUSIC),
  });
}
