import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { itemSkins, skinDraws } from '../../../render/itemSkins';
import { createSimState } from '../../../sim/state';
import { MK8_ITEM_SET } from '../../content/items';
import { ItemModels, normalise, unskin } from './models';
import { mk8ItemSkin, skinParts } from './skin';

/** A 2 × 4 × 6 box model at (10, 0, 0). */
function boxModel(): THREE.Object3D {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6), new THREE.MeshStandardMaterial());
  mesh.position.set(10, 0, 0);
  const scene = new THREE.Group();
  scene.add(mesh);
  return scene;
}

function sizeOf(object: THREE.Object3D): THREE.Vector3 {
  return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
}

describe('MK8 item models (MK-103)', () => {
  it('stands a model upright (its top was along −Z), centred, its largest side 1 m', () => {
    const model = normalise(boxModel());
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    // The 6 m depth (Z) is now the height (Y).
    expect(size.y).toBeCloseTo(1, 5);
    expect(size.z).toBeCloseTo(4 / 6, 5);
    expect(box.getCenter(new THREE.Vector3()).length()).toBeCloseTo(0, 5);
  });

  it('copies a model at the size asked, sharing its geometry', () => {
    const models = new ItemModels(new Map([['box', normalise(boxModel())]]));
    const copy = models.instance('box', 2)!;
    expect(sizeOf(copy).y).toBeCloseTo(2, 5);
    expect(models.instance('missing', 1)).toBeUndefined();
  });

  it('leaves a model that already stands upright as it is (MK-126: the coin)', () => {
    const size = sizeOf(normalise(boxModel(), true));
    expect(size.z).toBeCloseTo(1, 5);
    expect(size.y).toBeCloseTo(4 / 6, 5);
  });

  it('copies a skinned model with its own bones (MK-126: the Piranha Plant)', () => {
    const bone = new THREE.Bone();
    const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const scene = new THREE.Group();
    scene.add(bone, mesh);
    mesh.bind(new THREE.Skeleton([bone]));
    const models = new ItemModels(new Map([['plant', scene]]));
    const copy = models.instance('plant', 1)!;
    let copied: THREE.SkinnedMesh | undefined;
    copy.traverse((node) => {
      if (node instanceof THREE.SkinnedMesh) copied = node;
    });
    expect(copied?.skeleton.bones[0]).not.toBe(bone);
    expect(copy.children).toContain(copied?.skeleton.bones[0]);
  });

  it('swaps skinned meshes for plain ones in the same place', () => {
    const scene = new THREE.Group();
    const skinned = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    skinned.position.set(1, 2, 3);
    scene.add(skinned);
    unskin(scene);
    const [mesh] = scene.children;
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh).not.toBeInstanceOf(THREE.SkinnedMesh);
    expect(mesh?.position.toArray()).toEqual([1, 2, 3]);
  });
});

describe('the mk8 item skin (MK-103)', () => {
  const all = new ItemModels(
    new Map(
      ['item-box', 'banana', 'green-shell', 'red-shell', 'boomerang-flower', 'blue-shell'].map(
        (id) => [id, new THREE.Group()],
      ),
    ),
  );

  it('replaces only the parts the pack has models for', () => {
    expect([...skinParts(all)].sort()).toEqual(
      [
        'banana',
        'entity:boomerang',
        'itemBox',
        'shell:green',
        'shell:red',
        // MK-112: the triple items' circling shells and trailing bananas share those models.
        'entity:triple-green',
        'entity:triple-red',
        'entity:triple-banana',
        // MK-113: the Spiny Shell (and its explosion, which has no model of its own).
        'entity:spiny-shell',
      ].sort(),
    );
    const some = new ItemModels(new Map([['banana', new THREE.Group()]]));
    expect([...skinParts(some)]).toEqual(['banana', 'entity:triple-banana']);
  });

  it('dresses only races with the mk8 item set', () => {
    itemSkins.register(mk8ItemSkin(all));
    try {
      const mk8 = createSimState({ seed: 1, itemSet: MK8_ITEM_SET, itemSlots: 2 });
      expect(skinDraws(mk8, 'itemBox')).toBe(true);
      expect(skinDraws(createSimState({ seed: 1 }), 'itemBox')).toBe(false);
    } finally {
      itemSkins.unregister(MK8_ITEM_SET);
    }
  });
});
