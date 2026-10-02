import { describe, expect, it } from 'vitest';
import { createRace } from './race/createRace';
import { step } from './step';
import { DT } from './tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimState } from './types';

/** A seeded 8-kart race (you + 7 AI) on Sunny Circuit, `ticks` in (the countdown is ~4 s). */
function race(ticks: number): SimState {
  let state = createRace({
    trackId: 'sunny-circuit',
    racers: Array.from({ length: 8 }, (_, i) => ({
      kartId: 'maple',
      controller: i === 0 ? ('local' as const) : ('ai' as const),
    })),
    engineClass: 100,
    itemsOn: true,
    seed: 11,
  });
  for (let t = 0; t < ticks; t += 1) state = step(state, [drive(t)]).state;
  return state;
}

function drive(tick: number): InputFrame {
  return { ...NEUTRAL_INPUT, throttle: 1, steer: Math.sin(tick / 40) * 0.3 };
}

describe('step with `only` (MK-74: an online client predicting just its own kart)', () => {
  it('lets every other kart coast on its velocity, without AI thinking, laps or bumps', () => {
    const before = race(8 * 60);
    const { state: after, events } = step(before, [drive(0)], DT, { only: 0 });
    for (const kart of after.karts.slice(1)) {
      const was = before.karts[kart.id]!;
      expect(kart.position.x).toBeCloseTo(was.position.x + was.velocity.x * DT, 9);
      expect(kart.position.z).toBeCloseTo(was.position.z + was.velocity.z * DT, 9);
      // Nothing else about it moved on: speed, heading, laps, the AI's state.
      expect({ ...kart, position: was.position }).toEqual(was);
    }
    // Race order is the host's to decide, and nobody bumps.
    expect(after.positions).toEqual(before.positions);
    expect(events.filter((e) => e.type === 'positionChange' || e.type === 'bump')).toEqual([]);
  });

  it('drives the chosen kart as a full step does when nothing touches it', () => {
    let full = race(5 * 60);
    let only = full;
    for (let t = 0; t < 60; t += 1) {
      const fullStep = step(full, [drive(t)]);
      expect(fullStep.events.some((e) => e.type === 'bump' && (e.a === 0 || e.b === 0))).toBe(
        false,
      );
      full = fullStep.state;
      only = step(only, [drive(t)], DT, { only: 0 }).state;
    }
    expect(only.karts[0]).toEqual(full.karts[0]);
  });

  it('is pure and deterministic', () => {
    const state = race(6 * 60);
    const json = JSON.stringify(state);
    const a = step(state, [drive(1)], DT, { only: 3 });
    const b = step(state, [drive(1)], DT, { only: 3 });
    expect(JSON.stringify(state)).toBe(json);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
