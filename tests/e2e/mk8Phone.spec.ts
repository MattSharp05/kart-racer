import { expect, test, type Page } from '@playwright/test';
import { loadScenario } from './helpers';

// MK-134: MK8 Mode on phones and tablets (iphone-landscape, ipad; and a small Android landscape
// viewport, 667×375, on the iPhone project). No pack (ADR 0009): stand-ins and fixture content only.
// Every MK8 screen and the race HUD fit the screen (no element outside the viewport, tap targets
// ≥ 44 px), a Grand Prix walks from the title to its race by touch, the HUD keeps clear of the
// touch buttons in both hands, and the rotate prompt covers MK8 Mode in portrait.

test.skip(({ hasTouch }) => !hasTouch, 'phones and tablets only');

/** Menu screens (MK8's stack, `data-depth` once settled). */
const MENUS = [
  'mk8-ui-title',
  'mk8-ui-mode',
  'mk8-ui-char',
  'mk8-ui-kart',
  'mk8-ui-cc',
  'mk8-ui-cup',
  'mk8-ui-course',
  'mk8-vs-settings',
  'mk8-tt-courses',
];
/** MK8 Mode's own status screens (no stack): the pack missing, the site's password. */
const STATUS = ['mk8-not-installed', 'mk8-password'];
/** Screens over a race (pause, results, standings, podium). */
const RACE_SCREENS = [
  'mk8-ui-pause',
  'mk8-ui-results',
  'mk8-ui-standings',
  'mk8-gp-standings',
  'mk8-gp-podium',
  'mk8-tt-new-record',
];
/** The race HUD over the touch controls. */
const HUDS = [
  'mk8-hud-roulette',
  'mk8-hud-two-slots',
  'mk8-hud-final-lap',
  'mk8-hud-countdown',
  'mk8-tt-splits',
  'mk8-tt-left',
];

/**
 * Every visible element of MK8 Mode (screens, HUD) and the touch controls inside the viewport, and
 * every button or tile at least 44 px. Lakitu flies in from above the screen and the stripe wipe
 * sweeps past it on purpose; the menus' striped background bleeds off the edges.
 */
