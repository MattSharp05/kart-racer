// Course collision export (MK-93, ADR 0010): the course mesh's triangles, each tagged with a
// surface from the course's material map, plus a uniform 3D grid index, in one little-endian
// binary (`collision.bin`). The format, grid and surface guesses live in `collisionFormat.ts`
// (browser-safe); this file collects and simplifies the triangles from the glTF document.
import type { Document } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';
import {
  buildGrid,
  guessSurface,
  SURFACES,
  type CollisionMesh,
  type MaterialMap,
  type MaterialSurface,
  type Surface,
} from './collisionFormat.ts';

export * from './collisionFormat.ts';

/** Primitive mode 4 = TRIANGLES (glTF). */
const TRIANGLES = 4;

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
  // MK-92: 4 m cells halve the 8-kart ground query cost of 8 m cells for ~10–20 % more bytes.
  cellSize: 4,
  maxTriangles: 25_000,
  simplifyError: 0.002,
};

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
