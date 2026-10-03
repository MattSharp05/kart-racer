import { expect, type Page } from '@playwright/test';
import { loadScenario, step } from '../e2e/helpers';

// MK-127: shared by the MK8 race HUD's screenshot specs (desktop and phones). CI has no pack (ADR
// 0009), so the baselines show our item icons and racer paint in place of the pack's sprites.

const frame = (page: Page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

export async function hudShot(page: Page, name: string, ticks: number, shot: string) {
  await loadScenario(page, name, { paused: true });
  await page.evaluate(async () => {
    await window.__mk8?.hud?.ready;
    await document.fonts.ready;
  });
  if (ticks > 0) await step(page, ticks);
  await frame(page);
  await frame(page);
  await expect(page).toHaveScreenshot(shot);
}

/** Scenario, ticks to step, baseline name. */
export const HUD_SHOTS: [string, number, string][] = [
  ['mk8-hud-roulette', 0, 'mk8-hud-roulette-spin'],
  // 0.7 s of spin, then the 18-tick landing bounce: settled on the item.
  ['mk8-hud-roulette', 70, 'mk8-hud-roulette-landed'],
  ['mk8-hud-two-slots', 0, 'mk8-hud-two-slots'],
  // Final lap, 1st, 10 coins.
  ['mk8-hud-final-lap', 1, 'mk8-hud-final-lap'],
  ['mk8-hud-countdown', 70, 'mk8-hud-countdown'],
];
