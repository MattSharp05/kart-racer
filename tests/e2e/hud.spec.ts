import { expect, test } from '@playwright/test';
import { loadScenario, step } from './helpers';

test.describe('HUD', () => {
  test('race-final-straight: lap 3/3 and the position from state', async ({ page }) => {
    await loadScenario(page, 'race-final-straight', { paused: true });
    const state = await step(page, 1);
    await expect(page.locator('.hud-lap')).toContainText('3/3');
    const position = state.positions.indexOf(0) + 1;
    await expect(page.locator('.hud-position')).toHaveAttribute('data-position', String(position));
  });

  test('item-roulette: the slot spins, then shows the granted item', async ({ page }) => {
    await loadScenario(page, 'item-roulette', { paused: true });
    await expect(page.locator('.hud-item')).toHaveClass(/rolling/);
    const state = await step(page, 60);
    const held = state.karts[0]!.item.held;
    expect(held).not.toBeNull();
    await expect(page.locator('.hud-item')).not.toHaveClass(/rolling/);
    await expect(page.locator('.hud-item')).toHaveAttribute('data-item', held!);
    await expect(page.locator('.hud-item svg')).toBeVisible();
  });

  test('hud-mid-race: lap 2, 4th, red shell, 8 minimap dots', async ({ page }) => {
    await loadScenario(page, 'hud-mid-race', { paused: true });
    await expect(page.locator('.hud-lap')).toContainText('2/3');
    await expect(page.locator('.hud-position')).toHaveAttribute('data-position', '4');
    await expect(page.locator('.hud-item')).toHaveAttribute('data-item', 'red');
    await expect(page.locator('.hud-minimap .hud-dot')).toHaveCount(8);
  });

  test('phones: HUD fits and does not overlap the touch controls', async ({ page }, info) => {
    test.skip(!['iphone-landscape', 'pixel-landscape'].includes(info.project.name));
    await loadScenario(page, 'hud-mid-race', { paused: true });
    await expect(page.locator('.touch-controls')).toBeVisible();
    const rects = await page.evaluate(() => {
      const box = (el: Element) => el.getBoundingClientRect().toJSON() as DOMRect;
      const hud = [
        ...document.querySelectorAll(
          '.hud-lap, .hud-timer, .hud-item, .hud-position, .hud-minimap, .pause-button',
        ),
      ]
        .filter((el) => (el as HTMLElement).offsetParent !== null || el.tagName === 'svg')
        .map((el) => ({ name: el.className.toString(), ...box(el) }));
      const touch = [...document.querySelectorAll('.touch-button, .touch-stick')].map((el) => ({
        name: el.className,
        ...box(el),
      }));
      return { hud, touch, w: window.innerWidth, h: window.innerHeight };
    });
    const overlaps = (a: DOMRect, b: DOMRect) =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    for (const h of rects.hud) {
      expect(h.left, h.name).toBeGreaterThanOrEqual(0);
      expect(h.top, h.name).toBeGreaterThanOrEqual(0);
      expect(h.right, h.name).toBeLessThanOrEqual(rects.w);
      expect(h.bottom, h.name).toBeLessThanOrEqual(rects.h);
      for (const t of rects.touch) expect(overlaps(h, t), `${h.name} vs ${t.name}`).toBe(false);
    }
    // HUD pieces don't overlap each other either.
    for (const [i, a] of rects.hud.entries()) {
      for (const b of rects.hud.slice(i + 1)) {
        expect(overlaps(a, b), `${a.name} vs ${b.name}`).toBe(false);
      }
    }
  });
});
