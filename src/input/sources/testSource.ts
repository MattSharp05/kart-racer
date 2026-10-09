import { NEUTRAL_INPUT, type InputFrame } from '../../sim/types';
import type { InputSource } from './types';

/**
 * A fake controller (MK-144): scenarios and tests set its input and press its pause button. With
 * `autopilot` its kart drives itself, which is also the stand-in for a player slot with no
 * controller yet ("Auto").
 */
export class TestSource implements InputSource {
  readonly kind = 'test';
  readonly label: string;
  readonly autopilot: boolean;
  private frame: InputFrame = NEUTRAL_INPUT;
  private pausePressed = false;

  constructor(options: { autopilot?: boolean; label?: string } = {}) {
    this.autopilot = options.autopilot ?? false;
    this.label = options.label ?? (this.autopilot ? 'Auto' : 'Test');
  }

  set(frame: Partial<InputFrame>): void {
    this.frame = { ...NEUTRAL_INPUT, ...frame };
  }

  read(): InputFrame {
    return this.frame;
  }

  pressPause(): void {
    this.pausePressed = true;
  }

  takePause(): boolean {
    const pressed = this.pausePressed;
    this.pausePressed = false;
    return pressed;
  }
}
