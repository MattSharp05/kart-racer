import { expect, test, type Page } from '@playwright/test';
import { tracks } from '../../src/content/tracks';
import { getState, loadScenario } from './helpers';

/** Track select (MK-50): a card per menu track, the chosen one races, records show, fits phones. */

const grid = (page: Page) => page.locator('.menu-trackSelect .track-grid');
const card = (page: Page, id: string) => page.locator(`.track-card[data-track="${id}"]`);
const menuTracks = tracks.list().filter((t) => !t.testOnly);

// One test per registered track, so new tracks are covered by registering (ADR 0007).
for (const { id, name } of menuTracks) {
  test(`choosing ${name} starts a race there and remembers it`, async ({ page }) => {
    await loadScenario(page, 'track-select');
    await card(page, id).click();
    await expect(grid(page)).toHaveAttribute('data-track', id);
    await expect(card(page, id).locator('.track-name')).toHaveText(name);
    await page.locator('.menu-trackSelect button.primary').click();
    await expect(page.locator('.menus .menu-panel')).toHaveCount(0);
    const state = await getState(page);
    expect(state.trackId).toBe(id);
    // The scene draws it too (MK-78), not the launch track.
    expect(await page.evaluate(() => window.__game!.renderInfo().trackId)).toBe(id);
    expect(state.karts).toHaveLength(8);
    const prefs = await page.evaluate(() => localStorage.getItem('kart-racer:prefs'));
    expect(JSON.parse(prefs ?? '{}')).toMatchObject({ track: id });
  });
}

test('the track select opens on the last track chosen', async ({ page }) => {
  const last = menuTracks[menuTracks.length - 1]?.id ?? '';
  await loadScenario(page, 'track-select', { paused: true });
  await page.evaluate(
    (track) => localStorage.setItem('kart-racer:prefs', JSON.stringify({ track })),
    last,
  );
  await loadScenario(page, 'track-select', { paused: true });
  await expect(grid(page)).toHaveAttribute('data-track', last);
  await expect(card(page, last)).toBeFocused();
});

test('records-has-best: the saved records show on their card, the others have none', async ({
  page,
}) => {
  await loadScenario(page, 'track-select-records', { paused: true });
  await expect(page.locator('.track-select-note')).toHaveText('Your records at 100cc');
  await expect(card(page, 'sunny-circuit').locator('.track-records')).toHaveText(
    'Race 2:40.000Lap 0:48.000',
  );
  for (const { id } of menuTracks.filter((t) => t.id !== 'sunny-circuit')) {
    await expect(card(page, id).locator('.track-records')).toHaveText('No record yet');
  }
});

test('keyboard: arrows move through the cards, Enter races, Esc goes back', async ({ page }) => {
  await loadScenario(page, 'track-select', { paused: true });
  const ids = menuTracks.map((t) => t.id);
  const first = ids[0] ?? '';
  await card(page, first).click();
  await page.keyboard.press('ArrowRight');
  await expect(grid(page)).toHaveAttribute('data-track', ids[1] ?? '');
  await expect(card(page, ids[1] ?? '')).toBeFocused();
  await expect(card(page, ids[1] ?? '')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft'); // wraps to the last card
  await expect(grid(page)).toHaveAttribute('data-track', ids[ids.length - 1] ?? '');
  await page.keyboard.press('ArrowRight');
  await expect(grid(page)).toHaveAttribute('data-track', first);
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu-ccSelect')).toBeVisible();
  await page.locator('.menu-ccSelect button', { hasText: '150' }).click();
  await expect(grid(page)).toHaveAttribute('data-track', first);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('.menus .menu-panel')).toHaveCount(0);
  const state = await getState(page);
  expect(state.trackId).toBe(ids[1]);
  expect(state.engineClass).toBe(150);
});

test('6 tracks fit a 667×375 phone: no page scroll, the row scrolls sideways, cards ≥ 44 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await loadScenario(page, 'track-select', { paused: true });
  await expect(page.locator('.track-card')).toHaveCount(menuTracks.length);
  const layout = await page.evaluate(() => {
    const panel = document.querySelector('.menu-trackSelect')!.getBoundingClientRect();
    const row = document.querySelector('.track-grid')!;
    const box = row.getBoundingClientRect();
    const cards = [...document.querySelectorAll('.track-card')].map((c) =>
      c.getBoundingClientRect(),
    );
    const inView = (r: DOMRect) =>
      r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
    return {
      pageScrolls:
        document.documentElement.scrollHeight > innerHeight ||
        document.documentElement.scrollWidth > innerWidth,
      panelInside: inView(panel),
      rowInside: inView(box),
      rows: new Set(cards.map((r) => Math.round(r.top))).size,
      // Every card is inside the row's scroll range, top to bottom.
      clippedVertically: cards.filter((r) => r.top < box.top || r.bottom > box.bottom).length,
      scrollsSideways: row.scrollWidth > row.clientWidth,
      small: cards.filter((r) => r.width < 44 || r.height < 44).length,
    };
  });
  expect(layout).toEqual({
    pageScrolls: false,
    panelInside: true,
    rowInside: true,
    rows: 1,
    clippedVertically: 0,
    scrollsSideways: true,
    small: 0,
  });
  // Picking the last card scrolls it into view.
  const last = menuTracks[menuTracks.length - 1]?.id ?? '';
  await page.keyboard.press('ArrowLeft');
  await expect(grid(page)).toHaveAttribute('data-track', last);
  await expect(card(page, last)).toBeInViewport({ ratio: 1 });
});
