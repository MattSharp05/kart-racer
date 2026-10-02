// Course collision export (MK-93, ADR 0010): the course mesh's triangles, each tagged with a
// surface from the course's material map, plus a uniform 3D grid index, in one little-endian
// binary (`collision.bin`). The sim-side reader (`sim/meshTrack.ts`) comes with the mesh-track
// ticket; `readCollision` here is the reference parser it must match.
//
// Layout (byte offsets from the start; every section 4-byte aligned):
//   0  magic 'MK8C'            4  version u32         8  triangle count u32
//  12  cell size f32          16  grid min f32×3     28  grid dims u32×3
//  40  index entry count u32  44  positions f32[triangles × 9]
//      surfaces u8[triangles] (zero-padded to 4)    cell starts u32[cells + 1]
//      cell triangles u32[index entries]
// Cell (x, y, z) is `x + dims.x × (y + dims.y × z)`; its triangles are
// `cellTris[cellStart[c] .. cellStart[c + 1])`, in ascending triangle order.
import type { Document } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';

export const COLLISION_MAGIC = 'MK8C';
export const COLLISION_VERSION = 1;
const HEADER_BYTES = 44;
/** Primitive mode 4 = TRIANGLES (glTF). */
const TRIANGLES = 4;

/** Surface codes stored per triangle; `ignore` is never stored (those triangles are dropped). */
export const SURFACES = [
  'road',
  'offroad',
  'boost',
  'wall',
  'water',
  'antigrav',
  'glide',
  'void',
] as const;
export type Surface = (typeof SURFACES)[number];
export type MaterialSurface = Surface | 'ignore';
export type MaterialMap = Record<string, MaterialSurface>;

export interface CollisionOptions {
  /** Material name → surface; materials not listed use `fallback`. */
  materials: MaterialMap;
  fallback: MaterialSurface;
  /** Grid cell edge in metres. */
  cellSize: number;
  /** Above this many triangles, each surface's triangles are simplified to fit (ADR 0010: 10–25k). */
  maxTriangles: number;
  /** Simplifier error bound, relative to the mesh extent. */
  simplifyError: number;
}

export const COLLISION_DEFAULTS: Omit<CollisionOptions, 'materials'> = {
  fallback: 'road',
  cellSize: 8,
  maxTriangles: 25_000,
  simplifyError: 0.002,
};

export interface CollisionMesh {
  positions: Float32Array;
  surfaces: Uint8Array;
  cellSize: number;
  gridMin: [number, number, number];
  gridDims: [number, number, number];
  cellStart: Uint32Array;
  cellTris: Uint32Array;
}

/** Guess a surface from a material name, for the per-course material map stub. */
export function guessSurface(material: string): MaterialSurface {
  const name = material.toLowerCase();
  const rules: [RegExp, MaterialSurface][] = [
    [/sky|cloud|tree|leaf|leaves|crowd|audience|flag|banner|light|effect|fx/, 'ignore'],
    [/water|sea|river|lake|pool/, 'water'],
    [/dash|boost/, 'boost'],
    [/wall|fence|rail|barrier|guard/, 'wall'],
    [/grass|dirt|sand|mud|gravel|offroad|rough/, 'offroad'],
    [/glide|jump/, 'glide'],
  ];
  for (const [pattern, surface] of rules) if (pattern.test(name)) return surface;
  return 'road';
}

/** Every material name in the document, sorted, with a guessed surface: the material map stub. */
export function materialStub(doc: Document): MaterialMap {
  const names = [
    ...new Set(
      doc
        .getRoot()
        .listMaterials()
        .map((m) => m.getName()),
    ),
  ].sort();
  return Object.fromEntries(names.map((n) => [n, guessSurface(n)]));
}

interface SurfaceGroup {
  positions: number[];
}

/** Collects world-space triangles per surface from every mesh in the default scene. */
function collectTriangles(doc: Document, opts: CollisionOptions): Map<Surface, SurfaceGroup> {
  const groups = new Map<Surface, SurfaceGroup>();
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!scene) return groups;
  scene.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== TRIANGLES) continue;
      const name = prim.getMaterial()?.getName() ?? '';
      const surface = opts.materials[name] ?? opts.fallback;
      if (surface === 'ignore') continue;
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const indices = prim.getIndices();
      const count = indices ? indices.getCount() : pos.getCount();
      let group = groups.get(surface);
      if (!group) groups.set(surface, (group = { positions: [] }));
      const v: number[] = [0, 0, 0];
      for (let i = 0; i < count; i++) {
        pos.getElement(indices ? indices.getScalar(i) : i, v);
        const [x, y, z] = v as [number, number, number];
        group.positions.push(
          m[0] * x + m[4] * y + m[8] * z + m[12],
          m[1] * x + m[5] * y + m[9] * z + m[13],
          m[2] * x + m[6] * y + m[10] * z + m[14],
        );
      }
    }
  });
  return groups;
}

