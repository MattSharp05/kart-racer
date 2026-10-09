import { expect, test } from '@playwright/test';
import { loadScenario, step } from '../e2e/helpers';

/** GO plus a few seconds of racing: every kart on its autopilot, spread out a little. */
const RACING = 60 * 8;

// MK-145: a baseline per split-screen layout, each view's camera and HUD on its own player.
for (const scenario of ['local-2p', 'local-2p-side', 'local-3p', 'local-4p']) {
  test(`${scenario}: one view and HUD per player (MK-145)`, async ({ page }) => {
    await loadScenario(page, scenario, { paused: true });
    await page.evaluate(() => window.__game!.setAutopilot(0, true));
    await step(page, RACING);
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    await expect(page).toHaveScreenshot(`split-${scenario}.png`);
  });
}

test('race setup with 2 players shows the Screen option (MK-145)', async ({ page }) => {
  await loadScenario(page, 'local-setup', { paused: true });
  await expect(page.locator('.split-option')).toBeVisible();
  await expect(page.locator('.menu-racerSelect')).toHaveScreenshot('split-option.png');
});
