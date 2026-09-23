import { createSimState } from '../sim/state';
import { getTrack, trackGeometry } from '../sim/track';
import { SUNNY_INFIELD, sunnyCircuit } from '../sim/data/tracks/sunnyCircuit';
import type { SplineTrackDef } from '../sim/splineTrack';
import { nextEntityId } from '../sim/items/banana';
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
  {
    name: 'sunny-last-checkpoint',
    group: 'Race',
    description:
      'Lap 1 with every checkpoint passed, 30 m before the line. Drive over it for lap 2.',
    defaultSeed: 1,
    setup: (seed) => {
      const state = kartOnTrack(seed, 'sunny-circuit', sunnyT(0, -30), { speed: 20 });
      const [kart] = state.karts;
      if (kart) kart.race = { ...kart.race, lap: 1, nextCheckpoint: 0 };
      return { state };
    },
  },
  {
    name: 'sunny-wrong-way',
    group: 'Race',
    description: 'Driving backwards down the main straight — "wrong way" shows after 1.5 s.',
    defaultSeed: 1,
    setup: (seed) => ({
      state: kartOnTrack(seed, 'sunny-circuit', 0.05, { speed: 15, headingOffset: Math.PI }),
    }),
  },
  {
    name: 'sunny-positions',
    group: 'Race',
    description:
      '8 parked karts spread round Sunny Circuit, different laps — for checking race order.',
    defaultSeed: 1,
    setup: (seed) => {
      const spots = [0.1, 0.3, 0.5, 0.7, 0.2, 0.4, 0.6, 0.8];
      const state = createSimState({
        seed,
        trackId: 'sunny-circuit',
        karts: spots.map((t, i) => ({
          kartType: (['maple', 'pixie', 'boulder', 'swoop'] as const)[i % 4],
          position: sunny.pointAt(t, i % 2 ? 3 : -3),
          heading: sunny.headingAt(t),
        })),
      });
      state.karts.forEach((kart, i) => {
        // First four on lap 2, the rest on lap 1.
        kart.race = { ...kart.race, lap: i < 4 ? 2 : 1, nextCheckpoint: 1, lastT: spots[i] ?? 0 };
      });
      return { state };
    },
  },
  {
    name: 'sunny-fall-off',
    group: 'Race',
    description:
      'Kart airborne beyond the edge by the jump — it falls and the pickup drone puts it back.',
    defaultSeed: 1,
    setup: (seed) => {
      const t = sunnyCircuit.ramps?.[0]?.to ?? 0.7;
      const state = kartOnTrack(seed, 'sunny-circuit', t);
      const [kart] = state.karts;
      if (kart) {
        // Put it 4 m up, well outside the right-hand wall, drifting further out.
        const outside = sunny.pointAt(t, sunny.wallOffset(16) + 6);
        kart.lastSafeT = t;
        kart.position = { ...outside, y: outside.y + 4 };
        kart.velocity = { x: 0, y: 0, z: 0 };
        kart.grounded = false;
      }
      return { state };
    },
  },
  {
    name: 'item-box-ahead',
    group: 'Items',
    description:
      'On the main straight, 40 m before the first row of item boxes. Drive through one.',
    defaultSeed: 1,
    setup: (seed) => {
      const row = sunnyCircuit.itemBoxRows?.[0]?.t ?? 0.08;
      return { state: kartOnTrack(seed, 'sunny-circuit', sunnyT(row, -40), { speed: 20 }) };
    },
  },
  {
    name: 'item-roulette',
    group: 'Items',
    description:
      'Item roulette mid-spin (use with &paused=1 to see it; unpaused it lands in 0.7 s).',
    defaultSeed: 1,
    setup: (seed) => {
      const state = sunnyStart(seed);
      const [kart] = state.karts;
      if (kart) kart.item.roulette = 0.7;
      return { state };
    },
  },
  {
    name: 'banana-ahead',
    group: 'Items',
    description: 'A banana 20 m ahead on the main straight. Drive into it to spin out.',
    defaultSeed: 1,
    setup: (seed) => {
      const t = sunnyT(0.02, 0);
      const state = kartOnTrack(seed, 'sunny-circuit', t, { speed: 15 });
      const position = sunny.pointAt(sunnyT(t, 20), 0);
      state.entities.push({
        id: nextEntityId(state),
        kind: 'banana',
        position,
        from: position,
        flightTimer: 0,
        ownerId: -1,
        ownerImmune: 0,
      });
      return { state };
    },
  },
  {
    name: 'banana-drop',
    group: 'Items',
    description:
      'Holding a banana with a kart close behind. Press E without accelerating to drop it on them.',
    defaultSeed: 1,
    setup: (seed) => {
      const t = sunnyT(0.02, 0);
      const state = createSimState({
        seed,
        trackId: 'sunny-circuit',
        karts: [
          { position: sunny.pointAt(t, 0), heading: sunny.headingAt(t), speed: 10 },
          {
            position: sunny.pointAt(sunnyT(t, -7), 0),
            heading: sunny.headingAt(t),
            speed: 12,
            kartType: 'swoop',
          },
        ],
      });
      const [kart] = state.karts;
      if (kart) kart.item.held = 'banana';
      return { state };
    },
  },
];
