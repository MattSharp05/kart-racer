import type { MemberInfo, RoomBackend, RoomChannel, RoomMember } from './roomBackend';

/**
 * Rooms (MK-40, PRD v2 flows 2–3): a host creates a room and gets a 4-character code; friends join
 * with the code or the link `/?room=CODE`. Members and their lobby info are presence on the room's
 * channel (`RoomBackend`: Supabase in production, BroadcastChannel for `?net=local`). Nothing is
 * stored: the room ends when the host leaves. The lobby screen (host settings, start) is MK-47.
 */

/** 32 characters without the look-alikes 0/O and 1/I. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;
/** Humans per room (AI fills the other karts). */
export const MAX_ROOM_PLAYERS = 4;
/** Codes tried before creating a room gives up (a collision is ~1 in a million per try). */
export const CREATE_ATTEMPTS = 5;

export type { MemberInfo, RoomMember } from './roomBackend';

/** Why a room couldn't be joined, or ended. */
export type RoomError = 'not-found' | 'full' | 'host-left' | 'code-taken' | 'unavailable';

export const ROOM_ERROR_MESSAGES: Record<RoomError, string> = {
  'not-found': 'Room not found',
  full: 'Room is full',
  'host-left': 'Host left the room',
  'code-taken': 'That room code is already in use',
  unavailable: "Couldn't reach the online service. Check your connection and try again.",
};

export class RoomJoinError extends Error {
  constructor(readonly reason: RoomError) {
    super(ROOM_ERROR_MESSAGES[reason]);
  }
}

/** A random room code (`random` returns [0, 1), like `Math.random`). */
export function randomRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    const index = Math.min(
      Math.floor(random() * ROOM_CODE_ALPHABET.length),
      ROOM_CODE_ALPHABET.length - 1,
    );
    code += ROOM_CODE_ALPHABET[index];
  }
  return code;
}

/** What someone typed as a code: upper case, only alphabet characters, at most 4 of them. */
export function normalizeRoomCode(text: string): string {
  return [...text.toUpperCase()]
    .filter((c) => ROOM_CODE_ALPHABET.includes(c))
    .join('')
    .slice(0, ROOM_CODE_LENGTH);
}

export function isRoomCode(text: string): boolean {
  return text.length === ROOM_CODE_LENGTH && normalizeRoomCode(text) === text;
}

/** The host first, then everyone in join order (id breaks ties): the same order on every device. */
export function sortMembers(members: RoomMember[]): RoomMember[] {
  return [...members].sort(
    (a, b) =>
      Number(b.isHost) - Number(a.isHost) ||
      a.joinedAt - b.joinedAt ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export interface RoomOptions {
  /** Random source for the code and member id (tests pass a seeded one). */
  random?: () => number;
  /** Clock for `joinedAt`, ms. */
  now?: () => number;
}

/**
 * Creates a room with a fresh code (retrying a code someone is already in), or exactly `code` when
 * given (dev links). Throws `RoomJoinError`.
 */
export async function createRoom(
  backend: RoomBackend,
  info: MemberInfo,
  options: RoomOptions & { code?: string } = {},
): Promise<Room> {
  const random = options.random ?? Math.random;
  const selfId = memberId(random);
  const attempts = options.code ? 1 : CREATE_ATTEMPTS;
  for (let i = 0; i < attempts; i += 1) {
    const code = options.code ?? randomRoomCode(random);
    const channel = await openChannel(backend, code, selfId);
    if (channel.members().length > 0) {
      channel.close();
      continue;
    }
    return enter(channel, code, { ...info, id: selfId, isHost: true, joinedAt: now(options) });
  }
  throw new RoomJoinError(options.code ? 'code-taken' : 'unavailable');
}

/** Joins room `code`. Throws `RoomJoinError` (not found, full, unavailable). */
export async function joinRoom(
  backend: RoomBackend,
  code: string,
  info: MemberInfo,
  options: RoomOptions = {},
): Promise<Room> {
  const selfId = memberId(options.random ?? Math.random);
  const channel = await openChannel(backend, code, selfId);
  await hostPresent(channel, backend.presenceLagMs);
  const present = channel.members();
  const error: RoomError | null = !present.some((m) => m.isHost)
    ? 'not-found'
    : present.length >= MAX_ROOM_PLAYERS
      ? 'full'
      : null;
  if (error) {
    channel.close();
    throw new RoomJoinError(error);
  }
  return enter(channel, code, { ...info, id: selfId, isHost: false, joinedAt: now(options) });
}

/** Resolves once the channel shows a host, or after `waitMs` without one. */
function hostPresent(channel: RoomChannel, waitMs: number): Promise<void> {
  const hasHost = () => channel.members().some((m) => m.isHost);
  if (hasHost() || waitMs <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, waitMs);
    channel.onSync(() => {
      if (!hasHost()) return;
      clearTimeout(timer);
      resolve();
    });
  });
}

