import { KART_IDS } from '../../../sim/data/karts';
import { createRace, raceSetupRng, type RacerSlot } from '../../../sim/race/createRace';
import { rngInt, rngPick } from '../../../sim/rng';
import { tuning } from '../../../sim/tuning';
import type { Scenario } from '../../../scenarios/registry';
import { kartOnTrack, shellShot } from '../../../scenarios/tracks';
import { hazardPose } from '../../../sim/hazards';
import { nearestOnRoute, pointOnRoute, routeInfos } from '../../../sim/routes';
import { createSimState } from '../../../sim/state';
import { trackGeometry } from '../../../sim/track';
import { DT } from '../../../sim/tuning';
import type { MoverHazard } from '../../../sim/hazards/types';
import type { Vec3 } from '../../../sim/math';
import {
  canopyRush,
  CANOPY_RUSH,
  ROAD_CROSSING_ANIMALS,
  ROAD_CROSSINGS,
  TRAIL_ANIMALS,
} from './sim';

const TOP_SPEED = tuning.topSpeed[150];
/** The deer crossing the south straight where the trail rejoins (MK-61 QA round 2). */
const DEER_CROSSING = ROAD_CROSSINGS.findIndex(
  (c) => c.x === CANOPY_RUSH.deer.x && c.animal === 'deer',
);
const geometry = trackGeometry(canopyRush);

/** A kart in the canopy at `t` in a 150cc session (the sway timing assumes 150cc speeds). */
function kartAt(seed: number, t: number, options: Parameters<typeof kartOnTrack>[3] = {}) {
  const state = kartOnTrack(seed, canopyRush.id, t, options);
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
  return createRace({ trackId: canopyRush.id, racers, engineClass: 150, itemsOn: true, seed, rng });
}

/** The bridge scenario starts this far before bridge 1, at top speed… */
export const BRIDGE_LEAD_METRES = 25;
/**
 * …at this tick of the sway, so that holding W without steering, the deck's push carries you over
 * its right edge in the second half of the bridge (steering against it keeps you on).
 */
export const BRIDGE_START_TICK = 90;

/** The shortcut scenario starts on the tree platform this far before the drop, facing it. */
export const SHORTCUT_LEAD_METRES = 10;

/** The animals scenario starts on the trail at top speed, this long before the tapir crosses it. */
export const ANIMALS_LEAD_SECONDS = 2.5;

/**
 * When `mover` walks across a way, and where: the tick of its cycle when it's nearest the way's
 * centreline (`nearest` gives the distance to it and how far along it that is, m).
 */
function crossingTime(
  mover: MoverHazard,
  nearest: (pose: Vec3) => { distance: number; along: number },
) {
  let best = { tick: 0, along: 0, distance: Infinity };
  for (let tick = 0; tick < Math.round(mover.period / DT); tick += 1) {
    const pose = hazardPose(mover, tick);
    if (pose.amount === 0) continue;
    const near = nearest(pose);
    if (near.distance < best.distance) best = { tick, along: near.along, distance: near.distance };
  }
  return { ...best, period: mover.period };
}

/** A kart at top speed at `at`, facing `ahead`, with the clock `lead` s before the crossing. */
function beforeCrossing(
  seed: number,
  crossing: { tick: number; period: number },
  at: Vec3,
  ahead: Vec3,
) {
  const state = createSimState({
    seed,
    trackId: canopyRush.id,
    engineClass: 150,
    karts: [
      {
        position: at,
        heading: Math.atan2(-(ahead.x - at.x), -(ahead.z - at.z)),
        speed: TOP_SPEED,
      },
    ],
  });
  const periodTicks = Math.round(crossing.period / DT);
  const lead = Math.round(ANIMALS_LEAD_SECONDS / DT);
  state.tick = (((crossing.tick - lead) % periodTicks) + periodTicks) % periodTicks;
  return state;
}

/** On the trail at top speed, timed so that holding W you run into the tapir as it crosses. */
function tapir(seed: number) {
  const info = routeInfos(geometry)[0];
  if (!info) throw new Error('Canopy Rush: no trail');
  const mother = TRAIL_ANIMALS.find((a) => a.animal === 'tapir');
  if (!mother) throw new Error('Canopy Rush: no tapir on the trail');
  const crossing = crossingTime(mother, (pose) => nearestOnRoute(info, pose));
  const along = crossing.along - TOP_SPEED * ANIMALS_LEAD_SECONDS;
  return beforeCrossing(seed, crossing, pointOnRoute(info, along), pointOnRoute(info, along + 2));
}

/**
 * On the road at top speed, timed so that following the road without dodging you run into the
 * animal leading road crossing `index` (`ROAD_CROSSINGS`) as it crosses.
 */
export function roadCrossing(seed: number, index: number) {
  const mover = ROAD_CROSSING_ANIMALS[index]?.[0];
  if (!mover) throw new Error(`Canopy Rush: no road crossing ${index}`);
  const crossing = crossingTime(mover, (pose) => {
    const p = geometry.project(pose);
    return { distance: Math.abs(p.lateral), along: p.s };
  });
  const t = (crossing.along - TOP_SPEED * ANIMALS_LEAD_SECONDS) / geometry.length;
  return beforeCrossing(
    seed,
    crossing,
    geometry.pointAt(t),
    geometry.pointAt(t + 2 / geometry.length),
  );
}

/** The ruins shell scenario: you and the kart ahead at these points of the ruins path. */
export const RUINS_SHOT = { from: 4, to: 8 };

