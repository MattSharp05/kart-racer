// MK8 items in our races (MK-103 reskins and the second slot, MK-112 triples and the Golden
// Mushroom, MK-113 Spiny Shell and Super Horn, MK-114 Bob-omb
// and Fire Flower), on Sunny Circuit's main straight.
import { items } from '../../content/items';
import { INK_TICKS } from '../../content/items/ink-cloud/sim';
import { MK8_ITEM_SET } from '../../mk8/content/items/id';
import { giveItem } from '../../sim/items';
import { nextEntityId } from '../../sim/items/banana';
import { forwardFromHeading } from '../../sim/math';
import { createSimState, type KartSpawn } from '../../sim/state';
import { tuning } from '../../sim/tuning';
import { NEUTRAL_INPUT, type SimEvent, type SimState } from '../../sim/types';
import type { Scenario } from '../registry';
import { holdOurs, OUR_ITEMS } from './lib/ourItems';
import { fromBoxes, spawn, sunny } from './lib/sunny';

/** A race state on Sunny Circuit with MK8's items: the `mk8` set and two slots (MK-103). */
function mk8ItemsRace(seed: number, karts: KartSpawn[]): SimState {
  return createSimState({
    seed,
    trackId: 'sunny-circuit',
    karts,
    itemSet: MK8_ITEM_SET,
    itemSlots: 2,
  });
}

/** Kart `kartId` uses `item` right now (it spawns its banana, shell, boomerang…). */
function use(state: SimState, kartId: number, item: string): void {
  const kart = state.karts[kartId];
  if (!kart) return;
  const events: SimEvent[] = [];
  items.get(item).onUse(kart, state, events, NEUTRAL_INPUT);
}

/**
 * Every reskinned MK8 item at once (MK-103), on Sunny Circuit's main straight: the item boxes
 * ahead; a banana, green and red shell and boomerang the player just let go; the player holding a
 * banana (a star in slot 2); karts ahead holding a green and red shell, mushroom, star, lightning,
 * boomerang and Blooper; and the last kart just struck by lightning and inked. MK-115: our five
 * unique items too, MK8-style: a row of karts further on holding each (the Bubble Shield, Magnet
 * and Phase karts using theirs), and an Oil Slick and Hornet Swarm from the kart ahead.
 */
export function mk8ItemsLineup(seed: number): SimState {
  const state = mk8ItemsRace(seed, [
    spawn(-17, 0),
    spawn(-9, -3),
    spawn(-9, 3),
    spawn(-5, -3),
    spawn(-5, 3),
    spawn(-1, -3),
    spawn(-1, 3),
    spawn(6, 0),
    ...OUR_ITEMS.map((_, i) => spawn(14, (i - 2) * 3)),
  ]);
  state.positions = state.karts.map((_, i) => state.karts.length - 1 - i);
  for (const item of ['banana', 'green', 'red', 'boomerang']) use(state, 0, item);
  use(state, 7, 'oil-slick');
  use(state, 7, 'hornet-swarm');
  holdOurs(state, 8);
  const held = ['banana', 'green', 'red', 'mushroom', 'star', 'lightning', 'boomerang'];
  held.forEach((item, id) => {
    const kart = state.karts[id];
    if (kart) giveItem(kart, item);
  });
  const player = state.karts[0];
  if (player?.item.second) giveItem(player.item.second, 'star');
  const struck = state.karts[7];
  if (struck) {
    struck.shrinkTimer = 4;
    struck.effects.push({ kind: 'ink-cloud', ticksLeft: INK_TICKS, by: 0, data: [0, 0] });
  }
  return state;
}

/**
 * The second slot (MK-103): the player holding a green shell, coasting at 20 m/s into a row of
 * item boxes 40 m ahead.
 */
export function mk8TwoSlots(seed: number): SimState {
  const state = mk8ItemsRace(seed, [spawn(-40, 0, 20)]);
  const [kart] = state.karts;
  if (kart) giveItem(kart, 'green');
  return state;
}

/** Uses of a triple item (MK-112). */
const TRIPLE = 3;

/**
 * Kart `kartId` holds MK8 item `item` with `uses` uses. Set directly: MK8's own items are only
 * registered once the race has loaded MK8 Mode (`Flow.prepareMk8Race`), after this setup runs.
 */
function hold(state: SimState, kartId: number, item: string, uses: number): void {
  const kart = state.karts[kartId];
  if (!kart) return;
  kart.item.held = item;
  kart.item.uses = uses;
}

/**
 * A triple item (MK-112) on Sunny Circuit's main straight: the player holding it (its shells
 * circle the kart, or its bananas trail behind it, from the first tick), a kart parked 24 m ahead
 * (a red shell's target) and a green shell fired by a kart behind, 30 m behind the player and
 * closing: one of the shells or bananas stops it.
 */
