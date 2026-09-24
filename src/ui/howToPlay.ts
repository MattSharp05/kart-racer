import { isTouchDevice } from '../input/touch';

const KEYBOARD: [string, string][] = [
  ['W / ↑', 'Accelerate'],
  ['S / ↓', 'Brake / reverse'],
  ['A D / ← →', 'Steer'],
  ['Space / Shift', 'Hop & drift: hold through a corner, let go for a boost'],
  ['E / Ctrl', 'Use item (hold W to throw it forward)'],
  ['R', 'Respawn if you get stuck'],
  ['Esc', 'Pause'],
];

const TOUCH: [string, string][] = [
  ['Left thumb', 'Drag left / right to steer'],
  ['(automatic)', 'Accelerates once you touch the screen'],
  ['Drift', 'Hold through a corner, let go for a boost'],
  ['Item', 'Use the item you picked up'],
  ['Brake', 'Brake / reverse'],
  ['❚❚', 'Pause'],
];

const TIPS = [
  'Drive through ❓ boxes to get an item.',
  'Longer drifts: blue → orange → purple sparks = a bigger boost.',
  'Press accelerate just as the "1" disappears for a rocket start.',
];

/**
 * "How to play" controls guide (MK-32): shown on the first visit and from the title and pause
 * menus. Lists keyboard or touch controls for this device. Sits above the menus and takes the
 * keyboard while open (Enter / Esc close it).
 */
export class HowToPlay {
  private readonly root = document.createElement('div');
  private onClose: (() => void) | undefined;

  constructor() {
    this.root.className = 'how-to-play';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'How to play');
    document.body.append(this.root);
    // Capture phase, so the menu underneath doesn't also react to the key.
    window.addEventListener(
      'keydown',
      (e) => {
        if (this.root.hidden) return;
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.close();
        }
      },
      true,
    );
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(onClose?: () => void): void {
    this.onClose = onClose;
    const touch = isTouchDevice();
    const rows = (touch ? TOUCH : KEYBOARD)
      .map(([key, what]) => `<tr><th><kbd>${key}</kbd></th><td>${what}</td></tr>`)
      .join('');
    this.root.innerHTML = `
      <div class="how-to-play-card">
        <h2>How to play</h2>
        <div class="how-to-play-body">
          <table class="how-to-play-controls ${touch ? 'touch' : 'keyboard'}">${rows}</table>
          <ul class="how-to-play-tips">${TIPS.map((t) => `<li>${t}</li>`).join('')}</ul>
        </div>
        <button type="button" class="primary">Got it</button>
      </div>`;
    const ok = this.root.querySelector('button');
    ok?.addEventListener('click', () => this.close());
    this.root.hidden = false;
    ok?.focus();
  }

  close(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.root.replaceChildren();
    const done = this.onClose;
    this.onClose = undefined;
    done?.();
  }
}
