import { expect, test, type Page } from '@playwright/test';
import { getState, loadScenario } from './helpers';
import { servePack } from './mk8';

// MK-123: Sweet Sweet Canyon on the real MK8 pack, built with the course's `materials.ts`. Local
// only (ADR 0009: CI never has the pack): `MK8_OUT=<pack> pnpm test:e2e tests/e2e/mk8Canyon.spec.ts`.
// Skipped without `MK8_OUT`.
const PACK = process.env.MK8_OUT;

/**
 * TDD v3's per-course budgets at the grid (desktop). Canyon's grid is over the 300 draw calls by a
 * few (314 at full quality, 300 at `quality=low`: the course is ~110, the 8 karts the rest), an
 * overrun listed on MK-123; this keeps it from growing.
 */
const DRAW_CALL_BUDGET = 320;
const TRIANGLE_BUDGET = 400_000;

/** Kart 0 on the autopilot until it finishes (or `maxSeconds`): its laps, glides and respawns. */
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
    const mine = game.events().filter((e) => 'kartId' in e && e.kartId === 0);
    return {
      finished: kart.race.finishTick !== undefined,
      lapTimes: kart.race.lapTimes.length,
      phase: state.phase,
      glides: mine.filter((e) => e.type === 'glideOpen').length,
      respawns: mine.filter((e) => e.type === 'respawn').length,
    };
  }, maxSeconds);
}

test.describe('Sweet Sweet Canyon on the real pack (MK-123, local only)', () => {
  test.skip(!PACK, 'needs the real MK8 pack: MK8_OUT=<pack>');
  // Real course, software GL: whole races take a minute or two.
  test.setTimeout(300_000);

  test.beforeEach(async ({ page }) => {
    await servePack(page, { dir: PACK });
  });

  test('mk8-canyon-race: within the draw and triangle budgets at the grid; the player finishes 3 laps, gliding each lap', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-canyon-race', { paused: true });
    const state = await getState(page);
    expect(state.trackId).toBe('mk8-canyon');
    expect(state.karts).toHaveLength(8);
    await page.evaluate(() => window.__game!.step(1, { render: true }));
    const info = await page.evaluate(() => window.__game!.renderInfo());
    console.log(
      `Sweet Sweet Canyon at the grid: ${info.calls} draw calls, ${info.triangles} triangles`,
    );
    expect(info.calls).toBeLessThan(DRAW_CALL_BUDGET);
    expect(info.triangles).toBeLessThan(TRIANGLE_BUDGET);
    expect(await raceToFinish(page, 240)).toEqual({
      finished: true,
      lapTimes: 3,
      phase: 'finished',
      glides: 3,
      respawns: 0,
    });
  });

  test('mk8-canyon-glide: off the glide board and over the soda lake onto the giant cake', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-canyon-glide', { paused: true });
    const flight = await page.evaluate(() => {
      const game = window.__game!;
      game.setAutopilot(0, true);
      let glided = false;
      for (let i = 0; i < 40; i += 1) {
        const kart = game.step(15).karts[0]!;
        glided ||= kart.glide !== undefined;
        if (glided && kart.grounded) return { glided, y: kart.position.y, x: kart.position.x };
      }
      return { glided, y: NaN, x: NaN };
    });
    expect(flight.glided).toBe(true);
    // The deck round the giant cake is 10 m above the glide board, 110 m west of it.
    expect(flight.y).toBeGreaterThan(25);
    expect(flight.x).toBeLessThan(-60);
  });

  test('mk8-canyon-soda: under the soda, then anti-gravity up the candy ribbons', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-canyon-soda', { paused: true });
    const seen = await page.evaluate(() => {
      const game = window.__game!;
      game.setAutopilot(0, true);
      let water = false;
      let antigrav = false;
      for (let i = 0; i < 40 && !(water && antigrav); i += 1) {
        const kart = game.step(15).karts[0]!;
        water ||= kart.inWater === true;
        antigrav ||= kart.antigrav === true;
      }
      return { water, antigrav };
    });
    expect(seen).toEqual({ water: true, antigrav: true });
  });
});
