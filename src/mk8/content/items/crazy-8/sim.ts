import { items } from '../../../../content/items/registries';
import { aiItemTactic } from '../../../../sim/ai/items';
import type { InputFrame, KartState, SimEvent, SimState } from '../../../../sim/types';
import { mk8ItemSim } from '../sim';

export const CRAZY8 = 'crazy-8';

/** Crazy 8's eight items as they sit round the kart (MK8's order). */
export const CRAZY8_RING = [
  'banana',
  'green',
  'red',
  'mushroom',
  'star',
  'bob-omb',
  'ink-cloud',
  'coin',
] as const;
/** The ones that go off the moment the ring comes out, as in MK8. */
export const CRAZY8_AT_ONCE: readonly string[] = ['star', 'coin'];
/** The rest, one per press, in ring order. */
export const CRAZY8_PRESSES: readonly string[] = CRAZY8_RING.filter(
  (item) => !CRAZY8_AT_ONCE.includes(item),
);
/** Uses per Crazy 8: one press to bring the ring out, then one per item left on it. */
export const CRAZY8_USES = 1 + CRAZY8_PRESSES.length;

/**
 * The items still circling `kart` (in ring order): none before the first press or once it's
 * gone; else the press items not used yet. From the slot's `uses` alone, so plain sim state (and
 * snapshots) carry the ring.
 */
export function crazy8Ring(kart: KartState): readonly string[] {
  const { held, uses, roulette } = kart.item;
  if (held !== CRAZY8 || roulette > 0 || uses >= CRAZY8_USES) return [];
  return CRAZY8_PRESSES.slice(CRAZY8_PRESSES.length - uses);
}

/** `kart` uses ring item `item` as if it held it (its own sim, its own `itemUsed` event). */
function useRingItem(
  item: string,
  kart: KartState,
  state: SimState,
  events: SimEvent[],
  input: InputFrame,
): void {
  items.get(item).onUse(kart, state, events, input);
  events.push({ type: 'itemUsed', kartId: kart.id, item });
}

/**
 * Crazy 8 (MK-126): the first press brings out a ring of eight items round the kart; its Star and
 * coin go off at once (as in MK8) and each next press uses the next one left, in ring order
 * (banana, green shell, red shell, mushroom, Bob-omb, Blooper), each as that item would. The slot
 * empties with the last. Drawn by `./render.ts` (and the `mk8` item skin with a pack).
 */
export default mk8ItemSim({
  id: CRAZY8,
  name: 'Crazy 8',
  order: 420,
  uses: CRAZY8_USES,
  onUse: (kart, state, events, input) => {
    // The press already took one use off (the slot is empty after the last).
    const left = kart.item.held === CRAZY8 ? kart.item.uses : 0;
    if (left === CRAZY8_PRESSES.length) {
      for (const item of CRAZY8_AT_ONCE) useRingItem(item, kart, state, events, input);
      events.push({ type: 'itemFx', kartId: kart.id, item: CRAZY8, fx: 'ring' });
      return;
    }
    const item = CRAZY8_PRESSES[CRAZY8_PRESSES.length - 1 - left];
    if (item) useRingItem(item, kart, state, events, input);
  },
  // AI drivers bring the ring out at once, then use each next item when its own tactic says so
  // (a banana with someone close behind, a green shell lined up, …).
  aiUse: (kart, state, ctx) => {
    const next = crazy8Ring(kart)[0];
    return next === undefined ? true : aiItemTactic(next, kart, state, ctx);
  },
});
