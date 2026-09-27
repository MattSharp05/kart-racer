import { expect, test, type Page } from '@playwright/test';
import { loadScenario } from './helpers';

// Tilt steering (MK-54). A browser can't show a real motion prompt or move a real gyro, so the
// permission is mocked and `deviceorientation` events are dispatched in the page.

const isPhone = (name: string) => name === 'iphone-landscape' || name === 'pixel-landscape';

/** Makes `DeviceOrientationEvent.requestPermission()` (the iOS API) answer `answer`. */
async function mockPermission(page: Page, answer: 'granted' | 'denied'): Promise<void> {
  await page.addInitScript((result) => {
    const w = window as unknown as { DeviceOrientationEvent?: object };
    if (!w.DeviceOrientationEvent) w.DeviceOrientationEvent = {};
    Object.assign(w.DeviceOrientationEvent, { requestPermission: () => Promise.resolve(result) });
  }, answer);
}

/**
 * Turns the phone `degrees` to the right like a wheel (negative: left), as a `deviceorientation`
 * event for whichever way round the landscape screen is.
 */
async function tiltRight(page: Page, degrees: number): Promise<void> {
  await page.evaluate((deg) => {
    const raw = screen.orientation?.angle ?? (window as { orientation?: number }).orientation ?? 0;
    const landscape = window.innerWidth > window.innerHeight;
    const angle = landscape && (raw === 0 || raw === 180) ? 90 : ((raw % 360) + 360) % 360;
    const init = { alpha: 0, beta: angle === 270 ? -deg : deg, gamma: angle === 270 ? 45 : -45 };
    let event: Event;
    try {
      event = new DeviceOrientationEvent('deviceorientation', init);
    } catch {
      event = Object.assign(new Event('deviceorientation'), init);
    }
    window.dispatchEvent(event);
  }, degrees);
}

/** Taps the steering zone, which in tilt mode starts driving, and drags it (which must not steer). */
async function tapToGo(page: Page): Promise<void> {
  const zone = page.locator('.touch-steer');
  await zone.dispatchEvent('pointerdown', { pointerId: 7, clientX: 100, clientY: 300 });
  await zone.dispatchEvent('pointermove', { pointerId: 7, clientX: 40, clientY: 300 });
}

/** Runs `ticks` sim ticks without drawing and returns the player's heading. */
function headingAfter(page: Page, ticks: number): Promise<number> {
  return page.evaluate((n) => window.__game!.step(n, { render: false }).karts[0]!.heading, ticks);
}

async function openSteering(page: Page) {
  await loadScenario(page, 'menu-paused');
  await page.locator('.menu-paused button', { hasText: 'Settings' }).click();
  return page.locator('.menu-settings .steering-setting');
}

