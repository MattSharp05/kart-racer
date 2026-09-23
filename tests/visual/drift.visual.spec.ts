import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';

for (const colour of ['blue', 'orange', 'purple']) {
  test(`drift sparks: ${colour}`, async ({ page }) => {
    await loadScenario(page, `drift-charged-${colour}`, { paused: true });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    await expect(page).toHaveScreenshot(`drift-${colour}.png`);
  });
}
