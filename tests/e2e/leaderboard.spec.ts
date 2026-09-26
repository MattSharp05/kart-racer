import { expect, test, type Page } from '@playwright/test';
import { tracks } from '../../src/content/tracks';
import { saveProfile } from '../../src/game/profile';
import { SETTINGS_KEY } from '../../src/game/storage/settings';
import { MemoryStore } from '../../src/game/storage/store';

/**
 * Leaderboards (MK-56) against the mock backend (`?lb=mock`; CI builds have no Supabase): the top
 * 20 with your row pinned, tabs, the empty / unavailable / loading states, the way in from the
 * title and results, and "Submitted — you're #N" after a race.
 */

const menuTracks = tracks.list().filter((t) => !t.testOnly);
const body = (page: Page) => page.locator('.leaderboard-body');
const rows = (page: Page) => page.locator('.leaderboard-list li');
const pinned = (page: Page) => page.locator('.leaderboard-row.pinned');
const tab = (page: Page, name: string) =>
  page.locator('.menu-leaderboard [role="tab"]', { hasText: new RegExp(`^${name}$`) });

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => window.__game?.ready === true);
}

/** A saved nickname and colour, so a finish is submitted (the board shows the name). */
async function withProfile(page: Page): Promise<void> {
  const store = new MemoryStore();
  saveProfile(store, { nickname: 'Tester', colour: 'teal' });
  const settings = store.get(SETTINGS_KEY) ?? '';
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    SETTINGS_KEY,
    settings,
  ] as const);
}

test('the top 20 with your row pinned at #37; tabs load other boards', async ({ page }) => {
  await open(page, 'scenario=leaderboard&lb=mock&paused=1');
  await expect(body(page)).toHaveAttribute('data-state', 'board');
  await expect(rows(page)).toHaveCount(20);
  await expect(rows(page).first()).toHaveAttribute('data-rank', '1');
  await expect(rows(page).last()).toHaveAttribute('data-rank', '20');
  await expect(page.locator('.leaderboard-list .you')).toHaveCount(0);
  await expect(pinned(page)).toHaveAttribute('data-rank', '37');
  await expect(pinned(page)).toContainText('(you)');
  await expect(tab(page, 'Sunny Circuit')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, '150cc')).toHaveAttribute('aria-selected', 'true');
  // Each row: rank, racer icon, nickname in the player's colour, race time, best lap.
  const first = rows(page).first();
  await expect(first.locator('.racer')).toHaveCount(1);
  await expect(first.locator('.time')).toHaveText(/^\d:\d\d\.\d{3}$/);
  await expect(first.locator('.lap')).toHaveText(/^\d:\d\d\.\d{3}$/);
  const colour = await first.evaluate((el) => el.style.getPropertyValue('--player-colour'));
  expect(colour).toMatch(/^#[0-9a-f]{6}$/);

  // Another track: another board.
  const sunnyLeader = await rows(page).first().locator('.name').textContent();
  const other = menuTracks[1]!;
  await tab(page, other.name).click();
  await expect(tab(page, other.name)).toHaveAttribute('aria-selected', 'true');
  await expect(body(page)).toHaveAttribute('data-state', 'board');
  await expect(rows(page)).toHaveCount(20);
  await expect(rows(page).first().locator('.name')).not.toHaveText(sunnyLeader ?? '');

  // 50cc: your row is 4th, highlighted in the list, and nothing is pinned.
  await tab(page, '50cc').click();
  await expect(page.locator('.leaderboard-list .you')).toHaveAttribute('data-rank', '4');
  await expect(pinned(page)).toHaveCount(0);

  // Keyboard: arrows move through the tracks, Esc goes back to the title.
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, menuTracks[2]!.name)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu-title')).toBeVisible();
});

