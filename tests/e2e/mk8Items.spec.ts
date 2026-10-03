import { expect, test, type Page } from '@playwright/test';
import { getState, loadScenario, setInput, step } from './helpers';
import { servePack } from './mk8';

// MK-103: MK8 races' items. The pack is local only (ADR 0009): the item models here come from the
// synthetic fixture pack (`fixtures/mk8-pack/models/items/`), or from no pack at all, as on Vercel.

function pageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test.describe('MK8 items', () => {
  test('second slot: holding a shell, a box fills slot 2; firing moves it up to slot 1', async ({
    page,
  }) => {
    const errors = pageErrors(page);
    await loadScenario(page, 'mk8-two-slots', { paused: true });
    let kart = (await getState(page)).karts[0]!;
    expect(kart.item.held).toBe('green');
    expect(kart.item.second).toEqual({ held: null, uses: 0, roulette: 0 });
    await expect(page.locator('.mk8-hud-item2')).toBeVisible();

    // Coast into the boxes 40 m ahead, then let the roulette land.
    for (let i = 0; i < 10 && !(await getState(page)).karts[0]!.item.second!.held; i += 1) {
      await step(page, 60);
    }
    kart = (await getState(page)).karts[0]!;
    expect(kart.item.held).toBe('green');
    const second = kart.item.second!.held;
    expect(second).not.toBeNull();
    await expect(page.locator('.mk8-hud-item2')).toHaveAttribute('data-item', second!);

    await setInput(page, 0, { item: true });
    await step(page, 1);
    kart = (await getState(page)).karts[0]!;
    expect(kart.item.held).toBe(second);
    expect(kart.item.second).toEqual({ held: null, uses: 0, roulette: 0 });
    await expect(page.locator('.mk8-hud-item')).toHaveAttribute('data-item', second!);
    await expect(page.locator('.mk8-hud-item2')).toHaveAttribute('data-item', '');
    expect(errors).toEqual([]);
  });

  test("the lineup loads the pack's item models", async ({ page }) => {
    const errors = pageErrors(page);
    const pack = await servePack(page);
    await loadScenario(page, 'mk8-items-lineup', { paused: true });
    for (const model of ['item-box', 'banana', 'green-shell', 'red-shell', 'lightning']) {
      expect(pack.requested).toContain(`models/items/${model}.glb`);
    }
    expect(errors).toEqual([]);
  });

  test('triple red shells (MK-112): three circle the player; each press fires one, the HUD counts down', async ({
    page,
  }) => {
    const errors = pageErrors(page);
    const pack = await servePack(page);
    await loadScenario(page, 'mk8-item-triple-red', { paused: true });
    // The incoming shell from behind: an escort stops it.
    let state = await step(page, 90);
    const escorts = (s: typeof state) =>
      s.entities.filter((e) => e.kind === 'item' && e.ownerId === 0).length;
    expect(state.karts[0]!.spinTimer).toBe(0);
    expect(state.karts[0]!.item).toMatchObject({ held: 'triple-red', uses: 2 });
    expect(escorts(state)).toBe(2);
    await expect(page.locator('.mk8-hud-item')).toHaveAttribute('data-uses', '2');

    for (const left of [1, 0]) {
      await setInput(page, 0, { item: true });
      await step(page, 1);
      await setInput(page, 0, { item: false });
      state = await step(page, 1);
      expect(state.karts[0]!.item.uses).toBe(left);
      expect(escorts(state)).toBe(left);
    }
    expect(state.karts[0]!.item.held).toBeNull();
    expect(state.entities.filter((e) => e.kind === 'shell')).toHaveLength(2);
    expect(pack.requested).toContain('models/items/red-shell.glb');
    expect(errors).toEqual([]);
  });

  test('golden mushroom (MK-112): presses keep boosting, then the slot empties', async ({
    page,
  }) => {
    const errors = pageErrors(page);
    await loadScenario(page, 'mk8-item-golden', { paused: true });
    await expect(page.locator('.mk8-hud-item')).toHaveAttribute('data-item', 'golden-mushroom');
    for (let press = 0; press < 3; press += 1) {
      await setInput(page, 0, { item: true });
      await step(page, 1);
      await setInput(page, 0, { item: false });
      const state = await step(page, 30);
      expect(state.karts[0]!.item.held).toBe('golden-mushroom');
      expect(state.karts[0]!.boostTimer).toBeGreaterThan(0);
    }
    // Its 7.5 s run out.
    await step(page, 450);
    await expect(page.locator('.mk8-hud-item')).toHaveAttribute('data-item', '');
    expect(errors).toEqual([]);
  });

  test('spiny shell (MK-113): from last place it flies to the leader and blows it up', async ({
    page,
  }) => {
    const errors = pageErrors(page);
    const pack = await servePack(page);
    await loadScenario(page, 'mk8-item-spiny', { paused: true });
    await expect(page.locator('.mk8-hud-item')).toHaveAttribute('data-item', 'spiny-shell');
    await setInput(page, 0, { item: true });
    await step(page, 1);
    await setInput(page, 0, { item: false });
    let state = await step(page, 1);
    expect(state.entities.some((e) => e.kind === 'item' && e.spec === 'spiny-shell')).toBe(true);
    // It lands within a few seconds of flight; the leader (kart 1) spins out, thrown up.
    for (let i = 0; i < 20 && state.karts[1]!.spinTimer === 0; i += 1) state = await step(page, 30);
    expect(state.karts[1]!.spinTimer).toBeGreaterThan(0);
    expect(state.entities.some((e) => e.kind === 'item' && e.spec === 'spiny-shell')).toBe(false);
    expect(pack.requested).toContain('models/items/blue-shell.glb');
    expect(errors).toEqual([]);
  });

  test('super horn (MK-113): timed under a diving spiny, it destroys it and the player is unhurt', async ({
    page,
  }) => {
    const errors = pageErrors(page);
    await servePack(page);
    await loadScenario(page, 'mk8-item-horn-vs-spiny', { paused: true });
    // The HUD warns of the spiny coming for the player.
    await step(page, 1);
    await expect(page.locator('.mk8-hud-incoming')).toHaveAttribute('data-items', 'spiny-shell');
    // Until it dives (data[0] = 2) …
    const diving = (s: Awaited<ReturnType<typeof getState>>) =>
      s.entities.some((e) => e.kind === 'item' && e.spec === 'spiny-shell' && e.data[0] === 2);
    let state = await getState(page);
    for (let i = 0; i < 24 && !diving(state); i += 1) state = await step(page, 5);
    expect(diving(state)).toBe(true);
    // … and is right over the player (its dive closes in for the first 60 % of 1.4 s): honk.
    await step(page, 45);
    await setInput(page, 0, { item: true });
    await step(page, 1);
    await setInput(page, 0, { item: false });
    state = await step(page, 180);
    expect(state.entities.some((e) => e.kind === 'item' && e.spec === 'spiny-shell')).toBe(false);
    expect(state.karts[0]!.spinTimer).toBe(0);
    expect(state.karts[0]!.item.held).toBeNull();
    expect(errors).toEqual([]);
  });

  test('bob-omb (MK-114): thrown ahead, it explodes after its fuse and hits the karts beside it', async ({
    page,
  }) => {
    const errors = pageErrors(page);
    const pack = await servePack(page);
    await loadScenario(page, 'mk8-item-bobomb', { paused: true });
    await expect(page.locator('.mk8-hud-item')).toHaveAttribute('data-item', 'bob-omb');
    await setInput(page, 0, { item: true });
    await step(page, 1);
    await setInput(page, 0, { item: false });
    let state = await step(page, 60);
    expect(state.entities.some((e) => e.kind === 'item' && e.spec === 'bob-omb')).toBe(true);
    // Its 3 s fuse runs out: the karts 4 m either side spin out, the one 12 m beyond doesn't.
    state = await step(page, 125);
    expect(state.entities.some((e) => e.kind === 'item' && e.spec === 'bob-omb')).toBe(false);
    expect(state.karts[1]!.spinTimer).toBeGreaterThan(0);
    expect(state.karts[2]!.spinTimer).toBeGreaterThan(0);
    expect(state.karts[3]!.spinTimer).toBe(0);
    expect(pack.requested).toContain('models/items/bob-omb.glb');
    expect(errors).toEqual([]);
  });

  test('fire flower (MK-114): each press shoots a fireball; one spins out the kart ahead', async ({
    page,
  }) => {
    const errors = pageErrors(page);
    await servePack(page);
    await loadScenario(page, 'mk8-item-fire-flower', { paused: true });
    await expect(page.locator('.mk8-hud-item')).toHaveAttribute('data-item', 'fire-flower');
    for (let press = 0; press < 2; press += 1) {
      await setInput(page, 0, { item: true });
      await step(page, 1);
      await setInput(page, 0, { item: false });
      await step(page, 10);
    }
    let state = await getState(page);
    expect(state.karts[0]!.item.held).toBe('fire-flower');
    state = await step(page, 60);
    expect(state.karts[1]!.spinTimer).toBeGreaterThan(0);
    // Its time runs out: the slot empties.
    await step(page, 360);
    await expect(page.locator('.mk8-hud-item')).toHaveAttribute('data-item', '');
    expect(errors).toEqual([]);
  });

  test('without a pack, MK8 races still run, with our items', async ({ page }) => {
    const errors = pageErrors(page);
    await loadScenario(page, 'mk8-two-slots');
    // Unpaused: the race runs once MK8 Mode's item set is in, pack or no pack.
    await expect
      .poll(async () => (await getState(page)).tick, { timeout: 10_000 })
      .toBeGreaterThan(30);
    expect(errors).toEqual([]);
  });
});
