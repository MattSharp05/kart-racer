import { describe, expect, it } from 'vitest';
import { createSimState } from '../sim/state';
import { poseLine } from './perfOverlay';

describe('poseLine (MK-99)', () => {
  it('shows a mesh-track kart’s start for &at=/&yaw=, its up and anti-gravity', () => {
    const [kart] = createSimState({
      seed: 1,
      karts: [
        { position: { x: 1.25, y: 8, z: -3 }, heading: Math.PI / 2, up: { x: 0, y: -1, z: 0 } },
      ],
    }).karts;
    expect(poseLine({ ...kart!, antigrav: true })).toBe(
      'at 1.3,8.0,-3.0  yaw 90\nup 0.00 -1.00 0.00  ANTI-GRAV',
    );
  });

  it('is nothing off mesh tracks', () => {
    expect(poseLine(createSimState({ seed: 1 }).karts[0])).toBeUndefined();
  });
});
