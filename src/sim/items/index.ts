import { applyBoost } from '../drift';
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
import { updateBananas, useBanana } from './banana';
import { oddsRow, pickItem } from './odds';
import { fireShell, updateShells } from './shell';

/** What an item does when used. Each item is one entry (MK-16: mushroom; MK-17–20 add the rest). */
export interface ItemDef {
  id: ItemId;
  onUse(kart: KartState, state: SimState, events: SimEvent[], input: InputFrame): void;
}

export const ITEMS: Partial<Record<ItemId, ItemDef>> = {
  mushroom: {
    id: 'mushroom',
    onUse: (kart, _state, events) => applyBoost(kart, tuning.mushroomSeconds, events),
  },
  banana: {
    id: 'banana',
    onUse: (kart, state, _events, input) => useBanana(kart, state, input),
  },
  green: {
    id: 'green',
    onUse: (kart, state, _events, input) => fireShell(kart, state, input, 'green'),
  },
};

/** Items the roulette can hand out: only ones that have been built. */
export function availableItems(): ItemId[] {
  return Object.keys(ITEMS) as ItemId[];
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

  updateBananas(state, dt, events);
  updateShells(state, dt, events);

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
          slot.held = item;
          events.push({ type: 'itemGranted', kartId: kart.id, item });
        }
      }
    }

    // Use on press (not hold), only once the roulette has finished.
    const pressed = (inputs[kart.id]?.item ?? false) && !slot.buttonHeld;
    slot.buttonHeld = inputs[kart.id]?.item ?? false;
    if (pressed && slot.held !== null && slot.roulette === 0) {
      const item = slot.held;
      slot.held = null;
      ITEMS[item]?.onUse(kart, state, events, inputs[kart.id] ?? NEUTRAL_INPUT);
      events.push({ type: 'itemUsed', kartId: kart.id, item });
    }
  }
}
