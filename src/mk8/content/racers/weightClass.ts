// MK8 racers' sim data (MK-101): each racer's stats come from its weight class until the loadout
// ticket (MK-102) adds MK8's real racer + kart part table. Pure data (sim lint rules apply).
import type { KartStats, RacerContent } from '../../../content/racers';

export type WeightClass = 'light' | 'medium' | 'heavy';

/** Stats per weight class on our 1–5 scale; each totals 12 like the original racers. */
export const WEIGHT_CLASS_STATS: Readonly<Record<WeightClass, KartStats>> = {
  light: { speed: 2, acceleration: 4, handling: 4, weight: 2 },
  medium: { speed: 3, acceleration: 3, handling: 3, weight: 3 },
  heavy: { speed: 4, acceleration: 2, handling: 2, weight: 4 },
};

const TAGLINES: Readonly<Record<WeightClass, string>> = {
  light: 'Light: quick off the line, easy to knock about.',
  medium: 'Medium: an all-rounder.',
  heavy: 'Heavy: high top speed, wins every bump.',
};

/** An MK8 racer: a registered racer that only MK8 Mode offers (`pack: 'mk8'`). */
export interface Mk8RacerContent extends RacerContent {
  pack: 'mk8';
  weightClass: WeightClass;
}

/** Builds a racer's content from its weight class. */
export function mk8Racer(def: {
  id: string;
  name: string;
  order: number;
  weightClass: WeightClass;
}): Mk8RacerContent {
  return {
    ...def,
    pack: 'mk8',
    tagline: TAGLINES[def.weightClass],
    stats: { ...WEIGHT_CLASS_STATS[def.weightClass] },
  };
}
