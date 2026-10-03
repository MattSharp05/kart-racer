import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../game/storage/store';
import { saveTrophy, savedTrophy, TROPHIES_KEY } from './trophies';

describe('Grand Prix trophies (MK-130)', () => {
  it('are saved per cup and engine class, keeping the best', () => {
    const store = new MemoryStore();
    expect(savedTrophy(store, 'mushroom', 150)).toBeUndefined();
    expect(saveTrophy(store, 'mushroom', 150, 'silver')).toBe('silver');
    expect(saveTrophy(store, 'mushroom', 150, 'bronze')).toBe('silver');
    expect(saveTrophy(store, 'mushroom', 150, 'gold')).toBe('gold');
    expect(savedTrophy(store, 'mushroom', 150)).toBe('gold');
    expect(savedTrophy(store, 'mushroom', 100)).toBeUndefined();
    saveTrophy(store, 'mushroom', 100, 'bronze');
    expect(savedTrophy(store, 'mushroom', 100)).toBe('bronze');
    expect(savedTrophy(store, 'mushroom', 150)).toBe('gold');
  });

  it('ignores a damaged save', () => {
    const store = new MemoryStore();
    store.set(TROPHIES_KEY, '{"mushroom":{"150":"platinum","200":"gold"},"flower":3}');
    expect(savedTrophy(store, 'mushroom', 150)).toBeUndefined();
    expect(savedTrophy(store, 'mushroom', 200)).toBe('gold');
    store.set(TROPHIES_KEY, 'not json');
    expect(savedTrophy(store, 'mushroom', 200)).toBeUndefined();
  });
});
