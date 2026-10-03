import type * as THREE from 'three';
import type { ItemRenderer } from '../content/items/views';
import { Registry } from '../content/registry';
import type { ItemId, SimState } from '../sim/types';

/**
 * A world object an item skin can draw instead of the original renderers: the item boxes, bananas,
 * green or red shells, or a general item entity by its item's id (`entity:boomerang`).
 */
export type SkinPart = 'itemBox' | 'banana' | 'shell:green' | 'shell:red' | `entity:${ItemId}`;

/**
 * How an item set's races look (MK-103): MK8 Mode registers one for `mk8` once its pack models
 * have loaded. Its renderer draws what it `replaces` (the original renderers then draw nothing of
 * those parts) plus anything of its own (held items, strikes). No skin, or a part it doesn't
 * list (a model missing from the pack): the original look.
 */
export interface ItemSkin {
  /** The item set it dresses (`SimState.itemSet`). */
  id: string;
  replaces: ReadonlySet<SkinPart>;
  /** Made once per world; synced every frame, it draws nothing in races of another item set. */
  renderer: new (scene: THREE.Scene) => ItemRenderer;
}

export const itemSkins = new Registry<ItemSkin>('item skin');

/** The skin dressing `state`'s race, if any. */
export function skinOf(state: SimState): ItemSkin | undefined {
  return state.itemSet !== undefined && itemSkins.has(state.itemSet)
    ? itemSkins.get(state.itemSet)
    : undefined;
}

/** Whether `state`'s skin draws `part` (so the original renderer leaves it out). */
export function skinDraws(state: SimState, part: SkinPart): boolean {
  return skinOf(state)?.replaces.has(part) ?? false;
}
