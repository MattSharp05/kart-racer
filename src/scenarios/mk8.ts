import { items } from '../content/items';
import { INK_TICKS } from '../content/items/ink-cloud/sim';
import { sunnyCircuit } from '../content/tracks/sunny-circuit/sim';
import { MK8_ITEM_SET } from '../mk8/content/items/id';
import { giveItem } from '../sim/items';
import { createSimState, type KartSpawn } from '../sim/state';
import { trackGeometry } from '../sim/track';
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
    name: 'mk8-ui-kit',
    group: 'MK8 Mode',
    description:
      "The MK8 UI kit's style guide (MK-104): mode tiles, colours and type → character grid → ready, with the stripe wipe, A/B button bar and menu sounds. Pack sprites when a local pack is built, stand-ins otherwise.",
    defaultSeed: 1,
    setup: (seed) => ({ state: attractMode(seed), screen: 'mk8UiKit' }),
  },
];
