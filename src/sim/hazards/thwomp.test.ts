// Thwomps on mesh tracks (MK-124): a `periodic` hazard on an MK8 course, on the synthetic
// `mk8-test-thwomp` (the test ramp with one Thwomp over straight E; no pack needed).
import { beforeAll, describe, expect, it } from 'vitest';
import { registerTestRamp } from '../../mk8/content/courses/test-ramp/register';
import {
  TEST_THWOMP,
  TEST_THWOMP_ID,
  testThwompTrack,
} from '../../mk8/content/courses/test-ramp/thwomp';
import { meshCrusherSpeedLimit } from '../ai/hazards';
import { headingOf, scale } from '../math';
import { routeGeometry } from '../route';
import { createSimState } from '../state';
import { step } from '../step';
import { DT, tuning } from '../tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from '../types';
import { hazardPose, HAZARD_HITTER, trackHazards, updateHazards } from '.';

beforeAll(registerTestRamp);

/** One kart on the test Thwomp track at `x` on straight E (z = 0), facing +X at `speed`. */
function kartOnE(x: number, speed = 0, y = 0): SimState {
  const state = createSimState({
    seed: 1,
    trackId: TEST_THWOMP_ID,
    engineClass: 150,
    itemsOn: false,
    karts: [{ position: { x, y, z: 0 }, heading: -Math.PI / 2, speed }],
  });
  const [kart] = state.karts;
  if (kart) kart.velocity = { x: speed, y: 0, z: 0 };
  return state;
}

/** Steps until kart 0 is crushed (or `limit` ticks): the state and events of that tick. */
function untilCrushed(start: SimState, input: InputFrame = NEUTRAL_INPUT, limit = 600) {
  let state = start;
  for (let i = 0; i < limit; i += 1) {
    const result = step(state, [input]);
    state = result.state;
    const hit = result.events.find(
      (e): e is Extract<SimEvent, { type: 'kartHit' }> =>
        e.type === 'kartHit' && e.by === HAZARD_HITTER,
    );
    if (hit) return { state, hit };
  }
  return { state, hit: undefined };
}

describe('Thwomps on mesh tracks (MK-124)', () => {
  it('are the track’s hazards, posed the same at the same tick however often asked', () => {
    const track = testThwompTrack();
    expect(trackHazards(track)).toEqual([TEST_THWOMP]);
    for (const tick of [0, 59, 108.5, 1234, 99_999]) {
      const poses = [0, 1, 2].map(() => hazardPose(TEST_THWOMP, tick));
      expect(poses[1]).toEqual(poses[0]);
      expect(poses[2]).toEqual(poses[0]);
    }
    // Up at first, down later in its period: it moves.
    expect(hazardPose(TEST_THWOMP, 0).amount).toBe(0);
    expect(hazardPose(TEST_THWOMP, (TEST_THWOMP.period * 0.85) / DT).amount).toBe(1);
  });

  it('squashes a kart under it as it lands: stopped and flat for tuning.mk8.squashTime', () => {
    const { state, hit } = untilCrushed(kartOnE(TEST_THWOMP.centre.x));
    expect(hit?.kind).toBe('hazard');
    const kart = state.karts[0]!;
    expect(kart.squashTimer).toBe(tuning.mk8.squashTime);
    // Out of control as long (its spin-out timer already counted this tick down).
    expect(kart.spinTimer).toBeCloseTo(tuning.mk8.squashTime, 1);
    expect(kart.speed).toBe(0);
    // Flat, and going nowhere with the throttle down, until it's over.
    let after = state;
    const throttle = { ...NEUTRAL_INPUT, throttle: 1 };
    const ticks = Math.round(tuning.mk8.squashTime / DT);
    for (let i = 0; i < ticks - 2; i += 1) after = step(after, [throttle]).state;
    expect(after.karts[0]!.squashTimer).toBeGreaterThan(0);
    expect(Math.abs(after.karts[0]!.position.x - kart.position.x)).toBeLessThan(0.01);
    for (let i = 0; i < 4; i += 1) after = step(after, [throttle]).state;
    expect(after.karts[0]!.squashTimer).toBeUndefined();
    for (let i = 0; i < 30; i += 1) after = step(after, [throttle]).state;
    expect(after.karts[0]!.speed).toBeGreaterThan(1);
  });

  it('can be driven out from under in time', () => {
    const { hit } = untilCrushed(
      kartOnE(TEST_THWOMP.centre.x),
      {
        ...NEUTRAL_INPUT,
        throttle: 1,
      },
      300,
    );
    expect(hit).toBeUndefined();
  });

  it('can’t reach a kart well below it (a road under it) or well above it', () => {
    const tick = Math.round((TEST_THWOMP.period * 0.85) / DT);
    for (const y of [-5, 5]) {
      const state = kartOnE(TEST_THWOMP.centre.x, 0, y);
      state.tick = tick;
      const events: SimEvent[] = [];
      updateHazards(state, trackHazards(testThwompTrack()), events, undefined, true);
      expect(events).toEqual([]);
    }
  });
});

describe('AI Thwomp timing on mesh tracks (MK-124)', () => {
  const track = testThwompTrack();
  const geometry = routeGeometry(track.route);
  /** A kart on the route `metres` before the Thwomp, at `speed`. */
  const kartBefore = (metres: number, speed: number) => {
    const s = geometry.project(TEST_THWOMP.centre).s - metres;
    const frame = geometry.frameAt(s / geometry.length);
    const state = createSimState({
      seed: 1,
      trackId: TEST_THWOMP_ID,
      engineClass: 150,
      itemsOn: false,
      karts: [
        {
          position: frame.position,
          heading: headingOf(frame.tangent, 0),
          up: frame.up,
          speed,
        },
      ],
    });
    const kart = state.karts[0]!;
    kart.velocity = scale(frame.tangent, speed);
    return kart;
  };
  /** Whether the Thwomp is down or moving at any tick in `from`..`to`. */
  const busy = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => hazardPose(TEST_THWOMP, from + i).amount).some(
      (a) => a > 0,
    );

  it('slows to arrive as it rises when it would be down on arrival', () => {
    const speed = 20;
    // Arriving 1.8 s from tick 0 at 20 m/s: just as it starts to drop.
    const kart = kartBefore(36 + 4, speed);
    expect(busy(Math.round(1.8 / DT), Math.round(2.1 / DT))).toBe(true);
    const limit = meshCrusherSpeedLimit(kart, 0, track);
    expect(limit).toBeLessThan(speed * 0.8);
    expect(limit).toBeGreaterThan(0);
  });

  it('carries on when it stays up while the kart passes; nothing to time on a track without', () => {
    expect(meshCrusherSpeedLimit(kartBefore(15, 20), 0, track)).toBe(Infinity);
    expect(meshCrusherSpeedLimit(kartBefore(40, 20), 0, { ...track, hazards: [] })).toBe(Infinity);
  });

  it('is deterministic: a pure function of the kart, the tick and the track', () => {
    const kart = kartBefore(30, 20);
    const results = [0, 1, 2].map(() => meshCrusherSpeedLimit(kart, 1234, track));
    expect(new Set(results).size).toBe(1);
  });
});
