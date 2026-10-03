import { items } from '../content/items';
import { INK_TICKS } from '../content/items/ink-cloud/sim';
import { sunnyCircuit } from '../content/tracks/sunny-circuit/sim';
import { MK8_ITEM_SET } from '../mk8/content/items/id';
import { giveItem } from '../sim/items';
import { nextEntityId } from '../sim/items/banana';
import { forwardFromHeading } from '../sim/math';
import { createSimState, type KartSpawn } from '../sim/state';
import { trackGeometry } from '../sim/track';
import { tuning } from '../sim/tuning';
import { NEUTRAL_INPUT, type SimEvent, type SimState } from '../sim/types';
import { attractMode } from './menus';
import type { Scenario } from './registry';

const sunny = trackGeometry(sunnyCircuit);
/** Sunny Circuit's first row of item boxes, on the main straight. */
const BOX_ROW = sunnyCircuit.itemBoxRows?.[0]?.t ?? 0.08;
/** The track position `metres` from the box row. */
const fromBoxes = (metres: number) => BOX_ROW + metres / sunny.length;

/** A kart `metres` from the box row, `lateral` m off the centreline, facing down the straight. */
function spawn(metres: number, lateral: number, speed = 0): KartSpawn {
  const t = fromBoxes(metres);
  return { position: sunny.pointAt(t, lateral), heading: sunny.headingAt(t), speed };
}

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
 * boomerang and Blooper; and the last kart just struck by lightning and inked.
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
  ]);
  state.positions = [7, 6, 5, 4, 3, 2, 1, 0];
  for (const item of ['banana', 'green', 'red', 'boomerang']) use(state, 0, item);
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
 * MK8 Mode (MK-97). `mk8-mode` loads the pack: under `pnpm dev` from a local build, on the site
 * behind its password (MK-135, ADR 0009 as amended), else "MK8 pack not installed" (CI, a deploy
 * without the pack).
 */
export const mk8Scenarios: Scenario[] = [
  {
    name: 'mk8-entry',
    group: 'MK8 Mode',
    description: 'The title with the MK8 Mode button (NEW badge) selected: Enter opens MK8 Mode.',
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen: 'mk8Entry' }),
  },
  {
    name: 'mk8-loading',
    group: 'MK8 Mode',
    description: "MK8 Mode's loading screen held at 50 % (nothing is fetched).",
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen: 'mk8Loading' }),
  },
  {
    name: 'mk8-not-installed',
    group: 'MK8 Mode',
    description:
      'The "MK8 pack not installed" screen with the commands to build the pack, and Back.',
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen: 'mk8NotInstalled' }),
  },
  {
    name: 'mk8-password',
    group: 'MK8 Mode',
    description:
      "The site's MK8 pack password box (MK-135): the right password loads the pack, a wrong one shows an error. MK8 Mode opens it itself when the pack answers 401.",
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen: 'mk8Password' }),
  },
  {
    name: 'mk8-mode',
    group: 'MK8 Mode',
    description:
      'MK8 Mode as the title button opens it: loads the pack (progress bar), then the placeholder screen; "not installed" without a local pack.',
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen: 'mk8' }),
  },
  {
    name: 'mk8-items-lineup',
    group: 'MK8 Mode',
    description:
      "Every reskinned MK8 item (MK-103): MK8 item boxes; a banana, green and red shell and boomerang on the road; karts holding each item; a lightning bolt and a Blooper on the last kart. Our items' looks without a local pack.",
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
    name: 'mk8-ui-kit',
    group: 'MK8 Mode',
    description:
      "The MK8 UI kit's style guide (MK-104): mode tiles, colours and type → character grid → ready, with the stripe wipe, A/B button bar and menu sounds. Pack sprites when a local pack is built, stand-ins otherwise.",
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen: 'mk8UiKit' }),
  },
  {
    name: 'mk8-ui-title',
    group: 'MK8 Mode',
    description:
      "MK8 Mode's title (MK-116): the logo pops in, Press start blinks, the 12 racers bob. Enter or a tap wipes to the mode select; Back returns to the Kart Racer title. The real logo and racers with a local pack, stand-ins otherwise.",
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen: 'mk8UiTitle' }),
  },
  {
    name: 'mk8-ui-mode',
    group: 'MK8 Mode',
    description:
      'MK8 mode select (MK-116): Grand Prix, VS Race, Time Trial and Online, the selected one pulsing with its art at the side. OK goes on to character select with the mode; Back wipes to the MK8 title.',
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen: 'mk8UiMode' }),
  },
  {
    name: 'mk8-ui-cc',
    group: 'MK8 Mode',
    description:
      'MK8 engine class (MK-119): the 50/100/150/200cc shields (200cc NEW) for a Grand Prix, 150cc selected. OK goes on to the cup select; Back walks back through character select (a stand-in for now) and the mode select. The real shields with a local pack, stand-ins otherwise.',
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen: 'mk8UiCc' }),
  },
  {
    name: 'mk8-ui-cup',
    group: 'MK8 Mode',
    description:
      'MK8 cup select for a 150cc Grand Prix (MK-119): the Mushroom Cup and its 4 course cards (preview, map, anti-gravity tag, Time Trial best "—"); Flower, Star and Special Cups locked ("Later"). OK on the Mushroom Cup loads Mario Kart Stadium (our Sunny Circuit stands in until it is drivable) and starts the race.',
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen: 'mk8UiCup' }),
  },
  {
    name: 'mk8-ui-course',
    group: 'MK8 Mode',
    description:
      'MK8 cup and course select for a 150cc VS Race (MK-119): OK on the Mushroom Cup moves the cursor to its courses (roulette sound on each move); OK on a course loads it and starts the race on it (our tracks stand in until the MK8 courses are drivable). Back returns to the cups.',
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen: 'mk8UiCourse' }),
  },
  ...(
    [
      [
        'mk8-racers-lineup',
        'mk8RacersLineup',
        'MK8\'s 12 racers in a row in the Standard Kart, names underneath (MK-101). Needs a local pack; "not installed" without one.',
      ],
      [
        'mk8-racer-motion',
        'mk8RacerMotion',
        'Mario in the Standard Kart running a loop of moves: leaning into turns, a jump and landing (squash, bob), a hit spin, a ramp trick and looking back at a shell (MK-101). Needs a local pack.',
      ],
      [
        'mk8-lakitu-countdown',
        'mk8LakituCountdown',
        'Lakitu flies in with the start light: a red lamp each second, green, then he leaves; looping (MK-101). Needs a local pack.',
      ],
      [
        'mk8-lakitu-lap',
        'mk8LakituLap',
        'Lakitu shows the lap sign, "2" then "FINAL LAP", looping (MK-101). Needs a local pack.',
      ],
      [
        'mk8-lakitu-respawn',
        'mk8LakituRespawn',
        'Lakitu fishes a kart out: comes down, lifts it on his line, drops it; looping (MK-101). Needs a local pack.',
      ],
    ] as const
  ).map(([name, screen, description]): Scenario => ({
    name,
    group: 'MK8 Mode',
    description,
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen }),
  })),
];
