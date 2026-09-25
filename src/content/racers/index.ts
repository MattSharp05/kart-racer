import { Registry } from '../registry';
import boulder from './boulder/sim';
import maple from './maple/sim';
import pixie from './pixie/sim';
import swoop from './swoop/sim';

/** A racer's 1–5 stats (PRD → Karts). The MVP four each total 12. */
export interface KartStats {
  speed: number;
  acceleration: number;
  handling: number;
  /** Heavier karts win bumps (MK-8). */
  weight: number;
}

/**
 * A racer (ADR 0007): `src/content/racers/<id>/sim.ts` default-exports one of these (pure data);
 * its model and colours are in `./render.ts`.
 */
export interface RacerContent {
  id: string;
  name: string;
  /** Kart select order; also the order AI racers are drawn from. */
  order: number;
  /** One-line personality for the kart select screen (MK-25). */
  tagline: string;
  stats: KartStats;
}

/** Every racer. `sim/data/karts.ts` wraps it for the sim. */
export const racers = new Registry<RacerContent>('racer');

// One line per racer folder, alphabetical (a unit test checks none is missing).
for (const racer of [boulder, maple, pixie, swoop]) racers.register(racer);
