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
  /** Ready to start (the lobby's host settings and start are MK-47). */
  ready: boolean;
}

/** One player present in a room. */
export interface RoomMember extends MemberInfo {
  /** Unique per join (a random id, not a device id). */
  id: string;
  /** The room's creator; the room ends when the host leaves. */
  isHost: boolean;
  /** When this player joined, ms since the epoch (the join order breaks ties for the last seat). */
  joinedAt: number;
}

/** One device's view of a room's channel. */
export interface RoomChannel {
  /** Everyone present, this device included once it has called `track`. Unordered. */
  members(): RoomMember[];
  /** Called whenever `members()` changes. */
  onSync(handler: () => void): void;
  /** Shows (or updates) this device's presence to the room. */
  track(member: RoomMember): Promise<void>;
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
