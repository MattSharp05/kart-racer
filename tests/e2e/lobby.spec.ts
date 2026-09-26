import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * Lobby (MK-47): the host picks track, cc and items, everyone picks a racer and readies up, and the
 * host's Start puts every player in the same online race. Pages of one context share `?net=local`
 * rooms and races over BroadcastChannel, so no Supabase is needed.
 */

let rooms = 0;
/** A room code no other test uses (4 characters of the room alphabet). */
function freshCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const n = (Date.now() + (rooms += 1) * 7919) % alphabet.length ** 3;
  return `L${[2, 1, 0].map((p) => alphabet[Math.floor(n / alphabet.length ** p) % alphabet.length]).join('')}`;
}

function lobbyUrl(role: 'host' | 'client', code: string): string {
  return `/?scenario=online-lobby&net=local&role=${role}&room=${code}&paused=1`;
}

/** A page whose player is already named (MK-42), opened on `url`. */
async function open(context: BrowserContext, url: string, nickname: string): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript((name) => {
    const settings = JSON.parse(localStorage.getItem('kart-racer:settings') ?? '{"version":1}');
    localStorage.setItem(
      'kart-racer:settings',
      JSON.stringify({ ...settings, nickname: name, colour: 'blue', seenHowToPlay: true }),
    );
  }, nickname);
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.ready === true);
  return page;
}

const players = (page: Page) => page.locator('.lobby-players li');
const ccButton = (page: Page, cc: number) =>
  page.getByRole('button', { name: `${cc}cc`, exact: true });
const SYNC = { timeout: 1000 };

