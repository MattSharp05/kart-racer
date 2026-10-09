import { describe, expect, it } from 'vitest';
import { decodeRemote, encodeRemote, SequenceFilter, type RemoteMessage } from './protocol';

describe('remote protocol (MK-146)', () => {
  it('round-trips every message', () => {
    const messages: RemoteMessage[] = [
      { type: 'hello', slot: 2 },
      { type: 'welcome', slot: 3 },
      { type: 'ping', time: 12345.678 },
      { type: 'pong', time: 0.5 },
      { type: 'bye' },
      {
        type: 'input',
        seq: 4_000_000_000,
        input: { steer: -1, throttle: 1, brake: 0, drift: true, item: false, respawn: true },
        buttons: { lookBack: true, pause: false },
      },
      {
        type: 'input',
        seq: 1,
        input: { steer: 0, throttle: 0, brake: 1, drift: false, item: true, respawn: false },
        buttons: { lookBack: false, pause: true },
      },
      { type: 'buzz', kind: 'hit' },
      { type: 'buzz', kind: 'turbo' },
    ];
    for (const message of messages) expect(decodeRemote(encodeRemote(message))).toEqual(message);
  });

  it('quantises inputs and clamps out-of-range values', () => {
    const bytes = encodeRemote({
      type: 'input',
      seq: 7,
      input: { steer: 0.5, throttle: 2, brake: -1, drift: false, item: true },
      buttons: { lookBack: false, pause: false },
    });
    expect(bytes.length).toBe(9);
    const decoded = decodeRemote(bytes);
    expect(decoded?.type).toBe('input');
    if (decoded?.type !== 'input') return;
    expect(decoded.seq).toBe(7);
    expect(decoded.input.steer).toBeCloseTo(0.5, 2);
    expect(decoded.input.throttle).toBe(1);
    expect(decoded.input.brake).toBe(0);
    expect(decoded.input.item).toBe(true);
    expect(decoded.input.respawn).toBe(false);
  });

  it('rejects unknown types and wrong lengths', () => {
    expect(decodeRemote(Uint8Array.of())).toBeNull();
    expect(decodeRemote(Uint8Array.of(99))).toBeNull();
    expect(decodeRemote(Uint8Array.of(1))).toBeNull();
    expect(decodeRemote(Uint8Array.of(3, 0, 0))).toBeNull();
    expect(decodeRemote(Uint8Array.of(6, 0))).toBeNull();
    // Buzz: a kind that isn't one, or no kind.
    expect(decodeRemote(Uint8Array.of(7, 9))).toBeNull();
    expect(decodeRemote(Uint8Array.of(7))).toBeNull();
  });
});

describe('SequenceFilter', () => {
  it('keeps only packets newer than the newest seen', () => {
    const filter = new SequenceFilter();
    expect(filter.last).toBe(-1);
    expect(filter.accept(0)).toBe(true);
    expect(filter.accept(2)).toBe(true);
    // Out of order: 1 arrives after 2.
    expect(filter.accept(1)).toBe(false);
    // Duplicate.
    expect(filter.accept(2)).toBe(false);
    expect(filter.accept(3)).toBe(true);
    expect(filter.last).toBe(3);
  });

  it('rejects nonsense sequence numbers', () => {
    const filter = new SequenceFilter();
    expect(filter.accept(-1)).toBe(false);
    expect(filter.accept(1.5)).toBe(false);
    expect(filter.accept(Number.NaN)).toBe(false);
  });
});
