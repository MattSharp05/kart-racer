// MK8 races' item looks (MK-103). `prepareMk8Items` loads the pack's item models and registers the
// `mk8` item skin; without a pack (CI, previews, production) nothing is registered and MK8 races
// draw our own items.
//
// New MK8 items (the item tickets after MK-103) add their `ItemView` to `MK8_ITEM_VIEWS`, drawing
// their pack model with `mk8EntityModel` (a placeholder when the pack has none, e.g. the fire
// flower and Crazy 8, which MK-93 couldn't convert).
import * as THREE from 'three';
import { itemViews, registerItemView, type ItemView } from '../../../content/items/views';
import { itemSkins } from '../../../render/itemSkins';
import { MK8_ITEM_BOX_MODEL, MK8_ITEM_SET, MK8_ITEMS } from '../../content/items';
import bobomb from '../../content/items/bob-omb/render';
import bulletBill from '../../content/items/bullet-bill/render';
import coin from '../../content/items/coin/render';
import crazy8 from '../../content/items/crazy-8/render';
import fireFlower from '../../content/items/fire-flower/render';
import goldenMushroom from '../../content/items/golden-mushroom/render';
import piranhaPlant from '../../content/items/piranha-plant/render';
import spinyShell from '../../content/items/spiny-shell/render';
import superHorn from '../../content/items/super-horn/render';
import tripleBanana from '../../content/items/triple-banana/render';
import tripleGreen from '../../content/items/triple-green/render';
import tripleMushroom from '../../content/items/triple-mushroom/render';
import tripleRed from '../../content/items/triple-red/render';
import type { Mk8Loader } from '../../loader';
import { loadItemModels, type ItemModels } from './models';
import { mk8ItemSkin } from './skin';

/**
 * New MK8 items' views: our HUD's icons, and stand-in models without a pack (MK-112: the triple
 * items and the Golden Mushroom, in `src/mk8/content/items/<id>/render.ts`). One line per item.
 */
export const MK8_ITEM_VIEWS: readonly ItemView[] = [
  tripleGreen,
  tripleRed,
  tripleBanana,
  tripleMushroom,
  goldenMushroom,
  spinyShell,
  superHorn,
  bobomb,
  fireFlower,
  bulletBill,
  // MK-126.
  piranhaPlant,
  coin,
  crazy8,
];

/** Every pack model MK8 items use. */
export const MK8_ITEM_MODELS: readonly string[] = [
  MK8_ITEM_BOX_MODEL,
  ...MK8_ITEMS.flatMap((item) => (item.model ? [item.model] : [])),
];

let models: ItemModels | undefined;

/** A world model for a new MK8 item: its pack model `size` m big, or a placeholder. */
export function mk8EntityModel(model: string | null, size: number): THREE.Object3D {
  return model && models?.has(model)
    ? (models.instance(model, size) ?? placeholder(size))
    : placeholder(size);
}

/** A stand-in for a model the pack doesn't have: a bright octahedron. */
function placeholder(size: number): THREE.Object3D {
  return new THREE.Mesh(
    new THREE.OctahedronGeometry(size / 2),
    new THREE.MeshStandardMaterial({ color: '#ff9f1c', roughness: 0.5, flatShading: true }),
  );
}

/**
 * Registers new MK8 items' views, then loads the item models from the pack and registers the
 * `mk8` skin (once). A missing pack is fine: MK8 races then draw our items.
 */
export async function prepareMk8Items(loader: Mk8Loader): Promise<void> {
  for (const view of MK8_ITEM_VIEWS) if (!itemViews.has(view.id)) registerItemView(view);
  if (itemSkins.has(MK8_ITEM_SET)) return;
  try {
    models = await loadItemModels(loader, MK8_ITEM_MODELS);
  } catch (e) {
    console.info('MK8 item models not loaded; MK8 races draw the original items.', e);
    return;
  }
  if (!itemSkins.has(MK8_ITEM_SET)) itemSkins.register(mk8ItemSkin(models));
}
