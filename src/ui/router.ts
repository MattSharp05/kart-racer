import './router.css';

/**
 * Props for each screen, by name. Every screen module adds its own entry (declaration merging):
 *
 *   declare module '../router' { interface ScreenProps { title: TitleProps } }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled in by the screens
export interface ScreenProps {}

export type ScreenName = keyof ScreenProps & string;

/** What a mounted screen can hand back to the router. */
export interface ScreenHandle {
  /** Keyboard input while this screen is shown. */
  onKey?(e: KeyboardEvent): void;
  /** Re-read outside state (e.g. the M key toggled sound). */
  refresh?(): void;
  /** The screen is going away (another screen shows, or racing): free what it holds (MK-51). */
  dispose?(): void;
}

/** Builds a screen into its (empty) panel. */
export type ScreenFactory<P> = (panel: HTMLElement, props: P) => ScreenHandle;

/** Where screens are drawn: the DOM overlay in the game, a fake in unit tests. */
export interface ScreenHost {
  /** Clears the overlay and returns a fresh panel for screen `name`. */
  open(name: string): HTMLElement;
  close(): void;
}

const factories = new Map<string, ScreenFactory<never>>();

/** Adds a screen (MK-37). Each screen module registers itself, so adding one only adds files. */
export function registerScreen<N extends ScreenName>(
  name: N,
  factory: ScreenFactory<ScreenProps[N]>,
): void {
  factories.set(name, factory as ScreenFactory<never>);
}

interface Entry {
  name: ScreenName;
  props: unknown;
}

/**
 * Screen router (MK-37): one screen at a time over the 3D scene, with a back stack. Showing a
 * screen already in the stack goes back to it (so title → kart → cc → title doesn't grow).
 */
export class Router {
  /** Name of the screen currently shown ('none' when racing). */
  current: ScreenName | 'none' = 'none';
  private stack: Entry[] = [];
  private handle: ScreenHandle | undefined;
  private readonly host: ScreenHost;

  constructor(host?: ScreenHost) {
    this.host = host ?? domHost((e) => this.handleKey(e));
  }

  show<N extends ScreenName>(name: N, props: ScreenProps[N]): void {
    const index = this.stack.findIndex((entry) => entry.name === name);
    if (index >= 0) this.stack.length = index;
    this.stack.push({ name, props });
    this.mount(name, props);
  }

  /** Re-shows the previous screen with the props it had; false when there is none. */
  back(): boolean {
    if (this.stack.length < 2) return false;
    this.stack.pop();
    const previous = this.stack[this.stack.length - 1];
    if (previous) this.mount(previous.name, previous.props);
    return true;
  }

  /** Closes the overlay (racing) and clears the back stack. */
  hide(): void {
    this.current = 'none';
    this.stack = [];
    this.unmount();
    this.host.close();
  }

  /** Hands a key press to the current screen (the DOM host wires this to `keydown`). */
  handleKey(e: KeyboardEvent): void {
    this.handle?.onKey?.(e);
  }

  refresh(): void {
    this.handle?.refresh?.();
  }

  private mount(name: ScreenName, props: unknown): void {
    const factory = factories.get(name);
    if (!factory) throw new Error(`Unknown screen "${name}"`);
    this.unmount();
    this.current = name;
    const panel = this.host.open(name);
    this.handle = (factory as ScreenFactory<unknown>)(panel, props);
  }

  private unmount(): void {
    const handle = this.handle;
    this.handle = undefined;
    handle?.dispose?.();
  }
}

/** The `.menus` overlay: one panel `.menu-panel.menu-<name>` at a time, keys go to the screen. */
function domHost(onKey: (e: KeyboardEvent) => void): ScreenHost {
  const root = document.createElement('div');
  root.className = 'menus';
  root.hidden = true;
  document.body.append(root);
  window.addEventListener('keydown', onKey);
  return {
    open(name) {
      root.hidden = false;
      root.replaceChildren();
      root.dataset.screen = name;
      const panel = document.createElement('div');
      panel.className = `menu-panel menu-${name}`;
      root.append(panel);
      return panel;
    },
    close() {
      root.hidden = true;
      root.replaceChildren();
    },
  };
}
