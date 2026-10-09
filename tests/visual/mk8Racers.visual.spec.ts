import { expect, test } from '@playwright/test';
import { loadScenario } from '../e2e/helpers';
import { servePack } from '../e2e/mk8';

// MK-101: the MK8 racer lineup and Lakitu's start light, drawn from the fixture pack's block
// figures (CI never has the real, local-only pack: no Nintendo model is in these screenshots).

test('mk8-racers-lineup (fixture pack, paused)', async ({ page }) => {
  await servePack(page);
  await loadScenario(page, 'mk8-racers-lineup', { paused: true });
  await expect(page.locator('.mk8-stage-label')).toHaveCount(12);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot('mk8-racers-lineup.png');
});

// QA round 2: one racer up close, seated (legs and arms bent out of the T-pose at load).
test('mk8-racer-motion at rest: the racer sits in its kart (fixture pack, paused)', async ({
  page,
}) => {
  await servePack(page);
  await loadScenario(page, 'mk8-racer-motion', { paused: true });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot('mk8-racer-seated.png');
});

test('mk8-lakitu-countdown at two red lamps (fixture pack, paused)', async ({ page }) => {
  await servePack(page);
  await loadScenario(page, 'mk8-lakitu-countdown', { paused: true });
  await page.evaluate(() => window.__mk8?.stage?.step(90));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot('mk8-lakitu-countdown.png');
});

// MK-102: the 6 kart bodies, each on its own tires at its wheel anchors, gliders folded away.
test('mk8-karts-lineup (fixture pack, paused)', async ({ page }) => {
  await servePack(page);
  await loadScenario(page, 'mk8-karts-lineup', { paused: true });
  await expect(page.locator('.mk8-stage-label')).toHaveCount(6);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page).toHaveScreenshot('mk8-karts-lineup.png');
});
