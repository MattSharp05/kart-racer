// MK-92 spike: course collision in the browser. Builds the same `CollisionMesh` as the MK-93
// pipeline (`tools/mk8/collision.ts`: triangles grouped by surface code, then the uniform grid)
// from parsed OBJ triangles, reads `collision.bin` files, and answers the two queries the
// surface-frame kart needs (on the sim's mesh queries since MK-98): a ray against drivable
// triangles, and walls near a point.
import {
  buildGrid,
  guessSurface,
  readCollision,
  SURFACES,
  type CollisionMesh,
  type MaterialMap,
  type MaterialSurface,
  type Surface,
} from '../../../tools/mk8/collisionFormat.ts';
import {
  collisionMesh,
  meshQueryStats,
  raycastMesh,
  resetMeshStats,
  wallContact,
  type CollisionMesh as SimCollisionMesh,
} from '../../sim/meshTrack';
import type { Vec3 } from '../../sim/math';
import type { ObjTriangles } from './obj';
import type { V3 } from './vec';

export { readCollision, SURFACES, type CollisionMesh, type Surface };

/** Grid cell edge used by the pipeline (`COLLISION_DEFAULTS.cellSize`). */
export const CELL_SIZE = 4;

export const surfaceCode = (surface: Surface): number => SURFACES.indexOf(surface);
/** Bit mask of surface codes. */
export const surfaceMask = (...surfaces: Surface[]): number =>
  surfaces.reduce((mask, s) => mask | (1 << surfaceCode(s)), 0);

/** Every surface a kart can stand on (everything except walls and the void). */
export const DRIVABLE = surfaceMask('road', 'offroad', 'boost', 'antigrav', 'glide', 'water');
export const WALLS = surfaceMask('wall');

/** Material map from the guesses in `collisionFormat.ts` (what the pipeline's stub would hold). */
export function guessMaterials(materials: string[]): MaterialMap {
  return Object.fromEntries(materials.map((m) => [m, guessSurface(m)]));
}

/**
 * Collision mesh from OBJ triangles, as `buildCollision` makes it without simplification:
 * dropped `ignore` materials, triangles in surface-code order (then material first-use order),
 * then the grid.
 */
export function collisionFromObj(
  obj: ObjTriangles,
  materials: MaterialMap,
  fallback: MaterialSurface = 'road',
  cellSize = CELL_SIZE,
): CollisionMesh {
  const positions: number[] = [];
  const surfaces: number[] = [];
  SURFACES.forEach((surface, code) => {
    obj.materials.forEach((name, i) => {
      if ((materials[name] ?? fallback) !== surface) return;
      const tris = obj.positions[i];
      if (!tris) return;
      for (const v of tris) positions.push(v);
      for (let t = 0; t < tris.length / 9; t++) surfaces.push(code);
    });
  });
  const pos = new Float32Array(positions);
  return {
    positions: pos,
    surfaces: new Uint8Array(surfaces),
    cellSize,
    ...buildGrid(pos, cellSize),
  };
}

export interface RayHit {
  /** Distance along the ray. */
  t: number;
  tri: number;
  surface: number;
  point: V3;
  /** Unit face normal, turned to face the ray's origin. */
  normal: V3;
}

const vec = (v: V3): Vec3 => ({ x: v[0], y: v[1], z: v[2] });
const tuple = (v: Vec3): V3 => [v.x, v.y, v.z];

/**
 * The spike's view of a collision mesh, on the sim's queries (`src/sim/meshTrack.ts`, MK-98: the
 * ray and wall code that lived here was productionized there).
 */
export class CollisionWorld {
  readonly mesh: SimCollisionMesh;

  constructor(mesh: CollisionMesh) {
    this.mesh = collisionMesh(mesh);
  }

  get triangleCount(): number {
    return this.mesh.surfaces.length;
  }

  /** Triangles tested by queries since it was last set to 0. */
  get tested(): number {
    return meshQueryStats(this.mesh).tested;
  }

  set tested(_zero: number) {
    resetMeshStats(this.mesh);
  }

  /** Nearest triangle (whose surface is in `mask`) hit by the ray `o + d·t`, 0 ≤ t ≤ maxT. */
  raycast(o: V3, d: V3, maxT: number, mask: number): RayHit | null {
    const hit = raycastMesh(this.mesh, vec(o), vec(d), maxT, mask);
    if (!hit) return null;
    return {
      t: hit.distance,
      tri: hit.triangle,
      surface: this.mesh.surfaces[hit.triangle] ?? 0,
      point: tuple(hit.point),
      normal: tuple(hit.normal),
    };
  }

  /** Walls within `radius` of `c`, resolved in the plane perpendicular to `up`. */
  wallContact(c: V3, radius: number, up: V3): { push: V3; normal: V3 } | null {
    const contact = wallContact(this.mesh, vec(c), radius, vec(up), WALLS);
    return contact && { push: tuple(contact.push), normal: tuple(contact.normal) };
  }
}
