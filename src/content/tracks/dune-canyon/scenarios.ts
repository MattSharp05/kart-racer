import { KART_IDS } from '../../../sim/data/karts';
import { createRace, raceSetupRng, type RacerSlot } from '../../../sim/race/createRace';
import { rngInt, rngPick } from '../../../sim/rng';
import { DT, tuning } from '../../../sim/tuning';
import type { Scenario } from '../../../scenarios/registry';
import { kartOnTrack } from '../../../scenarios/tracks';
import { DUNE_CANYON, SANDSTORM, duneCanyon } from './sim';

const TOP_SPEED = tuning.topSpeed[150];

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
    trackId: duneCanyon.id,
    racers,
    engineClass: 150,
    itemsOn: true,
    seed,
    rng,
  });
}

/** Ticks into the sandstorm's cycle when it next starts (it is on from phase 0 of its cycle). */
export const SANDSTORM_START_TICK = Math.round(
  ((1 - (SANDSTORM.phase ?? 0)) * SANDSTORM.period) / DT,
);
/** The sandstorm scenario starts this long before the storm, s (the warning shows for the last 3). */
export const SANDSTORM_LEAD_SECONDS = 4;

/** Dune Canyon (MK-58): registered from this folder (`src/scenarios/index.ts` finds it). */
const scenarios: Scenario[] = [
  {
    name: 'track-dune-canyon',
    group: 'Dune Canyon',
    description:
      'Dune Canyon (MK-58): a full 150cc race, you + 7 AI, from the countdown. Canyon hairpins, a plateau with sand drifts and a sandstorm, a jump over the dry riverbed and a slot-canyon shortcut.',
    defaultSeed: 1,
    setup: (seed) => ({ state: race(seed) }),
  },
  {
    name: 'dune-canyon-sandstorm',
    group: 'Dune Canyon',
    description: `On the plateau straight at speed, ${SANDSTORM_LEAD_SECONDS} s before the sandstorm: "SANDSTORM!" warns you, then the dust blows in, the view closes and grip drops for ${SANDSTORM.period * SANDSTORM.activeFraction} s.`,
    defaultSeed: 1,
    setup: (seed) => {
      // The storm's centre sits mid-plateau; start just before the first sand drift.
      const state = kartOnTrack(seed, duneCanyon.id, DUNE_CANYON.tAt(90, -123), {
        speed: TOP_SPEED * 0.8,
      });
      state.tick = SANDSTORM_START_TICK - Math.round(SANDSTORM_LEAD_SECONDS / DT);
      return { state };
    },
  },
  {
    name: 'dune-canyon-shortcut',
    group: 'Dune Canyon',
    description:
      'At the slot-canyon mouth with a mushroom boost on, pointing west down the narrow corridor. Just hold W.',
    defaultSeed: 1,
    setup: (seed) => {
      const { slot } = DUNE_CANYON;
      const t = DUNE_CANYON.tAt(slot.x0, slot.z);
      const state = kartOnTrack(seed, duneCanyon.id, t, {
        lateral: 3,
        speed: TOP_SPEED,
        boost: tuning.mushroomSeconds,
        // Facing west (the leg runs south here, so west is a right turn).
        headingOffset: -Math.PI / 2,
      });
      return { state };
    },
  },
  {
    name: 'dune-canyon-jump',
    group: 'Dune Canyon',
    description:
      'Full speed, 60 m before the jump over the dry riverbed. Tap drift in the air for a trick boost.',
    defaultSeed: 1,
    setup: (seed) => ({
      state: kartOnTrack(seed, duneCanyon.id, DUNE_CANYON.tAt(300, -48), { speed: TOP_SPEED }),
    }),
  },
];

export default scenarios;
