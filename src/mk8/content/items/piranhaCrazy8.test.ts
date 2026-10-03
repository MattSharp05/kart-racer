import { beforeAll, describe, expect, it } from 'vitest';
import { items } from '../../../content/items';
import { itemViews } from '../../../content/items/render';
import {
  CRAZY8_USES as SCENARIO_CRAZY8_USES,
  MK126_ITEMS,
  mk8CoinItem,
  mk8Crazy8,
  mk8Piranha,
} from '../../../scenarios/mk8/piranhaCrazy8';
import { forwardFromHeading } from '../../../sim/math';
import { step } from '../../../sim/step';
import { TICK_RATE, tuning } from '../../../sim/tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from '../../../sim/types';
import { registerMk8Content } from '../../register';
import { COIN_ITEM } from './coin/sim';
import { CRAZY8, CRAZY8_PRESSES, CRAZY8_RING, CRAZY8_USES, crazy8Ring } from './crazy-8/sim';
import { crazy8IconFor, CRAZY8_ICON } from './crazy-8/render';
import { PIRANHA, PIRANHA_DATA } from './piranha-plant/sim';
import { MK8_ITEMS } from '.';

beforeAll(() => registerMk8Content());

/** Steps `ticks` ticks, the player with `input`, everyone else idle; collects events. */
function run(state: SimState, ticks: number, input: Partial<InputFrame> = {}) {
  const events: SimEvent[] = [];
  let s = state;
  for (let i = 0; i < ticks; i += 1) {
    const inputs = s.karts.map((k) =>
      k.id === 0 ? { ...NEUTRAL_INPUT, ...input } : NEUTRAL_INPUT,
    );
    const result = step(s, inputs);
    s = result.state;
    events.push(...result.events);
  }
  return { state: s, events };
}

/** Presses and releases the item button once (2 ticks). */
function press(state: SimState, input: Partial<InputFrame> = {}) {
  const down = run(state, 1, { ...input, item: true });
  const up = run(down.state, 1, input);
  return { state: up.state, events: [...down.events, ...up.events] };
}

const used = (events: SimEvent[]) =>
  events.flatMap((e) => (e.type === 'itemUsed' && e.kartId === 0 ? [e.item] : []));

/** The piranha scenario with only kart 1 parked `ahead` m in front of the player (nothing else). */
function piranhaVsKart(ahead: number): SimState {
  const state = mk8Piranha(1);
  state.entities = state.entities.filter((e) => e.kind === 'itemBox');
  state.coins = [];
  const [player, other] = state.karts;
  if (!player || !other) throw new Error('scenario karts');
  const f = forwardFromHeading(player.heading);
  other.position = {
    x: player.position.x + f.x * ahead,
    y: player.position.y,
    z: player.position.z + f.z * ahead,
  };
  other.heading = player.heading;
  return state;
}

describe('MK-126 scenarios', () => {
  it("copy the items' ids and Crazy 8's uses", () => {
    expect(MK126_ITEMS).toEqual({ piranha: PIRANHA, coin: COIN_ITEM, crazy8: CRAZY8 });
    expect(SCENARIO_CRAZY8_USES).toBe(CRAZY8_USES);
  });

  it('are listed as MK8 items with sims', () => {
    for (const id of [PIRANHA, COIN_ITEM, CRAZY8]) {
      expect(MK8_ITEMS.find((item) => item.id === id)?.sim).toBeDefined();
      expect(items.has(id)).toBe(true);
    }
  });
});

