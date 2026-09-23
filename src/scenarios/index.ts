import { basicScenarios } from './basics';
import { ScenarioRegistry } from './registry';

/** Every scenario in the game. Add new groups here. */
export const scenarios = new ScenarioRegistry();
scenarios.register(...basicScenarios);
