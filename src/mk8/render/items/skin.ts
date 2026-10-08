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
  KartEffect,
  KartState,
  ShellEntity,
  SimState,
} from '../../../sim/types';
import { MK8_ITEM_BOX_MODEL, MK8_ITEM_SET, MK8_ITEMS } from '../../content/items';
import { animateExplosion, explosionModel } from '../../content/items/looks';
import { SPINY, SPINY_BLAST } from '../../content/items/spiny-shell/sim';
import { BOBOMB, BOBOMB_BLAST } from '../../content/items/bob-omb/sim';
import { FIRE } from '../../content/items/fire-flower/sim';
import { getEffect } from '../../../sim/items/effects';
import { escortPose } from '../../content/items/escort';
import { PIRANHA } from '../../content/items/piranha-plant/sim';
import {
  PIRANHA_AHEAD,
  PIRANHA_HEIGHT,
  piranhaLunge,
  piranhaModel,
} from '../../content/items/piranha-plant/render';
import { CRAZY8, crazy8Ring } from '../../content/items/crazy-8/sim';
import { crazy8Halo, crazy8Model } from '../../content/items/crazy-8/render';
import { fireFlowerModel } from '../../content/items/fire-flower/render';
import { TICK_RATE, tuning } from '../../../sim/tuning';
import { itemBoxModel } from './itemBox';
import type { ItemModels } from './models';
import { OUR_LOOKS } from './ours';

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
  piranha: 1.3,
  ring: 0.7,
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
/** A lunging Piranha Plant leans this far towards what it bites, radians per metre out. */
const PIRANHA_LEAN = 0.35;
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
    looks: OUR_LOOKS,
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
  /** Item boxes (MK-105 revisit): drawn in code as 3D boxes, the pack's flat-looking glass not. */
  private readonly boxes: ModelPool;
  /** Spiny Shell explosions (MK-113): the pack has no model, so ours. */
  private readonly blasts: ModelPool;
  /** The held Fire Flower (MK-114): the pack has no model, so ours. */
  private readonly fireFlowers: ModelPool;
  /** MK-126: the Piranha Plant when the pack has none, the held Crazy 8 and its ring's glow. */
  private readonly piranhas: ModelPool;
  private readonly crazy8s: ModelPool;
  private readonly halos: ModelPool;
  /** Our five unique items held (MK-115): their MK8-style models, by item id. */
  private readonly ours = new Map<string, ModelPool>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly models: ItemModels,
  ) {
    // One shared texture: the pool copies the first mark.
    const mark = questionMark();
    this.questionMarks = new ModelPool(scene, () => mark.clone());
    const box = itemBoxModel();
    box.scale.setScalar(SIZE.itemBox);
    this.boxes = new ModelPool(scene, () => box.clone());
    this.blasts = new ModelPool(scene, explosionModel);
    this.fireFlowers = new ModelPool(scene, () => {
      const flower = fireFlowerModel();
      flower.scale.setScalar(SIZE.held);
      return flower;
    });
    this.piranhas = new ModelPool(scene, () => {
      const plant = piranhaModel();
      plant.scale.setScalar(SIZE.piranha);
      return plant;
    });
    this.crazy8s = new ModelPool(scene, () => {
      const eight = crazy8Model();
      eight.scale.setScalar(SIZE.held);
      return eight;
    });
    this.halos = new ModelPool(scene, crazy8Halo);
  }

  /** The pool of held copies of our item `item` (MK-115), if it is one of ours. */
  private ourPool(item: string): ModelPool | undefined {
    const look = OUR_LOOKS.get(item);
    if (!look) return undefined;
    let pool = this.ours.get(item);
    if (!pool) {
      pool = new ModelPool(this.scene, () => {
        const held = look.held();
        held.scale.setScalar(SIZE.held);
        return held;
      });
      this.ours.set(item, pool);
    }
    return pool;
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
      for (const kart of state.karts) this.drawKart(kart, time, kartModel(kart.id), state.tick);
    }
    for (const pool of this.pools.values()) pool.finish();
    this.questionMarks.finish();
    this.boxes.finish();
    this.blasts.finish();
    this.fireFlowers.finish();
    this.piranhas.finish();
    this.crazy8s.finish();
    this.halos.finish();
    for (const pool of this.ours.values()) pool.finish();
  }

  /**
   * A Piranha Plant out in front (MK-126): the pack's potted plant (ours without one), lunging
   * along its last lunge's direction for a moment after each bite.
   */
  private drawPiranha(
    kart: KartState,
    effect: KartEffect,
    at: (x: number, y: number, z: number) => THREE.Vector3,
  ): void {
    const plant = (this.pool(MODEL_OF.get(PIRANHA), SIZE.piranha) ?? this.piranhas).next();
    if (!plant) return;
    // In front is −Z in the kart's frame.
    plant.position.copy(at(0, PIRANHA_HEIGHT, -PIRANHA_AHEAD));
    const lunge = piranhaLunge(effect);
    plant.position.x += lunge.x * lunge.out;
    plant.position.z += lunge.z * lunge.out;
    // The sim's heading (the kart model's Euler y isn't its yaw once it faces backwards).
    const yaw = lunge.out > 0 ? Math.atan2(-lunge.x, -lunge.z) : kart.heading;
    // Turned first, then leaning forward (its top towards −Z) as it lunges.
    plant.rotation.order = 'YXZ';
    plant.rotation.set(-lunge.out * PIRANHA_LEAN, yaw, 0);
  }

  /**
   * Crazy 8 (MK-126): its glowing "8" over the driver until the first press, then the items left
   * on its ring circling the kart (as triple shells do) inside a faint glowing ring.
   */
  private drawCrazy8(
    kart: KartState,
    time: number,
    tick: number,
    at: (x: number, y: number, z: number) => THREE.Vector3,
  ): void {
    const ring = crazy8Ring(kart);
    if (ring.length === 0) {
      const eight = this.crazy8s.next();
      eight?.position.copy(at(0, HELD_HEIGHT - SIZE.held / 2, 0));
      eight?.rotation.set(0, time * 2, 0);
      return;
    }
    const halo = this.halos.next();
    halo?.position.set(kart.position.x, kart.position.y + TRAIL_HEIGHT, kart.position.z);
    halo?.scale.setScalar(tuning.mk8.orbitRadius);
    ring.forEach((item, k) => {
      const copy = this.pool(MODEL_OF.get(item), SIZE.ring)?.next();
      if (!copy) return;
      const pose = escortPose('orbit', kart, k, ring.length, tick);
      copy.position.set(pose.x, kart.position.y + TRAIL_HEIGHT, pose.z);
      copy.rotation.set(0, time * 3 + k, 0);
    });
  }

  private drawEntities(state: SimState, time: number): void {
    const box = this.models.has(MK8_ITEM_BOX_MODEL) ? this.boxes : undefined;
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
  private drawKart(
    kart: KartState,
    time: number,
    model: THREE.Object3D | undefined,
    tick: number,
  ): void {
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
    const plant = getEffect(kart, PIRANHA);
    if (plant && kart.respawnTimer === 0) this.drawPiranha(kart, plant, at);
    if (held === CRAZY8 && kart.respawnTimer === 0) this.drawCrazy8(kart, time, tick, at);
    // Our unique items (MK-115): their own MK8-style models, turning over the driver.
    const ours = held && kart.respawnTimer === 0 ? this.ourPool(held)?.next() : undefined;
    if (ours) {
      ours.position.copy(at(0, HELD_HEIGHT, 0));
      ours.rotation.set(0, (model?.rotation.y ?? kart.heading) + time * 2, 0);
    } else if (
      held &&
      MODEL_OF.has(held) &&
      !ESCORTS.has(held) &&
      !(held === PIRANHA && plant) &&
      kart.respawnTimer === 0
    ) {
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
