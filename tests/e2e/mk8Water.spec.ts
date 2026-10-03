import { expect, test } from '@playwright/test';
import { loadScenario } from './helpers';

// MK-107: underwater on the synthetic MK8 test ramp's water basin (no pack needed). The camera's
// blue tint shows only while the camera itself is under the surface; karts in the water show a
// propeller.

test.describe('MK8 underwater (MK-107)', () => {
  test('mk8-test-water-under: tint and propeller on the basin floor', async ({ page }) => {
    await loadScenario(page, 'mk8-test-water-under', { paused: true });
    const info = await page.evaluate(() => {
      window.__game!.step(2);
      return window.__game!.renderInfo();
    });
    expect(info.underwater).toBe(true);
    expect(info.propellers?.[0]).toBe(true);
  });

  test('mk8-test-water: the tint comes on under the surface and goes once out again', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-test-water', { paused: true });
    const samples = await page.evaluate(() => {
      const game = window.__game!;
      game.setInput(0, { throttle: 1 });
      const out = [];
      for (let i = 0; i < 600; i += 1) {
        const kart = game.step(1).karts[0]!;
        const info = game.renderInfo();
        out.push({
          x: kart.position.x,
          inWater: kart.inWater === true,
          tint: info.underwater === true,
          camera: info.camera?.height ?? 0,
        });
        if (kart.position.x < 20) break;
      }
      return out;
    });
    const tinted = samples.filter((s) => s.tint);
    expect(samples[0]!.tint).toBe(false);
    expect(tinted.length).toBeGreaterThan(10);
    // Only while the camera is below the surface (y 0), and the kart is in the water then.
    for (const s of tinted) {
      expect(s.camera).toBeLessThanOrEqual(0);
      expect(s.inWater).toBe(true);
    }
    expect(samples.at(-1)!.tint).toBe(false);
    expect(samples.at(-1)!.inWater).toBe(false);
  });
});
