import { describe, expect, it } from 'vitest';
import { PendingTransport } from './raceLinks';
import { BaseTransport } from './transport';

/** A link that opens when told to and records what it sends. */
class FakeTransport extends BaseTransport {
  sent: number[] = [];
  send(packet: Uint8Array): void {
    this.sent.push(packet[0] ?? -1);
  }
  open(): void {
    this.setState('open');
  }
  receive(value: number): void {
    this.deliver(new Uint8Array([value]));
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('PendingTransport', () => {
  it('drops sends until the link connects, then passes packets both ways', async () => {
    const link = deferred<FakeTransport>();
    const pending = new PendingTransport(link.promise);
    const received: number[] = [];
    pending.onMessage((packet) => received.push(packet[0] ?? -1));
    expect(pending.state).toBe('connecting');
    pending.send(new Uint8Array([1]));

    const inner = new FakeTransport();
    inner.open();
    link.resolve(inner);
    await link.promise;
    expect(pending.state).toBe('open');
    pending.send(new Uint8Array([2]));
    inner.receive(3);
    expect(inner.sent).toEqual([2]);
    expect(received).toEqual([3]);

    // The connection closing closes the pending link too.
    inner.close();
    expect(pending.state).toBe('closed');
  });

  it('closed before it connects: the late connection is closed at once', async () => {
    const link = deferred<FakeTransport>();
    const pending = new PendingTransport(link.promise);
    pending.close();
    const inner = new FakeTransport();
    inner.open();
    link.resolve(inner);
    await link.promise;
    await Promise.resolve();
    expect(inner.state).toBe('closed');
    expect(pending.state).toBe('closed');
  });
});
