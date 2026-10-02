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
