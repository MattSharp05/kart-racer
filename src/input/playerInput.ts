import type { InputFrame } from '../sim/types';
import { KeyboardInput } from './keyboard';
import { mergeInputs } from './merge';

/** The local player's controls: keyboard now; touch controls (MK-23) merge in here. */
export class PlayerInput {
  private readonly keyboard = new KeyboardInput();

  read(): InputFrame {
    return mergeInputs(this.keyboard.read());
  }
}
