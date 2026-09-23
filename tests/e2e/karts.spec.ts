import { expect, test } from '@playwright/test';
import { getState, loadScenario } from './helpers';

test.describe('karts', () => {
  test('kart-lineup shows all four karts', async ({ page }) => {
    await loadScenario(page, 'kart-lineup', { paused: true });
    const state = await getState(page);
    expect(state.karts.map((k) => k.kartType)).toEqual(['maple', 'pixie', 'boulder', 'swoop']);
  });

  test('&kart=boulder drives the test pad as Boulder', async ({ page }) => {
    await page.goto('/?scenario=test-pad&paused=1&kart=boulder');
    await page.waitForFunction(() => window.__game?.ready === true);
    expect((await getState(page)).karts[0]!.kartType).toBe('boulder');
  });

  test('an unknown kart shows a banner listing the valid karts', async ({ page }) => {
    await page.goto('/?scenario=test-pad&paused=1&kart=nope');
    await expect(page.getByRole('alert')).toContainText('pixie');
  });
});
