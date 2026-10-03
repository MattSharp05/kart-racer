// MK8 Mode's menu scenarios: the title's attract race behind MK8 Mode opened as `start` says.
import type { Mk8Start } from '../../../mk8';
import { attractMode } from '../../menus';
import type { ScenarioSetup } from '../../registry';

/** A scenario setup opening MK8 Mode at `start` (`src/mk8/index.ts`, `Mk8Start`). */
export function openMk8(start: Mk8Start): (seed: number) => ScenarioSetup {
  return (seed) => ({ state: attractMode(seed), screen: 'mk8', mk8Start: start });
}
