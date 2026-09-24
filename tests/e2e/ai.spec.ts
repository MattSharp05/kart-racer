import { expect, test } from '@playwright/test';
import type { SimEvent } from '../../src/sim/types';
import { step } from './helpers';

test('ai-drift-corner&ai-debug=1: an AI drifts through the hairpin for a mini-turbo', async ({
  page,
}) => {
  await page.goto('/?scenario=ai-drift-corner&paused=1&ai-debug=1');
  await page.waitForFunction(() => window.__game?.ready === true);
  await expect(page.locator('.ai-debug')).toContainText('#1 ×');
  await step(page, 480);
  const events: SimEvent[] = await page.evaluate(() => window.__game!.events());
  expect(events.some((e) => e.type === 'miniTurbo' && e.kartId > 0)).toBe(true);
});

test('ai-holding-green: within 180 ticks the AI has fired a green shell', async ({ page }) => {
  await page.goto('/?scenario=ai-holding-green&paused=1');
  await page.waitForFunction(() => window.__game?.ready === true);
  await step(page, 180);
  const events: SimEvent[] = await page.evaluate(() => window.__game!.events());
  expect(events).toContainEqual(
    expect.objectContaining({ type: 'itemUsed', kartId: 1, item: 'green' }),
  );
});
