import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from '../sim/types';
import type { Game } from './game';

/** `window.__game`: lets e2e tests and QA drive the sim deterministically (docs/TDD.md → Testing). */
export interface GameTestApi {
  ready: boolean;
  /** Scenario the game booted into, if any. */
  scenario: string | null;
  getState(): SimState;
  pause(): void;
  resume(): void;
  /** Whether the game loop is paused (menus, portrait prompt, tests). */
  isPaused(): boolean;
  step(ticks: number): SimState;
  setInput(kartId: number, frame: Partial<InputFrame> | null): void;
  /** Let the centreline autopilot drive a kart (spline tracks). */
  setAutopilot(kartId: number, enabled: boolean): void;
  events(): SimEvent[];
  /** Renderer stats from the last frame (draw calls, triangles) for perf budgets. */
  renderInfo(): RenderInfo;
}

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
  scenario?: string,
  renderInfo: () => RenderInfo = () => ({ calls: 0, triangles: 0 }),
): GameTestApi {
  const api: GameTestApi = {
    ready: true,
    scenario: scenario ?? null,
    getState: () => structuredClone(game.state),
    pause: () => game.pause(),
    resume: () => game.resume(),
    isPaused: () => game.paused,
    step: (ticks) => {
      game.stepTicks(ticks);
      onStep();
      return structuredClone(game.state);
    },
    setInput: (kartId, frame) =>
      game.setInputOverride(kartId, frame ? { ...NEUTRAL_INPUT, ...frame } : null),
    setAutopilot: (kartId, enabled) => game.setAutopilot(kartId, enabled),
    events: () => game.drainEvents(),
    renderInfo,
  };
  window.__game = api;
  window.dispatchEvent(new Event(GAME_READY_EVENT));
  return api;
}
