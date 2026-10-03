import { beforeAll, describe, expect, it } from 'vitest';
import { items } from '../../../content/items';
import { mk8Golden, mk8TripleItem } from '../../../scenarios/mk8';
import { hitKart } from '../../../sim/items/hit';
import { forwardFromHeading } from '../../../sim/math';
import { step } from '../../../sim/step';
import { DT, tuning } from '../../../sim/tuning';
import {
  NEUTRAL_INPUT,
  type InputFrame,
  type ItemEntity,
  type KartState,
  type SimEvent,
  type SimState,
} from '../../../sim/types';
import { registerMk8Content } from '../../register';
import { escortPose, isBehind } from './escort';
import { GOLDEN } from './golden-mushroom/sim';
import { TRIPLE_USES } from './triple-green/sim';

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

/** `kartId`'s escorts (circling shells or trailing bananas) of `item`. */
const escortsOf = (s: SimState, item: string, kartId = 0) =>
  s.entities.filter(
    (e): e is ItemEntity => e.kind === 'item' && e.spec === item && e.ownerId === kartId,
  );

const hits = (events: SimEvent[], kartId: number) =>
  events.filter((e) => e.type === 'kartHit' && e.kartId === kartId);

/** The scenario's state without its incoming shell (for tests that don't want it). */
function quiet(item: string): SimState {
  const state = mk8TripleItem(1, item);
  state.entities = state.entities.filter((e) => e.kind !== 'shell');
  return state;
}

