import { items } from '../content/items';
import { PlayerInput } from '../input/playerInput';
import { MAX_PLAYERS, PlayerSlots } from '../input/slots';
import { inputSourceProviders, TestSource, type InputSource } from '../input/sources';
import type { Mk8Start } from '../mk8';
import { scenarios } from '../scenarios';
import { attractMode } from '../scenarios/menus';
import { isOnlineScenario } from '../scenarios/online';
import { sunnyRace } from '../scenarios/race';
import type { FakePlayer, MenuScreen, OnlineScenario, ScenarioView } from '../scenarios/registry';
import { isKartId, KART_IDS, type KartId } from '../sim/data/karts';
import type { EngineClass } from '../sim/tuning';
import { createRace, type RacerSlot } from '../sim/race/createRace';
import { step } from '../sim/step';
import { NEUTRAL_INPUT, type InputFrame, type Loadout, type SimState } from '../sim/types';
import { showErrorBanner } from '../ui/errorBanner';
import { Game } from './game';
import type { LaunchParams } from './launchParams';
import { OnlineRace, type OnlineLaunch } from './online';
import type { LobbyLaunch } from './roomFlow';
import type { SplitLayout } from '../render/viewports';

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
  /** How MK8 Mode opens when `screen` is `mk8` (the scenario's `mk8Start`). */
  mk8Start?: Mk8Start;
  /** The kart this device drives (MK-38). */
  localKartId: number;
  /** People racing on this screen (MK-144): the scenario's `players`, else 1. */
  players?: number;
  /** Controllers the scenario binds to its player slots (MK-144: fake players), by slot. */
  slotSources?: InputSource[];
  /** The scenario's saved data (MK-44), layered over the real store for this page load. */
  storage?: Record<string, string>;
  /** An online scenario (MK-46): host or join its race over `?net=local`. */
  online?: OnlineLaunch;
  /** Straight into a room (MK-40): `/?room=CODE`, or the `online-lobby` scenario. */
  lobby?: LobbyLaunch;
  /** Rooms over BroadcastChannel, not Supabase (`&net=local`; online scenarios default to it). */
  localRooms: boolean;
  /** `&role=` of an online scenario that isn't a race (the `online-results` host or client view). */
  role?: LobbyLaunch['role'];
}

/** `localKartId` when this device drives no kart (spectating). */
export const NO_LOCAL_KART = -1;

/** The kart this device drives in `state`: the first `local` one. */
export function localKartOf(state: SimState): number {
  return state.karts.find((kart) => kart.controller === 'local')?.id ?? NO_LOCAL_KART;
}

/**
 * The karts the local players drive (MK-144), by player slot: the first `players` `local` karts in
 * kart order (P1 is the first, as `localKartOf`).
 */
export function slotKartsOf(state: SimState, players: number): number[] {
  return state.karts
    .filter((kart) => kart.controller === 'local')
    .slice(0, Math.max(1, Math.min(players, MAX_PLAYERS)))
    .map((kart) => kart.id);
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
        ...(setup.players ? { players: setup.players } : {}),
        ...(setup.fakePlayers ? { slotSources: setup.fakePlayers.map(fakeSource) } : {}),
        view: setup.view ?? 'chase',
        follow: setup.follow ?? localKartId,
        localKartId,
        ...(setup.screen ? { screen: setup.screen } : {}),
        ...(setup.mk8Start ? { mk8Start: setup.mk8Start } : {}),
        ...(setup.storage ? { storage: setup.storage } : {}),
        ...(setup.lobby
          ? {
              lobby: {
                ...lobbyLaunch(params.role ?? 'host', params.room, params.laps),
                ...(setup.lobby === 'mk8' ? { pack: 'mk8' as const } : {}),
              },
            }
          : {}),
        localRooms: params.net === 'local' || isOnlineScenario(scenario),
        ...(params.role ? { role: params.role } : {}),
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

/** A scenario's fake controller (MK-144) as a test input source. */
function fakeSource({ autopilot = false, pause = false }: FakePlayer): InputSource {
  const source = new TestSource({ autopilot, label: 'Test' });
  if (pause) source.pressPause();
  return source;
}

/** A room from the URL; codes are upper case (links typed by hand may not be). */
function lobbyLaunch(
  role: LobbyLaunch['role'],
  room: string | undefined,
  laps?: number,
): LobbyLaunch {
  const code = room?.trim().toUpperCase();
  return { role, ...(code ? { code } : {}), ...(laps ? { laps } : {}) };
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
    online: {
      role,
      room: params.room ?? DEFAULT_ROOM,
      race,
      ...(netsim ? { netsim } : {}),
      ...(online.vanishAtTick !== undefined ? { vanishAtTick: online.vanishAtTick } : {}),
    },
  };
}

/** A local race against the AI. */
export interface RaceConfig {
  seed: number;
  engineClass: EngineClass;
  playerKart: KartId;
  /** A registered track (MK-50). */
  trackId: string;
  /** A registered item set (MK-119: `mk8`); the original game's by default. */
  itemSet?: string;
  /** The player's MK8 kart parts (MK-102). */
  playerLoadout?: Loadout;
  /** Every kart and its grid slot (MK-130: an MK8 Grand Prix's field); random AI otherwise. */
  racers?: readonly RacerSlot[];
  /**
   * The other local players' racers (MK-144): P2, P3, P4 drive these on this screen, the AI fills
   * the rest of the 8-kart grid.
   */
  otherPlayers?: readonly KartId[];
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
  /**
   * Whether the controls drive the local kart. Off while a menu is open over an online race, which
   * keeps running (MK-55): the kart coasts instead of taking menu key presses as steering.
   */
  inputEnabled = true;
  /**
   * The local players' controllers (MK-144). Slot 0 (P1) is this device's keyboard and touch
   * controls; P2–P4 get a paired phone (MK-146) or the "Auto" stand-in when a race starts.
   */
  readonly slots = new PlayerSlots();
  /** People racing on this screen (MK-144): 1 except in local multiplayer races. */
  players = 1;
  /** Each local player's kart, by slot (P1 first); online, just this device's kart. */
  slotKarts: number[] = [];
  /** How two players' split-screen views share the screen (MK-145): the race setup's choice. */
  splitLayout: SplitLayout = 'stacked';
  /** Each slot's input from the last tick, by slot. */
  private slotInputs: InputFrame[] = [];

