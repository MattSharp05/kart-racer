import { expect, test, type Page } from '@playwright/test';
import { getState, loadScenario, setInput, step } from './helpers';
import { servePack } from './mk8';

// MK-103: MK8 races' items. The pack is local only (ADR 0009): the item models here come from the
// synthetic fixture pack (`fixtures/mk8-pack/models/items/`), or from no pack at all, as on Vercel.

function pageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test.describe('MK8 items', () => {
  test('second slot: holding a shell, a box fills slot 2; firing moves it up to slot 1', async ({
    page,
  }) => {
    const errors = pageErrors(page);
    await loadScenario(page, 'mk8-two-slots', { paused: true });
    let kart = (await getState(page)).karts[0]!;
    expect(kart.item.held).toBe('green');
    expect(kart.item.second).toEqual({ held: null, uses: 0, roulette: 0 });
    await expect(page.locator('.hud-item2')).toBeVisible();

    // Coast into the boxes 40 m ahead, then let the roulette land.
    for (let i = 0; i < 10 && !(await getState(page)).karts[0]!.item.second!.held; i += 1) {
      await step(page, 60);
    }
    kart = (await getState(page)).karts[0]!;
    expect(kart.item.held).toBe('green');
    const second = kart.item.second!.held;
    expect(second).not.toBeNull();
    await expect(page.locator('.hud-item2')).toHaveAttribute('data-item', second!);

    await setInput(page, 0, { item: true });
    await step(page, 1);
    kart = (await getState(page)).karts[0]!;
    expect(kart.item.held).toBe(second);
    expect(kart.item.second).toEqual({ held: null, uses: 0, roulette: 0 });
    await expect(page.locator('.hud-item')).toHaveAttribute('data-item', second!);
    await expect(page.locator('.hud-item2')).toHaveAttribute('data-item', '');
    expect(errors).toEqual([]);
  });

  test("the lineup loads the pack's item models", async ({ page }) => {
    const errors = pageErrors(page);
    const pack = await servePack(page);
    await loadScenario(page, 'mk8-items-lineup', { paused: true });
    for (const model of ['item-box', 'banana', 'green-shell', 'red-shell', 'lightning']) {
      expect(pack.requested).toContain(`models/items/${model}.glb`);
    }
    expect(errors).toEqual([]);
  });

  test('without a pack, MK8 races still run, with our items', async ({ page }) => {
    const errors = pageErrors(page);
    await loadScenario(page, 'mk8-two-slots');
    // Unpaused: the race runs once MK8 Mode's item set is in, pack or no pack.
    await expect
      .poll(async () => (await getState(page)).tick, { timeout: 10_000 })
      .toBeGreaterThan(30);
    expect(errors).toEqual([]);
  });
});
