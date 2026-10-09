import { describe, expect, it } from 'vitest';
import { buzzesFor } from './haptics';

describe('buzzesFor (MK-147)', () => {
  it('buzzes for item hits and mini-turbos on the phone’s own kart only', () => {
    expect(
      buzzesFor(
        [
          { type: 'kartHit', kartId: 2, by: 0, kind: 'hazard' },
          { type: 'miniTurbo', kartId: 1, tier: 2 },
          { type: 'kartHit', kartId: 1, by: 3, kind: 'hazard' },
          { type: 'kartHit', kartId: 1, by: 4, kind: 'hazard' },
          { type: 'lap', kartId: 1, lap: 2 },
        ],
        1,
      ),
    ).toEqual(['turbo', 'hit']);
    expect(buzzesFor([{ type: 'miniTurbo', kartId: 0, tier: 1 }], 1)).toEqual([]);
    expect(buzzesFor([], 1)).toEqual([]);
  });
});
