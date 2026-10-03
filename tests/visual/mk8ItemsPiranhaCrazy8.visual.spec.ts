import { expect, test } from '@playwright/test';
import { loadScenario, setInput, step } from '../e2e/helpers';
import { servePack } from '../e2e/mk8';

const frame = (page: import('@playwright/test').Page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

// MK-126: the Piranha Plant out in front of the player (mid-lunge at the banana ahead) and Crazy 8's
// ring circling it, drawn with the synthetic fixture pack's stand-ins (CI never has the real pack).
for (const [scenario, ticks] of [
  ['mk8-item-piranha', 6],
  ['mk8-item-crazy8', 20],
] as const) {
  test(`${scenario} in use (paused)`, async ({ page }) => {
    await servePack(page);
    await loadScenario(page, scenario, { paused: true });
    await setInput(page, 0, { item: true });
    await step(page, 1);
    await setInput(page, 0, { item: false });
    await step(page, ticks);
    await frame(page);
    await frame(page);
    await expect(page).toHaveScreenshot(`${scenario}.png`);
  });
}
