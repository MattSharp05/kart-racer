import { KART_IDS } from '../../../sim/data/karts';
import { hazardPose } from '../../../sim/hazards';
import type { MoverHazard } from '../../../sim/hazards/types';
import { createRace, raceSetupRng, type RacerSlot } from '../../../sim/race/createRace';
import { rngInt, rngPick } from '../../../sim/rng';
import { DT, tuning } from '../../../sim/tuning';
import type { Scenario } from '../../../scenarios/registry';
import { kartOnTrack } from '../../../scenarios/tracks';
import { FROSTPEAK_PASS, SNOWBALLS, SNOWBALL, frostpeakPass } from './sim';

const TOP_SPEED = tuning.topSpeed[150];

/** A kart on the pass at `t` in a 150cc session (the timing of these scenarios assumes 150cc speeds). */
function kartAt(seed: number, t: number, options: Parameters<typeof kartOnTrack>[3] = {}) {
  const state = kartOnTrack(seed, frostpeakPass.id, t, options);
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
  return createRace({
    trackId: frostpeakPass.id,
    racers,
    engineClass: 150,
    itemsOn: true,
    seed,
    rng,
  });
}

/** The first tick (within its first period) at which `ball` rolls over the descent's centreline. */
export function snowballCrossingTick(ball: MoverHazard): number {
  const period = Math.round(SNOWBALL.period / DT);
  const { z } = FROSTPEAK_PASS.descent;
  for (let tick = 0; tick < period; tick += 1) {
    const now = hazardPose(ball, tick);
    const next = hazardPose(ball, tick + 1);
    if (now.amount > 0 && now.z < z && next.z >= z) return tick + 1;
  }
  throw new Error('Frostpeak snowball never crosses the road');
}

/** The snowball scenario: you start this far before the first lane, at top speed, m… */
export const SNOWBALL_LEAD_METRES = 60;
/** …this long before its snowball rolls over the middle of the road, s (≈ the time to get there). */
export const SNOWBALL_LEAD_SECONDS = SNOWBALL_LEAD_METRES / TOP_SPEED;

/** Frostpeak Pass (MK-59): registered from this folder (`src/scenarios/index.ts` finds it). */
const scenarios: Scenario[] = [
  {
    name: 'track-frostpeak-pass',
    group: 'Frostpeak Pass',
    description:
      'Frostpeak Pass (MK-59): a full 150cc race, you + 7 AI, from the countdown. A climb to the summit hairpin (a tunnel through the snowbank cuts it), snowballs rolling across the descent, and a wide frozen lake.',
    defaultSeed: 1,
    setup: (seed) => ({ state: race(seed) }),
  },
  {
    name: 'frostpeak-ice',
    group: 'Frostpeak Pass',
    description:
      'Fast, heading into the frozen lake. Steer hard on the ice and the kart slides wide; the outside edge (packed snow) still grips. Brake early or drift it.',
    defaultSeed: 1,
    setup: (seed) => {
      const { lake } = FROSTPEAK_PASS;
      const t = FROSTPEAK_PASS.tAt(lake.x + lake.radius, lake.z - 30);
      return { state: kartAt(seed, t, { speed: TOP_SPEED * 0.9 }) };
    },
  },
  {
    name: 'frostpeak-snowballs',
    group: 'Frostpeak Pass',
    description: `Top speed down the descent, ${SNOWBALL_LEAD_METRES} m before the first snowball lane: a snowball is already rolling down the slope on your right, with a shadow and a rumble. Hold W and it runs you over; brake or swerve to miss it.`,
    defaultSeed: 1,
    setup: (seed) => {
      const [first] = SNOWBALLS;
      const lane = FROSTPEAK_PASS.descent.lanes[0] ?? 0;
      const t = FROSTPEAK_PASS.tAt(lane + SNOWBALL_LEAD_METRES, FROSTPEAK_PASS.descent.z);
      const state = kartAt(seed, t, { speed: TOP_SPEED });
      const cross = first ? snowballCrossingTick(first) : 0;
      const period = Math.round(SNOWBALL.period / DT);
      // A whole period in, so the tick clock never starts negative.
      state.tick = period + cross - Math.round(SNOWBALL_LEAD_SECONDS / DT);
      return { state };
    },
  },
  {
    name: 'frostpeak-tunnel',
    group: 'Frostpeak Pass',
    description:
      'At the summit, level with the tunnel mouth, with a mushroom boost on and facing into the snowbank. Just hold W: the tunnel skips the hairpin.',
    defaultSeed: 1,
    setup: (seed) => {
      const { tunnel, hairpin } = FROSTPEAK_PASS;
      const t = FROSTPEAK_PASS.tAt((tunnel.x0 + tunnel.x1) / 2, hairpin.z - hairpin.radius);
      const state = kartAt(seed, t, {
        lateral: 3,
        speed: TOP_SPEED * 0.6,
        boost: tuning.mushroomSeconds,
        // Facing south (the leg runs east here, so south is a right turn).
        headingOffset: -Math.PI / 2,
      });
      return { state };
    },
  },
];

export default scenarios;
