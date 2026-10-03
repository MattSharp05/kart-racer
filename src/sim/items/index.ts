import { items, itemSets } from '../../content/items';
import { countDown } from '../math';
import { positionOf } from '../race';
import { rngFloat } from '../rng';
import { tuning } from '../tuning';
import {
  NEUTRAL_INPUT,
  type InputFrame,
  type ItemId,
  type ItemSlot,
  type KartState,
  type SimEvent,
  type SimState,
} from '../types';
import { updateEffects } from './effects';
import { updateItemEntities } from './entities';
import { itemSetOddsRow, oddsRow, pickItem } from './odds';
import { promoteSecondSlot } from './slots';

export { dropItems, promoteSecondSlot } from './slots';

/**
 * Items the roulette can hand out: every registered item (`src/content/items/`) but test-only
 * ones and MK8-only ones (no odds of their own, MK-103), in order. With an item set, only the
 * registered items in its odds table.
 */
export function availableItems(itemSet?: string): ItemId[] {
  const odds = itemSet === undefined ? undefined : itemSets.get(itemSet).odds;
  return items
    .list()
    .filter((item) =>
      odds === undefined ? !item.testOnly && item.odds.some((w) => w > 0) : item.id in odds,
    )
    .map((item) => item.id);
}

/** Puts `item` in a slot with all its uses (MK-52); `kart` = its first slot. */
export function giveItem(kart: KartState | ItemSlot, item: ItemId): void {
  const slot = 'item' in kart ? kart.item : kart;
  slot.held = item;
  slot.uses = items.get(item).uses ?? 1;
}

/** Whether an item `kart` used still claims its slot 1 (`ItemContent.keepsSlot`, MK-103). */
function slotKept(kart: KartState, state: SimState): boolean {
  return items.list().some((item) => item.keepsSlot?.(kart, state) ?? false);
}

/** The roulette's pick for `kart`: by its race position, from the race's item set's odds. */
function rollItem(state: SimState, kart: KartState): ItemId | null {
  const position = positionOf(state, kart.id);
  const racers = state.karts.length;
  const odds =
    state.itemSet === undefined
      ? oddsRow(position, racers)
      : itemSetOddsRow(state.itemSet, position, racers);
  return pickItem(odds, rngFloat(state), availableItems(state.itemSet));
}

/** Each item's per-tick `update`, in item order, once per distinct function. */
function itemUpdates() {
  return [...new Set(items.list().flatMap((item) => (item.update ? [item.update] : [])))];
}

/**
 * Item boxes, the roulette and using items, once per tick after karts move (MK-16).
 * Mutates `state` (the tick's clone).
 */
export function updateItems(
  state: SimState,
  inputs: readonly InputFrame[],
  dt: number,
  events: SimEvent[],
  only?: number,
): void {
  for (const box of state.entities) {
    if (box.kind === 'itemBox') box.respawnTimer = countDown(box.respawnTimer, dt);
  }

  updateEffects(state, dt, events);
  for (const update of itemUpdates()) update(state, dt, events);
  updateItemEntities(state, dt, events);

  for (const kart of state.karts) {
    // Simulating one kart (`StepOptions.only`, MK-74): the others' boxes and items are the host's.
    if (only !== undefined && kart.id !== only) continue;
    kart.spinTimer = countDown(kart.spinTimer, dt);
    const slot = kart.item;
    const second = slot.second;
    // Two-slot races (MK-103): slot 1 may be kept for an item on its way back (a boomerang).
    const kept =
      second !== undefined && slot.held === null && slot.roulette === 0 && slotKept(kart, state);
    if (!kept) promoteSecondSlot(slot);

    // Drive through an active box: it breaks; start the roulette if the slot is free (else slot
    // 2's, in two-slot races, MK-103).
    for (const box of state.entities) {
      if (box.kind !== 'itemBox' || box.respawnTimer > 0 || kart.respawnTimer > 0) continue;
      const dx = kart.position.x - box.position.x;
      const dz = kart.position.z - box.position.z;
      if (Math.hypot(dx, dz) > tuning.itemBoxRadius) continue;
      box.respawnTimer = tuning.itemBoxRespawnSeconds;
      events.push({ type: 'itemBoxHit', kartId: kart.id, boxId: box.id });
      if (slot.held === null && slot.roulette === 0 && !kept) {
        slot.roulette = tuning.rouletteSeconds;
      } else if (second && second.held === null && second.roulette === 0) {
        second.roulette = tuning.rouletteSeconds;
      }
    }

    // Roulette ends: the item depends on the kart's position right now.
    if (slot.roulette > 0) {
      slot.roulette = countDown(slot.roulette, dt);
      if (slot.roulette === 0) {
        const item = rollItem(state, kart);
        if (item) {
          giveItem(kart, item);
          events.push({ type: 'itemGranted', kartId: kart.id, item });
        }
      }
    }
    if (second && second.roulette > 0) {
      second.roulette = countDown(second.roulette, dt);
      if (second.roulette === 0) {
        const item = rollItem(state, kart);
        if (item) {
          giveItem(second, item);
          events.push({ type: 'itemGranted', kartId: kart.id, item, slot: 2 });
        }
      }
    }

    if (slot.held !== null && slot.roulette === 0) {
      items.get(slot.held).onHoldTick?.(kart, state, dt, events);
    }

    // Use on press (not hold), only once the roulette has finished. The slot empties on the last
    // use (a slot set without `uses`, as scenarios do, counts as one use).
    const pressed = (inputs[kart.id]?.item ?? false) && !slot.buttonHeld;
    slot.buttonHeld = inputs[kart.id]?.item ?? false;
    if (pressed && slot.held !== null && slot.roulette === 0) {
      const item = slot.held;
      if (slot.uses > 1) slot.uses -= 1;
      else {
        slot.held = null;
        slot.uses = 0;
      }
      items.get(item).onUse(kart, state, events, inputs[kart.id] ?? NEUTRAL_INPUT);
      events.push({ type: 'itemUsed', kartId: kart.id, item });
      if (second && !slotKept(kart, state)) promoteSecondSlot(slot);
    }
  }
}
