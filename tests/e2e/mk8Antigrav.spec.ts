import { expect, test } from '@playwright/test';
import { getState, loadScenario } from './helpers';

// MK-99: anti-gravity on the synthetic MK8 test ramp (no pack needed), and the Stadium scenario,
// which needs the local pack (ADR 0009) and so shows "not installed" here as on Vercel.

interface Sample {
  kartUp: { x: number; y: number; z: number };
  cameraUp: { x: number; y: number; z: number };
  grounded: boolean;
}

test.describe('MK8 anti-gravity (MK-99)', () => {
  test('mk8-test-antigrav: up the wall, along the ceiling and down; the camera follows without flipping', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-test-antigrav', { paused: true });
    const samples = await page.evaluate(() => {
      const game = window.__game!;
      type V = { x: number; y: number; z: number };
      const norm = (v: V) => {
        const l = Math.hypot(v.x, v.y, v.z) || 1;
        return { x: v.x / l, y: v.y / l, z: v.z / l };
      };
      const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
      const cross = (a: V, b: V) => ({
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
      });
      // Where to head on each surface: up the wall, back across the ceiling, down, along the floor.
      const targets: V[] = [
        { x: 0.5, y: 0, z: 1 },
        { x: 0.2, y: 1, z: 0 },
        { x: 0.2, y: 0, z: 1 },
        { x: 0.2, y: -1, z: 0 },
        { x: 1, y: 0, z: 0 },
      ];
      let phase = 0;
      const out = [];
      for (let i = 0; i < 260; i += 1) {
        const kart = game.getState().karts[0]!;
        const up = kart.up ?? { x: 0, y: 1, z: 0 };
        if (phase === 0 && up.y < 0.3) phase = 1;
        if (phase === 1 && up.y < -0.7) phase = 2;
        if (phase === 2 && up.y > -0.3) phase = 3;
        if (phase === 3 && up.y > 0.9) phase = 4;
        let steer = 0;
        if (phase > 0 && kart.forward) {
          const want = norm(targets[phase]!);
          const left = dot(want, cross(up, kart.forward));
          steer = dot(want, kart.forward) < 0 ? (left > 0 ? -1 : 1) : Math.max(-1, Math.min(1, -3 * left));
        }
        game.setInput(0, { throttle: 0.75, steer });
        const state = game.step(1);
        const k = state.karts[0]!;
        out.push({
          kartUp: k.up ?? { x: 0, y: 1, z: 0 },
          cameraUp: game.renderInfo().camera!.up!,
          grounded: k.grounded,
        });
      }
      return out;
    });
    const s: Sample[] = samples;
    // The kart went up the wall, upside down on the ceiling and back to the floor.
    expect(s.some((x) => x.kartUp.z < -0.99)).toBe(true);
    expect(Math.min(...s.map((x) => x.kartUp.y))).toBeLessThan(-0.99);
    expect(s.at(-1)!.kartUp.y).toBeGreaterThan(0.99);
    // The camera turned with it (upside down on the ceiling)…
    expect(Math.min(...s.map((x) => x.cameraUp.y))).toBeLessThan(-0.5);
    // …and never flipped: under 90° (in fact under 30°) between two frames.
    let worst = 0;
    for (let i = 1; i < s.length; i += 1) {
      const a = s[i - 1]!.cameraUp;
      const b = s[i]!.cameraUp;
      worst = Math.max(worst, Math.acos(Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)));
    }
    expect(worst).toBeLessThan(Math.PI / 6);
  });

  test('mk8-test-ceiling: upside down on the ceiling, and it stays there', async ({ page }) => {
    await loadScenario(page, 'mk8-test-ceiling', { paused: true });
    const before = await getState(page);
    expect(before.karts[0]!.up).toEqual({ x: 0, y: -1, z: 0 });
    const after = await page.evaluate(() => window.__game!.step(60));
    const kart = after.karts[0]!;
    expect(kart.grounded).toBe(true);
    expect(kart.antigrav).toBe(true);
    expect(kart.position.y).toBeCloseTo(8, 3);
    const camera = await page.evaluate(() => window.__game!.renderInfo().camera!);
    expect(camera.up!.y).toBeLessThan(-0.9);
  });

  test('mk8-stadium-antigrav without a pack shows "MK8 pack not installed"', async ({ page }) => {
    await loadScenario(page, 'mk8-stadium-antigrav');
    await expect(page.locator('.menu-mk8NotInstalled')).toContainText('MK8 pack not installed');
  });
});
