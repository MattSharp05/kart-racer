import { describe, expect, it } from 'vitest';
import { scenarios } from '../../../scenarios';
import { step } from '../../../sim/step';
import { tuning } from '../../../sim/tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from '../../../sim/types';
import { giveItem } from '../../../sim/items';
import turboTrio, { TURBO_TRIO_USES } from './sim';

function run(state: SimState, ticks: number, input: Partial<InputFrame> = {}) {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i += 1) {
    const result = step(state, [{ ...NEUTRAL_INPUT, throttle: 1, ...input }]);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

/** Presses and releases the item button once (2 ticks). */
function use(state: SimState) {
  const pressed = run(state, 1, { item: true });
  const released = run(pressed.state, 1);
  return { state: released.state, events: [...pressed.events, ...released.events] };
}

const start = () => scenarios.get('item-turbo-trio')!.setup(1).state;

describe('Turbo Trio (MK-65)', () => {
  it('gives 3 boosts, one per press, then empties', () => {
    let state = start();
    expect(state.karts[0]!.item).toMatchObject({ held: 'turbo-trio', uses: TURBO_TRIO_USES });
    const boosts: SimEvent[] = [];
    for (let press = 1; press <= TURBO_TRIO_USES + 1; press += 1) {
      const result = use(state);
      state = result.state;
      boosts.push(...result.events.filter((e) => e.type === 'boost'));
      expect(state.karts[0]!.item.uses).toBe(Math.max(0, TURBO_TRIO_USES - press));
      if (press === TURBO_TRIO_USES) expect(state.karts[0]!.item.held).toBeNull();
      // Let the boost run out (coasting: no item box pickups on the way).
      state = run(state, 60, { throttle: 0 }).state;
    }
    // A 4th press does nothing: the slot emptied on the 3rd.
    expect(boosts).toHaveLength(TURBO_TRIO_USES);
  });

  it('each boost is exactly a mushroom’s', () => {
    const trio = use(start());
    const mushroomStart = start();
    giveItem(mushroomStart.karts[0]!, 'mushroom');
    const mushroom = use(mushroomStart);
    const boost = (events: SimEvent[]) => events.find((e) => e.type === 'boost');
    expect(boost(trio.events)).toEqual({
      type: 'boost',
      kartId: 0,
      seconds: tuning.mushroomSeconds,
    });
    expect(boost(trio.events)).toEqual(boost(mushroom.events));
    // Same speed after the same boost.
    const after = (s: SimState) => run(s, 60).state.karts[0]!;
    expect(after(trio.state).speed).toBeCloseTo(after(mushroom.state).speed, 9);
    expect(after(trio.state).boostTimer).toBeCloseTo(after(mushroom.state).boostTimer, 9);
  });

  it('the AI uses it on a straight and holds it through a bend', () => {
    const state = start();
    const kart = state.karts[0]!;
    const ctx = (curvature: number) =>
      ({ straightAhead: () => curvature }) as unknown as Parameters<typeof turboTrio.aiUse>[2];
    expect(turboTrio.aiUse(kart, state, ctx(0))).toBe(true);
    expect(turboTrio.aiUse(kart, state, ctx(tuning.ai.straightCurvature * 2))).toBe(false);
  });
});
