import { expect, test } from '@playwright/test';
import { loadScenario, step } from './helpers';

type Info = { camera?: { fov: number; shake: number; fovKick: number } };
const cameraInfo = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window.__game!.renderInfo() as Info).camera!);

test.describe('juice (MK-27)', () => {
  test('a hit shakes the camera; a boost kicks the FOV', async ({ page }) => {
    await loadScenario(page, 'juice-hit', { paused: true });
    await step(page, 1);
    expect((await cameraInfo(page)).shake).toBeGreaterThan(0.1);

    await page.goto('/?scenario=sunny-start&paused=1&item=mushroom');
    await page.waitForFunction(() => window.__game?.ready === true);
    await page.evaluate(() => window.__game!.setInput(0, { throttle: 1, item: true }));
    await step(page, 2);
    expect((await cameraInfo(page)).fovKick).toBeGreaterThan(1);
  });

  test('reduced motion: no shake, no FOV kick', async ({ page }) => {
    await page.goto('/?scenario=juice-hit&paused=1&reduced-motion=1');
    await page.waitForFunction(() => window.__game?.ready === true);
    await step(page, 1);
    expect((await cameraInfo(page)).shake).toBe(0);

    await page.goto('/?scenario=sunny-start&paused=1&item=mushroom&reduced-motion=1');
    await page.waitForFunction(() => window.__game?.ready === true);
    await page.evaluate(() => window.__game!.setInput(0, { throttle: 1, item: true }));
    await step(page, 2);
    expect((await cameraInfo(page)).fovKick).toBe(0);
  });

  test('speed lines show when boosting at top speed', async ({ page }) => {
    await loadScenario(page, 'juice-boost', { paused: true });
    await step(page, 1);
    await expect(page.locator('.speed-lines')).not.toHaveCSS('opacity', '0');
  });
});
