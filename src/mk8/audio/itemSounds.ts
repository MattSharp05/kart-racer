// MK8 races' item sounds (MK-129): every MK8 item event → a sound of the bank (`./soundIds.ts`:
// the MK Tour item pack, MK8 Deluxe's race sounds), or explicitly our synth's, or silence where
// another sound already covers it. Pure data and functions; `./itemSoundSkin.ts` plays them.
import type { SimEvent } from '../../sim/types';
import type { SoundId } from './soundIds';

/** Our synth's sound plays (the item's own view, `useSound` / `sounds`): no fitting MK8 sound. */
export const SYNTH = 'synth';

/** A sound of the bank, our synth's (`SYNTH`), or none (`null`: another sound covers it). */
export type ItemSound = SoundId | typeof SYNTH | null;

/** One item's sounds: when it's used, when it hits a kart, and its `itemFx` events by name. */
export interface ItemSounds {
  use: ItemSound;
  hit: ItemSound;
  fx?: Readonly<Record<string, ItemSound>>;
}

const SHELL = { use: 'items/shell-throw', hit: 'items/shell-hit' } as const;
const BANANA = { use: 'items/banana-drop', hit: 'items/banana-hit' } as const;

/**
 * Every item an MK8 race hands out, by sim id: MK8's (its reskins of ours too) and our five
 * unique ones, MK8-style where a fitting sound exists (an Oil Slick drops like a banana).
 */
export const ITEM_SOUNDS: Readonly<Record<string, ItemSounds>> = {
  banana: BANANA,
  green: SHELL,
  red: SHELL,
  mushroom: { use: 'items/mushroom-use', hit: null },
  // The `star` event plays its sound and the star music.
  star: { use: null, hit: 'items/shell-hit' },
  // The `lightning` event plays the strike; every kart it shrinks is part of it.
  lightning: { use: null, hit: null },
  boomerang: { use: 'items/boomerang-throw', hit: 'items/shell-hit', fx: { catch: SYNTH } },
  'ink-cloud': { use: 'items/blooper-ink', hit: null, fx: { splat: SYNTH } },
  'triple-green': SHELL,
  'triple-red': SHELL,
  'triple-banana': BANANA,
  'triple-mushroom': { use: 'items/mushroom-use', hit: null },
  'golden-mushroom': { use: 'items/golden-mushroom-use', hit: null },
  // Its flight warns its target in the HUD; the explosion is the sound (each kart it blows up is
  // part of it).
  'spiny-shell': {
    use: 'items/blue-shell-fly',
    hit: null,
    fx: { incoming: null, dive: 'items/blue-shell-fly', explode: 'items/blue-shell-explode' },
  },
  'super-horn': {
    use: null,
    hit: null,
    fx: { blast: 'items/super-horn-blast', spinyDown: 'items/blue-shell-explode' },
  },
  'bob-omb': { use: 'items/shell-throw', hit: null, fx: { explode: 'items/bob-omb-explode' } },
  'fire-flower': { use: 'items/fire-flower-shoot', hit: 'items/shell-hit' },
  'bullet-bill': { use: 'items/bullet-bill-use', hit: 'items/shell-hit' },
  coin: { use: 'items/coin-get', hit: null },
  'piranha-plant': {
    use: SYNTH,
    hit: 'items/shell-hit',
    fx: { lunge: 'items/piranha-plant-bite' },
  },
  // Each ring item sounds as it's used (its own `itemUsed`).
  'crazy-8': { use: null, hit: null, fx: { ring: SYNTH } },
  // Our five (MK-115).
  'oil-slick': { use: 'items/banana-drop', hit: SYNTH, fx: { slip: SYNTH } },
  'hornet-swarm': { use: SYNTH, hit: SYNTH, fx: { sting: SYNTH } },
  'bubble-shield': { use: SYNTH, hit: null, fx: { pop: SYNTH } },
  magnet: { use: SYNTH, hit: null, fx: { steal: SYNTH, stolen: SYNTH } },
  phase: { use: SYNTH, hit: null },
};

/** MK8's star music, played for the kart the camera follows when it gets a star. */
export const STAR_MUSIC: SoundId = 'star/music';

/** The sounds of item events that aren't one item's: a box broken, a star, a lightning strike. */
export const EVENT_SOUNDS = {
  itemBoxHit: 'items/item-box-break',
  star: 'items/star-use',
  lightning: 'items/lightning-strike',
} as const satisfies Record<string, SoundId>;

/** Every bank sound MK8 races' items play. */
export const ITEM_SAMPLES: readonly SoundId[] = [
  ...new Set([
    ...Object.values(EVENT_SOUNDS),
    ...Object.values(ITEM_SOUNDS).flatMap((s) =>
      [s.use, s.hit, ...Object.values(s.fx ?? {})].filter(
        (id): id is SoundId => id !== null && id !== SYNTH,
      ),
    ),
  ]),
];

/** Who hears an item sound: as in `src/audio/soundMap.ts`. */
export interface ItemCue {
  sound: ItemSound;
  scope: 'player' | 'near' | 'all';
  kartId: number;
}

/**
 * The item sound `event` makes in an MK8 race, or undefined when it isn't an item event (or an item
 * this table doesn't know: our synth plays it as ever).
 */
export function itemCue(event: SimEvent): ItemCue | undefined {
  switch (event.type) {
    case 'itemBoxHit':
      return { sound: EVENT_SOUNDS.itemBoxHit, scope: 'near', kartId: event.kartId };
    case 'itemUsed': {
      const sounds = ITEM_SOUNDS[event.item];
      return sounds && { sound: sounds.use, scope: 'near', kartId: event.kartId };
    }
    case 'kartHit': {
      const sounds = ITEM_SOUNDS[event.kind];
      return sounds && { sound: sounds.hit, scope: 'near', kartId: event.kartId };
    }
    case 'itemFx': {
      const sounds = ITEM_SOUNDS[event.item];
      if (!sounds) return undefined;
      // An effect the table doesn't name keeps our synth's (its view's `sounds`, or none).
      return { sound: sounds.fx?.[event.fx] ?? SYNTH, scope: 'near', kartId: event.kartId };
    }
    case 'star':
      return { sound: EVENT_SOUNDS.star, scope: 'near', kartId: event.kartId };
    case 'lightning':
      return { sound: EVENT_SOUNDS.lightning, scope: 'all', kartId: event.kartId };
    default:
      return undefined;
  }
}
