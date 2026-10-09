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

/**
 * Tilts the phone page like a wheel, `degrees` right (MK-147): a landscape window reads the
 * wheel angle from `beta`. A plain event with the reading's fields (WebKit can't construct a
 * `DeviceOrientationEvent`).
 */
async function tiltPhone(phone: Page, degrees: number) {
  await phone.evaluate((beta) => {
    const event = new Event('deviceorientation');
    Object.defineProperties(event, {
      alpha: { value: 0 },
      beta: { value: beta },
      gamma: { value: 0 },
    });
    window.dispatchEvent(event);
  }, degrees);
}

/** Phone pages in `context` are allowed motion access when Start asks (MK-147). */
async function allowMotion(context: BrowserContext) {
  await context.addInitScript(() => {
    Object.defineProperty(window.DeviceOrientationEvent, 'requestPermission', {
      configurable: true,
      value: () => Promise.resolve('granted'),
    });
  });
}

/** Taps Start (motion access), holding the phone level (MK-147). */
async function startTilt(phone: Page) {
  await phone.locator('[data-action="start"]').click();
  await expect(phone.locator('.remote-start')).toBeHidden();
  await tiltPhone(phone, 0);
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

    await allowMotion(context);
    const phone = await openPhone(context, page, 1);
    await expect(phone.locator('.remote-status')).toHaveText('Player 1 · Connected', {
      timeout: CONNECT_TIMEOUT_MS,
    });
    await expect(slot1).toHaveAttribute('data-state', 'connected');
    await startTilt(phone);

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

    // Tilting the phone right (turned like a wheel, MK-147) turns it.
    await tiltPhone(phone, 40);
    await expect.poll(async () => (await slots(page))[0]?.input.steer).toBe(1);
    const turned = await step(page, 30);
    await tiltPhone(phone, 0);
    await expect.poll(async () => (await slots(page))[0]?.input.steer).toBe(0);
    expect(turned.karts[0]!.heading).not.toBeCloseTo(moving.karts[0]!.heading, 2);

    // Look back and the desktop's buzzes reach the other end (MK-147).
    release = await hold(phone, 'lookBack');
    await expect.poll(async () => (await slots(page))[0]?.buttons.lookBack).toBe(true);
    await release();
    // The flash lasts only 250 ms, less than a busy runner's polling gap: record it as it happens.
    await phone.evaluate(() => {
      const body = document.querySelector<HTMLElement>('.remote-body')!;
      const flashes: string[] = [];
      Object.assign(window, { __flashes: flashes });
      new MutationObserver(() => {
        if (body.dataset.buzz) flashes.push(body.dataset.buzz);
      }).observe(body, { attributeFilter: ['data-buzz'] });
    });
    await page.evaluate(() => window.__remotes!.buzz(0, 'hit'));
    await expect.poll(() => phone.evaluate(() => window.__remote!.buzzes())).toEqual(['hit']);
    await expect
      .poll(() => phone.evaluate(() => (window as unknown as { __flashes: string[] }).__flashes))
      .toEqual(['hit']);

    // The phone's Pause pauses the race.
    await page.evaluate(() => window.__game!.resume());
    release = await hold(phone, 'pause');
    await expect(page.locator('.menu-paused')).toBeVisible();
    await release();
    await page.locator('.menu-paused button', { hasText: 'Resume' }).click();
    // Inputs arrive numbered, about 60 a second.
    expect((await slots(page))[0]!.seq).toBeGreaterThan(10);

    // The phone goes: its slot shows disconnected and the race pauses under the panel.
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

  test("P2's phone takes P2's kart over in a 2-player race (MK-147)", async ({ page, context }) => {
    const code = `E2E-${Date.now() % 1e6}-${(pairings += 1)}`;
    await openDesktop(page, 'remote-2p', code);
    await allowMotion(context);
    const phone = await openPhone(context, page, 2);
    await expect(phone.locator('.remote-status')).toHaveText('Player 2 · Connected', {
      timeout: CONNECT_TIMEOUT_MS,
    });
    await startTilt(phone);
    await page.locator('.add-controllers-done').click();
    await page.locator('.menu-paused button', { hasText: 'Resume' }).click();
    await page.evaluate(() => window.__game!.pause());

    // The phone holds the brake: P2's kart stays on the line instead of driving itself.
    const release = await hold(phone, 'brake');
    await expect.poll(async () => (await slots(page))[1]?.input.brake).toBe(1);
    const held = await step(page, 4 * 60 + 60);
    await release();
    expect(held.slotKarts).toEqual([0, 1]);
    expect(held.karts[1]!.speed).toBeLessThan(0.5);
    // Then gas.
    const go = await hold(phone, 'gas');
    await expect.poll(async () => (await slots(page))[1]?.input.throttle).toBe(1);
    const moving = await step(page, 60);
    await go();
    expect(moving.karts[1]!.speed).toBeGreaterThan(3);

    // P2's Pause pauses the race and says who.
    await page.evaluate(() => window.__game!.resume());
    const pause = await hold(phone, 'pause');
    await expect(page.locator('.menu-paused')).toBeVisible();
    await expect(page.locator('.menu-paused')).toContainText('P2');
    await pause();
  });

  test('a link without a code asks for a rescan', async ({ page }) => {
    await page.goto('/remote?slot=1');
    await expect(page.locator('.remote-status')).toContainText('Scan the QR code');
    await expect(page.locator('.remote-face')).toBeHidden();
    await expect(page.locator('.remote-start')).toBeHidden();
  });

  test('touch steering is a choice the phone remembers (MK-147)', async ({ page, context }) => {
    await allowMotion(context);
    await page.goto('/remote?room=ABCDEFGH&slot=1&net=local');
    await expect.poll(() => page.evaluate(() => window.__remote?.steering())).toBe('tilt');
    // Tilting: the D-pad's left and right rest.
    await expect(page.locator('[data-control="right"]')).toHaveCSS('pointer-events', 'none');
    // Start offers touch instead.
    await page.locator('[data-action="touch-instead"]').click();
    await expect(page.locator('.remote-start')).toBeHidden();
    await expect(page.locator('[data-action="steering"]')).toHaveText('Steering: Touch');
    let release = await hold(page, 'right');
    expect(await page.evaluate(() => window.__remote!.pad().input.steer)).toBe(1);
    await release();
    release = await hold(page, 'left');
    expect(await page.evaluate(() => window.__remote!.pad().input.steer)).toBe(-1);
    await release();
    // Tilt is ignored while steering by touch.
    await tiltPhone(page, 40);
    expect(await page.evaluate(() => window.__remote!.pad().input.steer)).toBe(0);
    await page.reload();
    await expect.poll(() => page.evaluate(() => window.__remote?.steering())).toBe('touch');
    await expect(page.locator('[data-action="steering"]')).toHaveText('Steering: Touch');
    await expect(page.locator('.remote-start')).toBeHidden();
    // Back to tilt from the Steering key.
    await page.locator('[data-action="steering"]').click();
    await expect(page.locator('[data-action="steering"]')).toHaveText('Steering: Tilt');
    await expect(page.locator('.remote-start')).toBeVisible();
  });

  test('Level makes the way the phone is held straight ahead (MK-147)', async ({
    page,
    context,
  }) => {
    await allowMotion(context);
    await page.goto('/remote?room=ABCDEFGH&slot=1&net=local');
    await expect.poll(() => page.evaluate(() => window.__remote?.steering())).toBe('tilt');
    await startTilt(page);
    await tiltPhone(page, 15);
    await expect
      .poll(() => page.evaluate(() => window.__remote!.pad().input.steer))
      .toBeGreaterThan(0.3);
    await page.locator('[data-action="level"]').click();
    await expect(page.locator('.remote-note')).toContainText('Level set');
    expect(await page.evaluate(() => window.__remote!.pad().input.steer)).toBe(0);
    await tiltPhone(page, 15 + 40);
    expect(await page.evaluate(() => window.__remote!.pad().input.steer)).toBe(1);
    // The level is kept on the phone.
    await page.reload();
    await expect.poll(() => page.evaluate(() => window.__remote?.steering())).toBe('tilt');
    await startTilt(page);
    await tiltPhone(page, 15);
    expect(await page.evaluate(() => window.__remote!.pad().input.steer)).toBe(0);
  });
});

