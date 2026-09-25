import { afterEach, describe, expect, it } from 'vitest';
import { BroadcastChannelTransport, type Transport } from './transport';

const open: Transport[] = [];
afterEach(() => {
  for (const transport of open.splice(0)) transport.close();
});

function link(channel: string, local: string, remote: string): BroadcastChannelTransport {
  const transport = new BroadcastChannelTransport(channel, local, remote);
  open.push(transport);
  return transport;
}

/** Resolves with the packets `transport` received once `count` arrived. */
function receive(transport: Transport, count: number): Promise<number[][]> {
  const got: number[][] = [];
  return new Promise((resolve) =>
    transport.onMessage((packet) => {
      got.push([...packet]);
      if (got.length === count) resolve(got);
    }),
  );
}

describe('BroadcastChannelTransport', () => {
  it('links two ends by id, with many links on one channel', async () => {
    const hostToA = link('room-1', 'host', 'a');
    const hostToB = link('room-1', 'host', 'b');
    const a = link('room-1', 'a', 'host');
    const b = link('room-1', 'b', 'host');
    expect(a.state).toBe('open');

    const atA = receive(a, 1);
    const atB = receive(b, 1);
    const atHostFromA = receive(hostToA, 2);
    hostToA.send(new Uint8Array([1, 2, 3]));
    hostToB.send(new Uint8Array([9]));
    a.send(new Uint8Array([4]));
    a.send(new Uint8Array([5, 6]));

    expect(await atA).toEqual([[1, 2, 3]]);
    expect(await atB).toEqual([[9]]);
    expect(await atHostFromA).toEqual([[4], [5, 6]]);
  });

  it('stops delivering once closed', async () => {
    const host = link('room-2', 'host', 'a');
    const a = link('room-2', 'a', 'host');
    const got: number[] = [];
    a.onMessage((packet) => got.push(packet[0] ?? -1));
    a.close();
    expect(a.state).toBe('closed');
    host.send(new Uint8Array([1]));
    a.send(new Uint8Array([2])); // dropped silently
    // A packet on another link proves the channel delivered in the meantime.
    const other = link('room-2', 'b', 'host');
    const hostToB = link('room-2', 'host', 'b');
    const atB = receive(other, 1);
    hostToB.send(new Uint8Array([3]));
    await atB;
    expect(got).toEqual([]);
  });
});
