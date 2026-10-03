import { beforeAll, describe, expect, it } from 'vitest';
import { updateItems } from '../../sim/items';
import { createRace, type RacerSlot } from '../../sim/race/createRace';
import { DT, tuning } from '../../sim/tuning';
import type { ItemId, SimEvent, SimState } from '../../sim/types';
import { MK8_ITEM_SET } from '../content/items/id';
import { raceSetup } from '../flow';
import { registerMk8Content } from '../register';
import { applyModeRules } from './index';
import { applyVsRules, ITEM_POOLS, isVsRules, vsRulesLabel, type VsRules } from './vsRace';

beforeAll(() => registerMk8Content());

const FIELD: RacerSlot[] = Array.from({ length: 8 }, (_, i) => ({
  kartId: 'maple',
  controller: i === 0 ? 'local' : 'ai',
}));

function race(seed = 1): SimState {
  return createRace({
    trackId: 'sunny-circuit',
    racers: FIELD,
    engineClass: 150,
    itemsOn: true,
    seed,
    itemSet: MK8_ITEM_SET,
  });
}

/** Every item the roulette hands out over `rounds` spins of every kart, each place in turn. */
function granted(state: SimState, rounds: number): ItemId[] {
  const got: ItemId[] = [];
  for (let r = 0; r < rounds; r++) {
    // Rotate the order so every kart rolls from every place.
    state.positions = state.positions.map((_, i) => (i + r) % state.karts.length);
    for (const kart of state.karts) {
      kart.item.held = null;
      kart.item.uses = 0;
      kart.item.roulette = DT / 2;
    }
    const events: SimEvent[] = [];
    updateItems(state, [], DT, events);
    for (const e of events) if (e.type === 'itemGranted') got.push(e.item);
  }
  return got;
}

describe('VS Race rules (MK-131)', () => {
  it('"bananas only" gives only bananas from boxes, in every place', () => {
    const state = race();
    applyVsRules(state, { items: 'bananas', cpu: 'normal' });
    const got = granted(state, 60);
    expect(got.length).toBe(60 * 8);
    expect(new Set(got)).toEqual(new Set(ITEM_POOLS.bananas));
  });

  it('"shells only" and "mushrooms only" keep to their families', () => {
    for (const items of ['shells', 'mushrooms'] as const) {
      const state = race(2);
      applyVsRules(state, { items, cpu: 'normal' });
      const got = granted(state, 40);
      expect(got.length).toBeGreaterThan(0);
      for (const item of got) expect(ITEM_POOLS[items]).toContain(item);
    }
  });

  it('normal items hand out the whole MK8 set; no items takes the boxes out', () => {
    const normal = race();
    applyVsRules(normal, { items: 'on', cpu: 'normal' });
    expect(normal.itemPool).toBeUndefined();
    expect(new Set(granted(normal, 60)).size).toBeGreaterThan(8);

    const none = race();
    expect(none.entities.some((e) => e.kind === 'itemBox')).toBe(true);
    applyVsRules(none, { items: 'off', cpu: 'normal' });
    expect(none.entities.some((e) => e.kind === 'itemBox')).toBe(false);
  });

  it('scales every AI’s skill by the CPU setting, never the player’s kart', () => {
    const skills = (rules: VsRules) => {
      const state = race(5);
      applyVsRules(state, rules);
      return state.karts.map((k) => k.ai?.skill);
    };
    const normal = skills({ items: 'on', cpu: 'normal' });
    const easy = skills({ items: 'on', cpu: 'easy' });
    const hard = skills({ items: 'on', cpu: 'hard' });
    expect(normal[0]).toBeUndefined();
    for (let i = 1; i < 8; i++) {
      expect(easy[i]).toBeCloseTo((normal[i] ?? 0) * tuning.mk8.vsCpu.easy);
      expect(hard[i]).toBeCloseTo((normal[i] ?? 0) * tuning.mk8.vsCpu.hard);
      expect(easy[i]).toBeLessThan(normal[i] ?? 0);
      expect(hard[i]).toBeGreaterThan(normal[i] ?? 0);
    }
  });

  it('comes from the menus’ choices on a VS Race setup, and only there', () => {
    const vs = raceSetup({ mode: 'vs', course: 'stadium', vs: { items: 'bananas', cpu: 'hard' } });
    expect(vs.vs).toEqual({ items: 'bananas', cpu: 'hard' });
    const state = race();
    applyModeRules(state, vs);
    expect(state.itemPool).toEqual([...ITEM_POOLS.bananas]);

    const gp = raceSetup({ mode: 'grand-prix', cup: 'mushroom' });
    expect(gp.vs).toBeUndefined();
    const untouched = race();
    applyModeRules(untouched, gp);
    expect(untouched).toEqual(race());
  });

  it('checks and labels rules', () => {
    expect(isVsRules({ items: 'shells', cpu: 'easy' })).toBe(true);
    expect(isVsRules({ items: 'rockets', cpu: 'easy' })).toBe(false);
    expect(vsRulesLabel({ items: 'on', cpu: 'normal' })).toBe('');
    expect(vsRulesLabel({ items: 'bananas', cpu: 'hard' })).toBe('Bananas only · CPU hard');
  });
});
