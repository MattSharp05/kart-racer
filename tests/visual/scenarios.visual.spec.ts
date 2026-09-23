import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';

test('empty scenario (paused)', async ({ page }) => {
  await loadScenario(page, 'empty', { paused: true });
  // One rendered frame after load so the canvas isn't blank.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot('empty.png');
});
