import { existsSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { kartDef } from '../sim/data/karts';
import { availableItems } from '../sim/items';
import { oddsRow, oddsTable, pickItem } from '../sim/items/odds';
import { createSimState } from '../sim/state';
import { step } from '../sim/step';
import { getTrack } from '../sim/track';
import { scenarios } from '../scenarios';
import { applySnapshot, decodeMessage, encodeEvents, encodeSnapshot, MSG } from '../net/protocol';
import { NEUTRAL_INPUT, type SimEvent } from '../sim/types';
import { items, ODDS_ROWS, registerItem, type ItemContent } from './items';
import { itemViews } from './items/render';
import { racers } from './racers';
import { racerViews } from './racers/render';
import { Registry } from './registry';
import { tracks } from './tracks';
import { trackViews } from './tracks/render';
import { trackFolderScenarios } from './tracks/scenarios';

/** Content folders on disk: each `src/content/<kind>/<id>/` is one piece of content. */
const folders = (kind: string) =>
  readdirSync(new URL(`./${kind}/`, import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

describe('content registries', () => {
  it('list 3 real tracks plus the test tracks, 4 racers and 6 items (+ the test kit), in order', () => {
    expect(
      tracks
        .list()
        .filter((t) => !t.testOnly)
        .map((t) => t.id),
    ).toEqual(['sunny-circuit', 'dune-canyon', 'frostpeak-pass']);
    expect(
      tracks
        .list()
        .filter((t) => t.testOnly)
        .map((t) => t.id),
    ).toEqual(['test-oval', 'test-pad', 'hazard-test']);
    expect(racers.ids()).toEqual(['maple', 'pixie', 'boulder', 'swoop']);
    expect(
      items
        .list()
        .filter((i) => !i.testOnly)
        .map((i) => i.id),
    ).toEqual(['mushroom', 'banana', 'green', 'red', 'star', 'lightning']);
    expect(
      items
        .list()
        .filter((i) => i.testOnly)
        .map((i) => i.id),
    ).toEqual(['test-kit']);
  });

  it('throw on unknown ids', () => {
    expect(() => tracks.get('nowhere')).toThrow(/Unknown track: nowhere/);
    expect(() => getTrack('nowhere')).toThrow(/Unknown track/);
    expect(() => kartDef('nobody')).toThrow(/Unknown racer: nobody/);
    expect(() => racerViews.get('nobody')).toThrow(/Unknown racer view/);
    expect(() => items.get('nothing')).toThrow(/Unknown item: nothing/);
    expect(() => itemViews.get('nothing')).toThrow(/Unknown item view/);
  });

  it.each([
    ['tracks', tracks.ids()],
    ['racers', racers.ids()],
    ['items', items.ids()],
  ])('register every %s folder (add its line to the index.ts list)', (kind, ids) => {
    expect([...ids].sort()).toEqual(folders(kind));
  });

  it('give every racer and item a render view (add its line to the render.ts list)', () => {
    expect(racerViews.ids().sort()).toEqual([...racers.ids()].sort());
    expect(itemViews.ids().sort()).toEqual([...items.ids()].sort());
  });

  it('list every track folder with a render.ts in tracks/render.ts (MK-58)', () => {
    const withView = folders('tracks').filter((id) =>
      existsSync(new URL(`./tracks/${id}/render.ts`, import.meta.url)),
    );
    expect(trackViews.ids().sort()).toEqual(withView);
  });

  it('list every track folder with a scenarios.ts in tracks/scenarios.ts (MK-58)', () => {
    const withScenarios = folders('tracks').filter((id) =>
      existsSync(new URL(`./tracks/${id}/scenarios.ts`, import.meta.url)),
    );
    expect(Object.keys(trackFolderScenarios).sort()).toEqual(withScenarios);
  });

  it('assemble odds rows that each sum to 1 from the items’ own odds', () => {
    expect(oddsTable()).toHaveLength(ODDS_ROWS);
    for (const row of oddsTable()) {
      expect(Object.values(row).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    }
    expect(oddsRow(1, 8)).toMatchObject({ banana: 0.45, green: 0.4, mushroom: 0.15 });
  });
});

describe('Registry', () => {
  it('rejects duplicate and empty ids, and lists by order then id', () => {
    const registry = new Registry<{ id: string; order: number }>('thing');
    registry.register({ id: 'b', order: 1 });
    registry.register({ id: 'a', order: 1 });
    registry.register({ id: 'c', order: 0 });
    expect(registry.ids()).toEqual(['c', 'a', 'b']);
    expect(() => registry.register({ id: 'a', order: 5 })).toThrow(/Duplicate thing id: a/);
    expect(() => registry.register({ id: '', order: 5 })).toThrow(/without an id/);
    registry.unregister('a');
    expect(registry.has('a')).toBe(false);
  });

  it('rejects an item whose odds do not cover every row', () => {
    const bad = { ...items.get('mushroom'), id: 'bad-odds', odds: [1] };
    expect(() => registerItem(bad)).toThrow(/odds needs 8 rows/);
  });
});

/**
 * Proves the pattern (ADR 0007): an item registered here, with no shared file edited, is in the
 * odds table, can be handed out by the roulette, and works when used.
 */
describe('a test-only item registered from a test file', () => {
  let updates = 0;
  const dummy: ItemContent = {
    id: 'test-dummy',
    name: 'Dummy',
    order: 1000,
    // Leaders only.
    odds: [1, 0, 0, 0, 0, 0, 0, 0],
    onUse: (kart, _state, events) => {
      kart.boostTimer = 1.25;
      events.push({ type: 'boost', kartId: kart.id, seconds: 1.25 });
    },
    update: () => {
      updates += 1;
    },
  };

  beforeAll(() => registerItem(dummy));
  afterAll(() => items.unregister(dummy.id));

  it('appears in the odds table and the roulette can hand it out', () => {
    expect(availableItems()).toContain('test-dummy');
    expect(oddsTable()[0]).toMatchObject({ 'test-dummy': 1 });
    expect(oddsTable()[ODDS_ROWS - 1]).toMatchObject({ 'test-dummy': 0 });
    const rolls = Array.from({ length: 100 }, (_, i) => i / 100);
    expect(rolls.map((roll) => pickItem(oddsRow(1, 8), roll, availableItems()))).toContain(
      'test-dummy',
    );
  });

  it('can be used, and its update runs once per tick', () => {
    let state = createSimState({ seed: 1, karts: [{ kartType: 'maple' }] });
    state.karts[0]!.item.held = 'test-dummy';
    updates = 0;
    const events: SimEvent[] = [];
    const result = step(state, [{ ...NEUTRAL_INPUT, item: true }]);
    state = result.state;
    events.push(...result.events);
    expect(updates).toBe(1);
    expect(state.karts[0]!.item.held).toBeNull();
    expect(state.karts[0]!.boostTimer).toBeGreaterThan(1);
    expect(events).toContainEqual({ type: 'itemUsed', kartId: 0, item: 'test-dummy' });
  });

  it('is used by an AI driver that holds it', () => {
    let state = scenarios.get('ai-holding-green')!.setup(1).state;
    state.karts[1]!.item.held = 'test-dummy';
    let used = false;
    for (let i = 0; i < 60 * 10 && !used; i += 1) {
      const result = step(state, [NEUTRAL_INPUT]);
      state = result.state;
      used = result.events.some((e) => e.type === 'itemUsed' && e.kartId === 1);
    }
    expect(used).toBe(true);
  });

  it('survives the online protocol (held item, use and hit events)', () => {
    const state = scenarios.get('ai-holding-green')!.setup(1).state;
    state.karts[1]!.item.held = 'test-dummy';
    const snapshot = decodeMessage(encodeSnapshot(state, 0, []));
    if (snapshot.type !== MSG.snapshot) throw new Error('not a snapshot');
    const copy = applySnapshot(
      scenarios.get('ai-holding-green')!.setup(1).state,
      0,
      snapshot.bytes,
    );
    expect(copy.karts[1]!.item.held).toBe('test-dummy');

    const events = [
      { seq: 1, tick: 5, event: { type: 'itemUsed', kartId: 1, item: 'test-dummy' } },
      { seq: 2, tick: 6, event: { type: 'kartHit', kartId: 0, by: 1, kind: 'test-dummy' } },
    ] satisfies { seq: number; tick: number; event: SimEvent }[];
    expect(decodeMessage(encodeEvents(events))).toEqual({ type: MSG.event, events });
  });
});
