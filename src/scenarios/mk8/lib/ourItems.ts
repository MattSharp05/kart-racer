// Our five unique items in MK8 races (MK-115), for the item scenarios: karts holding each, the
// Bubble Shield, Magnet and Phase karts using theirs.
import { items } from '../../../content/items';
import { giveItem } from '../../../sim/items';
import { NEUTRAL_INPUT, type SimState } from '../../../sim/types';

/** Our five unique items, in the order karts hold them. */
export const OUR_ITEMS = ['oil-slick', 'hornet-swarm', 'bubble-shield', 'magnet', 'phase'];
/** Those shown in use as well (they act on their own kart). */
const SHOWN_IN_USE: ReadonlySet<string> = new Set(['bubble-shield', 'magnet', 'phase']);

/** Kart `kartId` uses `item` right now (it drops its oil, sends its hornets…). */
export function useNow(state: SimState, kartId: number, item: string): void {
  const kart = state.karts[kartId];
  if (kart) items.get(item).onUse(kart, state, [], NEUTRAL_INPUT);
}

/** Karts `first`… hold our five items; the Bubble Shield, Magnet and Phase karts use theirs. */
export function holdOurs(state: SimState, first: number): void {
  OUR_ITEMS.forEach((item, i) => {
    const kart = state.karts[first + i];
    if (kart) giveItem(kart, item);
    if (SHOWN_IN_USE.has(item)) useNow(state, first + i, item);
  });
}
