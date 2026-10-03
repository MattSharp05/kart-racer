import { expect, test } from '@playwright/test';
import { loadScenario, step } from '../e2e/helpers';
import { servePack } from '../e2e/mk8';

const frame = (page: import('@playwright/test').Page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

// MK-103: every reskinned MK8 item drawn with its pack model. CI has only the synthetic fixture
// pack (ADR 0009), so the baseline shows its stand-in shapes; the real models are checked locally.
test('mk8-items-lineup (paused)', async ({ page }) => {
  await servePack(page);
  await loadScenario(page, 'mk8-items-lineup', { paused: true });
  await frame(page);
  await frame(page);
  await expect(page).toHaveScreenshot('mk8-items-lineup.png');
});

// MK-112: triple shells circling the player and triple bananas trailing it (one tick in, once the
// race has MK8's items and placed them), drawn with the fixture pack's models.
for (const item of ['triple-red', 'triple-banana']) {
  test(`mk8-item-${item} (paused)`, async ({ page }) => {
    await servePack(page);
    await loadScenario(page, `mk8-item-${item}`, { paused: true });
    await step(page, 1);
    await frame(page);
    await frame(page);
    await expect(page).toHaveScreenshot(`mk8-item-${item}.png`);
  });
}

// MK-113: the Spiny Shell diving on the leader (the player, holding a Super Horn), late in its
// drop, with the HUD's incoming warning; the fixture pack's stand-in blue shell.
test('mk8-item-spiny-dive (paused)', async ({ page }) => {
  await servePack(page);
  await loadScenario(page, 'mk8-item-horn-vs-spiny', { paused: true });
  let state = await step(page, 1);
  const diving = (s: typeof state) =>
    s.entities.some((e) => e.kind === 'item' && e.spec === 'spiny-shell' && e.data[0] === 2);
  for (let i = 0; i < 24 && !diving(state); i += 1) state = await step(page, 5);
  expect(diving(state)).toBe(true);
  // About 90 % of the way through its 1.4 s dive: dropping onto the kart.
  await step(page, 72);
  await frame(page);
  await frame(page);
  await expect(page).toHaveScreenshot('mk8-item-spiny-dive.png');
});
