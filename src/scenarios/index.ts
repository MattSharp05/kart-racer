import { basicScenarios } from './basics';
import { drivingScenarios } from './driving';
import { itemScenarios } from './items';
import { menuScenarios } from './menus';
import { onlineScenarios } from './online';
import { raceScenarios } from './race';
import { trackScenarios } from './tracks';
import { ScenarioRegistry, type Scenario } from './registry';

/** Tracks register their own scenarios from `src/content/tracks/<id>/scenarios.ts` (MK-58). */
const trackFolderScenarios = Object.values(
  import.meta.glob<Scenario[]>('../content/tracks/*/scenarios.ts', {
    eager: true,
    import: 'default',
  }),
).flat();

/** Every scenario in the game. Add new groups here. */
export const scenarios = new ScenarioRegistry();
scenarios.register(
  ...basicScenarios,
  ...drivingScenarios,
  ...trackScenarios,
  ...raceScenarios,
  ...itemScenarios,
  ...menuScenarios,
  ...onlineScenarios,
  ...trackFolderScenarios,
);
