import type { KartItem, KartState } from '../types';

/**
 * Two-slot races (MK-103): once slot 1 is empty (used up, stolen, thrown), slot 2's item, or its
 * roulette still spinning, moves up to slot 1.
 */
export function promoteSecondSlot(slot: KartItem): void {
  const second = slot.second;
  if (!second || slot.held !== null || slot.roulette > 0) return;
  if (second.held === null && second.roulette === 0) return;
  slot.held = second.held;
  slot.uses = second.uses;
  slot.roulette = second.roulette;
  slot.second = { held: null, uses: 0, roulette: 0 };
}

/** Empties every slot of `kart` (lightning makes karts drop their items). */
export function dropItems(kart: KartState): void {
  kart.item = {
    ...kart.item,
    held: null,
    uses: 0,
    roulette: 0,
    ...(kart.item.second ? { second: { held: null, uses: 0, roulette: 0 } } : {}),
  };
}
