import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { itemSets, registerItemSet } from '../../content/items';
import { createRace } from '../race/createRace';
import { createSimState } from '../state';
import { step } from '../step';
import { DT, tuning } from '../tuning';
import {
  NEUTRAL_INPUT,
  type InputFrame,
  type ItemBoxEntity,
  type SimEvent,
  type SimState,
} from '../types';
import { availableItems, dropItems, giveItem } from './index';

/** A throwaway two-slot set that only hands out bananas (so each roll is known). */
const SET = 'two-slot-test';
const ROULETTE_TICKS = Math.ceil(tuning.rouletteSeconds / DT) + 1;

beforeAll(() => {
  registerItemSet({ id: SET, odds: { banana: [1] }, slots: 2 });
});
afterAll(() => itemSets.unregister(SET));

function twoSlotRace(): SimState {
  return createSimState({ seed: 1, trackId: 'sunny-circuit', itemSet: SET, itemSlots: 2 });
}

/** Steps `ticks` ticks with the player's input, collecting events. */
function run(state: SimState, ticks: number, input: Partial<InputFrame> = {}) {
  const events: SimEvent[] = [];
  let s = state;
  for (let i = 0; i < ticks; i += 1) {
    const result = step(s, [{ ...NEUTRAL_INPUT, ...input }]);
    s = result.state;
    events.push(...result.events);
  }
  return { state: s, events };
}

/** Puts the player on the next active item box, standing still. */
function onBox(state: SimState): SimState {
  const box = state.entities.find(
    (e): e is ItemBoxEntity => e.kind === 'itemBox' && e.respawnTimer === 0,
  )!;
  const kart = state.karts[0]!;
  kart.position = { ...box.position };
  kart.velocity = { x: 0, y: 0, z: 0 };
  kart.speed = 0;
  return state;
}

describe('the second item slot (MK-103)', () => {
  it('only two-slot races have one', () => {
    expect(createSimState({ seed: 1 }).karts[0]!.item.second).toBeUndefined();
    expect(twoSlotRace().karts[0]!.item.second).toEqual({ held: null, uses: 0, roulette: 0 });
    expect(twoSlotRace().itemSet).toBe(SET);
  });

  it('a race created with an item set gets its slot count', () => {
    const state = createRace({
      trackId: 'sunny-circuit',
      racers: [{ kartId: 'maple', controller: 'local' }],
      engineClass: 100,
      itemsOn: true,
      seed: 1,
      itemSet: SET,
    });
    expect(state.itemSet).toBe(SET);
    expect(state.karts[0]!.item.second).toBeDefined();
  });

  it('holding an item, a box fills slot 2; using slot 1 moves slot 2 up', () => {
    const start = onBox(twoSlotRace());
    giveItem(start.karts[0]!, 'mushroom');
    const { state, events } = run(start, ROULETTE_TICKS);
    const item = state.karts[0]!.item;
    expect(events.some((e) => e.type === 'itemBoxHit')).toBe(true);
    expect(events).toContainEqual({ type: 'itemGranted', kartId: 0, item: 'banana', slot: 2 });
    expect(item.held).toBe('mushroom');
    expect(item.second).toEqual({ held: 'banana', uses: 1, roulette: 0 });

    const used = run(state, 1, { item: true });
    expect(used.events).toContainEqual({ type: 'itemUsed', kartId: 0, item: 'mushroom' });
    expect(used.state.karts[0]!.item.held).toBe('banana');
    expect(used.state.karts[0]!.item.second).toEqual({ held: null, uses: 0, roulette: 0 });
  });

  it('with both slots empty, a box fills slot 1 only', () => {
    const { state } = run(onBox(twoSlotRace()), ROULETTE_TICKS);
    expect(state.karts[0]!.item.held).toBe('banana');
    expect(state.karts[0]!.item.second?.held).toBeNull();
  });

  it("slot 1 can be used while slot 2's roulette spins, and the spin moves up", () => {
    const start = onBox(twoSlotRace());
    giveItem(start.karts[0]!, 'mushroom');
    const spinning = run(start, 10).state;
    expect(spinning.karts[0]!.item.second!.roulette).toBeGreaterThan(0);
    const used = run(spinning, 1, { item: true }).state;
    expect(used.karts[0]!.item.held).toBeNull();
    expect(used.karts[0]!.item.roulette).toBeGreaterThan(0);
    const done = run(used, ROULETTE_TICKS).state;
    expect(done.karts[0]!.item.held).toBe('banana');
  });

  it('a third box with both slots taken does nothing to them', () => {
    const start = onBox(twoSlotRace());
    giveItem(start.karts[0]!, 'mushroom');
    giveItem(start.karts[0]!.item.second!, 'star');
    const { state } = run(start, ROULETTE_TICKS);
    expect(state.karts[0]!.item).toMatchObject({ held: 'mushroom', roulette: 0 });
    expect(state.karts[0]!.item.second).toEqual({ held: 'star', uses: 1, roulette: 0 });
  });

  it('slot 2 moves up when slot 1 empties some other way (stolen, thrown)', () => {
    const start = twoSlotRace();
    giveItem(start.karts[0]!.item.second!, 'star');
    const { state } = run(start, 1);
    expect(state.karts[0]!.item.held).toBe('star');
  });

  it('lightning drops both slots', () => {
    const state = twoSlotRace();
    const kart = state.karts[0]!;
    giveItem(kart, 'mushroom');
    giveItem(kart.item.second!, 'star');
    dropItems(kart);
    expect(kart.item).toMatchObject({ held: null, uses: 0, roulette: 0 });
    expect(kart.item.second).toEqual({ held: null, uses: 0, roulette: 0 });
  });

  it("an item set's roulette hands out only its items", () => {
    expect(availableItems(SET)).toEqual(['banana']);
    expect(availableItems()).toContain('green');
  });
});
