import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from '../sim/types';
import type { Game } from './game';
import type { NetInfo } from './online';

/** `window.__game`: lets e2e tests and QA drive the sim deterministically (docs/TDD.md → Testing). */
export interface GameTestApi {
  ready: boolean;
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
  /** Let the centreline autopilot drive a kart (spline tracks). */
  setAutopilot(kartId: number, enabled: boolean): void;
  events(): SimEvent[];
  /** Renderer stats from the last frame (draw calls, triangles) for perf budgets. */
  renderInfo(): RenderInfo;
  /** The online race's role, kart, RTT and newest snapshot tick (MK-46); null offline. */
  net(): NetInfo | null;
}

/** `SimState` plus the session's local kart (not part of the sim). */
export type TestState = SimState & { localKartId: number };

/** Renderer stats and camera juice state (MK-27) for tests. */
export interface RenderInfo {
  calls: number;
  triangles: number;
  camera?: { fov: number; shake: number; fovKick: number };
}

declare global {
  interface Window {
    __game?: GameTestApi;
  }
}

/** Fired on `window` once `window.__game` is usable. */
export const GAME_READY_EVENT = 'game-ready';

export function installTestApi(
  game: Game,
  onStep: () => void,
  scenario: string | undefined,
  renderInfo: () => RenderInfo,
  localKartId: () => number,
  net: () => NetInfo | null = () => null,
): GameTestApi {
  const snapshot = (): TestState => ({
    ...structuredClone(game.state),
    localKartId: localKartId(),
  });
  const api: GameTestApi = {
    ready: true,
    scenario: scenario ?? null,
    getState: snapshot,
    pause: () => game.pause(),
    resume: () => game.resume(),
    isPaused: () => game.paused,
    step: (ticks, options) => {
      game.stepTicks(ticks);
      if (options?.render !== false) onStep();
      return snapshot();
    },
    setInput: (kartId, frame) =>
      game.setInputOverride(kartId, frame ? { ...NEUTRAL_INPUT, ...frame } : null),
    setAutopilot: (kartId, enabled) => game.setAutopilot(kartId, enabled),
    events: () => game.drainEvents(),
    renderInfo,
    net,
  };
  window.__game = api;
  window.dispatchEvent(new Event(GAME_READY_EVENT));
  return api;
}
