import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * Connecting a lobby's race (MK-73). On production the lobby runs over Supabase and each race over
 * WebRTC; here the rooms are `?net=local` (BroadcastChannel) and `&links=` picks the race links:
 * `webrtc` = real WebRTC data channels, as on Supabase; `blocked` = signaling goes nowhere, so the
 * race never connects, like a phone on mobile data that can't reach the host.
 */

let rooms = 0;
/** A room code no other test uses (4 characters of the room alphabet). */
function freshCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const n = (Date.now() + (rooms += 1) * 7919) % alphabet.length ** 3;
  return `C${[2, 1, 0].map((p) => alphabet[Math.floor(n / alphabet.length ** p) % alphabet.length]).join('')}`;
}

function lobbyUrl(role: 'host' | 'client', code: string, links: 'webrtc' | 'blocked'): string {
  return `/?scenario=online-lobby&net=local&links=${links}&role=${role}&room=${code}&laps=1`;
}

/** A page whose player is already named (MK-42), opened on `url`. */
async function open(context: BrowserContext, url: string, nickname: string): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript((name) => {
    localStorage.setItem(
      'kart-racer:settings',
      JSON.stringify({ version: 1, nickname: name, colour: 'blue', seenHowToPlay: true }),
    );
  }, nickname);
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.ready === true);
  return page;
}

/** Host Hosty and guest Guesty in one room, the guest ready and the host's Start pressed. */
async function startRace(context: BrowserContext, links: 'webrtc' | 'blocked') {
  const code = freshCode();
  const host = await open(context, lobbyUrl('host', code, links), 'Hosty');
  await expect(host.locator('.room-code')).toHaveText(code);
  const guest = await open(context, lobbyUrl('client', code, links), 'Guesty');
  await expect(host.locator('.lobby-players li')).toHaveCount(2);
  await guest.getByRole('button', { name: 'Ready' }).click();
  await host.getByRole('button', { name: 'Start' }).click();
  return { host, guest };
}

const started = (page: Page) => page.evaluate(() => window.__game!.net()?.started === true);

test.describe('connecting an online race (MK-73)', () => {
  test('a lobby race connects over WebRTC data channels and runs on both devices', async ({
    context,
    browserName,
  }) => {
    // WebKit offers only mDNS host candidates, which CI's container can't resolve, and it has no
    // STUN: its peers never find a path. (Real iPhones do; that's the QA check.)
    test.skip(browserName === 'webkit', "WebKit's ICE can't find a path in CI's container");
    test.setTimeout(90_000);
    const { host, guest } = await startRace(context, 'webrtc');
    await expect.poll(() => started(guest), { timeout: 30_000 }).toBe(true);
    await expect.poll(() => started(host)).toBe(true);
    await expect(guest.locator('.hud-waiting')).toBeHidden();
    // The countdown runs: the host's race ticks on.
    const tick = await host.evaluate(() => window.__game!.getState().tick);
    await expect
      .poll(() => host.evaluate(() => window.__game!.getState().tick), { timeout: 15_000 })
      .toBeGreaterThan(tick + 30);
  });

  test("a race that can't connect says who it waits for, and the host sees a player leave", async ({
    context,
  }) => {
    test.setTimeout(90_000);
    const { host, guest } = await startRace(context, 'blocked');
    // No countdown standing still on 3: who each device is connecting to.
    await expect(host.locator('.hud-waiting')).toHaveText('Connecting to Guesty…');
    await expect(guest.locator('.hud-waiting')).toHaveText('Connecting to Hosty…');
    await expect(host.locator('.hud-centre')).toBeHidden();
    expect(await host.evaluate(() => window.__game!.getState().tick)).toBe(0);

    // The guest gives up and quits (pause menu): the host hears of it at once.
    await guest.getByRole('button', { name: 'Pause' }).click();
    await guest.getByRole('button', { name: /quit/i }).click();
    await expect(host.getByRole('alert')).toHaveText('Guesty left the room.');
    await expect(host.locator('.lobby-players li')).toHaveCount(1);
  });

  // Waits out the 20 s connect timeout: main only.
  test(
    "a race that can't connect goes back to the lobby after 20 s, naming who",
    { tag: '@full' },
    async ({ context }) => {
      test.setTimeout(90_000);
      const { host, guest } = await startRace(context, 'blocked');
      await expect(host.getByRole('alert')).toContainText("Couldn't connect to Guesty.", {
        timeout: 30_000,
      });
      await expect(guest.getByRole('alert')).toContainText(
        /Couldn't connect to Hosty\.|couldn't start/,
        {
          timeout: 30_000,
        },
      );
      // Both are back in the lobby, and the host can start again.
      await expect(host.getByRole('button', { name: 'Start' })).toBeVisible();
      await expect(guest.locator('.lobby-players li')).toHaveCount(2);
    },
  );
});