test.describe('tilt steering (MK-54)', () => {
  test('phones: race-tilt hides the drag stick, and tilting 25° right is full right lock', async ({
    page,
  }, info) => {
    test.skip(!isPhone(info.project.name));
    // Two page loads: slow on the software-GL pixel-landscape job.
    test.setTimeout(60_000);
    await loadScenario(page, 'race-tilt', { paused: true });
    const controls = page.locator('.touch-controls');
    await expect(controls).toBeVisible();
    await expect(controls).toHaveAttribute('data-steering', 'tilt');
    await expect(page.locator('.touch-stick')).toBeHidden();
    await expect(page.locator('.touch-drift')).toBeVisible();

    const start = await headingAfter(page, 0);
    // A tap on the (invisible) zone starts the auto-accelerate; dragging there doesn't steer.
    await tapToGo(page);
    await tiltRight(page, 25);
    const tilted = await headingAfter(page, 30);

    // The same race with the keyboard's full right (and tilt mode's auto-accelerate).
    await loadScenario(page, 'race-tilt', { paused: true });
    expect(await headingAfter(page, 0)).toBeCloseTo(start, 6);
    await page.evaluate(() => window.__game!.setInput(0, { throttle: 1, steer: 1 }));
    const fullLock = await headingAfter(page, 30);

    expect(Math.abs(tilted - start)).toBeGreaterThan(0.1);
    expect(tilted).toBeCloseTo(fullLock, 4);
  });

  test('phones: no throttle until a tap; tilting inside the dead zone steers straight', async ({
    page,
  }, info) => {
    test.skip(!isPhone(info.project.name));
    await loadScenario(page, 'race-tilt', { paused: true });
    // Tilt alone doesn't drive: holding throttle through the countdown would stall the engine.
    const idle = await page.evaluate(() => window.__game!.step(30, { render: false }).karts[0]!);
    expect(Math.abs(idle.speed)).toBeLessThan(0.5);
    const start = idle.heading;
    await tapToGo(page);
    await tiltRight(page, 2);
    const heading = await headingAfter(page, 30);
    // The track curves a little; a steered kart turns far more than this in half a second.
    expect(Math.abs(heading - start)).toBeLessThan(0.05);
  });

  test('phones: Tilt without motion access falls back to Drag with a message', async ({
    page,
  }, info) => {
    test.skip(!isPhone(info.project.name));
    await mockPermission(page, 'denied');
    const steering = await openSteering(page);
    await steering.getByRole('button', { name: 'Tilt' }).click();
    await expect(page.locator('.steering-message')).toBeVisible();
    await expect(page.locator('.steering-message')).toContainText('Drag');
    await expect(steering.getByRole('button', { name: 'Drag' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.tilt-options')).toBeHidden();
    await expect(page.locator('.touch-controls')).toHaveAttribute('data-steering', 'drag');
    const stored = await page.evaluate(() => localStorage.getItem('kart-racer:settings'));
    expect(JSON.parse(stored ?? '{}')).toMatchObject({ steering: 'drag' });
  });

  test('phones: allowed Tilt shows sensitivity and Calibrate, saved and applied mid-race', async ({
    page,
  }, info) => {
    test.skip(!isPhone(info.project.name));
    await mockPermission(page, 'granted');
    const steering = await openSteering(page);
    await steering.getByRole('button', { name: 'Tilt' }).click();
    await expect(steering.getByRole('button', { name: 'Tilt' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.steering-message')).toBeHidden();
    await expect(page.locator('.touch-controls')).toHaveAttribute('data-steering', 'tilt');

    // Sensitivity: 10–40°, default 25°.
    const slider = page.locator('.tilt-sensitivity input[type="range"]');
    await expect(slider).toHaveValue('25');
    await slider.fill('15');
    await expect(page.locator('.tilt-sensitivity-value')).toHaveText('15°');

    // Calibrate saves how the phone is held now as straight ahead.
    await tiltRight(page, 10);
    await page.locator('.tilt-calibrate button').click();
    await expect(page.locator('.tilt-calibrate button')).toHaveText('Calibrated ✓');
    await expect(page.locator('.tilt-hint')).toContainText('10° right');

    const stored = JSON.parse(
      (await page.evaluate(() => localStorage.getItem('kart-racer:settings'))) ?? '{}',
    ) as { steering: string; tiltSensitivity: number; tiltNeutral: number };
    expect(stored.steering).toBe('tilt');
    expect(stored.tiltSensitivity).toBe(15);
    expect(stored.tiltNeutral).toBeCloseTo(10, 3);

    await page.locator('.menu-settings button', { hasText: 'Back' }).click();
    await page.locator('.menu-paused button', { hasText: 'Resume' }).click();
    await expect(page.locator('.touch-controls')).toBeVisible();
    await expect(page.locator('.touch-stick')).toBeHidden();
  });

  test('phones: saved Tilt asks again on the first tap; refused → Drag with a notice', async ({
    page,
  }, info) => {
    test.skip(!isPhone(info.project.name));
    await mockPermission(page, 'denied');
    await loadScenario(page, 'race-tilt', { paused: true });
    const controls = page.locator('.touch-controls');
    await expect(controls).toHaveAttribute('data-steering', 'tilt');
    await page.locator('.touch-brake').click();
    await expect(page.locator('.toast')).toContainText('Drag');
    await expect(controls).toHaveAttribute('data-steering', 'drag');
    await expect(page.locator('.touch-stick')).toBeVisible();
  });

  test('phones: a request iOS refuses to show (no tap) keeps Tilt and asks again', async ({
    page,
  }, info) => {
    test.skip(!isPhone(info.project.name));
    // First call throws (as iOS does without a tap), the next is allowed.
    await page.addInitScript(() => {
      const w = window as unknown as { DeviceOrientationEvent?: object };
      w.DeviceOrientationEvent ??= {};
      let calls = 0;
      Object.assign(w.DeviceOrientationEvent, {
        requestPermission: () => {
          calls += 1;
          (window as unknown as { permissionCalls: number }).permissionCalls = calls;
          return calls === 1
            ? Promise.reject(new Error('NotAllowedError'))
            : Promise.resolve('granted');
        },
      });
    });
    await loadScenario(page, 'race-tilt', { paused: true });
    const controls = page.locator('.touch-controls');
    await page.locator('.touch-brake').click();
    await page.locator('.touch-brake').click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { permissionCalls?: number }).permissionCalls),
      )
      .toBe(2);
    await expect(controls).toHaveAttribute('data-steering', 'tilt');
    await expect(page.locator('.toast')).toHaveCount(0);
  });
});
