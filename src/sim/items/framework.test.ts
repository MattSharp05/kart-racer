import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cueFor } from '../../audio/soundMap';
import { soundRecipe } from '../../audio/soundRegistry';
import { items, registerItem, unregisterItem, type ItemContent } from '../../content/items';
import { INK_TICKS, SHIELD_TICKS } from '../../content/items/test-kit/sim';
import {
  applySnapshot,
  decodeMessage,
  encodeEvents,
  encodeSnapshot,
  MSG,
} from '../../net/protocol';
import { itemFrameworkTest } from '../../scenarios/items';
import { scenarios } from '../../scenarios';
import { createSimState } from '../state';
import { step } from '../step';
import { tuning } from '../tuning';
import {
  NEUTRAL_INPUT,
  type InputFrame,
  type ItemEntity,
  type SimEvent,
  type SimState,
} from '../types';
import { applyEffect, getEffect, hasEffect } from './effects';
import { availableItems, giveItem } from '.';
import { hitKart } from './hit';
import { oddsTable } from './odds';

/** Steps `ticks` ticks with kart 0 on `input` (others neutral), collecting events. */
function run(state: SimState, ticks: number, input: Partial<InputFrame> = {}) {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i += 1) {
    const result = step(state, [{ ...NEUTRAL_INPUT, ...input }]);
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

const itemEntities = (state: SimState, spec: string) =>
  state.entities.filter((e): e is ItemEntity => e.kind === 'item' && e.spec === spec);

/** Angle between an entity's direction and the way to point (x, z), radians. */
function aimError(e: ItemEntity, x: number, z: number): number {
  const want = Math.atan2(z - e.position.z, x - e.position.x);
  const have = Math.atan2(e.direction.z, e.direction.x);
  return Math.abs(Math.atan2(Math.sin(want - have), Math.cos(want - have)));
}

describe('item framework (MK-52)', () => {
  it('keeps the MVP odds table unchanged; new items start at 0 until their tickets set them', () => {
    const mvp = ['mushroom', 'banana', 'green', 'red', 'star', 'lightning'];
    // Items whose own tickets set their odds (MK-65 on); the balance pass (MK-72) tunes them all.
    const withOdds = [...mvp, 'turbo-trio', 'oil-slick'];
    const table = oddsTable();
    // Columns: mushroom banana green red star lightning; rows: 1st … 8th place.
    expect(table.map((row) => mvp.map((id) => row[id]).join(' '))).toMatchInlineSnapshot(`
      [
        "0.15 0.45 0.4 0 0 0",
        "0.25 0.25 0.3 0.2 0 0",
        "0.3 0.15 0.2 0.35 0 0",
        "0.35 0.1 0.15 0.4 0 0",
        "0.35 0 0.1 0.35 0.12 0.08",
        "0.35 0 0 0.3 0.2 0.15",
        "0.3 0 0 0.25 0.25 0.2",
        "0.25 0 0 0.2 0.3 0.25",
      ]
    `);
    for (const row of table) {
      for (const [id, weight] of Object.entries(row)) {
        if (!withOdds.includes(id)) expect(weight).toBe(0);
      }
    }
  });

  it('never hands out test-only items', () => {
    expect(items.ids()).toContain('test-kit');
    expect(availableItems()).not.toContain('test-kit');
  });

  it('a multi-use item is used 3 times, then the slot empties', () => {
    let state = itemFrameworkTest(1);
    expect(state.karts[0]!.item).toMatchObject({ held: 'test-kit', uses: 3 });
    const used: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const result = use(state);
      state = result.state;
      used.push(result.events.filter((e) => e.type === 'itemUsed').length);
      expect(state.karts[0]!.item.uses).toBe(2 - i);
    }
    expect(used).toEqual([1, 1, 1]);
    expect(state.karts[0]!.item.held).toBeNull();
    // Each use did its own thing: a bolt, a boomerang, then a shield and a puddle.
    expect(itemEntities(state, 'test-kit-bolt')).toHaveLength(1);
    expect(itemEntities(state, 'test-kit-boomerang')).toHaveLength(1);
    expect(itemEntities(state, 'test-kit-puddle')).toHaveLength(1);
    expect(hasEffect(state.karts[0]!, 'test-kit-shield')).toBe(true);
    // A fourth press does nothing.
    expect(use(state).events.some((e) => e.type === 'itemUsed')).toBe(false);
  });

  it('a slot set without uses (scenarios, ?item=) counts as one use', () => {
    let state = itemFrameworkTest(1);
    state.karts[0]!.item.uses = 0;
    state = use(state).state;
    expect(state.karts[0]!.item.held).toBeNull();
  });

  it('an effect lasts exactly N ticks, then expires', () => {
    let state = createSimState({ seed: 1 });
    applyEffect(state.karts[0]!, 'test-kit-ink', 10, state, [], { by: 3 });
    state = run(state, 9).state;
    expect(getEffect(state.karts[0]!, 'test-kit-ink')).toMatchObject({ ticksLeft: 1, by: 3 });
    state = run(state, 1).state;
    expect(hasEffect(state.karts[0]!, 'test-kit-ink')).toBe(false);
  });

  it('a shield effect blocks one hit, then ends', () => {
    let state = itemFrameworkTest(1); // (invulnerability counts down on spline tracks)
    applyEffect(state.karts[0]!, 'test-kit-shield', SHIELD_TICKS, state, [], { data: [1] });
    const events: SimEvent[] = [];
    expect(hitKart(state.karts[0]!, 1, 'green', events)).toBe(false);
    expect(state.karts[0]!.spinTimer).toBe(0);
    expect(events).toEqual([{ type: 'itemFx', kartId: 0, item: 'test-kit', fx: 'pop' }]);
    // Briefly invulnerable after the block, so the same hazard can't hit on the next tick.
    expect(state.karts[0]!.invulnerableTimer).toBe(tuning.blockedHitInvulnerableSeconds);
    state = run(state, 1).state;
    expect(hasEffect(state.karts[0]!, 'test-kit-shield')).toBe(false);
    state = run(state, 60).state;
    expect(hitKart(state.karts[0]!, 1, 'green', [])).toBe(true);
    expect(state.karts[0]!.spinTimer).toBeGreaterThan(0);
  });

  it('a shielded kart uses up a banana it drives into, and is not hit again next tick', () => {
    const state = createSimState({ seed: 1, karts: [{}, {}] });
    applyEffect(state.karts[0]!, 'test-kit-shield', SHIELD_TICKS, state, [], { data: [1] });
    state.entities.push({
      id: 50,
      kind: 'banana',
      position: { x: 0, y: 0, z: 0 },
      from: { x: 0, y: 0, z: 0 },
      flightTimer: 0,
      ownerId: 1,
      ownerImmune: 0,
    });
    const { state: after, events } = run(state, 2);
    expect(after.entities.some((e) => e.id === 50)).toBe(false);
    expect(after.karts[0]!.spinTimer).toBe(0);
    expect(after.karts[0]!.invulnerableTimer).toBeGreaterThan(0);
    expect(events.filter((e) => e.type === 'itemFx')).toHaveLength(1);
  });

  it('lightning spares a kart whose shield blocks it', () => {
    let state = createSimState({ seed: 1, karts: [{}, {}, {}] });
    applyEffect(state.karts[1]!, 'test-kit-shield', SHIELD_TICKS, state, [], { data: [1] });
    giveItem(state.karts[0]!, 'lightning');
    state = run(state, 1, { item: true }).state;
    expect(state.karts[1]!.shrinkTimer).toBe(0);
    expect(state.karts[2]!.shrinkTimer).toBeGreaterThan(0);
  });

  it('a homing entity turns toward its target and hits it', () => {
    let state = use(itemFrameworkTest(1)).state;
    const bolt = itemEntities(state, 'test-kit-bolt')[0]!;
    expect(bolt.targetId).toBe(1);
    const target = state.karts[1]!.position;
    const before = aimError(bolt, target.x, target.z);
    state = run(state, 5).state;
    const after = aimError(itemEntities(state, 'test-kit-bolt')[0]!, target.x, target.z);
    expect(after).toBeLessThan(before);
    // The kart is 3 m to the side: a straight shot would miss it.
    const { events } = run(state, 60);
    expect(events).toContainEqual({ type: 'kartHit', kartId: 1, by: 0, kind: 'test-kit' });
  });

  it('a returning entity flies out, then comes back to its owner', () => {
    let state = use(use(itemFrameworkTest(1)).state).state;
    let boomerang = itemEntities(state, 'test-kit-boomerang')[0]!;
    const start = { ...boomerang.position };
    let furthest = 0;
    let turnedBack = false;
    for (let tick = 0; tick < 6 * 60 && boomerang; tick += 1) {
      state = run(state, 1).state;
      const next = itemEntities(state, 'test-kit-boomerang')[0];
      if (!next) break;
      boomerang = next;
      furthest = Math.max(
        furthest,
        Math.hypot(boomerang.position.x - start.x, boomerang.position.z - start.z),
      );
      turnedBack ||= boomerang.returning === 1;
    }
    expect(furthest).toBeGreaterThan(15);
    expect(turnedBack).toBe(true);
    // Gone (caught), well before its life ran out, and near its owner.
    expect(itemEntities(state, 'test-kit-boomerang')).toHaveLength(0);
    expect(boomerang.age).toBeLessThan(6 * 60);
    const owner = state.karts[0]!.position;
    expect(Math.hypot(boomerang.position.x - owner.x, boomerang.position.z - owner.z)).toBeLessThan(
      3,
    );
  });

  it('an area entity puts an effect on a kart that drives into it', () => {
    const state = use(use(use(itemFrameworkTest(1)).state).state).state;
    const puddle = itemEntities(state, 'test-kit-puddle')[0]!;
    state.karts[2]!.position = { ...puddle.position };
    const { state: after, events } = run(state, 1);
    expect(getEffect(after.karts[2]!, 'test-kit-ink')).toMatchObject({
      ticksLeft: INK_TICKS,
      by: 0,
    });
    expect(events).toContainEqual({ type: 'itemFx', kartId: 2, item: 'test-kit', fx: 'splat' });
    expect(itemEntities(after, 'test-kit-puddle')).toHaveLength(0);
  });

  it('is deterministic', () => {
    const play = () => {
      let state = itemFrameworkTest(7);
      for (let i = 0; i < 3; i += 1) state = run(use(state).state, 20).state;
      return JSON.stringify(run(state, 200).state);
    };
    expect(play()).toBe(play());
  });

  it('sends uses, effects and entities in the online snapshot', () => {
    let state = use(use(use(itemFrameworkTest(1)).state).state).state;
    state.karts[1]!.item = { held: 'test-kit', uses: 2, roulette: 0, buttonHeld: false };
    state = run(state, 3).state;
    const message = decodeMessage(encodeSnapshot(state, 0, []));
    if (message.type !== MSG.snapshot) throw new Error('not a snapshot');
    const copy = applySnapshot(itemFrameworkTest(1), state.tick, message.bytes);
    expect(copy.karts[1]!.item).toMatchObject({ held: 'test-kit', uses: 2 });
    expect(copy.karts[0]!.effects).toEqual(state.karts[0]!.effects);
    const entities = state.entities.filter((e) => e.kind === 'item');
    const copied = copy.entities.filter((e) => e.kind === 'item');
    expect(copied.map((e) => [e.id, e.spec, e.age, e.ownerId, e.targetId, e.returning])).toEqual(
      entities.map((e) => [e.id, e.spec, e.age, e.ownerId, e.targetId, e.returning]),
    );
    copied.forEach((e, i) => {
      expect(e.position.x).toBeCloseTo(entities[i]!.position.x, 1);
      expect(e.direction.z).toBeCloseTo(entities[i]!.direction.z, 3);
    });

    const events = [
      { seq: 1, tick: 5, event: { type: 'itemFx', kartId: 2, item: 'test-kit', fx: 'splat' } },
    ] satisfies { seq: number; tick: number; event: SimEvent }[];
    expect(decodeMessage(encodeEvents(events))).toEqual({ type: MSG.event, events });
  });

  it('plays an item’s registered sounds for its use and its fx events', () => {
    expect(soundRecipe('test-kit.use')).toBeTypeOf('function');
    expect(cueFor({ type: 'itemUsed', kartId: 0, item: 'test-kit' })?.id).toBe('test-kit.use');
    expect(cueFor({ type: 'itemFx', kartId: 0, item: 'test-kit', fx: 'pop' })).toMatchObject({
      id: 'test-kit.pop',
      kartId: 0,
    });
    expect(cueFor({ type: 'itemFx', kartId: 0, item: 'test-kit', fx: 'unknown' })).toBeNull();
  });
});

