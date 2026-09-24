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
