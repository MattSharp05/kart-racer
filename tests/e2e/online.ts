import { expect, type BrowserContext, type Page } from '@playwright/test';

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
  /** `&netdebug=1`: the net debug overlay (MK-45). */
  netdebug?: boolean;
}

export interface Room {
  host: Page;
  clients: Page[];
  /** Host first, then the clients in join order. */
  pages: Page[];
  context: BrowserContext;
}

let rooms = 0;
const JOIN_TIMEOUT_MS = 20_000;

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
  if (options.netdebug) params.set('netdebug', '1');
  return `/?${params}`;
}

/**
 * Opens a room of `n` pages (host + n-1 clients) in `context` (BroadcastChannel only reaches pages
 * of the same context) and waits until every client knows its kart. Pass the test's `context`
 * fixture, so the room closes with the test even when it fails (MK-80: a room left running starved
 * every later test in the worker).
 *
 * A host repeats a Start the simulated network lost only as it ticks, so while a paused room waits
 * for a client's kart, the host is stepped (MK-83; 2.5 % of joins at 5 % loss otherwise waited out
 * the timeout). Those first ticks run the countdown, as they would anyway.
 */
export async function openRoom(
  context: BrowserContext,
  n: number,
  options: RoomOptions = {},
): Promise<Room> {
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
  // A simulated network (lag, lost Starts) and a slow CI browser can take several seconds to join.
  const timeout = JOIN_TIMEOUT_MS;
  await expect.poll(() => netInfo(host).then((net) => net?.players), { timeout }).toBe(n);
  const paused = options.paused ?? true;
  for (const client of clients) {
    await expect
      .poll(
        async () => {
          const kartId = (await netInfo(client))?.kartId ?? -1;
          if (kartId <= 0 && paused) await stepAll([host], 3);
          return kartId;
        },
        { timeout, intervals: [50] },
      )
      .toBeGreaterThan(0);
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
  /**
   * Make each round take at least this long, ms (MK-45). A simulated network (`&netsim`) delays
   * packets in real time, so under lag the race must run at real speed too (`chunk` ticks per
   * `chunk × 16.7 ms`), or the lag in ticks balloons and every client input reaches the host late.
   */
  paceMs?: number;
}

/**
 * Steps every page `ticks` ticks in lock-step: `chunk` ticks at a time, host first, so each client
 * sees the host's newest snapshot before it predicts on.
 */
export async function stepAll(
  pages: Page[],
  ticks: number,
  { chunk = 3, render = false, paceMs = 0 }: StepAllOptions = {},
): Promise<void> {
  for (let done = 0; done < ticks; done += chunk) {
    const started = Date.now();
    const n = Math.min(chunk, ticks - done);
    const draw = render && done + n >= ticks;
    for (const page of pages) {
      await page.evaluate(
        ([count, redraw]) => void window.__game!.step(count, { render: redraw }),
        [n, draw] as const,
      );
    }
    const wait = paceMs - (Date.now() - started);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
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

export interface LobbyRoom extends Room {
  code: string;
  /** Each page's nickname, host first. */
  names: string[];
}

let lobbies = 0;

/** A room code no other test uses (4 characters of the room alphabet, starting with `prefix`). */
export function freshRoomCode(prefix = 'F'): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const n = (Date.now() + (lobbies += 1) * 7919) % alphabet.length ** 3;
  return `${prefix}${[2, 1, 0].map((p) => alphabet[Math.floor(n / alphabet.length ** p) % alphabet.length]).join('')}`;
}

/**
 * A room of `n` pages through the lobby (MK-47/MK-55): the host creates it, the others join and
 * ready up, and the host starts. Resolves once every page's race has started (running in real
 * time: pause the pages to step them). `laps` shortens the host's races (`&laps=`); `racers[i]` is
 * the racer page i (a client) picks before Ready.
 */
export async function openLobby(
  context: BrowserContext,
  n: number,
  {
    laps,
    names,
    racers,
  }: { laps?: number; names?: string[]; racers?: (string | undefined)[] } = {},
): Promise<LobbyRoom> {
  const code = freshRoomCode();
  const nicknames = names ?? ['Hosty', 'Ann', 'Bob', 'Cleo'].slice(0, n);
  const colours = ['red', 'blue', 'green', 'purple'];
  const open = async (role: 'host' | 'client', i: number) => {
    const page = await context.newPage();
    await page.addInitScript(
      ([name, colour]) => {
        const stored = localStorage.getItem('kart-racer:settings') ?? '{"version":1}';
        const settings = JSON.parse(stored) as Record<string, unknown>;
        localStorage.setItem(
          'kart-racer:settings',
          JSON.stringify({ ...settings, nickname: name, colour, seenHowToPlay: true }),
        );
      },
      [nicknames[i] ?? `P${i}`, colours[i % colours.length] ?? 'red'] as const,
    );
    const params = new URLSearchParams({
      scenario: 'online-lobby',
      net: 'local',
      role,
      room: code,
    });
    if (laps) params.set('laps', String(laps));
    params.set('paused', '1');
    await page.goto(`/?${params}`);
    await page.waitForFunction(() => window.__game?.ready === true);
    return page;
  };
  const host = await open('host', 0);
  await expect(host.locator('.room-code')).toHaveText(code);
  const clients: Page[] = [];
  for (let i = 1; i < n; i += 1) {
    const client = await open('client', i);
    // A join listens briefly for the host's answer; a CPU-starved CI host can miss it ("Room not
    // found"). Reload and join again, as a player would.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const joined = client.locator('.lobby-players li').nth(i);
      const refused = client.locator('.menu-online');
      await expect(joined.or(refused)).toBeVisible({ timeout: JOIN_TIMEOUT_MS });
      if (await joined.isVisible()) break;
      await client.reload();
      await client.waitForFunction(() => window.__game?.ready === true);
    }
    await expect(client.locator('.lobby-players li')).toHaveCount(i + 1, { timeout: 10_000 });
    const racer = racers?.[i];
    if (racer) {
      // The lobby's racer select (MK-51).
      await client.locator('.lobby-racer').click();
      await client.locator(`.lobby-racer-overlay .racer-card[data-racer="${racer}"]`).click();
      await client.locator('.lobby-racer-overlay button.primary').click();
    }
    await client.getByRole('button', { name: 'Ready' }).click();
    clients.push(client);
  }
  const start = host.getByRole('button', { name: 'Start' });
  await expect(start).toBeEnabled({ timeout: 10_000 });
  await start.click();
  const pages = [host, ...clients];
  await waitForRaces(pages);
  return { host, clients, pages, context, code, names: nicknames };
}

/** Waits until every page's online race has started (everyone connected, snapshots flowing). */
export async function waitForRaces(pages: Page[], timeout = 30_000): Promise<void> {
  for (const page of pages) {
    await expect
      .poll(() => page.evaluate(() => window.__game!.net()?.started), { timeout })
      .toBe(true);
  }
}
