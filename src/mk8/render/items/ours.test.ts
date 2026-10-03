import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { items } from '../../../content/items';
import { itemViews } from '../../../content/items/views';
import '../../../content/items/render';
import { ItemEntityRenderer } from '../../../render/entities';
import { itemSkins } from '../../../render/itemSkins';
import { giveItem } from '../../../sim/items';
import { createSimState } from '../../../sim/state';
import { NEUTRAL_INPUT, type SimState } from '../../../sim/types';
import { MK8_ITEM_SET, OURS } from '../../content/items';
import { ItemModels } from './models';
import { MK8_OUR_LOOKS, OUR_LOOKS } from './ours';
import { Mk8ItemRenderer, mk8ItemSkin } from './skin';

const OUR_IDS = Object.keys(OURS);
const sizeOf = (object: THREE.Object3D) =>
  new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());

/** Every material in `object`. */
function materials(object: THREE.Object3D): THREE.Material[] {
  const found: THREE.Material[] = [];
  object.traverse((node) => {
    if (node instanceof THREE.Mesh) found.push(...[node.material].flat());
  });
  return found;
}

describe('our five items’ MK8-style looks (MK-115)', () => {
  it('has one look per item of ours, listed once', () => {
    expect(MK8_OUR_LOOKS.map((look) => look.id).sort()).toEqual([...OUR_IDS].sort());
    expect(OUR_LOOKS.size).toBe(OUR_IDS.length);
  });

  for (const look of MK8_OUR_LOOKS) {
    describe(look.id, () => {
      const view = itemViews.get(look.id);

      it('replaces each model our view draws (entities, kart effects), and only those', () => {
        expect(look.entityModel !== undefined).toBe(view.entityModel !== undefined);
        expect(look.effectModel !== undefined).toBe(view.effectModel !== undefined);
      });

      it('holds a unit-size model, glossy and clear-coated (MK8’s finish)', () => {
        const held = look.held();
        const size = sizeOf(held);
        expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(1, 5);
        const centre = new THREE.Box3().setFromObject(held).getCenter(new THREE.Vector3());
        expect(centre.length()).toBeCloseTo(0, 5);
        const glossy = materials(held).filter(
          (m): m is THREE.MeshPhysicalMaterial => m instanceof THREE.MeshPhysicalMaterial,
        );
        expect(glossy.length).toBeGreaterThan(0);
        for (const material of glossy) expect(material.clearcoat).toBe(1);
      });
    });
  }
});

/** Kart `kartId` uses `item` now. */
function use(state: SimState, kartId: number, item: string): void {
  items.get(item).onUse(state.karts[kartId]!, state, [], NEUTRAL_INPUT);
}

describe('the mk8 skin draws our items with their MK8 looks (MK-115)', () => {
  /** A race with the oil slick down and kart 0 shielded, on `itemSet`. */
  function race(itemSet?: string) {
    const state = createSimState({
      seed: 1,
      karts: [{}, { position: { x: 0, y: 0, z: -10 } }],
      ...(itemSet ? { itemSet, itemSlots: 2 } : {}),
    });
    use(state, 1, 'oil-slick');
    use(state, 0, 'bubble-shield');
    return state;
  }

  /** The materials drawn by an `ItemEntityRenderer` for `state`. */
  function drawn(state: SimState): THREE.Material[] {
    const scene = new THREE.Scene();
    new ItemEntityRenderer(scene).sync(state, 0);
    return materials(scene);
  }

  it('gives the shared renderer our MK8 models in mk8 races, our views’ elsewhere', () => {
    const skin = mk8ItemSkin(new ItemModels(new Map()));
    expect(skin.looks).toBe(OUR_LOOKS);
    itemSkins.register(skin);
    try {
      const glossy = (list: THREE.Material[]) =>
        list.filter((m) => m instanceof THREE.MeshPhysicalMaterial).length;
      expect(glossy(drawn(race(MK8_ITEM_SET)))).toBeGreaterThan(0);
      expect(glossy(drawn(race()))).toBe(0);
    } finally {
      itemSkins.unregister(MK8_ITEM_SET);
    }
  });

  it('draws each of our items held over its kart, and nothing once it is used', () => {
    const state = createSimState({
      seed: 1,
      karts: OUR_IDS.map((_, i) => ({ position: { x: i * 5, y: 0, z: 0 } })),
      itemSet: MK8_ITEM_SET,
      itemSlots: 2,
    });
    OUR_IDS.forEach((id, i) => giveItem(state.karts[i]!, id));
    // The item boxes' "?" is drawn on a canvas: no DOM here, so a blank one.
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
    const scene = new THREE.Scene();
    const renderer = new Mk8ItemRenderer(scene, new ItemModels(new Map()));
    renderer.sync(state, 0);
    const shown = () => scene.children.filter((child) => child.visible);
    expect(shown()).toHaveLength(OUR_IDS.length);
    for (const [i, model] of shown().entries()) {
      // Over the driver: above the kart, at its x.
      expect(model.position.x).toBeCloseTo(i * 5, 5);
      expect(model.position.y).toBeGreaterThan(1);
    }
    for (const kart of state.karts) kart.item.held = null;
    renderer.sync(state, 0);
    expect(shown()).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});
