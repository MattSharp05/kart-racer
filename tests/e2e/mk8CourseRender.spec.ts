import { expect, test } from '@playwright/test';
import { getState, loadScenario } from './helpers';
import { servePack } from './mk8';

// MK-105 revisit (B1, B2): every MK8 course on the real pack is drawn solid where it should be
// (the pack marks ~99 % of its materials see-through, so the road hid nothing behind it) and at 3×
// its pack size. Local only (ADR 0009: CI never has the pack):
// `MK8_OUT=<pack> pnpm test:e2e tests/e2e/mk8CourseRender.spec.ts`. Skipped without `MK8_OUT`.
const PACK = process.env.MK8_OUT;

/** TDD v3's per-course budgets at the grid (desktop). */
const DRAW_CALL_BUDGET = 300;
const TRIANGLE_BUDGET = 400_000;
/** A course keeps at most this many materials see-through (water lines, glass, fire). */
const MAX_BLENDED = 6;

const COURSES = [
  { pack: 'mario-kart-stadium', scenario: 'mk8-stadium-race', track: 'mk8-stadium' },
  { pack: 'water-park', scenario: 'mk8-waterpark-race', track: 'mk8-waterpark' },
  { pack: 'sweet-sweet-canyon', scenario: 'mk8-canyon-race', track: 'mk8-canyon' },
  { pack: 'thwomp-ruins', scenario: 'mk8-ruins-race', track: 'mk8-ruins' },
];

test.describe('MK8 courses on the real pack: solid, 3× (MK-105 revisit, local only)', () => {
  test.skip(!PACK, 'needs the real MK8 pack: MK8_OUT=<pack>');
  test.setTimeout(120_000);

  for (const course of COURSES)
    test(`${course.scenario}: solid materials, 3× scale, within budget at the grid`, async ({
      page,
    }) => {
      await servePack(page, { dir: PACK });
      await loadScenario(page, course.scenario, { paused: true });
      expect((await getState(page)).trackId).toBe(course.track);
      await page.evaluate(() => window.__game!.step(1, { render: true }));
      const info = await page.evaluate(() => window.__game!.renderInfo());
      const model = await page.evaluate((id) => window.__mk8Courses?.[id], course.pack);
      console.log(
        `${course.pack}: ${JSON.stringify(model)}, ${info.calls} draws, ${info.triangles} triangles`,
      );
      expect(model?.scale).toBe(3);
      expect(model?.materials.blend).toBeLessThanOrEqual(MAX_BLENDED);
      expect((model?.materials.opaque ?? 0) + (model?.materials.cutout ?? 0)).toBeGreaterThan(50);
      expect(info.calls).toBeLessThan(DRAW_CALL_BUDGET);
      expect(info.triangles).toBeLessThan(TRIANGLE_BUDGET);
    });
});
