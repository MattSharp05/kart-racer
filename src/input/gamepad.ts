import { NEUTRAL_INPUT, type InputFrame } from '../sim/types';

/** Stick values smaller than this are treated as centred. */
export const STICK_DEADZONE = 0.15;
/** >1 gives finer control near the centre of the stick. */
const STEER_CURVE = 1.4;
/** Triggers below this count as released. */
const TRIGGER_DEADZONE = 0.05;

/** Standard Gamepad API button indices (https://w3c.github.io/gamepad/#remapping). */
export const BUTTON = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  back: 8,
  start: 9,
  dpadLeft: 14,
  dpadRight: 15,
} as const;

/** The parts of a `Gamepad` we read — plain data, so mapping is unit-testable without a browser. */
export interface GamepadSnapshot {
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
}

/** Extra actions a pad can trigger that aren't part of the sim input. */
export interface GamepadActions {
  pause: boolean;
  respawn: boolean;
}

function button(pad: GamepadSnapshot, index: number): { pressed: boolean; value: number } {
  return pad.buttons[index] ?? { pressed: false, value: 0 };
}

function trigger(pad: GamepadSnapshot, index: number): number {
  const b = button(pad, index);
  const value = Math.max(b.value, b.pressed ? 1 : 0);
  return value < TRIGGER_DEADZONE ? 0 : value;
}

/** Left stick X → steer, with deadzone and a response curve. */
export function stickToSteer(x: number): number {
  const magnitude = Math.abs(x);
  if (magnitude <= STICK_DEADZONE) return 0;
  const scaled = Math.min(1, (magnitude - STICK_DEADZONE) / (1 - STICK_DEADZONE));
  return Math.sign(x) * scaled ** STEER_CURVE;
}

/**
 * Maps a standard-layout pad: RT/A = throttle (analog), LT/B = brake, left stick or d-pad = steer,
 * LB/RB = drift, X/Y = item. Start = pause, Back/View = respawn (returned separately).
 */
export function gamepadToInput(pad: GamepadSnapshot): InputFrame {
  const dpad =
    (button(pad, BUTTON.dpadRight).pressed ? 1 : 0) -
    (button(pad, BUTTON.dpadLeft).pressed ? 1 : 0);
  const stick = stickToSteer(pad.axes[0] ?? 0);
  return {
    throttle: Math.max(trigger(pad, BUTTON.rt), button(pad, BUTTON.a).pressed ? 1 : 0),
    brake: Math.max(trigger(pad, BUTTON.lt), button(pad, BUTTON.b).pressed ? 1 : 0),
    steer: Math.abs(stick) >= Math.abs(dpad) ? stick : dpad,
    drift: button(pad, BUTTON.lb).pressed || button(pad, BUTTON.rb).pressed,
    item: button(pad, BUTTON.x).pressed || button(pad, BUTTON.y).pressed,
  };
}

export function gamepadActions(pad: GamepadSnapshot): GamepadActions {
  return { pause: button(pad, BUTTON.start).pressed, respawn: button(pad, BUTTON.back).pressed };
}

/** Whether a frame has any control input at all (used to track the last-used device). */
export function isActive(frame: InputFrame): boolean {
  return frame.throttle > 0 || frame.brake > 0 || frame.steer !== 0 || frame.drift || frame.item;
}

/** Polls the first connected gamepad each tick. Copes with pads connecting/disconnecting mid-race. */
export class GamepadInput {
  read(): InputFrame {
    const pad = this.pad();
    return pad ? gamepadToInput(pad) : NEUTRAL_INPUT;
  }

  actions(): GamepadActions {
    const pad = this.pad();
    return pad ? gamepadActions(pad) : { pause: false, respawn: false };
  }

  private pad(): GamepadSnapshot | undefined {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return undefined;
    return navigator.getGamepads().find((pad): pad is Gamepad => pad !== null && pad.connected);
  }
}
