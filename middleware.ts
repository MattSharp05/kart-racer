/**
 * Vercel Routing Middleware (MK-135, ADR 0009 as amended): the server-side password gate on the
 * MK8 pack. Runs before the static files on every `/mk8/` request; the pack's bytes go out only
 * with a session cookie from `POST /api/mk8-login`. The OFL font under `/mk8/fonts/` stays public.
 * The logic is in `api/mk8-login.ts` (unit-tested in `tests/api/mk8Auth.test.ts`).
 *
 * Vercel transpiles this file on its own, unbundled, into an ES module: the import needs its
 * `.js` extension, or the module fails to load and every `/mk8/` request answers 500
 * (`MIDDLEWARE_INVOCATION_FAILED`, MK-136).
 */
import { gateMk8 } from './api/mk8-login.js';

export const config = { matcher: ['/mk8/:path*'] };

export default function middleware(request: Request): Promise<Response> {
  return gateMk8(request, process.env, Math.floor(Date.now() / 1000));
}
