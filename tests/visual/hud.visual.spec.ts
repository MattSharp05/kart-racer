import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';

test('hud-mid-race (paused)', async ({ page }) => {
  await loadScenario(page, 'hud-mid-race', { paused: true });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot('hud-mid-race.png');
});
