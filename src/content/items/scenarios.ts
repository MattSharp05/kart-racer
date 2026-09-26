import type { Scenario } from '../../scenarios/registry';
import boomerang from './boomerang/scenarios';
import bubbleShield from './bubble-shield/scenarios';
import hornetSwarm from './hornet-swarm/scenarios';
import inkCloud from './ink-cloud/scenarios';
import magnet from './magnet/scenarios';
import oilSlick from './oil-slick/scenarios';
import phase from './phase/scenarios';
import turboTrio from './turbo-trio/scenarios';

/**
 * Scenarios that items register from their own folder (MK-65, like tracks' MK-58):
 * `src/content/items/<id>/scenarios.ts` default-exports a `Scenario[]`; `src/scenarios/index.ts`
 * registers them all. A plain list, not a Vite glob, because Playwright specs import the scenario
 * registry under Node.
 */
// One entry per item folder that has a `scenarios.ts`, alphabetical (a unit test checks).
export const itemFolderScenarios: Record<string, Scenario[]> = {
  boomerang,
  'bubble-shield': bubbleShield,
  'hornet-swarm': hornetSwarm,
  'ink-cloud': inkCloud,
  magnet,
  'oil-slick': oilSlick,
  phase,
  'turbo-trio': turboTrio,
};
