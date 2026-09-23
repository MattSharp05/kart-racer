import { expect, test } from '@playwright/test';
import type { SimEvent } from '../../src/sim/types';
import { getState, loadScenario, step } from './helpers';

test.describe('laps and positions', () => {
  test('sunny-last-checkpoint: crossing the line starts lap 2', async ({ page }) => {
    await loadScenario(page, 'sunny-last-checkpoint', { paused: true });
    await page.evaluate(() => window.__game!.setAutopilot(0, true));
    await step(page, 120);
    const events: SimEvent[] = await page.evaluate(() => window.__game!.events());
    expect(events).toContainEqual(expect.objectContaining({ type: 'lap', kartId: 0, lap: 2 }));
    expect((await getState(page)).karts[0]!.race.lap).toBe(2);
  });

  test('sunny-wrong-way: WRONG WAY shows after driving backwards', async ({ page }) => {
    await loadScenario(page, 'sunny-wrong-way', { paused: true });
    await page.evaluate(() => window.__game!.setInput(0, { throttle: 1 }));
    await step(page, 100);
    expect((await getState(page)).karts[0]!.race.wrongWay).toBe(true);
    await expect(page.locator('.race-debug')).toContainText('WRONG WAY');
  });

  test('sunny-positions: 8 karts in lap-then-distance order', async ({ page }) => {
    await loadScenario(page, 'sunny-positions', { paused: true });
    const state = await step(page, 1);
    expect(state.positions).toEqual([3, 2, 1, 0, 7, 6, 5, 4]);
  });
});
