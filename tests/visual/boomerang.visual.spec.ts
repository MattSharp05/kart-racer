import { expect, test } from '@playwright/test';
import { loadScenario, setInput, step } from '../e2e/helpers';

const frame = (page: import('@playwright/test').Page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

// MK-69: the Boomerang icon and the boomerang in flight.
test('boomerang HUD icon (paused)', async ({ page }) => {
  await loadScenario(page, 'item-boomerang', { paused: true });
  const slot = page.locator('.hud-item');
  await expect(slot).toHaveAttribute('data-item', 'boomerang');
  await frame(page);
  await expect(slot).toHaveScreenshot('boomerang-icon.png');
});

test('boomerang in flight (paused)', async ({ page }) => {
  await loadScenario(page, 'item-boomerang', { paused: true });
  await setInput(page, 0, { throttle: 1, item: true });
  await step(page, 1);
  await setInput(page, 0, { throttle: 1 });
  await step(page, 14);
  await frame(page);
  await expect(page).toHaveScreenshot('boomerang-flight.png');
});
