import { describe, expect, it } from 'vitest';
import { cloneJson } from './clone';
import { createRace } from './race/createRace';
import { step } from './step';
import { NEUTRAL_INPUT } from './types';

describe('cloneJson (MK-74)', () => {
  it('copies a race state exactly, sharing nothing', () => {
    let state = createRace({
      trackId: 'sunny-circuit',
      racers: [
        { kartId: 'maple', controller: 'local', gridSlot: 0 },
        { kartId: 'maple', controller: 'ai', gridSlot: 1 },
      ],
      engineClass: 100,
      itemsOn: true,
      seed: 3,
    });
    for (let i = 0; i < 300; i += 1) state = step(state, [{ ...NEUTRAL_INPUT, throttle: 1 }]).state;
    const copy = cloneJson(state);
    expect(copy).toEqual(structuredClone(state));
    expect(JSON.stringify(copy)).toBe(JSON.stringify(state));
    copy.karts[0]!.position.x += 1;
    copy.entities.pop();
    expect(state.karts[0]!.position.x).not.toBe(copy.karts[0]!.position.x);
    expect(state.entities.length).toBe(copy.entities.length + 1);
  });

  it('keeps undefined fields, -0 and non-finite numbers', () => {
    const value = { a: undefined, b: -0, c: Infinity, d: [1, { e: null }] };
    const copy = cloneJson(value);
    expect(copy).toEqual(value);
    expect('a' in copy).toBe(true);
    expect(Object.is(copy.b, -0)).toBe(true);
    expect(copy.d[1]).not.toBe(value.d[1]);
  });
});