  constructor(initial: SimState, players = 1, slotSources: readonly InputSource[] = []) {
    this.localKartId = localKartOf(initial);
    const controls: InputSource = {
      kind: 'controls',
      label: 'Keyboard',
      read: () => this.controls.read(),
    };
    this.slots.bind(0, controls);
    slotSources.forEach((source, slot) => {
      if (slot > 0) this.slots.bind(slot, source);
    });
    this.game = new Game(initial, () => {
      this.slotInputs = this.slotKarts.map((_, slot) => {
        const input = this.slots.source(slot)?.read() ?? NEUTRAL_INPUT;
        return this.inputEnabled ? input : NEUTRAL_INPUT;
      });
      this.playerInput = this.slotInputs[0] ?? NEUTRAL_INPUT;
      return this.inputs();
    });
    this.setPlayers(initial, players);
  }

  /**
   * Live inputs indexed by kart id: each local player's controls on their kart (P1's on the local
   * kart), nothing for the rest.
   */
  inputs(): InputFrame[] {
    const inputs: InputFrame[] = [];
    if (this.localKartId !== NO_LOCAL_KART) inputs[this.localKartId] = this.playerInput;
    this.slotKarts.forEach((kartId, slot) => {
      if (slot > 0) inputs[kartId] = this.slotInputs[slot] ?? NEUTRAL_INPUT;
    });
    return inputs;
  }

  /** The kart player slot `slot` drives, or `NO_LOCAL_KART`. */
  slotKart(slot: number): number {
    return this.slotKarts[slot] ?? NO_LOCAL_KART;
  }

  /** The first player slot whose controller asked to pause since the last call, else -1. */
  takePause(): number {
    return this.slots.takePause(this.slotKarts.length);
  }

  /**
   * A controller turned up for player slot `slot` mid-race (MK-147: a phone paired into it): if
   * the slot only has the "Auto" stand-in, a provider's controller takes its kart over now.
   */
  claimSlot(slot: number): void {
    if (slot <= 0 || slot >= this.players || !this.slots.isStandIn(slot)) return;
    this.slots.fill(this.players, inputSourceProviders);
    if (!this.slots.isStandIn(slot)) this.game.setAutopilot(this.slotKart(slot), false);
  }

  /**
   * Maps the local players to `state`'s `local` karts and gives each slot a controller. A
   * stand-in's kart drives itself (the autopilot), so a race with no phones yet still runs.
   */
  private setPlayers(state: SimState, players: number): void {
    this.slotKarts = this.localKartId === NO_LOCAL_KART ? [] : slotKartsOf(state, players);
    this.players = Math.max(1, this.slotKarts.length);
    this.slotInputs = [];
    if (this.players > 1) this.slots.fill(this.players, inputSourceProviders);
    this.slotKarts.forEach((kartId, slot) => {
      if (slot > 0 && this.slots.source(slot)?.autopilot) this.game.setAutopilot(kartId, true);
    });
  }

  /**
   * Plays `launch` online from the loaded placeholder state: the host or client steps the game from
   * now on. `onLocalKart` runs when a client learns its kart (follow it with the camera).
   */
  goOnline(launch: OnlineLaunch, onLocalKart: (kartId: number) => void = () => undefined): void {
    this.leaveOnline();
    const online = new OnlineRace(launch, (kartId) => {
      this.localKartId = kartId;
      this.slotKarts = [kartId];
      onLocalKart(kartId);
    });
    this.online = online;
    this.localKartId = online.localKartId;
    // Online races have one player per device (couch players online are out of scope, MK-144).
    this.slotKarts = this.localKartId === NO_LOCAL_KART ? [] : [this.localKartId];
    this.players = 1;
    this.game.stepper = online.stepper;
  }

  /**
   * Swaps in a new state (menu background, race) with `players` people racing on this screen
   * (MK-144). The caller resumes the sim.
   */
  load(state: SimState, players = 1): void {
    this.leaveOnline();
    this.localKartId = localKartOf(state);
    this.game.reset(state);
    this.setPlayers(state, players);
  }

  /** Starts a fresh race: the player plus the AI field. */
  startRace(config: RaceConfig): void {
    const { seed, engineClass, trackId, itemSet, racers } = config;
    if (racers) {
      const opts = { trackId, racers, engineClass, itemsOn: true, seed };
      // MK-148: an MK8 VS Race's field seats every local player (its `local` karts).
      const players = racers.filter((r) => r.controller === 'local').length;
      this.load(createRace(itemSet !== undefined ? { ...opts, itemSet } : opts), players);
      return;
    }
    const others = config.otherPlayers?.slice(0, MAX_PLAYERS - 1) ?? [];
    this.load(
      sunnyRace(config.seed, {
        karts: 1 + AI_RACERS,
        ai: true,
        engineClass: config.engineClass,
        playerKart: config.playerKart,
        trackId: config.trackId,
        ...(config.itemSet !== undefined ? { itemSet: config.itemSet } : {}),
        ...(config.playerLoadout ? { playerLoadout: config.playerLoadout } : {}),
        ...(others.length ? { otherPlayers: others } : {}),
      }),
      1 + others.length,
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
