import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';

// MK-130: an MK8 Grand Prix's standings after race 2 and the podium after race 4 on phones
// (`&paused=1`: the standings' end at once, the podium's confetti still). No pack: stand-ins.
for (const [name, selector] of [
  ['mk8-gp-standings', '.mk8-scr-results[data-phase="done"]'],
  ['mk8-gp-podium', '.mk8-scr-podium[data-status="ready"]'],
] as const) {
  test(`${name} on phones (paused)`, async ({ page }, info) => {
    await loadScenario(page, name, { paused: true });
    await expect(page.locator(selector)).toBeVisible();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    await expect(page).toHaveScreenshot(`${name}-${info.project.name}.png`);
  });
}
