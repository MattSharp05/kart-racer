import { expect, test } from '@playwright/test';
import { loadScenario, setInput, step } from '../e2e/helpers';

const frame = (page: import('@playwright/test').Page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

// MK-65: the HUD item slot with each new item's icon.
for (const [scenario, item] of [
  ['item-turbo-trio', 'turbo-trio'],
  ['item-oil-slick', 'oil-slick'],
] as const) {
  test(`${item} HUD icon (paused)`, async ({ page }) => {
    await loadScenario(page, scenario, { paused: true });
    const slot = page.locator('.hud-item');
    await expect(slot).toHaveAttribute('data-item', item);
    await frame(page);
    await expect(slot).toHaveScreenshot(`${item}-icon.png`);
  });
}

test('oil slick puddle, seen from the AI behind (paused)', async ({ page }) => {
  await loadScenario(page, 'item-oil-slick-watch', { paused: true });
  await setInput(page, 0, { throttle: 1, item: true });
  await step(page, 1);
  await setInput(page, 0, { throttle: 1 });
  await step(page, 10);
  await frame(page);
  await expect(page).toHaveScreenshot('oil-slick-puddle.png');
});
