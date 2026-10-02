import { describe, expect, it } from 'vitest';
import { trackLoad, whenLoadsSettle } from './pending';

/** A promise with its resolve and reject exposed. */
function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('pending loads (MK-97)', () => {
  it('resolves at once when nothing is loading', async () => {
    await expect(whenLoadsSettle()).resolves.toBeUndefined();
  });

  it('waits for every tracked load, failed ones included, and loads started meanwhile', async () => {
    const first = deferred();
    const second = deferred();
    const third = deferred();
    void trackLoad(first.promise).catch(() => {});
    void trackLoad(second.promise);
    let done = false;
    const settled = whenLoadsSettle().then(() => (done = true));
    first.reject(new Error('404'));
    // A Retry starts another load before the second one finishes.
    void trackLoad(third.promise);
    second.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(done).toBe(false);
    third.resolve();
    await settled;
    expect(done).toBe(true);
  });
});
