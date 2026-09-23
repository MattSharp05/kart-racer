import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';

for (const name of ['sunny-start', 'sunny-overview']) {
  test(`${name} (paused)`, async ({ page }) => {
    await loadScenario(page, name, { paused: true });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    await expect(page).toHaveScreenshot(`${name}.png`);
  });
}
