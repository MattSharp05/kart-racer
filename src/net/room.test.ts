import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRoom,
  isRoomCode,
  joinRoom,
  MAX_ROOM_PLAYERS,
  normalizeRoomCode,
  randomRoomCode,
  ROOM_CODE_ALPHABET,
  RoomJoinError,
  sortMembers,
  type Room,
  type RoomError,
} from './room';
import type { MemberInfo, RoomBackend, RoomChannel, RoomMember } from './roomBackend';
import { localRoomBackend } from './roomBackendLocal';
import { rngFloat, seedRng } from '../sim/rng';

/** A seeded `Math.random` stand-in. */
function mulberry32(seed: number): () => number {
  const holder = { rngState: seedRng(seed) };
  return () => rngFloat(holder);
}

const INFO: MemberInfo = { nickname: 'Player', colour: '#e63946', racer: 'maple', ready: false };
const FAST = { syncMs: 20, heartbeatMs: 40, expiryMs: 150 };

const rooms: Room[] = [];
afterEach(() => {
  for (const room of rooms.splice(0)) room.leave();
});

function keep(room: Room): Room {
  rooms.push(room);
  return room;
}

let codes = 0;
/** A code no other test uses (BroadcastChannel reaches every test in the file). */
function freshCode(): string {
  codes += 1;
  return `T${String(codes).padStart(3, '2')}`;
}

async function reason(promise: Promise<unknown>): Promise<RoomError | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof RoomJoinError ? error.reason : undefined;
  }
}

/** Waits until `check` passes (BroadcastChannel delivers asynchronously). */
async function until(check: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** An in-memory backend whose rooms already hold the given members. */
function fakeBackend(occupied: Record<string, RoomMember[]>) {
  const opened: string[] = [];
  const backend: RoomBackend = {
    open(code) {
      opened.push(code);
      const members = [...(occupied[code] ?? [])];
      const channel: RoomChannel = {
        members: () => members,
        onSync: () => undefined,
        track: (member) => {
          members.push(member);
          return Promise.resolve();
        },
        close: () => undefined,
      };
      return Promise.resolve(channel);
    },
  };
  return { backend, opened };
}

function member(id: string, isHost: boolean, joinedAt: number): RoomMember {
  return { ...INFO, id, isHost, joinedAt };
}

describe('room codes', () => {
  it('use the 32-character alphabet without look-alikes', () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(32);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(32);
    for (const c of '01IO') expect(ROOM_CODE_ALPHABET).not.toContain(c);
  });

  it('are 4 characters from the alphabet, covering all of it', () => {
    const random = mulberry32(7);
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const code = randomRoomCode(random);
      expect(isRoomCode(code), code).toBe(true);
      for (const c of code) seen.add(c);
    }
    expect(seen.size).toBe(32);
    // The edges of [0, 1) map to the first and last character.
    expect(randomRoomCode(() => 0)).toBe('AAAA');
    expect(randomRoomCode(() => 0.999999)).toBe('9999');
  });

  it('normalize typing: upper case, drops other characters, 4 at most', () => {
    expect(normalizeRoomCode('k7qx')).toBe('K7QX');
    expect(normalizeRoomCode(' k-7 q x z')).toBe('K7QX');
    expect(normalizeRoomCode('o0i1')).toBe('');
    expect(isRoomCode('K7Q')).toBe(false);
    expect(isRoomCode('K7QO')).toBe(false);
  });
});

