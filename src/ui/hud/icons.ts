import { items } from '../../content/items';
import { itemViews } from '../../content/items/render';
import type { ItemId } from '../../sim/types';

/** The item's display name (registered in `src/content/items/<id>/sim.ts`). */
export function itemName(item: ItemId): string {
  return items.get(item).name;
}

/** The item's HUD icon (registered in `src/content/items/<id>/render.ts`), as an SVG element. */
export function itemIcon(item: ItemId): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${itemViews.get(item).icon}</svg>`;
}
