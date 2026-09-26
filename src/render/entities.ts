import * as THREE from 'three';
import { entitySpecs, itemEffects } from '../content/items/registries';
import { itemViews } from '../content/items/views';
import type { ItemEntity, KartEffect, SimState } from '../sim/types';

/** The default look of an entity whose item has no `entityModel`: a small bright ball. */
function defaultModel(): THREE.Object3D {
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 10, 8),
    new THREE.MeshStandardMaterial({ color: '#ffd166', roughness: 0.4, flatShading: true }),
  );
}

/** Frees a model's geometries and materials. */
function dispose(model: THREE.Object3D): void {
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    (node.geometry as THREE.BufferGeometry).dispose();
    const materials: THREE.Material[] = Array.isArray(node.material)
      ? node.material
      : [node.material];
    for (const material of materials) material.dispose();
  });
}

/**
 * Draws the general item entities and kart effects (MK-52): one model per entity (the item view's
 * `entityModel`), placed and turned to its travel direction, and one per kart effect with an
 * `effectModel` (a shield bubble), kept on its kart. Items using them set
 * `renderer: ItemEntityRenderer`; the world makes one for all of them.
 */
export class ItemEntityRenderer {
  private readonly entities = new Map<number, THREE.Object3D>();
  private readonly effects = new Map<string, THREE.Object3D>();

  constructor(private readonly scene: THREE.Scene) {}

  sync(state: SimState, time: number): void {
    const seen = new Set<number>();
    for (const e of state.entities) {
      if (e.kind !== 'item') continue;
      seen.add(e.id);
      let model = this.entities.get(e.id);
      if (!model) {
        model = this.entityModel(e);
        this.entities.set(e.id, model);
        this.scene.add(model);
      }
      model.position.set(e.position.x, e.position.y + 0.4, e.position.z);
      // Heading 0 faces −Z (see CLAUDE.md units).
      model.rotation.y = Math.atan2(-e.direction.x, -e.direction.z) + (e.speed ? 0 : time);
    }
    for (const [id, model] of this.entities) {
      if (seen.has(id)) continue;
      this.scene.remove(model);
      dispose(model);
      this.entities.delete(id);
    }

    const on = new Set<string>();
    for (const kart of state.karts) {
      for (const effect of kart.effects) {
        const key = `${kart.id}:${effect.kind}`;
        let model = this.effects.get(key);
        if (!model) {
          const made = this.effectModel(effect);
          if (!made) continue;
          model = made;
          this.effects.set(key, model);
          this.scene.add(model);
        }
        on.add(key);
        model.position.set(kart.position.x, kart.position.y, kart.position.z);
      }
    }
    for (const [key, model] of this.effects) {
      if (on.has(key)) continue;
      this.scene.remove(model);
      dispose(model);
      this.effects.delete(key);
    }
  }

  private entityModel(entity: ItemEntity): THREE.Object3D {
    const item = entitySpecs.get(entity.spec).item;
    const view = itemViews.has(item) ? itemViews.get(item) : undefined;
    return view?.entityModel?.(entity) ?? defaultModel();
  }

  private effectModel(effect: KartEffect): THREE.Object3D | undefined {
    const item = itemEffects.get(effect.kind).item;
    return itemViews.has(item) ? itemViews.get(item).effectModel?.(effect) : undefined;
  }
}
