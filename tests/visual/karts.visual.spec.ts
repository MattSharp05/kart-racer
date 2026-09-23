import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';

test('kart lineup (paused)', async ({ page }) => {
  await loadScenario(page, 'kart-lineup', { paused: true });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot('kart-lineup.png');
});
