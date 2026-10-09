import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from '../sim/types';
import type { Game } from './game';
import type { NetInfo } from './online';
import { whenLoadsSettle } from './pending';

/** `window.__game`: lets e2e tests and QA drive the sim deterministically (docs/TDD.md → Testing). */
export interface GameTestApi {
  ready: boolean;
  /**
   * Resolves when every pending pack load has finished (MK-97: the MK8 pack loads after the page
   * is ready). `loadScenario` awaits it.
   */
  whenReady(): Promise<void>;
  /** Scenario the game booted into, if any. */
  scenario: string | null;
  /** A copy of the sim state, plus which kart this device drives (MK-38). */
  getState(): TestState;
  pause(): void;
  resume(): void;
  /** Whether the game loop is paused (menus, portrait prompt, tests). */
  isPaused(): boolean;
  /**
   * Runs exactly `ticks` ticks now and returns the state. `render: false` skips redrawing (online
   * lock-step batches, where a software-GL frame per call would dominate the test time).
   */
  step(ticks: number, options?: { render?: boolean }): TestState;
  setInput(kartId: number, frame: Partial<InputFrame> | null): void;
  /**
   * Local multiplayer (MK-144): forces player slot `slot`'s input (0 = P1) on its kart, taking it
   * off the autopilot, until cleared with `null`. False if no kart is in that slot.
   */
  setSlotInput(slot: number, frame: Partial<InputFrame> | null): boolean;
  /** Presses player slot `slot`'s pause button, if its controller is a test one (MK-144). */
  pressPause(slot: number): boolean;
  /** Let the centreline autopilot drive a kart (spline tracks). */
  setAutopilot(kartId: number, enabled: boolean): void;
  events(): SimEvent[];
  /** Renderer stats from the last frame (draw calls, triangles) for perf budgets. */
  renderInfo(): RenderInfo;
  /** The online race's role, kart, RTT and newest snapshot tick (MK-46); null offline. */
  net(): NetInfo | null;
  /**
   * Loads scenario `name`'s state in place, keeping the page's camera view (MK-91: another track
   * drawn under the overview). False if there is no such scenario.
   */
  loadState?(name: string, seed?: number): boolean;
}

/**
 * `SimState` plus the session's local kart and, by player slot, the local players' karts (MK-144;
 * not part of the sim).
 */
export type TestState = SimState & { localKartId: number; slotKarts: number[] };

/** The session's player slots, as the test API sees them (MK-144). */
export interface SlotHooks {
  slotKarts(): number[];
  /** Presses `slot`'s pause button; false unless its source is a test one. */
  pressPause(slot: number): boolean;
}

/** Renderer stats and camera juice state (MK-27) for tests. */
export interface RenderInfo {
  calls: number;
  triangles: number;
  /** The track the scene draws (MK-78). */
  trackId?: string;
  camera?: {
    fov: number;
    shake: number;
    fovKick: number;
    /** How straight down the camera looks: 1 = straight down, 0 = level (MK-79). */
    lookDown?: number;
    /** Share of the track's centreline inside the camera's view, 0–1 (MK-79). */
    trackInView?: number;
    /** The camera's height, m (MK-91: the overview's framing of the drawn track). */
    height?: number;
    /** The camera's up (unit, world), MK-99: it follows karts onto walls and ceilings. */
    up?: { x: number; y: number; z: number };
    /** How far behind the followed kart the chase camera sits, m (MK-106: further gliding). */
    distance?: number;
  };
  /** Each kart's glider, by kart id: 0 folded away (hidden) … 1 open (MK-106). */
  gliders?: number[];
  /** The camera is under water: the blue tint and caustics show (MK-107). */
  underwater?: boolean;
  /** Each kart's propeller is showing (in the water), by kart id (MK-107). */
  propellers?: boolean[];
}

declare global {
  interface Window {
    __game?: GameTestApi;
  }
}

/**
 * What `step` does to the scene around the stepped ticks. `before` syncs it to the state about to
 * be stepped (MK-77): render-side juice (the FOV kick on a boost start, a hit's shake) compares
 * each frame with the last, so without it a step taken before the first animation frame had
 * nothing to compare with. `after` shows the result.
 */
export interface StepHooks {
  before(): void;
  after(): void;
}

/** Fired on `window` once `window.__game` is usable. */
export const GAME_READY_EVENT = 'game-ready';

export function installTestApi(
  game: Game,
  onStep: StepHooks,
  scenario: string | undefined,
  renderInfo: () => RenderInfo,
  localKartId: () => number,
  net: () => NetInfo | null = () => null,
  loadState: (name: string, seed?: number) => boolean = () => false,
  slots: SlotHooks = { slotKarts: () => [localKartId()], pressPause: () => false },
): GameTestApi {
  const snapshot = (): TestState => ({
    ...structuredClone(game.state),
    localKartId: localKartId(),
    slotKarts: slots.slotKarts(),
  });
  const api: GameTestApi = {
    ready: true,
    whenReady: whenLoadsSettle,
    scenario: scenario ?? null,
    getState: snapshot,
    pause: () => game.pause(),
    resume: () => game.resume(),
    isPaused: () => game.paused,
    step: (ticks, options) => {
      const render = options?.render !== false;
      if (render) onStep.before();
      game.stepTicks(ticks);
      if (render) onStep.after();
      return snapshot();
    },
    setInput: (kartId, frame) =>
      game.setInputOverride(kartId, frame ? { ...NEUTRAL_INPUT, ...frame } : null),
    setSlotInput: (slot, frame) => {
      const kartId = slots.slotKarts()[slot];
      if (kartId === undefined) return false;
      if (frame) game.setAutopilot(kartId, false);
      game.setInputOverride(kartId, frame ? { ...NEUTRAL_INPUT, ...frame } : null);
      return true;
    },
    pressPause: (slot) => slots.pressPause(slot),
    setAutopilot: (kartId, enabled) => game.setAutopilot(kartId, enabled),
    events: () => game.drainEvents(),
    renderInfo,
    net,
    loadState,
  };
  window.__game = api;
  window.dispatchEvent(new Event(GAME_READY_EVENT));
  return api;
}
