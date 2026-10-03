// MK8 screen stack (MK-104): MK8 Mode's menus push and pop screens inside one full-screen `.mk8`
// root, behind the blue diagonal-stripe wipe (~0.55 s; none with reduced motion). The stack is
// itself one screen of the game's router (`mk8Stack`), so the rest of the game sees one screen.
import { registerScreen } from '../../ui/router';
import type { SoundPlayer } from '../audio/player';
import { menuAction } from './kit/nav';
import './kit/kit.css';

/** An MK8 screen: its element, and what it does with keys before the stack does. */
export interface Mk8Screen {
  /** The screen's element (`menuScreen()` builds one). */
  el: HTMLElement;
  /** Keys go here first; true when handled. Unhandled Esc/Backspace go back. */
  onKey?(e: KeyboardEvent): boolean;
  /** Shown again after the screen above it was popped. */
  onShow?(): void;
  dispose?(): void;
}

export type Mk8ScreenFactory = (stack: Mk8Stack) => Mk8Screen;

/** The wipe's length; matches `.mk8-wipe.go` in kit.css. */
export const WIPE_MS = 550;
/** The screens swap when the stripes cover the stage. */
const SWAP_AT = 0.5;

export interface StackOptions {
  sounds: SoundPlayer;
  /** Back on the first screen: leave MK8 Mode. */
  onExit: () => void;
  /** Whether to skip the wipe; `prefers-reduced-motion` by default. */
  reducedMotion?: () => boolean;
}

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Mk8Stack {
  /** The `.mk8` element every MK8 screen is drawn in. */
  readonly root: HTMLElement;
  readonly sounds: SoundPlayer;
  private readonly screens: Mk8Screen[] = [];
  private readonly wipe: HTMLElement;
  private readonly onExit: () => void;
  private readonly reducedMotion: () => boolean;
  private timers: number[] = [];
  private busy = false;

  constructor(options: StackOptions) {
    this.sounds = options.sounds;
    this.onExit = options.onExit;
    this.reducedMotion = options.reducedMotion ?? prefersReducedMotion;
    this.root = document.createElement('div');
    this.root.className = 'mk8';
    this.wipe = document.createElement('div');
    this.wipe.className = 'mk8-wipe';
    this.wipe.setAttribute('aria-hidden', 'true');
    this.root.append(this.wipe);
    this.mark();
  }

  get depth(): number {
    return this.screens.length;
  }

  /** Whether a wipe is running (input waits for it). */
  get transitioning(): boolean {
    return this.busy;
  }

  /**
   * Shows a new screen over the current one, behind the wipe; the first one (or an `instant`
   * one: a scenario opening a screen deep in the menus) shows at once.
   */
  push(factory: Mk8ScreenFactory, instant = false): void {
    if (this.busy) return;
    const below = this.screens[this.screens.length - 1];
    const swap = () => {
      if (below) below.el.hidden = true;
      const screen = factory(this);
      this.screens.push(screen);
      this.root.insertBefore(screen.el, this.wipe);
    };
    if (below && !instant) this.transition(swap);
    else {
      swap();
      this.mark();
    }
  }

  /** Back (B, Esc): the back sound, then the screen below, or out of MK8 Mode from the first. */
  back(): void {
    if (this.busy) return;
    this.sounds.play('ui/back');
    if (this.screens.length <= 1) {
      this.onExit();
      return;
    }
    this.transition(() => {
      const top = this.screens.pop();
      top?.dispose?.();
      top?.el.remove();
      const below = this.screens[this.screens.length - 1];
      if (below) {
        below.el.hidden = false;
        below.onShow?.();
      }
    });
  }

  handleKey(e: KeyboardEvent): void {
    if (this.busy) {
      if (menuAction(e.key)) e.preventDefault();
      return;
    }
    const top = this.screens[this.screens.length - 1];
    if (top?.onKey?.(e)) return;
    if (menuAction(e.key)?.kind === 'back') {
      e.preventDefault();
      this.back();
    }
  }

  dispose(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    for (const screen of this.screens) screen.dispose?.();
    this.screens.length = 0;
    this.root.remove();
  }

  private transition(swap: () => void): void {
    if (this.reducedMotion()) {
      swap();
      this.mark();
      return;
    }
    this.busy = true;
    this.mark();
    // Restart the animation even if the last one's class is still on.
    this.wipe.classList.remove('go');
    void this.wipe.offsetWidth;
    this.wipe.classList.add('go');
    this.timers.push(
      window.setTimeout(() => {
        swap();
        this.mark();
      }, WIPE_MS * SWAP_AT),
      window.setTimeout(() => {
        this.wipe.classList.remove('go');
        this.busy = false;
        this.timers = [];
        this.mark();
      }, WIPE_MS),
    );
  }

  /** State for tests and CSS: `data-depth`, `data-transitioning`. */
  private mark(): void {
    this.root.dataset.depth = String(this.screens.length);
    this.root.dataset.transitioning = String(this.busy);
  }
}

export interface Mk8StackProps {
  first: Mk8ScreenFactory;
  /** Screens shown over `first` at once (Back walks down through them). */
  then?: readonly Mk8ScreenFactory[];
  sounds: SoundPlayer;
  onExit: () => void;
}

declare module '../../ui/router' {
  interface ScreenProps {
    mk8Stack: Mk8StackProps;
  }
}

registerScreen('mk8Stack', (panel, { first, then = [], sounds, onExit }) => {
  const stack = new Mk8Stack({ sounds, onExit });
  panel.classList.add('mk8-host');
  panel.append(stack.root);
  stack.push(first);
  for (const screen of then) stack.push(screen, true);
  return { onKey: (e) => stack.handleKey(e), dispose: () => stack.dispose() };
});
