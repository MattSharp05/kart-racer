// MK-136: a local stand-in for the Vercel deploy with the MK8 pack behind its password. Serves
// `dist/` the way the site does: every `/mk8/` request goes through the real gate (`gateMk8`, as
// `middleware.ts` runs it) and `POST /api/mk8-login` through the real login handler, so a
// production build can be checked with the real pack before a deploy.
//
//   pnpm build
//   MK8_PACK=../kart-racer-mk8-assets/out MK8_PASSWORD=<any local value> pnpm mk8:preview
//
// `MK8_PACK` (optional) is a local copy of the converted pack (`pnpm mk8:build`'s `.mk8-out/`, or a
// clone of the private repo's `out/`): its manifest's files are copied into `dist/mk8/` exactly as
// `scripts/fetchMk8Pack.mjs` copies them on Vercel. Without it, whatever `dist/mk8/` holds is
// served. `PORT` defaults to 4174. Local only: nothing here runs on Vercel or in CI.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { cpSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { gateMk8, handleMk8Login } from '../api/mk8-login.ts';
// @ts-expect-error -- a plain .mjs build script, no types
import { packFiles } from './fetchMk8Pack.mjs';

const DIST = resolve('dist');
const PORT = Number(process.env.PORT ?? 4174);
/** What Vercel sends for a static file by default. */
const STATIC_CACHE = 'public, max-age=0, must-revalidate';
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.m4a': 'audio/mp4',
  '.wasm': 'application/wasm',
};

/** Copies a local pack into `dist/mk8/` the way the Vercel build step does. */
function stagePack(source: string, dest = join(DIST, 'mk8')): number {
  const files: string[] = packFiles(
    JSON.parse(readFileSync(join(source, 'manifest.json'), 'utf8')),
  );
  for (const file of files) {
    const to = join(dest, file);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(join(source, file), to);
  }
  return files.length;
}

/** The file under `dist/` a path names, with `cleanUrls` (`/dev` → `dev.html`), or null. */
function staticFile(pathname: string): string | null {
  const path = normalize(join(DIST, decodeURIComponent(pathname)));
  if (path !== DIST && !path.startsWith(DIST + sep)) return null;
  for (const candidate of [path, `${path}.html`, join(path, 'index.html')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(', '));
  }
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
  return new Request(`http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, {
    method: req.method ?? 'GET',
    headers,
    ...(body && req.method !== 'GET' && req.method !== 'HEAD' && { body }),
  });
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  response.headers.forEach((value, name) => {
    if (name !== 'x-middleware-next') res.setHeader(name, value);
  });
  res.statusCode = response.status;
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const request = await toRequest(req);
  const { pathname } = new URL(request.url);
  if (pathname === '/api/mk8-login') return send(res, await handleMk8Login(request, process.env));
  let extra: Headers | undefined;
  if (pathname.startsWith('/mk8/')) {
    const gate = await gateMk8(request, process.env, Math.floor(Date.now() / 1000));
    if (gate.headers.get('x-middleware-next') !== '1') return send(res, gate);
    extra = gate.headers;
  }
  const file = staticFile(pathname);
  res.setHeader('Cache-Control', STATIC_CACHE);
  // The middleware's `next()` headers win over the static defaults, as on Vercel.
  extra?.forEach((value, name) => name !== 'x-middleware-next' && res.setHeader(name, value));
  if (!file) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
  res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
}

function main(): void {
  if (!existsSync(join(DIST, 'index.html'))) throw new Error('mk8:preview: run `pnpm build` first');
  if (!process.env.MK8_PASSWORD) {
    console.log('mk8:preview: MK8_PASSWORD not set, so every /mk8/ pack file answers 404.');
  }
  if (process.env.MK8_PACK) {
    console.log(
      `mk8:preview: copied ${stagePack(resolve(process.env.MK8_PACK))} files to dist/mk8/`,
    );
  }
  createServer((req, res) => {
    handle(req, res).catch((e: unknown) => {
      res.statusCode = 500;
      res.end(e instanceof Error ? e.message : String(e));
    });
  }).listen(PORT, () => console.log(`mk8:preview: http://localhost:${PORT}/`));
}

main();
