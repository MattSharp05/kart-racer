// MK8 Mode's menu screens (MK-142): every file here exporting a `screen` (an `Mk8Screen`), in
// `order.ts`'s flow. Screens push `ctx.next(<their id>)` rather than importing the next screen,
// and scenarios start on a screen through its `starts`, so adding a screen touches no other screen
// and no switch (README.md).
import { MK8_SCREEN_ORDER } from './order';
import type { Mk8Flow, Mk8Screen } from './session';

// Whole modules, not `import: 'screen'`: files without a screen (`session.ts`, `order.ts`) are fine.
const modules = import.meta.glob<{ screen?: Mk8Screen }>(
  ['./*.ts', '!./*.test.ts', '!./index.ts'],
  { eager: true },
);
const found = Object.fromEntries(Object.entries(modules).map(([path, m]) => [path, m.screen]));

/** Every screen, in flow order. Throws when `order.ts` and the screen files disagree. */
export function flowScreens(
  modules: Record<string, Mk8Screen | undefined> = found,
  order: readonly string[] = MK8_SCREEN_ORDER,
): Mk8Screen[] {
  const byId = new Map<string, Mk8Screen>();
  for (const screen of Object.values(modules)) {
    if (!screen) continue;
    if (byId.has(screen.id)) throw new Error(`MK8: two screens with id ${screen.id}`);
    if (!order.includes(screen.id)) throw new Error(`MK8: screen ${screen.id} isn't in order.ts`);
    byId.set(screen.id, screen);
  }
  return order.map((id) => {
    const screen = byId.get(id);
    if (!screen) throw new Error(`MK8: order.ts lists ${id}, but no screen file exports it`);
    return screen;
  });
}

/** The flow over these screens: what comes after a screen, and where scenario starts open. */
export class Mk8ScreenFlow {
  constructor(private readonly screens: readonly Mk8Screen[] = flowScreens()) {}

  /** The first screen: MK8 Mode's title. */
  first(): Mk8Screen {
    const [first] = this.screens;
    if (!first) throw new Error('MK8: no screens');
    return first;
  }

  /** The screen after `from` for these choices (skipping screens that skip them). */
  next(from: string, flow: Mk8Flow): Mk8Screen {
    const at = this.screens.findIndex((s) => s.id === from);
    if (at < 0) throw new Error(`MK8: unknown screen ${from}`);
    const next = this.screens.slice(at + 1).find((s) => !s.skip?.(flow));
    if (!next) throw new Error(`MK8: nothing comes after ${from}`);
    return next;
  }

  /** Screen `id`. Throws for an id no screen has. */
  byId(id: string): Mk8Screen {
    const screen = this.screens.find((s) => s.id === id);
    if (!screen) throw new Error(`MK8: unknown screen ${id}`);
    return screen;
  }

  /**
   * Scenario start `start`: the choices made on the way and the screens over the title that lead
   * to its screen (that screen last); undefined when no screen declares it.
   */
  start(start: string): { flow: Mk8Flow; screens: Mk8Screen[] } | undefined {
    const at = this.screens.findIndex((s) => s.starts && Object.hasOwn(s.starts, start));
    const flow = this.screens[at]?.starts?.[start];
    if (at < 0 || !flow) return undefined;
    const screens = this.screens.slice(1, at + 1).filter((s) => !s.skip?.(flow));
    return { flow, screens };
  }

  /** Every scenario start a screen declares. */
  starts(): string[] {
    return this.screens.flatMap((s) => Object.keys(s.starts ?? {}));
  }
}
