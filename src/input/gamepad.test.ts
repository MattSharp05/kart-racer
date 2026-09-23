import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT } from '../sim/types';
import {
  BUTTON,
  gamepadActions,
  gamepadToInput,
  stickToSteer,
  type GamepadSnapshot,
} from './gamepad';
import { mergeInputs } from './merge';

function pad(
  options: { stickX?: number; pressed?: number[]; values?: Record<number, number> } = {},
): GamepadSnapshot {
  const buttons = Array.from({ length: 17 }, (_, i) => ({
    pressed: options.pressed?.includes(i) ?? false,
    value: options.values?.[i] ?? (options.pressed?.includes(i) ? 1 : 0),
  }));
  return { axes: [options.stickX ?? 0, 0, 0, 0], buttons };
}

describe('gamepad mapping', () => {
  it('a resting pad produces neutral input', () => {
    expect(gamepadToInput(pad())).toEqual(NEUTRAL_INPUT);
  });

  it('ignores stick drift inside the deadzone', () => {
    expect(gamepadToInput(pad({ stickX: 0.1 })).steer).toBe(0);
    expect(gamepadToInput(pad({ stickX: -0.14 })).steer).toBe(0);
  });

  it('maps the stick with a curve: full at the edge, gentle near the centre', () => {
    expect(stickToSteer(1)).toBe(1);
    expect(stickToSteer(-1)).toBe(-1);
    const half = stickToSteer(0.575); // halfway through the live range
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(0.5);
  });

  it('reads analog triggers as throttle and brake', () => {
    const input = gamepadToInput(pad({ values: { [BUTTON.rt]: 0.6, [BUTTON.lt]: 0.3 } }));
    expect(input.throttle).toBeCloseTo(0.6);
    expect(input.brake).toBeCloseTo(0.3);
  });

  it('A/B work as digital throttle/brake', () => {
    expect(gamepadToInput(pad({ pressed: [BUTTON.a] })).throttle).toBe(1);
    expect(gamepadToInput(pad({ pressed: [BUTTON.b] })).brake).toBe(1);
  });

  it('maps bumpers to drift, X/Y to item, d-pad to steer', () => {
    expect(gamepadToInput(pad({ pressed: [BUTTON.rb] })).drift).toBe(true);
    expect(gamepadToInput(pad({ pressed: [BUTTON.lb] })).drift).toBe(true);
    expect(gamepadToInput(pad({ pressed: [BUTTON.y] })).item).toBe(true);
    expect(gamepadToInput(pad({ pressed: [BUTTON.dpadLeft] })).steer).toBe(-1);
  });

  it('reports Start as pause and Back as respawn', () => {
    expect(gamepadActions(pad({ pressed: [BUTTON.start] }))).toEqual({
      pause: true,
      respawn: false,
    });
    expect(gamepadActions(pad({ pressed: [BUTTON.back] }))).toEqual({
      pause: false,
      respawn: true,
    });
  });

  it('copes with a pad reporting fewer buttons/axes than the standard layout', () => {
    expect(gamepadToInput({ axes: [], buttons: [] })).toEqual(NEUTRAL_INPUT);
  });
});

describe('mergeInputs', () => {
  it('keeps the stronger value per axis and ORs buttons', () => {
    const keyboard = { ...NEUTRAL_INPUT, throttle: 1, steer: -1 };
    const gamepad = { ...NEUTRAL_INPUT, throttle: 0.4, steer: 0.5, drift: true };
    expect(mergeInputs(keyboard, gamepad)).toEqual({
      throttle: 1,
      brake: 0,
      steer: -1,
      drift: true,
      item: false,
    });
  });

  it('merging nothing but neutral stays neutral', () => {
    expect(mergeInputs(NEUTRAL_INPUT, NEUTRAL_INPUT)).toEqual(NEUTRAL_INPUT);
  });
});
