import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * Online e2e helpers (MK-46): a host and clients as pages of one browser context, racing over
 * BroadcastChannel (`?net=local`), stepped in lock-step through `window.__game`.
 */

export interface RoomOptions {
  /** An online scenario (default `online-race-2p`). */
  scenario?: string;
  /** Room id; defaults to a fresh one so tests never share a room. */
  room?: string;
  /** `&laps=`: short races for tests. */
  laps?: number;
  /** `&netsim=<rtt>,<jitter>,<loss%>`. */
  netsim?: string;
  /** Load paused (default true: the test steps with `stepAll`). */
  paused?: boolean;
}

export interface Room {
  host: Page;
  clients: Page[];
  /** Host first, then the clients in join order. */
  pages: Page[];
  context: BrowserContext;
}

let rooms = 0;

/** The URL of an online scenario for `role`. */
export function roomUrl(role: 'host' | 'client', options: RoomOptions & { room: string }): string {
  const params = new URLSearchParams({
    scenario: options.scenario ?? 'online-race-2p',
    net: 'local',
    role,
    room: options.room,
  });
  if (options.laps !== undefined) params.set('laps', String(options.laps));
  if (options.netsim) params.set('netsim', options.netsim);
  if (options.paused ?? true) params.set('paused', '1');
  return `/?${params}`;
}

/**
 * Opens a room of `n` pages (host + n-1 clients) in one context of `browser` (BroadcastChannel
 * only reaches pages of the same context) and waits until every client knows its kart.
 */
export async function openRoom(
  browser: Browser | BrowserContext,
  n: number,
  options: RoomOptions = {},
): Promise<Room> {
  const context = 'newContext' in browser ? await browser.newContext() : browser;
  const room = options.room ?? `e2e-${Date.now()}-${(rooms += 1)}`;
  const open = async (role: 'host' | 'client') => {
    const page = await context.newPage();
    await page.goto(roomUrl(role, { ...options, room }));
    await page.waitForFunction(() => window.__game?.ready === true);
    return page;
  };
  const host = await open('host');
  const clients: Page[] = [];
  for (let i = 1; i < n; i += 1) clients.push(await open('client'));
  await expect.poll(() => netInfo(host).then((net) => net?.players)).toBe(n);
  for (const client of clients) {
    await expect.poll(() => netInfo(client).then((net) => net?.kartId)).toBeGreaterThan(0);
  }
  return { host, clients, pages: [host, ...clients], context };
}

export function netInfo(page: Page) {
  return page.evaluate(() => window.__game!.net());
}

export interface StepAllOptions {
  /** Ticks per page per round (default 3: one snapshot interval). */
  chunk?: number;
  /**
   * Redraw after the last round (default false). A redraw makes a paused page draw until its
   * camera settles, about 30 software-GL frames in CI: seconds that slow every later round.
   */
  render?: boolean;
}

/**
 * Steps every page `ticks` ticks in lock-step: `chunk` ticks at a time, host first, so each client
 * sees the host's newest snapshot before it predicts on.
 */
export async function stepAll(
  pages: Page[],
  ticks: number,
  { chunk = 3, render = false }: StepAllOptions = {},
): Promise<void> {
  for (let done = 0; done < ticks; done += chunk) {
    const n = Math.min(chunk, ticks - done);
    const draw = render && done + n >= ticks;
    for (const page of pages) {
      await page.evaluate(
        ([count, redraw]) => void window.__game!.step(count, { render: redraw }),
        [n, draw] as const,
      );
    }
  }
}

/** Hands each page's own kart to the centreline autopilot (so a race finishes by itself). */
export async function autopilotAll(pages: Page[]): Promise<void> {
  for (const page of pages) {
    await page.evaluate(() => {
      const game = window.__game!;
      game.setAutopilot(game.net()!.kartId, true);
    });
  }
}
