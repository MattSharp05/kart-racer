import * as THREE from 'three';
import { entitySpecs, itemEffects } from '../content/items/registries';
import { itemViews } from '../content/items/views';
import type { SimState } from '../sim/types';
import { lookOf, skinDraws, type ItemLook } from './itemSkins';

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

/** A drawn model and the look it was made from. */
interface Drawn {
  model: THREE.Object3D;
  look: ItemLook | undefined;
}

/**
 * Draws the general item entities and kart effects (MK-52): one model per entity (the item view's
 * `entityModel`), placed and turned to its travel direction, and one per kart effect with an
 * `effectModel` (a shield bubble), kept on its kart. Items using them set
 * `renderer: ItemEntityRenderer`; the world makes one for all of them.
 */
export class ItemEntityRenderer {
  private readonly entities = new Map<number, Drawn>();
  private readonly effects = new Map<string, Drawn>();

  constructor(private readonly scene: THREE.Scene) {}

  sync(state: SimState, time: number): void {
    const seen = new Set<number>();
    for (const e of state.entities) {
      if (e.kind !== 'item') continue;
      // An MK8 item's entity a scenario places is drawn once MK8 Mode has registered it (MK-113).
      if (!entitySpecs.has(e.spec)) continue;
      const item = entitySpecs.get(e.spec).item;
      // An item skin draws this item's entities (MK-103: MK8's boomerang).
      if (skinDraws(state, `entity:${item}`)) continue;
      seen.add(e.id);
      const look = this.looks(item, state);
      const model = this.model(this.entities, e.id, look, () =>
        look?.entityModel ? look.entityModel(e) : defaultModel(),
      );
      if (!model) continue;
      model.position.set(e.position.x, e.position.y + 0.4, e.position.z);
      // Heading 0 faces −Z (see CLAUDE.md units).
      model.rotation.y = Math.atan2(-e.direction.x, -e.direction.z) + (e.speed ? 0 : time);
      // The item view's per-frame touch to an entity's model (a boomerang's spin, MK-69).
      look?.animateEntity?.(model, e);
    }
    this.drop(this.entities, seen);

    const on = new Set<string>();
    for (const kart of state.karts) {
      for (const effect of kart.effects) {
        const key = `${kart.id}:${effect.kind}`;
        const look = this.looks(itemEffects.get(effect.kind).item, state);
        const model = this.model(this.effects, key, look, () => look?.effectModel?.(effect));
        if (!model) continue;
        on.add(key);
        model.position.set(kart.position.x, kart.position.y, kart.position.z);
      }
    }
    this.drop(this.effects, on);
  }

  /**
   * The model drawn under `key`, made by `make` from `look`; made again when the look changed (an
   * item skin registered once its pack loaded, MK-115). `undefined` when the look has none.
   */
  private model<K>(
    drawn: Map<K, Drawn>,
    key: K,
    look: ItemLook | undefined,
    make: () => THREE.Object3D | undefined,
  ): THREE.Object3D | undefined {
    const current = drawn.get(key);
    if (current && current.look === look) return current.model;
    if (current) this.remove(drawn, key, current);
    const model = make();
    if (!model) return undefined;
    drawn.set(key, { model, look });
    this.scene.add(model);
    return model;
  }

  /** Removes the models whose keys aren't in `keep`. */
  private drop<K>(drawn: Map<K, Drawn>, keep: ReadonlySet<K>): void {
    for (const [key, entry] of drawn) if (!keep.has(key)) this.remove(drawn, key, entry);
  }

  private remove<K>(drawn: Map<K, Drawn>, key: K, entry: Drawn): void {
    this.scene.remove(entry.model);
    dispose(entry.model);
    drawn.delete(key);
  }

  /** The item's look in this race: its skin's (MK-115), else its view's. */
  private looks(item: string, state: SimState): ItemLook | undefined {
    return lookOf(state, item) ?? (itemViews.has(item) ? itemViews.get(item) : undefined);
  }
}
