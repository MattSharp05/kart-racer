import { expect, test } from '@playwright/test';
import { sunnyCircuit } from '../../src/content/tracks/sunny-circuit/sim';
import { trackGeometry } from '../../src/sim/track';
import type { SimEvent } from '../../src/sim/types';
import { getState, loadScenario, step } from './helpers';

const geometry = trackGeometry(sunnyCircuit);

test.describe('Sunny Circuit', () => {
  test('the default boot (no scenario) is Sunny Circuit on the grid', async ({ page }) => {
    await page.goto('/?paused=1');
    await page.waitForFunction(() => window.__game?.ready === true);
    const state = await getState(page);
    expect(state.trackId).toBe('sunny-circuit');
    expect(geometry.project(state.karts[0]!.position).surface).toBe('road');
  });

  test('sunny-jump: the kart takes off, then lands on the road', async ({ page }) => {
    await loadScenario(page, 'sunny-jump', { paused: true });
    await page.evaluate(() => window.__game!.setAutopilot(0, true));
    // ~2.2 s to reach the lip from 50 m out, ~0.8 s in the air, then settle.
    await step(page, 220);
    const events: SimEvent[] = await page.evaluate(() => window.__game!.events());
    expect(events.some((e) => e.type === 'launch')).toBe(true);
    const landing = events.find((e) => e.type === 'land' && e.airTime > 0.3);
    expect(landing).toBeTruthy();
    const kart = (await getState(page)).karts[0]!;
    expect(kart.grounded).toBe(true);
    expect(geometry.project(kart.position).surface).not.toBe('out');
  });

  test('sunny-shortcut: holding throttle crosses the infield onto the return straight', async ({
    page,
  }) => {
    await loadScenario(page, 'sunny-shortcut', { paused: true });
    await page.evaluate(() => window.__game!.setInput(0, { throttle: 1 }));
    const state = await step(page, 240);
    const p = geometry.project(state.karts[0]!.position);
    expect(p.surface).not.toBe('out');
    expect(state.karts[0]!.position.z).toBeGreaterThan(-20);
  });

  test('sunny-boost-pad: driving over the pad gives a boost', async ({ page }) => {
    await loadScenario(page, 'sunny-boost-pad', { paused: true });
    await page.evaluate(() => window.__game!.setAutopilot(0, true));
    await step(page, 120);
    const events: SimEvent[] = await page.evaluate(() => window.__game!.events());
    expect(events.some((e) => e.type === 'boostPad')).toBe(true);
  });

  test('renders within the draw-call budget', async ({ page }) => {
    await loadScenario(page, 'sunny-start', { paused: true });
    // Scenery ≤ 40 calls; the whole frame (track, scenery, kart) stays well under 80.
    const calls = await page.evaluate(() => window.__game!.renderInfo().calls);
    expect(calls).toBeLessThan(80);
  });
});
