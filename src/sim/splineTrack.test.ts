import { describe, expect, it } from 'vitest';
import { autopilotInput } from './autopilot';
import { testOval } from './data/tracks/testOval';
import { rngRange, seedRng } from './rng';
import { TrackGeometry } from './splineTrack';
import { step } from './step';
import { kartOnTrack } from '../scenarios/tracks';
import { trackGeometry } from './track';
import { DT, tuning } from './tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimState } from './types';

const geometry = trackGeometry(testOval);
const TOP = tuning.topSpeed[100];

function drive(state: SimState, ticks: number, input: (s: SimState) => Partial<InputFrame>) {
  const frames: SimState[] = [];
  let s = state;
  for (let i = 0; i < ticks; i += 1) {
    s = step(s, [{ ...NEUTRAL_INPUT, ...input(s) }]).state;
    frames.push(s);
  }
  return frames;
}

describe('track geometry', () => {
  it('round-trips project(pointAt(t, lateral)) within 1 cm for 1000 random points', () => {
    const rng = { rngState: seedRng(99) };
    for (let i = 0; i < 1000; i += 1) {
      const t = rngRange(rng, 0, 1);
      const limit = geometry.wallOffset(14) - 0.1;
      const lateral = rngRange(rng, -limit, limit);
      const p = geometry.project(geometry.pointAt(t, lateral));
      const ds = Math.abs(p.s - t * geometry.length);
      expect(Math.min(ds, geometry.length - ds)).toBeLessThan(0.01);
      expect(Math.abs(p.lateral - lateral)).toBeLessThan(0.01);
    }
  });

  it('answers a projection in under 5 µs on average', () => {
    const rng = { rngState: seedRng(5) };
    const points = Array.from({ length: 2000 }, () =>
      geometry.pointAt(rngRange(rng, 0, 1), rngRange(rng, -12, 12)),
    );
    for (const p of points) geometry.project(p); // warm up
    // Fastest of several rounds, so a busy machine (parallel test workers, CI) doesn't cause flakes.
    const rounds = Array.from({ length: 7 }, () => {
      const start = performance.now();
      for (const p of points) geometry.project(p);
      return ((performance.now() - start) * 1000) / points.length;
    });
    expect(Math.min(...rounds)).toBeLessThan(5);
  });

  it('classifies road, grass and beyond the walls', () => {
    expect(geometry.project(geometry.pointAt(0.1, 0)).surface).toBe('road');
    expect(geometry.project(geometry.pointAt(0.1, 10)).surface).toBe('offroad');
    expect(geometry.project(geometry.pointAt(0.1, -15)).surface).toBe('out');
  });

  it('follows the hill on the back straight', () => {
    const top = geometry.project(geometry.pointAt(0.62, 0)).groundY;
    expect(top).toBeGreaterThan(2);
  });

  it('the test oval is a valid track definition', () => {
    const def = testOval;
    expect(def.points.length).toBeGreaterThanOrEqual(4);
    expect(def.points.every((p) => p.width > 8)).toBe(true);
    expect(def.checkpoints[0]).toBe(0);
    expect([...def.checkpoints].sort((a, b) => a - b)).toEqual(def.checkpoints);
    // Closed loop: the last resampled point is next to the first.
    const first = geometry.sample(0);
    const last = geometry.sample(geometry.samples.length - 1);
    expect(Math.hypot(first.x - last.x, first.z - last.z)).toBeLessThan(2);
  });

  it('rejects a track with fewer than 4 points', () => {
    expect(() => new TrackGeometry({ ...testOval, points: testOval.points.slice(0, 3) })).toThrow();
  });
});

describe('driving on a spline track', () => {
  it('the autopilot completes a lap of the oval without leaving the road', () => {
    const start = kartOnTrack(1, 'test-oval', 0.005);
    let travelled = 0;
    let lastS = geometry.project(start.karts[0]!.position).s;
    const frames = drive(start, 2400, (s) => autopilotInput(s.karts[0]!, geometry));
    for (const f of frames) {
      const p = geometry.project(f.karts[0]!.position);
      expect(p.surface).toBe('road');
      let ds = p.s - lastS;
      if (ds < -geometry.length / 2) ds += geometry.length;
      travelled += ds;
      lastS = p.s;
    }
    expect(travelled).toBeGreaterThan(geometry.length);
  });

  it('top speed on grass is 55% ± 2% of road top speed', () => {
    const start = kartOnTrack(1, 'test-oval', 0.01, { lateral: 10 });
    const frames = drive(start, Math.round(5 / DT), () => ({ throttle: 1 }));
    expect(frames.at(-1)!.karts[0]!.speed / TOP).toBeCloseTo(tuning.offroadSpeed, 1);
    expect(Math.abs(frames.at(-1)!.karts[0]!.speed / TOP - 0.55)).toBeLessThanOrEqual(0.02);
  });

  it('driving onto grass at full speed slows the kart quickly', () => {
    const start = kartOnTrack(1, 'test-oval', 0.01, { lateral: 10, speed: TOP });
    const frames = drive(start, 60, () => ({ throttle: 1 }));
    expect(frames.at(-1)!.karts[0]!.speed).toBeLessThan(TOP * 0.8);
  });

  it('a 45° wall hit keeps at least half the speed and slides along the wall', () => {
    const start = kartOnTrack(1, 'test-oval', 0.05, {
      lateral: 5,
      speed: 20,
      headingOffset: -Math.PI / 4,
    });
    const frames = drive(start, 90, () => ({ throttle: 1 }));
    const speed = (f: SimState) => Math.hypot(f.karts[0]!.velocity.x, f.karts[0]!.velocity.z);
    const hit = frames.findIndex((f, i) => i > 0 && speed(f) < speed(frames[i - 1]!) - 1);
    expect(hit).toBeGreaterThan(0);
    const before = speed(frames[hit - 1]!);
    expect(speed(frames[hit]!)).toBeGreaterThanOrEqual(0.5 * before);
    // Sliding: it keeps moving along the track afterwards rather than sticking to the wall.
    expect(speed(frames[hit + 20]!)).toBeGreaterThan(0.5 * before);
  });

  it('a head-on wall hit loses at least 80% of the speed', () => {
    const start = kartOnTrack(1, 'test-oval', 0.05, {
      lateral: 5,
      speed: 20,
      headingOffset: -Math.PI / 2,
    });
    const frames = drive(start, 40, () => ({}));
    const speeds = frames.map((f) => Math.hypot(f.karts[0]!.velocity.x, f.karts[0]!.velocity.z));
    expect(Math.min(...speeds)).toBeLessThanOrEqual(0.2 * 20);
  });

  it('no footprint corner crosses a wall, from any angle', () => {
    for (let deg = -80; deg <= 80; deg += 10) {
      const start = kartOnTrack(1, 'test-oval', 0.05, {
        speed: 22,
        headingOffset: (deg * Math.PI) / 180,
      });
      const frames = drive(start, 120, () => ({ throttle: 1 }));
      for (const f of frames) {
        const p = geometry.project(f.karts[0]!.position);
        expect(Math.abs(p.lateral)).toBeLessThan(geometry.wallOffset(p.width));
      }
    }
  });
});