async function problems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const vw = innerWidth;
    const vh = innerHeight;
    const skip = '.mk8-menu-bg, .mk8-wipe, .mk8-hud-lakitu, [hidden]';
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${(el.textContent ?? '').trim().slice(0, 24)}"`;
    for (const el of document.querySelectorAll('.mk8 *, .mk8-hud *, .touch-controls *')) {
      if (el.closest(skip)) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) {
        out.push(`outside: ${name(el)} [${[r.left, r.top, r.right, r.bottom].map(Math.round)}]`);
      }
      if (el.matches('button, .mk8-tile') && Math.min(r.width, r.height) < 44) {
        out.push(`small: ${name(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    return out;
  });
}

async function openScreen(page: Page, scenario: string) {
  await loadScenario(page, scenario, { paused: true });
  if (MENUS.includes(scenario)) {
    await expect(page.locator('.mk8')).toHaveAttribute('data-transitioning', 'false');
    await expect(page.locator('.mk8 .mk8-scr').last()).toBeVisible();
  } else if (STATUS.includes(scenario)) {
    await expect(page.locator('.mk8-screen, .mk8-scr-password').first()).toBeVisible();
  } else if (RACE_SCREENS.includes(scenario)) {
    await expect(page.locator('.mk8 .mk8-scr').last()).toBeVisible({ timeout: 10_000 });
  } else {
    await expect(page.locator('.mk8-hud')).toBeVisible();
    await expect(page.locator('.touch-controls')).toBeVisible();
  }
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
}

test.describe('MK8 screens and HUD fit phones and tablets (MK-134)', () => {
  for (const scenario of [...MENUS, ...STATUS, ...RACE_SCREENS, ...HUDS]) {
    test(`${scenario}: everything on screen, tap targets ≥ 44 px`, async ({ page }) => {
      await openScreen(page, scenario);
      expect(await problems(page)).toEqual([]);
    });
  }
});

test.describe('a small Android landscape screen, 667×375 (MK-134)', () => {
  test.use({ viewport: { width: 667, height: 375 } });
  for (const scenario of [
    'mk8-ui-kart',
    'mk8-ui-cup',
    'mk8-vs-settings',
    'mk8-gp-standings',
    'mk8-tt-splits',
  ]) {
    test(`${scenario} fits`, async ({ page }, info) => {
      test.skip(info.project.name !== 'iphone-landscape');
      await openScreen(page, scenario);
      expect(await problems(page)).toEqual([]);
    });
  }
});

test('a Grand Prix by touch: title → mode → racer → kart → class → cup → its race, every screen fits', async ({
  page,
}) => {
  await loadScenario(page, 'mk8-ui-title');
  const mk8 = page.locator('.mk8');
  const settled = async (depth: number) => {
    await expect(mk8).toHaveAttribute('data-depth', String(depth));
    await expect(mk8).toHaveAttribute('data-transitioning', 'false');
    expect(await problems(page), `depth ${depth}`).toEqual([]);
  };
  await settled(1);
  await page.locator('.mk8-title-press').tap();
  await settled(2);
  // A tap selects Grand Prix (already selected), a second confirms.
  await page.locator('.mk8-scr-modes .mk8-tile').first().tap();
  await settled(3);
  for (const [screen, depth] of [
    ['char', 4],
    ['kart', 5],
    ['cc', 6],
  ] as const) {
    await page.locator(`.mk8-scr-${screen} .mk8-hint-a`).tap();
    await settled(depth);
  }
  await expect(page.locator('.mk8-scr-cup')).toBeVisible();
  await page.locator('.mk8-scr-cup .mk8-hint-a').tap();
  // No pack: the course's stand-in loads and the race starts under the MK8 HUD.
  await expect(mk8).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.mk8-hud')).toBeVisible();
  await expect(page.locator('.touch-controls')).toBeVisible();
  const state = await page.evaluate(() => window.__game!.getState());
  expect(state.karts).toHaveLength(8);
  expect(state.itemSet).toBe('mk8');
});

/** Boxes of the HUD pieces and the touch buttons, in CSS px. */
async function boxes(page: Page) {
  return page.evaluate(() => {
    const box = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el || (el as HTMLElement).closest('[hidden]')) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    return {
      width: innerWidth,
      hud: Object.fromEntries(
        [
          '.mk8-hud-item',
          '.mk8-hud-item2',
          '.mk8-hud-coins',
          '.mk8-hud-lap',
          '.mk8-hud-map',
          '.mk8-hud-timer',
        ].map((s) => [s, box(s)]),
      ),
      buttons: Object.fromEntries(
        ['.touch-drift', '.touch-item', '.touch-brake', '.touch-stick'].map((s) => [s, box(s)]),
      ),
    };
  });
}

type Box = { left: number; top: number; right: number; bottom: number };
const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

for (const [scenario, hand] of [
  ['mk8-tt-splits', 'right'],
  ['mk8-tt-left', 'left'],
] as const) {
  test(`${hand}-handed: the HUD stays clear of the touch controls, the clock away from the buttons`, async ({
    page,
  }) => {
    await openScreen(page, scenario);
    await expect(page.locator('.touch-controls')).toHaveAttribute('data-hand', hand);
    await expect(page.locator('.mk8-hud-timer li')).toHaveCount(2);
    const { width, hud, buttons } = await boxes(page);
    for (const [piece, b] of Object.entries(hud)) {
      if (!b) continue;
      for (const [control, c] of Object.entries(buttons)) {
        if (c) expect(overlaps(b, c), `${piece} over ${control}`).toBe(false);
      }
    }
    // The clock is on the side away from the buttons: the mirror image between the hands.
    const timer = hud['.mk8-hud-timer']!;
    const centre = (timer.left + timer.right) / 2;
    if (hand === 'right') expect(centre).toBeLessThan(width / 2);
    else expect(centre).toBeGreaterThan(width / 2);
    const item = buttons['.touch-item']!;
    expect((item.left + item.right) / 2 < width / 2).toBe(hand === 'left');
  });
}

for (const scenario of ['mk8-ui-cup', 'mk8-tt-splits', 'mk8-ui-results']) {
  test(`portrait: the rotate prompt covers ${scenario}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'iphone-landscape');
    await openScreen(page, scenario);
    const vw = page.viewportSize()!;
    await page.setViewportSize({ width: vw.height, height: vw.width });
    await expect(page.locator('.rotate-prompt')).toBeVisible();
    const onTop = await page.evaluate(() =>
      [
        [0.5, 0.5],
        [0.1, 0.1],
        [0.9, 0.9],
      ].every(
        ([x, y]) =>
          !!document.elementFromPoint(innerWidth * x!, innerHeight * y!)?.closest('.rotate-prompt'),
      ),
    );
    expect(onTop).toBe(true);
    await page.setViewportSize(vw);
    await expect(page.locator('.rotate-prompt')).toBeHidden();
  });
}
