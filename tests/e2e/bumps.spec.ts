import { expect, test } from '@playwright/test';
import type { SimEvent } from '../../src/sim/types';
import { loadScenario, setInput, step } from './helpers';

test('bump-side: converging karts bump and end up apart', async ({ page }) => {
  await loadScenario(page, 'bump-side', { paused: true });
  await setInput(page, 0, { throttle: 1 });
  const state = await step(page, 45);
  const events: SimEvent[] = await page.evaluate(() => window.__game!.events());
  expect(events.some((e) => e.type === 'bump')).toBe(true);
  const [a, b] = state.karts;
  expect(Math.hypot(a!.position.x - b!.position.x, a!.position.z - b!.position.z)).toBeGreaterThan(
    1.5,
  );
});
