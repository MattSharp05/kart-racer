import { expect, test, type Locator, type Page } from '@playwright/test';
import { getState, loadScenario } from './helpers';
import { servePack } from './mk8';

// MK-116: MK8 Mode's title and mode select (`mk8-ui-title`, `mk8-ui-mode`). MK-119: the engine
// class and the cup/course select (`mk8-ui-cc`, `mk8-ui-cup`, `mk8-ui-course`), up to the race
// they start. No real pack here (ADR 0009): the logo, racers, shields, cups and courses are
// stand-ins and the sounds synthesized, but the player is still asked for the same ids
// (`window.__mk8.sounds`), and the choices are in `window.__mk8.flow`. MK-117: the character select
// (`mk8-ui-char`), also on the synthetic fixture pack for its 3D portrait and voice lines.

const sounds = (page: Page) => page.evaluate(() => [...(window.__mk8?.sounds ?? [])]);
const chosenMode = (page: Page) => page.evaluate(() => window.__mk8?.flow?.mode);

async function settled(page: Page, n: number) {
  await expect(page.locator('.mk8')).toHaveAttribute('data-depth', String(n));
  await expect(page.locator('.mk8')).toHaveAttribute('data-transitioning', 'false');
}

const modeTiles = (page: Page) => page.locator('.mk8-scr-modes .mk8-tile');
const charScreen = (page: Page) => page.locator('.mk8-scr-char');
const kartNext = (page: Page) => page.locator('.mk8-scr-kart-next');

/** Every box is at least 44 px (when `tap`) and inside the viewport. */
async function expectFits(page: Page, selector: string, tap = true) {
  const viewport = page.viewportSize()!;
  const boxes = await page.locator(selector).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
  expect(boxes.length, selector).toBeGreaterThan(0);
  for (const b of boxes) {
    if (tap) expect(Math.min(b.w, b.h), selector).toBeGreaterThanOrEqual(44);
    expect(b.x, selector).toBeGreaterThanOrEqual(0);
    expect(b.y, selector).toBeGreaterThanOrEqual(0);
    expect(b.y + b.h, selector).toBeLessThanOrEqual(viewport.height + 0.5);
    expect(b.x + b.w, selector).toBeLessThanOrEqual(viewport.width + 0.5);
  }
}

