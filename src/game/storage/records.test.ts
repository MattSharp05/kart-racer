import { describe, expect, it } from 'vitest';
import { getRecord, saveRaceRecord, setRecord, today } from './records';
import { MemoryStore, type KeyValueStore } from './store';

const race = (kart: string, raceTime: number, lapTimes: number[]) => ({ kart, raceTime, lapTimes });

describe('track records', () => {
  it('saves the first race as the record, then only improvements', () => {
    const store = new MemoryStore();
    const first = saveRaceRecord(
      store,
      'sunny',
      100,
      race('maple', 160, [52, 50, 51]),
      '2026-09-01',
    );
    expect(first).toEqual({
      previous: {},
      record: {
        race: { time: 160, kart: 'maple', date: '2026-09-01' },
        lap: { time: 50, kart: 'maple', date: '2026-09-01' },
      },
      newRace: true,
      newLap: true,
    });

    const slower = saveRaceRecord(
      store,
      'sunny',
      100,
      race('pixie', 165, [53, 52, 55]),
      '2026-09-02',
    );
    expect(slower.newRace).toBe(false);
    expect(slower.newLap).toBe(false);
    expect(slower.record).toEqual(first.record);
    expect(getRecord(store, 'sunny', 100)).toEqual(first.record);

    const faster = saveRaceRecord(
      store,
      'sunny',
      100,
      race('pixie', 158, [49, 51, 50]),
      '2026-09-03',
    );
    expect(faster).toMatchObject({
      previous: first.record,
      record: {
        race: { time: 158, kart: 'pixie', date: '2026-09-03' },
        lap: { time: 49, kart: 'pixie', date: '2026-09-03' },
      },
      newRace: true,
      newLap: true,
    });
  });

  it('an equal time is not a new record', () => {
    const store = new MemoryStore();
    saveRaceRecord(store, 'sunny', 100, race('maple', 160, [50]));
    expect(saveRaceRecord(store, 'sunny', 100, race('maple', 160, [50]))).toMatchObject({
      newRace: false,
      newLap: false,
    });
  });

  it('tracks the best lap separately from the race time', () => {
    const store = new MemoryStore();
    saveRaceRecord(store, 'sunny', 100, race('maple', 160, [52, 50, 51]), 'd1');
    // Slower race with a faster lap: only the lap record moves.
    const update = saveRaceRecord(store, 'sunny', 100, race('swoop', 170, [48, 60, 62]), 'd2');
    expect(update).toMatchObject({ newRace: false, newLap: true });
    expect(getRecord(store, 'sunny', 100)).toEqual({
      race: { time: 160, kart: 'maple', date: 'd1' },
      lap: { time: 48, kart: 'swoop', date: 'd2' },
    });
    // Faster race with no lap times: only the race record moves.
    const noLaps = saveRaceRecord(store, 'sunny', 100, race('maple', 150, []), 'd3');
    expect(noLaps).toMatchObject({ newRace: true, newLap: false });
    expect(noLaps.record.lap).toEqual({ time: 48, kart: 'swoop', date: 'd2' });
  });

  it('keeps records per track and engine class, independent of the kart', () => {
    const store = new MemoryStore();
    saveRaceRecord(store, 'sunny', 100, race('maple', 150, [50]));
    expect(getRecord(store, 'sunny', 150)).toEqual({});
    expect(getRecord(store, 'other', 100)).toEqual({});
    expect(saveRaceRecord(store, 'sunny', 100, race('pixie', 155, [51])).newRace).toBe(false);
  });

  it('migrates the MVP per-kart bests: the best race and best lap across karts', () => {
    const store = new MemoryStore();
    store.set('kart-racer:bests:sunny:maple:100', JSON.stringify({ bestLap: 49.5, bestRace: 160 }));
    store.set('kart-racer:bests:sunny:pixie:100', JSON.stringify({ bestLap: 50.1, bestRace: 155 }));
    store.set('kart-racer:bests:sunny:boulder:100', JSON.stringify({ bestRace: 170 }));
    store.set('kart-racer:bests:sunny:swoop:150', JSON.stringify({ bestLap: 40, bestRace: 130 }));
    const record = getRecord(store, 'sunny', 100);
    expect(record).toEqual({
      race: { time: 155, kart: 'pixie' },
      lap: { time: 49.5, kart: 'maple' },
    });
    // Written once under the new key, so later saves compare against the migrated best.
    expect(JSON.parse(store.get('kart-racer:records:sunny:100') ?? '')).toEqual(record);
    expect(saveRaceRecord(store, 'sunny', 100, race('maple', 156, [49.6])).newRace).toBe(false);
    expect(saveRaceRecord(store, 'sunny', 100, race('maple', 154, [49.6])).newRace).toBe(true);
  });

  it('does not re-migrate once records exist', () => {
    const store = new MemoryStore();
    setRecord(store, 'sunny', 100, { race: { time: 170, kart: 'maple' } });
    store.set('kart-racer:bests:sunny:pixie:100', JSON.stringify({ bestRace: 150 }));
    expect(getRecord(store, 'sunny', 100)).toEqual({ race: { time: 170, kart: 'maple' } });
  });

  it('persists across "reloads" (a new reader on the same store)', () => {
    const store = new MemoryStore();
    saveRaceRecord(store, 'sunny', 50, race('boulder', 185, [60]), 'd');
    const again = { get: (k: string) => store.get(k), set: () => {} };
    expect(getRecord(again, 'sunny', 50)).toEqual({
      race: { time: 185, kart: 'boulder', date: 'd' },
      lap: { time: 60, kart: 'boulder', date: 'd' },
    });
  });

  it('survives broken or throwing storage, and ignores malformed entries', () => {
    const broken: KeyValueStore = {
      get: () => '{not json',
      set: () => {},
    };
    expect(getRecord(broken, 'sunny', 100)).toEqual({});
    expect(() => saveRaceRecord(broken, 'sunny', 100, race('maple', 150, [50]))).not.toThrow();
    const store = new MemoryStore();
    store.set('kart-racer:records:sunny:100', JSON.stringify({ race: { time: 'x' }, lap: 5 }));
    expect(getRecord(store, 'sunny', 100)).toEqual({});
  });

  it('formats today as YYYY-MM-DD', () => {
    expect(today(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
