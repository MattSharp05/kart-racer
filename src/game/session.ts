import { PlayerInput } from '../input/playerInput';
import { scenarios } from '../scenarios';
import { attractMode } from '../scenarios/menus';
import { sunnyRace } from '../scenarios/race';
import type { MenuScreen, ScenarioView } from '../scenarios/registry';
import { isKartId, KART_IDS, type KartId } from '../sim/data/karts';
import type { EngineClass } from '../sim/tuning';
import { NEUTRAL_INPUT, type InputFrame, type ItemId, type SimState } from '../sim/types';
import { showErrorBanner } from '../ui/errorBanner';
import { Game } from './game';
import type { LaunchParams } from './launchParams';

export const DEFAULT_SEED = 1;
const AI_RACERS = 7;
const ITEM_IDS: string[] = ['mushroom', 'banana', 'green', 'red', 'star', 'lightning'];

/** What the page boots into: a named scenario, or the title screen over an attract-mode race. */
export interface Launch {
  state: SimState;
  scenario?: string;
  view?: ScenarioView;
  follow?: number;
  screen?: MenuScreen;
}

/** Resolves the starting state from the URL (`?scenario=`, `&seed=`, `&item=`, `&kart=`). */
export function resolveLaunch(params: LaunchParams): Launch {
  const launch = initialState(params);
  const player = launch.state.karts[0];
  if (params.item) {
    if (player && ITEM_IDS.includes(params.item)) player.item.held = params.item as ItemId;
    else showErrorBanner(`Unknown item "${params.item}". Valid items:`, ITEM_IDS);
  }
  if (params.kart) {
    if (player && isKartId(params.kart)) player.kartType = params.kart;
    else showErrorBanner(`Unknown kart "${params.kart}". Valid karts:`, KART_IDS);
  }
  return launch;
}

function initialState(params: LaunchParams): Launch {
  if (params.scenario) {
    const scenario = scenarios.get(params.scenario);
    if (scenario) {
      const setup = scenario.setup(params.seed ?? scenario.defaultSeed);
      return {
        state: setup.state,
        scenario: scenario.name,
        view: setup.view ?? 'chase',
        follow: setup.follow ?? 0,
        ...(setup.screen ? { screen: setup.screen } : {}),
      };
    }
    showErrorBanner(
      `Unknown scenario "${params.scenario}". Valid scenarios:`,
      scenarios.list().map((s) => s.name),
    );
  }
  return { state: attractMode(params.seed ?? DEFAULT_SEED), screen: 'title' };
}

/** A local race against the AI. */
export interface RaceConfig {
  seed: number;
  engineClass: EngineClass;
  playerKart: KartId;
}

/**
 * A race session (MK-35): the Game plus the local player's input wiring. The local player drives
 * kart 0. v2 adds online host/client sessions here.
 */
export class RaceSession {
  readonly game: Game;
  readonly controls = new PlayerInput();
  /** The local player's input from the last tick (kart poses read it). */
  playerInput: InputFrame = NEUTRAL_INPUT;

  constructor(initial: SimState) {
    this.game = new Game(initial, () => {
      this.playerInput = this.controls.read();
      return [this.playerInput];
    });
  }

  /** Swaps in a new state (menu background, race). The caller resumes the sim. */
  load(state: SimState): void {
    this.game.reset(state);
  }

  /** Starts a fresh race: the player plus the AI field. */
  startRace(config: RaceConfig): void {
    this.load(
      sunnyRace(config.seed, {
        karts: 1 + AI_RACERS,
        ai: true,
        engineClass: config.engineClass,
        playerKart: config.playerKart,
      }),
    );
  }

  /** Leaves the current race (quit to title). Local races just freeze; online ones will disconnect. */
  stop(): void {
    this.game.pause();
  }
}
