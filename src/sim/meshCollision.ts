// Mesh-track collision data (MK-98, ADR 0010): the surface codes, the `collision.bin` format and the
// uniform 3D grid index, shared by the sim (`meshTrack.ts` queries it) and the asset pipeline
// (`tools/mk8/collisionFormat.ts` writes it; Node runs those tools directly, which is why this file
// has no runtime imports). Pure: no fetch, the pack loader passes the bytes in.
//
// `collision.bin` layout (byte offsets, every section 4-byte aligned, little-endian):
//   0  magic 'MK8C'            4  version u32         8  triangle count u32
//  12  cell size f32          16  grid min f32×3     28  grid dims u32×3
//  40  index entry count u32  44  positions f32[triangles × 9]
//      surfaces u8[triangles] (zero-padded to 4)    cell starts u32[cells + 1]
//      cell triangles u32[index entries]
// Cell (x, y, z) is `x + dims.x × (y + dims.y × z)`; its triangles are
// `cellTris[cellStart[c] .. cellStart[c + 1])`, in ascending triangle order.

/** Surface codes stored per triangle, in code order (the pipeline drops `ignore` triangles). */
export const MESH_SURFACES = [
  'road',
  'offroad',
  'boost',
  'wall',
  'water',
  'antigrav',
  'glide',
  'void',
] as const;
export type MeshSurface = (typeof MESH_SURFACES)[number];
/** What a course material maps to: a surface, or `ignore` (decoration, dropped). */
export type MeshMaterialSurface = MeshSurface | 'ignore';

export const COLLISION_MAGIC = 'MK8C';
export const COLLISION_VERSION = 1;
export const COLLISION_HEADER_BYTES = 44;

/** What `collision.bin` holds. */
export interface CollisionData {
  /** 9 floats per triangle (a, b, c). */
  positions: Float32Array;
  /** Surface code (index into `MESH_SURFACES`) per triangle. */
  surfaces: Uint8Array;
  cellSize: number;
  gridMin: [number, number, number];
  gridDims: [number, number, number];
  cellStart: Uint32Array;
  cellTris: Uint32Array;
}

/** A collision mesh ready to query: the file's data plus unit face normals (3 floats each). */
export interface CollisionMesh extends CollisionData {
  normals: Float32Array;
}

// --- Building and decoding ---

/** Unit face normals (right-handed winding a → b → c), 3 floats per triangle. */
export function faceNormals(positions: Float32Array): Float32Array {
  const count = Math.floor(positions.length / 9);
  const normals = new Float32Array(count * 3);
  for (let t = 0; t < count; t += 1) {
    const o = t * 9;
    const ax = positions[o] ?? 0;
    const ay = positions[o + 1] ?? 0;
    const az = positions[o + 2] ?? 0;
    const e1x = (positions[o + 3] ?? 0) - ax;
    const e1y = (positions[o + 4] ?? 0) - ay;
    const e1z = (positions[o + 5] ?? 0) - az;
    const e2x = (positions[o + 6] ?? 0) - ax;
    const e2y = (positions[o + 7] ?? 0) - ay;
    const e2z = (positions[o + 8] ?? 0) - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    normals[t * 3] = nx / l;
    normals[t * 3 + 1] = ny / l;
    normals[t * 3 + 2] = nz / l;
  }
  return normals;
}

/** A queryable mesh from collision data (adds the face normals). */
export function collisionMesh(data: CollisionData): CollisionMesh {
  return { ...data, normals: faceNormals(data.positions) };
}

type Triple = [number, number, number];

/**
 * Uniform grid over the triangles' bounds; each cell lists the triangles whose bounding box touches
 * it, ascending. The asset pipeline (`tools/mk8/collisionFormat.ts`) builds `collision.bin` with this.
 */
