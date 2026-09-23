import type { InputFrame } from '../sim/types';
import { GamepadInput, isActive } from './gamepad';
import { KeyboardInput } from './keyboard';
import { mergeInputs } from './merge';

export type InputDevice = 'keyboard' | 'gamepad';

/**
 * The local player's controls: keyboard + gamepad merged (touch joins in MK-23). Tracks the
 * last-used device for button prompts, and turns the pad's Start button into a pause toggle.
 */
export class PlayerInput {
  lastDevice: InputDevice = 'keyboard';
  private readonly keyboard = new KeyboardInput();
  private readonly gamepad = new GamepadInput();
  private startHeld = false;

  constructor(private readonly onPauseToggle: () => void = () => {}) {}

  read(): InputFrame {
    const keys = this.keyboard.read();
    const pad = this.gamepad.read();
    if (isActive(pad)) this.lastDevice = 'gamepad';
    else if (isActive(keys)) this.lastDevice = 'keyboard';

    this.pollPause();
    return mergeInputs(keys, pad);
  }

  /** Polls the pad's Start button even while the sim is paused (so it can unpause). */
  pollPause(): void {
    const { pause } = this.gamepad.actions();
    if (pause && !this.startHeld) this.onPauseToggle();
    this.startHeld = pause;
  }
}
