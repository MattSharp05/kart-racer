import type { Signal, SignalingChannel } from './webrtc';

interface Envelope {
  from: string;
  to: string | null;
  signal: Signal;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Supabase settings baked in at build time (Vercel env vars; see `.env.example`). */
export function supabaseConfig(): { url: string; key: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && key ? { url, key } : null;
}

/**
 * Signaling over a Supabase Realtime Broadcast channel `spike:<room>` (ADR 0006). supabase-js is
 * loaded lazily, so it never weighs on the game's startup bundle.
 */
export async function supabaseSignaling(room: string): Promise<SignalingChannel> {
  const config = supabaseConfig();
  if (!config) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set');
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(config.url, config.key, { auth: { persistSession: false } });
  const channel = client.channel(`spike:${room}`, { config: { broadcast: { self: false } } });
  const peerId = randomId();
  const counts = { sent: 0, received: 0 };
  const handlers: ((from: string, signal: Signal) => void)[] = [];
  channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
    const envelope = payload as Envelope;
    if (envelope.to !== null && envelope.to !== peerId) return;
    counts.received += 1;
    for (const handler of handlers) handler(envelope.from, envelope.signal);
  });
  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') resolve();
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(err ?? new Error(`Supabase channel ${status}`));
      }
    });
  });
  return {
    peerId,
    counts,
    send(to, signal) {
      counts.sent += 1;
      const envelope: Envelope = { from: peerId, to, signal };
      void channel.send({ type: 'broadcast', event: 'signal', payload: envelope });
    },
    onSignal(handler) {
      handlers.push(handler);
    },
    close() {
      void client.removeChannel(channel);
    },
  };
}

/**
 * Same-machine signaling over BroadcastChannel (`&transport=local` for CI, which has no Supabase
 * credentials). Same protocol, so the WebRTC path is still exercised end to end.
 */
export function localSignaling(room: string): SignalingChannel {
  const channel = new BroadcastChannel(`spike:${room}`);
  const peerId = randomId();
  const counts = { sent: 0, received: 0 };
  const handlers: ((from: string, signal: Signal) => void)[] = [];
  channel.onmessage = (event: MessageEvent<Envelope>) => {
    const envelope = event.data;
    if (envelope.to !== null && envelope.to !== peerId) return;
    counts.received += 1;
    for (const handler of handlers) handler(envelope.from, envelope.signal);
  };
  return {
    peerId,
    counts,
    send(to, signal) {
      counts.sent += 1;
      channel.postMessage({ from: peerId, to, signal } satisfies Envelope);
    },
    onSignal(handler) {
      handlers.push(handler);
    },
    close() {
      channel.close();
    },
  };
}
