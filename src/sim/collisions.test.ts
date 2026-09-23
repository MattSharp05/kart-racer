import { describe, expect, it } from 'vitest';
import { drivingScenarios } from '../scenarios/driving';
import type { KartId } from './data/karts';
import { vec3 } from './math';
import { createSimState, type KartSpawn } from './state';
import { step } from './step';
import { tuning } from './tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from './types';

function run(state: SimState, ticks: number, inputs: Partial<InputFrame>[] = []) {
  const events: SimEvent[] = [];
  let s = state;
  for (let i = 0; i < ticks; i += 1) {
    const result = step(
      s,
      s.karts.map((_, k) => ({ ...NEUTRAL_INPUT, ...inputs[k] })),
    );
    s = result.state;
    events.push(...result.events);
  }
  return { state: s, events };
}

/** Smallest distance between any bump circles of two karts, minus the touching distance (≥ 0 = apart). */
function gap(state: SimState, i: number, j: number): number {
  const circlesOf = (k: SimState['karts'][number]) => {
    const fx = -Math.sin(k.heading);
    const fz = -Math.cos(k.heading);
    const o = tuning.bumpCircleOffset;
    return [
      [k.position.x + fx * o, k.position.z + fz * o],
      [k.position.x - fx * o, k.position.z - fz * o],
    ] as const;
  };
  let min = Infinity;
  for (const [ax, az] of circlesOf(state.karts[i]!)) {
    for (const [bx, bz] of circlesOf(state.karts[j]!)) {
      min = Math.min(min, Math.hypot(ax - bx, az - bz));
    }
  }
  return min - tuning.kartRadius * 2;
}

const pair = (a: KartSpawn, b: KartSpawn) => createSimState({ seed: 1, karts: [a, b] });

describe('kart-to-kart collisions', () => {
  it('equal karts meeting head-on both bounce back and end up apart', () => {
    const start = pair(
      { kartType: 'maple', position: vec3(0, 0, 10), heading: 0, speed: 12 },
      { kartType: 'maple', position: vec3(0, 0, -10), heading: Math.PI, speed: 12 },
    );
    const { state, events } = run(start, 90);
    expect(events.some((e) => e.type === 'bump')).toBe(true);
    // After the bump each kart moves back the way it came (away from the other).
    expect(state.karts[0]!.velocity.z).toBeGreaterThanOrEqual(0);
    expect(state.karts[1]!.velocity.z).toBeLessThanOrEqual(0);
    expect(gap(state, 0, 1)).toBeGreaterThanOrEqual(-1e-6);
  });

  it('in a side bump the light kart is displaced at least twice as far as the heavy one', () => {
    const sideBySide = (heavy: KartId, light: KartId) =>
      pair(
        { kartType: heavy, position: vec3(0, 0, 0), heading: 0 },
        { kartType: light, position: vec3(1.2, 0, 0), heading: 0 },
      );
    const start = sideBySide('boulder', 'pixie');
    const { state } = run(start, 1);
    const heavyMoved = Math.abs(state.karts[0]!.position.x - start.karts[0]!.position.x);
    const lightMoved = Math.abs(state.karts[1]!.position.x - start.karts[1]!.position.x);
    expect(lightMoved).toBeGreaterThanOrEqual(2 * heavyMoved);
  });

  it('8 karts spawned on top of each other are all separated within 10 ticks', () => {
    const start = createSimState({
      seed: 1,
      karts: Array.from({ length: 8 }, (_, i) => ({
        kartType: (['maple', 'pixie', 'boulder', 'swoop'] as const)[i % 4],
        position: vec3((i % 3) * 0.3, 0, Math.floor(i / 3) * 0.3),
        heading: i * 0.4,
      })),
    });
    const { state } = run(start, 10);
    for (let i = 0; i < 8; i += 1) {
      for (let j = i + 1; j < 8; j += 1) expect(gap(state, i, j)).toBeGreaterThanOrEqual(-0.05);
    }
  });

  it('karts closing at boosted 150cc speeds cannot tunnel through each other', () => {
    const fast = tuning.topSpeed[150] * tuning.boostSpeed;
    const start = pair(
      { kartType: 'pixie', position: vec3(0, 0, 1.2), heading: 0, speed: fast },
      { kartType: 'pixie', position: vec3(0, 0, -1.2), heading: Math.PI, speed: fast },
    );
    const { state, events } = run(start, 3);
    expect(events.some((e) => e.type === 'bump')).toBe(true);
    // Still on their own sides: kart 0 started at +z, kart 1 at −z.
    expect(state.karts[0]!.position.z).toBeGreaterThan(state.karts[1]!.position.z);
  });

  it('a rear-ender pushes the slow kart forward', () => {
    const scenario = drivingScenarios.find((s) => s.name === 'bump-rear')!;
    const start = scenario.setup(1).state;
    const { state, events } = run(start, 60);
    expect(events.some((e) => e.type === 'bump')).toBe(true);
    expect(state.karts[1]!.speed).toBeGreaterThan(8);
  });

  it('a light tap does not cancel a drift, a hard knock does', () => {
    const drifting = (knockSpeed: number) => {
      const start = pair(
        { kartType: 'boulder', position: vec3(0, 0, 0), heading: 0, speed: 20 },
        { kartType: 'boulder', position: vec3(2.2, 0, 0), heading: 0, speed: 20 },
      );
      start.karts[0]!.drift = { direction: 1, charge: 1, tier: 1 };
      start.karts[0]!.driftHeld = true;
      start.karts[1]!.velocity = { ...start.karts[1]!.velocity, x: -knockSpeed };
      return run(start, 2, [{ throttle: 1, drift: true, steer: 1 }]).events;
    };
    expect(drifting(1).some((e) => e.type === 'driftCancel')).toBe(false);
    expect(drifting(20).some((e) => e.type === 'driftCancel')).toBe(true);
  });
});
