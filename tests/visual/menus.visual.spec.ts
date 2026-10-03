import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';

for (const name of [
  'racer-select',
  'track-select-records',
  'menu-cc-select',
  'menu-paused',
  'race-finished',
  'menu-how-to-play',
  'settings',
  'first-launch',
  'mk8-entry',
  'mk8-loading',
  'mk8-not-installed',
  'mk8-ui-kit',
  'mk8-ui-title',
  'mk8-ui-mode',
  'mk8-ui-char',
  'mk8-ui-cc',
  'mk8-ui-cup',
  'mk8-ui-course',
]) {
  test(`${name} (paused)`, async ({ page }) => {
    await loadScenario(page, name, { paused: true });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    await expect(page).toHaveScreenshot(`${name}.png`);
  });
}
