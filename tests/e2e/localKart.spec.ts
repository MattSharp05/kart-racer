import { expect, test } from '@playwright/test';
import { getState, loadScenario, step } from './helpers';

// MK-38: the local player can be any kart, not just kart 0.
test.describe('race-local-kart-3', () => {
  test('the session, HUD and minimap follow kart 3', async ({ page }) => {
    await loadScenario(page, 'race-local-kart-3', { paused: true });
    const state = await step(page, 1);
    expect(state.localKartId).toBe(3);
    expect(state.karts[3]!.controller).toBe('local');
    const position = state.positions.indexOf(3) + 1;
    expect(position).toBe(4);
    await expect(page.locator('.hud-position')).toHaveAttribute('data-position', String(position));
    await expect(page.locator('.hud-minimap .hud-dot')).toHaveCount(8);
    await expect(page.locator('.hud-minimap .hud-dot.you')).toHaveCount(1);
  });

  test('&item= equips kart 3 and the HUD shows it', async ({ page }) => {
    await page.goto('/?scenario=race-local-kart-3&item=star&paused=1');
    await page.waitForFunction(() => window.__game?.ready === true);
    const state = await getState(page);
    expect(state.karts[3]!.item.held).toBe('star');
    expect(state.karts[0]!.item.held).toBeNull();
    await expect(page.locator('.hud-item')).toHaveAttribute('data-item', 'star');
  });

  test('the keyboard drives kart 3', async ({ page }) => {
    await loadScenario(page, 'race-local-kart-3', { paused: true });
    await page.locator('#game').focus();
    await page.keyboard.down('w');
    const state = await step(page, 2);
    await page.keyboard.up('w');
    expect(state.karts[3]!.race.throttleSince).toBeDefined();
    expect(state.karts[0]!.race.throttleSince).toBeUndefined();
  });
});
