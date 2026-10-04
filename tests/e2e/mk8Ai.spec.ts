import { expect, test } from '@playwright/test';
import type { SimEvent } from '../../src/sim/types';

// MK-128: the AI on MK8 courses, on the synthetic test ramp (no pack): `?ai-debug=1` follows the
// MK8 AI (target ball, glide / anti-gravity / coins in its panel), and it drifts and glides.
test('mk8-test-race&ai-debug=1: the MK8 AI drifts and glides, and the overlay follows it', async ({
  page,
}) => {
  await page.goto('/?scenario=mk8-test-race&paused=1&ai-debug=1');
  await page.waitForFunction(() => window.__game?.ready === true);
  await expect(page.locator('.ai-debug')).toContainText('#1 ×');
  // Countdown, then about a lap.
  const events: SimEvent[] = await page.evaluate(() => {
    const game = window.__game!;
    const seen: SimEvent[] = [];
    for (let i = 0; i < 30; i += 1) {
      game.step(60, { render: i % 10 === 0 });
      seen.push(...game.events());
    }
    return seen;
  });
  const ai = (type: SimEvent['type']) =>
    events.some((e) => e.type === type && 'kartId' in e && e.kartId > 0);
  expect(ai('driftStart')).toBe(true);
  expect(ai('glideOpen')).toBe(true);
  await expect(page.locator('.ai-debug')).toContainText('c');
});
