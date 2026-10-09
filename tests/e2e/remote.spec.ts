import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { getState, step } from './helpers';

/**
 * Phone controllers (MK-146): the desktop's Add Controllers panel and the phone page `/remote`
 * paired over BroadcastChannel (`&net=local`), as two pages of one browser context.
 */

let pairings = 0;
const CONNECT_TIMEOUT_MS = 15_000;

async function openDesktop(page: Page, scenario: string, code: string) {
  await page.goto(`/?scenario=${scenario}&net=local&pair=${code}`);
  await page.waitForFunction(() => window.__game?.ready === true);
  await expect(page.locator('.add-controllers')).toBeVisible();
}

/** The phone page from the URL slot `n`'s QR code encodes. */
async function openPhone(context: BrowserContext, desktop: Page, n: number): Promise<Page> {
  const url = await desktop
    .locator(`.add-controllers-slot[data-slot="${n}"] svg`)
    .getAttribute('data-qr');
  const phone = await context.newPage();
  await phone.goto(url!);
  return phone;
}

function slots(page: Page) {
  return page.evaluate(() => window.__remotes!.slots());
}

/** Holds a phone button down with the mouse until `release` is called. */
async function hold(phone: Page, control: string) {
  await phone.locator(`[data-control="${control}"]`).hover();
  await phone.mouse.down();
  return () => phone.mouse.up();
}

test.describe('phone controllers', () => {
  test.skip(({ isMobile }) => isMobile, 'the desktop side; the phone layout is checked below');

  test('the panel shows a QR code per player pointing at /remote', async ({ page }) => {
    const code = `E2E-${Date.now() % 1e6}-${(pairings += 1)}`;
    await openDesktop(page, 'add-controllers', code);
    const cards = page.locator('.add-controllers-slot');
    await expect(cards).toHaveCount(4);
    await expect(cards.first()).toHaveAttribute('data-state', 'waiting');
    const url = new URL((await cards.nth(2).locator('svg').getAttribute('data-qr'))!);
    expect(url.origin).toBe(new URL(page.url()).origin);
    expect(url.pathname).toBe('/remote');
    expect(Object.fromEntries(url.searchParams)).toEqual({ room: code, slot: '3', net: 'local' });
    await expect(page.locator('.add-controllers-code')).toContainText(code);
    // A modal: Tab stays on Done, arrows don't reach the title underneath.
    const done = page.locator('.add-controllers-done');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    await expect(done).toBeFocused();
    // Done goes back to the title.
    await done.click();
    await expect(page.locator('.add-controllers')).toHaveCount(0);
    await expect(page.locator('.menu-title')).toBeVisible();
  });

  test('a phone pairs, drives player 1, and dropping it pauses the race', async ({
    page,
    context,
  }) => {
    const code = `E2E-${Date.now() % 1e6}-${(pairings += 1)}`;
    await openDesktop(page, 'remote-race', code);
    const slot1 = page.locator('.add-controllers-slot[data-slot="1"]');
    await expect(slot1).toHaveAttribute('data-state', 'waiting');

    const phone = await openPhone(context, page, 1);
    await expect(phone.locator('.remote-status')).toHaveText('Player 1 · Connected', {
      timeout: CONNECT_TIMEOUT_MS,
    });
    await expect(slot1).toHaveAttribute('data-state', 'connected');

    // Done, then Resume, then hold the race still to step it.
    await page.locator('.add-controllers-done').click();
    await page.locator('.menu-paused button', { hasText: 'Resume' }).click();
    await page.evaluate(() => window.__game!.pause());

    // Gas: the phone's input reaches player 1's kart.
    const before = await getState(page);
    let release = await hold(phone, 'gas');
    await expect.poll(async () => (await slots(page))[0]?.input.throttle).toBe(1);
    const moving = await step(page, 60);
    await release();
    expect(moving.karts[0]!.speed).toBeGreaterThan(before.karts[0]!.speed + 1);

    // Steering right turns it.
    release = await hold(phone, 'right');
    await expect.poll(async () => (await slots(page))[0]?.input.steer).toBe(1);
    const turned = await step(page, 30);
    await release();
    expect(turned.karts[0]!.heading).not.toBeCloseTo(moving.karts[0]!.heading, 2);
    // Inputs arrive numbered, about 60 a second.
    expect((await slots(page))[0]!.seq).toBeGreaterThan(10);

    // The phone goes: its slot shows disconnected and the race pauses under the panel.
    await page.evaluate(() => window.__game!.resume());
    await phone.close();
    await expect(slot1).toHaveAttribute('data-state', 'disconnected');
    await expect.poll(() => page.evaluate(() => window.__game!.isPaused())).toBe(true);
    await expect(page.locator('.menu-paused')).toBeVisible();
    expect((await slots(page))[0]!.input.throttle).toBe(0);

    // Rescanning (opening the URL again) reconnects.
    const again = await openPhone(context, page, 1);
    await expect(again.locator('.remote-status')).toHaveText('Player 1 · Connected', {
      timeout: CONNECT_TIMEOUT_MS,
    });
    await expect(slot1).toHaveAttribute('data-state', 'connected');
  });

  test('a link without a code asks for a rescan', async ({ page }) => {
    await page.goto('/remote?slot=1');
    await expect(page.locator('.remote-status')).toContainText('Scan the QR code');
    await expect(page.locator('.remote-pad')).toBeHidden();
  });
});

test.describe('phone controller page on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone and tablet projects');

  test('every button fits on screen and is finger-sized', async ({ page }) => {
    await page.goto('/remote?room=ABCD&slot=2&net=local');
    await expect(page.locator('.remote-status')).toContainText('Player 2');
    const viewport = page.viewportSize()!;
    const buttons = page.locator('.remote-button');
    await expect(buttons).toHaveCount(6);
    for (const box of await buttons.evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect),
    )) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(viewport.width);
      expect(box.bottom).toBeLessThanOrEqual(viewport.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
  });
});
