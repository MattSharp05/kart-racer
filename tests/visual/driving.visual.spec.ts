import { expect, test } from '@playwright/test';
import { loadScenario, setInput, step } from '../e2e/helpers';

test('angled wall hit: nose touches the wall, never inside it (MK-29)', async ({ page }) => {
  await loadScenario(page, 'test-pad-wall-angled', { paused: true });
  await setInput(page, 0, { throttle: 1 });
  await step(page, 45);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot('wall-angled.png');
});
