import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';

// MK-121: MK8 Mode's pause menu over the test ramp's race, and the results (VS) and Grand Prix
// standings at their end (`&paused=1` shows the end at once). No pack: stand-in icons.
for (const [name, selector] of [
  ['mk8-ui-pause', '.mk8-scr-pause'],
  ['mk8-ui-results', '.mk8-scr-results[data-phase="done"]'],
  ['mk8-ui-standings', '.mk8-scr-results[data-phase="done"]'],
] as const) {
  test(`${name} (paused)`, async ({ page }) => {
    await loadScenario(page, name, { paused: true });
    await expect(page.locator(selector)).toBeVisible();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    await expect(page).toHaveScreenshot(`${name}.png`);
  });
}
