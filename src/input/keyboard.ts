import { NEUTRAL_INPUT, type InputFrame } from '../sim/types';

const THROTTLE_KEYS = new Set(['KeyW', 'ArrowUp']);

/** Tracks held keys and turns them into an InputFrame. Full mapping arrives in MK-5. */
export class KeyboardInput {
  private readonly held = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => this.held.add(e.code));
    target.addEventListener('keyup', (e) => this.held.delete(e.code));
    target.addEventListener('blur', () => this.held.clear());
  }

  read(): InputFrame {
    const throttle = [...THROTTLE_KEYS].some((code) => this.held.has(code)) ? 1 : 0;
    return { ...NEUTRAL_INPUT, throttle };
  }
}
