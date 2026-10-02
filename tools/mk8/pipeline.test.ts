import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildModel, buildModels } from './buildModels.ts';
import { checkAssets, loadBudgets } from './check.ts';
import { readCollision, SURFACES } from './collision.ts';
import { daeInfo } from './daeInfo.ts';
import { readManifest, sha256, updateManifest } from './manifest.ts';
import { outDir } from './paths.ts';
import { loadSources, modelOutputs, type ModelSource } from './sources.ts';
import {
  decodeImageBitmap,
  parseGlb,
  readTree,
  tempDir,
  writeCubeModel,
  writeGridModel,
} from './testUtils.ts';

const course: ModelSource = {
  id: 'cube-course',
  name: 'Cube course',
  kind: 'course',
  assetId: null,
};
const racer: ModelSource = { id: 'cube-racer', name: 'Cube racer', kind: 'racer', assetId: null };
const dirs: string[] = [];
const temp = (prefix: string) => {
  const dir = tempDir(prefix);
  dirs.push(dir);
  return dir;
};
let raw = '';

beforeAll(async () => {
  raw = temp('raw');
  await writeCubeModel(raw, course.id);
  await writeCubeModel(raw, racer.id);
});
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
afterEach(() => vi.unstubAllGlobals());

async function buildFixtures(out: string) {
  const result = await buildModels([course, racer], raw, out, () => {});
  updateManifest(out, result.entries);
  return result;
}

describe('mk8 model pipeline (fixture cube)', () => {
  it('two builds produce identical bytes', async () => {
    const a = temp('out-a');
    const b = temp('out-b');
    await buildFixtures(a);
    await buildFixtures(b);
    const treeA = readTree(a);
    const treeB = readTree(b);
    expect([...treeA.keys()].sort()).toEqual([...treeB.keys()].sort());
    for (const [path, bytes] of treeA) expect(sha256(treeB.get(path)!), path).toBe(sha256(bytes));
    expect(treeA.has('manifest.json')).toBe(true);
  }, 60_000);

  it('writes the GLBs, the -low set, collision and a manifest that checks out', async () => {
    const out = temp('out');
    const result = await buildFixtures(out);
    expect(result.missing).toEqual([]);
    const manifest = readManifest(out)!;
    expect(manifest.files.map((f) => f.path)).toEqual([
      'models/courses/cube-course/collision.bin',
      'models/courses/cube-course/course-low.glb',
      'models/courses/cube-course/course.glb',
      'models/racers/cube-racer-low.glb',
      'models/racers/cube-racer.glb',
    ]);
    expect(new Set(manifest.files.map((f) => f.group))).toEqual(
      new Set(['course/cube-course', 'racer/cube-racer']),
    );
    expect(checkAssets(out, manifest, loadBudgets())).toEqual([]);
    expect(existsSync(join(out, 'stubs/courses/cube-course/materials.json'))).toBe(true);
    expect(existsSync(join(out, '..', 'public'))).toBe(false);
  }, 60_000);

  it('loads every GLB with GLTFLoader + MeshoptDecoder, textures as WebP within the size cap', async () => {
    const out = temp('out');
    await buildFixtures(out);
    const decoded: { width: number; format?: string }[] = [];
    vi.stubGlobal('self', globalThis);
    vi.stubGlobal('createImageBitmap', async (blob: Blob) => {
      const meta = await sharp(Buffer.from(await blob.arrayBuffer())).metadata();
      decoded.push({ width: meta.width, format: meta.format });
      return decodeImageBitmap(blob);
    });
    for (const path of [
      'models/courses/cube-course/course.glb',
      'models/racers/cube-racer-low.glb',
    ]) {
      const bytes = readFileSync(join(out, path));
      const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
      expect(json.extensionsUsed).toEqual(
        expect.arrayContaining(['EXT_meshopt_compression', 'EXT_texture_webp']),
      );
      const parsed = await parseGlb(bytes);
      expect(parsed.triangles, path).toBe(12);
      expect(parsed.textures, path).toBeGreaterThan(0);
    }
    expect(decoded.length).toBeGreaterThan(0);
    expect(decoded.every((d) => d.format === 'webp' && d.width <= 64)).toBe(true);
  }, 60_000);

  it('exports collision with surfaces from the material map and a grid covering every triangle', async () => {
    const out = temp('out');
    await buildFixtures(out);
    const mesh = readCollision(readFileSync(join(out, 'models/courses/cube-course/collision.bin')));
    const counts = Object.fromEntries(
      SURFACES.map((s, code) => [s, mesh.surfaces.filter((c) => c === code).length]),
    );
    // The stub guesses "road" for the top and "wall" for the sides and bottom.
    expect(counts).toMatchObject({ road: 2, wall: 10 });
    expect(mesh.positions.length).toBe(12 * 9);
    const covered = new Set(mesh.cellTris);
    expect(covered.size).toBe(12);
    const stub = JSON.parse(
      readFileSync(join(out, 'stubs/courses/cube-course/materials.json'), 'utf8'),
    );
    expect(stub).toEqual({ road: 'road', wall: 'wall' });
  }, 60_000);

  it('simplifies a collision mesh over its triangle budget, deterministically', async () => {
    const gridRaw = temp('grid');
    writeGridModel(gridRaw, 'grid-course', 20);
    const grid: ModelSource = { id: 'grid-course', name: 'Grid', kind: 'course', assetId: null };
    const { COLLISION_DEFAULTS } = await import('./collision.ts');
    const saved = COLLISION_DEFAULTS.maxTriangles;
    COLLISION_DEFAULTS.maxTriangles = 200;
    try {
      const a = await buildModel(grid, gridRaw, temp('out'));
      const b = await buildModel(grid, gridRaw, temp('out'));
      expect(a.report.triangles).toBe(800);
      expect(a.report.collisionTriangles).toBeGreaterThan(0);
      expect(a.report.collisionTriangles).toBeLessThanOrEqual(200);
      expect(a.entries.map((e) => e.sha256)).toEqual(b.entries.map((e) => e.sha256));
    } finally {
      COLLISION_DEFAULTS.maxTriangles = saved;
    }
  }, 60_000);
});

