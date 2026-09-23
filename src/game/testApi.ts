import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from '../sim/types';
import type { Game } from './game';

/** `window.__game`: lets e2e tests and QA drive the sim deterministically (docs/TDD.md → Testing). */
export interface GameTestApi {
  ready: boolean;
  getState(): SimState;
  pause(): void;
  resume(): void;
  step(ticks: number): SimState;
  setInput(kartId: number, frame: Partial<InputFrame> | null): void;
  events(): SimEvent[];
}

declare global {
  interface Window {
    __game?: GameTestApi;
  }
}

export function installTestApi(game: Game, onStep: () => void): GameTestApi {
  const api: GameTestApi = {
    ready: true,
    getState: () => structuredClone(game.state),
    pause: () => game.pause(),
    resume: () => game.resume(),
    step: (ticks) => {
      game.stepTicks(ticks);
      onStep();
      return structuredClone(game.state);
    },
    setInput: (kartId, frame) =>
      game.setInputOverride(kartId, frame ? { ...NEUTRAL_INPUT, ...frame } : null),
    events: () => game.drainEvents(),
  };
  window.__game = api;
  return api;
}
