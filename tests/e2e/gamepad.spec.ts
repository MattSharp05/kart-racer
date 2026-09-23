import { expect, test } from '@playwright/test';
import { getState, loadScenario, step } from './helpers';

/** Fakes a standard-layout pad with the right trigger held and the stick pushed right. */
async function fakeGamepad(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, (_, i) => ({
      pressed: i === 7,
      touched: i === 7,
      value: i === 7 ? 1 : 0,
    }));
    const pad = {
      id: 'Fake standard pad',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      axes: [0.8, 0, 0, 0],
      buttons,
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad, null, null, null] });
  });
}

test('a connected gamepad drives the kart (RT throttle, stick steers right)', async ({ page }) => {
  await fakeGamepad(page);
  await loadScenario(page, 'test-pad', { paused: true });
  await step(page, 60);
  const kart = (await getState(page)).karts[0]!;
  expect(kart.speed).toBeGreaterThan(5);
  expect(kart.heading).toBeLessThan(0);
});
