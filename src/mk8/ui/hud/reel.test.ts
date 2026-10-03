import { beforeAll, describe, expect, it } from 'vitest';
import { registerTestRamp } from '../../content/courses/test-ramp/register';
import { registerMk8Content } from '../../register';
import scenarios, { ROULETTE_LEFT } from '../../../scenarios/mk8/hud';
import { step } from '../../../sim/step';
import { DT, tuning } from '../../../sim/tuning';
import { NEUTRAL_INPUT, type SimState } from '../../../sim/types';
import { REEL_ITEMS } from './icons';
import { bounceScale, Reel, REEL, scrolled, type ReelFrame } from './reel';

beforeAll(() => {
  registerTestRamp();
  registerMk8Content();
});

function scenario(name: string): SimState {
  const found = scenarios.find((s) => s.name === name);
  if (!found) throw new Error(`no scenario ${name}`);
  return found.setup(found.defaultSeed ?? 1).state;
}

describe('the roulette reel (MK-127)', () => {
  it('scrolls steadily, then slows to a stop at the end of the spin', () => {
    const total = tuning.rouletteSeconds;
    expect(scrolled(0)).toBe(0);
    expect(scrolled(0.5)).toBeCloseTo(REEL.itemsPerSecond * 0.5);
    const speed = (e: number) => (scrolled(e + 0.01) - scrolled(e)) / 0.01;
    expect(speed(total - 0.05)).toBeLessThan(speed(0.5) / 4);
    expect(scrolled(total + 1)).toBe(scrolled(total));
  });

  it('is a function of the time left: a paused race draws the same frame', () => {
    const slot = { held: null, uses: 0, roulette: ROULETTE_LEFT };
    const a = new Reel().update(slot, 10, REEL_ITEMS);
    const b = new Reel().update(slot, 500, REEL_ITEMS);
    expect(a).toEqual(b);
    expect(a.state).toBe('spinning');
    expect(a.started).toBe(true);
    expect(REEL_ITEMS).toContain(a.item);
  });

  it('always lands on the item the sim gave, with one roulette and one decide', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      let state = scenario('mk8-hud-roulette');
      state.rngState = (state.rngState + seed * 7919) >>> 0;
      const reel = new Reel();
      const frames: ReelFrame[] = [];
      for (let i = 0; i < 90; i += 1) {
        state = step(state, [NEUTRAL_INPUT]).state;
        frames.push(reel.update(state.karts[0]!.item, state.tick, REEL_ITEMS));
      }
      const held = state.karts[0]!.item.held;
      expect(held).not.toBeNull();
      const firstShown = frames.findIndex((f) => f.state !== 'spinning');
      expect(frames.slice(firstShown).every((f) => f.item === held)).toBe(true);
      expect(frames[firstShown]?.state).toBe('landing');
      expect(frames.filter((f) => f.landed)).toHaveLength(1);
      expect(frames.at(-1)?.state).toBe('held');
      // Spun until the sim's roulette ran out.
      expect(firstShown).toBe(Math.round(ROULETTE_LEFT / DT) - 1);
    }
  });

  it('lands on the second slot’s item too', () => {
    const reel = new Reel();
    reel.update({ held: null, uses: 0, roulette: 0.1 }, 0, REEL_ITEMS);
    const frame = reel.update({ held: 'banana', uses: 1, roulette: 0 }, 6, REEL_ITEMS);
    expect(frame).toMatchObject({ state: 'landing', item: 'banana', landed: true, land: 0 });
    const later = reel.update(
      { held: 'banana', uses: 1, roulette: 0 },
      6 + REEL.landTicks,
      REEL_ITEMS,
    );
    expect(later).toMatchObject({ state: 'held', item: 'banana', landed: false, land: 1 });
  });

  it('shows a handed-out item straight away (no spin) and nothing for an empty slot', () => {
    const reel = new Reel();
    expect(reel.update({ held: 'red', uses: 1, roulette: 0 }, 3, REEL_ITEMS)).toMatchObject({
      state: 'held',
      item: 'red',
      landed: false,
    });
    expect(reel.update({ held: null, uses: 0, roulette: 0 }, 4, REEL_ITEMS).state).toBe('empty');
  });

  it('bounces big on landing and settles at full size', () => {
    expect(bounceScale(0)).toBeGreaterThan(1.3);
    expect(bounceScale(1)).toBe(1);
    expect(bounceScale(2)).toBe(1);
  });
});
