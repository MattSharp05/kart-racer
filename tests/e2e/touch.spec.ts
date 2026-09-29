import { expect, test } from '@playwright/test';
import type { SimEvent } from '../../src/sim/types';
import { enterNickname, loadScenario, step } from './helpers';

const isPhone = (name: string) => name === 'iphone-landscape';

test.describe('touch controls', () => {
  test('desktop: touch controls are hidden', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-chrome');
    await loadScenario(page, 'sunny-start', { paused: true });
    await expect(page.locator('.touch-controls')).toBeHidden();
  });

  test('phones: controls show; holding Drift hops, Item uses the item (mushroom boost)', async ({
    page,
  }, info) => {
    test.skip(!isPhone(info.project.name));
    await page.goto('/?scenario=sunny-start&paused=1&item=mushroom');
    await page.waitForFunction(() => window.__game?.ready === true);
    await expect(page.locator('.touch-controls')).toBeVisible();

    await page.locator('.touch-drift').dispatchEvent('pointerdown', { pointerId: 2 });
    await step(page, 2);
    const events: SimEvent[] = await page.evaluate(() => window.__game!.events());
    expect(events).toContainEqual(expect.objectContaining({ type: 'hop', kartId: 0 }));
    await page.locator('.touch-drift').dispatchEvent('pointerup', { pointerId: 2 });

    await page.locator('.touch-item').dispatchEvent('pointerdown', { pointerId: 3 });
    const state = await step(page, 2);
    expect(state.karts[0]!.item.held).toBeNull();
    expect(state.karts[0]!.boostTimer).toBeGreaterThan(1);
  });

  test('phones: nothing overlaps the touch buttons, and the page does not scroll', async ({
    page,
  }, info) => {
    test.skip(!isPhone(info.project.name));
    await loadScenario(page, 'sunny-start', { paused: true });
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - window.innerWidth,
      y: document.documentElement.scrollHeight - window.innerHeight,
    }));
    expect(overflow.x).toBeLessThanOrEqual(0);
    expect(overflow.y).toBeLessThanOrEqual(0);
    const buttons = await page
      .locator('.touch-button')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect));
    const vw = page.viewportSize()!;
    for (const b of buttons) {
      expect(b.width).toBeGreaterThanOrEqual(56);
      expect(b.right).toBeLessThanOrEqual(vw.width);
      expect(b.bottom).toBeLessThanOrEqual(vw.height);
    }
  });

  test('phones: after the menus, a real tap reaches the touch controls (QA round 2)', async ({
    page,
  }, info) => {
    test.skip(!isPhone(info.project.name));
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.ready === true);
    await enterNickname(page);
    await page.locator('.how-to-play button').click();
    await page.locator('.menu-title button.primary').click();
    await page.locator('.menu-racerSelect button.primary').click();
    await page.locator('.menu-ccSelect button', { hasText: '100' }).click();
    await page.locator('.menu-trackSelect button.primary').click();
    await expect(page.locator('.touch-controls')).toBeVisible();
    // Hit-test the centre of each control the way a finger would: nothing (such as an emptied
    // menu overlay) may sit on top of it.
    const blocked = await page.evaluate(() =>
      ['.touch-steer', '.touch-drift', '.touch-item', '.touch-brake'].flatMap((sel) => {
        const el = document.querySelector(sel)!;
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return top && el.contains(top) ? [] : [`${sel} is covered by ${top?.className}`];
      }),
    );
    expect(blocked).toEqual([]);
  });

  test('phones in portrait: rotate prompt shows and the game pauses', async ({ page }, info) => {
    test.skip(!isPhone(info.project.name));
    await loadScenario(page, 'sunny-start');
    const vw = page.viewportSize()!;
    await page.setViewportSize({ width: vw.height, height: vw.width });
    await expect(page.locator('.rotate-prompt')).toBeVisible();
    expect(await page.evaluate(() => window.__game!.isPaused())).toBe(true);
    await page.setViewportSize(vw);
    await expect(page.locator('.rotate-prompt')).toBeHidden();
    expect(await page.evaluate(() => window.__game!.isPaused())).toBe(false);
  });
});

