import type { SimState } from '../sim/types';

export interface ScenarioSetup {
  state: SimState;
  /** Camera to start with: behind the player (default) or a top-down view of the whole track. */
  view?: 'chase' | 'overview';
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
