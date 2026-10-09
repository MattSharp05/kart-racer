// What the track editor edits (MK-100): a course's collision mesh, its render GLB when there is one,
// its committed `route.ts` and `materials.ts`. `test-ramp` is built in code (CI has no pack);
// real courses come from the local MK8 pack (`pnpm dev` serves `$MK8_OUT` at `/mk8/`, ADR 0009).
import type { Group } from 'three';
import { mk8Course } from '../../mk8/content/courses';
import { modelCollision, modelCollisionReady } from '../../mk8/content/courses/modelCollision';
import { buildTestRampCollision } from '../../mk8/content/courses/test-ramp/collision';
import { MK8_ASSET_BASE } from '../../mk8/ui/sprites';
import {
  decodeCollision,
  type CollisionMesh,
  type MeshMaterialSurface,
} from '../../sim/meshCollision';
import type { RouteDef } from '../../sim/route';

export interface EditorCourse {
  /** Folder name under `src/mk8/content/courses/`. */
  id: string;
  collision: CollisionMesh;
  /** The committed route, if the course has one yet. */
  route: RouteDef | undefined;
  /** The committed material overrides. */
  materials: Record<string, MeshMaterialSurface>;
  /** The course's render model (real courses with the pack only). */
  model: Group | undefined;
  /** `route.ts` is written by hand: the dev server won't overwrite it (export by download). */
  handWritten: boolean;
  warnings: string[];
}

type RouteModule = Record<string, unknown>;
const routeModules = import.meta.glob<RouteModule>('../../mk8/content/courses/*/route.ts');
const materialModules = import.meta.glob<RouteModule>('../../mk8/content/courses/*/materials.ts');

/** Courses built in code rather than loaded from the pack. */
const BUILT_IN: Record<string, () => CollisionMesh> = { 'test-ramp': buildTestRampCollision };
const HAND_WRITTEN = new Set(['test-ramp']);

const moduleFor = (modules: Record<string, () => Promise<RouteModule>>, id: string, file: string) =>
  modules[`../../mk8/content/courses/${id}/${file}`];

const isRoute = (v: unknown): v is RouteDef =>
  typeof v === 'object' && v !== null && Array.isArray((v as RouteDef).points);

/** Ids with a route or built in, for the course picker (pack courses without a route aren't known). */
export function knownCourses(): string[] {
  const ids = Object.keys(routeModules).map((path) => path.split('/').at(-2) ?? '');
  return [...new Set([...Object.keys(BUILT_IN), ...ids])].filter(Boolean).sort();
}

export const coursePath = (base: string, id: string, file: string) =>
  `${base}models/courses/${id}/${file}`;

export async function loadCourse(id: string, base = MK8_ASSET_BASE): Promise<EditorCourse> {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Not a course id: ${id}`);
  const warnings: string[] = [];
  let collision: CollisionMesh;
  let model: Group | undefined;
  const builtIn = BUILT_IN[id];
  if (builtIn) collision = builtIn();
  else if (mk8Course(id)?.collisionFromModel) {
    // Built from the course model as the race builds it (MK-123 round 2), not `collision.bin`.
    const map = mk8Course(id)?.collisionFromModel ?? {};
    const response = await fetch(coursePath(base, id, 'course.glb'));
    if (!response.ok)
      throw new Error(
        `No course model for "${id}" at ${coursePath(base, id, 'course.glb')}. Run pnpm mk8:build, then pnpm dev (MK8_OUT pointing at the pack).`,
      );
    const bytes = await response.arrayBuffer();
    await modelCollisionReady;
    collision = modelCollision(bytes, map).mesh;
    model = await parseModel(bytes);
  } else {
    const response = await fetch(coursePath(base, id, 'collision.bin'));
    if (!response.ok)
      throw new Error(
        `No collision mesh for "${id}" at ${coursePath(base, id, 'collision.bin')}. Run pnpm mk8:build, then pnpm dev (MK8_OUT pointing at the pack).`,
      );
    collision = decodeCollision(await response.arrayBuffer());
    model = await loadModel(coursePath(base, id, 'course.glb')).catch((error: unknown) => {
      warnings.push(`No course model (${String(error)}): showing the collision mesh only.`);
      return undefined;
    });
  }

  const routeModule = await moduleFor(routeModules, id, 'route.ts')?.();
  const route = routeModule
    ? ((routeModule.route as RouteDef | undefined) ?? Object.values(routeModule).find(isRoute))
    : undefined;
  if (!route) warnings.push('No route.ts yet: starting an empty route.');
  const materialModule = await moduleFor(materialModules, id, 'materials.ts')?.();
  const materials = (materialModule?.materials ?? {}) as Record<string, MeshMaterialSurface>;
  return { id, collision, route, materials, model, handWritten: HAND_WRITTEN.has(id), warnings };
}

async function gltfLoader() {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
  ]);
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}

async function loadModel(url: string): Promise<Group> {
  return (await (await gltfLoader()).loadAsync(url)).scene;
}

/** The model from bytes already fetched (a copy: the loader may keep the buffer). */
async function parseModel(bytes: ArrayBuffer): Promise<Group> {
  return (await (await gltfLoader()).parseAsync(bytes.slice(0), '')).scene;
}
