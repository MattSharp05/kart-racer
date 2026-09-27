import { NEUTRAL_INPUT, type InputFrame } from '../sim/types';
import { KeyboardInput } from './keyboard';
import { mergeInputs } from './merge';
import { tilt } from './tilt';
import { TouchControls } from './touch';

/** The local player's controls: keyboard, on-screen touch controls and tilt (MK-54), merged. */
export class PlayerInput {
  private readonly keyboard = new KeyboardInput();
  readonly touch = new TouchControls();

  read(): InputFrame {
    // Tilt steers only while the touch controls do (not in menus, not on a keyboard).
    const tilted = this.touch.live ? { ...NEUTRAL_INPUT, steer: tilt.steer() } : NEUTRAL_INPUT;
    return mergeInputs(this.keyboard.read(), this.touch.read(), tilted);
  }
}
