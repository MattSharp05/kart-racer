import { expect, test } from '@playwright/test';
import { loadScenario } from './helpers';

// MK-106: gliding off the synthetic MK8 test ramp's glide ramp (no pack needed). The glider is
// drawn only while the kart glides: it unfolds on launch, folds on landing, and the chase camera
// sits further back while it's open.

interface Sample {
  tick: number;
  gliding: boolean;
  grounded: boolean;
  glider: number;
  distance: number;
}

test.describe('MK8 gliders (MK-106)', () => {
  test('mk8-test-glide: the glider shows only while the kart glides, and the camera pulls back', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-test-glide', { paused: true });
    const samples = await page.evaluate(() => {
      const game = window.__game!;
      const out = [];
      let landed = -1;
      for (let i = 0; i < 600; i += 1) {
        // Accelerate to the ramp, then glide level (accelerate and brake held: neither dive nor float).
        game.setInput(0, { throttle: 1, brake: out.some((s) => s.gliding) ? 1 : 0 });
        const kart = game.step(1).karts[0]!;
        const info = game.renderInfo();
        out.push({
          tick: i,
          gliding: kart.glide !== undefined,
          grounded: kart.grounded,
          glider: info.gliders?.[0] ?? -1,
          distance: info.camera?.distance ?? -1,
        });
        if (landed < 0 && out.some((s) => s.gliding) && kart.grounded) landed = i;
        if (landed >= 0 && i > landed + 40) break;
      }
      return out;
    });
    const first = samples.findIndex((s) => s.gliding);
    const last = samples.length - 1 - [...samples].reverse().findIndex((s) => s.gliding);
    expect(first).toBeGreaterThan(0);
    expect(last).toBeGreaterThan(first + 30);
    const before = samples.slice(0, first);
    const during = samples.slice(first, last + 1);
    const after = samples.slice(last + 1);
    // Before the launch: no glider, normal camera distance.
    for (const s of before) expect(s.glider).toBe(0);
    const normal = (before.at(-1) as Sample).distance;
    // Gliding: shown from the first tick, fully open after 0.3 s, camera further back.
    for (const s of during) expect(s.glider).toBeGreaterThan(0);
    expect(during[18]!.glider).toBe(1);
    expect(during[30]!.distance).toBeGreaterThan(normal + 2);
    // Landed: it folds away within 0.3 s and stays hidden; the camera comes back in.
    expect(after[0]!.grounded).toBe(true);
    for (const s of after.slice(18)) expect(s.glider).toBe(0);
    expect((after.at(-1) as Sample).distance).toBeCloseTo(normal, 5);
  });
});
