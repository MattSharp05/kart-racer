import { afterEach, describe, expect, it } from 'vitest';
import { createRace } from '../sim/race/createRace';
import { DT, tuning } from '../sim/tuning';
import type { SimState } from '../sim/types';
import {
  CorrectionSmoother,
  NetSmoother,
  SnapshotInterpolator,
  wrapAngle,
  type KartPose,
} from './smoothing';
import { onlineRacers } from './testRace';

const FRAME = 1 / 60;
const defaults = { ...tuning.net };

afterEach(() => Object.assign(tuning.net, defaults));

function pose(x = 0, z = 0, heading = 0): KartPose {
  return { x, y: 0, z, heading };
}

function drawn(smoother: CorrectionSmoother, kartId: number, tick = 100, alpha = 1): KartPose {
  const p = pose();
  smoother.adjust(kartId, p, tick, alpha);
  return p;
}

describe('CorrectionSmoother', () => {
  it('shows the kart where it was, then blends the offset to under 1 cm within the smoothing time', () => {
    const smoother = new CorrectionSmoother();
    smoother.correct([{ kartId: 2, dx: 2.5, dy: 0.2, dz: -1, dHeading: 0.3 }], 100);
    expect(drawn(smoother, 2)).toEqual({ x: 2.5, y: 0.2, z: -1, heading: 0.3 });
    // Other karts aren't touched.
    expect(drawn(smoother, 1)).toEqual(pose());

    let elapsed = 0;
    let last = smoother.offsetSize(2);
    while (elapsed + FRAME <= tuning.net.smoothingSeconds + 1e-9) {
      smoother.frame(FRAME);
      elapsed += FRAME;
      const size = smoother.offsetSize(2);
      expect(size).toBeLessThan(last); // shrinks every frame, never overshoots
      last = size;
    }
    expect(elapsed).toBeCloseTo(tuning.net.smoothingSeconds, 5);
    expect(smoother.offsetSize(2)).toBeLessThan(0.01);
    smoother.frame(FRAME);
    expect(drawn(smoother, 2)).toEqual(pose());
  });

  it('follows the smoothing time from tuning', () => {
    tuning.net.smoothingSeconds = 0.3;
    const smoother = new CorrectionSmoother();
    smoother.correct([{ kartId: 0, dx: 1, dy: 0, dz: 0, dHeading: 0 }], 10);
    smoother.frame(0.15);
    expect(smoother.offsetSize(0)).toBeCloseTo(0.5, 5);
    smoother.frame(0.15);
    expect(smoother.offsetSize(0)).toBe(0);
  });

  it('snaps corrections above the snap threshold (respawns, unforeseen hits)', () => {
    const smoother = new CorrectionSmoother();
    smoother.correct([{ kartId: 0, dx: 3.2, dy: 0, dz: 0, dHeading: 0 }], 10);
    expect(smoother.offsetSize(0)).toBe(0);
    // Just under the threshold blends.
    smoother.correct([{ kartId: 0, dx: 2.9, dy: 0, dz: 0, dHeading: 0 }], 10);
    expect(smoother.offsetSize(0)).toBeCloseTo(2.9);
    // A big one clears what was still being blended, too.
    smoother.correct([{ kartId: 0, dx: 0, dy: 0, dz: 5, dHeading: 0 }], 11);
    expect(drawn(smoother, 0, 11)).toEqual(pose());
    // …and so does an offset that adds up past it.
    smoother.correct([{ kartId: 1, dx: 2, dy: 0, dz: 0, dHeading: 0 }], 12);
    smoother.correct([{ kartId: 1, dx: 2, dy: 0, dz: 0, dHeading: 0 }], 13);
    expect(smoother.offsetSize(1)).toBe(0);
  });

  it('weighs a correction by alpha during the tick it arrives with', () => {
    // Drawn between tick 99 (before the correction) and tick 100 (after): at alpha 0 the pose is
    // still the old prediction, so none of the new offset applies yet.
    const smoother = new CorrectionSmoother();
    smoother.correct([{ kartId: 0, dx: 1, dy: 0, dz: 0, dHeading: 0 }], 100);
    expect(drawn(smoother, 0, 100, 0).x).toBeCloseTo(0);
    expect(drawn(smoother, 0, 100, 0.25).x).toBeCloseTo(0.25);
    expect(drawn(smoother, 0, 100, 1).x).toBeCloseTo(1);
    // From the next tick on it all applies (and a new correction only weighs its own part).
    smoother.correct([{ kartId: 0, dx: 0.5, dy: 0, dz: 0, dHeading: 0 }], 101);
    expect(drawn(smoother, 0, 101, 0).x).toBeCloseTo(1);
    expect(drawn(smoother, 0, 101, 0.5).x).toBeCloseTo(1.25);
  });

  it('adds up corrections and wraps heading offsets', () => {
    const smoother = new CorrectionSmoother();
    smoother.correct([{ kartId: 0, dx: 0.3, dy: 0, dz: 0, dHeading: 3 }], 10);
    smoother.correct([{ kartId: 0, dx: 0.3, dy: 0, dz: 0, dHeading: 0.5 }], 11);
    const p = drawn(smoother, 0, 12);
    expect(p.x).toBeCloseTo(0.6);
    expect(p.heading).toBeCloseTo(3.5 - Math.PI * 2);
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2);
  });
});

