import { expect, test, type Page } from '@playwright/test';
import { getState, loadScenario } from './helpers';
import { servePack } from './mk8';

// MK-122: Water Park. Without a pack (CI) its scenarios say so; the drive checks need the real MK8
// pack (ADR 0009: CI never has it): `MK8_OUT=<pack> pnpm test:e2e tests/e2e/mk8WaterPark.spec.ts`.
const PACK = process.env.MK8_OUT;
const SCENARIOS = ['mk8-waterpark-race', 'mk8-waterpark-free', 'mk8-waterpark-underwater'];

/** TDD v3's per-course budgets at the grid (desktop). */
const DRAW_CALL_BUDGET = 300;
const TRIANGLE_BUDGET = 400_000;

/** Kart 0 on the autopilot until it finishes (or `maxSeconds`): its laps and the race's phase. */
function raceToFinish(page: Page, maxSeconds: number) {
  return page.evaluate((limit) => {
    const game = window.__game!;
    game.setAutopilot(0, true);
    for (let tick = 0; tick < limit * 60; tick += 60) {
      const kart = game.step(60).karts[0]!;
      if (kart.race.finishTick !== undefined) break;
    }
    const state = game.getState();
    const kart = state.karts[0]!;
    return {
      finished: kart.race.finishTick !== undefined,
      lapTimes: kart.race.lapTimes.length,
      phase: state.phase,
      respawns: game.events().filter((e) => e.type === 'respawn' && e.kartId === 0).length,
    };
  }, maxSeconds);
}

test.describe('Water Park without a pack (MK-122)', () => {
  for (const name of SCENARIOS) {
    test(`${name} shows "MK8 pack not installed"`, async ({ page }) => {
      await loadScenario(page, name);
      await expect(page.locator('.menu-mk8NotInstalled')).toContainText('MK8 pack not installed');
    });
  }
});

test.describe('Water Park on the real pack (MK-122, local only)', () => {
  test.skip(!PACK, 'needs the real MK8 pack: MK8_OUT=<pack>');
  // Real course, software GL: a whole race takes a minute or two.
  test.setTimeout(300_000);

  test('mk8-waterpark-race: within the draw and triangle budgets at the grid; the player finishes 3 laps', async ({
    page,
  }) => {
    await servePack(page, { dir: PACK });
    await loadScenario(page, 'mk8-waterpark-race', { paused: true });
    const state = await getState(page);
    expect(state.trackId).toBe('mk8-waterpark');
    expect(state.karts).toHaveLength(8);
    await page.evaluate(() => window.__game!.step(1, { render: true }));
    const info = await page.evaluate(() => window.__game!.renderInfo());
    console.log(`Water Park at the grid: ${info.calls} draw calls, ${info.triangles} triangles`);
    expect(info.calls).toBeLessThan(DRAW_CALL_BUDGET);
    expect(info.triangles).toBeLessThan(TRIANGLE_BUDGET);
    expect(await raceToFinish(page, 240)).toEqual({
      finished: true,
      lapTimes: 3,
      phase: 'finished',
      respawns: 0,
    });
  });

  test('mk8-waterpark-underwater: the kart is in the water, and leaves it up the ring', async ({
    page,
  }) => {
    await servePack(page, { dir: PACK });
    await loadScenario(page, 'mk8-waterpark-underwater', { paused: true });
    const seen = await page.evaluate(() => {
      const game = window.__game!;
      game.setAutopilot(0, true);
      const water: boolean[] = [];
      // Up to 24 s: the course is 3× its pack size (MK-105 revisit), so is the swim to the ring.
      for (let i = 0; i < 48 && !(i > 0 && water.at(-1) === false); i += 1)
        water.push(game.step(30).karts[0]!.inWater === true);
      return {
        first: water[0],
        left: water.indexOf(false) > 0,
        antigrav: game.getState().karts[0]!.antigrav,
      };
    });
    expect(seen).toEqual({ first: true, left: true, antigrav: true });
  });

  test('&quality=low draws the course’s low-texture model', async ({ page }) => {
    const { requested } = await servePack(page, { dir: PACK });
    await page.goto('/?scenario=mk8-waterpark-free&paused=1&quality=low');
    await page.waitForFunction(() => window.__game?.ready === true);
    await page.evaluate(() => window.__game!.whenReady());
    expect((await getState(page)).trackId).toBe('mk8-waterpark');
    expect(requested).toContain('models/courses/water-park/course-low.glb');
    expect(requested).not.toContain('models/courses/water-park/course.glb');
  });
});