export function mk8TripleItem(seed: number, item: string): SimState {
  // Past the boost pad, short of the item boxes.
  const state = mk8ItemsRace(seed, [spawn(-25, 0), spawn(-1, 0), spawn(-65, 0)]);
  state.positions = [1, 0, 2];
  hold(state, 0, item, TRIPLE);
  const forward = forwardFromHeading(sunny.headingAt(fromBoxes(-55)));
  state.entities.push({
    id: nextEntityId(state),
    kind: 'shell',
    colour: 'green',
    position: sunny.pointAt(fromBoxes(-55), 0),
    direction: { x: forward.x, z: forward.z },
    speed: tuning.topSpeed[state.engineClass] * tuning.greenShellSpeed,
    bounces: 0,
    life: tuning.greenShellLife,
    ownerId: 2,
    ownerImmune: 0,
    targetId: -1,
  });
  return state;
}

/** The Golden Mushroom (MK-112): the player holding one, standing on the main straight. */
export function mk8Golden(seed: number): SimState {
  // Just past the first item boxes: 10 s of boosting reaches neither the next ones nor a boost pad.
  const state = mk8ItemsRace(seed, [spawn(5, 0)]);
  hold(state, 0, 'golden-mushroom', 1);
  return state;
}

/**
 * The Spiny Shell (MK-113) on Sunny Circuit: the player last, holding one; a kart parked in its
 * path 10 m ahead (the ground leg hits it); the leader parked 150 m on with two karts beside it
 * (inside the explosion's reach) and one 12 m behind it (outside); three more between.
 */
export function mk8Spiny(seed: number): SimState {
  const state = mk8ItemsRace(seed, [
    spawn(-25, 0),
    spawn(125, 0),
    spawn(-15, 0),
    spawn(125, -3.5),
    spawn(122, 3),
    spawn(113, 0),
    spawn(40, -4),
    spawn(60, 4),
  ]);
  state.positions = [1, 3, 4, 5, 7, 6, 2, 0];
  hold(state, 0, 'spiny-shell', 1);
  return state;
}

/**
 * The Spiny Shell's flight data as `src/mk8/content/items/spiny-shell/sim.ts` lays it out (copied
 * as plain numbers: this module is in the main bundle, which must not pull in MK8 code;
 * `spinyHorn.test.ts` keeps them in step): phase (1 = flying), metres round the lap, metres right
 * of the centreline, height, ticks in the phase and the dive's start.
 */
export const SPINY_FLYING = 1;

/**
 * Super Horn vs Spiny Shell (MK-113): the player leading on Sunny Circuit's straight, holding a
 * Super Horn, and a Spiny Shell flying in 60 m behind (thrown by the last kart, parked 80 m back),
 * past the item boxes.
 * Press the item button while it's over the player (it hovers, then drops): it's destroyed and the
 * player drives on. Too early (it's out of reach) or too late (it has exploded) and the player is
 * blown up.
 */
export function mk8HornVsSpiny(seed: number): SimState {
  // Past the item boxes, so they're behind the chase camera.
  const state = mk8ItemsRace(seed, [spawn(25, 0), spawn(-55, 0)]);
  state.positions = [0, 1];
  hold(state, 0, 'super-horn', 1);
  const t = fromBoxes(-35);
  const at = sunny.pointAt(t, 0);
  const forward = forwardFromHeading(sunny.headingAt(t));
  const height = tuning.mk8.spinyAirHeight;
  state.entities.push({
    id: nextEntityId(state),
    kind: 'item',
    spec: 'spiny-shell',
    position: { x: at.x, y: at.y + height, z: at.z },
    direction: { x: forward.x, z: forward.z },
    speed: tuning.topSpeed[state.engineClass] * tuning.mk8.spinySpeed,
    age: 0,
    ownerId: 1,
    targetId: 0,
    returning: 0,
    bounces: 0,
    data: [SPINY_FLYING, t * sunny.length, 0, height, 0, 0, 0, 0],
  });
  return state;
}

/**
 * The Bob-omb (MK-114) on Sunny Circuit's straight: the player holding one; two karts parked either
 * side of where a throw lands (20 m ahead, inside the blast) and one 12 m beyond it (outside).
 */
export function mk8Bobomb(seed: number): SimState {
  // Past the item boxes, so they're behind the chase camera.
  const state = mk8ItemsRace(seed, [spawn(20, 0), spawn(40, 4), spawn(40, -4), spawn(52, 0)]);
  hold(state, 0, 'bob-omb', 1);
  return state;
}

/** The Fire Flower (MK-114): the player holding one, a kart parked 30 m ahead in its line. */
export function mk8FireFlower(seed: number): SimState {
  const state = mk8ItemsRace(seed, [spawn(20, 0), spawn(50, 0)]);
  hold(state, 0, 'fire-flower', tuning.mk8.fireShots);
  return state;
}

