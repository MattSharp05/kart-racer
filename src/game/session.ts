import { items } from '../content/items';
import { PlayerInput } from '../input/playerInput';
import { scenarios } from '../scenarios';
import { attractMode } from '../scenarios/menus';
import { isOnlineScenario } from '../scenarios/online';
import { sunnyRace } from '../scenarios/race';
import type { MenuScreen, OnlineScenario, ScenarioView } from '../scenarios/registry';
import { isKartId, KART_IDS, type KartId } from '../sim/data/karts';
import type { EngineClass } from '../sim/tuning';
import { createRace } from '../sim/race/createRace';
import { step } from '../sim/step';
import { NEUTRAL_INPUT, type InputFrame, type SimState } from '../sim/types';
import { showErrorBanner } from '../ui/errorBanner';
import { Game } from './game';
import type { LaunchParams } from './launchParams';
import { OnlineRace, type OnlineLaunch } from './online';
import type { LobbyLaunch } from './roomFlow';

export const DEFAULT_SEED = 1;
/** Room of an online scenario opened without `&room=`. */
export const DEFAULT_ROOM = 'local';
const AI_RACERS = 7;

/** What the page boots into: a named scenario, or the title screen over an attract-mode race. */
export interface Launch {
  state: SimState;
  scenario?: string;
  view?: ScenarioView;
  follow?: number;
  screen?: MenuScreen;
  /** The kart this device drives (MK-38). */
  localKartId: number;
  /** The scenario's saved data (MK-44), layered over the real store for this page load. */
  storage?: Record<string, string>;
  /** An online scenario (MK-46): host or join its race over `?net=local`. */
  online?: OnlineLaunch;
  /** Straight into a room (MK-40): `/?room=CODE`, or the `online-lobby` scenario. */
  lobby?: LobbyLaunch;
  /** Rooms over BroadcastChannel, not Supabase (`&net=local`; online scenarios default to it). */
  localRooms: boolean;
}

/** `localKartId` when this device drives no kart (spectating). */
export const NO_LOCAL_KART = -1;

/** The kart this device drives in `state`: the first `local` one. */
export function localKartOf(state: SimState): number {
  return state.karts.find((kart) => kart.controller === 'local')?.id ?? NO_LOCAL_KART;
}

/** Resolves the starting state from the URL (`?scenario=`, `&seed=`, `&item=`, `&kart=`). */
export function resolveLaunch(params: LaunchParams): Launch {
  const launch = initialState(params);
  // Online, the host's race comes from its options (see `onlineLaunch`), not this state.
  if (launch.online) return launch;
  const player = launch.state.karts[launch.localKartId];
  if (params.item) {
    if (player && items.has(params.item)) player.item.held = params.item;
    else showErrorBanner(`Unknown item "${params.item}". Valid items:`, items.ids());
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
      if (setup.online) return onlineLaunch(scenario.name, setup.online, params);
      // `&net=local` alone is fine anywhere: it also picks the room backend (MK-40).
      if (params.role && !isOnlineScenario(scenario)) {
        showErrorBanner(
          `"${scenario.name}" isn't an online scenario. Online scenarios:`,
          onlineNames(),
        );
      }
      const localKartId = localKartOf(setup.state);
      return {
        state: setup.state,
        scenario: scenario.name,
        view: setup.view ?? 'chase',
        follow: setup.follow ?? localKartId,
        localKartId,
        ...(setup.screen ? { screen: setup.screen } : {}),
        ...(setup.storage ? { storage: setup.storage } : {}),
        ...(setup.lobby ? { lobby: lobbyLaunch(params.role ?? 'host', params.room) } : {}),
        localRooms: params.net === 'local' || isOnlineScenario(scenario),
      };
    }
    showErrorBanner(
      `Unknown scenario "${params.scenario}". Valid scenarios:`,
      scenarios.list().map((s) => s.name),
    );
  }
  const state = attractMode(params.seed ?? DEFAULT_SEED);
  return {
    state,
    screen: 'title',
    localKartId: localKartOf(state),
    // A room link, `/?room=CODE` (MK-40), opens straight into joining that room.
    ...(params.room ? { lobby: lobbyLaunch('client', params.room) } : {}),
    localRooms: params.net === 'local',
  };
}

