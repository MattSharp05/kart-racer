/**
 * The MK8 pack's password gate (MK-135, ADR 0009 as amended): signed session cookies, the
 * password check and the gate the Routing Middleware (`middleware.ts`) runs on every `/mk8/`
 * request. `api/mk8-login.ts` sets the cookie. The `_` prefix keeps Vercel from making this file a
 * Function of its own; both entry points bundle it.
 *
 * Web Crypto only, so it runs in the Edge runtime (the middleware) and in Node (the login
 * Function, the unit tests). Never logs a password, a secret or a cookie.
 */

export const SESSION_COOKIE = 'mk8_session';
/** A login lasts this long, s (the ticket's "e.g. 30 days"). */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const COOKIE_VERSION = 'v1';
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
  if (expires <= now || expires > now + SESSION_TTL_SECONDS) return false;
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
