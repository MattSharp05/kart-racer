import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';

// MK-55: name tags over the other people's karts, and the room's results.
for (const name of ['online-name-tags', 'online-results']) {
  test(`${name} (paused)`, async ({ page }) => {
    await loadScenario(page, name, { paused: true });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    await expect(page).toHaveScreenshot(`${name}.png`);
  });
}
