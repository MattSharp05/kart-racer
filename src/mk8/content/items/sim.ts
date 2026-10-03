import { ODDS_ROWS, type ItemContent } from '../../../content/items';

/**
 * A new MK8 item's sim: never handed out by the original game's roulette (zero odds there). Its own
 * file, so item folders can use it without importing `./index.ts`, which lists them.
 */
export function mk8ItemSim(def: Omit<ItemContent, 'odds'>): ItemContent {
  return { ...def, odds: Array.from({ length: ODDS_ROWS }, () => 0) };
}
