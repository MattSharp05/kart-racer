import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';

// Tilt steering (MK-54): the race without the drag stick, and Settings with tilt's options.

test('race-tilt: buttons only, no drag stick (paused)', async ({ page }, info) => {
  await loadScenario(page, 'race-tilt', { paused: true });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot(`race-tilt-${info.project.name}.png`);
});

test('settings with Tilt chosen: sensitivity and Calibrate (paused)', async ({ page }, info) => {
  // No motion prompt in a test browser: allow it, as a tap on a real iPhone would.
  await page.addInitScript(() => {
    const w = window as unknown as { DeviceOrientationEvent?: object };
    w.DeviceOrientationEvent ??= {};
    Object.assign(w.DeviceOrientationEvent, {
      requestPermission: () => Promise.resolve('granted'),
    });
  });
  await loadScenario(page, 'settings', { paused: true });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__game!.pause());
  await page.locator('.steering-setting').getByRole('button', { name: 'Tilt' }).click();
  await expect(page.locator('.tilt-options')).toBeVisible();
  await page.locator('.menu-settings .settings-back').focus();
  // Show the tilt options: the settings body scrolls on a phone.
  await page.locator('.settings-body').evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.waitForTimeout(100);
  await expect(page).toHaveScreenshot(`settings-tilt-${info.project.name}.png`);
});
