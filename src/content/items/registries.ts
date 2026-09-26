import type { AiItemContext } from '../../sim/ai/items';
import type { EffectContent } from '../../sim/items/effects';
import type { EntitySpec } from '../../sim/items/entities';
import type { InputFrame, KartState, SimEvent, SimState } from '../../sim/types';
import { Registry } from '../registry';

/** Rows in the item odds table: row 0 = 1st place … the last row = last place (MK-16). */
export const ODDS_ROWS = 8;

/**
 * An item (ADR 0007): `src/content/items/<id>/sim.ts` default-exports one of these (pure sim
 * code); its icon, use sound and world renderer are in `./render.ts`.
 */
export interface ItemContent {
  id: string;
  /** Shown as the HUD item slot's tooltip. */
  name: string;
  /** Roulette and tie-break order. */
  order: number;
  /** Dev/test items (the MK-52 worked example): never handed out, only given by scenarios. */
  testOnly?: boolean;
  /**
   * Chance in each odds row (`ODDS_ROWS` numbers, 1st place first). Across every handed-out item
   * each row sums to 1 (MK-72, unit-tested), so a new item takes its share from the others; the
   * roulette still divides by the row's total, so an item left out renormalises the rest.
   */
  odds: readonly number[];
  /**
   * Uses per pickup (default 1): a multi-use item (Turbo Trio = 3) stays in the slot until its
   * last use. `kart.item.uses` counts down, and is already lowered when `onUse` runs.
   */
  uses?: number;
  /** Runs when the holder presses the item button. Mutates `state` (the tick's clone). */
  onUse(kart: KartState, state: SimState, events: SimEvent[], input: InputFrame): void;
  /** Runs every tick while a kart holds this item (roulette finished), before it can be used. */
  onHoldTick?(kart: KartState, state: SimState, dt: number, events: SimEvent[]): void;
  /**
   * AI drivers: whether to use it now, once their seeded thinking time is over (default: at once).
   * `true` presses the button, an object presses it with those inputs too (e.g. `{ throttle: 0 }`
   * to drop behind). After `ai.itemGiveUp` s `ctx.giveUp` is set: settle for any sensible moment
   * (a hook that still says no is overruled after `ai.itemForceUse` s, MK-72).
   */
  aiUse?(kart: KartState, state: SimState, ctx: AiItemContext): boolean | Partial<InputFrame>;
  /** Timed kart effects this item applies (`sim/items/effects.ts`); ids are global. */
  effects?: readonly EffectContent[];
  /** World entities this item spawns (`sim/items/entities.ts`); ids are global. */
  entities?: readonly EntitySpec[];
  /**
   * Runs once per tick, before karts pick up or use items, to move this item's world entities.
   * Items that share one function (green and red shells) run it once.
   */
  update?(state: SimState, dt: number, events: SimEvent[]): void;
}

/** An entity spec as registered: with the item it belongs to (its hits count as that item). */
export type RegisteredEntitySpec = EntitySpec & { item: string };
/** An effect as registered: with the item it belongs to (whose view draws it). */
export type RegisteredEffect = EffectContent & { item: string };

/** Every item. The odds table and `sim/items` read it live, so a registered item is in play. */
export const items = new Registry<ItemContent>('item');
/** Every item's kart effects, by effect id. */
export const itemEffects = new Registry<RegisteredEffect>('item effect');
/** Every item's entity specs, by spec id. */
export const entitySpecs = new Registry<RegisteredEntitySpec>('item entity');

/** Registers an item, its effects and its entities, after checking its odds row count. */
export function registerItem(item: ItemContent): ItemContent {
  if (item.odds.length !== ODDS_ROWS) {
    throw new Error(`Item ${item.id}: odds needs ${ODDS_ROWS} rows, got ${item.odds.length}`);
  }
  items.register(item);
  for (const effect of item.effects ?? []) itemEffects.register({ ...effect, item: item.id });
  for (const spec of item.entities ?? []) entitySpecs.register({ ...spec, item: item.id });
  return item;
}

/** Removes an item with its effects and entities (tests that register throwaway items). */
export function unregisterItem(id: string): void {
  if (!items.has(id)) return;
  const item = items.get(id);
  for (const effect of item.effects ?? []) itemEffects.unregister(effect.id);
  for (const spec of item.entities ?? []) entitySpecs.unregister(spec.id);
  items.unregister(id);
}
