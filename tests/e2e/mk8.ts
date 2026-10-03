import { readFileSync } from 'node:fs';
import type { Page, Route } from '@playwright/test';
import { gateMk8, handleMk8Login, resetLoginFailures } from '../../api/mk8-login';

/** The synthetic MK8 pack (`fixtures/mk8-pack/`): CI never has the real, local-only one (ADR 0009). */
const PACK = new URL('./fixtures/mk8-pack/', import.meta.url);
const TYPES: Record<string, string> = {
  json: 'application/json',
  webp: 'image/webp',
  m4a: 'audio/mp4',
  glb: 'model/gltf-binary',
};

export interface PackOptions {
  /** Pack paths whose first request fails (the connection drops). */
  failOnce?: string[];
  /** Pack paths held until the returned `release` is called. */
  hold?: string[];
  /**
   * Gate the pack behind this password as the site does (MK-135): every `/mk8/` request goes
   * through the real middleware logic and `POST /api/mk8-login` through the real login handler
   * (`api/`), so a pack file is served only with the cookie that login set.
   */
  password?: string;
}

/** A Playwright-routed request as a Fetch `Request` the `api/` handlers take, cookies included. */
async function toRequest(route: Route): Promise<Request> {
  const request = route.request();
  const headers = new Headers();
  for (const [name, value] of Object.entries(await request.allHeaders())) {
    if (!name.startsWith(':')) headers.set(name, value);
  }
  // WebKit adds cookies after routing, so its routed requests have no `Cookie` header: send the
  // ones the browser holds for this URL, as it would.
  if (!headers.has('cookie')) {
    const jar = await request.frame().page().context().cookies(request.url());
    if (jar.length > 0) headers.set('cookie', jar.map((c) => `${c.name}=${c.value}`).join('; '));
  }
  const body = request.postData();
  return new Request(request.url(), {
    method: request.method(),
    headers,
    ...(body !== null && { body }),
  });
}

/** Sends a handler's `Response` back to the page. */
async function fulfill(route: Route, response: Response): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => (headers[name] = value));
  // The test server is plain http, where WebKit ignores a `Secure` cookie (and a routed answer's
  // `Set-Cookie`); the site is https only. So the cookie the handler set goes into the browser's
  // jar directly, with the header's flags but `Secure`. `tests/api/mk8Auth.test.ts` checks the
  // real header, `Secure` included.
  const cookie = headers['set-cookie'];
  if (cookie) {
    delete headers['set-cookie'];
    const [pair = '', ...flags] = cookie.split(';').map((part) => part.trim());
    const at = pair.indexOf('=');
    const maxAge = Number(flags.find((f) => f.startsWith('Max-Age='))?.slice('Max-Age='.length));
    await route
      .request()
      .frame()
      .page()
      .context()
      .addCookies([
        {
          name: pair.slice(0, at),
          value: pair.slice(at + 1),
          url: new URL('/', route.request().url()).href,
          httpOnly: flags.includes('HttpOnly'),
          sameSite: flags.includes('SameSite=Lax') ? 'Lax' : 'Strict',
          expires: Math.floor(Date.now() / 1000) + maxAge,
        },
      ]);
  }
  await route.fulfill({
    status: response.status,
    headers,
    body: Buffer.from(await response.arrayBuffer()),
  });
}

/**
 * Serves the fixture pack at `/mk8/` the way `pnpm dev` serves `.mk8-out/`. The shipped files
 * there (the OFL font) still come from the game's server. Returns every pack path requested and
 * a `release` for held files.
 */
export async function servePack(page: Page, options: PackOptions = {}) {
  const requested: string[] = [];
  const failing = new Set(options.failOnce);
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const env = options.password === undefined ? undefined : { MK8_PASSWORD: options.password };
  if (env) {
    resetLoginFailures();
    await page.route('**/api/mk8-login', async (route: Route) =>
      fulfill(route, await handleMk8Login(await toRequest(route), env, { sleep: async () => {} })),
    );
  }
  await page.route('**/mk8/**', async (route: Route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/mk8\//, '');
    if (path.startsWith('fonts/')) return route.continue();
    if (env) {
      const gate = await gateMk8(await toRequest(route), env, Math.floor(Date.now() / 1000));
      if (gate.headers.get('x-middleware-next') !== '1') {
        requested.push(`${path} (${gate.status})`);
        return fulfill(route, gate);
      }
    }
    requested.push(path);
    if (failing.delete(path)) return route.abort('connectionreset');
    if (options.hold?.includes(path)) await released;
    let body: Buffer;
    try {
      body = readFileSync(new URL(path, PACK));
    } catch {
      return route.fulfill({ status: 404, body: 'Not found' });
    }
    return route.fulfill({ body, contentType: TYPES[path.split('.').pop() ?? ''] });
  });
  return { requested, release };
}
