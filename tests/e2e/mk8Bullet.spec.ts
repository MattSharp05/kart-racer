import { expect, test } from '@playwright/test';
import { loadScenario } from './helpers';

// MK-120: Bullet Bill on the synthetic MK8 test ramp (no pack needed). From last place the kart
// rides the route as a bullet, spinning out the karts parked on its line, then drives on.

test.describe('MK8 Bullet Bill (MK-120)', () => {
  test('mk8-item-bullet: it rides from last place through the karts in its path, then hands back control', async ({
    page,
  }) => {
    await loadScenario(page, 'mk8-item-bullet', { paused: true });
    const result = await page.evaluate(() => {
      const game = window.__game!;
      game.events();
      game.setInput(0, { item: true });
      game.step(1);
      // Steering hard left the whole way: the bullet ignores it.
      game.setInput(0, { steer: -1 });
      const riding = game.step(60).karts[0]!.effects.some((e) => e.kind === 'bullet-bill');
      let state = game.step(1);
      while (state.karts[0]!.effects.some((e) => e.kind === 'bullet-bill')) state = game.step(10);
      const hit = game
        .events()
        .flatMap((e) => (e.type === 'kartHit' && e.kind === 'bullet-bill' ? [e.kartId] : []));
      const end = state.karts[0]!;
      game.setInput(0, { throttle: 1 });
      const after = game.step(60);
      return {
        riding,
        hit: [...new Set(hit)].sort(),
        end: { x: end.position.x, z: end.position.z, boost: end.boostTimer },
        place: after.positions.indexOf(0),
        respawning: after.karts[0]!.respawnTimer > 0,
      };
    });
    expect(result.riding).toBe(true);
    expect(result.hit).toEqual([1, 2, 3, 4]);
    // Into turn B, ~285 m from the start, with a boost.
    expect(result.end.z).toBeGreaterThan(10);
    expect(result.end.boost).toBeGreaterThan(0);
    expect(result.place).toBeLessThan(3);
    expect(result.respawning).toBe(false);
  });
});
