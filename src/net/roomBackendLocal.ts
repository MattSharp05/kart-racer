import type { RoomBackend, RoomChannel, RoomMember, RoomSignal } from './roomBackend';

/**
 * `?net=local` rooms (MK-40): presence over a BroadcastChannel, so tabs (or Playwright pages) of
 * one browser share rooms with no server, like `localRoom.ts` does for races. A newcomer posts
 * `hello`; everyone present answers with their `state`, repeats it as a heartbeat, and posts `bye`
 * on leaving. A tab that vanishes without `bye` drops out when its heartbeat stops.
 */

export interface LocalRoomTiming {
  /** How long `open` listens for the members already present, ms. */
  syncMs: number;
  /** How often a present member repeats its state, ms. */
  heartbeatMs: number;
  /** A member unheard of for this long has gone, ms. */
  expiryMs: number;
}

export const LOCAL_ROOM_TIMING: LocalRoomTiming = {
  syncMs: 300,
  heartbeatMs: 1000,
  // Generous: a tab that leaves says bye at once; this only catches crashed tabs, and a page
  // starved of CPU (several software-GL tabs racing in CI) mustn't look gone (MK-55).
  expiryMs: 10_000,
};

type PresenceMessage =
  | { type: 'hello'; from: string }
  | { type: 'state'; member: RoomMember }
  | { type: 'bye'; id: string }
  | { type: 'signal'; message: RoomSignal };

export function localRoomBackend(timing: LocalRoomTiming = LOCAL_ROOM_TIMING): RoomBackend {
  return {
    // `open` already listened for `syncMs`: everyone present has answered.
    presenceLagMs: 0,
    async open(code, selfId) {
      const channel = new LocalRoomChannel(code, selfId, timing);
      await new Promise((resolve) => setTimeout(resolve, timing.syncMs));
      return channel;
    },
  };
}

class LocalRoomChannel implements RoomChannel {
  private readonly channel: BroadcastChannel;
  /** Other members, with when each was last heard of. */
  private readonly others = new Map<string, { member: RoomMember; heardAt: number }>();
  private self: RoomMember | null = null;
  private readonly handlers: (() => void)[] = [];
  private readonly broadcastHandlers = new Set<(message: RoomSignal) => void>();
  private readonly timer: ReturnType<typeof setInterval>;
  private closed = false;

  constructor(
    code: string,
    private readonly selfId: string,
    private readonly timing: LocalRoomTiming,
  ) {
    this.channel = new BroadcastChannel(`kart-racer/rooms/${code}`);
    this.channel.onmessage = (event: MessageEvent<PresenceMessage>) => this.receive(event.data);
    this.timer = setInterval(() => this.heartbeat(), timing.heartbeatMs);
    this.post({ type: 'hello', from: selfId });
  }

  members(): RoomMember[] {
    const others = [...this.others.values()].map((entry) => entry.member);
    return this.self ? [this.self, ...others] : others;
  }

  onSync(handler: () => void): void {
    this.handlers.push(handler);
  }

  track(member: RoomMember): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.self = { ...member };
    this.post({ type: 'state', member: this.self });
    this.sync();
    return Promise.resolve();
  }

  broadcast(message: RoomSignal): void {
    if (!this.closed) this.post({ type: 'signal', message });
  }

  onBroadcast(handler: (message: RoomSignal) => void): () => void {
    this.broadcastHandlers.add(handler);
    return () => this.broadcastHandlers.delete(handler);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.broadcastHandlers.clear();
    clearInterval(this.timer);
    if (this.self) this.post({ type: 'bye', id: this.selfId });
    this.channel.close();
  }

  private receive(msg: PresenceMessage): void {
    if (this.closed) return;
    if (msg.type === 'hello') {
      if (this.self) this.post({ type: 'state', member: this.self });
    } else if (msg.type === 'state') {
      if (msg.member.id === this.selfId) return;
      const known = this.others.get(msg.member.id);
      this.others.set(msg.member.id, { member: msg.member, heardAt: Date.now() });
      if (!known || JSON.stringify(known.member) !== JSON.stringify(msg.member)) this.sync();
    } else if (msg.type === 'signal') {
      for (const handler of [...this.broadcastHandlers]) handler(msg.message);
    } else if (this.others.delete(msg.id)) {
      this.sync();
    }
  }

  private heartbeat(): void {
    if (this.self) this.post({ type: 'state', member: this.self });
    const now = Date.now();
    let changed = false;
    for (const [id, entry] of this.others) {
      if (now - entry.heardAt <= this.timing.expiryMs) continue;
      this.others.delete(id);
      changed = true;
    }
    if (changed) this.sync();
  }

  private post(msg: PresenceMessage): void {
    this.channel.postMessage(msg);
  }

  private sync(): void {
    for (const handler of this.handlers) handler();
  }
}
