import { readFileSync } from 'node:fs';
import type { Page, Route } from '@playwright/test';

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
  await page.route('**/mk8/**', async (route: Route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/mk8\//, '');
    if (path.startsWith('fonts/')) return route.continue();
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
