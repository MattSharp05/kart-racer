import type { InputFrame, KartState, SimEvent, SimState } from '../../sim/types';
import { Registry } from '../registry';
import banana from './banana/sim';
import green from './green/sim';
import lightning from './lightning/sim';
import mushroom from './mushroom/sim';
import red from './red/sim';
import star from './star/sim';

/** Rows in the item odds table: row 0 = 1st place … the last row = last place (MK-16). */
export const ODDS_ROWS = 8;

/**
 * An item (ADR 0007): `src/content/items/<id>/sim.ts` default-exports one of these (pure sim
 * code); its icon, use sound and world renderer are in `./render.ts`.
 */
export interface ItemContent {
  id: string;
  /** Shown as the HUD item slot's tooltip. */
  name: string;
  /** Roulette and tie-break order. */
  order: number;
  /** Chance weight in each odds row (`ODDS_ROWS` numbers, 1st place first); each row sums to 1. */
  odds: readonly number[];
  /** Runs when the holder presses the item button. Mutates `state` (the tick's clone). */
  onUse(kart: KartState, state: SimState, events: SimEvent[], input: InputFrame): void;
  /**
   * Runs once per tick, before karts pick up or use items, to move this item's world entities.
   * Items that share one function (green and red shells) run it once.
   */
  update?(state: SimState, dt: number, events: SimEvent[]): void;
}

/** Every item. The odds table and `sim/items` read it live, so a registered item is in play. */
export const items = new Registry<ItemContent>('item');

/** Registers an item after checking its odds row count. */
export function registerItem(item: ItemContent): ItemContent {
  if (item.odds.length !== ODDS_ROWS) {
    throw new Error(`Item ${item.id}: odds needs ${ODDS_ROWS} rows, got ${item.odds.length}`);
  }
  return items.register(item);
}

// One line per item folder, alphabetical (a unit test checks none is missing).
for (const item of [banana, green, lightning, mushroom, red, star]) registerItem(item);