describe('mk8:check', () => {
  it('fails on a missing file, a hash mismatch and a budget overrun', async () => {
    const out = temp('out');
    await buildFixtures(out);
    const manifest = readManifest(out)!;
    const [first, second] = manifest.files;
    writeFileSync(join(out, first!.path), Buffer.alloc(first!.bytes));
    rmSync(join(out, second!.path));
    const problems = checkAssets(out, manifest, { totalBytes: 10, groups: { 'racer/*': 10 } });
    expect(problems).toEqual(
      expect.arrayContaining([
        `hash mismatch: ${first!.path}`,
        `missing file: ${second!.path}`,
        expect.stringMatching(/^over budget: racer\/cube-racer is \d+ B, budget racer\/\* = 10 B$/),
        expect.stringMatching(/^over budget: total is \d+ B, budget 10 B$/),
      ]),
    );
  }, 60_000);

  it('reports sources without raw files as missing instead of failing', async () => {
    const result = await buildModels(
      [{ ...racer, id: 'not-provided' }],
      raw,
      temp('out'),
      () => {},
    );
    expect(result).toMatchObject({ missing: ['not-provided'], entries: [] });
  });
});

describe('sources.json', () => {
  it('lists the ticket’s models with unique ids and distinct output paths', () => {
    const { models } = loadSources();
    const byId = new Map(models.map((m) => [m.id, m]));
    expect(byId.size).toBe(models.length);
    for (const [id, assetId] of [
      ['mario-kart-stadium', 293504],
      ['water-park', 293516],
      ['sweet-sweet-canyon', 293513],
      ['thwomp-ruins', 293514],
      ['mario', 292062],
      ['standard-kart', 293519],
      ['item-box', 311932],
      ['lakitu', 293528],
    ] as const)
      expect(byId.get(id)?.assetId, id).toBe(assetId);
    expect(models.filter((m) => m.kind === 'racer')).toHaveLength(12);
    const paths = models.flatMap((m) => Object.values(modelOutputs(m)));
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('mk8:dae-info', () => {
  it('detects a skinned skeleton in COLLADA', () => {
    const skinned = `<COLLADA><library_controllers><controller id="c"><skin source="#m"/></controller></library_controllers>
      <library_visual_scenes><visual_scene><node id="root" type="JOINT"><node id="arm" type="JOINT"/></node>
      <node id="body" type="NODE"/></visual_scene></library_visual_scenes></COLLADA>`;
    expect(daeInfo(skinned)).toEqual({ skins: 1, joints: 2, animations: 0 });
    expect(daeInfo('<COLLADA><node id="body" type="NODE"/></COLLADA>')).toEqual({
      skins: 0,
      joints: 0,
      animations: 0,
    });
  });
});

// The real converted assets, when $MK8_OUT has them (they are never in the repo or CI).
const realManifest = readManifest(outDir());
describe.skipIf(!realManifest)('mk8 assets in $MK8_OUT', () => {
  it('match the manifest and the budgets', () => {
    expect(checkAssets(outDir(), realManifest!, loadBudgets())).toEqual([]);
  });

  it('every GLB loads with GLTFLoader + MeshoptDecoder', async () => {
    vi.stubGlobal('self', globalThis);
    vi.stubGlobal('createImageBitmap', decodeImageBitmap);
    for (const entry of realManifest!.files.filter((f) => f.path.endsWith('.glb'))) {
      const parsed = await parseGlb(readFileSync(join(outDir(), entry.path)));
      expect(parsed.meshes, entry.path).toBeGreaterThan(0);
    }
  }, 600_000);
});
