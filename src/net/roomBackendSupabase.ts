import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { RoomBackend, RoomChannel, RoomMember } from './roomBackend';

/**
 * Production rooms (MK-40, ADR 0006): room `CODE` is the Supabase Realtime channel `room:CODE`,
 * and its members are the channel's presence (keyed by member id). Nothing is stored: the room
 * exists while someone is in it. supabase-js is loaded when the first room opens, so it never
 * weighs on the game's startup bundle.
 */

/** How long `open` waits after subscribing for the presence state, before assuming an empty room, ms. */
const PRESENCE_SYNC_TIMEOUT_MS = 3000;

/**
 * Presence reaches others about 1 s after a `track` (up to 2.4 s measured from Node); a
 * friend who joins right after the room was created waits up to this for the host to show.
 */
const PRESENCE_LAG_MS = 3000;

/** Supabase settings baked in at build time (Vercel env vars; see `.env.example`). */
function supabaseConfig(): { url: string; key: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && key ? { url, key } : null;
}

export function supabaseRoomBackend(): RoomBackend {
  let client: Promise<SupabaseClient> | null = null;
  const connect = async (): Promise<SupabaseClient> => {
    const config = supabaseConfig();
    if (!config) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set');
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(config.url, config.key, { auth: { persistSession: false } });
  };
  return {
    presenceLagMs: PRESENCE_LAG_MS,
    async open(code, selfId) {
      client ??= connect();
      // A failed connect (no config, chunk load error) is retried on the next open.
      const supabase = await client.catch((error: unknown) => {
        client = null;
        throw error;
      });
      const channel = supabase.channel(`room:${code}`, { config: { presence: { key: selfId } } });
      const room = new SupabaseRoomChannel(supabase, channel);
      await room.subscribe();
      return room;
    },
  };
}

class SupabaseRoomChannel implements RoomChannel {
  private readonly handlers: (() => void)[] = [];
  private closed = false;
  /** Our presence, shown again after a rejoin. */
  private tracked: RoomMember | null = null;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly channel: RealtimeChannel,
  ) {}

  /**
   * Joins the channel; resolves at the first presence sync (who is already here). After that,
   * realtime-js rejoins by itself when the connection drops; we show our presence again then.
   */
  subscribe(): Promise<void> {
    return new Promise((resolve, reject) => {
      let joined = false;
      let synced = false;
      this.channel.on('presence', { event: 'sync' }, () => {
        synced = true;
        resolve();
        if (!this.closed) for (const handler of this.handlers) handler();
      });
      this.channel.subscribe((status, err) => {
        if (this.closed) return;
        if (status === 'SUBSCRIBED') {
          if (joined && this.tracked) void this.channel.track(this.tracked);
          joined = true;
          setTimeout(() => synced || resolve(), PRESENCE_SYNC_TIMEOUT_MS);
        } else if (!joined && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
          this.close();
          reject(err ?? new Error(`Supabase channel ${status}`));
        }
      });
    });
  }

  members(): RoomMember[] {
    const state = this.channel.presenceState<RoomMember>();
    return Object.values(state).flatMap((metas) => {
      const meta = metas[0];
      if (!meta) return [];
      // Only the member fields (presence adds its own `presence_ref`).
      const { id, nickname, colour, racer, ready, isHost, joinedAt, seats } = meta;
      return [
        { id, nickname, colour, racer, ready, isHost, joinedAt, ...(seats ? { seats } : {}) },
      ];
    });
  }

  onSync(handler: () => void): void {
    this.handlers.push(handler);
  }

  async track(member: RoomMember): Promise<void> {
    if (this.closed) return;
    this.tracked = member;
    const result = await this.channel.track(member);
    if (result !== 'ok') throw new Error(`Supabase presence track: ${result}`);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    void this.supabase.removeChannel(this.channel);
  }
}
