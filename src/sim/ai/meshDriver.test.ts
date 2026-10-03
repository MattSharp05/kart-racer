// The AI driver on mesh tracks (MK-105), on the synthetic test ramp.
import { beforeAll, describe, expect, it } from 'vitest';
import { testRampTrack, TEST_RAMP_LAYOUT as L } from '../../mk8/content/courses/test-ramp';
import { tOnA, tOnC } from '../../mk8/content/courses/test-ramp/layout';
import { registerTestRamp } from '../../mk8/content/courses/test-ramp/register';
import { headingOf } from '../math';
import { routeGeometry, type RouteDef } from '../route';
import { createSimState } from '../state';
import { DT, tuning } from '../tuning';
import type { AiState, KartState } from '../types';
import { maxTurnAhead, meshAiInput, meshAutopilotInput } from './meshDriver';

beforeAll(registerTestRamp);

const track = () => testRampTrack();
const ai = (): AiState => ({
  lineOffset: 0,
  skill: 1,
  aggression: 0,
  stuckTime: 0,
  recoverTime: 0,
});

/** A kart on the ramp's route at lap fraction `t`, facing along it, at `speed`. */
function kartAt(t: number, speed = 0, lateral = 0): KartState {
  const frame = routeGeometry(track().route).frameAt(t, lateral);
  const state = createSimState({
    seed: 1,
    trackId: track().id,
    karts: [
      { position: frame.position, heading: headingOf(frame.tangent, 0), up: frame.up, speed },
    ],
  });
  const kart = state.karts[0] as KartState;
  kart.race.lastT = t;
  return kart;
}

describe('mesh AI driver (MK-105)', () => {
  it('measures corners as turning about the road’s up: none on a straight, 1/R round a turn', () => {
    const geometry = routeGeometry(track().route);
    const s = (t: number) => t * geometry.length;
    expect(maxTurnAhead(geometry, s(tOnA(20)), 30)).toBeLessThan(0.002);
    expect(maxTurnAhead(geometry, s(tOnC(140)) - 60, 40)).toBeCloseTo(1 / L.turnRadius, 2);
  });

  it('a road bending up a wall is no corner', () => {
    const p = (x: number, y: number, up: { x: number; y: number; z: number }) => ({
      x,
      y,
      z: 0,
      up,
      width: 10,
    });
    const level = { x: 0, y: 1, z: 0 };
    const wall = { x: -1, y: 0, z: 0 };
    const route: RouteDef = {
      // Along +X, curving up a wall at x = 40, over the top and back down a parallel road.
      points: [
        p(0, 0, level),
        p(20, 0, level),
        p(34, 2, { x: -0.6, y: 0.8, z: 0 }),
        p(40, 12, wall),
        p(40, 30, wall),
        p(30, 40, { x: 0, y: -1, z: 0 }),
        p(0, 40, { x: 0, y: -1, z: 0 }),
        p(-20, 20, { x: 1, y: 0, z: 0 }),
      ],
      checkpoints: [0],
      respawnPoints: [],
      gridSlots: [],
      itemBoxRows: [],
      coinLines: [],
      zones: [],
    };
    const geometry = routeGeometry(route);
    expect(maxTurnAhead(geometry, 10, 40)).toBeLessThan(0.01);
  });

  it('follows the racing line: steers towards its offset', () => {
    const geometry = routeGeometry(track().route);
    expect(geometry.racingLineAt(0)).toBe(0);
    const right = meshAiInput(kartAt(tOnA(20), 20), { ...ai(), lineOffset: 5 }, track(), 150, true);
    const left = meshAiInput(kartAt(tOnA(20), 20), { ...ai(), lineOffset: -5 }, track(), 150, true);
    expect(right.steer).toBeGreaterThan(0);
    expect(left.steer).toBeLessThan(0);
    expect(right.throttle).toBe(1);
  });

  it('lifts for the turn ahead at speed', () => {
    const fast = meshAiInput(kartAt(tOnA(150), 27), ai(), track(), 150, true);
    expect(fast.throttle).toBe(0);
  });

  it('on a glider, holds the throttle (a dive) instead of braking for the turn ahead (MK-106)', () => {
    const kart = kartAt(tOnA(150), 27);
    kart.grounded = false;
    kart.glide = { time: 0.5, pitch: 0 };
    const input = meshAiInput(kart, ai(), track(), 150, true);
    expect(input.throttle).toBe(1);
    expect(input.brake).toBe(0);
  });

  it('backs out when stuck, and asks to be put back when that doesn’t free it', () => {
    const kart = kartAt(tOnA(20));
    const driver = ai();
    const inputs = Array.from({ length: Math.ceil(tuning.meshAi.respawnAfter / DT) + 2 }, () =>
      meshAiInput(kart, driver, track(), 150, true),
    );
    expect(inputs.some((i) => i.brake === 1)).toBe(true);
    expect(inputs.some((i) => i.respawn === true)).toBe(true);
  });

  it('the autopilot backs out too when given its stuck counters', () => {
    const kart = kartAt(tOnA(20));
    const stuck = { stuckTime: 0, recoverTime: 0 };
    const ticks = Math.ceil(tuning.ai.stuckSeconds / DT) + 2;
    const inputs = Array.from({ length: ticks }, () =>
      meshAutopilotInput(kart, track(), 150, 1, stuck),
    );
    expect(inputs.at(-1)?.brake).toBe(1);
    expect(meshAutopilotInput(kart, track(), 150).brake).toBe(0);
  });
});
