import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../sim/types';
import { cueFor } from './soundMap';

/** One example of every event type. `satisfies` makes this fail to compile if a type is missing. */
const EXAMPLES = {
  phaseChanged: { type: 'phaseChanged', phase: 'racing' },
  checkpoint: { type: 'checkpoint', kartId: 0, index: 1 },
  lap: { type: 'lap', kartId: 0, lap: 2 },
  positionChange: { type: 'positionChange', positions: [0] },
  countdown: { type: 'countdown', value: 3 },
  go: { type: 'go' },
  rocketStart: { type: 'rocketStart', kartId: 0 },
  stall: { type: 'stall', kartId: 0 },
  finish: { type: 'finish', kartId: 0, position: 1, time: 150 },
  respawn: { type: 'respawn', kartId: 0 },
  itemBoxHit: { type: 'itemBoxHit', kartId: 0, boxId: 1 },
  itemGranted: { type: 'itemGranted', kartId: 0, item: 'banana' },
  itemUsed: { type: 'itemUsed', kartId: 0, item: 'green' },
  kartHit: { type: 'kartHit', kartId: 0, by: 1, kind: 'banana' },
  star: { type: 'star', kartId: 0 },
  lightning: { type: 'lightning', kartId: 0 },
  wallHit: { type: 'wallHit', kartId: 0, strength: 10 },
  bump: { type: 'bump', a: 0, b: 1, strength: 5 },
  hop: { type: 'hop', kartId: 0 },
  driftStart: { type: 'driftStart', kartId: 0, direction: 1 },
  driftTier: { type: 'driftTier', kartId: 0, tier: 2 },
  driftCancel: { type: 'driftCancel', kartId: 0 },
  miniTurbo: { type: 'miniTurbo', kartId: 0, tier: 3 },
  boost: { type: 'boost', kartId: 0, seconds: 1 },
  boostPad: { type: 'boostPad', kartId: 0 },
  launch: { type: 'launch', kartId: 0 },
  trick: { type: 'trick', kartId: 0 },
  land: { type: 'land', kartId: 0, airTime: 1 },
} satisfies { [K in SimEvent['type']]: Extract<SimEvent, { type: K }> };

/** Events that are deliberately silent (something else already makes the sound, or nothing to hear). */
const SILENT = new Set(['phaseChanged', 'checkpoint', 'positionChange', 'boost']);

describe('event → sound mapping', () => {
  it('covers every SimEvent type', () => {
    for (const [type, event] of Object.entries(EXAMPLES)) {
      const cue = cueFor(event as SimEvent);
      if (SILENT.has(type)) expect(cue, type).toBeNull();
      else expect(cue?.id, type).toBeTruthy();
    }
  });

  it('the final lap gets its own jingle', () => {
    expect(cueFor({ type: 'lap', kartId: 0, lap: 3 }, 3)?.id).toBe('finalLap');
    expect(cueFor({ type: 'lap', kartId: 0, lap: 2 }, 3)?.id).toBe('lap');
    expect(cueFor({ type: 'lap', kartId: 0, lap: 1 }, 3)).toBeNull();
  });

  it('every item has a use sound (star/lightning via their own events)', () => {
    for (const item of ['mushroom', 'banana', 'green', 'red'] as const) {
      expect(cueFor({ type: 'itemUsed', kartId: 0, item })?.id).toBeTruthy();
    }
    expect(cueFor({ type: 'star', kartId: 0 })?.id).toBe('starOn');
    expect(cueFor({ type: 'lightning', kartId: 0 })?.scope).toBe('all');
  });
});
