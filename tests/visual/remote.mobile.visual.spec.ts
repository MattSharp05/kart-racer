import { expect, test, type Page } from '@playwright/test';

// MK-147: the phone controller page, held sideways like a remote (player 2's colour), the Start
// sheet an iPhone shows before tilt, and the portrait hint to turn the phone.

/** A browser that needs no tap for motion access (Android): no Start sheet. */
async function noMotionPrompt(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window.DeviceOrientationEvent, 'requestPermission', {
      configurable: true,
      value: undefined,
    });
  });
}

async function openRemote(page: Page) {
  await page.goto('/remote?room=VISUALAB&slot=2&net=local');
  await expect(page.locator('.remote-status')).toHaveText('Player 2 · Connecting…');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
}

test('phone controller, landscape', async ({ page }, info) => {
  await noMotionPrompt(page);
  await openRemote(page);
  await expect(page.locator('.remote-start')).toBeHidden();
  await expect(page).toHaveScreenshot(`remote-landscape-${info.project.name}.png`);
});

test('phone controller, Start sheet for tilt', async ({ page }, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.DeviceOrientationEvent, 'requestPermission', {
      configurable: true,
      value: () => Promise.resolve('granted'),
    });
  });
  await openRemote(page);
  await expect(page.locator('.remote-start')).toBeVisible();
  await expect(page).toHaveScreenshot(`remote-start-${info.project.name}.png`);
});

test('phone controller, portrait asks to turn the phone', async ({ page }, info) => {
  const { width, height } = page.viewportSize()!;
  await page.setViewportSize({ width: Math.min(width, height), height: Math.max(width, height) });
  await noMotionPrompt(page);
  await openRemote(page);
  await expect(page.locator('.remote-rotate')).toBeVisible();
  await expect(page).toHaveScreenshot(`remote-portrait-${info.project.name}.png`);
});
