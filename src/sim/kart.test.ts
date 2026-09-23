import { describe, expect, it } from 'vitest';
import { drivingScenarios } from '../scenarios/driving';
import { footprintOffsets, steeringStrength, wrapAngle } from './kart';
import { createSimState, type KartSpawn } from './state';
import { step } from './step';
import { DT, tuning, type EngineClass } from './tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimState } from './types';

const TOP_100 = tuning.topSpeed[100];

function drive(state: SimState, input: Partial<InputFrame>, ticks: number): SimState[] {
  const frames: SimState[] = [];
  let s = state;
  for (let i = 0; i < ticks; i += 1) {
    s = step(s, [{ ...NEUTRAL_INPUT, ...input }]).state;
    frames.push(s);
  }
  return frames;
}

function kartAt(spawn: KartSpawn, engineClass: EngineClass = 100): SimState {
  return createSimState({ seed: 1, engineClass, karts: [spawn] });
}

const speedOf = (s: SimState) => s.karts[0]!.speed;
const secondsToTicks = (seconds: number) => Math.round(seconds / DT);

describe('kart physics — acceleration', () => {
  it('reaches ≥ 95% of 100cc top speed in 2.5 ± 0.3 s and never exceeds it', () => {
    const frames = drive(kartAt({}), { throttle: 1 }, secondsToTicks(4));
    const firstAt95 = frames.findIndex((s) => speedOf(s) >= 0.95 * TOP_100);
    expect(firstAt95 * DT).toBeGreaterThanOrEqual(2.2);
    expect(firstAt95 * DT).toBeLessThanOrEqual(2.8);
    for (const s of frames) expect(speedOf(s)).toBeLessThanOrEqual(TOP_100 + 1e-9);
  });

  it.each([50, 100, 150] as const)('%icc top speed follows the cc table', (cc) => {
    // Start at the back of the pad so ~150 m of straight-line driving fits.
    const frames = drive(
      kartAt({ position: { x: 0, y: 0, z: 95 } }, cc),
      { throttle: 1 },
      secondsToTicks(6),
    );
    expect(speedOf(frames.at(-1)!)).toBeCloseTo(tuning.topSpeed[cc], 1);
  });
});

describe('kart physics — braking and reverse', () => {
  it('stops from top speed within 1.5 s, then reverses to at most 30% of top speed', () => {
    const frames = drive(kartAt({ speed: TOP_100 }), { brake: 1 }, secondsToTicks(8));
    const stoppedAt = frames.findIndex((s) => speedOf(s) <= 0);
    expect(stoppedAt * DT).toBeLessThanOrEqual(1.5);
    const reverseSpeeds = frames.map(speedOf).filter((v) => v < 0);
    expect(reverseSpeeds.length).toBeGreaterThan(0);
    expect(Math.min(...reverseSpeeds)).toBeGreaterThanOrEqual(-0.3 * TOP_100 - 1e-9);
  });

  it('coasts to a stop when nothing is held, without rolling backwards', () => {
    const frames = drive(kartAt({ speed: TOP_100 }), {}, secondsToTicks(10));
    expect(speedOf(frames.at(-1)!)).toBe(0);
    for (const s of frames) expect(speedOf(s)).toBeGreaterThanOrEqual(0);
  });
});

describe('kart physics — steering', () => {
  it('does not turn when stationary', () => {
    const frames = drive(kartAt({}), { steer: 1 }, 60);
    expect(frames.at(-1)!.karts[0]!.heading).toBe(0);
  });

  it('turns at least 90° in 1.5 s at mid speed with full steer', () => {
    const frames = drive(kartAt({ speed: 12 }), { throttle: 0.5, steer: 1 }, secondsToTicks(1.5));
    expect(Math.abs(frames.at(-1)!.karts[0]!.heading)).toBeGreaterThanOrEqual(Math.PI / 2);
  });

  it('steer right (+1) turns right: heading decreases and the kart drifts to +X', () => {
    const frames = drive(kartAt({ speed: 12 }), { throttle: 0.5, steer: 1 }, 30);
    const kart = frames.at(-1)!.karts[0]!;
    expect(kart.heading).toBeLessThan(0);
    expect(kart.position.x).toBeGreaterThan(0);
  });

  it('reversing inverts steering', () => {
    const frames = drive(kartAt({ speed: -6 }), { brake: 1, steer: 1 }, 30);
    expect(frames.at(-1)!.karts[0]!.heading).toBeGreaterThan(0);
  });

  it('steering strength is 0 at rest, 1 once moving, eased at top speed', () => {
    expect(steeringStrength(0, TOP_100)).toBe(0);
    expect(steeringStrength(TOP_100 * 0.5, TOP_100)).toBeLessThanOrEqual(1);
    expect(steeringStrength(TOP_100, TOP_100)).toBeCloseTo(tuning.steerAtTopSpeed);
  });

  it('wrapAngle keeps headings in (-π, π]', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2);
  });
});

/** Largest distance any footprint corner reaches past the arena boundary (≤ 0 means inside). */
function worstPenetration(state: SimState): number {
  const kart = state.karts[0]!;
  const corners = footprintOffsets(kart.heading).map((o) => ({
    x: kart.position.x + o.x,
    z: kart.position.z + o.z,
  }));
  return Math.max(...corners.flatMap((c) => [Math.abs(c.x), Math.abs(c.z)])) - 100;
}

describe('kart physics — walls', () => {
  it('no footprint corner ever passes a wall, for headings every 5° (MK-29)', () => {
    for (let degrees = 0; degrees < 360; degrees += 5) {
      const heading = wrapAngle((degrees * Math.PI) / 180);
      const frames = drive(kartAt({ heading, speed: 20 }), { throttle: 1 }, secondsToTicks(8));
      for (const s of frames) expect(worstPenetration(s)).toBeLessThanOrEqual(1e-9);
    }
  });

  it('steering along a wall never pushes a corner through it', () => {
    const scenario = drivingScenarios.find((s) => s.name === 'test-pad-wall-angled')!;
    const frames = drive(scenario.setup(1).state, { throttle: 1, steer: -1 }, secondsToTicks(4));
    for (const s of frames) expect(worstPenetration(s)).toBeLessThanOrEqual(1e-9);
  });

  it('stays inside the test pad when driven into a wall', () => {
    const scenario = drivingScenarios.find((s) => s.name === 'test-pad-wall')!;
    const frames = drive(scenario.setup(1).state, { throttle: 1 }, 120);
    for (const s of frames) expect(worstPenetration(s)).toBeLessThanOrEqual(1e-9);
  });

  it('a head-on hit stops forward motion into the wall', () => {
    const scenario = drivingScenarios.find((s) => s.name === 'test-pad-wall')!;
    const frames = drive(scenario.setup(1).state, {}, 60);
    expect(frames.at(-1)!.karts[0]!.velocity.z).toBeGreaterThanOrEqual(0);
  });

  it('a glancing hit slides along the wall and keeps most of its speed', () => {
    // Mostly moving along −X, angled 15° into the −Z wall.
    const start = kartAt({
      position: { x: 50, y: 0, z: -97 },
      heading: Math.PI / 2 - Math.PI / 12,
      speed: 20,
    });
    const frames = drive(start, { throttle: 1 }, 30);
    const kart = frames.at(-1)!.karts[0]!;
    expect(Math.hypot(kart.velocity.x, kart.velocity.z)).toBeGreaterThan(10);
  });
});
