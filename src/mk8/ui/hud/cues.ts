// What the MK8 HUD shows and plays from the race (MK-127), as pure functions of the sim state and
// its events: Lakitu's countdown light and lap sign (timed by `lakituPose`, MK-101), the big
// countdown numbers, and the race sounds.
import { DT, tuning } from '../../../sim/tuning';
import type { KartState, SimEvent, SimState } from '../../../sim/types';
import type { SoundId } from '../../audio/soundIds';
import type { LakituCue } from '../../render/lakitu';

/** "GO!" stays up this long after the countdown, s. */
export const GO_SECONDS = 1;

/** Lakitu's cue for `kart` now: the countdown (and just after GO), a new lap's sign, or none. */
export function lakituCue(state: SimState, kart: KartState): LakituCue {
  if (state.phase === 'free') return { kind: 'hidden' };
  const countdown = state.tick - state.race.countdownStartTick;
  if (state.phase === 'countdown' || state.tick < state.race.goTick + GO_SECONDS / DT) {
    return countdown >= 0 ? { kind: 'countdown', tick: countdown } : { kind: 'hidden' };
  }
  const { lap, lapStartTick, finishTick } = kart.race;
  const laps = state.race.laps;
  if (lap < 2 || lap > laps || finishTick !== undefined) return { kind: 'hidden' };
  return { kind: 'lap', tick: state.tick - lapStartTick, lap, final: lap === laps };
}

/** The big countdown text: "3", "2", "1", then "GO!" for `GO_SECONDS`; null otherwise. */
export function countdownText(state: SimState): string | null {
  if (state.phase === 'free') return null;
  const left = (state.race.goTick - state.tick) * DT;
  if (left > 0) {
    if (left > tuning.countdownSeconds) return null;
    return String(Math.min(3, Math.ceil((left / tuning.countdownSeconds) * 3)));
  }
  return -left < GO_SECONDS ? 'GO!' : null;
}

/** Seconds since the countdown text last changed (a number, or GO!). */
export function countdownSince(state: SimState): number {
  const left = (state.race.goTick - state.tick) * DT;
  if (left <= 0) return -left;
  const per = tuning.countdownSeconds / 3;
  return Math.ceil(left / per - 1e-9) * per - left;
}

/** The race sounds `events` make for kart `kartId` (the roulette's come from its reel). */
export function hudSounds(events: readonly SimEvent[], state: SimState, kartId: number): SoundId[] {
  const sounds: SoundId[] = [];
  for (const event of events) {
    // One clip for the three beeps (MK8's), started on "3".
    if (event.type === 'countdown' && event.value === 3) sounds.push('race/countdown');
    if (event.type === 'go') sounds.push('race/go');
    if (event.type === 'lap' && event.kartId === kartId && event.lap >= 2) {
      sounds.push(event.lap === state.race.laps ? 'race/final-lap' : 'race/lap');
    }
    if (event.type === 'finish' && event.kartId === kartId) sounds.push('race/finish');
  }
  return sounds;
}
