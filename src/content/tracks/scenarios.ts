import type { Scenario } from '../../scenarios/registry';
import canopyRush from './canopy-rush/scenarios';
import duneCanyon from './dune-canyon/scenarios';
import frostpeakPass from './frostpeak-pass/scenarios';
import neonHarbour from './neon-harbour/scenarios';

/**
 * Scenarios that tracks register from their own folder (MK-58): `src/content/tracks/<id>/scenarios.ts`
 * default-exports a `Scenario[]`; `src/scenarios/index.ts` registers them all. A plain list, not a
 * Vite glob, because Playwright specs import the scenario registry under Node.
 */
// One entry per track folder that has a `scenarios.ts`, alphabetical (a unit test checks).
export const trackFolderScenarios: Record<string, Scenario[]> = {
  'canopy-rush': canopyRush,
  'dune-canyon': duneCanyon,
  'frostpeak-pass': frostpeakPass,
  'neon-harbour': neonHarbour,
};