test.describe('MK8 title and mode select', () => {
  test('keyboard: Enter starts, arrows pick a mode, Enter passes it on, Esc walks back out', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-ui-title');
    await settled(page, 1);
    const title = page.locator('.mk8-scr-title');
    await expect(title).toBeVisible();
    await expect(title.locator('.mk8-title-racers .mk8-art')).toHaveCount(12);
    // No pack: our own wordmark, never Nintendo art.
    await expect(title.locator('.mk8-title-logo-stand-in')).toBeVisible();
    await expect(title.locator('.mk8-title-press')).toContainText('to start');

    // The wipe runs 0.55 s: record that it started rather than poll for it (a busy runner can
    // miss it).
    await page.evaluate(() => {
      const wipe = document.querySelector('.mk8-wipe');
      if (!wipe) return;
      new MutationObserver(() => {
        if (wipe.classList.contains('go')) wipe.setAttribute('data-wiped', 'true');
      }).observe(wipe, { attributes: true, attributeFilter: ['class'] });
    });
    await page.keyboard.press('Enter');
    await expect(page.locator('.mk8-wipe')).toHaveAttribute('data-wiped', 'true');
    await settled(page, 2);
    await expect(page.locator('.mk8-scr-modes')).toBeVisible();
    await expect(modeTiles(page)).toHaveText([/Grand Prix/, /VS Race/, /Time Trial/, /Online/]);
    await expect(modeTiles(page).nth(0)).toHaveAttribute('aria-current', 'true');

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(modeTiles(page).nth(2)).toHaveClass(/is-selected/);
    await expect(modeTiles(page).nth(0)).not.toHaveClass(/is-selected/);
    expect(await chosenMode(page)).toBeUndefined();

    await page.keyboard.press('Enter');
    await settled(page, 3);
    await expect(charScreen(page)).toBeVisible();
    expect(await chosenMode(page)).toBe('time-trial');

    await page.keyboard.press('Escape');
    await settled(page, 2);
    // The mode select kept its selection.
    await expect(modeTiles(page).nth(2)).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('Backspace');
    await settled(page, 1);
    await expect(title).toBeVisible();

    expect(await sounds(page)).toEqual([
      'ui/decide',
      'ui/cursor',
      'ui/cursor',
      'ui/decide',
      'ui/back',
      'ui/back',
    ]);

    // Back on the title leaves MK8 Mode for the Kart Racer title.
    await page.keyboard.press('Escape');
    await expect(page.locator('.menu-title')).toBeVisible();
  });

  test('touch: a tap starts, a tap selects, a tap on the selected mode confirms, B goes back', async ({
    page,
  }, info) => {
    await loadScenario(page, 'mk8-ui-title');
    await settled(page, 1);
    const press = (locator: Locator) =>
      info.project.use.hasTouch ? locator.tap() : locator.click();

    await press(page.locator('.mk8-title-press'));
    await settled(page, 2);
    await press(modeTiles(page).nth(1));
    await expect(modeTiles(page).nth(1)).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.mk8')).toHaveAttribute('data-depth', '2');
    await press(modeTiles(page).nth(1));
    await settled(page, 3);
    expect(await chosenMode(page)).toBe('vs');
    await expect(charScreen(page)).toBeVisible();

    await press(charScreen(page).locator('.mk8-hint-b'));
    await settled(page, 2);
    // The A hint confirms the selected tile.
    await press(modeTiles(page).nth(3));
    await press(page.locator('.mk8-scr-modes .mk8-hint-a'));
    await settled(page, 3);
    expect(await chosenMode(page)).toBe('online');
    await press(charScreen(page).locator('.mk8-hint-b'));
    await settled(page, 2);
    await press(page.locator('.mk8-scr-modes .mk8-hint-b'));
    await settled(page, 1);

    expect(await sounds(page)).toEqual([
      'ui/decide',
      'ui/cursor',
      'ui/decide',
      'ui/back',
      'ui/cursor',
      'ui/decide',
      'ui/back',
      'ui/back',
    ]);
    // The corner button returns to the Kart Racer title (and doesn't start MK8 Mode).
    await press(page.locator('.mk8-title-back'));
    await expect(page.locator('.menu-title')).toBeVisible();
  });

  test('mk8-ui-mode opens on the mode select, over the title', async ({ page }) => {
    await loadScenario(page, 'mk8-ui-mode');
    await settled(page, 2);
    await expect(page.locator('.mk8-scr-modes')).toBeVisible();
    await expect(page.locator('.mk8-modes-side .mk8-modes-art')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await settled(page, 1);
    await expect(page.locator('.mk8-scr-title')).toBeVisible();
  });

  test('tap targets are at least 44 px and everything fits the screen', async ({ page }) => {
    await loadScenario(page, 'mk8-ui-title');
    await settled(page, 1);
    await expectFits(page, '.mk8-title-back');
    await expectFits(page, '.mk8-title-press .mk8-slant', false);
    await expectFits(page, '.mk8-title-racers .mk8-art', false);
    await page.keyboard.press('Enter');
    await settled(page, 2);
    await expectFits(page, '.mk8-scr-modes .mk8-tile');
    await expectFits(page, '.mk8-scr-modes .mk8-hint');
    await expectFits(page, '.mk8-modes-side', false);
  });

  test('the MK8 Mode button loads the pack and opens on the title, then the mode select', async ({
    page,
  }) => {
    await servePack(page);
    await loadScenario(page, 'mk8-entry');
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.__game!.whenReady());
    await settled(page, 1);
    await expect(page.locator('.mk8-scr-title')).toBeVisible();
    await page.keyboard.press(' ');
    await settled(page, 2);
    await expect(page.locator('.mk8-scr-modes')).toBeVisible();
  });
});

const shields = (page: Page) => page.locator('.mk8-scr-cc .mk8-shield');
const cupTiles = (page: Page) => page.locator('.mk8-scr-cup .mk8-cup-tile');
const courseCards = (page: Page) => page.locator('.mk8-scr-cup .mk8-course');
const flow = (page: Page) => page.evaluate(() => ({ ...window.__mk8?.flow }));

