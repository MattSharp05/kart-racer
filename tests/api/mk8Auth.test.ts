import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FAILURE_DELAY_MS,
  gateMk8,
  handleMk8Login,
  MAX_FAILURES,
  passwordMatches,
  readCookie,
  resetLoginFailures,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signSession,
  verifySession,
} from '../../api/mk8-login';
import middleware, { config } from '../../middleware';

const ENV = { MK8_PASSWORD: 'correct horse', MK8_COOKIE_SECRET: 'signing-secret' };
const PROD = 'https://kart-racer-alpha.vercel.app';
const NOW = 1_800_000_000;

/** Every kind of pack URL: manifest, sprite, model, collision, audio, a missing one. */
const PACK_PATHS = [
  '/mk8/manifest.json',
  '/mk8/ui/menu/title.webp',
  '/mk8/models/racer/mario/kart.glb',
  '/mk8/models/course/stadium/collision.bin',
  '/mk8/audio/ui/select.m4a',
  '/mk8/nope.txt',
  '/mk8/fonts/../manifest.json',
  '/mk8/fonts%2F..%2Fmanifest.json',
];

function get(path: string, cookie?: string): Request {
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  return new Request(`${PROD}${path}`, { headers });
}

async function validCookie(env = ENV): Promise<string> {
  return `${SESSION_COOKIE}=${await signSession(env, NOW + 60)}`;
}

