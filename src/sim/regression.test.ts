import { describe, expect, it } from 'vitest';
import { tracks } from '../content/tracks';
import { allAiRace } from './items/balance';
import { createSimState } from './state';
import { step } from './step';
import type { InputFrame, SimState } from './types';

/**
 * Surface-frame physics regression (MK-99, ADR 0011): mesh tracks got their own kart step, and
 * the karts on every other track must not change by a bit. Each track runs a seeded 8-AI race
 * (items on, 150cc) for 30 s and hashes the whole state; the hashes were recorded on main before
 * MK-99. A change that moves one of them changed the original game's physics.
 */
const TICKS = 30 * 60;

/** FNV-1a (32-bit, two lanes) over the state's JSON. */
function hashState(state: SimState): string {
  const text = JSON.stringify(state);
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c ^ (i & 0xff), 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/** Recorded on main at 0235a28 (before MK-99). */
const EXPECTED: Record<string, string> = {
  'sunny-circuit': '6e0ce109a9c961f9',
  'dune-canyon': 'd948fa6c4b8ac896',
  'frostpeak-pass': '353ab3c7393b7896',
  'neon-harbour': '803e38f9daf95a89',
  'canopy-rush': '19d4e55e4c03b071',
  'cog-works': 'afdfba1c971cfcd4',
  'test-oval': '6115d0ca76123224',
  'test-pad': '7541f263c15c944d',
  'hazard-test': '8ccb5a392eb96571',
};

/** A scripted driver for the fixtures without a full grid: weaves, drifts and boosts. */
function scripted(tick: number): InputFrame {
  const phase = Math.floor(tick / 150) % 4;
  return {
    throttle: phase === 3 ? 0.5 : 1,
    brake: 0,
    steer: Math.sin(tick / 40),
    drift: phase === 1,
    item: tick % 300 === 0,
  };
}

/** Each track's 30 s run: 8 AI where the grid has 8 slots, else one scripted kart. */
function run(trackId: string): SimState {
  const def = tracks.get(trackId).def;
  const slots = def.kind === 'spline' ? (def.gridSlots?.length ?? 0) : 0;
  let s =
    slots >= 8
      ? allAiRace(1, trackId, 8, 150)
      : slots > 0
        ? allAiRace(1, trackId, slots, 150)
        : createSimState({ seed: 1, trackId, engineClass: 150 });
  const humans = slots > 0 && slots < 8;
  for (let i = 0; i < TICKS; i += 1) {
    const input = scripted(i);
    s = step(s, slots === 0 || humans ? [input] : []).state;
  }
  return s;
}

describe('existing tracks are bit-identical after surface-frame physics (MK-99)', () => {
  it.each(tracks.ids())(
    '%s: a seeded 30 s run hashes as before',
    (trackId) => {
      const hash = hashState(run(trackId));
      expect(hash, `${trackId} → ${hash}`).toBe(EXPECTED[trackId]);
    },
    60_000,
  );
});
