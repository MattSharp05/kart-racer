import type { SimState } from '../sim/types';

export type ScenarioView = 'chase' | 'overview' | 'lineup';
export type MenuScreen = 'title' | 'kartSelect' | 'ccSelect' | 'paused' | 'howToPlay';

export interface ScenarioSetup {
  state: SimState;
  /** Camera: behind the player (default), top-down over the track, or a slow orbit showing all karts. */
  view?: ScenarioView;
  /** Kart the camera follows (default 0, the player). */
  follow?: number;
  /** Open a menu screen on top of this state (MK-25). */
  screen?: MenuScreen;
}

/** A named, deterministic starting state reachable via `/?scenario=<name>` (CLAUDE.md → Testing). */
export interface Scenario {
  name: string;
  /** Heading on the /dev page, e.g. "Basics", "Driving". */
  group: string;
  description: string;
  defaultSeed: number;
  setup(seed: number): ScenarioSetup;
}

export class ScenarioRegistry {
  private readonly scenarios = new Map<string, Scenario>();

  register(...scenarios: Scenario[]): void {
    for (const scenario of scenarios) {
      if (this.scenarios.has(scenario.name)) {
        throw new Error(`Duplicate scenario name: ${scenario.name}`);
      }
      this.scenarios.set(scenario.name, scenario);
    }
  }

  get(name: string): Scenario | undefined {
    return this.scenarios.get(name);
  }

  list(): Scenario[] {
    return [...this.scenarios.values()];
  }
}
