import type { Mk8Start } from '../mk8';
import type { NetConditions } from '../net/netsim';
import type { CreateRaceOptions } from '../sim/race/createRace';
import type { SimState } from '../sim/types';

export type ScenarioView = 'chase' | 'overview' | 'lineup';
export type MenuScreen =
  | 'title'
  | 'racerSelect'
  | 'ccSelect'
  | 'trackSelect'
  | 'paused'
  | 'howToPlay'
  | 'settings'
  | 'buttonEditor'
  | 'nickname'
  | 'onlineResults'
  | 'leaderboard'
  // MK8 Mode (MK-97): the title with its button picked, and MK8 Mode opened as `mk8Start` says.
  | 'mk8Entry'
  | 'mk8';

export interface ScenarioSetup {
  state: SimState;
  /** Camera: behind the player (default), top-down over the track, or a slow orbit showing all karts. */
  view?: ScenarioView;
  /** Kart the camera follows (default 0, the player). */
  follow?: number;
  /** Open a menu screen on top of this state (MK-25). */
  screen?: MenuScreen;
  /**
   * How MK8 Mode opens when `screen` is `mk8` (default `load`, as the title button does): a screen
   * of its menus, the loading or "not installed" screen, a 3D stage demo… (`src/mk8/index.ts`).
   */
  mk8Start?: Mk8Start;
  /**
   * Saved data the scenario starts with (key → value, e.g. track records, MK-44). Kept in memory
   * over the real store, so it never replaces the player's own data.
   */
  storage?: Record<string, string>;
  /** An online race (MK-46): `state` is `createRace(online.race)`, played over `?net=local`. */
  online?: OnlineScenario;
  /**
   * Open a room over this state (MK-40): `&role=host` (default) creates one, with `&room=` as its
   * code if given; `&role=client&room=CODE` joins it. `mk8` (MK-132): an MK8 room.
   */
  lobby?: boolean | 'mk8';
}

/** The online part of a scenario: the race the host runs, and a default simulated network. */
export interface OnlineScenario {
  /** The host's race: its own kart `local`, one `remote` kart per client, the rest AI. */
  race: CreateRaceOptions;
  /** Lag, jitter and loss each way unless the URL's `&netsim=` says otherwise. */
  netsim?: NetConditions;
  /** The client vanishes (links closed, no Bye) at this tick of its race (MK-70, `online-drop`). */
  vanishAtTick?: number;
}

/** A named, deterministic starting state reachable via `/?scenario=<name>` (CLAUDE.md → Testing). */
export interface Scenario {
  name: string;
  /** Heading on the /dev page, e.g. "Basics", "Driving". */
  group: string;
  description: string;
  defaultSeed: number;
  setup(seed: number): ScenarioSetup;
  /**
   * An MK8 driving scenario (MK-99, MK-105): the course it drives on (an MK8 course's pack id, or
   * the test ramp's track id). `main.ts` registers that course before the scenario is set up.
   */
  mk8Course?: string;
  /** Phone controllers (MK-146): open the Add Controllers panel over the scenario at boot. */
  addControllers?: boolean;
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
