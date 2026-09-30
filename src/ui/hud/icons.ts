import { items } from '../../content/items';
import { itemViews } from '../../content/items/render';
import type { ItemId } from '../../sim/types';

/** The item's display name (registered in `src/content/items/<id>/sim.ts`). */
export function itemName(item: ItemId): string {
  return items.get(item).name;
}

/**
 * The item's HUD icon (registered in `src/content/items/<id>/render.ts`), as an SVG element; with
 * `uses`, the icon for that many uses left if the item draws its own count.
 */
export function itemIcon(item: ItemId, uses?: number): string {
  const view = itemViews.get(item);
  const body = uses !== undefined && view.iconFor ? view.iconFor(uses) : view.icon;
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
}

/** Whether the item's icon shows how many uses are left (so the HUD adds no "×n" badge). */
export function iconShowsUses(item: ItemId): boolean {
  return itemViews.get(item).iconFor !== undefined;
}
