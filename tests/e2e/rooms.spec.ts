import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { enterNickname } from './helpers';

/**
 * Rooms (MK-40): create, join by code or link, the live presence list, full and missing rooms.
 * Pages of one context share `?net=local` rooms over BroadcastChannel, so no Supabase is needed.
 */

/** The title screen with `?net=local` rooms (a scenario, so the first-visit guide stays shut). */
const TITLE = '/?scenario=menu-title&net=local&paused=1';

/**
 * A new page whose player is already named `nickname` (MK-42), so a room link skips the
 * first-launch name screen. Each page writes its own name before the game reads it.
 */
async function namedPage(context: BrowserContext, nickname: string): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript((name) => {
    const settings = JSON.parse(localStorage.getItem('kart-racer:settings') ?? '{"version":1}');
    localStorage.setItem(
      'kart-racer:settings',
      JSON.stringify({ ...settings, nickname: name, colour: 'blue', seenHowToPlay: true }),
    );
  }, nickname);
  return page;
}

async function open(context: BrowserContext, url = TITLE, nickname = 'Racer'): Promise<Page> {
  const page = await namedPage(context, nickname);
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.ready === true);
  return page;
}

/** Title → Online → Create room; returns the room code from the lobby. */
async function createRoom(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Online' }).click();
  await page.getByRole('button', { name: 'Create room' }).click();
  const code = page.locator('.room-code');
  await expect(code).toBeVisible();
  return (await code.getAttribute('data-code'))!;
}

/** Title → Online → Join with code → type `code` → Join. */
async function joinWithCode(page: Page, code: string): Promise<void> {
  await page.getByRole('button', { name: 'Online' }).click();
  await page.getByRole('button', { name: 'Join with code' }).click();
  await page.getByRole('textbox', { name: 'Room code' }).fill(code.toLowerCase());
  await page.getByRole('button', { name: 'Join', exact: true }).click();
}

const players = (page: Page) => page.locator('.lobby-players li');

