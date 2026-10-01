/**
 * `GET /api/turn` (MK-75, ADR 0008): short-lived Cloudflare Realtime TURN credentials for an
 * online race's WebRTC links, so phones on mobile data (carrier NAT) can reach the host through a
 * relay. A Vercel Function; the rest of the site is static.
 *
 * Returns `{ iceServers }` (Cloudflare's STUN + TURN entries) with `Cache-Control: no-store`.
 * Limits: GET only; requests from the game's own pages only (Origin, else Referer); no key
 * configured (previews, local) → 503 and the game falls back to public STUN.
 *
 * Self-contained on purpose: Vercel bundles each `api/` file on its own. Never logs the key.
 */

/** Credentials last this long, s: a session of races, not days (ADR 0008). */
export const TURN_TTL_SECONDS = 4 * 60 * 60;
/** Give up on Cloudflare after this long, ms (the client waits ~3 s in all). */
const CLOUDFLARE_TIMEOUT_MS = 2500;

const CLOUDFLARE_API = 'https://rtc.live.cloudflare.com/v1/turn/keys';

/** Pages allowed to ask: production, this project's previews, local dev. */
const ALLOWED_HOSTS: RegExp[] = [
  /^https:\/\/kart-racer-alpha\.vercel\.app$/,
  /^https:\/\/kart-racer-[a-z0-9-]+-mattsharp05s-projects\.vercel\.app$/,
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];

export interface TurnEnv {
  CLOUDFLARE_TURN_KEY_ID?: string;
  CLOUDFLARE_TURN_API_TOKEN?: string;
}

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

/** The origin of the page asking: `Origin` if sent, else the `Referer`'s (same-origin GETs). */
export function requestOrigin(request: Request): string | null {
  const origin = request.headers.get('origin');
  if (origin && origin !== 'null') return origin;
  const referer = request.headers.get('referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function originAllowed(origin: string | null): boolean {
  return origin !== null && ALLOWED_HOSTS.some((host) => host.test(origin));
}

/**
 * Browsers block port 53, so those URLs only time out (Cloudflare's docs); drop them, and any
 * entry left with no URLs.
 */
export function usableIceServers(servers: unknown): IceServer[] | null {
  if (!Array.isArray(servers)) return null;
  const usable: IceServer[] = [];
  for (const server of servers as IceServer[]) {
    if (!server || (typeof server.urls !== 'string' && !Array.isArray(server.urls))) continue;
    const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter(
      (url) => typeof url === 'string' && !/:53(\?|$)/.test(url),
    );
    if (urls.length > 0) usable.push({ ...server, urls });
  }
  return usable.length > 0 ? usable : null;
}

export async function handleTurn(
  request: Request,
  env: TurnEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== 'GET') return json(405, { error: 'method not allowed' }, { Allow: 'GET' });
  if (!originAllowed(requestOrigin(request))) return json(403, { error: 'forbidden' });
  const keyId = env.CLOUDFLARE_TURN_KEY_ID;
  const token = env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !token) return json(503, { error: 'relay not configured' });
  try {
    const response = await fetchImpl(
      `${CLOUDFLARE_API}/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: TURN_TTL_SECONDS }),
        signal: AbortSignal.timeout(CLOUDFLARE_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      console.error(`turn: Cloudflare answered ${response.status}`);
      return json(502, { error: 'relay unavailable' });
    }
    const body = (await response.json()) as { iceServers?: unknown };
    const iceServers = usableIceServers(body.iceServers);
    if (!iceServers) {
      console.error('turn: Cloudflare sent no usable ICE servers');
      return json(502, { error: 'relay unavailable' });
    }
    return json(200, { iceServers });
  } catch (error) {
    console.error(`turn: Cloudflare request failed (${(error as Error).name})`);
    return json(502, { error: 'relay unavailable' });
  }
}

export default {
  fetch(request: Request): Promise<Response> {
    return handleTurn(request, process.env);
  },
};