test.describe('left-handed layout (MK-53)', () => {
  test('phones: Left puts the buttons on the left, and a drag on the right half steers', async ({
    page,
  }, info) => {
    test.skip(!isPhone(info.project.name));
    await loadScenario(page, 'race-touch-left', { paused: true });
    const controls = page.locator('.touch-controls');
    await expect(controls).toBeVisible();
    await expect(controls).toHaveAttribute('data-hand', 'left');
    const vw = page.viewportSize()!;
    for (const sel of ['.touch-drift', '.touch-item', '.touch-brake']) {
      const box = (await page.locator(sel).boundingBox())!;
      expect(box.x + box.width, sel).toBeLessThanOrEqual(vw.width / 2);
    }
    const zone = (await page.locator('.touch-steer').boundingBox())!;
    expect(zone.x).toBeGreaterThanOrEqual(vw.width / 2);

    // A finger on the right half lands on the steering zone (nothing on top of it) and steers.
    const start = { x: vw.width * 0.75, y: vw.height * 0.8 };
    const onZone = await page.evaluate(
      ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.touch-steer'),
      start,
    );
    expect(onZone).toBe(true);
    const heading = (await step(page, 0)).karts[0]!.heading;
    const pointer = { pointerId: 5, clientY: start.y, bubbles: true };
    await page
      .locator('.touch-steer')
      .dispatchEvent('pointerdown', { ...pointer, clientX: start.x });
    await page
      .locator('.touch-steer')
      .dispatchEvent('pointermove', { ...pointer, clientX: start.x + 60 });
    await expect(page.locator('.touch-stick')).toHaveCSS(
      'transform',
      /matrix\(1, 0, 0, 1, 60, 0\)/,
    );
    await page.evaluate(() => window.__game!.step(60, { render: false }));
    const turned = (await step(page, 0)).karts[0]!.heading;
    expect(Math.abs(turned - heading)).toBeGreaterThan(0.1);
  });

  test('phones: Settings → Controls → Hand applies mid-race and survives a reload', async ({
    page,
  }, info) => {
    test.skip(!isPhone(info.project.name));
    // Two page loads plus menus: slow on the software-GL pixel-landscape job.
    test.setTimeout(60_000);
    await loadScenario(page, 'menu-paused');
    const controls = page.locator('.touch-controls');
    await expect(controls).toHaveAttribute('data-hand', 'right');
    await page.locator('.menu-paused button', { hasText: 'Settings' }).click();
    const hand = page.locator('.menu-settings .hand-setting');
    await expect(hand.getByRole('button', { name: 'Right' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await hand.getByRole('button', { name: 'Left' }).click();
    await expect(hand.getByRole('button', { name: 'Left' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Applied at once, to the paused race's controls.
    await expect(controls).toHaveAttribute('data-hand', 'left');
    const stored = await page.evaluate(() => localStorage.getItem('kart-racer:settings'));
    expect(JSON.parse(stored ?? '{}')).toMatchObject({ hand: 'left' });
    await page.locator('.menu-settings button', { hasText: 'Back' }).click();
    // The controls guide names the thumb that steers now.
    await page.locator('.menu-paused button', { hasText: 'How to play' }).click();
    await expect(page.locator('.how-to-play')).toContainText('Right thumb');
    await page.locator('.how-to-play button', { hasText: 'Got it' }).click();
    await page.locator('.menu-paused button', { hasText: 'Resume' }).click();
    await expect(controls).toBeVisible();
    const vw = page.viewportSize()!;
    const drift = (await page.locator('.touch-drift').boundingBox())!;
    expect(drift.x + drift.width).toBeLessThanOrEqual(vw.width / 2);

    await page.reload();
    await page.waitForFunction(() => window.__game?.ready === true);
    await expect(controls).toHaveAttribute('data-hand', 'left');
  });
});
