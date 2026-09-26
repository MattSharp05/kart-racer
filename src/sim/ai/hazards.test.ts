import { describe, expect, it } from 'vitest';
import {
  NEON_HARBOUR,
  TRAFFIC_LANES,
  TRAFFIC_MOVERS,
  neonHarbour,
} from '../../content/tracks/neon-harbour/sim';
import { CRUSHERS_START_TICK } from '../../content/tracks/cog-works/scenarios';
import { COG_WORKS, PISTONS, cogWorks } from '../../content/tracks/cog-works/sim';
import { sunnyCircuit } from '../../content/tracks/sunny-circuit/sim';
import { kartOnTrack } from '../../scenarios/tracks';
import { hazardPose } from '../hazards';
import { trackGeometry } from '../track';
import { DT, tuning } from '../tuning';
import { crusherSpeedLimit, hazardDodgeOffset } from './hazards';

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

describe('AI crusher timing (MK-62)', () => {
  const works = trackGeometry(cogWorks);
  const top = tuning.topSpeed[150];
  /** A kart at top speed `metres` before the first piston, in the middle of the gauntlet. */
  const kartBefore = (metres: number, speed = top) =>
    kartOnTrack(
      1,
      'cog-works',
      COG_WORKS.tAt(COG_WORKS.pistonX[0], COG_WORKS.gauntletZ) - metres / COG_WORKS.length,
      { speed },
    ).karts[0]!;
  /** Whether the first piston is down or moving at any tick in `from`..`to`. */
  const busy = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => hazardPose(PISTONS[0]!, from + i).amount).some(
      (a) => a > 0,
    );

  it('does nothing on a track without crushers', () => {
    const kart = kartOnTrack(1, 'sunny-circuit', 0.1, { speed: 20 }).karts[0]!;
    expect(crusherSpeedLimit(kart, 0, trackGeometry(sunnyCircuit))).toBe(Infinity);
  });

  it('slows to arrive as the piston opens when it would be down on arrival', () => {
    const kart = kartBefore(43);
    // At top speed it would reach the piston while it's coming down (the scenario's timing).
    const arrive = CRUSHERS_START_TICK + Math.round((43 - 5) / top / DT);
    expect(busy(arrive - 10, arrive + 10)).toBe(true);
    const limit = crusherSpeedLimit(kart, CRUSHERS_START_TICK, works);
    expect(limit).toBeLessThan(top * 0.8);
    expect(limit).toBeGreaterThan(0);
  });

  it('carries on when the piston stays open while it passes, or once it is under it', () => {
    // A tick at which the first piston stays open for the whole crossing at top speed.
    let tick = 0;
    const crossing = (t: number) => [t + Math.round(38 / top / DT), t + Math.round(48 / top / DT)];
    while (busy(crossing(tick)[0]! - 6, crossing(tick)[1]! + 6)) tick += 1;
    expect(crusherSpeedLimit(kartBefore(43), tick, works)).toBe(Infinity);
    // Committed: at the footprint's edge, the way out is forwards.
    expect(crusherSpeedLimit(kartBefore(3), CRUSHERS_START_TICK, works)).toBe(Infinity);
  });

  it('is deterministic: a pure function of the kart, the tick and the track', () => {
    const kart = kartBefore(30, 20);
    const results = [0, 1, 2].map(() => crusherSpeedLimit(kart, 1234, works));
    expect(new Set(results).size).toBe(1);
  });
});
