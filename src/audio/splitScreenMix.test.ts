import { describe, expect, it } from 'vitest';
import { localRace } from '../scenarios/local';
import { cueVolume, nearbyEngines } from './soundManager';

// MK-145: one listener (P1); the other local players' sounds are kept.
describe('split-screen sound mix (MK-145)', () => {
  const state = localRace(1, 3);
  // P1 = kart 0; P2, P3 = karts 1, 2.
  const players = [0, 1, 2];
  const far = (kartId: number, x: number) => {
    const kart = state.karts[kartId]!;
    kart.position = { ...kart.position, x };
  };

  it("plays P1's own sounds at full volume, P2's quieter, and never an AI's", () => {
    const cue = { id: 'itemGet', scope: 'player', volume: 1 } as const;
    expect(cueVolume({ ...cue, kartId: 0 }, state, 0, players)).toBe(1);
    const p2 = cueVolume({ ...cue, kartId: 1 }, state, 0, players)!;
    expect(p2).toBeGreaterThan(0);
    expect(p2).toBeLessThan(1);
    expect(cueVolume({ ...cue, kartId: 5 }, state, 0, players)).toBeNull();
  });

  it('one player hears only their own sounds, as before', () => {
    const cue = { id: 'itemGet', scope: 'player', kartId: 1 } as const;
    expect(cueVolume(cue, state, 0, [0])).toBeNull();
    expect(cueVolume(cue, state, 0)).toBeNull();
  });

  it('hears a sound near any local player, from the nearest of them', () => {
    const copy = structuredClone(state);
    const kart = (id: number) => copy.karts[id]!;
    kart(0).position = { x: 0, y: 0, z: 0 };
    kart(1).position = { x: 500, y: 0, z: 0 };
    kart(6).position = { x: 505, y: 0, z: 0 };
    const cue = { id: 'bump', scope: 'near', kartId: 6 } as const;
    expect(cueVolume(cue, copy, 0, [0])).toBeNull();
    expect(cueVolume(cue, copy, 0, [0, 1])).toBeGreaterThan(0.8);
  });

  it("keeps the other players' engines on wherever they are, before the nearest AI", () => {
    far(2, 900);
    const engines = nearbyEngines(state, 0, players);
    expect(engines.slice(0, 2).map((e) => e.kart.id)).toEqual([1, 2]);
    expect(engines.length).toBeLessThanOrEqual(3);
    // One player: the nearest karts, whoever they are.
    expect(nearbyEngines(state, 0, [0]).map((e) => e.kart.id)).not.toContain(2);
  });
});
