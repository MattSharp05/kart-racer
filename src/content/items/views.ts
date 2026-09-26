import type * as THREE from 'three';
import type { SoundId } from '../../audio/soundMap';
import { registerSound, unregisterSound, type SoundRecipe } from '../../audio/soundRegistry';
import type { ItemEntity, KartEffect, SimState } from '../../sim/types';
import { Registry } from '../registry';

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
  /**
   * Draws the item's world entities; items with the same class (green and red shells) share one.
   * Items built on the general entities and effects (MK-52) use `ItemEntityRenderer`
   * (`render/entities.ts`), which draws `entityModel` and `effectModel`.
   */
  renderer?: new (scene: THREE.Scene) => ItemRenderer;
  /**
   * The item's own sounds (MK-52), registered as `<item>.<name>`: use one as `useSound`, and an
   * `itemFx` event plays `<item>.<fx>`.
   */
  sounds?: Record<string, SoundRecipe>;
  /** A model for one of its entities, placed and turned by `ItemEntityRenderer` (default: a ball). */
  entityModel?(entity: ItemEntity): THREE.Object3D;
  /** A model drawn around a kart with one of its effects (a shield bubble), by `ItemEntityRenderer`. */
  effectModel?(effect: KartEffect): THREE.Object3D;
  /**
   * How see-through a kart with one of its effects is drawn (1 = solid), at sim tick `tick` (a
   * ghostly shimmer: Phase, MK-66). `KartRenderer` uses the lowest over the kart's effects.
   */
  kartOpacity?(effect: KartEffect, tick: number): number;
  /**
   * Screen overlays on the affected player's HUD (MK-52, `ui/hud/screenEffects.ts`), keyed by an
   * effect id (shown while that effect lasts on the followed kart) or an `itemFx` name (shown for
   * `seconds` after the event).
   */
  overlays?: Record<string, ScreenOverlay>;
}

/** A HUD overlay (ink on the screen…): an element with the class and inner HTML given. */
export interface ScreenOverlay {
  className: string;
  html?: string;
  /** `itemFx` overlays: how long it stays up (default 1 s). */
  seconds?: number;
}

export const itemViews = new Registry<ItemView>('item view');

/** Registers an item's view and its sounds. */
export function registerItemView(view: ItemView): ItemView {
  itemViews.register(view);
  for (const [name, recipe] of Object.entries(view.sounds ?? {})) {
    registerSound(`${view.id}.${name}`, recipe);
  }
  return view;
}

/** Removes a view and its sounds (tests that register throwaway items). */
export function unregisterItemView(id: string): void {
  if (!itemViews.has(id)) return;
  for (const name of Object.keys(itemViews.get(id).sounds ?? {})) unregisterSound(`${id}.${name}`);
  itemViews.unregister(id);
}
