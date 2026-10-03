/**
 * The MK8 pack's password gate (MK-135, ADR 0009 as amended), in one self-contained file: Vercel
 * runs each `api/` file as its own unbundled Node ESM Function (like `api/turn.ts`), while the
 * Routing Middleware (`middleware.ts`) is bundled and imports `gateMk8` from here.
 *
 * - `POST /api/mk8-login` (the default export) trades the password for the session cookie. Body
 *   `{ "password": "…" }`. 204 + `Set-Cookie` (HttpOnly, Secure, SameSite=Lax, 30 days) when it
 *   matches `MK8_PASSWORD`; 401 when it doesn't, after a delay; 429 after too many misses from one
 *   address; 503 when no password is configured (CI, local, a deploy without it). Same-origin only.
 * - `gateMk8` is what the middleware runs on every `/mk8/` request.
 *
 * Web Crypto only, so it runs in the Edge runtime and in Node. Never logs a password, a secret or a
 * cookie.
 */

export const SESSION_COOKIE = 'mk8_session';
/** A login lasts this long, s (the ticket's "e.g. 30 days"). */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const COOKIE_VERSION = 'v1';
/** How far ahead of this server's clock a fresh cookie's expiry may be, s. */
const CLOCK_SLACK_SECONDS = 60;
/** Prefix of the shipped, non-Nintendo files under `/mk8/` that stay public (the OFL font). */
export const PUBLIC_PREFIX = '/mk8/fonts/';

export interface Mk8AuthEnv {
  /** The password Matthew picks (Vercel env). Unset → no pack is ever served. */
  MK8_PASSWORD?: string;
  /** Optional cookie-signing secret; changing it logs everyone out. Derived from the password when unset. */
  MK8_COOKIE_SECRET?: string;
}

const encoder = new TextEncoder();

function base64url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** The HMAC key cookies are signed with, or null when the gate isn't configured. */
async function signingKey(env: Mk8AuthEnv): Promise<CryptoKey | null> {
  if (!env.MK8_PASSWORD) return null;
  const secret = env.MK8_COOKIE_SECRET || `mk8-session-${COOKIE_VERSION}\u0000${env.MK8_PASSWORD}`;
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

const payload = (expires: number) =>
  encoder.encode(`${SESSION_COOKIE}.${COOKIE_VERSION}.${expires}`);

/** A cookie value good until `expires` (Unix seconds); null when the gate isn't configured. */
export async function signSession(env: Mk8AuthEnv, expires: number): Promise<string | null> {
  const key = await signingKey(env);
  if (!key) return null;
  const mac = await crypto.subtle.sign('HMAC', key, payload(expires));
  return `${COOKIE_VERSION}.${expires}.${base64url(mac)}`;
}

/** Whether `value` is a cookie this server signed that hasn't expired at `now` (Unix seconds). */
export async function verifySession(
  env: Mk8AuthEnv,
  value: string | undefined,
  now: number,
): Promise<boolean> {
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== COOKIE_VERSION) return false;
  const expires = Number(parts[1]);
  if (!Number.isSafeInteger(expires) || String(expires) !== parts[1]) return false;
  // A cookie lasts at most the TTL; the slack covers clocks of the login and edge servers that
  // differ by a little.
  if (expires <= now || expires > now + SESSION_TTL_SECONDS + CLOCK_SLACK_SECONDS) return false;
  const mac = fromBase64url(parts[2] ?? '');
  const key = await signingKey(env);
  if (!mac || !key) return false;
  // `verify` compares in constant time.
  return crypto.subtle.verify('HMAC', key, mac, payload(expires));
}

/** Whether `given` is the password, compared in constant time (digests of equal length). */
export async function passwordMatches(env: Mk8AuthEnv, given: string): Promise<boolean> {
  if (!env.MK8_PASSWORD) return false;
  const digest = async (text: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
  const x = await digest(env.MK8_PASSWORD);
  const y = await digest(given);
  let diff = 0;
  x.forEach((byte, i) => (diff |= byte ^ (y[i] ?? 0)));
  return diff === 0;
}

/** One cookie's value from a `Cookie` header. */
export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return undefined;
}

