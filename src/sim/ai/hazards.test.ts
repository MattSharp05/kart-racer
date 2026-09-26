import { describe, expect, it } from 'vitest';
import {
  NEON_HARBOUR,
  TRAFFIC_LANES,
  TRAFFIC_MOVERS,
  neonHarbour,
} from '../../content/tracks/neon-harbour/sim';
import { sunnyCircuit } from '../../content/tracks/sunny-circuit/sim';
import { kartOnTrack } from '../../scenarios/tracks';
import { hazardPose } from '../hazards';
import { trackGeometry } from '../track';
import { tuning } from '../tuning';
import { hazardDodgeOffset } from './hazards';

const harbour = trackGeometry(neonHarbour);
const line = neonHarbour.aiLine ?? [];
/** A racing line straight down the middle (the tests offset it into a lane). */
const straight = line.map(() => 0);
const ai = { lineOffset: 0, skill: 1, aggression: 0.5, stuckTime: 0, recoverTime: 0 };
const { city } = NEON_HARBOUR;

/** A kart driving west down the city street at 150cc top speed, `lateral` m off the centreline. */
function kartInCity(x: number, lateral: number) {
  const t = NEON_HARBOUR.tAt(x, city.z);
  const kart = kartOnTrack(1, 'neon-harbour', t, { lateral, speed: tuning.topSpeed[150] })
    .karts[0]!;
  return kart;
}

/** The first tick at which `vehicle` is up on the street at world x `x`. */
function tickAt(vehicle: (typeof TRAFFIC_MOVERS)[number], x: number): number {
  for (let tick = 0; tick < 60 * 60; tick += 1) {
    const pose = hazardPose(vehicle, tick);
    if (pose.y === 0 && Math.abs(pose.x - x) < 0.2) return tick;
  }
  throw new Error('never there');
}

describe('AI hazard dodge (MK-60)', () => {
  it('does nothing on a track without movers', () => {
    const geometry = trackGeometry(sunnyCircuit);
    const kart = kartOnTrack(1, 'sunny-circuit', 0.1, { speed: 20 }).karts[0]!;
    expect(hazardDodgeOffset(kart, ai, 0, geometry, sunnyCircuit.aiLine ?? [])).toBeUndefined();
  });

  it('steers into the clear lane when a vehicle is coming down its line', () => {
    const [car] = TRAFFIC_MOVERS;
    const lane = TRAFFIC_LANES[0];
    // The car is 40 m ahead of a kart following a line through the car's lane.
    const tick = tickAt(car!, 150);
    const kart = kartInCity(190, lane);
    // A line straight down the car's lane.
    const offset = hazardDodgeOffset(kart, { ...ai, lineOffset: lane }, tick, harbour, straight);
    expect(offset).toBeDefined();
    // It aims across, away from the car's lane (lane 0 is left, negative: so it goes right).
    expect(lane + offset!).toBeGreaterThan(lane + 3);
  });

  it('leaves the line alone when nothing is coming', () => {
    const lane = TRAFFIC_LANES[0];
    const kart = kartInCity(150, lane);
    // A moment when every vehicle is gone or already behind the kart (east of it).
    let tick = 0;
    while (
      TRAFFIC_MOVERS.some((v) => {
        const pose = hazardPose(v, tick);
        return pose.amount > 0 && pose.x < kart.position.x + 5;
      })
    )
      tick += 1;
    const offset = hazardDodgeOffset(kart, { ...ai, lineOffset: lane }, tick, harbour, straight);
    expect(offset).toBeUndefined();
  });

  it('is deterministic: a pure function of the kart, the tick and the track', () => {
    const kart = kartInCity(190, TRAFFIC_LANES[0]);
    const results = [0, 1, 2].map(() => hazardDodgeOffset(kart, ai, 1234, harbour, line));
    expect(new Set(results).size).toBe(1);
  });
});
