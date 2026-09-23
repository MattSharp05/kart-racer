import { describe, expect, it } from 'vitest';
import { scenarios } from '../../scenarios';
import { kartOnTrack } from '../../scenarios/tracks';
import { autopilotInput } from '../autopilot';
import { sunnyCircuit } from '../data/tracks/sunnyCircuit';
import { rngFloat, seedRng } from '../rng';
import { step } from '../step';
import { trackGeometry } from '../track';
import { DT, tuning } from '../tuning';
import {
  NEUTRAL_INPUT,
  type InputFrame,
  type ItemId,
  type SimEvent,
  type SimState,
} from '../types';
import { availableItems } from './index';
import { ITEM_ODDS, oddsRow, pickItem } from './odds';

const geometry = trackGeometry(sunnyCircuit);
const ALL_ITEMS: ItemId[] = ['mushroom', 'banana', 'green', 'red', 'star', 'lightning'];

function run(state: SimState, ticks: number, input: (s: SimState) => Partial<InputFrame>) {
  const events: SimEvent[] = [];
  let s = state;
  for (let i = 0; i < ticks; i += 1) {
    const result = step(s, [{ ...NEUTRAL_INPUT, ...input(s) }]);
    s = result.state;
    events.push(...result.events);
  }
  return { state: s, events };
}

describe('item odds', () => {
  it('every position row sums to 1', () => {
    for (const row of ITEM_ODDS) {
      expect(Object.values(row).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    }
  });

  it('1st place never gets a star or lightning (10k rolls)', () => {
    const rng = { rngState: seedRng(1) };
    for (let i = 0; i < 10_000; i += 1) {
      const item = pickItem(oddsRow(1, 8), rngFloat(rng), ALL_ITEMS);
      expect(item === 'star' || item === 'lightning').toBe(false);
    }
  });

  it('8th place gets star or lightning at least 25% of the time (10k rolls)', () => {
    const rng = { rngState: seedRng(2) };
    let catchUp = 0;
    for (let i = 0; i < 10_000; i += 1) {
      const item = pickItem(oddsRow(8, 8), rngFloat(rng), ALL_ITEMS);
      if (item === 'star' || item === 'lightning') catchUp += 1;
    }
    expect(catchUp / 10_000).toBeGreaterThanOrEqual(0.25);
  });

  it('only hands out items that have been built', () => {
    const rng = { rngState: seedRng(3) };
    for (let i = 0; i < 1000; i += 1) {
      expect(availableItems()).toContain(pickItem(oddsRow(1, 8), rngFloat(rng), availableItems()));
    }
  });
});

describe('item boxes and the roulette', () => {
  it('driving through a box gives an item 1.5 s later', () => {
    const start = scenarios.get('item-box-ahead')!.setup(1).state;
    const { state, events } = run(start, 180, (s) => autopilotInput(s.karts[0]!, geometry));
    const hit = events.findIndex((e) => e.type === 'itemBoxHit');
    const granted = events.findIndex((e) => e.type === 'itemGranted');
    expect(hit).toBeGreaterThanOrEqual(0);
    expect(granted).toBeGreaterThan(hit);
    expect(state.karts[0]!.item.held).not.toBeNull();
  });

  it('a box you hit comes back after 2 s', () => {
    const start = scenarios.get('item-box-ahead')!.setup(1).state;
    let s = start;
    let boxId = -1;
    for (let i = 0; i < 180 && boxId < 0; i += 1) {
      const result = step(s, [autopilotInput(s.karts[0]!, geometry)]);
      s = result.state;
      const hit = result.events.find((e) => e.type === 'itemBoxHit');
      if (hit && hit.type === 'itemBoxHit') boxId = hit.boxId;
    }
    const box = () => s.entities.find((e) => e.id === boxId)!;
    expect(box().respawnTimer).toBeCloseTo(tuning.itemBoxRespawnSeconds, 1);
    s = run(s, Math.round(tuning.itemBoxRespawnSeconds / DT), () => ({})).state;
    expect(box().respawnTimer).toBe(0);
  });

  it('with a full slot, hitting a box does not re-roll', () => {
    const start = scenarios.get('item-box-ahead')!.setup(1).state;
    start.karts[0]!.item.held = 'mushroom';
    const { events, state } = run(start, 180, (s) => autopilotInput(s.karts[0]!, geometry));
    expect(events.some((e) => e.type === 'itemBoxHit')).toBe(true);
    expect(events.some((e) => e.type === 'itemGranted')).toBe(false);
    expect(state.karts[0]!.item.held).toBe('mushroom');
  });

  it('you cannot use an item while the roulette is still spinning', () => {
    const start = scenarios.get('item-roulette')!.setup(1).state;
    const { events } = run(start, 10, () => ({ item: true }));
    expect(events.some((e) => e.type === 'itemUsed')).toBe(false);
  });
});

describe('mushroom', () => {
  it('gives a 1.5 s boost when used, once per press', () => {
    const start = kartOnTrack(1, 'sunny-circuit', 0.02, { speed: 20 });
    start.karts[0]!.item.held = 'mushroom';
    const { state, events } = run(start, 3, () => ({ throttle: 1, item: true }));
    expect(events.filter((e) => e.type === 'itemUsed')).toHaveLength(1);
    expect(state.karts[0]!.boostTimer).toBeCloseTo(tuning.mushroomSeconds - 2 * DT, 5);
    expect(state.karts[0]!.item.held).toBeNull();
  });

  it('a second mushroom resets the boost timer instead of stacking speed', () => {
    const start = kartOnTrack(1, 'sunny-circuit', 0.02, { speed: 24 });
    start.karts[0]!.boostTimer = 1.0;
    start.karts[0]!.item.held = 'mushroom';
    const { state } = run(start, 1, () => ({ throttle: 1, item: true }));
    expect(state.karts[0]!.boostTimer).toBeLessThanOrEqual(tuning.mushroomSeconds);
    expect(state.karts[0]!.speed).toBeLessThanOrEqual(tuning.topSpeed[100] * tuning.boostSpeed);
  });
});
