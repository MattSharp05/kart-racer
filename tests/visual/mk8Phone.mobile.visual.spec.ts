import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';
import { hudShot } from './mk8Hud';

// MK-134: the MK8 screens without a phone baseline yet (MK-131's VS settings, Time Trial course
// cards and results, MK-97/MK-135's pack screens) and the Time Trial HUD in both touch hands. No
// pack: stand-ins and fixture content only. Reduced motion: the "New record!" banner holds still.
for (const [name, selector] of [
  ['mk8-vs-settings', '.mk8[data-transitioning="false"] .mk8-scr-vs'],
  ['mk8-tt-courses', '.mk8[data-transitioning="false"] .mk8-scr-cup'],
  ['mk8-tt-new-record', '.mk8-scr-results[data-phase="done"]'],
  ['mk8-not-installed', '.mk8-screen'],
  ['mk8-password', '.mk8-scr-password'],
] as const) {
  test(`${name} on phones (paused)`, async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loadScenario(page, name, { paused: true });
    await expect(page.locator(selector).first()).toBeVisible({ timeout: 10_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    await expect(page).toHaveScreenshot(`${name}-${info.project.name}.png`);
  });
}

for (const name of ['mk8-tt-splits', 'mk8-tt-left']) {
  test(`${name} HUD on phones (paused)`, async ({ page }, info) => {
    await hudShot(page, name, 0, `${name}-${info.project.name}.png`);
  });
}
