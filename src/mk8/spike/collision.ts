// MK-92 spike: course collision in the browser. Builds the same `CollisionMesh` as the MK-93
// pipeline (`tools/mk8/collision.ts`: triangles grouped by surface code, then the uniform grid)
// from parsed OBJ triangles, reads `collision.bin` files, and answers the two queries the
// surface-frame kart needs: a ray against drivable triangles, and walls near a point.
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

const EPS = 1e-9;

/** Grid queries over a collision mesh. Not re-entrant (one shared visit stamp). */
export class CollisionWorld {
  readonly normals: Float32Array;
  private readonly stamp: Uint32Array;
  private query = 0;
  /** Triangles tested by the last queries (reset by `resetStats`). */
  tested = 0;

  constructor(readonly mesh: CollisionMesh) {
    const count = mesh.surfaces.length;
    this.stamp = new Uint32Array(count);
    this.normals = new Float32Array(count * 3);
    const p = mesh.positions;
    for (let t = 0; t < count; t++) {
      const o = t * 9;
      const e1x = (p[o + 3] ?? 0) - (p[o] ?? 0);
      const e1y = (p[o + 4] ?? 0) - (p[o + 1] ?? 0);
      const e1z = (p[o + 5] ?? 0) - (p[o + 2] ?? 0);
      const e2x = (p[o + 6] ?? 0) - (p[o] ?? 0);
      const e2y = (p[o + 7] ?? 0) - (p[o + 1] ?? 0);
      const e2z = (p[o + 8] ?? 0) - (p[o + 2] ?? 0);
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;
      const l = Math.hypot(nx, ny, nz) || 1;
      this.normals.set([nx / l, ny / l, nz / l], t * 3);
    }
  }

  get triangleCount(): number {
    return this.mesh.surfaces.length;
  }

