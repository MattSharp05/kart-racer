import { expect, test } from '@playwright/test';
import { loadScenario, setInput, step } from '../e2e/helpers';

const frame = (page: import('@playwright/test').Page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

// MK-67: the Hornet Swarm icon, the swarm in flight and the HUD incoming warning.
test('hornet-swarm HUD icon (paused)', async ({ page }) => {
  await loadScenario(page, 'item-hornet-swarm', { paused: true });
  const slot = page.locator('.hud-item');
  await expect(slot).toHaveAttribute('data-item', 'hornet-swarm');
  await frame(page);
  await expect(slot).toHaveScreenshot('hornet-swarm-icon.png');
});

test('hornet swarm in flight (paused)', async ({ page }) => {
  await loadScenario(page, 'item-hornet-swarm', { paused: true });
  await setInput(page, 0, { throttle: 1, item: true });
  await step(page, 1);
  await setInput(page, 0, { throttle: 1 });
  await step(page, 12);
  await frame(page);
  await expect(page).toHaveScreenshot('hornet-swarm-flight.png');
});

test('incoming warning while hornets chase you (paused)', async ({ page }) => {
  await loadScenario(page, 'item-hornet-swarm-incoming', { paused: true });
  await setInput(page, 0, { throttle: 1 });
  await step(page, 135);
  const incoming = page.locator('.hud-incoming');
  await expect(incoming).toBeVisible();
  await frame(page);
  await expect(page).toHaveScreenshot('hornet-swarm-incoming.png');
});
