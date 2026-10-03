// The track editor's save endpoint (MK-100), mounted by `vite.config.ts` under `pnpm dev` only:
// `POST /__track-editor/save` with JSON `{ course, file: 'route', route }` or
// `{ course, file: 'materials', materials }` writes `src/mk8/content/courses/<course>/<file>.ts`.
// The server writes the source itself from checked plain data (never code from the request), only
// for same-origin JSON requests from this machine (`pnpm dev` is LAN-exposed, and `pnpm mk8:build`
// imports `materials.ts`), and never over a file the editor didn't generate.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { MESH_SURFACES, type MeshMaterialSurface } from '../../sim/meshCollision';
import type { RouteDef } from '../../sim/route';
import { GENERATED_HEADER, materialsSource, routeSource } from './serialize';

export const SAVE_PATH = '/__track-editor/save';

export interface SaveRequest {
  method: string | undefined;
  contentType: string | undefined;
  origin: string | undefined;
  host: string | undefined;
  /** The client's address (`req.socket.remoteAddress`). */
  remote: string | undefined;
  body: string;
}

export interface SaveResponse {
  status: number;
  body: { file?: string; error?: string };
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const FILES = { route: 'route.ts', materials: 'materials.ts' } as const;
const MATERIAL_SURFACES: readonly string[] = [...MESH_SURFACES, 'ignore'];
const ROUTE_LISTS = [
  'points',
  'checkpoints',
  'respawnPoints',
  'gridSlots',
  'itemBoxRows',
  'coinLines',
  'zones',
] as const;

/** Finite numbers, strings, booleans, and arrays and plain objects of them: nothing else. */
export function isPlainData(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.every((v) => isPlainData(v, depth + 1));
  if (typeof value !== 'object' || value === null) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value).every((v) => isPlainData(v, depth + 1));
}

function isRoute(value: unknown): value is RouteDef {
  if (!isPlainData(value)) return false;
  const route = value as Record<string, unknown>;
  return (
    ROUTE_LISTS.every((list) => Array.isArray(route[list])) &&
    Object.keys(route).every((k) => (ROUTE_LISTS as readonly string[]).includes(k))
  );
}

function isMaterials(value: unknown): value is Record<string, MeshMaterialSurface> {
  return (
    isPlainData(value) &&
    !Array.isArray(value) &&
    Object.values(value as object).every((v) => MATERIAL_SURFACES.includes(v as string))
  );
}

/** Handles one save; writes under `coursesDir` (`src/mk8/content/courses`). */
export async function handleSave(req: SaveRequest, coursesDir: string): Promise<SaveResponse> {
  const fail = (status: number, error: string): SaveResponse => ({ status, body: { error } });
  if (req.method !== 'POST') return fail(405, 'POST only');
  if (!req.remote || !LOOPBACK.has(req.remote)) return fail(403, 'Only from this machine');
  if (!req.contentType?.startsWith('application/json')) return fail(415, 'JSON only');
  if (req.origin !== undefined && req.origin !== `http://${req.host}`)
    return fail(403, 'Same origin only');

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(req.body) as Record<string, unknown>;
  } catch {
    return fail(400, 'Bad JSON');
  }
  const { course, file } = payload;
  if (typeof course !== 'string' || !/^[a-z0-9-]+$/.test(course)) return fail(400, 'Bad course');
  let source: string;
  if (file === 'route' && isRoute(payload.route)) source = routeSource(payload.route, course);
  else if (file === 'materials' && isMaterials(payload.materials))
    source = materialsSource(payload.materials, course);
  else return fail(400, 'Bad file or data');

  const name = FILES[file];
  const target = resolve(coursesDir, course, name);
  if (existsSync(target) && !readFileSync(target, 'utf8').startsWith(GENERATED_HEADER))
    return fail(409, `${name} is hand-written: download it instead`);
  const prettier = await import('prettier');
  // The repo's Prettier config (resolved from here: the target may not exist yet).
  const options = await prettier.resolveConfig(resolve(import.meta.dirname, 'devServer.ts'));
  const formatted = await prettier.format(source, { ...options, filepath: target });
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, formatted);
  return { status: 200, body: { file: target } };
}
