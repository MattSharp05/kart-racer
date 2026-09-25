import { describe, expect, it } from 'vitest';
import { scenarios } from '../scenarios';
import { recordFinish, recordLines } from './results';
import { getRecord, recordStorage } from './storage/records';
import { MemoryStore } from './storage/store';

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

  it('reads records seeded by a scenario', () => {
    const store = new MemoryStore();
    const seeded = recordStorage('sunny-circuit', 100, { race: { time: 1, kart: 'maple' } });
    for (const [key, value] of Object.entries(seeded)) store.set(key, value);
    expect(getRecord(store, 'sunny-circuit', 100)).toEqual({ race: { time: 1, kart: 'maple' } });
  });
});
