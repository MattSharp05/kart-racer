import { expect, test } from '@playwright/test';
import { getState, loadScenario } from './helpers';

test('title → kart select → engine class → race with 8 karts', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.ready === true);
  await page.locator('.menu-title button').first().click();
  await expect(page.locator('.menu-kartSelect')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.locator('.menu-kartSelect button.primary').click();
  await expect(page.locator('.menu-ccSelect')).toBeVisible();
  await page.locator('.menu-ccSelect button', { hasText: '150' }).click();
  await expect(page.locator('.menus .menu-panel')).toHaveCount(0);
  const state = await getState(page);
  expect(state.karts).toHaveLength(8);
  expect(state.engineClass).toBe(150);
});

test('menu-paused: Resume closes the pause menu', async ({ page }) => {
  await loadScenario(page, 'menu-paused');
  await expect(page.locator('.menu-paused')).toBeVisible();
  await page.locator('.menu-paused button', { hasText: 'Resume' }).click();
  await expect(page.locator('.menu-paused')).toHaveCount(0);
});
