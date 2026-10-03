// The models part of `pnpm mk8:build` (MK-93): every model in sources.json whose raw folder
// exists → GLB + `-low` GLB (+ collision.bin and a material map stub for courses).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
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

/** Course content folders (the track editor writes `materials.ts` there). */
const COURSES_DIR = join(import.meta.dirname, '../../src/mk8/content/courses');

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

/**
 * The model file in a raw folder: `file` (or the older `obj`) from sources.json, else the only
 * `.dae` (preferred: it keeps racers' skeletons), else the only `.obj`.
 */
export function findModelFile(rawModelDir: string, source: ModelSource): string {
  const chosen = source.file ?? source.obj;
  if (chosen) return join(rawModelDir, chosen);
  const files = listFiles(rawModelDir);
  for (const ext of ['.dae', '.obj']) {
    const found = files.filter((f) => f.toLowerCase().endsWith(ext));
    if (found.length === 1 && found[0]) return join(rawModelDir, found[0]);
    if (found.length > 1)
      throw new Error(
        `${source.id}: ${found.length} ${ext} files in ${rawModelDir} (${found.join(', ')}); set "file" in sources.json`,
      );
  }
  throw new Error(`${source.id}: no .dae or .obj in ${rawModelDir}`);
}

/**
 * A course's material map: `tools/mk8/materials/<id>.json` when it exists, else the guesses, with
 * the track editor's overrides (`src/mk8/content/courses/<id>/materials.ts`, MK-100) on top.
 */
async function courseMaterials(source: ModelSource, stub: MaterialMap): Promise<MaterialMap> {
  const file = join(import.meta.dirname, 'materials', `${source.id}.json`);
  const base = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as MaterialMap) : stub;
  const overrides = join(COURSES_DIR, source.id, 'materials.ts');
  if (!existsSync(overrides)) return base;
  const module = (await import(pathToFileURL(overrides).href)) as { materials?: MaterialMap };
  return { ...base, ...module.materials };
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
  const modelPath = findModelFile(join(rawRoot, 'models', source.id), source);
  const converted = await convertModel(modelPath, {
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
      materials: await courseMaterials(source, stub),
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
    for (const entry of entries) result.entries.push(entry);
    result.reports.push(report);
    log(
      `  ${source.id}: ${report.triangles} triangles, ${report.glbBytes} B (low ${report.glbLowBytes} B)`,
    );
  }
  return result;
}
