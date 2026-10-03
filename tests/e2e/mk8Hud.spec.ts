import { expect, test, type Page } from '@playwright/test';
import { loadScenario, step } from './helpers';

// MK-127: MK8 Mode's race HUD on the synthetic test ramp (no pack: our item icons and racer paint
// stand in for the pack's sprites). `window.__mk8.sounds` records the MK8 sounds asked for.

const frame = (page: Page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
const sounds = (page: Page) => page.evaluate(() => [...(window.__mk8?.sounds ?? [])]);

async function open(page: Page, name: string) {
  await loadScenario(page, name, { paused: true });
  await page.evaluate(async () => {
    await window.__mk8?.hud?.ready;
  });
  await frame(page);
}

test('mk8-hud-roulette: the reel spins, then lands on the item the race gave', async ({ page }) => {
  await open(page, 'mk8-hud-roulette');
  const slot = page.locator('.mk8-hud-item');
  await expect(slot).toHaveAttribute('data-state', 'spinning');
  await expect(slot).toHaveAttribute('data-item', 'roulette');
  // Our HUD's own pieces are hidden in an MK8 race.
  await expect(page.locator('.hud-item')).toBeHidden();
  const state = await step(page, 60);
  const held = state.karts[0]!.item.held;
  expect(held).not.toBeNull();
  await frame(page);
  await expect(slot).toHaveAttribute('data-item', held!);
  await expect(slot).toHaveAttribute('data-state', /landing|held/);
  await expect(slot.locator('.mk8-hud-cell').first().locator('svg, img')).toBeVisible();
  expect(await sounds(page)).toEqual(
    expect.arrayContaining(['race/item-roulette', 'race/item-decide']),
  );
});

test('mk8-hud-two-slots: triple greens ×2 and a banana in the second slot', async ({ page }) => {
  await open(page, 'mk8-hud-two-slots');
  await expect(page.locator('.mk8-hud-item')).toHaveAttribute('data-item', 'triple-green');
  await expect(page.locator('.mk8-hud-item .mk8-hud-count')).toHaveText('×2');
  await expect(page.locator('.mk8-hud-item2')).toHaveAttribute('data-item', 'banana');
  await expect(page.locator('.mk8-hud-item2')).toBeVisible();
});

test('mk8-hud-final-lap: 3/3, 1st, 10 coins, Lakitu’s FINAL LAP sign', async ({ page }) => {
  await open(page, 'mk8-hud-final-lap');
  await step(page, 1);
  await frame(page);
  await expect(page.locator('.mk8-hud-lap')).toHaveText('3/3');
  await expect(page.locator('.mk8-hud-position')).toHaveAttribute('data-position', '1');
  await expect(page.locator('.mk8-hud-position')).toHaveText('1st');
  await expect(page.locator('.mk8-hud-coins')).toHaveAttribute('data-coins', '10');
  await expect(page.locator('.mk8-hud-sign')).toHaveAttribute('data-sign', 'FINAL LAP');
  await expect(page.locator('.mk8-hud-sign')).toBeVisible();
  // A head on the minimap per racer, yours marked.
  await expect(page.locator('.mk8-hud-head')).toHaveCount(8);
  await expect(page.locator('.mk8-hud-head.you')).toHaveCount(1);
});

test('mk8-hud-countdown: 3, 2, 1, GO! under Lakitu’s light, with MK8’s sounds', async ({
  page,
}) => {
  await open(page, 'mk8-hud-countdown');
  const countdown = page.locator('.mk8-hud-countdown');
  await step(page, 1);
  await frame(page);
  await expect(countdown).toHaveAttribute('data-text', '3');
  await expect(page.locator('.mk8-hud-lamp[data-on="red"]')).toHaveCount(1);
  await step(page, 60);
  await frame(page);
  await expect(countdown).toHaveAttribute('data-text', '2');
  await expect(page.locator('.mk8-hud-lamp[data-on="red"]')).toHaveCount(2);
  await step(page, 125);
  await frame(page);
  await expect(countdown).toHaveAttribute('data-text', 'GO!');
  await expect(page.locator('.mk8-hud-lamp[data-on="green"]')).toHaveCount(3);
  expect(await sounds(page)).toEqual(expect.arrayContaining(['race/countdown', 'race/go']));
});

test('the HUD costs under 1 ms a frame', async ({ page }) => {
  await open(page, 'mk8-hud-roulette');
  for (let i = 0; i < 20; i += 1) {
    await step(page, 3);
    await frame(page);
  }
  const ms = await page.evaluate(() => window.__mk8!.hud!.frameMs());
  expect(ms).toBeGreaterThan(0);
  expect(ms).toBeLessThan(1);
});

test('phones: the MK8 HUD fits and does not overlap the touch controls', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone-landscape');
  await open(page, 'mk8-hud-final-lap');
  await step(page, 1);
  await frame(page);
  await expect(page.locator('.touch-controls')).toBeVisible();
  const rects = await page.evaluate(() => {
    const box = (el: Element) => el.getBoundingClientRect().toJSON() as DOMRect;
    const hud = [
      ...document.querySelectorAll(
        '.mk8-hud-item, .mk8-hud-item2, .mk8-hud-map, .mk8-hud-coins, .mk8-hud-lap, .mk8-hud-position, .mk8-hud-sign, .pause-button',
      ),
    ]
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({ name: el.className.toString(), ...box(el) }));
    const touch = [...document.querySelectorAll('.touch-button, .touch-stick')].map((el) => ({
      name: el.className,
      ...box(el),
    }));
    return { hud, touch, w: window.innerWidth, h: window.innerHeight };
  });
  const overlaps = (a: DOMRect, b: DOMRect) =>
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  expect(rects.hud.length).toBeGreaterThanOrEqual(7);
  for (const h of rects.hud) {
    expect(h.left, h.name).toBeGreaterThanOrEqual(0);
    expect(h.top, h.name).toBeGreaterThanOrEqual(0);
    expect(h.right, h.name).toBeLessThanOrEqual(rects.w);
    expect(h.bottom, h.name).toBeLessThanOrEqual(rects.h);
    for (const t of rects.touch) expect(overlaps(h, t), `${h.name} vs ${t.name}`).toBe(false);
  }
  // The pieces don't overlap each other either (the second slot sits on the item box's rim, as
  // in MK8, so that pair is left out).
  for (const [i, a] of rects.hud.entries()) {
    for (const b of rects.hud.slice(i + 1)) {
      if (a.name.includes('mk8-hud-item') && b.name.includes('mk8-hud-item')) continue;
      expect(overlaps(a, b), `${a.name} vs ${b.name}`).toBe(false);
    }
  }
});