test.describe('phone controller page on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone and tablet projects');

  /** Presses and lets go of a phone button with a finger (pointer events, as touches send). */
  async function touch(page: Page, control: string, type: 'pointerdown' | 'pointerup') {
    await page
      .locator(`[data-control="${control}"]`)
      .dispatchEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true });
  }

  test('every button fits on screen and is finger-sized', async ({ page }) => {
    await page.goto('/remote?room=ABCD&slot=2&net=local');
    await expect(page.locator('.remote-status')).toContainText('Player 2');
    const viewport = page.viewportSize()!;
    const buttons = page.locator('.remote-button, .remote-small:visible');
    // Item, ◀, ▶, Look back, Pause, Drift, Brake, Gas + Level and Steering.
    await expect(buttons).toHaveCount(10);
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
    // Player 2's light is lit.
    await expect(page.locator('.remote-led.lit')).toHaveCount(1);
    await expect(page.locator('.remote-led').nth(1)).toHaveClass(/lit/);
  });

  test('each button sends its control (MK-147)', async ({ page }) => {
    await page.goto('/remote?room=ABCDEFGH&slot=1&net=local');
    await expect.poll(() => page.evaluate(() => typeof window.__remote)).toBe('object');
    const pad = () => page.evaluate(() => window.__remote!.pad());
    const expected: [string, (p: Awaited<ReturnType<typeof pad>>) => unknown, unknown][] = [
      ['gas', (p) => p.input.throttle, 1],
      ['brake', (p) => p.input.brake, 1],
      ['drift', (p) => p.input.drift, true],
      ['item', (p) => p.input.item, true],
      ['lookBack', (p) => p.buttons.lookBack, true],
      ['pause', (p) => p.buttons.pause, true],
    ];
    for (const [control, read, value] of expected) {
      await touch(page, control, 'pointerdown');
      expect(read(await pad()), control).toBe(value);
      await touch(page, control, 'pointerup');
      expect(read(await pad()), control).not.toBe(value);
    }
  });

  test('where motion needs allowing, Start asks, then tilt steers (MK-147)', async ({ page }) => {
    // An iPhone: motion access is asked for from a tap.
    await page.addInitScript(() => {
      (window as { __asked?: number }).__asked = 0;
      Object.defineProperty(window.DeviceOrientationEvent, 'requestPermission', {
        value: () => {
          (window as { __asked?: number }).__asked! += 1;
          return Promise.resolve('granted');
        },
      });
    });
    await page.goto('/remote?room=ABCDEFGH&slot=1&net=local');
    const start = page.locator('.remote-start');
    await expect(start).toBeVisible();
    await expect.poll(() => page.evaluate(() => typeof window.__remote)).toBe('object');
    await page.locator('[data-action="start"]').tap();
    await expect(start).toBeHidden();
    expect(await page.evaluate(() => (window as { __asked?: number }).__asked)).toBe(1);
    // Level goes straight; turned past the sensitivity is full lock.
    await tiltPhone(page, 2);
    expect(await page.evaluate(() => window.__remote!.pad().input.steer)).toBe(0);
    await tiltPhone(page, 40);
    expect(await page.evaluate(() => window.__remote!.pad().input.steer)).toBe(1);
    await tiltPhone(page, -40);
    expect(await page.evaluate(() => window.__remote!.pad().input.steer)).toBe(-1);
  });

  test('refusing motion access steers by touch (MK-147)', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window.DeviceOrientationEvent, 'requestPermission', {
        value: () => Promise.resolve('denied'),
      });
    });
    await page.goto('/remote?room=ABCDEFGH&slot=1&net=local');
    await page.locator('[data-action="start"]').tap();
    await expect(page.locator('.remote-start')).toBeHidden();
    await expect(page.locator('.remote-note')).toContainText('steering by touch');
    await expect.poll(() => page.evaluate(() => window.__remote?.steering())).toBe('touch');
    await touch(page, 'right', 'pointerdown');
    expect(await page.evaluate(() => window.__remote!.pad().input.steer)).toBe(1);
  });

  test('steering by touch skips Start', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('kart-racer:remote-pad', JSON.stringify({ steering: 'touch' }));
      Object.defineProperty(window.DeviceOrientationEvent, 'requestPermission', {
        value: () => Promise.resolve('granted'),
      });
    });
    await page.goto('/remote?room=ABCDEFGH&slot=1&net=local');
    await expect(page.locator('.remote-status')).toContainText('Player 1');
    await expect(page.locator('.remote-start')).toBeHidden();
  });
});
