import { autopilotInput } from '../../sim/autopilot';
import { step } from '../../sim/step';
import { getTrack, trackGeometry } from '../../sim/track';
import type { InputFrame } from '../../sim/types';
import { spikeRace } from './netcode';

/** FNV-1a (32-bit) of a string, as 8 hex digits. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Cross-engine check (MK-36): runs the seeded spike race for `ticks` with the autopilot driving
 * both human karts and hashes the final state. Equal hashes in two engines = bit-identical sims.
 */
export function simHash(seed: number, ticks: number): { hash: string; x: number; z: number } {
  let state = spikeRace(seed);
  const track = getTrack(state.trackId);
  if (track.kind !== 'spline') throw new Error('Spike race needs a spline track');
  const geometry = trackGeometry(track);
  for (let i = 0; i < ticks; i += 1) {
    const inputs: InputFrame[] = [];
    for (const id of [0, 1]) {
      const kart = state.karts[id];
      if (kart) inputs[id] = autopilotInput(kart, geometry);
    }
    state = step(state, inputs).state;
  }
  const kart = state.karts[0];
  return { hash: fnv1a(JSON.stringify(state)), x: kart?.position.x ?? 0, z: kart?.position.z ?? 0 };
}

/**
 * Re-simulation cost (ADR 0005): from a mid-race state, steps `ticks` ticks `reps` times (what a
 * client does on every snapshot) and returns the average ms per re-simulation.
 */
export function benchResim(
  seed: number,
  ticks: number,
  reps: number,
  now: () => number = () => performance.now(),
): { msPerResim: number; msPerTick: number } {
  let state = spikeRace(seed);
  const throttle: InputFrame[] = [0, 1].map(() => ({
    throttle: 1,
    brake: 0,
    steer: 0,
    drift: false,
    item: false,
  }));
  // Into the race proper: past the countdown, AI spread out.
  const warmup = 400;
  for (let i = 0; i < warmup; i += 1) state = step(state, throttle).state;
  const start = now();
  for (let r = 0; r < reps; r += 1) {
    let s = structuredClone(state);
    for (let i = 0; i < ticks; i += 1) s = step(s, throttle).state;
  }
  const msPerResim = (now() - start) / reps;
  return { msPerResim, msPerTick: msPerResim / ticks };
}
