import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createSimState } from '../sim/state';
import { DT, tuning } from '../sim/tuning';
import type { SimState } from '../sim/types';
import { Glider, nextOpenness } from './glider';
import { KartRenderer } from './karts';

const OPEN_TICKS = Math.round(tuning.mk8.glide.openSeconds / DT);

describe('gliders in a race (MK-106)', () => {
  it('open over `openSeconds` and fold as fast', () => {
    expect(nextOpenness(0, true, tuning.mk8.glide.openSeconds / 2)).toBeCloseTo(0.5);
    expect(nextOpenness(0.9, true, 1)).toBe(1);
    expect(nextOpenness(1, false, tuning.mk8.glide.openSeconds / 2)).toBeCloseTo(0.5);
    expect(nextOpenness(0.1, false, 1)).toBe(0);
  });

  it('a glider is hidden folded and shown from the first moment it opens', () => {
    const glider = new Glider(0xff0000);
    expect(glider.object.visible).toBe(false);
    glider.setOpenness(0.2);
    expect(glider.object.visible).toBe(true);
    glider.setOpenness(0);
    expect(glider.object.visible).toBe(false);
  });

  it("follows the sim's glide: unfolds while the kart glides, folds after it lands", () => {
    const scene = new THREE.Scene();
    const karts = new KartRenderer(scene);
    let state: SimState = createSimState({ seed: 1, trackId: 'sunny-circuit' });
    const at = (tick: number, glideTime?: number): SimState => {
      const next = structuredClone(state);
      next.tick = tick;
      const kart = next.karts[0]!;
      if (glideTime === undefined) delete kart.glide;
      else kart.glide = { time: glideTime, pitch: 0 };
      return next;
    };
    const sync = (next: SimState) => {
      karts.sync(state, next, 1);
      state = next;
    };
    sync(at(1));
    expect(karts.gliderOpenness(0)).toBe(0);
    // The launch tick (glide time 0) already shows a tick's worth.
    sync(at(2, 0));
    expect(karts.gliderOpenness(0)).toBeCloseTo(1 / OPEN_TICKS);
    sync(at(1 + OPEN_TICKS, (OPEN_TICKS - 1) * DT));
    expect(karts.gliderOpenness(0)).toBe(1);
    // Landed: folds over the same time, by the ticks stepped.
    sync(at(2 + OPEN_TICKS));
    expect(karts.gliderOpenness(0)).toBeCloseTo(1 - 1 / OPEN_TICKS);
    sync(at(2 + 2 * OPEN_TICKS));
    expect(karts.gliderOpenness(0)).toBe(0);
    // Other karts never glided: no glider.
    expect(karts.gliderOpenness(1)).toBe(0);
  });
});