test.describe('lobby', () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, 'multi-page rooms run on the desktop projects (BroadcastChannel)');
  });

  test('host settings sync, everyone readies up, Start puts both in the same race', async ({
    context,
  }) => {
    test.setTimeout(120_000);
    const code = freshCode();
    const host = await open(context, lobbyUrl('host', code), 'Hosty');
    await expect(host.locator('.room-code')).toHaveText(code);
    const guest = await open(context, lobbyUrl('client', code), 'Guesty');
    await expect(players(guest)).toHaveCount(2);
    await expect(players(host)).toHaveCount(2);

    // Only the host can change the settings.
    await expect(guest.getByRole('combobox', { name: 'Track' })).toBeDisabled();
    await expect(ccButton(guest, 50)).toBeDisabled();
    await expect(guest.locator('.lobby-items')).toBeDisabled();
    await expect(ccButton(host, 100)).toHaveAttribute('aria-pressed', 'true');

    // The host picks a track, 50cc then 100cc, items off: the guest sees each within 1 s.
    await host.getByRole('combobox', { name: 'Track' }).selectOption('sunny-circuit');
    await expect(guest.getByRole('combobox', { name: 'Track' })).toHaveValue('sunny-circuit', SYNC);
    await ccButton(host, 50).click();
    await expect(ccButton(guest, 50)).toHaveAttribute('aria-pressed', 'true', SYNC);
    await ccButton(host, 100).click();
    await host.locator('.lobby-items').click();
    await expect(ccButton(guest, 100)).toHaveAttribute('aria-pressed', 'true', SYNC);
    await expect(ccButton(guest, 50)).toHaveAttribute('aria-pressed', 'false');
    await expect(guest.locator('.lobby-items')).toHaveText('Items: Off', SYNC);

    // Racers: the host picks Pixie, the guest Boulder; each shows in both lists.
    await host.getByRole('combobox', { name: 'Racer' }).selectOption('pixie');
    await guest.getByRole('combobox', { name: 'Racer' }).selectOption('boulder');
    await expect(players(host).nth(1)).toContainText('Boulder');
    await expect(players(guest).first()).toContainText('Pixie');

    // Start waits for everyone to be ready (the host doesn't ready up: it starts).
    const start = host.getByRole('button', { name: 'Start' });
    await expect(guest.getByRole('button', { name: 'Start' })).toBeHidden();
    await expect(host.getByRole('button', { name: 'Ready' })).toBeHidden();
    await expect(start).toBeDisabled();
    await guest.getByRole('button', { name: 'Ready' }).click();
    await expect(players(host).nth(1)).toContainText('✓ Ready');
    await expect(start).toBeEnabled();
    await start.click();

    // Both race: the menus close, the race waits for the guest, then runs for both.
    await expect(host.locator('.menus')).toBeHidden();
    await expect(guest.locator('.menus')).toBeHidden();
    for (const page of [host, guest]) {
      await expect
        .poll(() => page.evaluate(() => window.__game!.net()?.started), { timeout: 30_000 })
        .toBe(true);
    }
    const race = (page: Page) =>
      page.evaluate(() => {
        const state = window.__game!.getState();
        return {
          trackId: state.trackId,
          engineClass: state.engineClass,
          itemBoxes: state.entities.length,
          karts: state.karts.map((k) => `${k.kartType}:${k.controller}`),
          names: state.karts.slice(0, 2).map((k) => k.name),
          localKartId: state.localKartId,
          net: window.__game!.net(),
        };
      });
    const onHost = await race(host);
    const onGuest = await race(guest);
    expect(onHost).toMatchObject({
      trackId: 'sunny-circuit',
      engineClass: 100,
      itemBoxes: 0,
      names: ['Hosty', 'Guesty'],
      localKartId: 0,
    });
    // 2 humans + 6 AI.
    expect(onHost.karts).toHaveLength(8);
    expect(onHost.karts.slice(0, 2)).toEqual(['pixie:local', 'boulder:remote']);
    expect(onHost.karts.slice(2).every((k) => k.endsWith(':ai'))).toBe(true);
    expect(onHost.net).toMatchObject({ role: 'host', players: 2, expectedPlayers: 2 });
    // The guest drives kart 1 in the host's race.
    expect(onGuest).toMatchObject({
      trackId: 'sunny-circuit',
      engineClass: 100,
      itemBoxes: 0,
      localKartId: 1,
    });
    expect(onGuest.karts.map((k) => k.split(':')[0])).toEqual(
      onHost.karts.map((k) => k.split(':')[0]),
    );
    expect(onGuest.net).toMatchObject({ role: 'client', kartId: 1, players: 2 });

    // The host leaving mid-race ends it for the guest: back to Online with why, race stopped.
    await host.close();
    await expect(guest.locator('.menu-online')).toBeVisible({ timeout: 10_000 });
    await expect(guest.getByRole('alert')).toHaveText('Host left the room');
    expect(await guest.evaluate(() => window.__game!.net())).toBeNull();
  });

  test('Start is disabled until every player is ready, and again if one un-readies', async ({
    context,
  }) => {
    test.setTimeout(120_000);
    const code = freshCode();
    const host = await open(context, lobbyUrl('host', code), 'Hosty');
    await expect(host.locator('.room-code')).toHaveText(code);
    // Alone, the host can start straight away (a race against 7 AI).
    const start = host.getByRole('button', { name: 'Start' });
    await expect(start).toBeEnabled();

    const a = await open(context, lobbyUrl('client', code), 'Ann');
    const b = await open(context, lobbyUrl('client', code), 'Bob');
    await expect(players(host)).toHaveCount(3);
    await expect(start).toBeDisabled();
    await expect(host.locator('.lobby-waiting')).toHaveText('Waiting for everyone to be ready…');

    await a.getByRole('button', { name: 'Ready' }).click();
    await expect(a.getByRole('button', { name: '✓ Ready' })).toBeVisible();
    await expect(a.locator('.lobby-waiting')).toHaveText('Waiting for the host to start…');
    await expect(players(host).nth(1)).toContainText('✓ Ready');
    await expect(start).toBeDisabled();

    await b.getByRole('button', { name: 'Ready' }).click();
    await expect(start).toBeEnabled();
    await b.getByRole('button', { name: '✓ Ready' }).click();
    await expect(start).toBeDisabled();
  });
});

test.describe('lobby on a small phone', () => {
  test.use({ viewport: { width: 667, height: 375 } });

  test('the lobby with its settings fits 667×375, buttons at least 44 px', async ({ page }) => {
    await page.goto(`/?scenario=online-lobby&room=${freshCode()}&paused=1`);
    await page.waitForFunction(() => window.__game?.ready === true);
    await expect(page.locator('.lobby-settings')).toBeVisible();
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
    expect(result).toEqual({ inside: true, scrolls: false, small: 0 });
  });
});
