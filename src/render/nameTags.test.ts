import { describe, expect, it } from 'vitest';
import { scenarios } from '../scenarios';
import { nameTagKarts, tagSize } from './nameTags';

describe('name tags (MK-55)', () => {
  it('tag the other people, not you and not the AI', () => {
    const state = scenarios.get('online-name-tags')!.setup(1).state;
    expect(nameTagKarts(state, 0).map((k) => k.name)).toEqual(['Ann', 'Bob', 'Cleo']);
    // Following Ann (a spectator camera, say): she loses her tag, you get yours.
    expect(nameTagKarts(state, 1).map((k) => k.id)).toEqual([0, 2, 3]);
    // A local race has no one else to tag.
    const local = scenarios.get('race-finished')!.setup(1).state;
    expect(nameTagKarts(local, 0)).toEqual([]);
  });

  it('keep their world size up close, grow with distance past it, fade out and hide when far', () => {
    const near = tagSize(5);
    const mid = tagSize(28);
    expect(near.opacity).toBe(1);
    expect(tagSize(10).height).toBe(near.height);
    expect(mid.height).toBeCloseTo(near.height * 2);
    expect(tagSize(62).opacity).toBeGreaterThan(0);
    expect(tagSize(62).opacity).toBeLessThan(1);
    expect(tagSize(70).opacity).toBe(0);
    expect(tagSize(500).opacity).toBe(0);
  });
});