  /** Visits each triangle (once) in the grid cells overlapping the box; stops if `visit` returns true. */
  private forEachInBox(lo: V3, hi: V3, visit: (tri: number) => void): void {
    const { gridMin, gridDims, cellSize, cellStart, cellTris } = this.mesh;
    const range = (axis: 0 | 1 | 2) => {
      const a = Math.floor((lo[axis] - gridMin[axis]) / cellSize);
      const b = Math.floor((hi[axis] - gridMin[axis]) / cellSize);
      return [Math.max(0, a), Math.min(gridDims[axis] - 1, b)] as const;
    };
    const [x0, x1] = range(0);
    const [y0, y1] = range(1);
    const [z0, z1] = range(2);
    if (x0 > x1 || y0 > y1 || z0 > z1) return;
    const q = ++this.query;
    for (let z = z0; z <= z1; z++)
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const cell = x + gridDims[0] * (y + gridDims[1] * z);
          const end = cellStart[cell + 1] ?? 0;
          for (let i = cellStart[cell] ?? 0; i < end; i++) {
            const tri = cellTris[i] ?? 0;
            if (this.stamp[tri] === q) continue;
            this.stamp[tri] = q;
            visit(tri);
          }
        }
  }

  /** Nearest triangle (whose surface is in `mask`) hit by the ray `o + d·t`, 0 ≤ t ≤ maxT. */
  raycast(o: V3, d: V3, maxT: number, mask: number): RayHit | null {
    const end: V3 = [o[0] + d[0] * maxT, o[1] + d[1] * maxT, o[2] + d[2] * maxT];
    const lo: V3 = [Math.min(o[0], end[0]), Math.min(o[1], end[1]), Math.min(o[2], end[2])];
    const hi: V3 = [Math.max(o[0], end[0]), Math.max(o[1], end[1]), Math.max(o[2], end[2])];
    const p = this.mesh.positions;
    const surfaces = this.mesh.surfaces;
    let bestT = maxT;
    let best = -1;
    this.forEachInBox(lo, hi, (tri) => {
      if (((1 << (surfaces[tri] ?? 0)) & mask) === 0) return;
      this.tested++;
      // Möller–Trumbore, two-sided.
      const i = tri * 9;
      const ax = p[i] ?? 0;
      const ay = p[i + 1] ?? 0;
      const az = p[i + 2] ?? 0;
      const e1x = (p[i + 3] ?? 0) - ax;
      const e1y = (p[i + 4] ?? 0) - ay;
      const e1z = (p[i + 5] ?? 0) - az;
      const e2x = (p[i + 6] ?? 0) - ax;
      const e2y = (p[i + 7] ?? 0) - ay;
      const e2z = (p[i + 8] ?? 0) - az;
      const px = d[1] * e2z - d[2] * e2y;
      const py = d[2] * e2x - d[0] * e2z;
      const pz = d[0] * e2y - d[1] * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (det > -EPS && det < EPS) return;
      const inv = 1 / det;
      const sx = o[0] - ax;
      const sy = o[1] - ay;
      const sz = o[2] - az;
      const u = (sx * px + sy * py + sz * pz) * inv;
      if (u < 0 || u > 1) return;
      const qx = sy * e1z - sz * e1y;
      const qy = sz * e1x - sx * e1z;
      const qz = sx * e1y - sy * e1x;
      const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
      if (v < 0 || u + v > 1) return;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t < 0 || t >= bestT) return;
      bestT = t;
      best = tri;
    });
    if (best < 0) return null;
    const n = this.normals;
    let normal: V3 = [n[best * 3] ?? 0, n[best * 3 + 1] ?? 1, n[best * 3 + 2] ?? 0];
    if (normal[0] * d[0] + normal[1] * d[1] + normal[2] * d[2] > 0)
      normal = [-normal[0], -normal[1], -normal[2]];
    return {
      t: bestT,
      tri: best,
      surface: surfaces[best] ?? 0,
      point: [o[0] + d[0] * bestT, o[1] + d[1] * bestT, o[2] + d[2] * bestT],
      normal,
    };
  }

  /** Closest points on wall triangles within `radius` of `c`: each wall's push-out vector. */
  wallContacts(c: V3, radius: number, mask = WALLS): { push: V3; normal: V3 }[] {
    const lo: V3 = [c[0] - radius, c[1] - radius, c[2] - radius];
    const hi: V3 = [c[0] + radius, c[1] + radius, c[2] + radius];
    const out: { push: V3; normal: V3 }[] = [];
    const p = this.mesh.positions;
    const surfaces = this.mesh.surfaces;
    this.forEachInBox(lo, hi, (tri) => {
      if (((1 << (surfaces[tri] ?? 0)) & mask) === 0) return;
      this.tested++;
      const i = tri * 9;
      const q = closestOnTriangle(
        c,
        [p[i] ?? 0, p[i + 1] ?? 0, p[i + 2] ?? 0],
        [p[i + 3] ?? 0, p[i + 4] ?? 0, p[i + 5] ?? 0],
        [p[i + 6] ?? 0, p[i + 7] ?? 0, p[i + 8] ?? 0],
      );
      const dx = c[0] - q[0];
      const dy = c[1] - q[1];
      const dz = c[2] - q[2];
      const dist = Math.hypot(dx, dy, dz);
      if (dist >= radius || dist < EPS) return;
      const k = 1 / dist;
      out.push({
        push: [dx * k * (radius - dist), dy * k * (radius - dist), dz * k * (radius - dist)],
        normal: [dx * k, dy * k, dz * k],
      });
    });
    return out;
  }
}

/** Closest point on triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5). */
export function closestOnTriangle(p: V3, a: V3, b: V3, c: V3): V3 {
  const ab: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const ap: V3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dot = (u: V3, v: V3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const at = (s: V3, u: V3, k: number): V3 => [s[0] + u[0] * k, s[1] + u[1] * k, s[2] + u[2] * k];
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp: V3 = [p[0] - b[0], p[1] - b[1], p[2] - b[2]];
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(a, ab, d1 / (d1 - d3));
  const cp: V3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(a, ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const bc: V3 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    return at(b, bc, (d4 - d3) / (d4 - d3 + (d5 - d6)));
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}
