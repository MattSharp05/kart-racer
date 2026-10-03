// MK8 content registers into the shared registries (ADR 0007) at runtime, once MK8 Mode's chunk
// has loaded (MK-97), so the original game's bundle never carries it. Courses, racers and items
// from `src/mk8/content/**` add one line to these lists.
import {
  items,
  itemSets,
  registerItem,
  registerItemSet,
  type ItemContent,
  type ItemSetContent,
} from '../content/items';
import { racers, type RacerContent } from '../content/racers';
import { racerViews, type RacerView } from '../content/racers/render';
import { tracks, type TrackContent } from '../content/tracks';
import type { Registry } from '../content/registry';
import { mk8ItemSet, mk8ItemSims } from './content/items';
import { MK8_RACERS } from './content/racers';
import { MK8_RACER_STAND_INS } from './content/racers/standIn';

export interface Mk8Content {
  tracks: readonly TrackContent[];
  racers: readonly RacerContent[];
  items: readonly ItemContent[];
  /** How the racers' karts look in a race (MK-138: stand-ins until races draw the pack's models). */
  racerViews?: readonly RacerView[];
  /** Item rules (MK-103): the `mk8` set (MK8's odds, two slots). */
  itemSets?: readonly ItemSetContent[];
}

/** Everything MK8 Mode adds: racers (MK-101) and items (MK-103); courses come with their tickets. */
export const MK8_CONTENT: Mk8Content = {
  tracks: [],
  racers: MK8_RACERS,
  racerViews: MK8_RACER_STAND_INS,
  items: mk8ItemSims(),
  itemSets: [mk8ItemSet],
};

/** Registers `content`; what is already registered (MK8 Mode opened twice) is left alone. */
export function registerMk8Content(content: Mk8Content = MK8_CONTENT): void {
  addAll(tracks, content.tracks);
  addAll(racers, content.racers);
  addAll(racerViews, content.racerViews ?? []);
  // Items with their effects and entities (MK-52).
  for (const item of content.items) if (!items.has(item.id)) registerItem(item);
  for (const set of content.itemSets ?? []) if (!itemSets.has(set.id)) registerItemSet(set);
}

function addAll<T extends { id: string }>(registry: Registry<T>, defs: readonly T[]): void {
  for (const def of defs) if (!registry.has(def.id)) registry.register(def);
}
