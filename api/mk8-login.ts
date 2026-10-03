/**
 * `POST /api/mk8-login` (MK-135, ADR 0009 as amended): trades the MK8 password for the session
 * cookie the middleware (`middleware.ts`) checks on `/mk8/`. Body `{ "password": "…" }`.
 *
 * 204 + `Set-Cookie` (HttpOnly, Secure, SameSite=Lax, 30 days) when it matches `MK8_PASSWORD`;
 * 401 when it doesn't, after a delay; 429 after too many misses from one address; 503 when no
 * password is configured (previews without it, CI, local). Same-origin POSTs only. Never logs the
 * password or the secret.
 */
import {
  passwordMatches,
  sessionCookie,
  signSession,
  SESSION_TTL_SECONDS,
  type Mk8AuthEnv,
} from './_mk8Auth';

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
