import { KART_IDS } from '../../../sim/data/karts';
import { hazardPose } from '../../../sim/hazards';
import type { MoverHazard } from '../../../sim/hazards/types';
import { createRace, raceSetupRng, type RacerSlot } from '../../../sim/race/createRace';
import { rngInt, rngPick } from '../../../sim/rng';
import { DT, tuning } from '../../../sim/tuning';
import type { Scenario } from '../../../scenarios/registry';
import { kartOnTrack } from '../../../scenarios/tracks';
import { NEON_HARBOUR, TRAFFIC_LANES, TRAFFIC_MOVERS, neonHarbour } from './sim';

const TOP_SPEED = tuning.topSpeed[150];

/** A kart in the harbour at `t` in a 150cc session (the traffic timing assumes 150cc speeds). */
function kartAt(seed: number, t: number, options: Parameters<typeof kartOnTrack>[3] = {}) {
  const state = kartOnTrack(seed, neonHarbour.id, t, options);
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
    trackId: neonHarbour.id,
    racers,
    engineClass: 150,
    itemsOn: true,
    seed,
    rng,
  });
}

/** The first tick (within its first period) at which `vehicle` drives past world x `x`, eastwards. */
export function trafficPassTick(vehicle: MoverHazard, x: number): number {
  const period = Math.round(vehicle.period / DT);
  for (let tick = 0; tick < period; tick += 1) {
    const now = hazardPose(vehicle, tick);
    const next = hazardPose(vehicle, tick + 1);
    if (now.y > -0.5 && now.x < x && next.x >= x) return tick + 1;
  }
  throw new Error('Neon Harbour traffic never passes x');
}

/** The traffic scenario: you start at the east end of the city block, at top speed, this far east… */
export const TRAFFIC_START_X = 205;
/** …and meet the oncoming car in your lane here (world x), unless you swerve. */
export const TRAFFIC_MEET_X = 140;
/** Seconds from the start until you'd meet it, holding W. */
export const TRAFFIC_MEET_SECONDS = (TRAFFIC_START_X - TRAFFIC_MEET_X) / TOP_SPEED;

/** Neon Harbour (MK-60): registered from this folder (`src/scenarios/index.ts` finds it). */
const scenarios: Scenario[] = [
  {
    name: 'track-neon-harbour',
    group: 'Neon Harbour',
    description:
      'Neon Harbour (MK-60): a full 150cc race at night, you + 7 AI, from the countdown. The quay, a zig-zag through the container stacks, a bridge over the canal, a city block with oncoming traffic and a shortcut through the warehouse.',
    defaultSeed: 1,
    setup: (seed) => ({ state: race(seed) }),
  },
  {
    name: 'neon-harbour-traffic',
    group: 'Neon Harbour',
    description:
      'Top speed into the city block, in the left lane, with a car coming straight at you in your lane (headlights on). Hold W and it hits you; change lanes to miss it.',
    defaultSeed: 1,
    setup: (seed) => {
      const { city } = NEON_HARBOUR;
      const lane = TRAFFIC_LANES[0];
      const t = NEON_HARBOUR.tAt(TRAFFIC_START_X, city.z);
      const state = kartAt(seed, t, { lateral: lane, speed: TOP_SPEED });
      // The first vehicle in lane 0 is a car: time it to meet you at TRAFFIC_MEET_X.
      const [car] = TRAFFIC_MOVERS;
      const meet = car ? trafficPassTick(car, TRAFFIC_MEET_X) : 0;
      const period = car ? Math.round(car.period / DT) : 0;
      // A whole period in, so the tick clock never starts negative.
      state.tick = period + meet - Math.round(TRAFFIC_MEET_SECONDS / DT);
      return { state };
    },
  },
  {
    name: 'neon-harbour-warehouse',
    group: 'Neon Harbour',
    description:
      'At the start of the U-turn, level with the open warehouse doors, with a mushroom boost on and facing in. Just hold W: the warehouse cuts the U-turn.',
    defaultSeed: 1,
    setup: (seed) => {
      const { uturn, warehouse } = NEON_HARBOUR;
      const t = NEON_HARBOUR.tAt(uturn.x + uturn.radius, (warehouse.cutZ0 + warehouse.cutZ1) / 2);
      const state = kartAt(seed, t, {
        lateral: 3,
        speed: TOP_SPEED * 0.6,
        boost: tuning.mushroomSeconds,
        // Facing west (the leg runs south here, so west is a right turn).
        headingOffset: -Math.PI / 2,
      });
      return { state };
    },
  },
];

export default scenarios;
