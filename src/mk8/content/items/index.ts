// MK8 Mode's items (MK-103): the `mk8` item set (MK8's odds, two slots) and every MK8 item, as
// pure data (sim lint rules apply). Their looks are in `src/mk8/render/items/`.
//
// Adding an MK8 item (the item tickets after MK-103):
//  1. its odds column in `./odds.ts` (`MK8_TABLE` already names every MK8 item's id);
//  2. new behaviour: `src/mk8/content/items/<id>/sim.ts` default-exporting `mk8ItemSim({...})` (`./sim.ts`, an
//     `ItemContent` without `odds`: it is never handed out in the original game);
//  3. one line in `MK8_ITEMS` below: its id, that sim, its pack model and its HUD icon sprite;
//  4. its look: a line in `src/mk8/render/items/index.ts` (an `ItemView` for a new item, drawn with
//     its pack model by `mk8EntityModel`).
import type { ItemContent, ItemSetContent } from '../../../content/items';
import bobomb from './bob-omb/sim';
import bulletBill from './bullet-bill/sim';
import coin from './coin/sim';
import crazy8 from './crazy-8/sim';
import fireFlower from './fire-flower/sim';
import goldenMushroom from './golden-mushroom/sim';
import { MK8_ITEM_SET } from './id';
import { MK8_ODDS } from './odds';
import piranhaPlant from './piranha-plant/sim';
import spinyShell from './spiny-shell/sim';
import superHorn from './super-horn/sim';
import tripleBanana from './triple-banana/sim';
import tripleGreen from './triple-green/sim';
import tripleMushroom from './triple-mushroom/sim';
import tripleRed from './triple-red/sim';

export { MK8_ITEM_SET } from './id';
export { MK8_ODDS, MK8_TABLE, OURS } from './odds';
export { mk8ItemSim } from './sim';

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
  /**
   * Its HUD icon: a pack sprite (`ITEM_SPRITES` in `src/mk8/ui/sprites.ts`), or for our own items
   * (MK-115) its shipped file under `/mk8/` (`ourIcon`).
   */
  icon: string;
}

/** Our unique items' MK8-style icons (MK-115): `public/mk8/ui/items/<id>.webp`, path under `/mk8/`. */
export const ourIcon = (id: string): string => `ui/items/${id}.webp`;

/** MK8 Mode's items so far: our items with MK8 looks, and MK8's own. One line per item. */
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
  // MK-112: MK8's triple items (one pack model each, drawn three times) and the Golden Mushroom.
  // Triple Mushrooms take Turbo Trio's place in MK8 races (`MK8_TABLE`).
  { id: 'triple-green', sim: tripleGreen, model: 'green-shell', icon: 'i_green3' },
  { id: 'triple-red', sim: tripleRed, model: 'red-shell', icon: 'i_red3' },
  { id: 'triple-banana', sim: tripleBanana, model: 'banana', icon: 'i_banana3' },
  { id: 'triple-mushroom', sim: tripleMushroom, model: 'mushroom', icon: 'i_mushroom3' },
  { id: 'golden-mushroom', sim: goldenMushroom, model: 'golden-mushroom', icon: 'i_golden' },
  // MK-113: the Spiny Shell and its counter, the Super Horn.
  { id: 'spiny-shell', sim: spinyShell, model: 'blue-shell', icon: 'i_spiny' },
  { id: 'super-horn', sim: superHorn, model: 'super-horn', icon: 'i_horn' },
  // MK-114: the Bob-omb, and the Fire Flower (no pack model: the skin draws ours).
  { id: 'bob-omb', sim: bobomb, model: 'bob-omb', icon: 'i_bobomb' },
  { id: 'fire-flower', sim: fireFlower, model: null, icon: 'i_fireflower' },
  // MK-120: Bullet Bill (the kart rides the route as a bullet).
  { id: 'bullet-bill', sim: bulletBill, model: 'bullet-bill', icon: 'i_bullet' },
  // MK-115: our five unique items (our sims, MK8-style looks of our own, `render/items/ours.ts`).
  { id: 'oil-slick', model: null, icon: ourIcon('oil-slick') },
  { id: 'hornet-swarm', model: null, icon: ourIcon('hornet-swarm') },
  { id: 'bubble-shield', model: null, icon: ourIcon('bubble-shield') },
  { id: 'magnet', model: null, icon: ourIcon('magnet') },
  { id: 'phase', model: null, icon: ourIcon('phase') },
  // MK-126: the Piranha Plant, the coin item and Crazy 8 (no pack model: a glowing "8", its ring
  // drawn with the other items' models).
  { id: 'piranha-plant', sim: piranhaPlant, model: 'piranha-plant', icon: 'i_piranha' },
  { id: 'coin', sim: coin, model: 'coin', icon: 'i_coin' },
  { id: 'crazy-8', sim: crazy8, model: null, icon: 'i_crazy8' },
];

/** The item box's pack model. */
export const MK8_ITEM_BOX_MODEL = 'item-box';

/** The new items' sims, registered when MK8 Mode loads (`src/mk8/register.ts`). */
export function mk8ItemSims(): ItemContent[] {
  return MK8_ITEMS.flatMap((item) => (item.sim ? [item.sim] : []));
}
