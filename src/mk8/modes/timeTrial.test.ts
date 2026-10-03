import { beforeAll, describe, expect, it } from 'vitest';
import { MemoryStore } from '../../game/storage/store';
import { createRace } from '../../sim/race/createRace';
import { step } from '../../sim/step';
import { DT } from '../../sim/tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from '../../sim/types';
import { MK8_ITEM_SET } from '../content/items/id';
import { raceSetup } from '../flow';
import { registerMk8Content } from '../register';
import { applyModeRules } from './index';
import { courseRecord, raceClock, recordTrack, saveTimeTrial, TIME_TRIAL_ITEM } from './timeTrial';

beforeAll(() => registerMk8Content());

/** A Time Trial as the menus start one: the setup's field, then the mode's rules. */
function timeTrial(): SimState {
  const setup = raceSetup({ mode: 'time-trial', course: 'stadium' });
  const state = createRace({
    trackId: 'sunny-circuit',
    racers: setup.field ?? [],
    engineClass: setup.engineClass,
    itemsOn: true,
    seed: 3,
    itemSet: setup.itemSet,
  });
  applyModeRules(state, setup);
  return state;
}

function run(state: SimState, ticks: number, input: Partial<InputFrame> = {}) {
  const events: SimEvent[] = [];
  let s = state;
  for (let i = 0; i < ticks; i++) {
    const result = step(s, [{ ...NEUTRAL_INPUT, throttle: 1, ...input }]);
    s = result.state;
    events.push(...result.events);
  }
  return { state: s, events };
}

/** The race finished at `time` s with these laps. */
function finished(state: SimState, time: number, lapTimes: number[]): SimState {
  const kart = state.karts[0]!;
  kart.race = { ...kart.race, lapTimes, finishTick: state.race.goTick + Math.round(time / DT) };
  state.tick = (kart.race.finishTick ?? 0) + 1;
  return state;
}

describe('Time Trial (MK-131)', () => {
  it('races the player alone: no AI karts, no item boxes, Triple Mushrooms in the slot', () => {
    const state = timeTrial();
    expect(state.karts).toHaveLength(1);
    expect(state.karts[0]?.controller).toBe('local');
    expect(state.karts.some((k) => k.ai)).toBe(false);
    expect(state.race.rubberBand).toBeFalsy();
    expect(state.itemSet).toBe(MK8_ITEM_SET);
    expect(state.entities.some((e) => e.kind === 'itemBox')).toBe(false);
    expect(state.timeTrial).toBe(true);
    expect(state.karts[0]?.item).toMatchObject({ held: TIME_TRIAL_ITEM, uses: 3 });
  });

  it('gives exactly 3 mushroom uses', () => {
    let state = run(timeTrial(), Math.round(4 / DT)).state;
    expect(state.phase).toBe('racing');
    let used = 0;
    for (let press = 0; press < 5; press++) {
      const down = run(state, 1, { item: true });
      used += down.events.filter((e) => e.type === 'itemUsed').length;
      state = run(down.state, Math.round(1 / DT)).state;
    }
    expect(used).toBe(3);
    expect(state.karts[0]?.item.held).toBeNull();
  });

  it('keeps the faster time: a better race replaces the record, a slower one doesn’t', () => {
    const store = new MemoryStore();
    const first = saveTimeTrial(
      store,
      'stadium',
      finished(timeTrial(), 80, [27, 26, 27]),
      0,
      'mk8-mario',
    );
    expect(first).toMatchObject({ newRace: true, newLap: true });
    expect(courseRecord(store, 'stadium', 150).race?.time).toBeCloseTo(80);

    const slower = saveTimeTrial(
      store,
      'stadium',
      finished(timeTrial(), 82, [28, 25, 29]),
      0,
      'mk8-luigi',
    );
    // Slower race, but a faster lap: only the lap is new.
    expect(slower).toMatchObject({ newRace: false, newLap: true });
    expect(courseRecord(store, 'stadium', 150).race).toMatchObject({ kart: 'mk8-mario' });
    expect(courseRecord(store, 'stadium', 150).race?.time).toBeCloseTo(80);
    expect(courseRecord(store, 'stadium', 150).lap?.time).toBe(25);

    const faster = saveTimeTrial(
      store,
      'stadium',
      finished(timeTrial(), 78, [26, 26, 26]),
      0,
      'mk8-peach',
    );
    expect(faster?.newRace).toBe(true);
    expect(courseRecord(store, 'stadium', 150).race).toMatchObject({ kart: 'mk8-peach' });
    expect(courseRecord(store, 'stadium', 150).race?.time).toBeCloseTo(78);
  });

  it('keeps records per course and engine class, apart from our own tracks', () => {
    const store = new MemoryStore();
    saveTimeTrial(store, 'stadium', finished(timeTrial(), 80, [27, 26, 27]), 0, 'mk8-mario');
    expect(courseRecord(store, 'stadium', 200)).toEqual({});
    expect(courseRecord(store, 'canyon', 150)).toEqual({});
    expect(recordTrack('stadium')).toBe('mk8:stadium');
    expect(store.get('kart-racer:records:sunny-circuit:150')).toBeNull();
  });

  it('saves nothing before the finish; the clock runs from GO', () => {
    const store = new MemoryStore();
    const state = timeTrial();
    expect(raceClock(state, 0)).toBe(0);
    expect(saveTimeTrial(store, 'stadium', state, 0, 'mk8-mario')).toBeUndefined();
    const later = run(state, Math.round(5 / DT)).state;
    expect(raceClock(later, 0)).toBeGreaterThan(0);
  });
});
