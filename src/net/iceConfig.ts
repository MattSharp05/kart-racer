/**
 * Which ICE servers an online race's WebRTC links use (MK-75, ADR 0008). Before a race connects
 * the game asks `/api/turn` (a Vercel Function) for short-lived Cloudflare TURN credentials, so a
 * phone on mobile data can reach the host through a relay. The browser still tries direct paths
 * first; the relay is only used when they fail. No answer in time (previews, local dev, an outage)
 * → public STUN only, as before, which still works on one Wi-Fi.
 */

/** Public STUN only: the fallback, and what races used before MK-75 (ADR 0006). */
export const PUBLIC_STUN: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

/** Where the TURN credentials come from. */
export const TURN_ENDPOINT = '/api/turn';
/** How long a race waits for them before falling back to public STUN, ms. */
export const TURN_FETCH_TIMEOUT_MS = 3000;

/** `&relay=force` (QA): only relayed paths, to prove the relay works even on one Wi-Fi. */
export type RelayMode = 'auto' | 'force';

export interface IceConfigOptions {
  relay?: RelayMode;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function isIceServer(value: unknown): value is RTCIceServer {
  if (typeof value !== 'object' || value === null) return false;
  const urls = (value as { urls?: unknown }).urls;
  return (
    typeof urls === 'string' ||
    (Array.isArray(urls) && urls.length > 0 && urls.every((u) => typeof u === 'string'))
  );
}

/** The TURN endpoint's ICE servers, or null on any failure (timeout, 503, bad JSON…). */
export async function fetchIceServers(
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = TURN_FETCH_TIMEOUT_MS,
): Promise<RTCIceServer[] | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await fetchImpl(TURN_ENDPOINT, { signal: abort.signal, cache: 'no-store' });
    if (!response.ok) return null;
    const body = (await response.json()) as { iceServers?: unknown };
    const servers = body.iceServers;
    return Array.isArray(servers) && servers.length > 0 && servers.every(isIceServer)
      ? servers
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One race's peer-connection config: fetched once, shared by all of that race's links. Never
 * rejects: falls back to public STUN. `relay: 'force'` applies only when TURN servers came back:
 * with STUN alone a relay-only race could never connect, so it races as usual instead (and the
 * `&netdebug=1` overlay shows `link P2P`, not `relay`).
 */
export async function raceIceConfig(options: IceConfigOptions = {}): Promise<RTCConfiguration> {
  const servers = await fetchIceServers(options.fetchImpl, options.timeoutMs);
  if (!servers) {
    if (options.relay === 'force') console.warn('relay=force: no TURN relay available, ignored');
    return { iceServers: PUBLIC_STUN };
  }
  return {
    iceServers: servers,
    ...(options.relay === 'force' ? { iceTransportPolicy: 'relay' as const } : {}),
  };
}

/** What a race's links use when nobody fetched anything (the spike, tests). */
export const STUN_CONFIG: RTCConfiguration = { iceServers: PUBLIC_STUN };
