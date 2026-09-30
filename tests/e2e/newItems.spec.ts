import { expect, test, type Page } from '@playwright/test';
import { loadScenario, setInput, step } from './helpers';

/** Presses and releases the item button (2 ticks), holding `extra` inputs. */
async function useItem(page: Page, extra: Record<string, number> = {}) {
  await setInput(page, 0, { ...extra, item: true });
  await step(page, 1);
  await setInput(page, 0, extra);
  return step(page, 1);
}

// MK-65: Turbo Trio and Oil Slick.
test.describe('new items (MK-65)', () => {
  test('item-turbo-trio: three boosts, the slot shows 3 rockets → 2 → 1, then empties', async ({
    page,
  }) => {
    // One rocket body per boost left (MK-65 QA round 2), and no "×n" badge.
    const rockets = page.locator(
      '.hud-item svg path[fill="#ff8c1a"], .hud-item svg path[fill="#ffb703"]',
    );
    await loadScenario(page, 'item-turbo-trio', { paused: true });
    await expect(page.locator('.hud-item')).toHaveAttribute('data-item', 'turbo-trio');
    await expect(rockets).toHaveCount(3);
    await expect(page.locator('.hud-item-uses')).toHaveCount(0);

    let state = await useItem(page);
    expect(state.karts[0]!.boostTimer).toBeGreaterThan(0);
    expect(state.karts[0]!.item.uses).toBe(2);
    await expect(rockets).toHaveCount(2);

    await step(page, 120);
    state = await useItem(page);
    expect(state.karts[0]!.boostTimer).toBeGreaterThan(0);
    await expect(rockets).toHaveCount(1);
    await expect(page.locator('.hud-item')).toHaveAttribute('data-item', 'turbo-trio');

    await step(page, 120);
    state = await useItem(page);
    expect(state.karts[0]!.boostTimer).toBeGreaterThan(0);
    expect(state.karts[0]!.item.held).toBeNull();
    await expect(page.locator('.hud-item')).toHaveAttribute('data-item', '');
  });

  test('item-oil-slick: the AI behind drives through the slick and spins round as it slides (1.4 s)', async ({
    page,
  }) => {
    await loadScenario(page, 'item-oil-slick', { paused: true });
    await expect(page.locator('.hud-item')).toHaveAttribute('data-item', 'oil-slick');
    let state = await useItem(page, { throttle: 1 });
    const slicks = state.entities.filter((e) => e.kind === 'item' && e.spec === 'oil-slick');
    expect(slicks).toHaveLength(1);
    expect(state.karts[0]!.item.held).toBeNull();

    let oiled = false;
    for (let i = 0; i < 30 && !oiled; i += 1) {
      state = await step(page, 5);
      oiled = state.karts[1]!.effects.some((e) => e.kind === 'oil-slick');
    }
    expect(oiled).toBe(true);
    // Sliding and spinning round, not a spin-out stop.
    expect(state.karts[1]!.spinTimer).toBe(0);

    state = await step(page, 90);
    expect(state.karts[1]!.effects.some((e) => e.kind === 'oil-slick')).toBe(false);
    // The puddle is still there…
    expect(state.entities.some((e) => e.kind === 'item' && e.spec === 'oil-slick')).toBe(true);
    // …until 15 s after the drop.
    state = await step(page, 15 * 60);
    expect(state.entities.some((e) => e.kind === 'item' && e.spec === 'oil-slick')).toBe(false);
  });
});