/** The `Set-Cookie` header for a session good until `expires`. */
export function sessionCookie(value: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

/** What the middleware answers when a request may go on to the static file. */
function proceed(): Response {
  // Vercel's `next()` (`@vercel/functions`) is exactly this; inlined to keep the gate dependency-free.
  // `private`: a pack file must never sit in a shared cache, where it would skip the gate.
  return new Response(null, {
    headers: { 'x-middleware-next': '1', 'Cache-Control': 'private, no-cache' },
  });
}

/**
 * The gate on `/mk8/*`: the font goes through; everything else needs a valid session cookie, else
 * 401 with no body. With no password configured nothing is served (404, as if there were no pack),
 * so a pack built without a password can't leak.
 */
export async function gateMk8(request: Request, env: Mk8AuthEnv, now: number): Promise<Response> {
  const { pathname } = new URL(request.url);
  // `URL` has already resolved dot segments, so `/mk8/fonts/../x` can't pass as the font.
  if (pathname.startsWith(PUBLIC_PREFIX) && !/%2f|%5c/i.test(pathname)) return proceed();
  const noStore = { 'Cache-Control': 'no-store' };
  if (!env.MK8_PASSWORD) return new Response(null, { status: 404, headers: noStore });
  const cookie = readCookie(request.headers.get('cookie'), SESSION_COOKIE);
  if (await verifySession(env, cookie, now)) return proceed();
  return new Response(null, { status: 401, headers: noStore });
}

/** A wrong password waits this long before its answer, ms (brute-force friction). */
export const FAILURE_DELAY_MS = 1000;
/** Misses allowed per address in a window before 429 (per Function instance: friction, not a wall). */
export const MAX_FAILURES = 10;
export const FAILURE_WINDOW_MS = 10 * 60 * 1000;
/** Addresses remembered at most; older entries are dropped past this. */
const MAX_TRACKED = 10_000;
/** Longest body read, bytes. */
const MAX_BODY = 1024;

const failures = new Map<string, { count: number; since: number }>();

export interface LoginDeps {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

/** The caller's address as Vercel reports it. */
function clientAddress(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

/** Whether the request comes from a page of this same site. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return origin !== null && origin === new URL(request.url).origin;
}

/** Forgets every address's misses (tests). */
export function resetLoginFailures(): void {
  failures.clear();
}

export async function handleMk8Login(
  request: Request,
  env: Mk8AuthEnv,
  deps: LoginDeps = {},
): Promise<Response> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  if (request.method !== 'POST')
    return json(405, { error: 'method not allowed' }, { Allow: 'POST' });
  if (!sameOrigin(request)) return json(403, { error: 'forbidden' });
  if (!env.MK8_PASSWORD) return json(503, { error: 'not configured' });

  const address = clientAddress(request);
  const record = failures.get(address);
  if (record && now() - record.since > FAILURE_WINDOW_MS) failures.delete(address);
  const recent = failures.get(address);
  if (recent && recent.count >= MAX_FAILURES) {
    return json(
      429,
      { error: 'too many attempts' },
      { 'Retry-After': String(FAILURE_WINDOW_MS / 1000) },
    );
  }

  let password: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return json(413, { error: 'too large' });
    password = (JSON.parse(text) as { password?: unknown }).password;
  } catch {
    return json(400, { error: 'bad request' });
  }
  if (typeof password !== 'string' || !(await passwordMatches(env, password))) {
    if (failures.size >= MAX_TRACKED) {
      for (const [key, value] of failures) {
        if (now() - value.since > FAILURE_WINDOW_MS) failures.delete(key);
      }
    }
    const entry = failures.get(address) ?? { count: 0, since: now() };
    entry.count++;
    failures.set(address, entry);
    await sleep(FAILURE_DELAY_MS);
    return json(401, { error: 'wrong password' });
  }
  failures.delete(address);
  const expires = Math.floor(now() / 1000) + SESSION_TTL_SECONDS;
  const value = await signSession(env, expires);
  if (!value) return json(503, { error: 'not configured' });
  return new Response(null, {
    status: 204,
    headers: {
      'Cache-Control': 'no-store',
      'Set-Cookie': sessionCookie(value, SESSION_TTL_SECONDS),
    },
  });
}

export default {
  fetch(request: Request): Promise<Response> {
    return handleMk8Login(request, process.env);
  },
};