describe('Piranha Plant (MK-126)', () => {
  it('a press puts it out front; it bites a kart within reach and boosts the user', () => {
    const { state, events } = press(piranhaVsKart(3));
    const player = state.karts[0]!;
    expect(player.effects.some((e) => e.kind === PIRANHA)).toBe(true);
    expect(player.item.held).toBe(PIRANHA);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'kartHit', kartId: 1, by: 0, kind: PIRANHA }),
    );
    expect(state.karts[1]!.spinTimer).toBeGreaterThan(0);
    expect(events).toContainEqual(expect.objectContaining({ type: 'boost', kartId: 0 }));
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'itemFx', kartId: 0, item: PIRANHA, fx: 'lunge' }),
    );
  });

  it('leaves karts out of reach or behind alone', () => {
    for (const ahead of [tuning.mk8.piranhaReach + 2, -3]) {
      const { state, events } = press(piranhaVsKart(ahead));
      expect(events.some((e) => e.type === 'kartHit')).toBe(false);
      expect(state.karts[1]!.spinTimer).toBe(0);
    }
  });

  it('eats a banana and a coin in front, then bites the kart; one lunge at a time', () => {
    const s = press(mk8Piranha(1)).state;
    // The banana 4 m ahead goes first.
    expect(s.entities.some((e) => e.kind === 'banana')).toBe(false);
    const lungeTicks = Math.round(tuning.mk8.piranhaLungeSeconds * TICK_RATE);
    const effect = s.karts[0]!.effects.find((e) => e.kind === PIRANHA)!;
    expect(effect.data[PIRANHA_DATA.cooldown]).toBeGreaterThan(lungeTicks - 3);
    // Drive on: the coin 11 m ahead, then the kart 22 m ahead.
    const { state, events } = run(s, 240, { throttle: 1 });
    expect(events.filter((e) => e.type === 'kartHit' && e.kartId === 1)).toHaveLength(1);
    expect(state.coins).toHaveLength(0);
    expect(state.karts[0]!.coins).toBe(1);
  });

  it('runs out after piranhaTime and empties the slot; lightning takes it early', () => {
    const s = press(piranhaVsKart(30)).state;
    const end = run(s, Math.round(tuning.mk8.piranhaTime * TICK_RATE) + 2).state;
    expect(end.karts[0]!.item.held).toBeNull();
    expect(end.karts[0]!.effects.some((e) => e.kind === PIRANHA)).toBe(false);

    const struck = structuredClone(s);
    struck.karts[0]!.item.held = null;
    struck.karts[0]!.item.uses = 0;
    const after = run(struck, 3).state;
    expect(after.karts[0]!.effects.some((e) => e.kind === PIRANHA)).toBe(false);
  });
});

describe('Coin item (MK-126)', () => {
  it('adds 2 coins', () => {
    const { state, events } = press(mk8CoinItem(1));
    expect(state.karts[0]!.coins).toBe(5);
    expect(state.karts[0]!.item.held).toBeNull();
    expect(events.filter((e) => e.type === 'coin' && e.kartId === 0)).toHaveLength(2);
  });

  it('never past 10, and from 0 on a kart without coins', () => {
    const full = mk8CoinItem(1);
    full.karts[0]!.coins = 9;
    expect(press(full).state.karts[0]!.coins).toBe(tuning.mk8.coins.max);
    const none = mk8CoinItem(1);
    delete none.karts[0]!.coins;
    expect(press(none).state.karts[0]!.coins).toBe(2);
  });
});

describe('Crazy 8 (MK-126)', () => {
  it('rings eight items; star and coin go off at once, then each press uses the next in order', () => {
    expect(CRAZY8_RING).toHaveLength(8);
    let s = mk8Crazy8(1);
    expect(crazy8Ring(s.karts[0]!)).toEqual([]);
    let r = press(s);
    s = r.state;
    const player = () => s.karts[0]!;
    expect(used(r.events)).toEqual(['star', 'coin', CRAZY8]);
    expect(player().starTimer).toBeGreaterThan(0);
    expect(player().coins).toBe(tuning.mk8.coinItemCoins);
    expect(crazy8Ring(player())).toEqual(CRAZY8_PRESSES);
    expect(CRAZY8_PRESSES).toEqual(['banana', 'green', 'red', 'mushroom', 'bob-omb', 'ink-cloud']);

    const order: string[] = [];
    for (const item of CRAZY8_PRESSES) {
      expect(player().item.held).toBe(CRAZY8);
      expect(crazy8Ring(player())[0]).toBe(item);
      r = press(s, { throttle: 1 });
      s = r.state;
      order.push(...used(r.events).filter((id) => id !== CRAZY8));
    }
    expect(order).toEqual(CRAZY8_PRESSES);
    // All eight used, and the slot is clear.
    expect(['star', 'coin', ...order].sort()).toEqual([...CRAZY8_RING].sort());
    expect(player().item.held).toBeNull();
    expect(crazy8Ring(player())).toEqual([]);
    // What each did: the banana, shells and Bob-omb are out; the leader was inked.
    expect(s.entities.some((e) => e.kind === 'banana')).toBe(true);
    expect(s.entities.some((e) => e.kind === 'item' && e.spec === 'bob-omb')).toBe(true);
    expect(s.karts[1]!.effects.some((e) => e.kind === 'ink-cloud')).toBe(true);
  });

  it("the HUD icon is the 8, then the next item's", () => {
    expect(crazy8IconFor(CRAZY8_USES)).toBe(CRAZY8_ICON);
    expect(crazy8IconFor(CRAZY8_USES - 1)).toBe(itemViews.get('banana').icon);
    expect(crazy8IconFor(1)).toBe(itemViews.get('ink-cloud').icon);
  });
});
