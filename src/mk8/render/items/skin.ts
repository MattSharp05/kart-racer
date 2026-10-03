// MK8 races' item look (MK-103): MK8's item box, bananas, shells and boomerang from the pack, the
// item each kart holds (bananas and shells trail behind it, the rest float over the driver), a bolt
// on each kart lightning strikes and a Blooper over each kart it inks.
import * as THREE from 'three';
import { entitySpecs } from '../../../content/items/registries';
import type { ItemRenderer } from '../../../content/items/views';
import type { ItemSkin, SkinPart } from '../../../render/itemSkins';
import { INK_TICKS } from '../../../content/items/ink-cloud/sim';
import { bananaDrawPosition } from '../../../sim/items/banana';
import type {
  BananaEntity,
  ItemEntity,
  KartState,
  ShellEntity,
  SimState,
} from '../../../sim/types';
import { MK8_ITEM_BOX_MODEL, MK8_ITEM_SET, MK8_ITEMS } from '../../content/items';
import type { ItemModels } from './models';

/** Sizes in the world (largest side, m) and placements. */
const SIZE = {
  itemBox: 1.5,
  banana: 0.9,
  shell: 1,
  boomerang: 1.1,
  held: 0.75,
  bolt: 3,
  blooper: 1.4,
};
/** The "?" inside an item box, m (the box is `SIZE.itemBox`). */
const QUESTION_SIZE = 1;
/** Item boxes float this high, bobbing this much. */
const BOX_HOVER = 1.1;
const BOX_BOB = 0.12;
/** Held bananas and shells hang this far behind the kart's centre, this high. */
const TRAIL_BEHIND = 1.5;
const TRAIL_HEIGHT = 0.45;
/** Other held items float over the driver. */
const HELD_HEIGHT = 1.9;
/** A lightning bolt shows this long after it strikes, s. */
const BOLT_SECONDS = 0.6;
/** The Blooper shows over an inked kart for the ink's first this-many ticks. */
const BLOOPER_TICKS = 75;
/** Items held behind the kart, MK8 style (the rest float over the driver). */
const TRAILING = new Set(['banana', 'green', 'red']);
/** Each reskinned item's pack model, by item id. */
const MODEL_OF: ReadonlyMap<string, string | null> = new Map(
  MK8_ITEMS.map((item) => [item.id, item.model]),
);

/** The parts the skin draws, given the models the pack has. */
export function skinParts(models: ItemModels): Set<SkinPart> {
  const parts = new Set<SkinPart>();
  const has = (item: string) => models.has(MODEL_OF.get(item) ?? '');
  if (models.has(MK8_ITEM_BOX_MODEL)) parts.add('itemBox');
  if (has('banana')) parts.add('banana');
  if (has('green')) parts.add('shell:green');
  if (has('red')) parts.add('shell:red');
  if (has('boomerang')) parts.add('entity:boomerang');
  return parts;
}

/** MK8's rainbow "?" turning inside each item box (a plane, both sides, unlit). */
function questionMark(): THREE.Object3D {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const rainbow = ctx.createLinearGradient(0, 16, 0, 112);
    ['#ff4d6d', '#ffb347', '#fff275', '#7cf29c', '#6ec6ff', '#c58bff'].forEach((colour, i, all) =>
      rainbow.addColorStop(i / (all.length - 1), colour),
    );
    ctx.font = 'bold 112px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText('?', 64, 70);
    ctx.fillStyle = rainbow;
    ctx.fillText('?', 64, 70);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(QUESTION_SIZE, QUESTION_SIZE),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }),
  );
}

/** Copies of one model, shown as many at a time as needed (the rest hidden). */
class ModelPool {
  private readonly models: THREE.Object3D[] = [];
  private used = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly make: () => THREE.Object3D | undefined,
  ) {}

  /** The next copy this frame, or `undefined` when there's no model. */
  next(): THREE.Object3D | undefined {
    let model = this.models[this.used];
    if (!model) {
      const made = this.make();
      if (!made) return undefined;
      model = made;
      this.models.push(model);
      this.scene.add(model);
    }
    this.used += 1;
    model.visible = true;
    return model;
  }

  /** Hides the copies not used this frame and starts the next. */
  finish(): void {
    for (const model of this.models.slice(this.used)) model.visible = false;
    this.used = 0;
  }
}

/** The `mk8` item skin for the pack's models (`registerMk8ItemSkin`). */
export function mk8ItemSkin(models: ItemModels): ItemSkin {
  return {
    id: MK8_ITEM_SET,
    replaces: skinParts(models),
    renderer: class extends Mk8ItemRenderer {
      constructor(scene: THREE.Scene) {
        super(scene, models);
      }
    },
  };
}

