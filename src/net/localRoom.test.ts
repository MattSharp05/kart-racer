import { afterEach, describe, expect, it, vi } from 'vitest';
import { hostLocalRoom, joinLocalRoom, type LocalRoomJoin } from './localRoom';
import type { Transport } from './transport';

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});

/** Hosts `room` with `slots` places; returns the links handed to the host, by client id. */
function host(room: string, slots: number) {
  const links = new Map<string, Transport>();
  const accept = vi.fn((transport: Transport, clientId: string) => {
    if (links.size >= slots) return false;
    links.set(clientId, transport);
    cleanup.push(() => transport.close());
    return true;
  });
  cleanup.push(hostLocalRoom(room, accept));
  return { links, accept };
}

function join(room: string, id: string, onFailed?: (reason: 'full') => void): LocalRoomJoin {
  const joined = joinLocalRoom(room, id, onFailed);
  cleanup.push(() => {
    joined.stop();
    joined.transport.close();
  });
  return joined;
}

function nextPacket(transport: Transport): Promise<number[]> {
  return new Promise((resolve) => transport.onMessage((packet) => resolve([...packet])));
}

describe('local rooms (?net=local)', () => {
  it('links each client that joins to the host, both ways', async () => {
    const room = host('room-a', 2);
    const a = join('room-a', 'a');
    const b = join('room-a', 'b');
    await vi.waitFor(() => expect([...room.links.keys()].sort()).toEqual(['a', 'b']));

    const toA = nextPacket(a.transport);
    room.links.get('a')!.send(new Uint8Array([1, 2]));
    expect(await toA).toEqual([1, 2]);
    const fromB = nextPacket(room.links.get('b')!);
    b.transport.send(new Uint8Array([3]));
    expect(await fromB).toEqual([3]);
  });

  it('keeps asking until a host opens the room, and accepts each client once', async () => {
    const a = join('room-b', 'a');
    await new Promise((resolve) => setTimeout(resolve, 50));
    const room = host('room-b', 2);
    await vi.waitFor(() => expect(room.links.has('a')).toBe(true), { timeout: 2000 });
    // Retries after the welcome don't create a second link.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(room.accept).toHaveBeenCalledTimes(1);
    expect(a.transport.state).toBe('open');
  });

  it('tells a client when the room is full', async () => {
    host('room-c', 1);
    join('room-c', 'a');
    const onFailed = vi.fn();
    const late = join('room-c', 'b', onFailed);
    await vi.waitFor(() => expect(onFailed).toHaveBeenCalledWith('full'));
    expect(late.transport.state).toBe('closed');
  });
});