describe('MK8 pack gate (MK-135)', () => {
  it('runs on every /mk8/ path', () => {
    expect(config.matcher).toEqual(['/mk8/:path*']);
  });

  it.each(PACK_PATHS)('%s without a cookie: 401, no body, never cached', async (path) => {
    const response = await gateMk8(get(path), ENV, NOW);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-middleware-next')).toBeNull();
  });

  it.each(PACK_PATHS)('%s with a valid cookie goes on to the file, privately', async (path) => {
    const response = await gateMk8(get(path, `other=1; ${await validCookie()}`), ENV, NOW);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('cache-control')).toMatch(/^private/);
  });

  it('the OFL font stays public', async () => {
    const response = await gateMk8(get('/mk8/fonts/fonts.css'), ENV, NOW);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('rejects expired, tampered, foreign and malformed cookies', async () => {
    const good = (await signSession(ENV, NOW + 60))!;
    const [v, exp, mac] = good.split('.');
    const bad = [
      (await signSession(ENV, NOW - 1))!,
      `${v}.${Number(exp) + 1}.${mac}`,
      `${v}.${exp}.${mac!.slice(0, -2)}AA`,
      (await signSession({ ...ENV, MK8_COOKIE_SECRET: 'other' }, NOW + 60))!,
      (await signSession(ENV, NOW + SESSION_TTL_SECONDS + 600))!,
      'v1.abc.def',
      'v2.1.2',
      '',
      'garbage',
    ];
    for (const value of bad) {
      expect(await verifySession(ENV, value, NOW), value).toBe(false);
      const response = await gateMk8(
        get('/mk8/manifest.json', `${SESSION_COOKIE}=${value}`),
        ENV,
        NOW,
      );
      expect(response.status, value).toBe(401);
    }
    expect(await verifySession(ENV, good, NOW)).toBe(true);
  });

  it('accepts a fresh cookie from a login server whose clock is a little ahead', async () => {
    const value = (await signSession(ENV, NOW + 2 + SESSION_TTL_SECONDS))!;
    expect(await verifySession(ENV, value, NOW)).toBe(true);
  });

  it('changing the password logs everyone out when no secret is set', async () => {
    const env = { MK8_PASSWORD: 'one' };
    const value = (await signSession(env, NOW + 60))!;
    expect(await verifySession(env, value, NOW)).toBe(true);
    expect(await verifySession({ MK8_PASSWORD: 'two' }, value, NOW)).toBe(false);
  });

  it('with no password configured nothing is served (404), cookie or not', async () => {
    const forged = `${SESSION_COOKIE}=${await signSession({ MK8_PASSWORD: 'x' }, NOW + 60)}`;
    for (const cookie of [undefined, forged]) {
      const response = await gateMk8(get('/mk8/manifest.json', cookie), {}, NOW);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
    }
    expect(await signSession({}, NOW + 60)).toBeNull();
  });

  it('the middleware entry uses the environment', async () => {
    vi.stubEnv('MK8_PASSWORD', 'from-env');
    try {
      expect((await middleware(get('/mk8/manifest.json'))).status).toBe(401);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('compares passwords exactly', async () => {
    expect(await passwordMatches(ENV, 'correct horse')).toBe(true);
    expect(await passwordMatches(ENV, 'correct hors')).toBe(false);
    expect(await passwordMatches(ENV, 'correct horse ')).toBe(false);
    expect(await passwordMatches({}, '')).toBe(false);
  });

  it('reads one cookie from a header', () => {
    expect(readCookie('a=1; mk8_session=v1.2.x; b=3', SESSION_COOKIE)).toBe('v1.2.x');
    expect(readCookie('xmk8_session=1', SESSION_COOKIE)).toBeUndefined();
    expect(readCookie(null, SESSION_COOKIE)).toBeUndefined();
  });
});

describe('POST /api/mk8-login (MK-135)', () => {
  const sleep = vi.fn(async () => {});
  const now = () => NOW * 1000;

  function login(
    body: unknown,
    init: { method?: string; origin?: string | null; ip?: string } = {},
  ): Request {
    const headers = new Headers({ 'content-type': 'application/json' });
    const origin = init.origin === undefined ? PROD : init.origin;
    if (origin) headers.set('origin', origin);
    headers.set('x-forwarded-for', init.ip ?? '203.0.113.7');
    const method = init.method ?? 'POST';
    return new Request(`${PROD}/api/mk8-login`, {
      method,
      headers,
      ...(method === 'POST' && { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    });
  }

  beforeEach(() => {
    resetLoginFailures();
    sleep.mockClear();
  });

  it('the right password sets a signed, HttpOnly, Secure, Lax cookie for 30 days', async () => {
    const response = await handleMk8Login(login({ password: 'correct horse' }), ENV, {
      now,
      sleep,
    });
    expect(response.status).toBe(204);
    expect(sleep).not.toHaveBeenCalled();
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toMatch(/^mk8_session=v1\.\d+\.[\w-]+; /);
    for (const flag of [
      'Path=/',
      `Max-Age=${SESSION_TTL_SECONDS}`,
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
    ])
      expect(cookie).toContain(flag);
    // The cookie opens the gate.
    const pair = cookie.split(';')[0]!;
    const gate = await gateMk8(get('/mk8/manifest.json', pair), ENV, NOW);
    expect(gate.headers.get('x-middleware-next')).toBe('1');
  });

  it('a wrong password: 401 after a delay, no cookie', async () => {
    const response = await handleMk8Login(login({ password: 'nope' }), ENV, { now, sleep });
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(sleep).toHaveBeenCalledWith(FAILURE_DELAY_MS);
    // Nothing secret in the answer.
    expect(await response.text()).not.toContain('correct horse');
  });

  it('too many misses from one address: 429, even with the right password; others unaffected', async () => {
    for (let i = 0; i < MAX_FAILURES; i++)
      await handleMk8Login(login({ password: `guess${i}` }), ENV, { now, sleep });
    const blocked = await handleMk8Login(login({ password: 'correct horse' }), ENV, { now, sleep });
    expect(blocked.status).toBe(429);
    const other = await handleMk8Login(
      login({ password: 'correct horse' }, { ip: '198.51.100.1' }),
      ENV,
      {
        now,
        sleep,
      },
    );
    expect(other.status).toBe(204);
    // The window passes.
    const later = await handleMk8Login(login({ password: 'correct horse' }), ENV, {
      now: () => now() + 11 * 60 * 1000,
      sleep,
    });
    expect(later.status).toBe(204);
  });

  it('refuses other methods, other origins, bad bodies and an unconfigured server', async () => {
    const deps = { now, sleep };
    expect((await handleMk8Login(login(null, { method: 'GET' }), ENV, deps)).status).toBe(405);
    expect(
      (
        await handleMk8Login(
          login({ password: 'correct horse' }, { origin: 'https://evil.example' }),
          ENV,
          deps,
        )
      ).status,
    ).toBe(403);
    expect(
      (await handleMk8Login(login({ password: 'correct horse' }, { origin: null }), ENV, deps))
        .status,
    ).toBe(403);
    expect((await handleMk8Login(login('{not json'), ENV, deps)).status).toBe(400);
    expect((await handleMk8Login(login({ password: 'x'.repeat(2000) }), ENV, deps)).status).toBe(
      413,
    );
    expect((await handleMk8Login(login({ password: 42 }), ENV, deps)).status).toBe(401);
    expect((await handleMk8Login(login({ password: 'correct horse' }), {}, deps)).status).toBe(503);
  });
});