/** The race the menus started: menus gone, then the state's track, class, items and player kart. */
async function raceStarted(page: Page) {
  await expect(page.locator('.mk8')).toHaveCount(0);
  const state = await getState(page);
  return {
    trackId: state.trackId,
    engineClass: state.engineClass,
    itemSet: state.itemSet,
    secondSlot: state.karts[state.localKartId]?.item.second !== undefined,
    karts: state.karts.length,
    player: state.karts[state.localKartId]?.kartType,
    phase: state.phase,
  };
}

/**
 * Holds the course loading: the pack's manifest answers "no pack" at once for the menus, then
 * waits for `release` (the course load's request).
 */
async function holdCourseLoad(page: Page) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let requests = 0;
  await page.route('**/mk8/manifest.json', async (route) => {
    requests += 1;
    if (requests > 1) await released;
    await route.fulfill({ status: 404, body: 'Not found' });
  });
  return release;
}

test.describe('MK8 engine class and cup/course select (MK-119)', () => {
  test('keyboard Grand Prix: shields, 200cc, locked cups refuse, the Mushroom Cup starts its first course', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-ui-cc');
    await settled(page, 5);
    await expect(page.locator('.mk8-scr-cc .mk8-hdr')).toContainText('Grand Prix');
    await expect(shields(page)).toHaveText([/50cc\s*Easy/, /100cc/, /150cc/, /200cc\s*Very fast/]);
    await expect(shields(page).nth(3).locator('.mk8-new')).toHaveText('NEW');
    await expect(page.locator('.mk8-scr-cc .mk8-new')).toHaveCount(1);
    await expect(shields(page).nth(2)).toHaveAttribute('aria-current', 'true');

    await page.keyboard.press('ArrowRight');
    await expect(shields(page).nth(3)).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('Enter');
    await settled(page, 6);
    expect((await flow(page)).engineClass).toBe(200);
    const cup = page.locator('.mk8-scr-cup');
    await expect(cup.locator('.mk8-hdr')).toContainText('Select a cup');
    await expect(cup.locator('.mk8-hdr .mk8-sub')).toHaveText('200cc');
    await expect(cupTiles(page)).toHaveCount(4);
    await expect(cupTiles(page).nth(0)).toHaveAttribute('aria-current', 'true');
    // The Mushroom Cup's courses, each with its map, anti-gravity tag and no best time yet.
    await expect(courseCards(page)).toHaveText([
      /Mario Kart Stadium/,
      /Water Park/,
      /Sweet Sweet Canyon/,
      /Thwomp Ruins/,
    ]);
    await expect(courseCards(page).locator('.mk8-ag')).toHaveCount(4);
    await expect(courseCards(page).locator('.mk8-course-map')).toHaveCount(4);
    await expect(courseCards(page).locator('.mk8-course-best')).toHaveText(Array(4).fill('Best —'));

    // Flower, Star and Special say "Later" and can't be chosen.
    await expect(cupTiles(page).locator('.mk8-later')).toHaveText(['Later', 'Later', 'Later']);
    await expect(cupTiles(page).nth(0).locator('.mk8-later')).toHaveCount(0);
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft']) {
      await page.keyboard.press(key);
      await expect(cupTiles(page).filter({ has: page.locator('.mk8-later') })).toHaveCount(3);
      await page.keyboard.press('Enter');
      await expect(courseCards(page).first()).toHaveText('Later');
    }
    await expect(cupTiles(page).nth(2)).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.mk8')).toHaveAttribute('data-depth', '6');
    expect((await flow(page)).cup).toBeUndefined();

    await page.keyboard.press('ArrowUp');
    await expect(cupTiles(page).nth(0)).toHaveAttribute('aria-current', 'true');
    await expect(courseCards(page).nth(0)).toContainText('Mario Kart Stadium');
    await page.keyboard.press('Enter');
    expect(await raceStarted(page)).toEqual({
      // No pack here (CI): Sunny Circuit stands in for Mario Kart Stadium (MK-105 with a pack).
      trackId: 'sunny-circuit',
      engineClass: 200,
      itemSet: 'mk8',
      secondSlot: true,
      karts: 8,
      // The default loadout's racer until character select and the kart builder exist.
      player: 'mk8-mario',
      phase: 'countdown',
    });
    expect(await flow(page)).toMatchObject({
      mode: 'grand-prix',
      cup: 'mushroom',
      course: 'stadium',
    });
    expect(await sounds(page)).toEqual([
      'ui/cursor',
      'ui/decide',
      'ui/course-roulette',
      'ui/course-roulette',
      'ui/course-roulette',
      'ui/course-roulette',
      'ui/decide',
    ]);
  });

  test('touch VS Race: a cup, then a course; the course loads behind a bar, then its race', async ({
    page,
  }, info) => {
    const release = await holdCourseLoad(page);
    await loadScenario(page, 'mk8-ui-course');
    await settled(page, 6);
    const press = (locator: Locator) =>
      info.project.use.hasTouch ? locator.tap() : locator.click();
    await expect(page.locator('.mk8-scr-cup .mk8-hdr .mk8-sub')).toHaveText('150cc');

    // A locked cup: the tap selects it, the second does nothing.
    await press(cupTiles(page).nth(3));
    await expect(cupTiles(page).nth(3)).toHaveAttribute('aria-current', 'true');
    await press(cupTiles(page).nth(3));
    await expect(page.locator('.mk8-cup')).toHaveAttribute('data-phase', 'cup');

    await press(cupTiles(page).nth(0));
    await press(cupTiles(page).nth(0));
    await expect(page.locator('.mk8-cup')).toHaveAttribute('data-phase', 'course');
    await expect(page.locator('.mk8-scr-cup .mk8-hdr h2')).toHaveText('Select a course');
    await expect(cupTiles(page).nth(0)).toHaveClass(/is-chosen/);
    await expect(courseCards(page).nth(0)).toHaveAttribute('aria-current', 'true');

    // B returns to the cups; OK there comes back to the courses.
    await press(page.locator('.mk8-scr-cup .mk8-hint-b'));
    await expect(page.locator('.mk8-cup')).toHaveAttribute('data-phase', 'cup');
    await expect(page.locator('.mk8')).toHaveAttribute('data-depth', '6');
    await press(page.locator('.mk8-scr-cup .mk8-hint-a'));
    await expect(page.locator('.mk8-cup')).toHaveAttribute('data-phase', 'course');

    await press(courseCards(page).nth(2));
    await expect(courseCards(page).nth(2)).toHaveAttribute('aria-current', 'true');
    await press(courseCards(page).nth(2));
    const loading = page.locator('.mk8-scr-course-loading');
    await expect(loading).toBeVisible();
    await expect(loading.locator('.mk8-hdr')).toContainText('Sweet Sweet Canyon');
    await expect(loading.locator('[role=progressbar]')).toHaveAttribute('aria-valuenow', '0');
    release();
    expect(await raceStarted(page)).toMatchObject({
      trackId: 'dune-canyon',
      engineClass: 150,
      itemSet: 'mk8',
      player: 'mk8-mario',
    });
    expect(await flow(page)).toMatchObject({ mode: 'vs', cup: 'mushroom', course: 'canyon' });
    // The refused tap on the locked cup makes no sound.
    expect(await sounds(page)).toEqual([
      'ui/course-roulette',
      'ui/course-roulette',
      'ui/decide',
      'ui/back',
      'ui/decide',
      'ui/course-roulette',
      'ui/decide',
    ]);
  });

  test('Back on the course loading cancels the race; Back walks out to the engine class', async ({
    page,
  }) => {
    const release = await holdCourseLoad(page);
    await loadScenario(page, 'mk8-ui-cup');
    await settled(page, 6);
    await page.keyboard.press('Enter');
    await settled(page, 7);
    await expect(page.locator('.mk8-scr-course-loading')).toBeVisible();
    await page.keyboard.press('Escape');
    await settled(page, 6);
    release();
    // The load finishing after Back starts nothing.
    await page.waitForTimeout(300);
    await expect(page.locator('.mk8-scr-cup')).toBeVisible();
    expect((await getState(page)).itemSet).toBeUndefined();
    await page.keyboard.press('Backspace');
    await settled(page, 5);
    await expect(page.locator('.mk8-scr-cc')).toBeVisible();
    // The engine class kept its pick.
    await expect(shields(page).nth(2)).toHaveAttribute('aria-current', 'true');
  });

  test('character select goes on to the kart builder stand-in, then the engine class (Online stops there)', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-ui-mode');
    await settled(page, 2);
    await page.keyboard.press('Enter');
    await settled(page, 3);
    await expect(charScreen(page)).toBeVisible();
    await page.keyboard.press('Enter');
    await settled(page, 4);
    await expect(kartNext(page).locator('.mk8-body')).toHaveAttribute('data-racer', 'mk8-mario');
    await page.keyboard.press('Enter');
    await settled(page, 5);
    await expect(page.locator('.mk8-scr-cc .mk8-hdr')).toContainText('Grand Prix');
    await page.keyboard.press('Escape');
    await settled(page, 4);
    await page.keyboard.press('Escape');
    await settled(page, 3);
    await page.keyboard.press('Escape');
    await settled(page, 2);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await settled(page, 3);
    await page.keyboard.press('Enter');
    await settled(page, 4);
    await expect(kartNext(page).locator('.mk8-hint-a')).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(page.locator('.mk8')).toHaveAttribute('data-depth', '4');
  });

  test('engine class and cup/course tap targets are at least 44 px and fit the screen', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-ui-cc');
    await settled(page, 5);
    await expectFits(page, '.mk8-scr-cc .mk8-shield');
    await expectFits(page, '.mk8-scr-cc .mk8-new', false);
    await expectFits(page, '.mk8-scr-cc .mk8-hint');
    await page.keyboard.press('Enter');
    await settled(page, 6);
    await expectFits(page, '.mk8-scr-cup .mk8-cup-tile');
    await expectFits(page, '.mk8-scr-cup .mk8-course');
    await expectFits(page, '.mk8-scr-cup .mk8-hint');
  });
});

