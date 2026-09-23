import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';

test('sunny-start with touch controls (paused)', async ({ page }, info) => {
  await loadScenario(page, 'sunny-start', { paused: true });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot(`sunny-start-${info.project.name}.png`);
});