/** A room from the URL; codes are upper case (links typed by hand may not be). */
function lobbyLaunch(role: LobbyLaunch['role'], room: string | undefined): LobbyLaunch {
  const code = room?.trim().toUpperCase();
  return { role, ...(code ? { code } : {}) };
}

function onlineNames(): string[] {
  return scenarios
    .list()
    .filter(isOnlineScenario)
    .map((s) => s.name);
}

/**
 * An online scenario (MK-46): the host's race with the URL's `&laps=`, `&role=` (default host),
 * `&room=` and `&netsim=`. A client shows the race as a placeholder, driving nothing, until the
 * host's Start says which kart is its own.
 */
function onlineLaunch(scenario: string, online: OnlineScenario, params: LaunchParams): Launch {
  const race = params.laps ? { ...online.race, laps: params.laps } : online.race;
  const netsim = params.netsim ?? online.netsim;
  const role = params.role ?? 'host';
  const state = createRace(race);
  const hostKart = localKartOf(state);
  return {
    state,
    scenario,
    view: 'chase',
    follow: hostKart,
    localKartId: role === 'host' ? hostKart : NO_LOCAL_KART,
    localRooms: true,
    online: { role, room: params.room ?? DEFAULT_ROOM, race, ...(netsim ? { netsim } : {}) },
  };
}

/** A local race against the AI. */
export interface RaceConfig {
  seed: number;
  engineClass: EngineClass;
  playerKart: KartId;
}

/**
 * A race session (MK-35): the Game plus the local player's input wiring. The local player drives
 * kart `localKartId` (MK-38), the first `local` kart of the loaded state. Online (MK-46), an
 * `OnlineRace` steps the game instead of the local sim (`goOnline`).
 */
export class RaceSession {
  readonly game: Game;
  readonly controls = new PlayerInput();
  /** The local player's input from the last tick (kart poses read it). */
  playerInput: InputFrame = NEUTRAL_INPUT;
  /** The kart this device drives: camera, HUD, sound, results and controls all follow it. */
  localKartId: number;
  /** The online race this session plays, if any (MK-46). */
  online: OnlineRace | null = null;

  constructor(initial: SimState) {
    this.localKartId = localKartOf(initial);
    this.game = new Game(initial, () => {
      this.playerInput = this.controls.read();
      return this.inputs();
    });
  }

  /** Live inputs indexed by kart id: the local controls on the local kart, nothing for the rest. */
  inputs(): InputFrame[] {
    const inputs: InputFrame[] = [];
    if (this.localKartId !== NO_LOCAL_KART) inputs[this.localKartId] = this.playerInput;
    return inputs;
  }

  /**
   * Plays `launch` online from the loaded placeholder state: the host or client steps the game from
   * now on. `onLocalKart` runs when a client learns its kart (follow it with the camera).
   */
  goOnline(launch: OnlineLaunch, onLocalKart: (kartId: number) => void = () => undefined): void {
    this.leaveOnline();
    const online = new OnlineRace(launch, (kartId) => {
      this.localKartId = kartId;
      onLocalKart(kartId);
    });
    this.online = online;
    this.localKartId = online.localKartId;
    this.game.stepper = online.stepper;
  }

  /** Swaps in a new state (menu background, race). The caller resumes the sim. */
  load(state: SimState): void {
    this.leaveOnline();
    this.localKartId = localKartOf(state);
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

  /** Leaves the current race (quit to title). Local races just freeze; online ones disconnect. */
  stop(): void {
    this.game.pause();
    this.leaveOnline();
  }

  /** Ends the online race, if any, and goes back to local stepping. */
  leaveOnline(): void {
    this.online?.close();
    this.online = null;
    this.game.stepper = step;
  }
}
