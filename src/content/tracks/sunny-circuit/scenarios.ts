import { KART_IDS } from '../../../sim/data/karts';
import { createRace, raceSetupRng, type RacerSlot } from '../../../sim/race/createRace';
import { rngInt, rngPick } from '../../../sim/rng';
import type { Scenario } from '../../../scenarios/registry';
import { sunnyCircuit } from './sim';

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
  return createRace({
    trackId: sunnyCircuit.id,
    racers,
    engineClass: 150,
    itemsOn: true,
    seed,
    rng,
  });
}

/** Sunny Circuit (MK-71): the same full-race entry point every other track has. */
const scenarios: Scenario[] = [
  {
    name: 'track-sunny-circuit',
    group: 'Sunny Circuit',
    description:
      'Sunny Circuit: a full 150cc race, you + 7 AI, from the countdown (like every other track’s track-<id> scenario; add &quality=low for low-quality mode).',
    defaultSeed: 1,
    setup: (seed) => ({ state: race(seed) }),
  },
];

export default scenarios;
