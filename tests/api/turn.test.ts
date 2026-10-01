import { describe, expect, it, vi } from 'vitest';
import { handleTurn, originAllowed, TURN_TTL_SECONDS, usableIceServers } from '../../api/turn';

const ENV = { CLOUDFLARE_TURN_KEY_ID: 'key-id', CLOUDFLARE_TURN_API_TOKEN: 'secret-token' };
const PROD = 'https://kart-racer-alpha.vercel.app';

/** Cloudflare's documented 201 answer, plus a port-53 URL browsers can't use. */
const CLOUDFLARE_ANSWER = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
    {
      urls: [
        'turn:turn.cloudflare.com:3478?transport=udp',
        'turn:turn.cloudflare.com:53?transport=udp',
        'turns:turn.cloudflare.com:5349?transport=tcp',
        'turns:turn.cloudflare.com:443?transport=tcp',
      ],
      username: 'user',
      credential: 'pass',
    },
  ],
};

function request(init: { method?: string; origin?: string; referer?: string } = {}): Request {
  const headers = new Headers();
  if (init.origin) headers.set('origin', init.origin);
  if (init.referer) headers.set('referer', init.referer);
  return new Request(`${PROD}/api/turn`, { method: init.method ?? 'GET', headers });
}

function cloudflare(status: number, body: unknown = CLOUDFLARE_ANSWER) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
}

describe('GET /api/turn (MK-75)', () => {
  it('returns Cloudflare ICE servers, never cached', async () => {
    const fetchMock = cloudflare(201);
    const response = await handleTurn(request({ referer: `${PROD}/?room=ABCD` }), ENV, fetchMock);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as { iceServers: { urls: string[] }[] };
    expect(body.iceServers).toHaveLength(2);
    // Port 53 is blocked by browsers: dropped.
    expect(body.iceServers.flatMap((s) => s.urls).some((u) => /:53(\?|$)/.test(u))).toBe(false);
    expect(body.iceServers[1]).toMatchObject({ username: 'user', credential: 'pass' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://rtc.live.cloudflare.com/v1/turn/keys/key-id/credentials/generate-ice-servers',
    );
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
    expect(JSON.parse(init?.body as string)).toEqual({ ttl: TURN_TTL_SECONDS });
  });

  it('answers 502 when Cloudflare fails, without leaking the token', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const fetchMock of [
      cloudflare(401, { error: 'bad token' }),
      cloudflare(201, { iceServers: [] }),
      vi.fn<typeof fetch>(async () => {
        throw new TypeError('network down');
      }),
    ]) {
      const response = await handleTurn(request({ origin: PROD }), ENV, fetchMock);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: 'relay unavailable' });
    }
    expect(JSON.stringify(errors.mock.calls)).not.toContain('secret-token');
    errors.mockRestore();
  });

  it('answers 503 when the key is not configured (previews, local)', async () => {
    const fetchMock = cloudflare(201);
    for (const env of [{}, { CLOUDFLARE_TURN_KEY_ID: 'key-id' }]) {
      const response = await handleTurn(request({ origin: PROD }), env, fetchMock);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'relay not configured' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses other sites and requests with no origin', async () => {
    const fetchMock = cloudflare(201);
    for (const init of [
      { origin: 'https://evil.example' },
      { referer: 'https://evil.example/page' },
      { origin: 'https://kart-racer-alpha.vercel.app.evil.example' },
      { origin: 'https://other-app-mattsharp05s-projects.vercel.app' },
      {},
    ]) {
      const response = await handleTurn(request(init), ENV, fetchMock);
      expect(response.status).toBe(403);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses anything but GET', async () => {
    const fetchMock = cloudflare(201);
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const response = await handleTurn(request({ method, origin: PROD }), ENV, fetchMock);
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('originAllowed', () => {
  it('allows production, this project’s previews and local dev', () => {
    expect(originAllowed(PROD)).toBe(true);
    expect(originAllowed('https://kart-racer-git-mk-75-mattsharp05s-projects.vercel.app')).toBe(
      true,
    );
    expect(originAllowed('https://kart-racer-abc123-mattsharp05s-projects.vercel.app')).toBe(true);
    expect(originAllowed('http://localhost:5173')).toBe(true);
    expect(originAllowed('http://127.0.0.1:4173')).toBe(true);
    expect(originAllowed('http://kart-racer-alpha.vercel.app')).toBe(false);
    expect(originAllowed(null)).toBe(false);
  });
});

describe('usableIceServers', () => {
  it('rejects bad shapes', () => {
    expect(usableIceServers(undefined)).toBeNull();
    expect(usableIceServers([{ urls: 5 }])).toBeNull();
    expect(usableIceServers([{ urls: 'stun:x:53' }])).toBeNull();
    expect(usableIceServers([{ urls: 'stun:x:3478' }])).toEqual([{ urls: ['stun:x:3478'] }]);
  });
});
