import { expect, test } from '@playwright/test';
import type { SimEvent } from '../../src/sim/types';
import { loadScenario, step } from './helpers';

test.describe('banana', () => {
  test('banana-ahead: driving forward 60 ticks spins the player out', async ({ page }) => {
    await loadScenario(page, 'banana-ahead', { paused: true });
    await page.evaluate(() => window.__game!.setInput(0, { throttle: 1 }));
    const state = await step(page, 60);
    const events: SimEvent[] = await page.evaluate(() => window.__game!.events());
    expect(events).toContainEqual(expect.objectContaining({ type: 'kartHit', kartId: 0 }));
    expect(state.karts[0]!.spinTimer).toBeGreaterThan(0);
  });

  test('&item=banana: using it leaves a banana behind the kart', async ({ page }) => {
    await page.goto('/?scenario=sunny-start&paused=1&item=banana');
    await page.waitForFunction(() => window.__game?.ready === true);
    await page.evaluate(() => window.__game!.setInput(0, { item: true }));
    const state = await step(page, 2);
    expect(state.entities.filter((e) => e.kind === 'banana')).toHaveLength(1);
    expect(state.karts[0]!.item.held).toBeNull();
  });
});
