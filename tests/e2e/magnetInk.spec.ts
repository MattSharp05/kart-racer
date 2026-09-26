import { expect, test, type Page } from '@playwright/test';
import type { TestState } from '../../src/game/testApi';
import { loadScenario, setInput, step } from './helpers';

const hasEffect = (state: TestState, kartId: number, kind: string) =>
  state.karts[kartId]!.effects.some((e) => e.kind === kind);

/** Presses and releases the item button (2 ticks), holding the throttle. */
async function useItem(page: Page) {
  await setInput(page, 0, { throttle: 1, item: true });
  await step(page, 1);
  await setInput(page, 0, { throttle: 1 });
  return step(page, 1);
}

// MK-68: Magnet and Ink Cloud.
test.describe('Magnet and Ink Cloud (MK-68)', () => {
  test('item-magnet: pulled to the kart ahead, takes its Mushroom on contact', async ({ page }) => {
    await loadScenario(page, 'item-magnet', { paused: true });
    const slot = page.locator('.hud-item');
    await expect(slot).toHaveAttribute('data-item', 'magnet');
    let state = await useItem(page);
    expect(hasEffect(state, 0, 'magnet')).toBe(true);
    expect(state.karts[1]!.item.held).toBe('mushroom');
    // It lasts 4 s at most; contact ends it sooner.
    for (let i = 0; i < 24 && hasEffect(state, 0, 'magnet'); i += 1) state = await step(page, 10);
    expect(hasEffect(state, 0, 'magnet')).toBe(false);
    expect(state.karts[0]!.item.held).toBe('mushroom');
    expect(state.karts[1]!.item.held).toBeNull();
    expect(state.karts.every((k) => k.spinTimer === 0)).toBe(true);
    await expect(slot).toHaveAttribute('data-item', 'mushroom');
  });

  test('item-ink: splats cover your screen, fade out, and never block the touch buttons', async ({
    page,
  }) => {
    await loadScenario(page, 'item-ink', { paused: true });
    await setInput(page, 0, { throttle: 1 });
    const ink = page.locator('.hud-screen-effects .ink-cloud-splats');
    await expect(ink).toHaveCount(0);
    // The AI behind uses its Ink Cloud about 1 s in. The wait runs in the page without drawing
    // (one round trip, not dozens of software-GL frames), then draws once for the HUD checks.
    await page.evaluate(() => {
      const game = window.__game!;
      const inked = () => game.getState().karts[0]!.effects.some((e) => e.kind === 'ink-cloud');
      game.step(60, { render: false });
      for (let i = 0; i < 40 && !inked(); i += 1) game.step(3, { render: false });
    });
    let state = await step(page, 0);
    expect(hasEffect(state, 0, 'ink-cloud')).toBe(true);
    expect(hasEffect(state, 1, 'ink-cloud')).toBe(true);
    expect(hasEffect(state, 2, 'ink-cloud')).toBe(false);
    await expect(ink).toBeVisible();
    await expect(ink).toHaveCSS('opacity', '1');
    await expect(ink).toHaveCSS('pointer-events', 'none');

    // Touch devices: a finger on each control still reaches it through the ink.
    if (await page.locator('.touch-controls').isVisible()) {
      const blocked = await page.evaluate(() =>
        ['.touch-steer', '.touch-drift', '.touch-item', '.touch-brake'].flatMap((sel) => {
          const el = document.querySelector(sel)!;
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return top && el.contains(top) ? [] : [`${sel} is covered by ${top?.className}`];
        }),
      );
      expect(blocked).toEqual([]);
    }

    // Near the end of the 4 s (sooner here: the boost pad on the straight wipes it 3× as fast) it
    // fades, then it's gone.
    const inkLeft = (s: TestState) =>
      s.karts[0]!.effects.find((e) => e.kind === 'ink-cloud')?.ticksLeft ?? 0;
    await page.evaluate(() => {
      const game = window.__game!;
      const left = () =>
        game.getState().karts[0]!.effects.find((e) => e.kind === 'ink-cloud')?.ticksLeft ?? 0;
      for (let i = 0; i < 60 && left() > 60; i += 1) game.step(4, { render: false });
    });
    state = await step(page, 0);
    expect(inkLeft(state)).toBeGreaterThan(0);
    const opacity = Number(await ink.evaluate((el) => getComputedStyle(el).opacity));
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
    state = await step(page, 60);
    expect(hasEffect(state, 0, 'ink-cloud')).toBe(false);
    await expect(ink).toHaveCount(0);
  });
});