describe('AI item-use hook (MK-52)', () => {
  it('an AI driver thinks again between the uses of a multi-use item', () => {
    let state = scenarios.get('ai-holding-green')!.setup(1).state;
    giveItem(state.karts[1]!, 'test-kit');
    const usedAt: number[] = [];
    for (let tick = 1; tick <= 60 * 20 && usedAt.length < 2; tick += 1) {
      const result = step(state, [NEUTRAL_INPUT]);
      state = result.state;
      if (result.events.some((e) => e.type === 'itemUsed' && e.kartId === 1)) usedAt.push(tick);
    }
    expect(usedAt).toHaveLength(2);
    expect(usedAt[1]! - usedAt[0]!).toBeGreaterThanOrEqual(60 * tuning.ai.itemDelayMin);
  });

  let wanted = false;
  const waiter: ItemContent = {
    id: 'test-waiter',
    name: 'Waiter',
    order: 1001,
    testOnly: true,
    odds: [0, 0, 0, 0, 0, 0, 0, 0],
    onUse: () => {},
    aiUse: () => wanted,
  };
  beforeAll(() => registerItem(waiter));
  afterAll(() => unregisterItem(waiter.id));

  /** Ticks until AI kart 1 uses the waiter (or `max`). */
  function ticksToUse(max: number): number {
    let state = scenarios.get('ai-holding-green')!.setup(1).state;
    giveItem(state.karts[1]!, 'test-waiter');
    for (let tick = 1; tick <= max; tick += 1) {
      const result = step(state, [NEUTRAL_INPUT]);
      state = result.state;
      if (result.events.some((e) => e.type === 'itemUsed' && e.kartId === 1)) return tick;
    }
    return max;
  }

  it('waits while the hook says no, then gives up and uses it anyway', () => {
    wanted = true;
    const eager = ticksToUse(60 * 20);
    wanted = false;
    const reluctant = ticksToUse(60 * 20);
    expect(eager).toBeLessThan(60 * tuning.ai.itemGiveUp);
    expect(reluctant).toBeGreaterThanOrEqual(60 * tuning.ai.itemGiveUp);
    expect(reluctant).toBeLessThan(60 * 20);
  });
});