export function buildCollisionGrid(
  positions: Float32Array,
  cellSize: number,
): Pick<CollisionData, 'gridMin' | 'gridDims' | 'cellStart' | 'cellTris'> {
  const triCount = Math.floor(positions.length / 9);
  const min: Triple = [Infinity, Infinity, Infinity];
  const max: Triple = [-Infinity, -Infinity, -Infinity];
  positions.forEach((v, i) => {
    const axis = i % 3;
    min[axis] = Math.min(min[axis] ?? v, v);
    max[axis] = Math.max(max[axis] ?? v, v);
  });
  if (triCount === 0) {
    min.fill(0);
    max.fill(0);
  }
  const dims = min.map((lo, a) =>
    Math.max(1, Math.ceil(((max[a] ?? lo) - lo) / cellSize)),
  ) as Triple;
  const cellOf = (value: number, axis: 0 | 1 | 2) =>
    Math.min(dims[axis] - 1, Math.max(0, Math.floor((value - min[axis]) / cellSize)));

  const cellCount = dims[0] * dims[1] * dims[2];
  const buckets: number[][] = Array.from({ length: cellCount }, () => []);
  for (let t = 0; t < triCount; t++) {
    const tri = positions.subarray(t * 9, t * 9 + 9);
    const lo: Triple = [0, 0, 0];
    const hi: Triple = [0, 0, 0];
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
  return { gridMin: min.map(Math.fround) as Triple, gridDims: dims, cellStart, cellTris };
}

/** Collision data from triangles and their surfaces, with the grid (no simplification). */
export function collisionFromTriangles(
  positions: Float32Array,
  surfaces: Uint8Array,
  cellSize: number,
): CollisionMesh {
  return collisionMesh({
    positions,
    surfaces,
    cellSize,
    ...buildCollisionGrid(positions, cellSize),
  });
}

/** An axis-aligned box, world space. */
export interface CollisionBox {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/**
 * `mesh` without the triangles whose centre lies inside one of `boxes` (MK-128: scenery a course's
 * hazards stand in for, like Thwomp Ruins' stone Thwomps), its grid rebuilt. The same mesh when
 * nothing is dropped.
 */
export function withoutTriangles(
  mesh: CollisionMesh,
  boxes: readonly CollisionBox[],
): CollisionMesh {
  const { positions } = mesh;
  const centre = (t: number, axis: number) =>
    ((positions[t * 9 + axis] ?? 0) +
      (positions[t * 9 + 3 + axis] ?? 0) +
      (positions[t * 9 + 6 + axis] ?? 0)) /
    3;
  const inside = (t: number, { min, max }: CollisionBox) => {
    const x = centre(t, 0);
    const y = centre(t, 1);
    const z = centre(t, 2);
    return x >= min.x && x <= max.x && y >= min.y && y <= max.y && z >= min.z && z <= max.z;
  };
  const keep: number[] = [];
  for (let t = 0; t < mesh.surfaces.length; t += 1)
    if (!boxes.some((box) => inside(t, box))) keep.push(t);
  if (keep.length === mesh.surfaces.length) return mesh;
  const kept = new Float32Array(keep.length * 9);
  const surfaces = new Uint8Array(keep.length);
  keep.forEach((t, i) => {
    kept.set(positions.subarray(t * 9, t * 9 + 9), i * 9);
    surfaces[i] = mesh.surfaces[t] ?? 0;
  });
  return collisionFromTriangles(kept, surfaces, mesh.cellSize);
}

const pad4 = (n: number) => (n + 3) & ~3;

/** Decodes `collision.bin` (pure: the pack loader fetches the bytes). Throws on a bad file. */
export function decodeCollision(buffer: ArrayBuffer | Uint8Array): CollisionMesh {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.byteLength < COLLISION_HEADER_BYTES)
    throw new Error(`collision.bin: ${bytes.byteLength} bytes is too short`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
  if (magic !== COLLISION_MAGIC)
    throw new Error(`collision.bin: bad magic ${JSON.stringify(magic)}`);
  const version = view.getUint32(4, true);
  if (version !== COLLISION_VERSION)
    throw new Error(`collision.bin: unsupported version ${version}`);
  const triCount = view.getUint32(8, true);
  const cellSize = view.getFloat32(12, true);
  const gridMin: Triple = [
    view.getFloat32(16, true),
    view.getFloat32(20, true),
    view.getFloat32(24, true),
  ];
  const gridDims: Triple = [
    view.getUint32(28, true),
    view.getUint32(32, true),
    view.getUint32(36, true),
  ];
  const indexCount = view.getUint32(40, true);
  const cellCount = gridDims[0] * gridDims[1] * gridDims[2];
  const expected =
    COLLISION_HEADER_BYTES + triCount * 36 + pad4(triCount) + (cellCount + 1) * 4 + indexCount * 4;
  if (expected !== bytes.byteLength)
    throw new Error(`collision.bin: ${bytes.byteLength} bytes, expected ${expected}`);
  let offset = COLLISION_HEADER_BYTES;
  const positions = new Float32Array(triCount * 9);
  for (let i = 0; i < positions.length; i += 1)
    positions[i] = view.getFloat32(offset + i * 4, true);
  offset += positions.byteLength;
  const surfaces = bytes.slice(offset, offset + triCount);
  for (const code of surfaces)
    if (code >= MESH_SURFACES.length) throw new Error(`collision.bin: unknown surface ${code}`);
  offset += pad4(triCount);
  const cellStart = new Uint32Array(cellCount + 1);
  for (let i = 0; i < cellStart.length; i += 1) cellStart[i] = view.getUint32(offset + i * 4, true);
  offset += cellStart.byteLength;
  const cellTris = new Uint32Array(indexCount);
  for (let i = 0; i < cellTris.length; i += 1) {
    const tri = view.getUint32(offset + i * 4, true);
    if (tri >= triCount) throw new Error(`collision.bin: cell entry ${i} is triangle ${tri}`);
    cellTris[i] = tri;
  }
  if ((cellStart[cellCount] ?? 0) !== indexCount)
    throw new Error('collision.bin: cell starts don’t cover the index');
  return collisionMesh({ positions, surfaces, cellSize, gridMin, gridDims, cellStart, cellTris });
}
