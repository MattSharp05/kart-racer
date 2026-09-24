import { expect, test } from '@playwright/test';
import type { SimEvent } from '../../src/sim/types';
import { loadScenario, step } from './helpers';

test('green-shell-target: firing hits the parked kart within 90 ticks', async ({ page }) => {
  await loadScenario(page, 'green-shell-target', { paused: true });
  await page.evaluate(() => window.__game!.setInput(0, { item: true }));
  await step(page, 90);
  const events: SimEvent[] = await page.evaluate(() => window.__game!.events());
  expect(events).toContainEqual(expect.objectContaining({ type: 'kartHit', kartId: 1, by: 0 }));
});

test('&item=green: using it launches a shell', async ({ page }) => {
  await page.goto('/?scenario=sunny-start&paused=1&item=green');
  await page.waitForFunction(() => window.__game?.ready === true);
  await page.evaluate(() => window.__game!.setInput(0, { item: true }));
  const state = await step(page, 2);
  expect(state.entities.some((e) => e.kind === 'shell')).toBe(true);
});

test('red-shell-target: the red shell homes in and hits the kart ahead', async ({ page }) => {
  await loadScenario(page, 'red-shell-target', { paused: true });
  await page.evaluate(() => window.__game!.setInput(0, { item: true }));
  await step(page, 2);
  await page.evaluate(() => window.__game!.setInput(0, {}));
  await step(page, 360);
  const events: SimEvent[] = await page.evaluate(() => window.__game!.events());
  expect(events).toContainEqual(
    expect.objectContaining({ type: 'kartHit', kartId: 1, by: 0, kind: 'red' }),
  );
});