/** The road crossings with their own scenario (MK-61 QA round 3), by `ROAD_CROSSINGS` index. */
const CROSSING_SCENARIOS: { name: string; index: number; description: string }[] = [
  {
    name: 'canopy-animals-boar',
    index: 0,
    description:
      'At top speed out of the start, 2.5 s before a wild boar trots out of the bushes and across the start straight (MK-61 QA round 3). Drive on without dodging and you run into it and spin out; steer round it and you get by.',
  },
  {
    name: 'canopy-animals-ramp-deer',
    index: 1,
    description:
      'At top speed down the root ramp to the jungle floor, 2.5 s before a deer bounds out of the bushes, across the road and over the far hedge (MK-61 QA round 3). Drive on without dodging and it runs into you; ease off or steer round it.',
  },
  {
    name: 'canopy-animals-road-tapir',
    index: 2,
    description:
      'At top speed through the far corner, 2.5 s before a tapir and her calf walk across the south straight into the trail (MK-61 QA round 3). Follow the road without dodging and you run into the tapir and spin out; steer round them and you get by.',
  },
  {
    name: 'canopy-animals-home-boar',
    index: 4,
    description:
      'At top speed through the home corner, 2.5 s before a wild boar trots across the road behind the grid (MK-61 QA round 3). Follow the road without dodging and you run into it and spin out; steer round it and you get by.',
  },
];

/** Canopy Rush (MK-61): registered from this folder (`src/scenarios/index.ts` finds it). */
const scenarios: Scenario[] = [
  {
    name: 'track-canopy-rush',
    group: 'Canopy Rush',
    description:
      'Canopy Rush (MK-61): a full 150cc race in the jungle treetops, you + 7 AI, from the countdown. A waterfall jump, the climb to bridge 3, the spiral down the giant trunk, two more swaying rope bridges and a risky drop into the ruins below.',
    defaultSeed: 1,
    setup: (seed) => ({ state: race(seed) }),
  },
  {
    name: 'canopy-overview',
    group: 'Canopy Rush',
    description: 'Top-down view of the whole of Canopy Rush (MK-79), karts on the grid.',
    defaultSeed: 1,
    setup: (seed) => ({ state: race(seed), view: 'overview' }),
  },
  {
    name: 'canopy-bridge',
    group: 'Canopy Rush',
    description:
      'At top speed, 25 m before rope bridge 1, as it starts to sway. Hold W without steering and the deck pushes you over its edge (you are put back at the bridge start); steer against the sway to stay on.',
    defaultSeed: 1,
    setup: (seed) => {
      const { from } = CANOPY_RUSH.bridges.b1;
      const t = CANOPY_RUSH.tAt(from.x, from.z) - BRIDGE_LEAD_METRES / CANOPY_RUSH.length;
      const state = kartAt(seed, t, { speed: TOP_SPEED });
      state.tick = BRIDGE_START_TICK;
      return { state };
    },
  },
  {
    name: 'canopy-shortcut',
    group: 'Canopy Rush',
    description:
      'On the tree platform after bridge 1, turned towards the gap in its right-hand edge. Hold W: you drop into the ruins below; follow the stone path and it brings you back onto the road on the jungle floor, well ahead.',
    defaultSeed: 1,
    setup: (seed) => {
      const [, entry] = CANOPY_RUSH.ruinsPath;
      const t =
        CANOPY_RUSH.tAt(entry?.x ?? 0, entry?.z ?? 0) - SHORTCUT_LEAD_METRES / CANOPY_RUSH.length;
      // Heading south, the gap is on the right (west): turned a little that way.
      return { state: kartAt(seed, t, { speed: TOP_SPEED * 0.8, headingOffset: -0.45 }) };
    },
  },
  {
    name: 'canopy-animals',
    group: 'Canopy Rush',
    description:
      'At top speed on the animal trail below the bridges (MK-61 QA round 2), 2.5 s before a tapir and her calf walk across it. Hold W and you run into the tapir and spin out; steer round behind or in front of them and you get by.',
    defaultSeed: 1,
    setup: (seed) => ({ state: tapir(seed) }),
  },
  {
    name: 'canopy-deer',
    group: 'Canopy Rush',
    description:
      'At top speed on the jungle floor road, 2.5 s before a deer bounds out of the bushes, across the road and over the far wall (MK-61 QA round 2). Hold W and it runs into you; ease off or steer round it.',
    defaultSeed: 1,
    setup: (seed) => ({ state: roadCrossing(seed, DEER_CROSSING) }),
  },
  ...CROSSING_SCENARIOS.map(({ name, index, description }): Scenario => ({
    name,
    group: 'Canopy Rush',
    description,
    defaultSeed: 1,
    setup: (seed) => ({ state: roadCrossing(seed, index) }),
  })),
  {
    name: 'canopy-ruins-red',
    group: 'Canopy Rush',
    description:
      'Parked on the animal trail below the bridges, in 2nd, holding a red shell; the leader is parked further down the trail. Fire it (Space / the item button): it follows the trail and hits them (MK-62 QA round 2).',
    defaultSeed: 1,
    setup: (seed) => {
      const path = CANOPY_RUSH.ruinsPath;
      const from = path[RUINS_SHOT.from];
      const at = path[RUINS_SHOT.to];
      if (!from || !at) throw new Error('canopy-ruins-red: the ruins path is too short');
      return { state: shellShot(seed, canopyRush.id, from, at) };
    },
  },
];

export default scenarios;
