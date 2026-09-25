import { racers, type KartStats, type RacerContent } from '../../content/racers';

export type { KartStats };

/**
 * A racer id: any id registered in `src/content/racers/` (ADR 0007). Plain string, validated by
 * `kartDef()` (throws) and `isKartId()`.
 */
export type KartId = string;

/** A selectable kart (PRD → Karts). Original characters. */
export type KartDef = RacerContent;

/** The kart registered as `id`; throws for an unknown id. */
export function kartDef(id: KartId): KartDef {
  return racers.get(id);
}

/** Every racer id, in kart select order. */
export const KART_IDS: KartId[] = racers.ids();

export function isKartId(value: string): value is KartId {
  return racers.has(value);
}
