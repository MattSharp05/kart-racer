import { describe, expect, it } from 'vitest';
import { scenarios } from '../scenarios';
import { recordFinish, recordLines } from './results';
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
