// MK8 content registers into the shared registries (ADR 0007) at runtime, once MK8 Mode's chunk
// has loaded (MK-97), so the original game's bundle never carries it. Courses, racers and items
// from `src/mk8/content/**` add one line to these lists.
import { items, type ItemContent } from '../content/items';
import { racers, type RacerContent } from '../content/racers';
import { tracks, type TrackContent } from '../content/tracks';
import type { Registry } from '../content/registry';

export interface Mk8Content {
  tracks: readonly TrackContent[];
  racers: readonly RacerContent[];
  items: readonly ItemContent[];
}

/** Everything MK8 Mode adds. Empty until the course, racer and item tickets land. */
export const MK8_CONTENT: Mk8Content = { tracks: [], racers: [], items: [] };

/** Registers `content`; what is already registered (MK8 Mode opened twice) is left alone. */
export function registerMk8Content(content: Mk8Content = MK8_CONTENT): void {
  addAll(tracks, content.tracks);
  addAll(racers, content.racers);
  addAll(items, content.items);
}

function addAll<T extends { id: string }>(registry: Registry<T>, defs: readonly T[]): void {
  for (const def of defs) if (!registry.has(def.id)) registry.register(def);
}
