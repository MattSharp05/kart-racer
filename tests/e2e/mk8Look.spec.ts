import { expect, test, type Page } from '@playwright/test';
import { loadScenario } from './helpers';

// MK-125: an MK8 course’s look and ambience, on the look ramp (the synthetic test ramp; no pack in
// CI, ADR 0009).
// Mario Kart Stadium's own look is checked locally with the pack (`mk8Stadium.spec.ts`).

/** TDD v3's per-course desktop budgets. */
const DRAW_CALL_BUDGET = 300;
const TRIANGLE_BUDGET = 400_000;
const CROWD = 'course/mario-kart-stadium/ambience';

/** Opens a scenario paused, with extra query parameters (`quality=low`, `reduced-motion=1`). */
async function open(page: Page, scenario: string, extra = '') {
  await page.goto(`/?scenario=${scenario}&paused=1${extra}`);
  await page.waitForFunction(() => window.__game?.ready === true);
  await page.evaluate(() => window.__game!.whenReady());
  return page.evaluate(() => {
    window.__game!.step(2, { render: true });
    return { info: window.__game!.renderInfo(), look: window.__mk8Look!() };
  });
}

const ambience = (page: Page) => page.evaluate(() => [...(window.__mk8Ambience ?? [])]);

test.describe('MK8 course look (MK-125)', () => {
  // Software GL in CI draws the bloom passes slowly: a small window, and room for page loads.
  test.use({ viewport: { width: 640, height: 360 } });
  test.setTimeout(120_000);

  test('full quality post-processes within the desktop budget; low quality adds no post-processing', async ({
    context,
    page,
  }) => {
    const full = await open(page, 'mk8-test-look-start');
    console.log(
      `Look ramp, full quality: ${full.info.calls} draw calls, ${full.info.triangles} triangles`,
    );
    expect(full.look).toMatchObject({ post: true, toneMapping: 4 /* ACES */, fog: true, water: 1 });
    expect(full.info.calls).toBeLessThan(DRAW_CALL_BUDGET);
    expect(full.info.triangles).toBeLessThan(TRIANGLE_BUDGET);

    // A fresh page: WebKit's software GL can lose a second navigation's context (0 draw calls).
    await page.close();
    const low = await open(await context.newPage(), 'mk8-test-look-start', '&quality=low');
    console.log(
      `Look ramp, low quality: ${low.info.calls} draw calls, ${low.info.triangles} triangles`,
    );
    expect(low.look).toMatchObject({ post: false, toneMapping: 0 /* none */, exposure: 1 });
    // Same scene; full quality adds only the post passes' full-screen triangles.
    expect(full.info.triangles - low.info.triangles).toBeGreaterThan(0);
    expect(full.info.triangles - low.info.triangles).toBeLessThan(50);
    expect(low.info.calls).toBeLessThan(full.info.calls);
  });

  test('boost motion blur while the followed kart boosts, not with reduced motion', async ({
    page,
  }) => {
    const boosting = await open(page, 'mk8-test-look-boost');
    expect(boosting.look.boost).toBeGreaterThan(0);
    const done = await page.evaluate(() => {
      window.__game!.step(150, { render: true });
      return window.__mk8Look!().boost;
    });
    expect(done).toBe(0);
    // Low quality has no post-processing at all (the first test), so no blur either.
    expect((await open(page, 'mk8-test-look-boost', '&reduced-motion=1')).look.boost).toBe(0);
  });

  test('the course ambience starts with the race and stops on pause and quit', async ({ page }) => {
    await loadScenario(page, 'mk8-test-look-start', { paused: true });
    await page.evaluate(() => window.__game!.step(1, { render: true }));
    expect(await ambience(page)).toEqual([]);

    await page.evaluate(() => window.__game!.resume());
    await expect.poll(() => ambience(page)).toEqual([`start ${CROWD}`]);

    await page.evaluate(() => window.__game!.pause());
    await expect.poll(() => ambience(page)).toEqual([`start ${CROWD}`, `stop ${CROWD}`]);

    // Racing again, then the pause menu's Quit (MK-121: back to MK8 Mode's menus, the race
    // stopped behind them): silent, and it stays silent.
    await page.evaluate(() => window.__game!.resume());
    await expect.poll(async () => (await ambience(page)).length).toBe(3);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /quit/i }).click();
    await expect
      .poll(() => ambience(page))
      .toEqual([`start ${CROWD}`, `stop ${CROWD}`, `start ${CROWD}`, `stop ${CROWD}`]);
    await expect(page.locator('.mk8').first()).toBeVisible();
    // A few frames of the loop behind the menus: nothing starts again.
    await page.evaluate(async () => {
      for (let i = 0; i < 10; i += 1) await new Promise((r) => requestAnimationFrame(r));
    });
    expect((await ambience(page)).at(-1)).toBe(`stop ${CROWD}`);
    expect(await page.evaluate(() => window.__game!.isPaused())).toBe(true);
  });
});
