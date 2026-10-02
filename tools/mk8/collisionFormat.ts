// Course collision format (MK-93, ADR 0010): the browser-safe half of the collision export —
// surface codes, the material-name guesses, the uniform 3D grid index and the little-endian
// `collision.bin` reader/writer. No Node or glTF imports, so the MK-92 anti-gravity spike
// (`src/mk8/spike/`) builds and reads collision with this exact code; `collision.ts` adds the
// glTF side (collecting and simplifying triangles). MK-98 moved the surface codes, the grid and the
// reader into the sim (`src/sim/meshTrack.ts`: `buildCollisionGrid`, `decodeCollision`), so the
// pipeline and the race read one implementation; this keeps the writer and the material guesses.
//
// Layout (byte offsets from the start; every section 4-byte aligned):
//   0  magic 'MK8C'            4  version u32         8  triangle count u32
//  12  cell size f32          16  grid min f32×3     28  grid dims u32×3
//  40  index entry count u32  44  positions f32[triangles × 9]
//      surfaces u8[triangles] (zero-padded to 4)    cell starts u32[cells + 1]
//      cell triangles u32[index entries]
// Cell (x, y, z) is `x + dims.x × (y + dims.y × z)`; its triangles are
// `cellTris[cellStart[c] .. cellStart[c + 1])`, in ascending triangle order.

import {
  buildCollisionGrid,
  COLLISION_HEADER_BYTES as HEADER_BYTES,
  COLLISION_MAGIC,
  COLLISION_VERSION,
  decodeCollision,
  MESH_SURFACES,
  type CollisionData,
  type MeshMaterialSurface,
  type MeshSurface,
} from '../../src/sim/meshCollision.ts';

export { COLLISION_MAGIC, COLLISION_VERSION };

/** Surface codes stored per triangle; `ignore` is never stored (those triangles are dropped). */
export const SURFACES = MESH_SURFACES;
export type Surface = MeshSurface;
export type MaterialSurface = MeshMaterialSurface;
export type MaterialMap = Record<string, MaterialSurface>;

/** What `collision.bin` holds (the sim's `CollisionData`; the sim adds face normals on load). */
export type CollisionMesh = CollisionData;

/**
 * Material-name rules for the per-course material map stub, first match wins. MK-92 added
 * `antigrav` (and `deco`/`shadow`/`bg` decoration); the names are a proposal until a real course's
 * materials have been checked (see `src/mk8/spike/NOTES.md`).
 */
export const SURFACE_RULES: readonly [RegExp, MaterialSurface][] = [
  [
    /sky|cloud|tree|leaf|leaves|crowd|audience|flag|banner|light|effect|fx|deco|shadow|^bg/,
    'ignore',
  ],
  [/water|sea|river|lake|pool/, 'water'],
  [/dash|boost/, 'boost'],
  [/wall|fence|rail|barrier|guard/, 'wall'],
  [/grass|dirt|sand|mud|gravel|offroad|rough/, 'offroad'],
  [/anti.?grav|zero.?g/, 'antigrav'],
  [/glide|jump/, 'glide'],
];

/** Guess a surface from a material name, for the per-course material map stub. */
export function guessSurface(material: string): MaterialSurface {
  const name = material.toLowerCase();
  for (const [pattern, surface] of SURFACE_RULES) if (pattern.test(name)) return surface;
  return 'road';
}

/** Uniform grid over the triangles' bounds; each cell lists the triangles whose box touches it. */
export const buildGrid = buildCollisionGrid;

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

/** Parses `collision.bin` (the sim's `decodeCollision`, without the face normals it adds). */
export function readCollision(bytes: Uint8Array): CollisionMesh {
  const { positions, surfaces, cellSize, gridMin, gridDims, cellStart, cellTris } =
    decodeCollision(bytes);
  return { positions, surfaces, cellSize, gridMin, gridDims, cellStart, cellTris };
}