/** Welds a triangle soup into indexed form (exact position matches), for the simplifier. */
function weldSoup(soup: Float32Array): { vertices: Float32Array; indices: Uint32Array } {
  const lookup = new Map<string, number>();
  const vertices: number[] = [];
  const indices = new Uint32Array(soup.length / 3);
  for (let i = 0; i < indices.length; i++) {
    const [x, y, z] = soup.subarray(i * 3, i * 3 + 3);
    const key = `${x},${y},${z}`;
    let index = lookup.get(key);
    if (index === undefined) {
      index = vertices.length / 3;
      lookup.set(key, index);
      vertices.push(x ?? 0, y ?? 0, z ?? 0);
    }
    indices[i] = index;
  }
  return { vertices: new Float32Array(vertices), indices };
}

function simplifyGroup(soup: number[], ratio: number, error: number): number[] {
  const { vertices, indices } = weldSoup(new Float32Array(soup));
  const target = Math.max(3, Math.floor((indices.length / 3) * ratio) * 3);
  // LockBorder keeps the seams between surfaces (and open edges) where they are.
  const [simplified] = MeshoptSimplifier.simplify(indices, vertices, 3, target, error, [
    'LockBorder',
  ]);
  const out: number[] = [];
  for (const index of simplified) out.push(...vertices.subarray(index * 3, index * 3 + 3));
  return out;
}

type Vec3 = [number, number, number];

/** Uniform grid over the triangles' bounds; each cell lists the triangles whose box touches it. */
function buildGrid(pos: Float32Array, cellSize: number) {
  const triCount = pos.length / 9;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  pos.forEach((v, i) => {
    const axis = i % 3;
    min[axis] = Math.min(min[axis] ?? v, v);
    max[axis] = Math.max(max[axis] ?? v, v);
  });
  if (triCount === 0) {
    min.fill(0);
    max.fill(0);
  }
  const dims = min.map((lo, a) => Math.max(1, Math.ceil(((max[a] ?? lo) - lo) / cellSize))) as Vec3;
  const cellOf = (value: number, axis: 0 | 1 | 2) =>
    Math.min(dims[axis] - 1, Math.max(0, Math.floor((value - min[axis]) / cellSize)));

  const cellCount = dims[0] * dims[1] * dims[2];
  const buckets: number[][] = Array.from({ length: cellCount }, () => []);
  for (let t = 0; t < triCount; t++) {
    const tri = pos.subarray(t * 9, t * 9 + 9);
    const lo: Vec3 = [0, 0, 0];
    const hi: Vec3 = [0, 0, 0];
    for (const a of [0, 1, 2] as const) {
      const values = [tri[a] ?? 0, tri[a + 3] ?? 0, tri[a + 6] ?? 0];
      lo[a] = cellOf(Math.min(...values), a);
      hi[a] = cellOf(Math.max(...values), a);
    }
    for (let z = lo[2]; z <= hi[2]; z++)
      for (let y = lo[1]; y <= hi[1]; y++)
        for (let x = lo[0]; x <= hi[0]; x++) buckets[x + dims[0] * (y + dims[1] * z)]?.push(t);
  }
  const cellStart = new Uint32Array(cellCount + 1);
  buckets.forEach((bucket, c) => (cellStart[c + 1] = (cellStart[c] ?? 0) + bucket.length));
  const cellTris = new Uint32Array(cellStart[cellCount] ?? 0);
  buckets.forEach((bucket, c) => cellTris.set(bucket, cellStart[c]));
  return { gridMin: min.map(Math.fround) as Vec3, gridDims: dims, cellStart, cellTris };
}

