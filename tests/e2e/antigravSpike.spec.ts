import { expect, test, type Page } from '@playwright/test';

// MK-92: the anti-gravity spike page (`?spike=antigrav`), on the synthetic test course.
interface SpikeApi {
  loadMs: number;
  triangles: number;
  pause(): void;
  setAuto(on: boolean): void;
  step(ticks: number): void;
  state(): {
    up: [number, number, number];
    speed: number;
    respawns: number;
    laps: number;
    antigrav: boolean;
    section: string | null;
  };
}

async function open(page: Page, query: string) {
  await page.goto(`/?spike=antigrav${query}`);
  await page.waitForFunction(() => '__antigrav' in window, null, {
    timeout: 10_000,
  });
}

const api = (page: Page) =>
  page.evaluateHandle(() => (window as unknown as { __antigrav: SpikeApi }).__antigrav);

test('loads the course in under 5 s and laps it on the autopilot without falling off', async ({
  page,
}) => {
  await open(page, '&paused=1&auto=1');
  const spike = await api(page);
  expect(await spike.evaluate((s) => s.loadMs)).toBeLessThan(5000);
  expect(await spike.evaluate((s) => s.triangles)).toBeGreaterThan(10_000);
  await expect(page.getByTestId('antigrav-hud')).toContainText('antigrav-test');

  // Into the barrel roll: upside down at speed.
  let minUpY = 1;
  let maxSpeed = 0;
  for (let i = 0; i < 20; i++) {
    const state = await spike.evaluate((s) => {
      s.step(120);
      return s.state();
    });
    minUpY = Math.min(minUpY, state.up[1]);
    maxSpeed = Math.max(maxSpeed, state.speed);
    if (state.laps >= 1) break;
  }
  const state = await spike.evaluate((s) => s.state());
  expect(state.laps).toBe(1);
  expect(state.respawns).toBe(0);
  expect(minUpY).toBeLessThan(-0.95);
  expect(maxSpeed).toBeGreaterThan(27.5);
  await expect(page.getByTestId('antigrav-hud')).toContainText('query');
});

test('a real course that was never built says how to build it', async ({ page }) => {
  await page.goto('/?spike=antigrav&course=stadium');
  await expect(page.getByTestId('antigrav-hud')).toContainText(
    'No collision for "mario-kart-stadium"',
  );
});
