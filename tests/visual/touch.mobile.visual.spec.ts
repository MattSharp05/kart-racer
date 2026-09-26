import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';

test('sunny-start with touch controls (paused)', async ({ page }, info) => {
  await loadScenario(page, 'sunny-start', { paused: true });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot(`sunny-start-${info.project.name}.png`);
});

test('hud-mid-race with touch controls (paused)', async ({ page }, info) => {
  await loadScenario(page, 'hud-mid-race', { paused: true });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot(`hud-mid-race-${info.project.name}.png`);
});

test('how to play, touch version (paused)', async ({ page }, info) => {
  await loadScenario(page, 'menu-how-to-play', { paused: true });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot(`menu-how-to-play-${info.project.name}.png`);
});

for (const name of ['menu-title', 'racer-select', 'race-finished', 'settings', 'menu-paused']) {
  test(`${name} on phones (paused)`, async ({ page }, info) => {
    await loadScenario(page, name, { paused: true });
    await page.waitForTimeout(600);
    // Menus resume the sim behind them; freeze it so the frame is stable.
    await page.evaluate(() => window.__game!.pause());
    await page.waitForTimeout(100);
    await expect(page).toHaveScreenshot(`${name}-${info.project.name}.png`);
  });
}
