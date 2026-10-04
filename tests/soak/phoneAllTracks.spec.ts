import { devices, expect, test, type Page } from '@playwright/test';
import { servePack } from '../e2e/mk8';

/**
 * Phone perf on every track (MK-71; MK8 courses MK-133, below): can a mid-range phone's CPU keep a race at ≥ 30 fps on each
 * of the 6 tracks, at the quality adaptive quality settles on for a slow phone (`&quality=low`:
 * pixel ratio 1, low-quality mode) and at full quality? A Pixel 7 landscape profile with its CPU
 * throttled 4× (Chrome DevTools' "mid-range mobile") races `track-<id>` (you on autopilot + 7 AI,
 * 150cc, items on).
 *
 * Method (as MK-73's `onlinePhone.spec.ts`): without a GPU, WebGL is drawn by SwiftShader on the
 * CPU and throttling slows that too, so frame rate itself only measures SwiftShader. Instead the
 * main thread's work is timed on the throttled CPU: `tickMs`, one sim tick (60 a second), and
 * `renderMs`, one drawn frame's JavaScript (the game's requestAnimationFrame callback: scene update
 * and three.js submitting the draw calls; the GPU's work happens after it). The CPU's frame rate is
 * then (1000 ms − 60 × tickMs) / renderMs. Opt-in (`pnpm test:soak`): minutes per track, and
 * timing-sensitive, so run it alone in CI's Playwright image.
 */

const PIXEL = devices['Pixel 7 landscape'];
const TRACKS = [
  'sunny-circuit',
  'dune-canyon',
  'frostpeak-pass',
  'neon-harbour',
  'canopy-rush',
  'cog-works',
];
/**
 * MK8 courses (MK-133): the synthetic test ramp race with the fixture pack always; the 4 real
 * courses with `MK8_OUT=<pack>` (local only, ADR 0009).
 */
const MK8_PACK = process.env.MK8_OUT;
const MK8_SCENARIOS = [
  { scenario: 'mk8-test-race', real: false },
  ...['mk8-stadium-race', 'mk8-waterpark-race', 'mk8-canyon-race', 'mk8-ruins-race'].map(
    (scenario) => ({ scenario, real: true }),
  ),
];
const RACES = [
  ...TRACKS.map((track) => ({ name: track, scenario: `track-${track}`, pack: undefined })),
  ...MK8_SCENARIOS.map(({ scenario, real }) => ({
    name: scenario,
    scenario,
    pack: real ? (MK8_PACK ?? null) : ('fixture' as const),
  })),
];
const QUALITIES = ['low', 'full'] as const;
/** 4× CPU throttle: Chrome DevTools' "mid-range mobile" preset. */
const THROTTLE = 4;
const MIN_FPS = 30;
/** Past the countdown and the start, then this much racing measured. */
const SETTLE_TICKS = 5 * 60;
const MEASURE_SECONDS = 20;
const CHUNK = 3;
/** Draw every this many chunks (a drawn frame per 12 ticks: 5 a second of race). */
const DRAW_EVERY = 4;
/** A drawn frame's callback takes at least this long, ms (the paused loop's idle ones don't). */
const DRAWN_FRAME_MS = 0.5;

function quantile(values: number[], q = 0.5): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
}

/** Steps `CHUNK` ticks without drawing (timed, ms per tick); if `draw`, asks for a redraw. */
function stepPhone(page: Page, draw: boolean): Promise<number> {
  return page.evaluate(
    ([ticks, redraw]) => {
      const game = window.__game!;
      const start = performance.now();
      game.step(ticks, { render: false });
      const tickMs = (performance.now() - start) / ticks;
      // The next animation frames draw the race (timed by the init script's wrapper).
      if (redraw) game.step(0, { render: true });
      return tickMs;
    },
    [CHUNK, draw] as const,
  );
}

test.describe('phone perf on every track (MK-71)', () => {
  for (const { name: track, scenario, pack } of RACES) {
    for (const quality of QUALITIES) {
      test(`a 4×-throttled Pixel 7's CPU keeps ≥ ${MIN_FPS} fps on ${track} (${quality} quality)`, async ({
        browser,
        browserName,
      }) => {
        test.skip(browserName !== 'chromium', 'CPU throttling is a Chrome DevTools feature');
        test.skip(pack === null, 'needs the real MK8 pack: MK8_OUT=<pack>');
        test.skip(quality === 'full' && !process.env.FULL_QUALITY, 'FULL_QUALITY=1 adds these');
        test.setTimeout(480_000);
        const context = await browser.newContext({
          viewport: PIXEL.viewport,
          deviceScaleFactor: PIXEL.deviceScaleFactor,
          isMobile: PIXEL.isMobile,
          hasTouch: PIXEL.hasTouch,
          userAgent: PIXEL.userAgent,
        });
        await context.addInitScript(() => {
          const w = window as unknown as { __frameMs: number[] };
          w.__frameMs = [];
          const raf = window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame = (callback) =>
            raf((time) => {
              const start = performance.now();
              callback(time);
              w.__frameMs.push(performance.now() - start);
            });
        });
        const page = await context.newPage();
        if (pack) await servePack(page, pack === 'fixture' ? {} : { dir: pack });
        const q = quality === 'low' ? '&quality=low' : '';
        await page.goto(`/?scenario=${scenario}&paused=1${q}`);
        await page.waitForFunction(() => window.__game?.ready === true);
        await page.evaluate(() => window.__game!.whenReady());
        await page.evaluate(() => window.__game!.setAutopilot(0, true));
        await page.evaluate((n) => window.__game!.step(n, { render: false }), SETTLE_TICKS);
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
        await page.evaluate(() => {
          (window as unknown as { __frameMs: number[] }).__frameMs.length = 0;
        });

        const ticks: number[] = [];
        const calls: number[] = [];
        const rounds = (MEASURE_SECONDS * 60) / CHUNK;
        for (let round = 0; round < rounds; round += 1) {
          const draw = round % DRAW_EVERY === 0;
          ticks.push(await stepPhone(page, draw));
          if (draw) calls.push(await page.evaluate(() => window.__game!.renderInfo().calls));
        }
        const state = await page.evaluate(() => window.__game!.getState());
        const renders = (
          await page.evaluate(() => (window as unknown as { __frameMs: number[] }).__frameMs)
        ).filter((ms) => ms >= DRAWN_FRAME_MS);
        const tickMs = ticks.reduce((a, b) => a + b, 0) / ticks.length;
        const renderMs = quantile(renders);
        const simPerSecond = 60 * tickMs;
        const cpuFps = (1000 - simPerSecond) / renderMs;
        console.log(
          `${track} (${quality}) at ${THROTTLE}× CPU: tick ${tickMs.toFixed(2)} ms (p95 ` +
            `${quantile(ticks, 0.95).toFixed(2)}), draw ${renderMs.toFixed(1)} ms (p95 ` +
            `${quantile(renders, 0.95).toFixed(1)}, ${renders.length} frames), draw calls max ` +
            `${Math.max(...calls)} → sim ${simPerSecond.toFixed(0)} ms/s, CPU frame rate ` +
            `${cpuFps.toFixed(0)} fps (frame at 30 fps: ${(simPerSecond / 30 + renderMs).toFixed(1)} ms of 33.3)`,
        );
        expect(state.phase).toBe('racing');
        expect(renders.length).toBeGreaterThan(rounds / DRAW_EVERY / 2);
        expect(cpuFps).toBeGreaterThanOrEqual(MIN_FPS);
        await context.close();
      });
    }
  }
});
