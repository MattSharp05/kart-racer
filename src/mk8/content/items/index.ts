// MK8 Mode's items (MK-103): the `mk8` item set (MK8's odds, two slots) and every MK8 item, as
// pure data (sim lint rules apply). Their looks are in `src/mk8/render/items/`.
//
// Adding an MK8 item (the item tickets after MK-103):
//  1. its odds column in `./odds.ts` (`MK8_TABLE` already names every MK8 item's id);
//  2. new behaviour: `src/mk8/content/items/<id>/sim.ts` default-exporting `mk8ItemSim({...})` (an
//     `ItemContent` without `odds`: it is never handed out in the original game);
//  3. one line in `MK8_ITEMS` below: its id, that sim, its pack model and its HUD icon sprite;
//  4. its look: a line in `src/mk8/render/items/index.ts` (an `ItemView` for a new item, drawn with
//     its pack model by `mk8EntityModel`).
import { ODDS_ROWS, type ItemContent, type ItemSetContent } from '../../../content/items';
import { MK8_ITEM_SET } from './id';
import { MK8_ODDS } from './odds';

export { MK8_ITEM_SET } from './id';
export { MK8_ODDS, MK8_TABLE, OURS } from './odds';

/** MK8 Mode's item rules: MK8's odds with our five mixed in, and a second item slot. */
export const mk8ItemSet: ItemSetContent = { id: MK8_ITEM_SET, odds: MK8_ODDS, slots: 2 };

/** One MK8 item: the new-item hook every MK8 item ticket fills in. */
export interface Mk8Item {
  /** Its sim id: our item's id for a reskin (`green`), its own for a new item (`spiny-shell`). */
  id: string;
  /** New behaviour (`mk8ItemSim`); reskins of our items keep our sim and have none. */
  sim?: ItemContent;
  /**
   * Its pack model (`models/items/<model>.glb`, ids from `tools/mk8/sources.json`); `null` when the
   * pack has none (a placeholder is drawn).
   */
  model: string | null;
  /** Its HUD icon (`ITEM_SPRITES` in `src/mk8/ui/sprites.ts`). */
  icon: string;
}

/** A new MK8 item's sim: never handed out by the original game's roulette (zero odds there). */
export function mk8ItemSim(def: Omit<ItemContent, 'odds'>): ItemContent {
  return { ...def, odds: Array.from({ length: ODDS_ROWS }, () => 0) };
}

/** MK8 Mode's items so far: our items with MK8 looks. One line per item. */
export const MK8_ITEMS: readonly Mk8Item[] = [
  { id: 'banana', model: 'banana', icon: 'i_banana' },
  { id: 'green', model: 'green-shell', icon: 'i_green' },
  { id: 'red', model: 'red-shell', icon: 'i_red' },
  { id: 'mushroom', model: 'mushroom', icon: 'i_mushroom' },
  { id: 'star', model: 'star', icon: 'i_star' },
  // The pack's lightning has no texture (BUILD_REPORT): the render side paints it yellow.
  { id: 'lightning', model: 'lightning', icon: 'i_lightning' },
  // Boomerang Flower = our boomerang; Blooper = our ink cloud.
  { id: 'boomerang', model: 'boomerang-flower', icon: 'i_boomerang' },
  { id: 'ink-cloud', model: 'blooper', icon: 'i_blooper' },
];

/** The item box's pack model. */
export const MK8_ITEM_BOX_MODEL = 'item-box';

/** The new items' sims, registered when MK8 Mode loads (`src/mk8/register.ts`). */
export function mk8ItemSims(): ItemContent[] {
  return MK8_ITEMS.flatMap((item) => (item.sim ? [item.sim] : []));
}
