// MK8 Mode's item odds (MK-103). Source: Super Mario Wiki, "Mario Kart 8 item probability
// distributions" (https://www.mariowiki.com/Mario_Kart_8_item_probability_distributions, read
// 2026-10-03), the Grand Prix table for drivers controlled by players, Mario Kart 8 v4.1, which
// codes each chance as a percentage × 2 (every row sums to 200).
//
// MK8 picks a row by the driver's distance behind the leader (≤ 400, 1000, 2000, 3300, 5500, 8000,
// 13000, 26000 units, then further; its last two rows are equal, so they are one row here). We pick
// by race position: 1st place uses the first row, last place the last, and the places between are
// spread evenly (`sim/items/odds.ts` `rowIndex`). Our own five items are mixed in at low weights
// (about 5 % of a row, `OURS`), in the same units: the roulette divides by each row's total.

/** MK8's columns, by our item id (`MK8_ITEM_IDS`): MK8's chance × 2 in each distance row. */
export const MK8_TABLE = {
  banana: [65, 20, 10, 0, 0, 0, 0, 0, 0],
  green: [50, 25, 20, 15, 0, 0, 0, 0, 0],
  red: [5, 50, 30, 20, 10, 0, 0, 0, 0],
  mushroom: [5, 20, 25, 50, 30, 10, 0, 0, 0],
  'bob-omb': [0, 10, 15, 5, 0, 0, 0, 0, 0],
  'ink-cloud': [0, 0, 0, 5, 5, 0, 0, 0, 0],
  'spiny-shell': [0, 0, 0, 0, 5, 5, 5, 0, 0],
  // Triple Mushrooms: our Turbo Trio is the same item (three boosts).
  'turbo-trio': [0, 0, 15, 60, 85, 65, 35, 10, 30],
  star: [0, 0, 0, 0, 25, 40, 35, 30, 40],
  'bullet-bill': [0, 0, 0, 0, 10, 30, 60, 85, 70],
  lightning: [0, 0, 0, 0, 0, 5, 10, 15, 0],
  'golden-mushroom': [0, 0, 0, 0, 25, 40, 55, 60, 60],
  'fire-flower': [0, 10, 10, 5, 0, 0, 0, 0, 0],
  'piranha-plant': [0, 10, 15, 5, 0, 0, 0, 0, 0],
  'super-horn': [5, 5, 5, 0, 0, 0, 0, 0, 0],
  boomerang: [0, 5, 10, 10, 0, 0, 0, 0, 0],
  coin: [70, 15, 5, 0, 0, 0, 0, 0, 0],
  'triple-banana': [0, 15, 10, 0, 0, 0, 0, 0, 0],
  'triple-green': [0, 10, 10, 10, 0, 0, 0, 0, 0],
  'triple-red': [0, 5, 15, 10, 0, 0, 0, 0, 0],
  'crazy-8': [0, 0, 5, 5, 5, 5, 0, 0, 0],
} as const satisfies Record<string, readonly number[]>;

/**
 * Our five unique items (PRD v3), in MK8's units: defensive ones up front, catch-up ones at the
 * back, each at most 6 of a row's 200.
 */
export const OURS = {
  'bubble-shield': [6, 5, 4, 2, 0, 0, 0, 0, 0],
  'oil-slick': [6, 5, 4, 3, 2, 0, 0, 0, 0],
  'hornet-swarm': [0, 2, 4, 5, 5, 4, 3, 0, 0],
  magnet: [0, 2, 3, 4, 5, 5, 4, 3, 0],
  phase: [0, 0, 2, 3, 4, 5, 5, 4, 4],
} as const satisfies Record<string, readonly number[]>;

/** MK8 Mode's whole odds table: MK8's items and ours, 9 rows (1st place's first). */
export const MK8_ODDS: Readonly<Record<string, readonly number[]>> = { ...MK8_TABLE, ...OURS };
