import { describe, expect, it } from 'vitest';
import { scenarios } from '../scenarios';
import { standingsOf } from '../net/host';
import { onlineResultLines, playerColour, recordFinish, recordLines } from './results';
import { getRecord, recordStorage, saveRaceRecord } from './storage/records';
import { MemoryStore, OverlayStore } from './storage/store';

describe('record lines (MK-44)', () => {
  it('flags new records with the previous best, and lists standing ones plainly', () => {
    const lines = recordLines({
      previous: { race: { time: 160, kart: 'boulder' }, lap: { time: 48, kart: 'swoop' } },
      record: { race: { time: 153.2, kart: 'maple' }, lap: { time: 48, kart: 'swoop' } },
      newRace: true,
      newLap: false,
    });
    expect(lines).toEqual([
      { label: 'Race record', time: 153.2, isNew: true, previous: 160 },
      { label: 'Lap record', time: 48, isNew: false },
    ]);
  });

  it('a first record has no previous best', () => {
    const lines = recordLines({
      previous: {},
      record: { race: { time: 150, kart: 'maple' } },
      newRace: true,
      newLap: false,
    });
    expect(lines).toEqual([{ label: 'Race record', time: 150, isNew: true }]);
  });
});

describe('recordFinish', () => {
  it("saves the local kart's finished race; ignores a kart that hasn't finished", () => {
    const state = scenarios.get('race-finished')!.setup(1).state;
    const store = new MemoryStore();
    const update = recordFinish(store, state, 0);
    expect(update?.newRace).toBe(true);
    expect(getRecord(store, state.trackId, state.engineClass).race?.kart).toBe(
      state.karts[0]?.kartType,
    );
    expect(recordFinish(store, state, 1)).toBeUndefined();
  });

  it('scenario records live in memory over the real store, which they never overwrite', () => {
    const real = new MemoryStore();
    real.set('kart-racer:muted', '1');
    const seeded = recordStorage('sunny-circuit', 100, { race: { time: 160, kart: 'maple' } });
    const store = new OverlayStore(real, seeded);
    expect(getRecord(store, 'sunny-circuit', 100)).toEqual({ race: { time: 160, kart: 'maple' } });
    expect(store.get('kart-racer:muted')).toBe('1');
    saveRaceRecord(store, 'sunny-circuit', 100, { kart: 'pixie', raceTime: 150, lapTimes: [] });
    expect(getRecord(store, 'sunny-circuit', 100).race?.time).toBe(150);
    expect(getRecord(real, 'sunny-circuit', 100)).toEqual({});
  });
});

describe('online result lines (MK-55)', () => {
  const state = () => scenarios.get('online-results')!.setup(1).state;

  it("lists all 8 from the host's standings, people marked in their colours, AI plain", () => {
    const s = state();
    const colours = ['#111111', '#222222', '#333333', '#444444'];
    const lines = onlineResultLines(s, standingsOf(s), 0, colours);
    expect(lines).toHaveLength(8);
    expect(lines.map((l) => l.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(lines[0]).toMatchObject({ name: 'Bob', racer: 'Boulder', human: true, you: false });
    expect(lines[0]?.colour).toBe('#333333');
    expect(lines[1]).toMatchObject({ name: 'Maya', you: true, human: true, colour: '#111111' });
    expect(lines[1]?.time).toBeCloseTo(62.08, 1);
    // An AI kart: its racer's name, no colour; the last two are still racing.
    expect(lines[2]).toMatchObject({ name: 'Pixie', human: false });
    expect(lines[2]?.colour).toBeUndefined();
    expect(lines.slice(6).every((l) => l.time === undefined)).toBe(true);
  });

  it("the host's frozen standings win over this device's live order", () => {
    const s = state();
    const standings = [...standingsOf(s)].reverse();
    expect(onlineResultLines(s, standings, 0).map((l) => l.name)[0]).toBe('Swoop');
    // No standings yet: the live order.
    expect(onlineResultLines(s, null, 0).map((l) => l.name)[0]).toBe('Bob');
  });

  it("a person's colour falls back to a swatch by kart when the lobby didn't send one", () => {
    expect(playerColour(['#abcdef'], 0)).toBe('#abcdef');
    expect(playerColour(['#abcdef', ''], 1)).toMatch(/^#[0-9a-f]{6}$/);
    expect(playerColour(undefined, 1)).not.toBe(playerColour(undefined, 2));
  });
});
