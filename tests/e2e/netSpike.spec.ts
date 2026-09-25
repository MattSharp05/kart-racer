import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { InputFrame, SimState } from '../../src/sim/types';
import type {} from '../../src/game/testApi';
import type {} from '../../src/net/spike/main';

/**
 * MK-36 netcode spike: two browsers race over a real WebRTC data channel.
 *
 * By default signaling goes over BroadcastChannel (`&transport=local`; CI has no Supabase keys),
 * with both pages in one browser context. `NET_SPIKE_SIGNALING=supabase` signals through the real
 * Supabase Realtime channel instead, from two separate contexts; `NET_SPIKE_URL=<preview>` runs it
 * against a deploy. Networking runs in real time, so this spec (unlike gameplay specs) waits on
 * the clock while the karts drive.
 */
const SUPABASE = process.env.NET_SPIKE_SIGNALING === 'supabase';
const BASE = process.env.NET_SPIKE_URL ?? '';
const DRIVE_SECONDS = 20;
const CONNECT_TIMEOUT_MS = 30_000;

function spikeUrl(role: 'host' | 'client', room: string): string {
  const params = new URLSearchParams({ spike: 'net', role, room });
  if (!SUPABASE) params.set('transport', 'local');
  return `${BASE}/?${params}`;
}

async function openSpike(page: Page, role: 'host' | 'client', room: string): Promise<void> {
  await page.goto(spikeUrl(role, room));
  await page.waitForFunction(() => window.__netSpike !== undefined);
}

function status(page: Page) {
  return page.evaluate(() => window.__netSpike!.status());
}

function stats(page: Page) {
  return page.evaluate(() => window.__netSpike!.stats());
}

function state(page: Page): Promise<SimState> {
  return page.evaluate(() => window.__game!.getState());
}

async function drive(page: Page, kartId: number, frame: Partial<InputFrame>): Promise<void> {
  await page.evaluate(([id, f]) => window.__game!.setInput(id, f), [kartId, frame] as const);
}

async function report(testInfo: TestInfo, name: string, data: unknown): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  console.log(`${name}: ${json}`);
  await testInfo.attach(name, { body: json, contentType: 'application/json' });
}

test.describe('WebRTC race (desktop Chromium)', () => {
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(
      browserName !== 'chromium' || testInfo.project.name !== 'desktop-chrome',
      'WebRTC spike runs on desktop Chromium only',
    );
  });

  test('two browsers race over WebRTC and the client converges to the host', async ({
    browser,
    context,
  }, testInfo) => {
    test.setTimeout(120_000);
    const room = `T${Date.now().toString(36).toUpperCase()}`;
    // BroadcastChannel only reaches pages in the same context; Supabase works across contexts.
    const hostPage = await context.newPage();
    const clientContext = SUPABASE ? await browser.newContext() : context;
    const clientPage = await clientContext.newPage();

    await openSpike(hostPage, 'host', room);
    await expect.poll(() => status(hostPage), { timeout: CONNECT_TIMEOUT_MS }).toBe('waiting');
    await openSpike(clientPage, 'client', room);
    await expect.poll(() => status(clientPage), { timeout: CONNECT_TIMEOUT_MS }).toBe('connected');
    await expect.poll(() => status(hostPage), { timeout: CONNECT_TIMEOUT_MS }).toBe('connected');
    await expect
      .poll(() => clientPage.evaluate(() => window.__netSpike!.connection()?.path), {
        timeout: CONNECT_TIMEOUT_MS,
      })
      .toBe('P2P');

    // Both karts drive and steer for 20 s; the client also drifts now and then.
    for (let second = 0; second < DRIVE_SECONDS; second += 1) {
      await drive(hostPage, 0, { throttle: 1, steer: Math.sin(second) * 0.5 });
      await drive(clientPage, 1, {
        throttle: 1,
        steer: Math.cos(second) * 0.5,
        drift: second % 5 === 2,
      });
      await hostPage.waitForTimeout(1000);
    }
    const clientStats = await stats(clientPage);
    const hostStats = await stats(hostPage);
    const connection = await clientPage.evaluate(() => window.__netSpike!.connection());
    await report(testInfo, `net-spike-race-${SUPABASE ? 'supabase' : 'local'}`, {
      connection,
      client: clientStats,
      host: hostStats,
    });

    // 20 Hz snapshots for 20 s, nearly all inputs on time, small prediction error.
    expect(clientStats.snapshots).toBeGreaterThan(DRIVE_SECONDS * 15);
    expect(hostStats.lateInputs).toBeLessThan(DRIVE_SECONDS * 60 * 0.05);
    expect(clientStats.predictionErrorAvg).toBeLessThan(0.25);

    // Let go and coast to a stop (brake would reverse): the client's own kart must end where the
    // host says it is.
    await drive(hostPage, 0, {});
    await drive(clientPage, 1, {});
    await expect
      .poll(async () => Math.abs((await state(hostPage)).karts[1]?.speed ?? 99), {
        timeout: 30_000,
      })
      .toBeLessThan(0.05);
    await hostPage.waitForTimeout(500);
    const hostKart = (await state(hostPage)).karts[1];
    const clientKart = (await state(clientPage)).karts[1];
    expect(hostKart && clientKart).toBeTruthy();
    const gap = Math.hypot(
      (hostKart?.position.x ?? 0) - (clientKart?.position.x ?? 99),
      (hostKart?.position.z ?? 0) - (clientKart?.position.z ?? 99),
    );
    await report(testInfo, 'net-spike-final-gap-m', { gap });
    expect(gap).toBeLessThan(0.3);
  });

  test('re-simulation cost, desktop and a throttled "mid-range phone" CPU', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await openSpike(page, 'host', 'BENCH');
    const bench = () => page.evaluate(() => window.__netSpike!.benchResim(11, 60));
    await bench(); // warm up the JIT
    const desktop = await bench();
    const cdp = await page.context().newCDPSession(page);
    const throttled: Record<string, unknown> = {};
    for (const rate of [4, 6]) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      throttled[`${rate}x`] = await bench();
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await report(testInfo, 'net-spike-resim-11-ticks', { desktop, ...throttled });
    expect(desktop.msPerResim).toBeGreaterThan(0);
  });
});

test.describe('cross-engine determinism (informational)', () => {
  // Runs in both desktop projects; compare the two hashes in the report.
  test.beforeEach(({ isMobile }, testInfo) => {
    test.skip(isMobile || !['desktop-chrome', 'desktop-webkit'].includes(testInfo.project.name));
  });

  test('hashes the seeded 600-tick race', async ({ page, browserName }, testInfo) => {
    await openSpike(page, 'host', 'HASH');
    const result = await page.evaluate(() => window.__netSpike!.simHash(1, 600));
    await report(testInfo, `net-spike-hash-${browserName}`, result);
    expect(result.hash).toMatch(/^[0-9a-f]{8}$/);
  });
});

test('/dev links to the spike host page, which shows the client link', async ({ page }) => {
  await page.goto('/dev.html');
  const link = page.getByRole('link', { name: 'net-spike-host' });
  await expect(link).toHaveAttribute('href', /\?spike=net&role=host$/);
  await link.click();
  await page.waitForFunction(() => window.__netSpike !== undefined);
  const room = await page.evaluate(() => window.__netSpike!.room);
  expect(room).toMatch(/^[A-Z]{4}$/);
  await expect(page.getByRole('link', { name: /role=client/ })).toHaveAttribute(
    'href',
    new RegExp(`spike=net&role=client&room=${room}$`),
  );
  await expect(page.getByTestId('net-spike-panel')).toContainText('NET SPIKE · host');
});
