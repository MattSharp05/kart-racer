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
    await expect(page.locator('.race-status')).toContainText('WRONG WAY');
  });

  test('sunny-positions: 8 karts in lap-then-distance order', async ({ page }) => {
    await loadScenario(page, 'sunny-positions', { paused: true });
    const state = await step(page, 1);
    expect(state.positions).toEqual([3, 2, 1, 0, 7, 6, 5, 4]);
  });
});

test.describe('race flow', () => {
  test('race-countdown: 180 ticks later the race is on', async ({ page }) => {
    await loadScenario(page, 'race-countdown', { paused: true });
    const state = await step(page, 180);
    expect(state.phase).toBe('racing');
  });

  test('race-rocket-window: pressing W now gives a rocket start', async ({ page }) => {
    await loadScenario(page, 'race-rocket-window', { paused: true });
    await page.evaluate(() => window.__game!.setInput(0, { throttle: 1 }));
    await step(page, 20);
    const events: SimEvent[] = await page.evaluate(() => window.__game!.events());
    expect(events.some((e) => e.type === 'rocketStart')).toBe(true);
  });

  test('race-final-straight: crossing the line finishes and shows results', async ({ page }) => {
    await loadScenario(page, 'race-final-straight', { paused: true });
    await page.evaluate(() => window.__game!.setAutopilot(0, true));
    const state = await step(page, 360);
    expect(state.phase).toBe('finished');
    const results = page.locator('.race-results');
    await expect(results).toBeVisible();
    await expect(results.locator('li.you')).toContainText('(you)');
  });

  test('race-finished: results show 8 karts with you 3rd', async ({ page }) => {
    await loadScenario(page, 'race-finished', { paused: true });
    const rows = page.locator('.race-results li:not(.best)');
    await expect(rows).toHaveCount(8);
    await expect(page.locator('.race-results li.you')).toContainText('3rd');
  });
});

test('sunny-fall-off: the kart is picked up and put back on the road', async ({ page }) => {
  await loadScenario(page, 'sunny-fall-off', { paused: true });
  const state = await step(page, 180);
  const events: SimEvent[] = await page.evaluate(() => window.__game!.events());
  expect(events.some((e) => e.type === 'respawn')).toBe(true);
  expect(state.karts[0]!.grounded).toBe(true);
  expect(state.karts[0]!.respawnTimer).toBe(0);
});

test('race-full-100cc: after the countdown all 8 karts race and positions change', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await loadScenario(page, 'race-full-100cc', { paused: true });
  await page.evaluate(() => window.__game!.setAutopilot(0, true));
  await step(page, 180);
  await page.evaluate(() => window.__game!.events());
  const state = await step(page, 600);
  for (const kart of state.karts) expect(Math.abs(kart.speed)).toBeGreaterThan(5);
  const events: SimEvent[] = await page.evaluate(() => window.__game!.events());
  expect(events.some((e) => e.type === 'positionChange')).toBe(true);
});