test.describe('rooms', () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, 'multi-page rooms run on the desktop projects (BroadcastChannel)');
  });

  test('create a room, join it with the code, both lists update live', async ({ context }) => {
    const host = await open(context, TITLE, 'Hosty');
    const code = await createRoom(host);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    await expect(players(host)).toHaveCount(1);
    await expect(players(host).first()).toContainText('Host');

    const guest = await open(context, TITLE, 'Guesty');
    await joinWithCode(guest, code);
    // Both lists show 2 people within 1 s of the join, by their nicknames (MK-42).
    await expect(players(guest)).toHaveCount(2, { timeout: 1000 });
    await expect(players(host)).toHaveCount(2, { timeout: 1000 });
    await expect(players(host)).toHaveText([/Hosty/, /Guesty/]);
    await expect(guest.locator('.room-code')).toHaveText(code);
    await expect(players(guest).nth(1)).toContainText('You');
    await expect(host.locator('.lobby-count')).toContainText('2/4');

    await guest.getByRole('button', { name: 'Leave room' }).click();
    await expect(guest.locator('.menu-online')).toBeVisible();
    await expect(players(host)).toHaveCount(1, { timeout: 1000 });
  });

  test('the room link joins directly; the host leaving ends the room', async ({ context }) => {
    const host = await open(context);
    const code = await createRoom(host);
    const link = await host.locator('.room-link').textContent();
    expect(link).toContain(`?room=${code}&net=local`);

    const guest = await open(context, `/?room=${code}&net=local&paused=1`);
    await expect(players(guest)).toHaveCount(2);
    await expect(players(host)).toHaveCount(2);

    await host.getByRole('button', { name: 'Leave room' }).click();
    await expect(guest.locator('.menu-online')).toBeVisible();
    await expect(guest.getByRole('alert')).toHaveText('Host left — room closed');
  });

  test('a room link on first launch asks for a nickname, then joins', async ({ context }) => {
    const host = await open(context);
    const code = await createRoom(host);
    // A player with no name yet (the host's page saved one in the shared storage: forget it).
    const guest = await namedPage(context, '');
    await guest.goto(`/?room=${code}&net=local&paused=1`);
    await expect(guest.locator('.menu-nickname')).toBeVisible();
    await enterNickname(guest, 'Newbie');
    await expect(players(guest)).toHaveCount(2);
    await expect(players(host).nth(1)).toContainText('Newbie');
  });

  test('an unknown code shows "Room not found" on the Online screen', async ({ context }) => {
    const page = await open(context, '/?room=ZZZZ&net=local&paused=1');
    await expect(page.locator('.menu-online')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveText('Room not found');
    // Back goes to the title.
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('.menu-title')).toBeVisible();
  });

  test('a 5th player is refused with "Room is full"', async ({ context }) => {
    // Five 3D pages at once: slow on CI's software GL.
    test.setTimeout(120_000);
    const host = await open(context);
    const code = await createRoom(host);
    // The joiners only need their lobby (the room link opens it without waiting on the 3D scene).
    for (let i = 0; i < 3; i += 1) {
      const guest = await namedPage(context, `Guest${i + 1}`);
      await guest.goto(`/?room=${code}&net=local&paused=1`);
      await expect(players(guest)).toHaveCount(i + 2, { timeout: 20_000 });
    }
    await expect(players(host)).toHaveCount(4);
    const fifth = await namedPage(context, 'Fifth');
    await fifth.goto(`/?room=${code}&net=local&paused=1`);
    await expect(fifth.getByRole('alert')).toHaveText('Room is full', { timeout: 20_000 });
    await expect(players(host)).toHaveCount(4);
  });

  test('the code box upper-cases and ignores look-alike characters', async ({ context }) => {
    const page = await open(context);
    await page.getByRole('button', { name: 'Online' }).click();
    await page.getByRole('button', { name: 'Join with code' }).click();
    const input = page.getByRole('textbox', { name: 'Room code' });
    const join = page.getByRole('button', { name: 'Join', exact: true });
    await input.pressSequentially('k0o7');
    await expect(input).toHaveValue('K7');
    await expect(join).toBeDisabled();
    await input.pressSequentially('qx');
    await expect(input).toHaveValue('K7QX');
    await expect(join).toBeEnabled();
    // Typing M in the box doesn't mute the game.
    await input.fill('');
    await input.pressSequentially('mm');
    await expect(input).toHaveValue('MM');
    const muted = await page.evaluate(() => localStorage.getItem('kart-racer:settings') ?? '');
    expect(muted).not.toContain('"muted":true');
  });

  test('/dev lists online-lobby with host and client links that share a room', async ({
    context,
  }) => {
    const dev = await context.newPage();
    await dev.goto('/dev.html');
    const item = dev.locator('[data-scenario="online-lobby"]');
    const hostHref = await item
      .getByRole('link', { name: 'online-lobby', exact: true })
      .getAttribute('href');
    const clientHref = await item
      .getByRole('link', { name: 'online-lobby client' })
      .getAttribute('href');
    const host = await open(context, hostHref!);
    await expect(players(host)).toHaveCount(1);
    const client = await open(context, clientHref!);
    await expect(players(client)).toHaveCount(2);
    await expect(players(host)).toHaveCount(2);
  });
});

test.describe('online screens on a small phone', () => {
  test.use({ viewport: { width: 667, height: 375 } });

  test('Online, Join and Lobby fit 667×375 with buttons at least 44 px', async ({ page }) => {
    await page.goto('/?scenario=online-lobby&room=FITS&paused=1');
    await page.waitForFunction(() => window.__game?.ready === true);
    await expect(page.locator('.room-code')).toHaveText('FITS');
    await expectFits(page, 'lobby');
    await page.getByRole('button', { name: 'Leave room' }).click();
    await expect(page.locator('.menu-online')).toBeVisible();
    await expectFits(page, 'online');
    await page.getByRole('button', { name: 'Join with code' }).click();
    await expect(page.locator('.menu-join')).toBeVisible();
    await expectFits(page, 'join');
  });
});

async function expectFits(page: Page, name: string): Promise<void> {
  const result = await page.locator('.menu-panel').evaluate((el) => {
    const r = el.getBoundingClientRect();
    const small = [...el.querySelectorAll('button')]
      .map((b) => b.getBoundingClientRect())
      .filter((b) => b.width > 0 && (b.width < 44 || b.height < 44));
    return {
      inside: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth,
      scrolls:
        el.scrollHeight > el.clientHeight + 1 ||
        document.documentElement.scrollHeight > innerHeight + 1,
      small: small.length,
    };
  });
  expect(result, name).toEqual({ inside: true, scrolls: false, small: 0 });
}
