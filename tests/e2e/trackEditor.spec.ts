import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { Vec3 } from '../../src/sim/math';

// MK-100: the MK8 track editor on the synthetic test-ramp course (CI has no pack). Desktop only.
test.describe('track editor', () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, 'The track editor is desktop only.');
  });

  async function open(page: Page) {
    await page.goto('/dev/track-editor.html?course=test-ramp');
    await page.waitForFunction(() => window.__editor?.ready === true);
  }

  /** Looks straight down at `target` and clicks it on the collision mesh. */
  async function clickAt(page: Page, target: Vec3) {
    await page.evaluate((p) => window.__editor!.lookAt(p, 60, 'top'), target);
    // Let the render loop draw a frame with the new camera before picking.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    const at = await page.evaluate((p) => window.__editor!.screenOf(p), target);
    await page.mouse.click(at.x, at.y);
  }

  test('loads test-ramp with its committed route and no problems', async ({ page }) => {
    await open(page);
    const route = await page.evaluate(() => window.__editor!.route());
    expect(route.points).toHaveLength(48);
    await expect(page.locator('.validation h2')).toHaveText('No problems');
    await expect(page.locator('.tools [data-layer="route"]')).toHaveClass(/active/);
  });

  test('adds a route point by clicking and exports it', async ({ page }) => {
    await open(page);
    const before = await page.evaluate(() => window.__editor!.route());
    await clickAt(page, { x: 150, y: 0, z: 2.5 });

    const after = await page.evaluate(() => window.__editor!.route());
    expect(after.points).toHaveLength(before.points.length + 1);
    // Inserted along the lap, between the points at x = 140 and x = 160 on straight A.
    const added = after.points.find((p) => !before.points.some((q) => q.x === p.x && q.z === p.z));
    expect(added).toBeDefined();
    expect(added!.x).toBeCloseTo(150, 0);
    expect(added!.y).toBeCloseTo(0, 3);
    expect(added!.z).toBeCloseTo(2.5, 0);
    await expect(page.locator('.status .message')).toContainText(/Added point \d+/);

    const downloading = page.waitForEvent('download');
    await page.locator('[data-action="download-route"]').click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('route.ts');
    const file = await readFile((await download.path())!, 'utf8');
    expect(file).toContain('export const route: RouteDef');
    expect(file).toContain(`{ x: ${added!.x}, y: ${added!.y}, z: ${added!.z}, width: 14 }`);
  });

  test('lists validation problems and switches to the layer', async ({ page }) => {
    await open(page);
    await page.locator('.tools [data-layer="grid"]').click();
    await page.locator('.layer li[data-layer="grid"] .remove').first().click();
    await expect(page.locator('.validation h2')).toHaveText('Problems · 1');
    await expect(page.locator('.issues')).toContainText('Grid has 7 slots, needs 8');
    await page.locator('.layer button', { hasText: 'Auto grid' }).click();
    await expect(page.locator('.validation h2')).toHaveText('No problems');
  });
});
