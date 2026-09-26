import { basicScenarios } from './basics';
import { drivingScenarios } from './driving';
import { itemScenarios } from './items';
import { menuScenarios } from './menus';
import { onlineScenarios } from './online';
import { raceScenarios } from './race';
import { trackScenarios } from './tracks';
import { ScenarioRegistry } from './registry';
import { trackFolderScenarios } from '../content/tracks/scenarios';

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
  ...Object.values(trackFolderScenarios).flat(),
);