test.describe('MK8 character select (MK-117)', () => {
  const tiles = (page: Page) => page.locator('.mk8-scr-char .mk8-char-tile');
  const plate = (page: Page) => page.locator('.mk8-scr-char .mk8-nameplate');
  const selected = (page: Page) => page.locator('.mk8-scr-char .mk8-char-tile.is-selected');
  const shown3d = (page: Page) => page.evaluate(() => window.__mk8?.preview?.shown());

  test('keyboard: arrows move 4 across, each move speaks, Enter confirms, Esc returns', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-ui-char');
    await settled(page, 3);
    await expect(page.locator('.mk8-scr-char .mk8-hdr')).toContainText('Choose your character');
    await expect(tiles(page)).toHaveCount(12);
    const names = await tiles(page).evaluateAll((els) =>
      els.map((e) => e.getAttribute('aria-label')),
    );
    expect(names).toEqual([
      'Mario',
      'Luigi',
      'Peach',
      'Daisy',
      'Yoshi',
      'Toad',
      'Koopa Troopa',
      'Shy Guy',
      'Donkey Kong',
      'Bowser',
      'Wario',
      'Waluigi',
    ]);
    await expect(selected(page)).toHaveAttribute('data-racer', 'mk8-mario');
    await expect(selected(page).locator('.mk8-p1')).toBeVisible();
    await expect(page.locator('.mk8-scr-char .mk8-p1:visible')).toHaveCount(1);
    await expect(plate(page)).toContainText('Mario');
    await expect(plate(page)).toContainText('Medium weight');
    // No pack: a stand-in initial, never Nintendo art.
    await expect(page.locator('.mk8-char-still .mk8-art-stand-in')).toHaveText('M');
    expect(await sounds(page)).toEqual([]);

    await page.keyboard.press('ArrowRight');
    await expect(selected(page)).toHaveAttribute('data-racer', 'mk8-luigi');
    await page.keyboard.press('ArrowDown');
    await expect(selected(page)).toHaveAttribute('data-racer', 'mk8-toad');
    await expect(plate(page)).toContainText('Light weight');
    await page.keyboard.press('ArrowDown');
    await expect(selected(page)).toHaveAttribute('data-racer', 'mk8-bowser');
    await expect(plate(page)).toContainText('Heavy weight');
    // The last row and the left column stop the cursor.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(selected(page)).toHaveAttribute('data-racer', 'mk8-donkey-kong');
    expect(await sounds(page)).toEqual([
      'ui/name-appear',
      'voice/luigi/select',
      'ui/name-appear',
      'voice/toad/select',
      'ui/name-appear',
      'voice/bowser/select',
      'ui/name-appear',
      'voice/donkey-kong/select',
    ]);

    await page.keyboard.press('Enter');
    await settled(page, 4);
    await expect(page.locator('.mk8-scr-kart-next .mk8-body')).toHaveAttribute(
      'data-racer',
      'mk8-donkey-kong',
    );
    expect((await flow(page)).loadout?.racer).toBe('mk8-donkey-kong');
    await page.keyboard.press('Escape');
    await settled(page, 3);
    await expect(selected(page)).toHaveAttribute('data-racer', 'mk8-donkey-kong');
    await page.keyboard.press('Escape');
    await settled(page, 2);
    await expect(page.locator('.mk8-scr-modes')).toBeVisible();
  });

  test('touch: a tap selects, a tap on the selected racer confirms, B goes back', async ({
    page,
  }, info) => {
    const press = (locator: Locator) =>
      info.project.use.hasTouch ? locator.tap() : locator.click();
    await loadScenario(page, 'mk8-ui-char');
    await settled(page, 3);
    await press(tiles(page).nth(6));
    await expect(selected(page)).toHaveAttribute('data-racer', 'mk8-koopa-troopa');
    await expect(plate(page)).toContainText('Koopa Troopa');
    expect(await sounds(page)).toEqual(['ui/name-appear', 'voice/koopa-troopa/select']);
    await press(tiles(page).nth(6));
    await settled(page, 4);
    expect((await flow(page)).loadout?.racer).toBe('mk8-koopa-troopa');
    await press(page.locator('.mk8-scr-kart-next .mk8-hint-b'));
    await settled(page, 3);
    await press(page.locator('.mk8-scr-char .mk8-hint-b'));
    await settled(page, 2);
  });

  test('remembers the last racer picked', async ({ page }) => {
    await loadScenario(page, 'mk8-ui-char');
    await settled(page, 3);
    await page.keyboard.press('ArrowRight');
    await expect(selected(page)).toHaveAttribute('data-racer', 'mk8-luigi');
    // Only a confirmed pick is remembered.
    await page.keyboard.press('Escape');
    await settled(page, 2);
    await page.keyboard.press('Enter');
    await settled(page, 3);
    await expect(selected(page)).toHaveAttribute('data-racer', 'mk8-mario');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await settled(page, 4);
    await loadScenario(page, 'mk8-ui-char');
    await settled(page, 3);
    await expect(selected(page)).toHaveAttribute('data-racer', 'mk8-daisy');
    await expect(plate(page)).toContainText('Daisy');
  });

  test('with a pack: the 3D racer turns in the portrait and follows the cursor within 300 ms', async ({
    page,
  }) => {
    const { requested } = await servePack(page);
    await loadScenario(page, 'mk8-ui-char');
    await settled(page, 3);
    await expect.poll(() => shown3d(page), { timeout: 20_000 }).toBe('mk8-mario');
    await expect(page.locator('.mk8-char-portrait')).toHaveClass(/has-3d/);
    await expect(page.locator('.mk8-preview-canvas')).toBeVisible();
    // Every racer's model and the voice lines the pack has, the first racer's first.
    await expect
      .poll(() => requested.filter((p) => p.startsWith('models/racers/')).length)
      .toBe(12);
    expect(requested).toContain('audio/voices.json');
    expect(requested).toContain('audio/voice/mario/fixture-select.m4a');
    const racers = requested.filter((p) => p.startsWith('models/racers/'));
    expect(racers[0]).toBe('models/racers/mario.glb');

    for (const [key, racer] of [
      ['ArrowRight', 'mk8-luigi'],
      ['ArrowDown', 'mk8-toad'],
      ['ArrowLeft', 'mk8-yoshi'],
    ] as const) {
      await page.keyboard.press(key);
      await expect.poll(() => shown3d(page)).toBe(racer);
      const latency = await page.evaluate(() => window.__mk8?.preview?.latency());
      expect(latency, racer).toBeLessThan(300);
    }
    // The voice line asked for even where the pack has no clip (it stays silent then).
    expect(await sounds(page)).toContain('voice/yoshi/select');
  });

  test('tap targets are at least 44 px and everything fits the screen', async ({ page }) => {
    await loadScenario(page, 'mk8-ui-char');
    await settled(page, 3);
    await expectFits(page, '.mk8-scr-char .mk8-char-tile');
    await expectFits(page, '.mk8-scr-char .mk8-char-portrait', false);
    await expectFits(page, '.mk8-scr-char .mk8-nameplate', false);
    await expectFits(page, '.mk8-scr-char .mk8-hint');
  });
});
