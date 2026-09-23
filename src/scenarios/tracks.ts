import { createSimState } from '../sim/state';
import { getTrack, trackGeometry } from '../sim/track';
import { SUNNY_INFIELD, sunnyCircuit } from '../sim/data/tracks/sunnyCircuit';
import type { SplineTrackDef } from '../sim/splineTrack';
import { tuning } from '../sim/tuning';
import type { Scenario } from './registry';

/** A kart on `trackId` at lap fraction `t` and lateral offset, facing along the track. */
export function kartOnTrack(
  seed: number,
  trackId: string,
  t: number,
  { lateral = 0, speed = 0, headingOffset = 0, boost = 0 } = {},
) {
  const geometry = trackGeometry(getTrack(trackId) as SplineTrackDef);
  const state = createSimState({
    seed,
    trackId,
    karts: [
      {
        position: geometry.pointAt(t, lateral),
        heading: geometry.headingAt(t) + headingOffset,
        speed,
      },
    ],
  });
  const [kart] = state.karts;
  if (kart) kart.boostTimer = boost;
  return state;
}

const sunny = trackGeometry(sunnyCircuit);
const SUNNY_TOP_SPEED = tuning.topSpeed[100];

/** Lap fraction `metres` before (negative) or after `t` on Sunny Circuit. */
const sunnyT = (t: number, metres: number) => t + metres / sunny.length;

/** Sunny Circuit, pole position on the grid. */
export function sunnyStart(seed: number) {
  const pole = sunnyCircuit.gridSlots?.[0] ?? { t: 0.99, lateral: 0 };
  return kartOnTrack(seed, 'sunny-circuit', pole.t, { lateral: pole.lateral });
}

export const trackScenarios: Scenario[] = [
  {
    name: 'oval-start',
    group: 'Tracks',
    description:
      'Test oval (MK-9): kart on the start line. Two straights, two bends, a small hill.',
    defaultSeed: 1,
    setup: (seed) => ({ state: kartOnTrack(seed, 'test-oval', 0.005) }),
  },
  {
    name: 'oval-overview',
    group: 'Tracks',
    description: 'Top-down view of the whole test oval.',
    defaultSeed: 1,
    setup: (seed) => ({ state: kartOnTrack(seed, 'test-oval', 0.005), view: 'overview' }),
  },
  {
    name: 'oval-wall',
    group: 'Tracks',
    description: 'Kart heading into the outer wall at 45° and 20 m/s on the main straight.',
    defaultSeed: 1,
    setup: (seed) => ({
      state: kartOnTrack(seed, 'test-oval', 0.05, {
        lateral: 5,
        speed: 20,
        headingOffset: -Math.PI / 4,
      }),
    }),
  },
  {
    name: 'sunny-start',
    group: 'Sunny Circuit',
    description:
      'Sunny Circuit (MK-10), pole position on the grid. Free drive — the default when no scenario is given.',
    defaultSeed: 1,
    setup: (seed) => ({ state: sunnyStart(seed) }),
  },
  {
    name: 'sunny-overview',
    group: 'Sunny Circuit',
    description: 'Top-down view of the whole of Sunny Circuit.',
    defaultSeed: 1,
    setup: (seed) => ({ state: sunnyStart(seed), view: 'overview' }),
  },
  {
    name: 'sunny-jump',
    group: 'Sunny Circuit',
    description:
      'Full speed, 50 m before the jump. Tap drift in the air for a trick boost on landing.',
    defaultSeed: 1,
    setup: (seed) => ({
      state: kartOnTrack(seed, 'sunny-circuit', sunnyT(sunnyCircuit.ramps?.[0]?.to ?? 0.7, -50), {
        speed: SUNNY_TOP_SPEED,
      }),
    }),
  },
  {
    name: 'sunny-shortcut',
    group: 'Sunny Circuit',
    description:
      'At the infield shortcut with a boost active, pointing across the grass. Just hold W.',
    defaultSeed: 1,
    setup: (seed) => {
      const state = createSimState({
        seed,
        trackId: 'sunny-circuit',
        karts: [
          {
            position: { x: SUNNY_INFIELD.x, y: 0, z: SUNNY_INFIELD.z - SUNNY_INFIELD.radius - 6 },
            // Facing south (+Z), straight across the infield.
            heading: Math.PI,
            speed: SUNNY_TOP_SPEED,
          },
        ],
      });
      const [kart] = state.karts;
      if (kart) kart.boostTimer = 1.5;
      return { state };
    },
  },
  {
    name: 'sunny-boost-pad',
    group: 'Sunny Circuit',
    description: 'On the main straight, 30 m before the first boost pad.',
    defaultSeed: 1,
    setup: (seed) => ({
      state: kartOnTrack(
        seed,
        'sunny-circuit',
        sunnyT(sunnyCircuit.surfaceZones[0]?.from ?? 0.1, -30),
        {
          speed: 20,
        },
      ),
    }),
  },
];
