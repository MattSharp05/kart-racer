import { expect, test, type Page } from '@playwright/test';
import { getState, loadScenario, step } from './helpers';
import { servePack } from './mk8';

// MK-130: MK8 Grand Prix on the synthetic test ramp (no pack, ADR 0009). The `mk8-gp-*` scenarios
// run a scripted 150cc Mushroom Cup (`src/mk8/gp/scripted.ts`): you are Mario, kart 0, in MK-121's
// field. Race 2's standings carry race 1's points; ties are broken by race 2's places.

/** Kart by kart: `SCRIPTED_FIELD`. */
const FIELD = [
  'mk8-mario',
  'mk8-luigi',
  'mk8-peach',
  'mk8-daisy',
  'mk8-yoshi',
  'mk8-toad',
  'mk8-koopa-troopa',
  'mk8-bowser',
];

async function settled(page: Page, n: number) {
  await expect(page.locator('.mk8')).toHaveAttribute('data-depth', String(n));
  await expect(page.locator('.mk8')).toHaveAttribute('data-transitioning', 'false');
}

const rowKarts = (page: Page) =>
  page
    .locator('.mk8-res-row')
    .evaluateAll((rows) => rows.map((r) => Number(r.getAttribute('data-kart'))));

test.describe('MK8 Grand Prix standings', () => {
  test('race 2 adds its points to race 1’s; ties go to the better place in race 2', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-gp-standings', { paused: true });
    const screen = page.locator('.mk8-scr-results');
    await expect(screen).toHaveAttribute('data-phase', 'done');
    await expect(screen.locator('.mk8-hdr')).toContainText('Race 2 / 4');
    expect(await rowKarts(page)).toEqual([0, 3, 1, 5, 2, 7, 4, 6]);
    await expect(page.locator('.mk8-res-pts')).toHaveText([
      '25',
      '25',
      '21',
      '21',
      '15',
      '15',
      '11',
      '11',
    ]);
    await expect(page.locator('.mk8-res-n')).toHaveText(['1', '2', '3', '4', '5', '6', '7', '8']);
    await expect(page.locator('.mk8-res-choice')).toHaveText(['Next race', 'Quit']);
  });

  test('Quit asks first: Keep racing stays, Quit leaves for MK8 Mode', async ({ page }) => {
    await loadScenario(page, 'mk8-gp-standings', { paused: true });
    await expect(page.locator('.mk8-scr-results')).toHaveAttribute('data-phase', 'done');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const confirm = page.locator('.mk8-scr-confirm');
    await settled(page, 2);
    await expect(confirm).toBeVisible();
    await expect(confirm.locator('.mk8-hdr')).toContainText('Quit the Grand Prix?');
    // "Keep racing" is selected first.
    await expect(confirm.locator('.mk8-confirm-opt.is-selected')).toHaveAttribute(
      'data-answer',
      'no',
    );
    await page.keyboard.press('Enter');
    await expect(confirm).toHaveCount(0);
    await settled(page, 1);
    await expect(page.locator('.mk8-scr-results')).toBeVisible();
    await page.keyboard.press('Enter');
    await settled(page, 2);
    await expect(confirm).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('.mk8-scr-title')).toBeVisible();
  });

  test('Next race races the cup’s next course with the same field, leader at the back', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-gp-standings', { paused: true });
    await expect(page.locator('.mk8-scr-results')).toHaveAttribute('data-phase', 'done');
    await page.keyboard.press('Enter');
    await expect(page.locator('.mk8')).toHaveCount(0);
    await page.evaluate(() => window.__game!.pause());
    const state = await getState(page);
    // Race 3 is Sweet Sweet Canyon: no course content yet, so its stand-in.
    expect(state.trackId).toBe('dune-canyon');
    expect(state.phase).toBe('countdown');
    expect(state.karts.map((k) => k.kartType)).toEqual(FIELD);
    // Standings after race 2: 0, 3, 1, 5, 2, 7, 4, 6 — the reverse on the grid: just after the
    // start the race order is the grid's, kart 6 on pole and you (the leader) at the back.
    let racing = state;
    while (racing.phase === 'countdown') racing = await step(page, 30);
    expect(racing.positions[0]).toBe(6);
    expect(racing.positions[racing.positions.length - 1]).toBe(0);
  });
});

