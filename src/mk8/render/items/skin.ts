// MK8 races' item look (MK-103): MK8's item box, bananas, shells and boomerang from the pack, the
// item each kart holds (bananas and shells trail behind it, the rest float over the driver; triple
// shells circle it and triple bananas trail it, MK-112), a bolt on each kart lightning strikes and
// a Blooper over each kart it inks.
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
import { animateExplosion, explosionModel } from '../../content/items/looks';
import { SPINY, SPINY_BLAST } from '../../content/items/spiny-shell/sim';
import { BOBOMB, BOBOMB_BLAST } from '../../content/items/bob-omb/sim';
import { FIRE } from '../../content/items/fire-flower/sim';
import { fireFlowerModel } from '../../content/items/fire-flower/render';
import { TICK_RATE, tuning } from '../../../sim/tuning';
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
  spiny: 1.3,
  bobomb: 1.1,
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
/**
 * MK8's triple shells and bananas (MK-112): drawn where their escort entities are (circling or
 * trailing the kart), so not as a held item; by the item whose model they share.
 */
const ESCORTS: ReadonlyMap<string, 'green' | 'red' | 'banana'> = new Map([
  ['triple-green', 'green'],
  ['triple-red', 'red'],
  ['triple-banana', 'banana'],
] as const);
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
  for (const [item, like] of ESCORTS) if (has(like)) parts.add(`entity:${item}`);
  // MK-113: the Spiny Shell (its explosion is drawn by the skin too, without a pack model).
  if (has(SPINY)) parts.add(`entity:${SPINY}`);
  // MK-114: the Bob-omb (and its blast).
  if (has(BOBOMB)) parts.add(`entity:${BOBOMB}`);
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
  /** Spiny Shell explosions (MK-113): the pack has no model, so ours. */
  private readonly blasts: ModelPool;
  /** The held Fire Flower (MK-114): the pack has no model, so ours. */
  private readonly fireFlowers: ModelPool;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly models: ItemModels,
  ) {
    // One shared texture: the pool copies the first mark.
    const mark = questionMark();
    this.questionMarks = new ModelPool(scene, () => mark.clone());
    this.blasts = new ModelPool(scene, explosionModel);
    this.fireFlowers = new ModelPool(scene, () => {
      const flower = fireFlowerModel();
      flower.scale.setScalar(SIZE.held);
      return flower;
    });
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
    this.blasts.finish();
    this.fireFlowers.finish();
  }

  private drawEntities(state: SimState, time: number): void {
    const box = this.pool(MK8_ITEM_BOX_MODEL, SIZE.itemBox);
    const banana = this.pool(MODEL_OF.get('banana'), SIZE.banana);
    const shells = {
      green: this.pool(MODEL_OF.get('green'), SIZE.shell),
      red: this.pool(MODEL_OF.get('red'), SIZE.shell),
    };
    const boomerang = this.pool(MODEL_OF.get('boomerang'), SIZE.boomerang);
    const spiny = this.pool(MODEL_OF.get(SPINY), SIZE.spiny);
    const bobomb = this.pool(MODEL_OF.get(BOBOMB), SIZE.bobomb);
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
      } else if (e.kind === 'item' && entitySpecs.has(e.spec)) {
        const item = entitySpecs.get(e.spec).item;
        const like = ESCORTS.get(item);
        if (item === 'boomerang') placeBoomerang(boomerang?.next(), e);
        else if (e.spec === SPINY) placeSpiny(spiny?.next(), e);
        else if (e.spec === SPINY_BLAST) placeBlast(this.blasts.next(), e, SPINY_BLAST_LOOK);
        else if (e.spec === BOBOMB) placeBobomb(bobomb?.next(), e);
        else if (e.spec === BOBOMB_BLAST) placeBlast(this.blasts.next(), e, BOBOMB_BLAST_LOOK);
        else if (like === 'banana') placeEscortBanana(banana?.next(), e);
        else if (like) placeEscortShell(shells[like]?.next(), e, time);
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
    if (held === FIRE && kart.respawnTimer === 0) {
      const flower = this.fireFlowers.next();
      flower?.position.copy(at(0, HELD_HEIGHT - SIZE.held / 2, 0));
      flower?.rotation.set(0, model?.rotation.y ?? kart.heading, 0);
    }
    if (held && MODEL_OF.has(held) && !ESCORTS.has(held) && kart.respawnTimer === 0) {
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

/** A triple banana trailing its kart (MK-112), facing the way the kart goes. */
function placeEscortBanana(model: THREE.Object3D | undefined, entity: ItemEntity): void {
  if (!model) return;
  model.position.set(entity.position.x, entity.position.y + TRAIL_HEIGHT, entity.position.z);
  model.rotation.set(0, Math.atan2(-entity.direction.x, -entity.direction.z), 0);
}

/** A triple shell circling its kart (MK-112), spinning as a fired one does. */
function placeEscortShell(
  model: THREE.Object3D | undefined,
  entity: ItemEntity,
  time: number,
): void {
  if (!model) return;
  model.position.set(entity.position.x, entity.position.y + TRAIL_HEIGHT, entity.position.z);
  model.rotation.set(0, time * 12 + entity.id, 0);
}

/** A Spiny Shell (MK-113) where the sim has it, turned the way it flies, spinning slowly. */
function placeSpiny(model: THREE.Object3D | undefined, entity: ItemEntity): void {
  if (!model) return;
  model.position.set(entity.position.x, entity.position.y + SIZE.spiny * 0.3, entity.position.z);
  model.rotation.set(0, Math.atan2(-entity.direction.x, -entity.direction.z) + entity.age * 0.2, 0);
}

/** A blast's look: how long it's up, s, and how far it reaches, m. */
interface BlastLook {
  seconds: () => number;
  radius: () => number;
}
const SPINY_BLAST_LOOK: BlastLook = {
  seconds: () => tuning.mk8.spinyBlastSeconds,
  radius: () => tuning.mk8.spinyRadius,
};
const BOBOMB_BLAST_LOOK: BlastLook = {
  seconds: () => tuning.mk8.bobombBlastSeconds,
  radius: () => tuning.mk8.bobombRadius,
};

/** A Spiny Shell's (MK-113) or Bob-omb's (MK-114) explosion, growing and fading with its age. */
function placeBlast(model: THREE.Object3D | undefined, entity: ItemEntity, look: BlastLook): void {
  if (!model) return;
  model.position.set(entity.position.x, entity.position.y + 1, entity.position.z);
  const life = Math.round(look.seconds() * TICK_RATE);
  animateExplosion(model, entity.age, life, look.radius());
}

/** A Bob-omb (MK-114) where the sim has it (on its arc, or sitting), facing the way it was thrown. */
function placeBobomb(model: THREE.Object3D | undefined, entity: ItemEntity): void {
  if (!model) return;
  model.position.set(entity.position.x, entity.position.y + SIZE.bobomb * 0.5, entity.position.z);
  model.rotation.set(0, Math.atan2(-entity.direction.x, -entity.direction.z), 0);
}
