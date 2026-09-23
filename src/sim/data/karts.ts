/** The four selectable karts (PRD → Karts). Original characters; stats are 1–5 and total 12 for every kart. */
export type KartId = 'maple' | 'pixie' | 'boulder' | 'swoop';

export interface KartStats {
  speed: number;
  acceleration: number;
  handling: number;
  /** Heavier karts win bumps (MK-8). */
  weight: number;
}

export interface KartDef {
  id: KartId;
  name: string;
  /** One-line personality for the kart select screen (MK-25). */
  tagline: string;
  stats: KartStats;
}

export const KARTS: Record<KartId, KartDef> = {
  maple: {
    id: 'maple',
    name: 'Maple',
    tagline: 'Dependable all-rounder. Good at everything, great at nothing.',
    stats: { speed: 3, acceleration: 3, handling: 3, weight: 3 },
  },
  pixie: {
    id: 'pixie',
    name: 'Pixie',
    tagline: 'Tiny and zippy. Off the line first, but gets pushed around.',
    stats: { speed: 2, acceleration: 5, handling: 4, weight: 1 },
  },
  boulder: {
    id: 'boulder',
    name: 'Boulder',
    tagline: 'Heavy bruiser with the highest top speed. Slow to get going.',
    stats: { speed: 5, acceleration: 1, handling: 2, weight: 4 },
  },
  swoop: {
    id: 'swoop',
    name: 'Swoop',
    tagline: 'Corners like it’s on rails and drifts tighter than anyone.',
    stats: { speed: 3, acceleration: 2, handling: 5, weight: 2 },
  },
};

export const KART_IDS = Object.keys(KARTS) as KartId[];

export function isKartId(value: string): value is KartId {
  return value in KARTS;
}
