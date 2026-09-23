import { describe, expect, it } from 'vitest';
import { rngFloat, rngInt, rngPick, rngRange, seedRng } from './rng';

function sequence(seed: number, n: number): number[] {
  const holder = { rngState: seedRng(seed) };
  return Array.from({ length: n }, () => rngFloat(holder));
}

describe('rng', () => {
  it('repeats the same sequence for the same seed', () => {
    expect(sequence(42, 100)).toEqual(sequence(42, 100));
  });

  it('differs for different seeds', () => {
    expect(sequence(1, 10)).not.toEqual(sequence(2, 10));
  });

  it('keeps range and int within bounds over 10k draws', () => {
    const holder = { rngState: seedRng(7) };
    for (let i = 0; i < 10_000; i += 1) {
      const r = rngRange(holder, -3, 5);
      expect(r).toBeGreaterThanOrEqual(-3);
      expect(r).toBeLessThan(5);
      const n = rngInt(holder, 1, 6);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it('rngInt reaches both ends of the range', () => {
    const holder = { rngState: seedRng(3) };
    const seen = new Set(Array.from({ length: 1000 }, () => rngInt(holder, 1, 3)));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('rngPick throws on an empty array', () => {
    expect(() => rngPick({ rngState: 1 }, [])).toThrow();
  });
});
