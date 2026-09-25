import type { InputFrame } from '../sim/types';

const KEYS = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  drift: ['Space', 'ShiftLeft', 'ShiftRight'],
  item: ['KeyE', 'ControlLeft', 'ControlRight'],
  respawn: ['KeyR'],
} as const;

/** Keys the game handles, so the page doesn't scroll on arrows/space. */
const GAME_KEYS = new Set<string>(Object.values(KEYS).flat());

/** Whether a key event is typing into a text field (the nickname, MK-42), not driving. */
export function isTextEntry(target: EventTarget | null): boolean {
  const tag = (target as { tagName?: string } | null)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

/** Tracks held keys and turns them into an InputFrame (docs: PRD → Target platforms & controls). */
export class KeyboardInput {
  private readonly held = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (isTextEntry(e.target)) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      this.held.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.held.delete(e.code));
    target.addEventListener('blur', () => this.held.clear());
  }

  read(): InputFrame {
    const down = (codes: readonly string[]) => codes.some((code) => this.held.has(code));
    return {
      throttle: down(KEYS.throttle) ? 1 : 0,
      brake: down(KEYS.brake) ? 1 : 0,
      steer: (down(KEYS.right) ? 1 : 0) - (down(KEYS.left) ? 1 : 0),
      drift: down(KEYS.drift),
      item: down(KEYS.item),
      respawn: down(KEYS.respawn),
    };
  }
}
