import type { ItemId } from '../types';

const LEADER_ODDS: Record<ItemId, number> = {
  banana: 0.45,
  green: 0.4,
  mushroom: 0.15,
  red: 0,
  star: 0,
  lightning: 0,
};

/**
 * Chance of each item by race position (MK-16). Row 0 = 1st place … row 7 = 8th. Leaders mostly get
 * defensive items (banana, green shell); the back of the pack gets catch-up items (star, lightning).
 */
export const ITEM_ODDS: Record<ItemId, number>[] = [
  LEADER_ODDS,
  { banana: 0.25, green: 0.3, mushroom: 0.25, red: 0.2, star: 0, lightning: 0 },
  { banana: 0.15, green: 0.2, mushroom: 0.3, red: 0.35, star: 0, lightning: 0 },
  { banana: 0.1, green: 0.15, mushroom: 0.35, red: 0.4, star: 0, lightning: 0 },
  { banana: 0, green: 0.1, mushroom: 0.35, red: 0.35, star: 0.12, lightning: 0.08 },
  { banana: 0, green: 0, mushroom: 0.35, red: 0.3, star: 0.2, lightning: 0.15 },
  { banana: 0, green: 0, mushroom: 0.3, red: 0.25, star: 0.25, lightning: 0.2 },
  { banana: 0, green: 0, mushroom: 0.25, red: 0.2, star: 0.3, lightning: 0.25 },
];

/** Odds row for a race position among `racers` karts (positions are spread over the 8 rows). */
export function oddsRow(position: number, racers: number): Record<ItemId, number> {
  const last = ITEM_ODDS.length - 1;
  const row = racers <= 1 ? 0 : Math.round(((position - 1) / (racers - 1)) * last);
  return ITEM_ODDS[Math.min(last, Math.max(0, row))] ?? LEADER_ODDS;
}

/**
 * Picks an item with random number `roll` in [0, 1), from the odds row, among the `available`
 * items only (items not built yet are left out and the rest renormalised).
 */
export function pickItem(
  odds: Record<ItemId, number>,
  roll: number,
  available: readonly ItemId[],
): ItemId | null {
  const entries = available.map((item) => [item, odds[item]] as const).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return available[0] ?? null;
  let threshold = roll * total;
  for (const [item, weight] of entries) {
    threshold -= weight;
    if (threshold < 0) return item;
  }
  return entries.at(-1)?.[0] ?? null;
}
