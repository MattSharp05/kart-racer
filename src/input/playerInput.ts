import type { InputFrame } from '../sim/types';
import { KeyboardInput } from './keyboard';
import { mergeInputs } from './merge';
import { TouchControls } from './touch';

/** The local player's controls: keyboard and on-screen touch controls, merged. */
export class PlayerInput {
  private readonly keyboard = new KeyboardInput();
  readonly touch = new TouchControls();

  read(): InputFrame {
    return mergeInputs(this.keyboard.read(), this.touch.read());
  }
}
