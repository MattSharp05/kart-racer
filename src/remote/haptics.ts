import type { SimEvent } from '../sim/types';
import type { BuzzKind } from './protocol';

/**
 * What the phone driving kart `kartId` should feel from this tick's events (MK-147): a buzz when an
 * item hits the kart, a short one on a mini-turbo. At most one of each per tick, so a burst of
 * events stays a few bytes on the wire.
 */
export function buzzesFor(events: readonly SimEvent[], kartId: number): BuzzKind[] {
  const kinds = new Set<BuzzKind>();
  for (const event of events) {
    if (event.type === 'kartHit' && event.kartId === kartId) kinds.add('hit');
    else if (event.type === 'miniTurbo' && event.kartId === kartId) kinds.add('turbo');
  }
  return [...kinds];
}