/** Draws MK8 races' items from the pack's models. */
export class Mk8ItemRenderer implements ItemRenderer {
  private readonly pools = new Map<string, ModelPool>();
  /** Lightning (MK-20): each kart's shrink time last frame, and when a bolt last struck it. */
  private readonly shrink = new Map<number, number>();
  private readonly struck = new Map<number, number>();
  private readonly offset = new THREE.Vector3();
  private readonly questionMarks: ModelPool;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly models: ItemModels,
  ) {
    // One shared texture: the pool copies the first mark.
    const mark = questionMark();
    this.questionMarks = new ModelPool(scene, () => mark.clone());
  }

  /** The pool of `model` copies `size` m big. */
  private pool(model: string | null | undefined, size: number): ModelPool | undefined {
    if (!model || !this.models.has(model)) return undefined;
    const key = `${model}@${size}`;
    let pool = this.pools.get(key);
    if (!pool) {
      pool = new ModelPool(this.scene, () => this.models.instance(model, size));
      this.pools.set(key, pool);
    }
    return pool;
  }

  sync(
    state: SimState,
    time: number,
    kartModel: (id: number) => THREE.Object3D | undefined = () => undefined,
  ): void {
    if (state.itemSet === MK8_ITEM_SET) {
      this.drawEntities(state, time);
      for (const kart of state.karts) this.drawKart(kart, time, kartModel(kart.id));
    }
    for (const pool of this.pools.values()) pool.finish();
    this.questionMarks.finish();
  }

  private drawEntities(state: SimState, time: number): void {
    const box = this.pool(MK8_ITEM_BOX_MODEL, SIZE.itemBox);
    const banana = this.pool(MODEL_OF.get('banana'), SIZE.banana);
    const shells = {
      green: this.pool(MODEL_OF.get('green'), SIZE.shell),
      red: this.pool(MODEL_OF.get('red'), SIZE.shell),
    };
    const boomerang = this.pool(MODEL_OF.get('boomerang'), SIZE.boomerang);
    for (const e of state.entities) {
      if (e.kind === 'itemBox') {
        // Hit boxes are gone until they respawn.
        const model = e.respawnTimer > 0 ? undefined : box?.next();
        const spin = time * 1.2 + e.id;
        model?.position.set(
          e.position.x,
          e.position.y + BOX_HOVER + Math.sin(spin * 2) * BOX_BOB,
          e.position.z,
        );
        model?.rotation.set(0, spin, 0);
        // The "?" turns the other way inside it.
        const mark = model ? this.questionMarks.next() : undefined;
        if (model && mark) {
          mark.position.copy(model.position);
          mark.rotation.set(0, -spin * 1.5, 0);
        }
      } else if (e.kind === 'banana') {
        placeBanana(banana?.next(), e);
      } else if (e.kind === 'shell') {
        placeShell(shells[e.colour]?.next(), e, time);
      } else if (e.kind === 'item' && entitySpecs.get(e.spec).item === 'boomerang') {
        placeBoomerang(boomerang?.next(), e);
      }
    }
  }

  /** A kart's held item, and any lightning bolt or Blooper on it. */
  private drawKart(kart: KartState, time: number, model: THREE.Object3D | undefined): void {
    const at = (x: number, y: number, z: number): THREE.Vector3 => {
      this.offset.set(x, y, z);
      // This frame's pose: the kart was just placed, and its matrix is only updated when drawn.
      model?.updateWorldMatrix(true, false);
      if (model) return model.localToWorld(this.offset);
      return this.offset.set(kart.position.x + x, kart.position.y + y, kart.position.z + z);
    };
    const held = kart.item.roulette === 0 ? kart.item.held : null;
    if (held && MODEL_OF.has(held) && kart.respawnTimer === 0) {
      const trailing = TRAILING.has(held);
      const copy = this.pool(MODEL_OF.get(held), trailing ? SIZE.banana : SIZE.held)?.next();
      if (copy) {
        // Behind is +Z in the kart's frame (heading 0 faces −Z).
        copy.position.copy(trailing ? at(0, TRAIL_HEIGHT, TRAIL_BEHIND) : at(0, HELD_HEIGHT, 0));
        copy.rotation.set(0, (model?.rotation.y ?? kart.heading) + (trailing ? 0 : time * 2), 0);
      }
    }

    // A bolt from above when lightning shrinks the kart (its shrink time jumps up).
    const before = this.shrink.get(kart.id) ?? 0;
    if (kart.shrinkTimer > before) this.struck.set(kart.id, time);
    this.shrink.set(kart.id, kart.shrinkTimer);
    const strike = this.struck.get(kart.id);
    if (strike !== undefined && time - strike < BOLT_SECONDS && time >= strike) {
      const bolt = this.pool(MODEL_OF.get('lightning'), SIZE.bolt)?.next();
      bolt?.position.copy(at(0, SIZE.bolt / 2, 0));
    }

    // The Blooper over a freshly inked kart.
    const ink = kart.effects.find((e) => e.kind === 'ink-cloud');
    if (ink && ink.ticksLeft > INK_TICKS - BLOOPER_TICKS) {
      const blooper = this.pool(MODEL_OF.get('ink-cloud'), SIZE.blooper)?.next();
      if (blooper) {
        blooper.position.copy(at(0, HELD_HEIGHT + 0.6 + Math.sin(time * 6) * 0.15, -1));
        blooper.rotation.set(0, (model?.rotation.y ?? kart.heading) + Math.PI, 0);
      }
    }
  }
}

function placeBanana(model: THREE.Object3D | undefined, banana: BananaEntity): void {
  if (!model) return;
  const p = bananaDrawPosition(banana);
  model.position.set(p.x, p.y + SIZE.banana / 2, p.z);
  model.rotation.set(0, banana.id * 1.3, 0);
}

function placeShell(model: THREE.Object3D | undefined, shell: ShellEntity, time: number): void {
  if (!model) return;
  model.position.set(shell.position.x, shell.position.y + SIZE.shell * 0.4, shell.position.z);
  model.rotation.set(0, time * 12 + shell.id, 0);
}

function placeBoomerang(model: THREE.Object3D | undefined, entity: ItemEntity): void {
  if (!model) return;
  model.position.set(entity.position.x, entity.position.y + 1, entity.position.z);
  // Spins with its age (a paused frame is the same every time).
  model.rotation.set(0, entity.age * 0.5, 0);
}
