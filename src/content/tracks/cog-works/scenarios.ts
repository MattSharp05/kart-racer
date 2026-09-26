import { KART_IDS } from '../../../sim/data/karts';
import { createRace, raceSetupRng, type RacerSlot } from '../../../sim/race/createRace';
import { rngInt, rngPick } from '../../../sim/rng';
import { tuning } from '../../../sim/tuning';
import type { Scenario } from '../../../scenarios/registry';
import { kartOnTrack } from '../../../scenarios/tracks';
import { BELTS, COG_WORKS, cogWorks } from './sim';

const TOP_SPEED = tuning.topSpeed[150];

/** A kart in the factory at `t` in a 150cc session (the crusher timing assumes 150cc speeds). */
function kartAt(seed: number, t: number, options: Parameters<typeof kartOnTrack>[3] = {}) {
  const state = kartOnTrack(seed, cogWorks.id, t, options);
  state.engineClass = 150;
  return state;
}

/** A full 150cc race from the countdown: you + 7 AI, the player starting 5th–8th (seeded). */
function race(seed: number) {
  const rng = raceSetupRng(seed);
  const playerSlot = rngInt(rng, 4, 7);
  const others = Array.from({ length: 8 }, (_, i) => i).filter((i) => i !== playerSlot);
  const racers = Array.from({ length: 8 }, (_, i): RacerSlot =>
    i === 0
      ? { kartId: 'maple', controller: 'local', gridSlot: playerSlot }
      : { kartId: rngPick(rng, KART_IDS), controller: 'ai', gridSlot: others[i - 1] ?? i },
  );
  return createRace({ trackId: cogWorks.id, racers, engineClass: 150, itemsOn: true, seed, rng });
}

/** The crusher scenario starts this far before the first piston, at top speed… */
export const CRUSHERS_LEAD_METRES = 43;
/**
 * …at this tick of the crushers' rhythm, so that holding W you arrive under the first piston as it
 * slams down; braking until it rises, then going, you ride the wave through all three.
 */
export const CRUSHERS_START_TICK = 12;

/** The conveyor scenario starts this far before the belts, in the backward (right) lane. */
export const CONVEYOR_LEAD_METRES = 10;

/** Cog Works (MK-62): registered from this folder (`src/scenarios/index.ts` finds it). */
const scenarios: Scenario[] = [
  {
    name: 'track-cog-works',
    group: 'Cog Works',
    description:
      'Cog Works (MK-62): a full 150cc race in a giant clockwork factory, you + 7 AI, from the countdown. The turntable hairpin, the conveyor straight (forward belt left, backward belt right), the 3-piston crusher gauntlet and the catwalk across the furnace.',
    defaultSeed: 1,
    setup: (seed) => ({ state: race(seed) }),
  },
  {
    name: 'cog-works-crushers',
    group: 'Cog Works',
    description:
      'At top speed onto the crusher gauntlet. Hold W and the first piston slams down on you. Brake until it lifts (watch the lamps and the shadow), then go: the pistons drop one after another, about as fast as you drive, so you ride the wave through all three.',
    defaultSeed: 1,
    setup: (seed) => {
      const piston = COG_WORKS.tAt(COG_WORKS.pistonX[0], COG_WORKS.gauntletZ);
      const state = kartAt(seed, piston - CRUSHERS_LEAD_METRES / COG_WORKS.length, {
        speed: TOP_SPEED,
      });
      state.tick = CRUSHERS_START_TICK;
      return { state };
    },
  },
  {
    name: 'cog-works-conveyor',
    group: 'Cog Works',
    description:
      'At top speed onto the conveyor straight, in the right lane: its belt runs backwards and drags you back. Steer into the left lane and its belt carries you forward, faster than you can drive.',
    defaultSeed: 1,
    setup: (seed) => {
      const lateral = (BELTS.backward.lateralMin + BELTS.backward.lateralMax) / 2;
      const t = BELTS.backward.from - CONVEYOR_LEAD_METRES / COG_WORKS.length;
      return { state: kartAt(seed, t, { speed: TOP_SPEED, lateral }) };
    },
  },
];

export default scenarios;