async function openChannel(backend: RoomBackend, code: string, selfId: string) {
  try {
    return await backend.open(code, selfId);
  } catch {
    throw new RoomJoinError('unavailable');
  }
}

async function enter(channel: RoomChannel, code: string, self: RoomMember): Promise<Room> {
  try {
    await channel.track(self);
  } catch {
    channel.close();
    throw new RoomJoinError('unavailable');
  }
  return new Room(code, channel, self);
}

function memberId(random: () => number): string {
  return `p-${Math.floor(random() * 2 ** 32).toString(36)}${Math.floor(random() * 2 ** 32).toString(36)}`;
}

function now(options: RoomOptions): number {
  return (options.now ?? Date.now)();
}

/**
 * This device in a room: the live member list, its own presence, and the room's end. Build one
 * with `createRoom` or `joinRoom`.
 */
export class Room {
  /** Everyone present, host first then in join order (see `sortMembers`); this device included. */
  members: RoomMember[] = [];
  /** Why the room ended for this device (host left; a 5th player who lost the race for a seat). */
  ended: RoomError | null = null;
  private readonly changeListeners = new Set<() => void>();
  private readonly endListeners = new Set<(reason: RoomError) => void>();
  private left = false;

  constructor(
    readonly code: string,
    private readonly channel: RoomChannel,
    private self: RoomMember,
  ) {
    channel.onSync(() => this.sync());
    this.sync();
  }

  get selfId(): string {
    return this.self.id;
  }

  get isHost(): boolean {
    return this.self.isHost;
  }

  /** Calls `listener` whenever `members` changes; returns the unsubscribe function. */
  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /** Calls `listener` once if the room ends for this device (not when it leaves by itself). */
  onEnded(listener: (reason: RoomError) => void): () => void {
    this.endListeners.add(listener);
    return () => this.endListeners.delete(listener);
  }

  /** Changes what this device shows the room (racer, ready…; MK-47). */
  async update(info: Partial<MemberInfo>): Promise<void> {
    if (this.left) return;
    this.self = { ...this.self, ...info };
    this.sync();
    await this.channel.track(this.self);
  }

  /** Leaves the room; the host leaving ends it for everyone. */
  leave(): void {
    if (this.left) return;
    this.left = true;
    this.changeListeners.clear();
    this.endListeners.clear();
    this.channel.close();
  }

  private sync(): void {
    if (this.left) return;
    const others = this.channel.members().filter((m) => m.id !== this.self.id);
    // Our own entry from `self`: presence may echo it back later than we changed it.
    this.members = sortMembers([this.self, ...others]);
    if (!this.self.isHost) {
      if (!others.some((m) => m.isHost)) return this.end('host-left');
      // Two players took the last seat at once: the later one (same order everywhere) steps out.
      const seat = this.members.findIndex((m) => m.id === this.self.id);
      if (seat >= MAX_ROOM_PLAYERS) return this.end('full');
    }
    for (const listener of this.changeListeners) listener();
  }

  private end(reason: RoomError): void {
    this.ended = reason;
    const listeners = [...this.endListeners];
    this.leave();
    for (const listener of listeners) listener(reason);
  }
}
