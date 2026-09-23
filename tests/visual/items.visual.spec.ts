import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';

test('item boxes ahead (paused)', async ({ page }) => {
  await loadScenario(page, 'item-box-ahead', { paused: true });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot('item-box-ahead.png');
});
