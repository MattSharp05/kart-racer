import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';

for (const name of ['menu-kart-select', 'menu-cc-select', 'menu-paused', 'race-finished']) {
  test(`${name} (paused)`, async ({ page }) => {
    await loadScenario(page, name, { paused: true });
    await page.waitForTimeout(600);
    // Menus resume the sim behind them; freeze it so the frame is stable.
    await page.evaluate(() => window.__game!.pause());
    await page.waitForTimeout(100);
    await expect(page).toHaveScreenshot(`${name}.png`);
  });
}
