import type { NetConditions } from '../net/netsim';
import type { CreateRaceOptions } from '../sim/race/createRace';
import type { SimState } from '../sim/types';

export type ScenarioView = 'chase' | 'overview' | 'lineup';
export type MenuScreen =
  'title' | 'kartSelect' | 'ccSelect' | 'paused' | 'howToPlay' | 'settings' | 'nickname';

export interface ScenarioSetup {
  state: SimState;
  /** Camera: behind the player (default), top-down over the track, or a slow orbit showing all karts. */
  view?: ScenarioView;
  /** Kart the camera follows (default 0, the player). */
  follow?: number;
  /** Open a menu screen on top of this state (MK-25). */
  screen?: MenuScreen;
  /**
   * Saved data the scenario starts with (key → value, e.g. track records, MK-44). Kept in memory
   * over the real store, so it never replaces the player's own data.
   */
  storage?: Record<string, string>;
  /** An online race (MK-46): `state` is `createRace(online.race)`, played over `?net=local`. */
  online?: OnlineScenario;
  /**
   * Open a room over this state (MK-40): `&role=host` (default) creates one, with `&room=` as its
   * code if given; `&role=client&room=CODE` joins it.
   */
  lobby?: boolean;
}

/** The online part of a scenario: the race the host runs, and a default simulated network. */
export interface OnlineScenario {
  /** The host's race: its own kart `local`, one `remote` kart per client, the rest AI. */
  race: CreateRaceOptions;
  /** Lag, jitter and loss each way unless the URL's `&netsim=` says otherwise. */
  netsim?: NetConditions;
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
