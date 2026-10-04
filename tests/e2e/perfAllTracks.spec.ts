import { expect, test, type Page } from '@playwright/test';
import { loadScenario, step } from './helpers';
import { servePack } from './mk8';

/**
 * Draw-call and triangle budgets on every race track (MK-71). Unlike frame rate (CI draws WebGL in
 * software, so fps there measures SwiftShader), these are the same on every machine. The heaviest
 * frames are at the start, with the whole pack in view, so the race is sampled on the grid, just
 * after GO and then through the first lap; every sample must stay within budget.
 * The throttled-phone frame-time check is opt-in: `tests/soak/phoneAllTracks.spec.ts`.
 */
const TRACKS = [
  'sunny-circuit',
  'dune-canyon',
  'frostpeak-pass',
  'neon-harbour',
  'canopy-rush',
  'cog-works',
];
/** Per-frame budgets (docs/TDD.md → Perf): draw calls and triangles. */
const MAX_CALLS = 150;
const MAX_TRIANGLES = 150_000;
/** Ticks stepped before each sample: the grid in countdown, just after GO, then along lap 1. */
const SAMPLE_STEPS = [0, 250, 300, 600, 600];
/** Draw calls and triangles are the same at any size; these run where drawing is quick. */
const PROJECTS = ['desktop-chrome'];

test.describe('perf budgets on every track (MK-71)', { tag: '@full' }, () => {
  for (const track of TRACKS) {
    test(`track-${track}: every sampled frame stays within ${MAX_CALLS} draw calls and ${MAX_TRIANGLES / 1000}k triangles`, async ({
      page,
    }, info) => {
      test.skip(!PROJECTS.includes(info.project.name), 'budgets are device-independent');
      test.setTimeout(60_000);
      await loadScenario(page, `track-${track}`, { paused: true });
      await page.evaluate(() => window.__game!.setAutopilot(0, true));
      const samples: { tick: number; calls: number; triangles: number }[] = [];
      for (const ticks of SAMPLE_STEPS) {
        const state = await step(page, ticks);
        // Let a real frame draw so renderer.info describes this moment.
        await page.evaluate(
          () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
        );
        const { calls, triangles } = await page.evaluate(() => window.__game!.renderInfo());
        samples.push({ tick: state.tick, calls, triangles });
      }
      console.log(`${track} (${info.project.name}): ${JSON.stringify(samples)}`);
      for (const sample of samples) {
        expect(sample.calls, `draw calls at tick ${sample.tick}`).toBeLessThan(MAX_CALLS);
        expect(sample.triangles, `triangles at tick ${sample.tick}`).toBeLessThan(MAX_TRIANGLES);
      }
    });
  }
});

/**
 * MK8 courses (MK-133): TDD v3's per-course budgets, at full and low quality. CI has no pack
 * (ADR 0009), so it checks the synthetic test ramp race with the fixture pack's racers, karts and
 * items (not `@full`: it runs on PRs); the 4 real courses run locally with
 * `MK8_OUT=<pack> pnpm exec playwright test tests/e2e/perfAllTracks.spec.ts -g MK8`.
 */
const MK8_PACK = process.env.MK8_OUT;
const MK8_MAX_CALLS = 300;
const MK8_MAX_TRIANGLES = 400_000;
const MK8_REAL = ['mk8-stadium-race', 'mk8-waterpark-race', 'mk8-canyon-race', 'mk8-ruins-race'];
/** The grid, just after GO, then 15 s of lap 1 (the courses' heaviest views are early on). */
const MK8_SAMPLE_STEPS = [0, 250, 300, 300, 300];

async function sampleMk8(page: Page, scenario: string, quality: 'full' | 'low') {
  const q = quality === 'low' ? '&quality=low' : '';
  await page.goto(`/?scenario=${scenario}&paused=1${q}`);
  await page.waitForFunction(() => window.__game?.ready === true);
  await page.evaluate(() => window.__game!.whenReady());
  await page.evaluate(() => window.__game!.setAutopilot(0, true));
  const samples: { tick: number; calls: number; triangles: number }[] = [];
  for (const ticks of MK8_SAMPLE_STEPS) {
    const state = await step(page, ticks);
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const { calls, triangles } = await page.evaluate(() => window.__game!.renderInfo());
    samples.push({ tick: state.tick, calls, triangles });
  }
  console.log(`${scenario} (${quality}): ${JSON.stringify(samples)}`);
  for (const sample of samples) {
    expect(sample.calls, `draw calls at tick ${sample.tick}`).toBeLessThan(MK8_MAX_CALLS);
    expect(sample.triangles, `triangles at tick ${sample.tick}`).toBeLessThan(MK8_MAX_TRIANGLES);
  }
}

test.describe('perf budgets on MK8 courses (MK-133)', () => {
  for (const quality of ['full', 'low'] as const) {
    test(`mk8-test-race (${quality} quality): every sampled frame within ${MK8_MAX_CALLS} draw calls and ${MK8_MAX_TRIANGLES / 1000}k triangles`, async ({
      page,
    }, info) => {
      test.skip(!PROJECTS.includes(info.project.name), 'budgets are device-independent');
      test.setTimeout(60_000);
      await servePack(page);
      await sampleMk8(page, 'mk8-test-race', quality);
    });
    for (const scenario of MK8_REAL) {
      test(`${scenario} on the real pack (${quality} quality): every sampled frame within budget`, async ({
        page,
      }, info) => {
        test.skip(!MK8_PACK, 'needs the real MK8 pack: MK8_OUT=<pack>');
        test.skip(!PROJECTS.includes(info.project.name), 'budgets are device-independent');
        test.setTimeout(180_000);
        await servePack(page, { dir: MK8_PACK });
        await sampleMk8(page, scenario, quality);
      });
    }
  }
});