describe('createRoom', () => {
  it('retries a code that is already in use', async () => {
    // The first code this sequence draws (after the 2 draws of the member id) is taken.
    const probe = mulberry32(3);
    probe();
    probe();
    const taken = randomRoomCode(probe);
    const { backend, opened } = fakeBackend({ [taken]: [member('someone', true, 1)] });
    const room = await createRoom(backend, INFO, { random: mulberry32(3) });
    expect(opened).toHaveLength(2);
    expect(opened[0]).toBe(taken);
    expect(room.code).toBe(opened[1]);
    expect(room.code).not.toBe(taken);
    expect(room.isHost).toBe(true);
  });

  it('gives up after every attempt collides', async () => {
    const backend: RoomBackend = fakeBackend({}).backend;
    const full: RoomBackend = {
      open: async (code, id) => {
        const channel = await backend.open(code, id);
        await channel.track(member('other', true, 1));
        return channel;
      },
    };
    expect(await reason(createRoom(full, INFO))).toBe('unavailable');
  });

  it('a fixed code in use is an error, not a retry', async () => {
    const { backend, opened } = fakeBackend({ ABCD: [member('h', true, 1)] });
    expect(await reason(createRoom(backend, INFO, { code: 'ABCD' }))).toBe('code-taken');
    expect(opened).toEqual(['ABCD']);
  });

  it('a backend that cannot connect is "unavailable"', async () => {
    const down: RoomBackend = { open: () => Promise.reject(new Error('offline')) };
    expect(await reason(createRoom(down, INFO))).toBe('unavailable');
  });
});

describe('sortMembers', () => {
  it('puts the host first, then join order, then id', () => {
    const sorted = sortMembers([
      member('c', false, 5),
      member('b', false, 3),
      member('h', true, 9),
      member('a', false, 3),
    ]);
    expect(sorted.map((m) => m.id)).toEqual(['h', 'a', 'b', 'c']);
  });
});

describe('rooms over the local backend', () => {
  const backend = localRoomBackend(FAST);

  it('a joiner and the host both see 2 members; leaving shows 1', async () => {
    const code = freshCode();
    const host = keep(await createRoom(backend, { ...INFO, nickname: 'Hosty' }, { code }));
    const guest = keep(await joinRoom(backend, code, { ...INFO, nickname: 'Guest' }));
    await until(() => host.members.length === 2);
    expect(guest.members.map((m) => m.nickname)).toEqual(['Hosty', 'Guest']);
    expect(host.members.map((m) => m.nickname)).toEqual(['Hosty', 'Guest']);
    const changed = vi.fn();
    host.onChange(changed);
    guest.leave();
    await until(() => host.members.length === 1);
    expect(changed).toHaveBeenCalled();
  });

  it('an unknown code is "not-found"', async () => {
    expect(await reason(joinRoom(backend, freshCode(), INFO))).toBe('not-found');
  });

  it(`a player beyond ${MAX_ROOM_PLAYERS} is refused with "full"`, async () => {
    const code = freshCode();
    keep(await createRoom(backend, INFO, { code }));
    for (let i = 1; i < MAX_ROOM_PLAYERS; i += 1) keep(await joinRoom(backend, code, INFO));
    expect(await reason(joinRoom(backend, code, INFO))).toBe('full');
  });

  it('the host leaving ends the room for everyone', async () => {
    const code = freshCode();
    const host = keep(await createRoom(backend, INFO, { code }));
    const guest = keep(await joinRoom(backend, code, INFO));
    const ended = vi.fn();
    guest.onEnded(ended);
    host.leave();
    await until(() => guest.ended !== null);
    expect(guest.ended).toBe('host-left');
    expect(ended).toHaveBeenCalledWith('host-left');
    // A room whose host left can't be joined.
    expect(await reason(joinRoom(backend, code, INFO))).toBe('not-found');
  });

  it('a tab that vanishes without saying bye drops out after its heartbeat stops', async () => {
    const code = freshCode();
    const host = keep(await createRoom(backend, INFO, { code }));
    const channel = await backend.open(code, 'ghost');
    await channel.track(member('ghost', false, Date.now()));
    await until(() => host.members.length === 2);
    // Silence the ghost's heartbeat without its bye, as a crashed tab would.
    (channel as unknown as { closed: boolean; timer: ReturnType<typeof setInterval> }).closed =
      true;
    clearInterval((channel as unknown as { timer: ReturnType<typeof setInterval> }).timer);
    await until(() => host.members.length === 1, 2000);
    channel.close();
  });

  it('update() shows the new info to the others', async () => {
    const code = freshCode();
    const host = keep(await createRoom(backend, INFO, { code }));
    const guest = keep(await joinRoom(backend, code, INFO));
    await guest.update({ racer: 'boulder', ready: true });
    await until(() => host.members[1]?.racer === 'boulder');
    expect(host.members[1]?.ready).toBe(true);
  });
});
