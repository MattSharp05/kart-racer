import { items, itemSets, ODDS_ROWS } from '../../content/items';
import type { ItemId } from '../types';

/**
 * Chance of each item by race position (MK-16), assembled from each registered item's `odds`.
 * Row 0 = 1st place … row 7 = 8th; each row sums to 1 (MK-72). Leaders mostly get defensive items
 * (banana, green shell, bubble shield, oil); the back of the pack gets catch-up items (star,
 * turbo trio, magnet, phase, lightning). The MK-72 balance run: `pnpm item-balance`.
 */
export function oddsTable(): Record<ItemId, number>[] {
  return Array.from({ length: ODDS_ROWS }, (_, row) =>
    Object.fromEntries(items.list().map((item) => [item.id, item.odds[row] ?? 0])),
  );
}

/** Which of `rows` odds rows a race position among `racers` karts uses (spread evenly). */
export function rowIndex(position: number, racers: number, rows: number): number {
  const last = rows - 1;
  const row = racers <= 1 ? 0 : Math.round(((position - 1) / (racers - 1)) * last);
  return Math.min(last, Math.max(0, row));
}

/** Odds row for a race position among `racers` karts (positions are spread over the 8 rows). */
export function oddsRow(position: number, racers: number): Record<ItemId, number> {
  return oddsTable()[rowIndex(position, racers, ODDS_ROWS)] ?? {};
}

/** A registered item set's odds row (MK-103) for a race position among `racers` karts. */
export function itemSetOddsRow(
  setId: string,
  position: number,
  racers: number,
): Record<ItemId, number> {
  const odds = itemSets.get(setId).odds;
  const rows = Math.max(0, ...Object.values(odds).map((row) => row.length));
  const row = rowIndex(position, racers, rows);
  return Object.fromEntries(
    Object.entries(odds).map(([item, weights]) => [item, weights[row] ?? 0]),
  );
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
