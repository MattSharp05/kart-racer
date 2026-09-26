import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { TestState } from '../../src/game/testApi';
import { autopilotAll, openLobby, openRoom, stepAll, waitForRaces } from './online';

/**
 * Drops and rejoin (MK-70): a player who leaves mid-race is replaced by the AI and can rejoin for
 * the next race; the host leaving closes the room. Rooms and races run over BroadcastChannel
 * (`?net=local`), so desktop projects only (see playwright.config.ts).
 */

/** Ticks per `stepAll` batch while waiting for the finish. */
const BATCH = 300;
/** A 1-lap race is ~62 s; give it plenty. */
const MAX_TICKS = 60 * 120;

function state(page: Page): Promise<TestState> {
  return page.evaluate(() => window.__game!.getState());
}

async function pauseAll(pages: Page[]): Promise<void> {
  for (const page of pages) await page.evaluate(() => window.__game!.pause());
}

/** Steps `pages` in lock-step until the host's (first page's) race has ended, then shows results. */
async function raceToTheEnd(pages: Page[]): Promise<void> {
  const host = pages[0]!;
  let hostState = await state(host);
  for (let ticks = 0; hostState.phase !== 'finished' && ticks < MAX_TICKS; ticks += BATCH) {
    await stepAll(pages, BATCH);
    hostState = await state(host);
  }
  expect(hostState.phase).toBe('finished');
  await stepAll(pages, 30);
  await Promise.all(
    pages.map((page) =>
      expect(page.locator('.menu-onlineResults')).toBeVisible({ timeout: 15_000 }),
    ),
  );
  await stepAll(pages, 3, { render: true });
}

/** The final results as shown, one string per row, without this page's "(you)". */
async function finalRows(page: Page): Promise<string[]> {
  const list = page.locator('ol.online-results[data-final="true"]');
  await expect(list).toBeVisible({ timeout: 20_000 });
  const rows = await list.locator('li').allInnerTexts();
  return rows.map((text) => text.replace(' (you)', '').replace(/\s+/g, ' ').trim());
}

/** Opens room link `/?room=CODE&net=local` in a new page as `name` (a player coming back). */
async function openRoomLink(context: BrowserContext, code: string, name: string): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript((nickname) => {
    const stored = localStorage.getItem('kart-racer:settings') ?? '{"version":1}';
    const settings = JSON.parse(stored) as Record<string, unknown>;
    localStorage.setItem(
      'kart-racer:settings',
      JSON.stringify({ ...settings, nickname, colour: 'green', seenHowToPlay: true }),
    );
  }, name);
  await page.goto(`/?room=${code}&net=local&paused=1`);
  await page.waitForFunction(() => window.__game?.ready === true);
  return page;
}

test.describe('drops and rejoin', () => {
  test('a player who closes their page mid-race: the AI takes over, the race completes, and they rejoin the next race', async ({
    context,
  }) => {
    test.setTimeout(300_000);
    const room = await openLobby(context, 3, {
      laps: 1,
      racers: [undefined, undefined, 'boulder'],
    });
    const [host, ann, bob] = room.pages as [Page, Page, Page];
    expect((await state(bob)).karts[2]?.kartType).toBe('boulder');
    await pauseAll(room.pages);
    await autopilotAll(room.pages);
    await stepAll(room.pages, 60 * 5);

    // Bob's tab goes: it says bye on the way out, and the host hands kart 2 to the AI.
    await bob.close();
    const stayers = [host, ann];
    await stepAll(stayers, 30, { render: true });
    for (const page of stayers) {
      await expect(page.locator('.toast')).toHaveText('Bob disconnected — AI takes over');
      expect((await state(page)).karts[2]?.controller).toBe('ai');
    }

    // The race finishes as usual: 8 rows, the same on both pages.
    await raceToTheEnd(stayers);
    const hostRows = await finalRows(host);
    expect(hostRows).toHaveLength(8);
    expect(await finalRows(ann)).toEqual(hostRows);

    // Bob opens the room link again: back in the room's lobby, sitting this race out…
    const back = await openRoomLink(context, room.code, 'Bob');
    await expect(back.locator('.menu-lobby')).toBeVisible({ timeout: 20_000 });
    await expect(back.locator('.lobby-players li')).toHaveCount(3, { timeout: 10_000 });
    await expect(back.locator('.lobby-waiting')).toHaveText(
      "A race is on. You'll be in the next one.",
    );
    // …with the racer he picked before.
    await expect(back.getByRole('combobox', { name: 'Racer' })).toHaveValue('boulder');

    // …and in the next one when the host races again.
    await host.getByRole('button', { name: 'Race again' }).click();
    const pages = [host, ann, back];
    for (const page of pages) await expect(page.locator('.menus')).toBeHidden({ timeout: 20_000 });
    await waitForRaces(pages);
    const again = await state(back);
    expect(again.localKartId).toBe(2);
    expect(again.karts[2]?.name).toBe('Bob');
    expect(again.karts[2]?.kartType).toBe('boulder');
    expect((await state(host)).karts[2]?.controller).toBe('remote');
  });

  test('closing the host page takes everyone to "Host left" within 6 s', async ({ context }) => {
    test.setTimeout(180_000);
    const room = await openLobby(context, 3);
    const [host, ...clients] = room.pages as [Page, Page, Page];
    const closedAt = Date.now();
    await host.close();
    for (const client of clients) {
      await expect(client.locator('.menu-online')).toBeVisible({
        timeout: Math.max(0, 6_000 - (Date.now() - closedAt)),
      });
      await expect(client.getByRole('alert')).toHaveText('Host left — room closed');
      expect(await client.evaluate(() => window.__game!.net())).toBeNull();
    }
  });

  test('online-drop: the client vanishes 10 s in; the host hands its kart to the AI, the client sees "Connection lost"', async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const { host, clients, pages } = await openRoom(browser, 2, { scenario: 'online-drop' });
    const client = clients[0]!;
    await autopilotAll(pages);
    const goTick = (await state(host)).race.goTick;
    // Race to just before the client vanishes (10 s after GO): still the player's kart.
    await stepAll(pages, goTick + 60 * 10 - 30, { chunk: 12 });
    expect((await state(host)).karts[1]?.controller).toBe('remote');
    // Past it: 3 s later the host drops the silent client (from its next tick, the AI drives).
    await stepAll(pages, 60 * 3 + 60, { chunk: 12 });
    await stepAll([host], 3, { render: true });
    await expect(host.locator('.toast')).toHaveText('Player 2 disconnected — AI takes over');
    const hostState = await state(host);
    expect(hostState.karts[1]?.controller).toBe('ai');
    expect(hostState.phase).toBe('racing');
    // The client hears nothing more: after 5 s it offers Rejoin or Leave.
    await stepAll([client], 60 * 2, { chunk: 12 });
    await stepAll([client], 3, { render: true });
    await expect(client.locator('.menu-connectionLost')).toBeVisible();
    await expect(client.getByRole('alert')).toHaveText('Lost the connection to the host.');
    await expect(client.getByRole('button', { name: 'Rejoin' })).toBeVisible();
    await client.getByRole('button', { name: 'Leave' }).click();
    await expect(client.locator('.menu-title')).toBeVisible();
  });
});
