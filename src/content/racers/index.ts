import { Registry } from '../registry';
import blaze from './blaze/sim';
import boulder from './boulder/sim';
import coral from './coral/sim';
import juniper from './juniper/sim';
import maple from './maple/sim';
import nova from './nova/sim';
import pixie from './pixie/sim';
import sprocket from './sprocket/sim';
import swoop from './swoop/sim';
import tundra from './tundra/sim';

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
  /**
   * Charges drift mini-turbos faster (× `tuning.strongDriftCharge`, MK-64). Default: no, the
   * normal rate.
   */
  strongDrift?: boolean;
}

/** Every racer. `sim/data/karts.ts` wraps it for the sim. */
export const racers = new Registry<RacerContent>('racer');

// One line per racer folder, alphabetical (a unit test checks none is missing).
racers.register(blaze);
racers.register(boulder);
racers.register(coral);
racers.register(juniper);
racers.register(maple);
racers.register(nova);
racers.register(pixie);
racers.register(sprocket);
racers.register(swoop);
racers.register(tundra);
