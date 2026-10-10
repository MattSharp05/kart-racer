import { expect, test, type Page } from '@playwright/test';
import type { RenderInfo } from '../../src/game/testApi';
import { getState, loadScenario, step } from './helpers';

// MK-148: MK8 Mode split-screen on the synthetic test ramp (no pack, ADR 0009): a VS Race for 2–4
// people, each view with MK8's own HUD (item box, minimap, coins, lap, position, Lakitu) labelled
// with its player, races run to the end with every player marked on the results, and the menus'
// Players screen with each player picking a racer and kart in turn.

/** Countdown (3 s) and a moment more, in ticks. */
const PAST_GO = 4 * 60 + 30;

function renderInfo(page: Page): Promise<RenderInfo> {
  return page.evaluate(() => window.__game!.renderInfo());
}

/** Waits for two real frames, so the views and HUDs describe the current state. */
function frames(page: Page): Promise<unknown> {
  return page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

const hudOf = (page: Page, slot: number) =>
  page.locator(`.mk8-hud.mk8-hud-view[data-player="P${slot + 1}"]`);

/** Every kart on its autopilot, stepped until the race is over (every player finished). */
async function raceToEnd(page: Page, players: number, maxSeconds: number) {
  return page.evaluate(
    ({ players, limit }) => {
      const game = window.__game!;
      for (let slot = 0; slot < players; slot++) game.setAutopilot(slot, true);
      for (let tick = 0; tick < limit * 60; tick += 60) {
        const state = game.step(60, { render: tick % 600 === 0 });
        if (state.phase === 'finished') break;
      }
      const state = game.getState();
      return {
        phase: state.phase,
        finished: state.slotKarts.map((id) => state.karts[id]!.race.finishTick !== undefined),
        laps: state.slotKarts.map((id) => state.karts[id]!.race.lapTimes.length),
      };
    },
    { players, limit: maxSeconds },
  );
}

test.describe('MK8 split-screen (MK-148)', () => {
  for (const players of [2, 4]) {
    test(`mk8-local-${players}p: ${players} views, MK8's HUD in each, the race runs to the end and the results mark every player`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await loadScenario(page, `mk8-local-${players}p`, { paused: true });
      const start = await getState(page);
      expect(start.trackId).toBe('mk8-test-ramp');
      expect(start.itemSet).toBe('mk8');
      expect(start.slotKarts).toEqual(Array.from({ length: players }, (_, i) => i));
      // MK8 racers for the players and the CPUs filling the grid.
      expect(start.karts.slice(0, players).map((k) => k.controller)).toEqual(
        Array(players).fill('local'),
      );
      expect(start.karts.every((k) => k.kartType.startsWith('mk8-'))).toBe(true);
      await page.evaluate(() => window.__game!.step(1, { render: true }));
      await frames(page);
      const info = await renderInfo(page);
      expect(info.views!.map((v) => v.kartId)).toEqual(start.slotKarts);
      expect(info.steppedDown).toBe(players >= 3);

      // One MK8 HUD per view, labelled, in its view's part of the screen; our HUD keeps only effects.
      await expect(page.locator('.mk8-hud.mk8-hud-view:visible')).toHaveCount(players);
      await expect(page.locator('.hud.hud-view .hud-lap:visible')).toHaveCount(0);
      const viewport = page.viewportSize()!;
      for (const view of info.views!) {
        const hud = hudOf(page, view.slot);
        await expect(hud.locator('.mk8-hud-player')).toHaveText(`P${view.slot + 1}`);
        const box = (await hud.boundingBox())!;
        expect(box.x).toBeCloseTo(view.rect.x * viewport.width, 0);
        expect(box.y).toBeCloseTo(view.rect.y * viewport.height, 0);
        expect(box.width).toBeCloseTo(view.rect.w * viewport.width, 0);
        // Lakitu's start light in every view during the countdown, and its item box.
        await expect(hud.locator('.mk8-hud-lakitu')).toBeVisible();
        await expect(hud.locator('.mk8-hud-item')).toBeVisible();
      }

      // Racing: each view's position is its own player's.
      const racing = await step(page, PAST_GO + 120);
      await frames(page);
      for (const slot of start.slotKarts) {
        const position = racing.positions.indexOf(slot) + 1;
        await expect(hudOf(page, slot).locator('.mk8-hud-position')).toHaveAttribute(
          'data-position',
          String(position),
        );
      }

      const end = await raceToEnd(page, players, 200);
      expect(end).toEqual({
        phase: 'finished',
        finished: Array(players).fill(true),
        laps: Array(players).fill(3),
      });
      await page.evaluate(() => window.__game!.resume());
      const rows = page.locator('.mk8-scr-results .mk8-res-row[data-player]');
      await expect(rows).toHaveCount(players, { timeout: 15_000 });
      const labels = await rows.locator('.mk8-res-player').allTextContents();
      expect(labels.sort()).toEqual(Array.from({ length: players }, (_, i) => `P${i + 1}`));
    });
  }

  test('mk8-local-3p: three views with MK8 HUDs and the race overview in the fourth quadrant', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-local-3p', { paused: true });
    await page.evaluate(() => window.__game!.step(1, { render: true }));
    await frames(page);
    const info = await renderInfo(page);
    expect(info.views).toHaveLength(3);
    expect(info.steppedDown).toBe(true);
    await expect(page.locator('.mk8-hud.mk8-hud-view:visible')).toHaveCount(3);
    await expect(page.locator('.hud-overview')).toBeVisible();
    await expect(page.locator('.hud-overview .hud-overview-order li[data-player]')).toHaveCount(3);
  });

  test('mk8-local-2p-results: the results mark P1 2nd and P2 5th', async ({ page }) => {
    await loadScenario(page, 'mk8-local-2p-results');
    const rows = page.locator('.mk8-scr-results .mk8-res-row');
    await expect(rows).toHaveCount(8, { timeout: 15_000 });
    await expect(rows.nth(1)).toHaveAttribute('data-player', 'P1');
    await expect(rows.nth(4)).toHaveAttribute('data-player', 'P2');
    await expect(page.locator('.mk8-res-row.is-you')).toHaveCount(2);
  });

  test('P2’s pause opens MK8’s pause menu saying who paused', async ({ page }) => {
    await loadScenario(page, 'mk8-local-2p');
    await expect(page.locator('.mk8-hud.mk8-hud-view:visible')).toHaveCount(2);
    await page.evaluate(() => window.__game!.pressPause(1));
    await expect(page.locator('.mk8-scr-pause')).toBeVisible();
    await expect(page.locator('.mk8-scr-pause .mk8-hdr')).toContainText('Paused by P2');
    await expect(page.locator('.mk8-hud:visible')).toHaveCount(0);
  });

  test('menus: 2 players each pick a racer and a kart in turn; the race seats both picks', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loadScenario(page, 'mk8-ui-players');
    const mk8 = page.locator('.mk8');
    const settled = async (depth: number) => {
      await expect(mk8).toHaveAttribute('data-depth', String(depth));
      await expect(mk8).toHaveAttribute('data-transitioning', 'false');
    };
    await settled(3);
    const tiles = page.locator('.mk8-scr-players .mk8-wide');
    await expect(tiles).toHaveCount(4);
    await expect(tiles.nth(1)).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('Enter');
    await settled(4);
    await expect(page.locator('.mk8-scr-char .mk8-hdr')).toContainText('P1: Choose your character');
    // P1: Mario (the first racer), then their kart.
    await page.keyboard.press('Enter');
    await settled(5);
    await expect(page.locator('.mk8-scr-kart .mk8-hdr')).toContainText('P1: Customize');
    await page.keyboard.press('Enter');
    // P2 starts on the racer after P1's: Luigi; one to the right is Peach.
    await settled(6);
    await expect(page.locator('.mk8-scr-char').last().locator('.mk8-hdr')).toContainText(
      'P2: Choose your character',
    );
    await expect(page.locator('.mk8-char-tile.is-selected .mk8-p1').last()).toHaveText('P2');
    // Back: P1's kart again (P1 picks), then on to P2 once more.
    await page.keyboard.press('Escape');
    await settled(5);
    expect(await page.evaluate(() => window.__mk8?.flow?.picking)).toBe(0);
    await page.keyboard.press('Enter');
    await settled(6);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await settled(7);
    await expect(page.locator('.mk8-scr-kart').last().locator('.mk8-hdr')).toContainText(
      'P2: Customize',
    );
    await page.keyboard.press('Enter');
    // The VS settings, the Mushroom Cup, its first course.
    await settled(8);
    await expect(page.locator('.mk8-scr-vs')).toBeVisible();
    const flow = await page.evaluate(() => window.__mk8?.flow);
    expect(flow).toMatchObject({ mode: 'vs', players: 2, loadout: { racer: 'mk8-mario' } });
    expect(flow?.others?.[0]?.racer).toBe('mk8-peach');
    await page.keyboard.press('Enter');
    await settled(9);
    await page.keyboard.press('Enter');
    await expect(page.locator('.mk8-cup')).toHaveAttribute('data-phase', 'course');
    await page.keyboard.press('Enter');
    await expect(page.locator('.mk8')).toHaveCount(0, { timeout: 30_000 });
    const state = await getState(page);
    expect(state.slotKarts).toEqual([0, 1]);
    expect(state.karts[0]!.loadout?.racer).toBe('mk8-mario');
    expect(state.karts[1]!.kartType).toBe('mk8-peach');
    expect(state.karts[1]!.loadout?.racer).toBe('mk8-peach');
    expect(state.karts.filter((k) => k.controller === 'local')).toHaveLength(2);
    await frames(page);
    expect((await renderInfo(page)).views).toHaveLength(2);
  });
});
