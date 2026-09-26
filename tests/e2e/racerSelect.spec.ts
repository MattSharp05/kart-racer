import { expect, test, type Page } from '@playwright/test';
import { racers } from '../../src/content/racers';
import { getState, loadScenario } from './helpers';

/** Racer select (MK-51): a card per registered racer, chosen racer → race, remembered, fits phones. */

const picker = (page: Page) => page.locator('.menu-racerSelect .racer-picker');
const card = (page: Page, id: string) => page.locator(`.racer-card[data-racer="${id}"]`);

// One test per registered racer, so the six new ones (MK-63, MK-64) are covered by registering.
for (const { id, name } of racers.list()) {
  test(`choosing ${name} starts a race with kart ${id} and remembers it`, async ({ page }) => {
    await loadScenario(page, 'racer-select');
    await card(page, id).click();
    await expect(picker(page)).toHaveAttribute('data-racer', id);
    await expect(picker(page).locator('h3')).toHaveText(name);
    await page.locator('.menu-racerSelect button.primary').click();
    await expect(page.locator('.menu-ccSelect')).toBeVisible();
    // Remembered (prefs) as soon as it's chosen: the racer select opens on it again.
    const prefs = await page.evaluate(() => localStorage.getItem('kart-racer:prefs'));
    expect(JSON.parse(prefs ?? '{}')).toMatchObject({ kart: id });
    await page.keyboard.press('Escape');
    await expect(picker(page)).toHaveAttribute('data-racer', id);
    await page.locator('.menu-racerSelect button.primary').click();
    await page.locator('.menu-ccSelect button', { hasText: '100' }).click();
    await expect(page.locator('.menus .menu-panel')).toHaveCount(0);
    const state = await getState(page);
    expect(state.karts[state.localKartId]?.kartType).toBe(id);
  });
}

test('keyboard: arrows move through the grid, Enter chooses, Esc goes back', async ({ page }) => {
  await loadScenario(page, 'racer-select-full', { paused: true });
  const ids = await page
    .locator('.racer-card')
    .evaluateAll((cards) => cards.map((c) => (c as HTMLElement).dataset.racer ?? ''));
  expect(ids).toHaveLength(10);
  const first = ids[0] ?? '';
  // Start from the first card whatever the saved pref.
  await card(page, first).click();
  await page.keyboard.press('ArrowRight');
  await expect(picker(page)).toHaveAttribute('data-racer', ids[1] ?? '');
  await page.keyboard.press('ArrowDown');
  await expect(picker(page)).toHaveAttribute('data-racer', ids[6] ?? '');
  await expect(card(page, ids[6] ?? '')).toBeFocused();
  await expect(card(page, ids[6] ?? '')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowDown'); // bottom row: stays
  await expect(picker(page)).toHaveAttribute('data-racer', ids[6] ?? '');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft'); // wraps to the last card
  await expect(picker(page)).toHaveAttribute('data-racer', ids[9] ?? '');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('.menu-ccSelect')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu-racerSelect')).toBeVisible();
  await expect(picker(page)).toHaveAttribute('data-racer', first);
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu-title')).toBeVisible();
});

test('10 racers fit a 667×375 phone: no page scroll, every card inside and at least 44 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await loadScenario(page, 'racer-select-full', { paused: true });
  await expect(page.locator('.racer-card')).toHaveCount(10);
  const layout = await page.evaluate(() => {
    const panel = document.querySelector('.menu-racerSelect')!.getBoundingClientRect();
    const grid = document.querySelector('.racer-grid')!;
    const cards = [...document.querySelectorAll('.racer-card')].map((c) =>
      c.getBoundingClientRect(),
    );
    const inView = (r: DOMRect) =>
      r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
    return {
      pageScrolls:
        document.documentElement.scrollHeight > innerHeight ||
        document.documentElement.scrollWidth > innerWidth,
      panelInside: inView(panel),
      gridScrolls: grid.scrollHeight > grid.clientHeight + 1,
      rows: new Set(cards.map((r) => Math.round(r.top))).size,
      outside: cards.filter((r) => !inView(r)).length,
      small: cards.filter((r) => r.width < 44 || r.height < 44).length,
    };
  });
  expect(layout).toEqual({
    pageScrolls: false,
    panelInside: true,
    gridScrolls: false,
    rows: 2,
    outside: 0,
    small: 0,
  });
});

test('the preview is one small canvas, reused as the screen comes and goes (no WebGL leak)', async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on('console', (m) => {
    if (/WebGL/i.test(m.text())) warnings.push(m.text());
  });
  await loadScenario(page, 'racer-select', { paused: true });
  await expect(page.locator('.racer-preview')).toHaveCount(1);
  // Browsers cap live WebGL contexts at ~16: open and leave the screen well past that.
  const result = await page.evaluate(async () => {
    const canvases = new Set<HTMLCanvasElement>();
    let lost = 0;
    for (let i = 0; i < 24; i += 1) {
      const canvas = document.querySelector<HTMLCanvasElement>('.racer-preview');
      if (canvas && !canvases.has(canvas)) {
        canvases.add(canvas);
        canvas.addEventListener('webglcontextlost', () => (lost += 1));
      }
      document.querySelector<HTMLButtonElement>('.menu-racerSelect button.primary')?.click();
      if (document.querySelector('.racer-preview')) return { error: 'preview left on cc select' };
      document.querySelector<HTMLButtonElement>('.menu-ccSelect > button')?.click();
      await new Promise(requestAnimationFrame);
    }
    return { canvases: canvases.size, lost, onPage: document.querySelectorAll('canvas').length };
  });
  // One preview canvas all along, never lost; the page has it plus the game's own canvas.
  expect(result).toEqual({ canvases: 1, lost: 0, onPage: 2 });
  expect(warnings.filter((w) => /too many/i.test(w))).toEqual([]);
});