describe('MK8 triple items (MK-112)', () => {
  it.each(['triple-green', 'triple-red', 'triple-banana'])(
    '%s: one escort per use, around or behind the kart',
    (item) => {
      const s = run(quiet(item), 1).state;
      const kart = s.karts[0]!;
      const escorts = escortsOf(s, item);
      expect(escorts).toHaveLength(TRIPLE_USES);
      for (const e of escorts) {
        const d = Math.hypot(e.position.x - kart.position.x, e.position.z - kart.position.z);
        if (item === 'triple-banana') {
          expect(isBehind(kart, e.position)).toBe(true);
          expect(d).toBeGreaterThanOrEqual(tuning.mk8.trailFirst - 1e-6);
        } else {
          expect(d).toBeCloseTo(tuning.mk8.orbitRadius, 6);
        }
      }
    },
  );

  it('circling shells go round the kart, evenly spread', () => {
    const kart = quiet('triple-red').karts[0]!;
    const angle = (tick: number, k: number) => {
      const p = escortPose('orbit', kart, k, 3, tick);
      return Math.atan2(p.z - kart.position.z, p.x - kart.position.x);
    };
    const turn = (a: number, b: number) =>
      (((b - a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    expect(turn(angle(0, 0), angle(0, 1))).toBeCloseTo((Math.PI * 2) / 3, 6);
    expect(turn(angle(0, 0), angle(1, 0))).toBeCloseTo(tuning.mk8.orbitSpeed * DT, 6);
  });

  it.each(['triple-green', 'triple-red', 'triple-banana'])(
    '%s: each use decrements the count and fires one; the item clears at 0',
    (item) => {
      let state = run(quiet(item), 1).state;
      for (let use = 1; use <= TRIPLE_USES; use += 1) {
        const result = press(state);
        state = result.state;
        expect(result.events.filter((e) => e.type === 'itemUsed')).toHaveLength(1);
        const left = TRIPLE_USES - use;
        expect(state.karts[0]!.item).toMatchObject({ held: left ? item : null, uses: left });
        expect(escortsOf(state, item)).toHaveLength(left);
      }
      const fired = item === 'triple-banana' ? 'banana' : 'shell';
      expect(state.entities.filter((e) => e.kind === fired).length).toBeGreaterThan(0);
      // A 4th press does nothing.
      expect(press(state).events.filter((e) => e.type === 'itemUsed')).toHaveLength(0);
    },
  );

  it('triple red shells fire red shells at the kart ahead', () => {
    const state = press(run(quiet('triple-red'), 1).state).state;
    const shell = state.entities.find((e) => e.kind === 'shell');
    expect(shell).toMatchObject({ colour: 'red', ownerId: 0, targetId: 1 });
  });

  it.each(['triple-green', 'triple-red', 'triple-banana'])(
    '%s: escorts block one hit from behind each, then the next one lands',
    (item) => {
      let state = run(quiet(item), 1).state;
      const behind = (s: SimState) => {
        const kart = s.karts[0]!;
        const f = forwardFromHeading(kart.heading);
        return { x: kart.position.x - f.x * 1.2, z: kart.position.z - f.z * 1.2 };
      };
      for (let blocked = 1; blocked <= TRIPLE_USES; blocked += 1) {
        const kart = state.karts[0]!;
        const events: SimEvent[] = [];
        expect(hitKart(kart, 2, 'green', events, { from: behind(state) })).toBe(false);
        expect(kart.spinTimer).toBe(0);
        expect(kart.item.uses).toBe(TRIPLE_USES - blocked);
        // Past the short blocked-hit immunity; the escorts follow the count.
        state = run(state, Math.ceil(tuning.blockedHitInvulnerableSeconds / DT) + 1).state;
        expect(escortsOf(state, item)).toHaveLength(TRIPLE_USES - blocked);
      }
      const kart = state.karts[0]!;
      expect(kart.item.held).toBeNull();
      expect(hitKart(kart, 2, 'green', [], { from: behind(state) })).toBe(true);
    },
  );

  it('a hit from the front, or from nowhere (lightning, a star), is not blocked', () => {
    const state = run(quiet('triple-green'), 1).state;
    const kart = state.karts[0]!;
    const f = forwardFromHeading(kart.heading);
    const ahead = { x: kart.position.x + f.x * 1.2, z: kart.position.z + f.z * 1.2 };
    expect(hitKart(kart, 1, 'green', [], { from: ahead })).toBe(true);
    expect(kart.item.uses).toBe(TRIPLE_USES);

    const other = run(quiet('triple-banana'), 1).state.karts[0]!;
    expect(hitKart(other, 1, 'star', [])).toBe(true);
    expect(other.item.uses).toBe(TRIPLE_USES);
  });

  it.each(['triple-red', 'triple-banana'])(
    '%s: a real green shell from behind is stopped by an escort, which goes too',
    (item) => {
      const { state, events } = run(mk8TripleItem(1, item), 90);
      expect(hits(events, 0)).toEqual([]);
      expect(state.entities.filter((e) => e.kind === 'shell')).toEqual([]);
      expect(state.karts[0]!.item).toMatchObject({ held: item, uses: TRIPLE_USES - 1 });
      expect(escortsOf(state, item)).toHaveLength(TRIPLE_USES - 1);
    },
  );

  it('an escort that touches another kart hits it and is used up', () => {
    const state = run(quiet('triple-banana'), 1).state;
    const [player, rival] = state.karts as [KartState, KartState];
    // Put the rival on the first trailing banana.
    const first = escortsOf(state, 'triple-banana')[0]!;
    rival.position = { ...first.position, y: player.position.y };
    const { state: after, events } = run(state, 1);
    expect(hits(events, 1)).toHaveLength(1);
    expect(hits(events, 1)[0]).toMatchObject({ by: 0, kind: 'triple-banana' });
    expect(after.karts[0]!.item.uses).toBe(TRIPLE_USES - 1);
    expect(escortsOf(after, 'triple-banana')).toHaveLength(TRIPLE_USES - 1);
  });

  it('escorts go when the item does (lightning drops it)', () => {
    let state = run(quiet('triple-green'), 1).state;
    state.karts[0]!.item.held = null;
    state.karts[0]!.item.uses = 0;
    state = run(state, 1).state;
    expect(escortsOf(state, 'triple-green')).toEqual([]);
  });

  it('triple mushrooms: three boosts, one per press, then the slot empties', () => {
    const state = mk8Golden(1);
    state.karts[0]!.item = { ...state.karts[0]!.item, held: 'triple-mushroom', uses: TRIPLE_USES };
    let s = state;
    let boosts = 0;
    for (let use = 1; use <= TRIPLE_USES + 1; use += 1) {
      const result = press(s);
      s = result.state;
      boosts += result.events.filter((e) => e.type === 'boost').length;
      expect(s.karts[0]!.item.uses).toBe(Math.max(0, TRIPLE_USES - use));
    }
    expect(boosts).toBe(TRIPLE_USES);
    expect(s.karts[0]!.item.held).toBeNull();
    expect(items.get('triple-mushroom').uses).toBe(TRIPLE_USES);
  });
});

describe('Golden Mushroom (MK-112)', () => {
  const goldenTicks = Math.round(tuning.mk8.goldenTime / DT);
  /** The scenario without item boxes (driving on would fill the slot again). */
  const golden = () => {
    const state = mk8Golden(1);
    state.entities = state.entities.filter((e) => e.kind !== 'itemBox');
    return state;
  };

  it('boosts on every press until its timer, counted from the first press, ends', () => {
    let state = golden();
    const boostTicks: number[] = [];
    // A press every 30 ticks (2 ticks pressing, 28 waiting) while it's still held.
    while (state.karts[0]!.item.held === GOLDEN) {
      const result = press(state);
      const used = result.events.filter((e) => e.type === 'itemUsed' && e.kartId === 0);
      const boosted = result.events.filter((e) => e.type === 'boost' && e.kartId === 0);
      expect(boosted).toHaveLength(used.length);
      if (boosted.length) boostTicks.push(result.state.tick);
      state = run(result.state, 28, { throttle: 1 }).state;
      expect(boostTicks.length).toBeLessThan(100);
    }
    // A boost on every press from the first until the timer ran out, and none after.
    const first = boostTicks[0]!;
    expect(boostTicks).toEqual(boostTicks.map((_, i) => first + i * 30));
    expect(boostTicks.at(-1)! - first).toBeLessThan(goldenTicks);
    expect(boostTicks.at(-1)! - first).toBeGreaterThanOrEqual(goldenTicks - 30);
    expect(state.karts[0]!.item.uses).toBe(0);
    expect(state.karts[0]!.effects.some((e) => e.kind === GOLDEN)).toBe(false);
  });

  it('the timer starts at the first press, not when it is picked up', () => {
    let state = run(golden(), 600).state;
    expect(state.karts[0]!.item.held).toBe(GOLDEN);
    state = press(state).state;
    const effect = state.karts[0]!.effects.find((e) => e.kind === GOLDEN);
    expect(effect?.ticksLeft).toBeGreaterThan(goldenTicks - 3);
    state = run(state, goldenTicks).state;
    expect(state.karts[0]!.item.held).toBeNull();
  });

  it('a press after the timer ends does nothing', () => {
    let state = press(golden()).state;
    state = run(state, goldenTicks + 1).state;
    expect(press(state).events.filter((e) => e.type === 'boost')).toEqual([]);
  });
});
