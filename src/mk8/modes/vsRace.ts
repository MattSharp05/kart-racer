// MK8 VS Race rules (MK-131): the settings screen's items and CPU choices, and what they do to a
// race. Pure (no DOM): `applyVsRules` adjusts a fresh race's state before it starts.
import { tuning } from '../../sim/tuning';
import type { ItemId, SimState } from '../../sim/types';

/** The items setting: MK8's normal items, none, or one family only. */
export type VsItems = 'on' | 'off' | 'mushrooms' | 'shells' | 'bananas';
/** The CPU setting. */
export type VsCpu = 'easy' | 'normal' | 'hard';

export interface VsRules {
  items: VsItems;
  cpu: VsCpu;
}

export const DEFAULT_VS_RULES: VsRules = { items: 'on', cpu: 'normal' };

/** The settings screen's choices, in its order. */
export const VS_ITEM_CHOICES: readonly { id: VsItems; label: string }[] = [
  { id: 'on', label: 'Normal items' },
  { id: 'off', label: 'No items' },
  { id: 'mushrooms', label: 'Mushrooms only' },
  { id: 'shells', label: 'Shells only' },
  { id: 'bananas', label: 'Bananas only' },
];

export const VS_CPU_CHOICES: readonly { id: VsCpu; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Hard' },
];

/** The items each "… only" setting's boxes hand out (MK8 item ids, singles and triples). */
export const ITEM_POOLS: Readonly<Record<'mushrooms' | 'shells' | 'bananas', readonly ItemId[]>> = {
  mushrooms: ['mushroom', 'triple-mushroom', 'golden-mushroom'],
  shells: ['green', 'red', 'triple-green', 'triple-red'],
  bananas: ['banana', 'triple-banana'],
};

/** Whether `value` is a VS rules object (a saved or carried setup). */
export function isVsRules(value: unknown): value is VsRules {
  if (typeof value !== 'object' || value === null) return false;
  const { items, cpu } = value as Record<string, unknown>;
  return VS_ITEM_CHOICES.some((c) => c.id === items) && VS_CPU_CHOICES.some((c) => c.id === cpu);
}

/**
 * A VS Race's rules on a fresh race: no items takes the item boxes out, "… only" limits what they
 * hand out (`SimState.itemPool`), and the CPU setting scales every AI's skill.
 */
export function applyVsRules(state: SimState, rules: VsRules): void {
  if (rules.items === 'off') {
    state.entities = state.entities.filter((e) => e.kind !== 'itemBox');
  } else if (rules.items !== 'on') {
    state.itemPool = [...ITEM_POOLS[rules.items]];
  }
  const scale = tuning.mk8.vsCpu[rules.cpu];
  for (const kart of state.karts) {
    if (kart.ai) kart.ai.skill *= scale;
  }
}

/** One line for the results' header: the rules when they aren't the defaults. */
export function vsRulesLabel(rules: VsRules): string {
  const parts: string[] = [];
  const items = VS_ITEM_CHOICES.find((c) => c.id === rules.items);
  if (rules.items !== 'on' && items) parts.push(items.label);
  if (rules.cpu !== 'normal') parts.push(`CPU ${rules.cpu}`);
  return parts.join(' · ');
}
