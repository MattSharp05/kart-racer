import { expect, type BrowserContext, type Page } from '@playwright/test';
import { netInfo, roomUrl, stepAll, type Room, type RoomOptions } from '../e2e/online';

/**
 * `openRoom` for the bad network (MK-73): the pages load paused, and the host is stepped while the
 * clients wait for their Start. A paused host never repeats a Start the simulated network lost
 * (it repeats them as it ticks), so under 8 % loss a plain paused `openRoom` of 4 can wait forever
 * (MK-83 moves this into `openRoom`). The host's first few ticks run the countdown, as they would
 * anyway.
 */
export async function openBadRoom(
  context: BrowserContext,
  n: number,
  room: string,
  options: RoomOptions,
): Promise<Room> {
  const open = async (role: 'host' | 'client') => {
    const page = await context.newPage();
    await page.goto(roomUrl(role, { ...options, room, paused: true }));
    await page.waitForFunction(() => window.__game?.ready === true);
    return page;
  };
  const host = await open('host');
  const clients: Page[] = [];
  for (let i = 1; i < n; i += 1) clients.push(await open('client'));
  const timeout = 30_000;
  await expect.poll(() => netInfo(host).then((net) => net?.players), { timeout }).toBe(n);
  await expect
    .poll(
      async () => {
        await stepAll([host], 3);
        const karts = await Promise.all(clients.map((c) => netInfo(c).then((i) => i?.kartId)));
        return karts.every((kartId) => (kartId ?? -1) > 0);
      },
      { timeout, intervals: [50] },
    )
    .toBe(true);
  return { host, clients, pages: [host, ...clients], context };
}
