import type * as THREE from 'three';
import type { SoundId } from '../../audio/soundMap';
import type { SimState } from '../../sim/types';
import { Registry } from '../registry';
import { items } from '.';
import banana from './banana/render';
import green from './green/render';
import lightning from './lightning/render';
import mushroom from './mushroom/render';
import red from './red/render';
import star from './star/render';

/** Draws an item's world entities each frame (one per renderer class, shared between items). */
export interface ItemRenderer {
  sync(state: SimState, time: number): void;
}

/**
 * How an item looks and sounds (ADR 0007): `src/content/items/<id>/render.ts` default-exports one
 * of these.
 */
export interface ItemView {
  id: string;
  /** SVG body for the HUD item slot, drawn in a 64×64 viewBox. */
  icon: string;
  /** Sound when the item is used (`null` when its own sim event already makes one). */
  useSound: SoundId | null;
  /** Draws the item's world entities; items with the same class (green and red shells) share one. */
  renderer?: new (scene: THREE.Scene) => ItemRenderer;
}

export const itemViews = new Registry<ItemView>('item view');

// One line per item folder, alphabetical (a unit test checks none is missing).
for (const view of [banana, green, lightning, mushroom, red, star]) itemViews.register(view);

/** Each distinct item renderer class, in item order (the world creates one of each). */
export function itemRendererClasses(): (new (scene: THREE.Scene) => ItemRenderer)[] {
  const classes = items
    .list()
    .flatMap((item) => (itemViews.has(item.id) ? [itemViews.get(item.id).renderer] : []));
  return [...new Set(classes.filter((c) => c !== undefined))];
}
