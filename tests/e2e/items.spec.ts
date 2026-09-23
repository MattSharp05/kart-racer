import { expect, test } from '@playwright/test';
import { getState, loadScenario, step } from './helpers';

test.describe('items', () => {
  test('item-box-ahead: driving through a box puts an item in the slot', async ({ page }) => {
    await loadScenario(page, 'item-box-ahead', { paused: true });
    await page.evaluate(() => window.__game!.setAutopilot(0, true));
    await step(page, 180);
    expect((await getState(page)).karts[0]!.item.held).not.toBeNull();
    await expect(page.locator('.hud-item')).toHaveAttribute('data-item', /^(mushroom)$/);
  });

  test('&item=mushroom: using it boosts', async ({ page }) => {
    await page.goto('/?scenario=sunny-start&paused=1&item=mushroom');
    await page.waitForFunction(() => window.__game?.ready === true);
    await page.evaluate(() => window.__game!.setInput(0, { throttle: 1, item: true }));
    const state = await step(page, 2);
    expect(state.karts[0]!.boostTimer).toBeGreaterThan(1);
    expect(state.karts[0]!.item.held).toBeNull();
  });

  test('an unknown &item shows a banner', async ({ page }) => {
    await page.goto('/?scenario=sunny-start&paused=1&item=hammer');
    await expect(page.getByRole('alert')).toContainText('mushroom');
  });
});
