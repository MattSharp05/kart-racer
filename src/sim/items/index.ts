import { items } from '../../content/items';
import { countDown } from '../math';
import { positionOf } from '../race';
import { rngFloat } from '../rng';
import { tuning } from '../tuning';
import {
  NEUTRAL_INPUT,
  type InputFrame,
  type ItemId,
  type KartState,
  type SimEvent,
  type SimState,
} from '../types';
import { updateEffects } from './effects';
import { updateItemEntities } from './entities';
import { oddsRow, pickItem } from './odds';

/**
 * Items the roulette can hand out: every registered item (`src/content/items/`) but test-only
 * ones, in order.
 */
export function availableItems(): ItemId[] {
  return items
    .list()
    .filter((item) => !item.testOnly)
    .map((item) => item.id);
}

/** Puts `item` in the kart's slot with all its uses (MK-52). */
export function giveItem(kart: KartState, item: ItemId): void {
  kart.item.held = item;
  kart.item.uses = items.get(item).uses ?? 1;
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
): void {
  for (const box of state.entities) {
    if (box.kind === 'itemBox') box.respawnTimer = countDown(box.respawnTimer, dt);
  }

  updateEffects(state, dt, events);
  for (const update of itemUpdates()) update(state, dt, events);
  updateItemEntities(state, dt, events);

  for (const kart of state.karts) {
    kart.spinTimer = countDown(kart.spinTimer, dt);
    const slot = kart.item;

    // Drive through an active box: it breaks; start the roulette if the slot is free.
    for (const box of state.entities) {
      if (box.kind !== 'itemBox' || box.respawnTimer > 0 || kart.respawnTimer > 0) continue;
      const dx = kart.position.x - box.position.x;
      const dz = kart.position.z - box.position.z;
      if (Math.hypot(dx, dz) > tuning.itemBoxRadius) continue;
      box.respawnTimer = tuning.itemBoxRespawnSeconds;
      events.push({ type: 'itemBoxHit', kartId: kart.id, boxId: box.id });
      if (slot.held === null && slot.roulette === 0) slot.roulette = tuning.rouletteSeconds;
    }

    // Roulette ends: the item depends on the kart's position right now.
    if (slot.roulette > 0) {
      slot.roulette = countDown(slot.roulette, dt);
      if (slot.roulette === 0) {
        const odds = oddsRow(positionOf(state, kart.id), state.karts.length);
        const item = pickItem(odds, rngFloat(state), availableItems());
        if (item) {
          giveItem(kart, item);
          events.push({ type: 'itemGranted', kartId: kart.id, item });
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
    }
  }
}