/** A race whose kart 1 sits at x = `x` (other fields as created). */
function stateAt(race: SimState, tick: number, x: number, heading = 0): SimState {
  const state = structuredClone(race);
  state.tick = tick;
  const kart = state.karts[1]!;
  kart.position = { ...kart.position, x };
  kart.heading = heading;
  return state;
}

describe('SnapshotInterpolator', () => {
  const race = createRace({
    trackId: 'sunny-circuit',
    racers: onlineRacers(2),
    engineClass: 100,
    itemsOn: false,
    seed: 1,
  });

  it('interpolates between the snapshots around a tick and holds at the ends', () => {
    const interpolator = new SnapshotInterpolator();
    const out = pose();
    expect(interpolator.sample(1, 10, out)).toBe(false);
    interpolator.push(stateAt(race, 30, 0, 0));
    interpolator.push(stateAt(race, 33, 3, 0.3));
    interpolator.push(stateAt(race, 36, 9, -0.3));
    interpolator.push(stateAt(race, 33, 100)); // late and out of order: ignored
    expect(interpolator.newestTick).toBe(36);

    interpolator.sample(1, 31.5, out);
    expect(out.x).toBeCloseTo(1.5);
    expect(out.heading).toBeCloseTo(0.15);
    interpolator.sample(1, 34, out);
    expect(out.x).toBeCloseTo(5);
    expect(out.heading).toBeCloseTo(0.1);
    interpolator.sample(1, 20, out);
    expect(out.x).toBeCloseTo(0);
    interpolator.sample(1, 50, out);
    expect(out.x).toBeCloseTo(9);
    expect(interpolator.sample(12, 34, out)).toBe(false); // no such kart
  });

  it('NetSmoother draws remote humans from snapshots in interpolate mode, the rest predicted', () => {
    const source = { kartId: 0, leadTicks: () => 12 };
    const smoother = new NetSmoother(source);
    smoother.remoteKarts = new Set([1]);
    for (let tick = 0; tick <= 60; tick += 3) smoother.snapshots.push(stateAt(race, tick, tick));
    smoother.corrections.correct([{ kartId: 1, dx: 0.4, dy: 0, dz: 0, dHeading: 0 }], 70);

    // Predict (default): the prediction plus the correction offset.
    const predicted = pose(70);
    smoother.adjust(1, predicted, 70, 1);
    expect(predicted.x).toBeCloseTo(70.4);

    tuning.net.remoteKarts = 'interpolate';
    const delay = tuning.net.interpolationSeconds / DT; // 6 ticks
    const p = pose(70);
    smoother.frame(FRAME);
    smoother.adjust(1, p, 70, 1);
    expect(p.x).toBeCloseTo(70 - 12 - delay); // snapshot x = tick
    // The local kart and the AI stay predicted.
    const own = pose(5);
    smoother.adjust(0, own, 70, 1);
    expect(own.x).toBe(5);

    // The draw clock runs on frame time and eases (doesn't hop) when the lead changes by a tick.
    source.leadTicks = () => 13;
    smoother.frame(DT);
    const next = pose();
    smoother.adjust(1, next, 71, 1);
    expect(next.x - p.x).toBeGreaterThan(0.9);
    expect(next.x - p.x).toBeLessThan(1);
  });
});
