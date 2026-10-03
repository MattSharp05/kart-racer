import { expect, test, type Page } from '@playwright/test';
import { loadScenario } from './helpers';
import { servePack } from './mk8';

// MK-101: MK8 racer models in the Standard Kart, and Lakitu, on the model stage. CI never has the
// real pack (ADR 0009): the fixture pack's block figures stand in for the racers.

type Hooks = NonNullable<NonNullable<Window['__mk8']>['stage']>;
const stage = (page: Page) =>
  page.evaluate(() => {
    const hooks = window.__mk8?.stage;
    return (
      hooks && {
        racers: hooks.racers,
        tick: hooks.tick(),
        lakitu: hooks.lakitu(),
        motion: hooks.motion(),
      }
    );
  });
const stepStage = (page: Page, ticks: number) =>
  page.evaluate((n) => window.__mk8!.stage!.step(n), ticks);
const drawCalls = (page: Page) => page.evaluate(() => (window.__mk8!.stage as Hooks).drawCalls());

const ROSTER = [
  'mario',
  'luigi',
  'peach',
  'daisy',
  'yoshi',
  'toad',
  'koopa-troopa',
  'shy-guy',
  'donkey-kong',
  'bowser',
  'wario',
  'waluigi',
];

test.describe('MK8 racers and Lakitu', () => {
  test('the lineup shows all 12 racers in their karts, each within 6 draw calls', async ({
    page,
  }) => {
    const { requested } = await servePack(page);
    await loadScenario(page, 'mk8-racers-lineup', { paused: true });
    await expect(page.locator('.mk8-stage-canvas')).toBeVisible();
    expect((await stage(page))?.racers).toEqual(ROSTER.map((id) => `mk8-${id}`));
    await expect(page.locator('.mk8-stage-label')).toHaveCount(12);
    await expect(page.locator('.mk8-stage-label').first()).toHaveText('Mario');
    const calls = await drawCalls(page);
    expect(calls).toHaveLength(12);
    for (const n of calls) {
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(6);
    }
    // Only the models it shows: every racer and the Standard Kart, no Lakitu.
    expect(requested).toContain('models/racers/waluigi.glb');
    expect(requested).toContain('models/karts/bodies/standard-kart.glb');
    expect(requested).not.toContain('models/npcs/lakitu.glb');
  });

  test('Lakitu holds the start light through the countdown, then leaves', async ({ page }) => {
    await servePack(page);
    await loadScenario(page, 'mk8-lakitu-countdown', { paused: true });
    const lakitu = async () => {
      const now = await stage(page);
      return { tick: now?.tick, pose: now?.lakitu };
    };
    let now = await lakitu();
    expect(now.tick).toBe(0);
    expect(now.pose?.visible).toBe(true);
    expect(now.pose?.light).toEqual({ red: 1, green: false });
    await stepStage(page, 60);
    expect((await lakitu()).pose?.light).toEqual({ red: 2, green: false });
    await stepStage(page, 60);
    expect((await lakitu()).pose?.light).toEqual({ red: 3, green: false });
    await stepStage(page, 60);
    now = await lakitu();
    expect(now.tick).toBe(180);
    expect(now.pose?.light).toEqual({ red: 0, green: true });
    // Gone once the race is under way.
    await stepStage(page, 60);
    expect((await lakitu()).pose?.visible).toBe(false);
  });

  test('Lakitu fishes a kart out on respawn: hooks it, lifts it, drops it', async ({ page }) => {
    await servePack(page);
    await loadScenario(page, 'mk8-lakitu-respawn', { paused: true });
    const pose = async () => (await stage(page))?.lakitu;
    expect((await pose())?.visible).toBe(true);
    expect((await pose())?.carrying).toBe(false);
    // tuning.respawnSeconds = 1.5 s = 90 ticks: hooked from 25 % to 80 %.
    await stepStage(page, 50);
    expect((await pose())?.carrying).toBe(true);
    await stepStage(page, 30);
    const dropped = await pose();
    expect(dropped?.visible).toBe(true);
    expect(dropped?.carrying).toBe(false);
    await stepStage(page, 10);
    expect((await pose())?.visible).toBe(false);
  });

  test('Lakitu shows the lap sign, then the final lap sign', async ({ page }) => {
    await servePack(page);
    await loadScenario(page, 'mk8-lakitu-lap', { paused: true });
    expect((await stage(page))?.lakitu?.sign).toBe('2');
    // 2.5 s sign + 0.5 s gap.
    await stepStage(page, 180 + 30);
    expect((await stage(page))?.lakitu?.sign).toBe('FINAL LAP');
  });

  test('the motion demo leans into its turns', async ({ page }) => {
    await servePack(page);
    await loadScenario(page, 'mk8-racer-motion', { paused: true });
    expect((await stage(page))?.motion?.lean).toBe(0);
    // Half a second into the first steering step: steering right, leaning right.
    await stepStage(page, 30);
    expect((await stage(page))?.motion?.lean).toBeGreaterThan(0.1);
    await expect(page.locator('.mk8-stage-caption')).toContainText('Steering');
  });

  test('a model that fails to load shows the error banner; Retry opens the stage', async ({
    page,
  }) => {
    const pack = await servePack(page, { failOnce: ['models/npcs/lakitu.glb'] });
    await loadScenario(page, 'mk8-lakitu-countdown', { paused: true });
    const banner = page.getByRole('alert');
    await expect(banner).toContainText('models/npcs/lakitu.glb');
    await banner.getByRole('button', { name: 'Retry' }).click();
    await page.evaluate(() => window.__game!.whenReady());
    await expect(page.locator('.mk8-stage-canvas')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect((await stage(page))?.lakitu?.visible).toBe(true);
    expect(pack.requested.filter((p) => p === 'models/npcs/lakitu.glb')).toHaveLength(2);
  });

  test('without a pack the model scenarios say how to build it', async ({ page }) => {
    await loadScenario(page, 'mk8-racers-lineup');
    await expect(page.locator('.menu-mk8NotInstalled')).toContainText('MK8 pack not installed');
  });
});
