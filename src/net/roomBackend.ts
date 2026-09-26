import type { LobbySettings, LobbyStart } from './lobbyState';
import type { Signal } from './webrtc';

/**
 * Where rooms live (MK-40): a Supabase Realtime channel `room:<CODE>` with presence in production
 * (`roomBackendSupabase.ts`), a BroadcastChannel between tabs of one browser for `?net=local`
 * tests and QA links (`roomBackendLocal.ts`). `room.ts` holds the room rules on top of either.
 */

/** What each player shows the room (presence): the fields a player can change. */
export interface MemberInfo {
  nickname: string;
  /** CSS colour of the player's name dot. */
  colour: string;
  /** The racer (kart) the player picked. */
  racer: string;
  /** Ready to start (MK-47). */
  ready: boolean;
}

/** One player present in a room. */
export interface RoomMember extends MemberInfo {
  /** Unique per join (a random id, not a device id). */
  id: string;
  /** The room's creator; the room ends when the host leaves. */
  isHost: boolean;
  /** When this player joined, ms since the epoch (this device's clock: list order only). */
  joinedAt: number;
  /**
   * Host only: member ids in the order the host saw them arrive, host first. The host decides
   * who gets the last seat when two players join at once (ADR 0005: the host is the authority).
   */
  seats?: string[];
  /** Host only: the lobby's track, cc and items (MK-47). */
  lobby?: LobbySettings;
  /** Host only: the race the host started (MK-47); everyone in its slots joins it. */
  start?: LobbyStart;
}

/** A room-wide message: WebRTC signaling for a started race (MK-47), addressed by member id. */
export interface RoomSignal {
  /** The start (`LobbyStart.id`) the signal belongs to. */
  race: string;
  from: string;
  /** A member id, or null for everyone. */
  to: string | null;
  signal: Signal;
}

/** One device's view of a room's channel. */
export interface RoomChannel {
  /** Everyone present, this device included once it has called `track`. Unordered. */
  members(): RoomMember[];
  /** Called whenever `members()` changes. */
  onSync(handler: () => void): void;
  /** Shows (or updates) this device's presence to the room. */
  track(member: RoomMember): Promise<void>;
  /** Sends `message` to the others in the room (best effort, like presence). */
  broadcast(message: RoomSignal): void;
  /** Calls `handler` for every message the others broadcast; returns the unsubscribe function. */
  onBroadcast(handler: (message: RoomSignal) => void): () => void;
  /** Leaves the room: the others see this device go. */
  close(): void;
}

export interface RoomBackend {
  /**
   * How long presence can lag behind a join, ms: a joiner who sees no host yet waits this long
   * for one before calling the room missing (0 when presence is immediate).
   */
  readonly presenceLagMs: number;
  /**
   * Opens room `code`'s channel as `selfId`, resolving once the members already present are
   * known (an empty list: nobody is in that room). Rejects when the service can't be reached.
   */
  open(code: string, selfId: string): Promise<RoomChannel>;
}
