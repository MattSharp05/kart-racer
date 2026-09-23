import { createSimState } from '../sim/state';
import { getTrack, trackGeometry } from '../sim/track';
import type { SplineTrackDef } from '../sim/splineTrack';
import type { Scenario } from './registry';

/** A kart on `trackId` at lap fraction `t` and lateral offset, facing along the track. */
export function kartOnTrack(
  seed: number,
  trackId: string,
  t: number,
  { lateral = 0, speed = 0, headingOffset = 0 } = {},
) {
  const geometry = trackGeometry(getTrack(trackId) as SplineTrackDef);
  return createSimState({
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
];
