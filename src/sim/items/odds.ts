import { items, ODDS_ROWS } from '../../content/items';
import type { ItemId } from '../types';

/**
 * Chance of each item by race position (MK-16), assembled from each registered item's `odds`.
 * Row 0 = 1st place … row 7 = 8th. Leaders mostly get defensive items (banana, green shell); the
 * back of the pack gets catch-up items (star, lightning).
 */
export function oddsTable(): Record<ItemId, number>[] {
  return Array.from({ length: ODDS_ROWS }, (_, row) =>
    Object.fromEntries(items.list().map((item) => [item.id, item.odds[row] ?? 0])),
  );
}

/** Odds row for a race position among `racers` karts (positions are spread over the 8 rows). */
export function oddsRow(position: number, racers: number): Record<ItemId, number> {
  const last = ODDS_ROWS - 1;
  const row = racers <= 1 ? 0 : Math.round(((position - 1) / (racers - 1)) * last);
  return oddsTable()[Math.min(last, Math.max(0, row))] ?? {};
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
  const entries = available
    .map((item) => [item, odds[item] ?? 0] as const)
    .filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return available[0] ?? null;
  let threshold = roll * total;
  for (const [item, weight] of entries) {
    threshold -= weight;
    if (threshold < 0) return item;
  }
  return entries.at(-1)?.[0] ?? null;
}
