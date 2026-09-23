import { describe, expect, it } from 'vitest';
import { MemoryStore, readBests, recordBests, type KeyValueStore } from './storage';

describe('best times', () => {
  it('saves the first race as the best, then only improvements', () => {
    const store = new MemoryStore();
    const first = recordBests(store, 'sunny', 'maple', 100, [52, 50, 51], 160);
    expect(first).toMatchObject({
      bestLap: 50,
      bestRace: 160,
      newBestLap: true,
      newBestRace: true,
    });
    const slower = recordBests(store, 'sunny', 'maple', 100, [53, 52, 55], 165);
    expect(slower).toMatchObject({
      bestLap: 50,
      bestRace: 160,
      newBestLap: false,
      newBestRace: false,
    });
    const faster = recordBests(store, 'sunny', 'maple', 100, [49, 51, 50], 158);
    expect(faster).toMatchObject({
      bestLap: 49,
      bestRace: 158,
      newBestLap: true,
      newBestRace: true,
    });
  });

  it('keeps bests per kart and engine class', () => {
    const store = new MemoryStore();
    recordBests(store, 'sunny', 'maple', 100, [50], 150);
    expect(readBests(store, 'sunny', 'pixie', 100)).toEqual({});
    expect(readBests(store, 'sunny', 'maple', 150)).toEqual({});
  });

  it('persists across "reloads" (a new reader on the same store)', () => {
    const store = new MemoryStore();
    recordBests(store, 'sunny', 'boulder', 50, [60], 185);
    expect(readBests(store, 'sunny', 'boulder', 50)).toEqual({ bestLap: 60, bestRace: 185 });
  });

  it('survives broken or throwing storage', () => {
    const broken: KeyValueStore = {
      get: () => '{not json',
      set: () => {},
    };
    expect(readBests(broken, 'sunny', 'maple', 100)).toEqual({});
    expect(() => recordBests(broken, 'sunny', 'maple', 100, [50], 150)).not.toThrow();
  });
});
