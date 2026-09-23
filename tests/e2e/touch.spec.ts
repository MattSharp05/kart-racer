import { expect, test } from '@playwright/test';
import type { SimEvent } from '../../src/sim/types';
import { loadScenario, step } from './helpers';

const isPhone = (name: string) => name === 'iphone-landscape' || name === 'pixel-landscape';

test.describe('touch controls', () => {
  test('desktop: touch controls are hidden', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-chrome');
    await loadScenario(page, 'sunny-start', { paused: true });
    await expect(page.locator('.touch-controls')).toBeHidden();
  });

  test('phones: controls show; holding Drift hops, Item uses the item (mushroom boost)', async ({
    page,
  }, info) => {
    test.skip(!isPhone(info.project.name));
    await page.goto('/?scenario=sunny-start&paused=1&item=mushroom');
    await page.waitForFunction(() => window.__game?.ready === true);
    await expect(page.locator('.touch-controls')).toBeVisible();

    await page.locator('.touch-drift').dispatchEvent('pointerdown', { pointerId: 2 });
    await step(page, 2);
    const events: SimEvent[] = await page.evaluate(() => window.__game!.events());
    expect(events).toContainEqual(expect.objectContaining({ type: 'hop', kartId: 0 }));
    await page.locator('.touch-drift').dispatchEvent('pointerup', { pointerId: 2 });

    await page.locator('.touch-item').dispatchEvent('pointerdown', { pointerId: 3 });
    const state = await step(page, 2);
    expect(state.karts[0]!.item.held).toBeNull();
    expect(state.karts[0]!.boostTimer).toBeGreaterThan(1);
  });

  test('phones: nothing overlaps the touch buttons, and the page does not scroll', async ({
    page,
  }, info) => {
    test.skip(!isPhone(info.project.name));
    await loadScenario(page, 'sunny-start', { paused: true });
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - window.innerWidth,
      y: document.documentElement.scrollHeight - window.innerHeight,
    }));
    expect(overflow.x).toBeLessThanOrEqual(0);
    expect(overflow.y).toBeLessThanOrEqual(0);
    const buttons = await page
      .locator('.touch-button')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect));
    const vw = page.viewportSize()!;
    for (const b of buttons) {
      expect(b.width).toBeGreaterThanOrEqual(56);
      expect(b.right).toBeLessThanOrEqual(vw.width);
      expect(b.bottom).toBeLessThanOrEqual(vw.height);
    }
  });

  test('phones in portrait: rotate prompt shows and the game pauses', async ({ page }, info) => {
    test.skip(!isPhone(info.project.name));
    await loadScenario(page, 'sunny-start');
    const vw = page.viewportSize()!;
    await page.setViewportSize({ width: vw.height, height: vw.width });
    await expect(page.locator('.rotate-prompt')).toBeVisible();
    expect(await page.evaluate(() => window.__game!.isPaused())).toBe(true);
    await page.setViewportSize(vw);
    await expect(page.locator('.rotate-prompt')).toBeHidden();
    expect(await page.evaluate(() => window.__game!.isPaused())).toBe(false);
  });
});