/** Builds the collision mesh and grid. Same document and options → same arrays. */
export async function buildCollision(
  doc: Document,
  opts: CollisionOptions,
): Promise<CollisionMesh> {
  const groups = collectTriangles(doc, opts);
  const total = [...groups.values()].reduce((sum, g) => sum + g.positions.length / 9, 0);
  if (total > opts.maxTriangles) {
    await MeshoptSimplifier.ready;
    const ratio = opts.maxTriangles / total;
    for (const group of groups.values())
      group.positions = simplifyGroup(group.positions, ratio, opts.simplifyError);
  }

  // Surfaces in code order, so the triangle order doesn't depend on Map insertion order.
  const positions: number[] = [];
  const surfaceCodes: number[] = [];
  SURFACES.forEach((surface, code) => {
    const group = groups.get(surface);
    if (!group) return;
    positions.push(...group.positions);
    for (let t = 0; t < group.positions.length / 9; t++) surfaceCodes.push(code);
  });
  const pos = new Float32Array(positions);
  return {
    positions: pos,
    surfaces: new Uint8Array(surfaceCodes),
    cellSize: opts.cellSize,
    ...buildGrid(pos, opts.cellSize),
  };
}

const pad4 = (n: number) => (n + 3) & ~3;

export function writeCollision(mesh: CollisionMesh): Uint8Array {
  const triCount = mesh.surfaces.length;
  const surfacesBytes = pad4(triCount);
  const bytes =
    HEADER_BYTES +
    mesh.positions.byteLength +
    surfacesBytes +
    mesh.cellStart.byteLength +
    mesh.cellTris.byteLength;
  const out = new Uint8Array(bytes);
  const view = new DataView(out.buffer);
  out.set(new TextEncoder().encode(COLLISION_MAGIC), 0);
  view.setUint32(4, COLLISION_VERSION, true);
  view.setUint32(8, triCount, true);
  view.setFloat32(12, mesh.cellSize, true);
  mesh.gridMin.forEach((v, i) => view.setFloat32(16 + i * 4, v, true));
  mesh.gridDims.forEach((v, i) => view.setUint32(28 + i * 4, v, true));
  view.setUint32(40, mesh.cellTris.length, true);
  let offset = HEADER_BYTES;
  mesh.positions.forEach((v, i) => view.setFloat32(offset + i * 4, v, true));
  offset += mesh.positions.byteLength;
  out.set(mesh.surfaces, offset);
  offset += surfacesBytes;
  mesh.cellStart.forEach((v, i) => view.setUint32(offset + i * 4, v, true));
  offset += mesh.cellStart.byteLength;
  mesh.cellTris.forEach((v, i) => view.setUint32(offset + i * 4, v, true));
  return out;
}

export function readCollision(bytes: Uint8Array): CollisionMesh {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = new TextDecoder().decode(bytes.subarray(0, 4));
  if (magic !== COLLISION_MAGIC)
    throw new Error(`collision.bin: bad magic ${JSON.stringify(magic)}`);
  const version = view.getUint32(4, true);
  if (version !== COLLISION_VERSION)
    throw new Error(`collision.bin: unsupported version ${version}`);
  const triCount = view.getUint32(8, true);
  const cellSize = view.getFloat32(12, true);
  const gridMin: Vec3 = [
    view.getFloat32(16, true),
    view.getFloat32(20, true),
    view.getFloat32(24, true),
  ];
  const gridDims: Vec3 = [
    view.getUint32(28, true),
    view.getUint32(32, true),
    view.getUint32(36, true),
  ];
  const indexCount = view.getUint32(40, true);
  const cellCount = gridDims[0] * gridDims[1] * gridDims[2];
  let offset = HEADER_BYTES;
  const floats = (count: number) =>
    Float32Array.from({ length: count }, (_, i) => view.getFloat32(offset + i * 4, true));
  const uints = (count: number) =>
    Uint32Array.from({ length: count }, (_, i) => view.getUint32(offset + i * 4, true));
  const positions = floats(triCount * 9);
  offset += positions.byteLength;
  const surfaces = bytes.slice(offset, offset + triCount);
  offset += pad4(triCount);
  const cellStart = uints(cellCount + 1);
  offset += cellStart.byteLength;
  const cellTris = uints(indexCount);
  offset += cellTris.byteLength;
  if (offset !== bytes.byteLength)
    throw new Error(`collision.bin: ${bytes.byteLength - offset} trailing bytes`);
  return { positions, surfaces, cellSize, gridMin, gridDims, cellStart, cellTris };
}
