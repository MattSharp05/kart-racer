// The models part of `pnpm mk8:build` (MK-93): every model in sources.json whose raw folder
// exists → GLB + `-low` GLB (+ collision.bin and a material map stub for courses).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  buildCollision,
  COLLISION_DEFAULTS,
  materialStub,
  writeCollision,
  type MaterialMap,
} from './collision.ts';
import { entryFor, type ManifestEntry } from './manifest.ts';
import { convertModel, MODEL_DEFAULTS, type ModelStats } from './models.ts';
import { modelGroup, modelOutputs, type ModelSource } from './sources.ts';

export interface ModelReport extends ModelStats {
  id: string;
  glbBytes: number;
  glbLowBytes: number;
  collisionTriangles?: number;
}

export interface ModelsResult {
  entries: ManifestEntry[];
  reports: ModelReport[];
  missing: string[];
}

/** All files under `dir` (sorted, relative paths with forward slashes). */
function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const full = join(d, name.name);
      if (name.isDirectory()) walk(full);
      else out.push(relative(dir, full).split(/[\\/]/).join('/'));
    }
  };
  walk(dir);
  return out;
}

export function findObj(rawModelDir: string, source: ModelSource): string {
  if (source.obj) return join(rawModelDir, source.obj);
  const objs = listFiles(rawModelDir).filter((f) => f.toLowerCase().endsWith('.obj'));
  const [obj] = objs;
  if (objs.length !== 1 || !obj)
    throw new Error(
      `${source.id}: expected one .obj in ${rawModelDir}, found ${objs.length}` +
        (objs.length ? ` (${objs.join(', ')}); set "obj" in sources.json` : ''),
    );
  return join(rawModelDir, obj);
}

/** A course's material map: `tools/mk8/materials/<id>.json` when it exists, else the guesses. */
function courseMaterials(source: ModelSource, stub: MaterialMap): MaterialMap {
  const file = join(import.meta.dirname, 'materials', `${source.id}.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as MaterialMap) : stub;
}

function write(root: string, path: string, bytes: Uint8Array) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}

export async function buildModel(
  source: ModelSource,
  rawRoot: string,
  outRoot: string,
): Promise<{ entries: ManifestEntry[]; report: ModelReport }> {
  const objPath = findObj(join(rawRoot, 'models', source.id), source);
  const converted = await convertModel(objPath, {
    ...MODEL_DEFAULTS,
    decoration: source.decoration ?? [],
  });
  const out = modelOutputs(source);
  const group = modelGroup(source);
  write(outRoot, out.glb, converted.glb);
  write(outRoot, out.glbLow, converted.glbLow);
  const entries = [
    entryFor(out.glb, converted.glb, group),
    entryFor(out.glbLow, converted.glbLow, group),
  ];
  const report: ModelReport = {
    id: source.id,
    ...converted.stats,
    glbBytes: converted.glb.byteLength,
    glbLowBytes: converted.glbLow.byteLength,
  };
  if (out.collision) {
    const stub = materialStub(converted.geometry);
    // The stub is for the course ticket's materials.ts: written beside the output, not shipped.
    write(
      outRoot,
      `stubs/courses/${source.id}/materials.json`,
      Buffer.from(`${JSON.stringify(stub, null, 2)}\n`),
    );
    const mesh = await buildCollision(converted.geometry, {
      ...COLLISION_DEFAULTS,
      materials: courseMaterials(source, stub),
    });
    const bytes = writeCollision(mesh);
    write(outRoot, out.collision, bytes);
    entries.push(entryFor(out.collision, bytes, group));
    report.collisionTriangles = mesh.surfaces.length;
  }
  return { entries, report };
}

export async function buildModels(
  sources: ModelSource[],
  rawRoot: string,
  outRoot: string,
  log: (line: string) => void = console.log,
): Promise<ModelsResult> {
  const result: ModelsResult = { entries: [], reports: [], missing: [] };
  for (const source of sources) {
    if (!existsSync(join(rawRoot, 'models', source.id))) {
      result.missing.push(source.id);
      continue;
    }
    const { entries, report } = await buildModel(source, rawRoot, outRoot);
    result.entries.push(...entries);
    result.reports.push(report);
    log(
      `  ${source.id}: ${report.triangles} triangles, ${report.glbBytes} B (low ${report.glbLowBytes} B)`,
    );
  }
  return result;
}
