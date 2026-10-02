import { expect, test } from '@playwright/test';
import { scenarios } from '../../src/scenarios';
import { loadScenario } from './helpers';

// Every `*-overview` scenario (MK-79/MK-90): the camera looks straight down and the whole track is
// in view, on every track. One test each, so a slow track's scenery doesn't add up to a long test.
const OVERVIEWS = scenarios
  .list()
  .map((scenario) => scenario.name)
  .filter((name) => name.endsWith('-overview'));

test('there is an overview scenario for every race track', () => {
  for (const name of [
    'sunny-overview',
    'dune-canyon-overview',
    'frostpeak-overview',
    'neon-harbour-overview',
    'canopy-overview',
    'cog-works-overview',
  ]) {
    expect(OVERVIEWS).toContain(name);
  }
});

for (const name of OVERVIEWS) {
  test(`${name} shows the whole track from above`, async ({ page }) => {
    await loadScenario(page, name, { paused: true });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    const camera = await page.evaluate(() => window.__game!.renderInfo().camera);
    expect(camera?.lookDown).toBeGreaterThan(0.999);
    expect(camera?.trackInView).toBe(1);
  });
}

// MK-91: a page in the overview that loads a state on another track frames the track it now draws,
// not the one it launched with. Big to small, so a camera still framing the launch track (too
// high) and a `trackInView` still measuring it (part of it out of view) each fail on their own.
test('the overview follows a track swap', async ({ page, context }) => {
  const fresh = await context.newPage();
  await loadScenario(fresh, 'oval-overview', { paused: true });
  await fresh.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  const ovalHeight = await fresh.evaluate(() => window.__game!.renderInfo().camera?.height);
  await fresh.close();

  await loadScenario(page, 'canopy-overview', { paused: true });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  const canopyHeight = await page.evaluate(() => window.__game!.renderInfo().camera?.height);
  expect(await page.evaluate(() => window.__game!.loadState!('oval-overview'))).toBe(true);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  const info = await page.evaluate(() => window.__game!.renderInfo());
  expect(info.trackId).toBe('test-oval');
  expect(info.camera?.lookDown).toBeGreaterThan(0.999);
  expect(info.camera?.height).toBeCloseTo(ovalHeight!, 3);
  expect(info.camera?.height).toBeLessThan(canopyHeight!);
  expect(info.camera?.trackInView).toBe(1);
});
