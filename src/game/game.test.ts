import { describe, expect, it } from 'vitest';
import { kartOnTrack } from '../scenarios/tracks';
import { createSimState } from '../sim/state';
import { DT } from '../sim/tuning';
import { NEUTRAL_INPUT } from '../sim/types';
import { Game } from './game';

function newGame(): Game {
  return new Game(createSimState({ seed: 1 }), () => [NEUTRAL_INPUT]);
}

describe('Game', () => {
  it('stepTicks runs exactly n ticks even while paused, with the override applied', () => {
    const game = newGame();
    game.pause();
    game.setInputOverride(0, { ...NEUTRAL_INPUT, throttle: 1 });
    game.stepTicks(60);
    expect(game.state.tick).toBe(60);
    expect(game.state.karts[0]?.position.z).toBeLessThan(0);
  });

  it('does not advance on frames while paused', () => {
    const game = newGame();
    game.pause();
    game.frame(1);
    expect(game.state.tick).toBe(0);
  });

  it('advances from frame time when running', () => {
    const game = newGame();
    game.frame(DT * 3);
    expect(game.state.tick).toBe(3);
  });

  it('clearing an override returns control to the live input', () => {
    const game = newGame();
    game.setInputOverride(0, { ...NEUTRAL_INPUT, throttle: 1 });
    game.stepTicks(30);
    const withThrottle = game.state.karts[0]!.speed;
    game.setInputOverride(0, null);
    game.stepTicks(1);
    // Live input is neutral, so the kart now coasts (slows) instead of accelerating.
    expect(game.state.karts[0]!.speed).toBeLessThan(withThrottle);
  });

  it('keeps the previous state for interpolation', () => {
    const game = newGame();
    game.stepTicks(2);
    expect(game.previousState.tick).toBe(1);
  });

  it('the autopilot drives a kart around a spline track', () => {
    const game = new Game(kartOnTrack(1, 'test-oval', 0.005), () => [NEUTRAL_INPUT]);
    game.setAutopilot(0, true);
    game.stepTicks(120);
    expect(game.state.karts[0]!.speed).toBeGreaterThan(10);
  });
});
