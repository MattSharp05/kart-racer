/**
 * Seeded mulberry32 RNG. The state is a single uint32 stored in SimState, so a
 * snapshot of the state also captures the random sequence (ADR 0001).
 */
export interface RngHolder {
  rngState: number;
}

/** Turns any number into a valid uint32 RNG state. */
export function seedRng(seed: number): number {
  return Math.floor(seed) >>> 0;
}

/** Returns a float in [0, 1) and advances `holder.rngState`. */
export function rngFloat(holder: RngHolder): number {
  const a = (holder.rngState + 0x6d2b79f5) | 0;
  holder.rngState = a >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Float in [min, max). */
export function rngRange(holder: RngHolder, min: number, max: number): number {
  return min + rngFloat(holder) * (max - min);
}

/** Integer in [min, max] (inclusive). */
export function rngInt(holder: RngHolder, min: number, max: number): number {
  return min + Math.floor(rngFloat(holder) * (max - min + 1));
}

export function rngPick<T>(holder: RngHolder, items: readonly T[]): T {
  if (items.length === 0) throw new Error('rngPick: empty array');
  return items[rngInt(holder, 0, items.length - 1)] as T;
}