const scenarios: Scenario[] = [
  {
    name: 'mk8-items-lineup',
    group: 'MK8 Mode',
    description:
      "Every reskinned MK8 item (MK-103): MK8 item boxes; a banana, green and red shell and boomerang on the road; karts holding each item; a lightning bolt and a Blooper on the last kart. MK-115: our five items MK8-style (a row of karts holding them, Bubble Shield, Magnet and Phase in use, an Oil Slick and a Hornet Swarm). Our items' looks without a local pack.",
    defaultSeed: 1,
    setup: (seed) => ({ state: mk8ItemsLineup(seed) }),
  },
  {
    name: 'mk8-two-slots',
    group: 'MK8 Mode',
    description:
      'Second item slot (MK-103): holding a green shell, coasting into item boxes. The box fills slot 2; fire the shell and slot 2 moves up to slot 1.',
    defaultSeed: 1,
    setup: (seed) => ({ state: mk8TwoSlots(seed) }),
  },
  {
    name: 'mk8-item-triple-red',
    group: 'MK8 Mode',
    description:
      'Triple Red Shells (MK-112): three red shells circle the player. A green shell from behind hits one (both go, the player keeps going); each press fires one at the kart 24 m ahead; the icon counts down 3 → 2 → 1, then the slot empties.',
    defaultSeed: 1,
    setup: (seed) => ({ state: mk8TripleItem(seed, 'triple-red') }),
  },
  {
    name: 'mk8-item-triple-green',
    group: 'MK8 Mode',
    description:
      'Triple Green Shells (MK-112): three green shells circle the player and stop a green shell from behind; each press fires one straight ahead (backwards while braking).',
    defaultSeed: 1,
    setup: (seed) => ({ state: mk8TripleItem(seed, 'triple-green') }),
  },
  {
    name: 'mk8-item-triple-banana',
    group: 'MK8 Mode',
    description:
      'Triple Bananas (MK-112): three bananas trail the player and stop a green shell from behind; each press drops one behind (or throws it ahead while accelerating).',
    defaultSeed: 1,
    setup: (seed) => ({ state: mk8TripleItem(seed, 'triple-banana') }),
  },
  {
    name: 'mk8-item-triple-mushroom',
    group: 'MK8 Mode',
    description:
      'Triple Mushrooms (MK-112): three boosts, one per press; the icon counts down, then the slot empties.',
    defaultSeed: 1,
    setup: (seed) => {
      const state = mk8Golden(seed);
      hold(state, 0, 'triple-mushroom', TRIPLE);
      return { state };
    },
  },
  {
    name: 'mk8-item-golden',
    group: 'MK8 Mode',
    description: `Golden Mushroom (MK-112): every press boosts, as often as you like, for ${tuning.mk8.goldenTime} s from the first press; then the slot empties.`,
    defaultSeed: 1,
    setup: (seed) => ({ state: mk8Golden(seed) }),
  },
  {
    name: 'mk8-item-spiny',
    group: 'MK8 Mode',
    description:
      'Spiny Shell (MK-113): the player is last, holding one; press the item button. It skims the road for 1.5 s (the kart parked in its path spins out), flies along the course to the leader 150 m on, closes in over it, drops and explodes: the leader and the two karts beside it spin out and are thrown up; the kart 12 m behind is untouched.',
    defaultSeed: 1,
    setup: (seed) => ({ state: mk8Spiny(seed) }),
  },
  {
    name: 'mk8-item-horn-vs-spiny',
    group: 'MK8 Mode',
    description:
      'Super Horn vs Spiny Shell (MK-113): the player leads, holding a Super Horn, with a Spiny Shell flying in from 60 m behind. Press the item button while it hovers over the player or drops: the shockwave destroys it and the player drives on unhurt. Too early (out of reach) or too late (exploded) and the player is blown up.',
    defaultSeed: 1,
    setup: (seed) => ({ state: mk8HornVsSpiny(seed) }),
  },
  {
    name: 'mk8-item-bobomb',
    group: 'MK8 Mode',
    description: `Bob-omb (MK-114): press the item button and it's thrown 20 m ahead in an arc (hold brake to drop it behind). It explodes ${tuning.mk8.bobombFuse} s after it's let go, or when a kart touches it: the two karts beside where it lands spin out and are thrown up; the kart 12 m beyond is untouched.`,
    defaultSeed: 1,
    setup: (seed) => ({ state: mk8Bobomb(seed) }),
  },
  {
    name: 'mk8-item-fire-flower',
    group: 'MK8 Mode',
    description: `Fire Flower (MK-114): each press shoots a hopping fireball ahead (behind while braking) that bounces off walls and spins out the first kart it hits: the kart parked 30 m ahead. Up to ${tuning.mk8.fireShots} fireballs for ${tuning.mk8.fireTime} s from the first press; then the slot empties.`,
    defaultSeed: 1,
    setup: (seed) => ({ state: mk8FireFlower(seed) }),
  },
];
export default scenarios;
