// The client's collision-from-model (MK-123 round 2, `src/mk8/content/courses/modelCollision.ts`)
// against the pipeline: a generated multi-material course with nested, rotated and scaled nodes is
// written as `pnpm mk8:build` writes a course GLB (meshopt + quantized positions, full and `-low`),
// and the client's triangles must be the pipeline's own collision triangles (up to quantization).
import { Document, type Material, type Node } from '@gltf-transform/core';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  modelCollision,
  modelCollisionReady,
} from '../../src/mk8/content/courses/modelCollision.ts';
import { MESH_SURFACES, type MeshMaterialSurface } from '../../src/sim/meshCollision.ts';
import { buildCollision, COLLISION_DEFAULTS, materialStub } from './collision.ts';
import { createIO, encodeGlb, MODEL_DEFAULTS, optimiseGeometry } from './models.ts';

/** The course's `materials.ts` stand-in: one material unlisted (it takes the name guess). */
const MAP: Record<string, MeshMaterialSurface> = {
  ck_spongeMulti01: 'road',
  // The guesses would drop it ("…light"): the map keeps it.
  ck_spongeMulti01_Blight: 'road',
  // The guesses would make it water: the map makes it road.
  ck_sponge01a_water: 'road',
  // The guesses would make it road: the map drops it.
  ef_juicenear: 'ignore',
  ck_candy01: 'antigrav',
};
const UNLISTED = 'ck_creamwall01';

/** A `n × n` quad grid in the XZ plane, `size` m across, at height `y` (n² × 2 triangles). */
function grid(doc: Document, material: Material, n: number, size: number, y: number) {
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  const positions: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= n; j += 1)
    for (let i = 0; i <= n; i += 1) positions.push((i / n) * size, y + i * 0.01, (j / n) * size);
  for (let j = 0; j < n; j += 1)
    for (let i = 0; i < n; i += 1) {
      const a = j * (n + 1) + i;
      indices.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
    }
  const prim = doc
    .createPrimitive()
    .setMaterial(material)
    .setAttribute(
      'POSITION',
      doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer),
    )
    .setIndices(
      doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer),
    );
  return doc.createMesh().addPrimitive(prim);
}

/** The generated course: five materials over four nodes, one nested under a moved, turned parent. */
function course(): Document {
  const doc = new Document();
  doc.createBuffer();
  const material = (name: string) => doc.createMaterial(name);
  const scene = doc.createScene();
  doc.getRoot().setDefaultScene(scene);
  const add = (node: Node, parent?: Node) =>
    parent ? parent.addChild(node) : scene.addChild(node);
  add(doc.createNode('straight').setMesh(grid(doc, material('ck_spongeMulti01'), 8, 120, 0)));
  add(doc.createNode('soda').setMesh(grid(doc, material('ef_juicenear'), 4, 60, 6)));
  const parent = doc
    .createNode('turn')
    .setTranslation([40, 3, -25])
    .setRotation([0, Math.sin(Math.PI / 12), 0, Math.cos(Math.PI / 12)])
    .setScale([1.5, 1.5, 1.5]);
  add(parent);
  add(
    doc.createNode('blight').setMesh(grid(doc, material('ck_spongeMulti01_Blight'), 6, 40, 0)),
    parent,
  );
  const lake = doc.createNode('lake').setTranslation([0, -8, 70]);
  lake.setMesh(grid(doc, material('ck_sponge01a_water'), 5, 50, 0));
  add(lake, parent);
  add(doc.createNode('candy').setMesh(grid(doc, material('ck_candy01'), 3, 30, 12)));
  add(doc.createNode('cream').setMesh(grid(doc, material(UNLISTED), 2, 20, 1)));
  return doc;
}

/** Each triangle's 9 floats, keyed by surface. */
function bySurface(positions: Float32Array, surfaces: Uint8Array): Map<string, number[][]> {
  const out = new Map<string, number[][]>();
  surfaces.forEach((code, t) => {
    const name = MESH_SURFACES[code] ?? '?';
    const list = out.get(name) ?? [];
    list.push([...positions.subarray(t * 9, t * 9 + 9)]);
    out.set(name, list);
  });
  return out;
}

/** The same triangle within `tolerance` m, its vertices in any rotation (meshopt rotates them). */
function sameTriangle(a: number[], b: number[], tolerance: number): boolean {
  return [0, 1, 2].some((r) =>
    [0, 1, 2].every((v) =>
      [0, 1, 2].every(
        (c) => Math.abs((a[v * 3 + c] ?? 0) - (b[((v + r) % 3) * 3 + c] ?? 0)) <= tolerance,
      ),
    ),
  );
}

describe('course collision from the model (MK-123 round 2)', () => {
  let full: Uint8Array;
  let low: Uint8Array;
  let geometry: Document;

  beforeAll(async () => {
    await modelCollisionReady;
    const io = await createIO();
    const doc = course();
    await optimiseGeometry(doc, MODEL_DEFAULTS);
    const plain = await io.writeBinary(doc);
    geometry = await io.readBinary(plain);
    full = await encodeGlb(await io.readBinary(plain), MODEL_DEFAULTS.textureSize, MODEL_DEFAULTS);
    low = await encodeGlb(
      await io.readBinary(plain),
      MODEL_DEFAULTS.lowTextureSize,
      MODEL_DEFAULTS,
    );
  }, 60_000);

  it('reads a pipeline GLB (meshopt, quantized) as the pipeline’s own collision triangles', async () => {
    const json = JSON.parse(
      new TextDecoder().decode(
        full.subarray(20, 20 + new DataView(full.buffer, full.byteOffset).getUint32(12, true)),
      ),
    );
    expect(json.extensionsUsed).toEqual(
      expect.arrayContaining(['EXT_meshopt_compression', 'KHR_mesh_quantization']),
    );
    const expected = await buildCollision(geometry, {
      ...COLLISION_DEFAULTS,
      maxTriangles: Infinity,
      materials: { ...materialStub(geometry), ...MAP },
    });
    const { mesh, stats } = modelCollision(full, MAP);
    expect(stats.surfaces).toEqual({ road: 128 + 72 + 50, antigrav: 18, wall: 8 });
    expect(stats.ignored).toBe(32);
    expect(stats.guessed).toEqual([UNLISTED]);
    const want = bySurface(expected.positions, expected.surfaces);
    const got = bySurface(mesh.positions, mesh.surfaces);
    expect([...got.keys()].sort()).toEqual([...want.keys()].sort());
    // 14-bit positions over the biggest node's box (~120 m): under 1 cm.
    for (const [surface, triangles] of want) {
      const left = [...(got.get(surface) ?? [])];
      expect(left.length, surface).toBe(triangles.length);
      for (const triangle of triangles) {
        const i = left.findIndex((t) => sameTriangle(triangle, t, 0.01));
        expect(i, `${surface} ${triangle.join(',')}`).toBeGreaterThanOrEqual(0);
        left.splice(i, 1);
      }
    }
    // The grid covers every triangle.
    expect(new Set(mesh.cellTris).size).toBe(mesh.surfaces.length);
  });

  it('is the same from the -low model and from a second read (the sim never depends on quality)', () => {
    const a = modelCollision(full, MAP).mesh;
    expect(modelCollision(low, MAP).mesh.positions).toEqual(a.positions);
    expect(modelCollision(full, MAP).mesh).toEqual(a);
  });

  it('refuses bytes that aren’t a GLB', () => {
    expect(() => modelCollision(new Uint8Array(32), MAP)).toThrow(/not a GLB/);
  });
});
