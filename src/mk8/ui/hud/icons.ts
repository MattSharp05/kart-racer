// What the MK8 HUD draws for items and racers (MK-127): the pack's sprites (MK-95) where it has
// them, else our SVG item icons and the racer's paint, so races without a pack (CI, previews) still
// show every item and head.
import { itemViews } from '../../../content/items/render';
import { itemIcon } from '../../../ui/hud/icons';
import { MK8_ITEMS } from '../../content/items';
import type { SpriteSource } from '../kit/styleGuide';
import { MK8_ASSET_BASE, type CHARACTER_SPRITES, type ITEM_SPRITES } from '../sprites';

type ItemSprite = (typeof ITEM_SPRITES)[number];
type CharacterSprite = (typeof CHARACTER_SPRITES)[number];

const ITEM_ICONS = new Map<string, string>(MK8_ITEMS.map((item) => [item.id, item.icon]));

/** The coin's sprite (MK-109's coins). */
export const COIN_SPRITE: ItemSprite = 'i_coin';

/** The pack's icon for `item`, if MK8 has the item. */
export function itemSprite(item: string): string | undefined {
  return ITEM_ICONS.get(item);
}

/**
 * The icon for `item` with `uses` left: a triple item with fewer than three left shows its single
 * sprite (the HUD adds the count); undefined when MK8 hasn't the item (our five).
 */
export function itemSpriteFor(item: string, uses: number): string | undefined {
  const id = itemSprite(item);
  if (id === undefined || uses >= 3 || !id.endsWith('3')) return id;
  return id.slice(0, -1);
}

/**
 * The URL of `item`'s icon with `uses` left: a pack sprite through `sprites` (undefined without the
 * pack), or one of our items' shipped icons (MK-115: a path under `/mk8/`).
 */
export function itemIconUrl(item: string, uses: number, sprites: SpriteSource): string | undefined {
  const id = itemSpriteFor(item, uses);
  if (id === undefined) return undefined;
  return id.includes('/') ? `${MK8_ASSET_BASE}${id}` : sprites(id);
}

/** Whether the slot shows a count badge: a multi-use item that its sprite doesn't already show. */
export function showsCount(item: string, uses: number): boolean {
  if (uses <= 1) return false;
  return !(uses >= 3 && itemSprite(item)?.endsWith('3') === true);
}

/** Whether our SVG icon for `item` is there yet (MK8's items register their looks with the race). */
export function hasItemSvg(item: string): boolean {
  return itemViews.has(item);
}

/** Our SVG icon for `item` (a stand-in without the pack, and our own items). */
export function itemSvg(item: string, uses?: number): string {
  return itemIcon(item, uses);
}

/** The items the reel flicks through: MK8's own icons, in MK8's roster order. */
export const REEL_ITEMS: readonly string[] = MK8_ITEMS.map((item) => item.id);

/** Each MK8 racer's head (the character select's icons), by racer id. */
const HEADS: Readonly<Record<string, CharacterSprite>> = {
  'mk8-mario': 'c_mario',
  'mk8-luigi': 'c_luigi',
  'mk8-peach': 'c_peach',
  'mk8-daisy': 'c_daisy',
  'mk8-yoshi': 'c_yoshi',
  'mk8-toad': 'c_toad',
  'mk8-koopa-troopa': 'c_koopa',
  'mk8-shy-guy': 'c_shyguy',
  'mk8-bowser': 'c_bowser',
  'mk8-donkey-kong': 'c_dk',
  'mk8-wario': 'c_wario',
  'mk8-waluigi': 'c_waluigi',
};

/** The head sprite of racer `racer`, if it is one of MK8's. */
export function headSprite(racer: string): string | undefined {
  return HEADS[racer];
}
