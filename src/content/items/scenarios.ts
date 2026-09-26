import type { Scenario } from '../../scenarios/registry';
import oilSlick from './oil-slick/scenarios';
import turboTrio from './turbo-trio/scenarios';

/**
 * Scenarios that items register from their own folder (MK-65, like tracks' MK-58):
 * `src/content/items/<id>/scenarios.ts` default-exports a `Scenario[]`; `src/scenarios/index.ts`
 * registers them all. A plain list, not a Vite glob, because Playwright specs import the scenario
 * registry under Node.
 */
// One entry per item folder that has a `scenarios.ts`, alphabetical (a unit test checks).
export const itemFolderScenarios: Record<string, Scenario[]> = {
  'oil-slick': oilSlick,
  'turbo-trio': turboTrio,
};