test('empty, unavailable and loading states', async ({ page }) => {
  await open(page, 'scenario=leaderboard-empty&lb=mock&paused=1');
  await expect(body(page)).toHaveAttribute('data-state', 'empty');
  await expect(body(page)).toContainText('Be the first!');

  await open(page, 'scenario=leaderboard&lb=offline&paused=1');
  await expect(body(page)).toHaveAttribute('data-state', 'offline');
  await expect(body(page)).toContainText('Leaderboard unavailable');

  await open(page, 'scenario=leaderboard-offline&paused=1');
  await expect(body(page)).toContainText('Leaderboard unavailable');

  await open(page, 'scenario=leaderboard-loading&paused=1');
  await expect(body(page)).toHaveAttribute('data-state', 'loading');
  await expect(body(page)).toHaveText('Loading…');
});

test('reachable from the title, Back returns there', async ({ page }) => {
  await open(page, 'scenario=menu-title&lb=mock&paused=1');
  await page.getByRole('button', { name: /Leaderboards/ }).click();
  await expect(rows(page)).toHaveCount(20);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('.menu-title')).toBeVisible();
});

test('after a personal best: "Submitted — you\'re #N", and See leaderboard shows the row', async ({
  page,
}) => {
  await withProfile(page);
  await open(page, 'scenario=leaderboard-submit&lb=mock&paused=1');
  const state = await page.evaluate(() => {
    const game = window.__game!;
    game.setAutopilot(0, true);
    return game.step(360, { render: false });
  });
  expect(state.phase).toBe('finished');
  const status = page.locator('.menu-results .leaderboard-status');
  await expect(status).toHaveText(/^Submitted — you're #\d+$/);
  const rank = (await status.textContent())?.match(/#(\d+)/)?.[1] ?? '';
  // With the records and this line, the results still fit (phones included).
  const fits = await page
    .locator('.menu-results')
    .evaluate(
      (el) =>
        el.getBoundingClientRect().bottom <= innerHeight && el.scrollHeight <= el.clientHeight + 1,
    );
  expect(fits).toBe(true);

  await page.getByRole('button', { name: 'See leaderboard' }).click();
  await expect(tab(page, 'Sunny Circuit')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, `${state.engineClass}cc`)).toHaveAttribute('aria-selected', 'true');
  const you = page.locator('.leaderboard-row.you');
  await expect(you).toHaveAttribute('data-rank', rank);
  await expect(you.locator('.name')).toHaveText('Tester (you)');
  // Back to the results, which still say it.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(status).toHaveText(`Submitted — you're #${rank}`);
});

test('fits a 667×375 phone: the list scrolls inside the panel, your row stays in view', async ({
  page,
}) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await open(page, 'scenario=leaderboard&lb=mock&paused=1');
  await expect(rows(page)).toHaveCount(20);
  const layout = await page.evaluate(() => {
    const inView = (r: DOMRect) =>
      r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
    const rect = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    const list = document.querySelector('.leaderboard-list')!;
    const buttons = [...document.querySelectorAll('.menu-leaderboard button')]
      .map((b) => b.getBoundingClientRect())
      .filter((b) => b.width > 0);
    return {
      pageScrolls:
        document.documentElement.scrollHeight > innerHeight ||
        document.documentElement.scrollWidth > innerWidth,
      panelInside: inView(rect('.menu-leaderboard')),
      pinnedInside: inView(rect('.leaderboard-row.pinned')),
      listScrolls: list.scrollHeight > list.clientHeight,
      small: buttons.filter((b) => b.width < 44 || b.height < 44).length,
    };
  });
  expect(layout).toEqual({
    pageScrolls: false,
    panelInside: true,
    pinnedInside: true,
    listScrolls: true,
    small: 0,
  });
  // The last of the 20 scrolls into view inside the list.
  await rows(page).last().scrollIntoViewIfNeeded();
  await expect(rows(page).last()).toBeInViewport({ ratio: 1 });
  await expect(pinned(page)).toBeInViewport({ ratio: 1 });
});
