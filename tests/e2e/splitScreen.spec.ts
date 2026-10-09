import { expect, test, type Page } from '@playwright/test';
import type { RenderInfo } from '../../src/game/testApi';
import { getState, loadScenario, step } from './helpers';

/** Countdown (3 s) and a moment more, in ticks. */
const PAST_GO = 4 * 60 + 30;

function renderInfo(page: Page): Promise<RenderInfo> {
  return page.evaluate(() => window.__game!.renderInfo());
}

/** Waits for two real frames, so the views and renderer stats describe the current state. */
function frames(page: Page): Promise<unknown> {
  return page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

const half = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

// MK-145: a view per local player on one screen, each with its own chase camera and HUD.
test.describe('split-screen (MK-145)', () => {
  test('one player keeps the whole screen: no split views, one HUD', async ({ page }) => {
    await loadScenario(page, 'race-countdown', { paused: true });
    await frames(page);
    const info = await renderInfo(page);
    expect(info.views).toEqual([]);
    expect(info.steppedDown).toBe(false);
    await expect(page.locator('.hud')).toHaveCount(1);
    await expect(page.locator('.hud.hud-view')).toHaveCount(0);
  });

  test('local-2p: top and bottom, each camera behind its own kart', async ({ page }) => {
    await loadScenario(page, 'local-2p', { paused: true });
    await page.evaluate(() => window.__game!.setAutopilot(0, true));
    const state = await step(page, PAST_GO + 120);
    await frames(page);
    const { views, steppedDown } = await renderInfo(page);
    expect(views!.map((v) => [v.slot, v.kartId])).toEqual([
      [0, 0],
      [1, 1],
    ]);
    expect(views![0]!.rect).toEqual(half(0, 0, 1, 0.5));
    expect(views![1]!.rect).toEqual(half(0, 0.5, 1, 0.5));
    expect(steppedDown).toBe(false);
    for (const view of views!) {
      const kart = state.karts[view.kartId]!;
      const d = Math.hypot(view.camera.x - kart.position.x, view.camera.z - kart.position.z);
      // The chase camera sits ~6.5 m behind its kart, never at another kart's.
      expect(d, `P${view.slot + 1}'s camera to its kart`).toBeGreaterThan(3);
      expect(d, `P${view.slot + 1}'s camera to its kart`).toBeLessThan(12);
      // A wide view: twice the screen's aspect.
      expect(view.camera.aspect).toBeGreaterThan(2);
    }
    const huds = page.locator('.hud.hud-view');
    await expect(huds).toHaveCount(2);
    await expect(huds.nth(0).locator('.hud-player')).toHaveText('P1');
    await expect(page.locator('.hud.hud-view[data-player="P2"] .hud-player')).toHaveText('P2');
    // Each HUD in its half of the screen.
    const box = await page.locator('.hud.hud-view[data-player="P2"]').boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.y).toBeCloseTo(viewport.height / 2, 0);
    expect(box!.height).toBeCloseTo(viewport.height / 2, 0);
  });

  test('local-2p-side: side by side, tall views', async ({ page }) => {
    await loadScenario(page, 'local-2p-side', { paused: true });
    await frames(page);
    const { views } = await renderInfo(page);
    expect(views!.map((v) => v.rect)).toEqual([half(0, 0, 0.5, 1), half(0.5, 0, 0.5, 1)]);
    expect(views![0]!.camera.aspect).toBeLessThan(1.2);
  });

  test('local-3p: three quadrants, the race overview in the fourth', async ({ page }) => {
    await loadScenario(page, 'local-3p', { paused: true });
    await frames(page);
    const info = await renderInfo(page);
    expect(info.views!.map((v) => v.kartId)).toEqual([0, 1, 2]);
    expect(info.views!.map((v) => v.rect)).toEqual([
      half(0, 0, 0.5, 0.5),
      half(0.5, 0, 0.5, 0.5),
      half(0, 0.5, 0.5, 0.5),
    ]);
    expect(info.steppedDown).toBe(true);
    await expect(page.locator('.hud.hud-view[data-player]')).toHaveCount(3);
    // Quarter views leave the map to the overview quadrant: the running order, players marked.
    await expect(page.locator('.hud.hud-view .hud-minimap').first()).toBeHidden();
    const overview = page.locator('.hud-overview');
    await expect(overview).toBeVisible();
    await expect(overview.locator('.hud-overview-order li')).toHaveCount(8);
    await expect(overview.locator('.hud-overview-order li[data-player]')).toHaveCount(3);
    await expect(overview.locator('.hud-overview-marker', { hasText: 'P2' })).toBeVisible();
  });

  test('local-4p: four views and HUDs, each showing its own player', async ({ page }) => {
    await loadScenario(page, 'local-4p', { paused: true });
    await page.evaluate(() => window.__game!.setAutopilot(0, true));
    await step(page, PAST_GO + 300);
    await frames(page);
    const state = await getState(page);
    const info = await renderInfo(page);
    expect(info.views!.map((v) => v.kartId)).toEqual([0, 1, 2, 3]);
    expect(info.steppedDown).toBe(true);
    expect(info.pixelRatio).toBeLessThanOrEqual(1);
    const huds = page.locator('.hud.hud-view');
    await expect(huds).toHaveCount(4);
    for (const slot of [0, 1, 2, 3]) {
      const hud = page.locator(`.hud.hud-view[data-player="P${slot + 1}"]`);
      await expect(hud).toBeVisible();
      const position = state.positions.indexOf(slot) + 1;
      await expect(hud.locator('.hud-position')).toHaveAttribute('data-position', String(position));
    }
  });

  test('a pause menu hides every view HUD; leaving the race goes back to one view', async ({
    page,
  }) => {
    await loadScenario(page, 'local-4p');
    await expect(page.locator('.hud.hud-view[data-player]')).toHaveCount(4);
    await page.keyboard.press('Escape');
    await expect(page.locator('.menu-paused')).toBeVisible();
    for (const hud of await page.locator('.hud.hud-view').all()) await expect(hud).toBeHidden();
    await page.locator('.menu-paused button', { hasText: 'Quit' }).click();
    await expect.poll(async () => (await renderInfo(page)).views).toEqual([]);
    expect((await renderInfo(page)).steppedDown).toBe(false);
  });
});

test('race setup: the Screen option shows with 2 players and splits the race side by side', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await loadScenario(page, 'local-setup');
  const select = page.locator('.menu-racerSelect');
  await expect(select.locator('.split-option button[aria-pressed="true"]')).toHaveAttribute(
    'data-split',
    'stacked',
  );
  await select.locator('.split-option button[data-split="side"]').click();
  await expect(select.locator('.split-option button[aria-pressed="true"]')).toHaveAttribute(
    'data-split',
    'side',
  );
  await select.locator('.players-option button[data-players="3"]').click();
  await expect(select.locator('.split-option')).toHaveCount(0);
  await select.locator('.players-option button[data-players="2"]').click();
  // P1 then P2 choose their racers.
  await select.locator('button.primary').click();
  await expect(select.locator('h2')).toHaveText('P2, choose your racer');
  await select.locator('button.primary').click();
  await page.locator('.menu-ccSelect button', { hasText: '100' }).click();
  await page.locator('.menu-trackSelect button.primary').click();
  await expect(page.locator('.menus .menu-panel')).toHaveCount(0);
  await expect
    .poll(async () => (await renderInfo(page)).views?.map((v) => v.rect.w))
    .toEqual([0.5, 0.5]);
});
