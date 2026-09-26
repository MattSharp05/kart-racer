import { expect, test, type Page } from '@playwright/test';
import { loadScenario, setInput, step } from '../e2e/helpers';

const frame = (page: Page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

// MK-68: the Magnet and Ink Cloud icons, the magnet's field and the ink on your screen.
test('magnet HUD icon (paused)', async ({ page }) => {
  await loadScenario(page, 'item-magnet', { paused: true });
  const slot = page.locator('.hud-item');
  await expect(slot).toHaveAttribute('data-item', 'magnet');
  await frame(page);
  await expect(slot).toHaveScreenshot('magnet-icon.png');
});

test('ink cloud HUD icon (paused)', async ({ page }) => {
  await page.goto('/?scenario=item-magnet&item=ink-cloud&paused=1');
  await page.waitForFunction(() => window.__game?.ready === true);
  const slot = page.locator('.hud-item');
  await expect(slot).toHaveAttribute('data-item', 'ink-cloud');
  await frame(page);
  await expect(slot).toHaveScreenshot('ink-cloud-icon.png');
});

test('magnet field pulling you in (paused)', async ({ page }) => {
  await loadScenario(page, 'item-magnet', { paused: true });
  await setInput(page, 0, { throttle: 1, item: true });
  await step(page, 1);
  await setInput(page, 0, { throttle: 1 });
  await step(page, 30);
  await frame(page);
  await expect(page).toHaveScreenshot('magnet-field.png');
});

test('ink on your screen (paused)', async ({ page }) => {
  await loadScenario(page, 'item-ink', { paused: true });
  await setInput(page, 0, { throttle: 1 });
  await step(page, 90);
  await expect(page.locator('.ink-cloud-splats')).toBeVisible();
  await frame(page);
  await expect(page).toHaveScreenshot('ink-cloud-screen.png');
});
