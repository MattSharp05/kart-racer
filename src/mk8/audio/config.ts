// MK8 race voices (MK-110): who speaks, how often, how far away they're heard. Tuning-like
// constants for `./voices.ts`'s `RaceVoices`; audio only, so they live here, not in `sim/tuning`.
import type { VoiceEvent } from './voiceEvents';

/** Other karts' voices are heard within this distance of the camera's kart, fading out, m. */
export const VOICE_RANGE = 60;

/**
 * How long a kart's voice line is taken to last, s: it says nothing else meanwhile (one line at a
 * time per kart). MK8's lines are 0.5–1.5 s.
 */
export const VOICE_LINE_SECONDS = 1.2;

/**
 * The least time between two lines of the same event from one kart, s: 5 boosts in a second say
 * one line. Finish lines are said once a race anyway.
 */
export const VOICE_COOLDOWN_SECONDS: Readonly<Record<VoiceEvent, number>> = {
  select: 0,
  boost: 4,
  trick: 3,
  glide: 4,
  hit: 1.5,
  fall: 2,
  waterFall: 2,
  overtake: 6,
  itemHit: 3,
  finishWin: 0,
  finishLose: 0,
  horn: 2,
};

/** The player's finish line is the win line in these places or better (MK8: a podium), else lose. */
export const FINISH_WIN_PLACES = 3;