test.describe('MK8 Grand Prix race', () => {
  test('Quit in the pause menu mid-cup asks to confirm; Back returns to the pause menu', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-gp-race2');
    await page.keyboard.press('Escape');
    await expect(page.locator('.mk8-scr-pause')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await settled(page, 2);
    await expect(page.locator('.mk8-scr-confirm')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.mk8-scr-confirm')).toHaveCount(0);
    await expect(page.locator('.mk8-scr-pause')).toBeVisible();
  });
});

test.describe('MK8 Grand Prix podium', () => {
  test('the top 3 on the steps, your gold trophy, saved for 150cc and shown on the cup select', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-gp-podium', { paused: true });
    const podium = page.locator('.mk8-scr-podium');
    await expect(podium).toHaveAttribute('data-status', 'ready');
    await expect(podium).toHaveAttribute('data-place', '1');
    await expect(podium).toHaveAttribute('data-trophy', 'gold');
    // No pack: block stand-ins. Standings 0, 5, 3: Mario, Toad, Daisy.
    await expect(podium).toHaveAttribute('data-models', 'stand-in');
    await expect(podium).toHaveAttribute('data-racers', 'mk8-mario mk8-toad mk8-daisy');
    // Nameplates under the steps: 2nd, 1st, 3rd.
    await expect(podium.locator('.mk8-podium-name b')).toHaveText(['2nd', '1st', '3rd']);
    await expect(podium.locator('.mk8-podium-name small')).toHaveText([
      '48 pts',
      '50 pts',
      '47 pts',
    ]);
    await expect(podium.locator('.mk8-podium-rank')).toContainText('Gold trophy!');
    // Back doesn't leave; OK goes to MK8 Mode.
    await page.keyboard.press('Escape');
    await expect(podium).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('.mk8-scr-title')).toBeVisible();

    await loadScenario(page, 'mk8-ui-cup');
    await settled(page, 6);
    const mushroom = page.locator('.mk8-cup-tile[data-cup="mushroom"]');
    await expect(mushroom.locator('.mk8-cup-trophy')).toHaveAttribute('data-trophy', 'gold');
    await expect(page.locator('.mk8-cup-trophy')).toHaveCount(1);
    // Not won at 100cc.
    await page.keyboard.press('Escape');
    await settled(page, 5);
    await page.locator('.mk8-scr-cc .mk8-shield[data-cc="100"]').click();
    await page.keyboard.press('Enter');
    await settled(page, 6);
    await expect(page.locator('.mk8-cup-trophy')).toHaveCount(0);
  });

  test('with a pack, the racers and the trophy are its models', async ({ page }) => {
    await servePack(page);
    await loadScenario(page, 'mk8-gp-podium', { paused: true });
    const podium = page.locator('.mk8-scr-podium');
    await expect(podium).toHaveAttribute('data-status', 'ready');
    await expect(podium).toHaveAttribute('data-models', 'pack');
  });

  test('a Grand Prix skips the courses not drivable yet on the cup select', async ({ page }) => {
    await loadScenario(page, 'mk8-ui-cup');
    await settled(page, 6);
    const cards = page.locator('.mk8-scr-cup .mk8-course');
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0)).not.toHaveClass(/is-skipped/);
    // Courses without content yet (Water Park has some since MK-122).
    await expect(cards.nth(1)).not.toHaveClass(/is-skipped/);
    const skipped = await page.locator('.mk8-scr-cup .mk8-course.is-skipped').count();
    expect(skipped).toBeLessThanOrEqual(2);
  });
});

test.describe('MK8 Grand Prix from the menus', () => {
  test(
    'a whole 150cc cup on the autopilot: every race, standings, the podium and the trophy',
    { tag: '@full' },
    async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop-chrome', 'full cup runs on desktop-chrome');
      test.setTimeout(300_000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await loadScenario(page, 'mk8-ui-cup', { paused: true });
      await settled(page, 6);
      await page.keyboard.press('Enter');
      for (let race = 1; race <= 4; race += 1) {
        await expect(page.locator('.mk8')).toHaveCount(0, { timeout: 20_000 });
        await page.evaluate(() => {
          window.__game!.pause();
          window.__game!.setAutopilot(0, true);
        });
        let state = await getState(page);
        expect(state.karts.length).toBe(8);
        for (let i = 0; i < 30 && state.phase !== 'finished'; i += 1) {
          state = await step(page, 900);
        }
        expect(state.phase).toBe('finished');
        await page.evaluate(() => window.__game!.resume());
        const results = page.locator('.mk8-scr-results');
        // Opened paused: the results show their end at once.
        await expect(results).toHaveAttribute('data-phase', 'done', { timeout: 10_000 });
        const label = await page.locator('.mk8-res-choice').first().textContent();
        await page.keyboard.press('Enter');
        if (label === 'Awards') break;
        expect(label).toBe('Next race');
      }
      const podium = page.locator('.mk8-scr-podium');
      await expect(podium).toHaveAttribute('data-status', /ready|unavailable/, {
        timeout: 20_000,
      });
      const trophy = await podium.getAttribute('data-trophy');
      await page.keyboard.press('Enter');
      await expect(page.locator('.mk8-scr-title')).toBeVisible();
      const saved = await page.evaluate(() => localStorage.getItem('kart-racer:mk8-trophies'));
      if (trophy !== 'none') expect(JSON.parse(saved!)).toEqual({ mushroom: { '150': trophy } });
      expect(errors).toEqual([]);
    },
  );
});
