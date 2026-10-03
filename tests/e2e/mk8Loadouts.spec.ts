import { expect, test, type Page } from '@playwright/test';
import { getState, loadScenario, setInput, step } from './helpers';
import { servePack } from './mk8';

// MK-102: MK8 loadouts. The karts lineup is drawn from the fixture pack's block parts (CI never
// has the real, local-only pack); the loadout races are plain sim scenarios.

const karts = (page: Page) => page.evaluate(() => window.__mk8!.stage!.karts());
const kartDrawCalls = (page: Page) => page.evaluate(() => window.__mk8!.stage!.kartDrawCalls());

const BODIES = ['standard-kart', 'pipe-frame', 'mach-8', 'cat-cruiser', 'b-dasher', 'sports-coupe'];

test.describe('MK8 loadouts', () => {
  test('the karts lineup: every body on its own tires at its wheel anchors, gliders folded', async ({
    page,
  }) => {
    const { requested } = await servePack(page);
    await loadScenario(page, 'mk8-karts-lineup', { paused: true });
    await expect(page.locator('.mk8-stage-canvas')).toBeVisible();
    await expect(page.locator('.mk8-stage-label')).toHaveCount(6);
    await expect(page.locator('.mk8-stage-label').first()).toHaveText('Standard Kart · Standard');
    const lineup = await karts(page);
    expect(lineup.map((k) => k.body)).toEqual(BODIES);
    expect(new Set(lineup.map((k) => k.tires)).size).toBe(4);
    for (const kart of lineup) {
      expect(kart.gliderOpen).toBe(false);
      expect(kart.wheels).toHaveLength(4);
      const [fl, fr, rl, rr] = kart.wheels;
      // Front wheels ahead (−Z) of the rear ones, left and right mirrored.
      expect(fl![2]).toBeLessThan(rl![2]);
      expect(fl![0]).toBeCloseTo(-fr![0]);
      expect(rl![0]).toBeCloseTo(-rr![0]);
    }
    // Bodies put their wheels in different places; bigger tires stand taller.
    expect(new Set(lineup.map((k) => k.wheels[0]![2].toFixed(3))).size).toBeGreaterThan(2);
    const height = (tires: string) => lineup.find((k) => k.tires === tires)!.wheels[0]![1];
    expect(height('monster-tires')).toBeGreaterThan(height('standard-tires'));
    // Folded gliders aren't drawn; opened, each kart draws its glider too.
    const folded = await kartDrawCalls(page);
    for (const n of folded) expect(n).toBeGreaterThan(0);
    await page.evaluate(() => window.__mk8!.stage!.openGliders(true));
    expect((await karts(page)).every((k) => k.gliderOpen)).toBe(true);
    const open = await kartDrawCalls(page);
    open.forEach((n, i) => expect(n).toBeGreaterThan(folded[i]!));
    for (const glider of ['paper-glider', 'cloud-glider', 'peach-parasol'])
      expect(requested).toContain(`models/karts/gliders/${glider}.glb`);
    expect(requested).not.toContain('models/racers/mario.glb');
  });

  test('changing parts changes the kart physics: speed after 3 s differs', async ({ page }) => {
    /** Speed after 1 s and 3 s of full throttle from rest. */
    const speeds = async (scenario: string) => {
      await loadScenario(page, scenario, { paused: true });
      await setInput(page, 0, { throttle: 1 });
      const at1 = (await step(page, 60)).karts[0]!.speed;
      const at3 = (await step(page, 120)).karts[0]!.speed;
      return { at1, at3 };
    };
    const heavy = await speeds('mk8-loadout-heavy');
    const light = await speeds('mk8-loadout-light');
    // The light kart (acceleration 3.25) gets away first; by 3 s the heavy one (speed 5.75) is
    // past it on the way to its higher top speed.
    expect(light.at1).toBeGreaterThan(heavy.at1 + 0.3);
    expect(heavy.at3).toBeGreaterThan(light.at3 + 0.3);
    expect((await getState(page)).karts[0]!.loadout?.racer).toBe('mk8-toad');
  });

  test('without a pack the karts lineup says how to build it', async ({ page }) => {
    await loadScenario(page, 'mk8-karts-lineup');
    await expect(page.locator('.menu-mk8NotInstalled')).toContainText('MK8 pack not installed');
  });
});
