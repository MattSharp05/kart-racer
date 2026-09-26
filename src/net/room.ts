import type { MemberInfo, RoomBackend, RoomChannel, RoomMember } from './roomBackend';
import type { Signal, SignalingChannel } from './webrtc';

/**
 * Rooms (MK-40, PRD v2 flows 2–3): a host creates a room and gets a 4-character code; friends join
 * with the code or the link `/?room=CODE`. Members and their lobby info are presence on the room's
 * channel (`RoomBackend`: Supabase in production, BroadcastChannel for `?net=local`). Nothing is
 * stored: the room ends when the host leaves. The lobby's settings, racers, ready and start travel
 * in presence too (`lobbyState.ts`, MK-47).
 */

/** 32 characters without the look-alikes 0/O and 1/I. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;
/** Humans per room (AI fills the other karts). */
export const MAX_ROOM_PLAYERS = 4;
/** Codes tried before creating a room gives up (a collision is ~1 in a million per try). */
export const CREATE_ATTEMPTS = 5;

export type { MemberInfo, RoomMember } from './roomBackend';

/** What a member can change about itself: its info, and (host) the lobby settings and start. */
export type MemberUpdate = Partial<MemberInfo & Pick<RoomMember, 'lobby' | 'start'>>;

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

/**
 * The room's order, the same on every device: the host's seat order (`seats`) where it has one,
 * then the host first and everyone else in join order (id breaks ties).
 */
export function sortMembers(members: RoomMember[]): RoomMember[] {
  const seats = members.find((m) => m.isHost)?.seats ?? [];
  const seat = (m: RoomMember) => {
    const index = seats.indexOf(m.id);
    return index < 0 ? seats.length : index;
  };
  return [...members].sort(
    (a, b) =>
      seat(a) - seat(b) ||
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
    const self = { ...info, id: selfId, isHost: true, joinedAt: now(options), seats: [selfId] };
    return enter(channel, code, self);
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
  /** Host: the other members in the order this device first saw them. */
  private arrivals: string[] = [];

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

  /** The host as this device sees it (itself, on the host). */
  get host(): RoomMember | undefined {
    return this.members.find((m) => m.isHost);
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

  /** Changes what this device shows the room (racer, ready; the host's settings and start). */
  async update(info: MemberUpdate): Promise<void> {
    if (this.left) return;
    this.self = { ...this.self, ...info };
    this.sync();
    await this.channel.track(this.self);
  }

  /**
   * WebRTC signaling for race `race` (a `LobbyStart.id`) over the room's channel, addressed by
   * member id (MK-47). Signals of other races, and from or to other members, are ignored.
   */
  signaling(race: string): SignalingChannel {
    const peerId = this.self.id;
    const counts = { sent: 0, received: 0 };
    const handlers: ((from: string, signal: Signal) => void)[] = [];
    const stop = this.channel.onBroadcast((message) => {
      if (message.race !== race || message.from === peerId) return;
      if (message.to !== null && message.to !== peerId) return;
      counts.received += 1;
      for (const handler of handlers) handler(message.from, message.signal);
    });
    return {
      peerId,
      counts,
      send: (to, signal) => {
        if (this.left) return;
        counts.sent += 1;
        this.channel.broadcast({ race, from: peerId, to, signal });
      },
      onSignal: (handler) => handlers.push(handler),
      close: () => {
        handlers.length = 0;
        stop();
      },
    };
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
    if (this.self.isHost) {
      this.updateSeats(others);
    } else {
      const host = others.find((m) => m.isHost);
      if (!host) return this.end('host-left');
      // Two players took the last seat at once: the host seated one first, the other steps out.
      const seat = host.seats?.indexOf(this.self.id) ?? -1;
      if (seat >= MAX_ROOM_PLAYERS) return this.end('full');
    }
    // Our own entry from `self`: presence may echo it back later than we changed it.
    this.members = sortMembers([this.self, ...others]);
    for (const listener of this.changeListeners) listener();
  }

  /** Host: keeps the arrival order of who's present and publishes it as `seats` when it changes. */
  private updateSeats(others: RoomMember[]): void {
    const present = new Set(others.map((m) => m.id));
    const arrivals = this.arrivals.filter((id) => present.has(id));
    for (const m of sortMembers(others)) if (!arrivals.includes(m.id)) arrivals.push(m.id);
    const seats = [this.self.id, ...arrivals];
    this.arrivals = arrivals;
    if (this.self.seats?.join() === seats.join()) return;
    this.self = { ...this.self, seats };
    // Best effort: a failed update is retried with the next change.
    this.channel.track(this.self).catch(() => undefined);
  }

  private end(reason: RoomError): void {
    this.ended = reason;
    const listeners = [...this.endListeners];
    this.leave();
    for (const listener of listeners) listener(reason);
  }
}
