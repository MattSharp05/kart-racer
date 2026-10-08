// Mesh tracks (MK-98, ADR 0010): a course's road is its collision mesh (`meshCollision.ts`), not a
// spline. These are the queries physics, items and AI ask of it: the ground under a kart along its
// `up`, the walls around it and, via the route, water and lap progress. Productionized from the
// MK-92 spike (`src/mk8/spike/`). Pure and deterministic: no closures in the hot loops, cells
// visited in index order and triangles in ascending order, ties go to the lower triangle.
import type { Vec3 } from './math';
import { MESH_SURFACES, type CollisionMesh, type MeshSurface } from './meshCollision';
import type { HazardDef } from './hazards/types';
import type { RouteDef } from './route';
import { tuning } from './tuning';

type Triple = [number, number, number];

export * from './meshCollision';
export { inWater, progressAt } from './route';

/**
 * A track whose road is a collision mesh (ADR 0010). Not registered in `src/content/tracks/`: the
 * MK8 pack loader fetches `collision.bin`, decodes it (`decodeCollision`) and passes this in.
 */
export interface MeshTrackDef {
  id: string;
  kind: 'mesh';
  collision: CollisionMesh;
  route: RouteDef;
  /** Hazards on the course (MK-124: Thwomp Ruins' Thwomps); poses a pure function of tick. */
  hazards?: HazardDef[];
  /**
   * How many times its authored size the course is drawn and driven (MK-105 revisit: MK8 courses
   * at 3×, `sim/meshScale.ts`). The fall limits grow with it (`meshFallLimits`). Default 1.
   */
  scale?: number;
}

/**
 * When a kart on `track` counts as fallen: landed more than `depth` m below the road, or in the
 * air longer than `airSeconds` (`glideSeconds` gliding). On a scaled course drops are `scale`
 * times deeper (free fall from them lasts √`scale` times longer) and glides `scale` times longer.
 */
export function meshFallLimits(track: MeshTrackDef): {
  depth: number;
  airSeconds: number;
  glideSeconds: number;
} {
  const scale = track.scale ?? 1;
  return {
    depth: tuning.fallDepth * scale,
    airSeconds: tuning.mk8.fallSeconds * Math.sqrt(scale),
    glideSeconds: tuning.mk8.glide.fallSeconds * scale,
  };
}

/** Bit mask of surfaces, for the `mask` argument of the queries. */
export function surfaceMask(...surfaces: MeshSurface[]): number {
  let mask = 0;
  for (const surface of surfaces) mask |= 1 << MESH_SURFACES.indexOf(surface);
  return mask;
}

/**
 * What a kart can stand on. Not walls; not water either (water triangles are the water's surface:
 * you drive through it on the bed below, and `inWater` says you're under). `void` is included so a
 * kart falling onto a kill floor sees it.
 */
export const GROUND_SURFACES = surfaceMask('road', 'offroad', 'boost', 'antigrav', 'glide', 'void');
export const WALL_SURFACES = surfaceMask('wall');

/** Ray hits within this of a triangle's edge (barycentric) count, so no ray slips between two. */
const EDGE_EPSILON = 1e-7;
/** Rays this close to parallel with a triangle miss it. */
const PARALLEL_EPSILON = 1e-12;
/** A wall contact whose in-plane part is under this fraction of the radius pushes nowhere. */
const FLAT_EPSILON = 1e-3;

// --- Queries ---

/**
 * Per-mesh scratch: a visit stamp per triangle, so a triangle in several cells is tested once per
 * query. Only ever written inside one query, so results don't depend on what ran before.
 */
interface Scratch {
  stamp: Uint32Array;
  query: number;
  /** Triangles tested since `resetMeshStats` (for benchmarks). */
  tested: number;
  /** Wall contacts of the current query, deepest first: in-plane normal (3) and depth (1) each. */
  contacts: Float64Array;
}

/** `wallContact` resolves at most this many touching triangles (the deepest). */
const MAX_WALL_CONTACTS = 16;
const scratches = new WeakMap<CollisionMesh, Scratch>();

function scratchOf(mesh: CollisionMesh): Scratch {
  let scratch = scratches.get(mesh);
  if (!scratch) {
    scratch = {
      stamp: new Uint32Array(mesh.surfaces.length),
      query: 0,
      tested: 0,
      contacts: new Float64Array(MAX_WALL_CONTACTS * 4),
    };
    scratches.set(mesh, scratch);
  }
  return scratch;
}

function nextQuery(scratch: Scratch): number {
  if (scratch.query >= 0xffffffff) {
    scratch.stamp.fill(0);
    scratch.query = 0;
  }
  scratch.query += 1;
  return scratch.query;
}

/** Triangles tested by queries on `mesh` since the last reset (benchmarks only). */
export function meshQueryStats(mesh: CollisionMesh): { tested: number } {
  return { tested: scratchOf(mesh).tested };
}

export function resetMeshStats(mesh: CollisionMesh): void {
  scratchOf(mesh).tested = 0;
}

/** Inclusive grid cell range covering [lo, hi] on one axis, clamped; `null` if outside. */
function cellRange(mesh: CollisionMesh, axis: 0 | 1 | 2, lo: number, hi: number): Triple | null {
  const a = Math.floor((lo - mesh.gridMin[axis]) / mesh.cellSize);
  const b = Math.floor((hi - mesh.gridMin[axis]) / mesh.cellSize);
  const from = Math.max(0, a);
  const to = Math.min(mesh.gridDims[axis] - 1, b);
  return from > to ? null : [from, to, 0];
}

export interface MeshRayHit {
  /** Distance along the (unit) ray. */
  distance: number;
  triangle: number;
  surface: MeshSurface;
  point: Vec3;
  /** Unit face normal, turned to face the ray's origin. */
  normal: Vec3;
}

/**
 * Nearest triangle with a surface in `mask` hit by the ray `origin + direction · d`,
 * 0 ≤ d ≤ `maxDistance` (`direction` unit). Two-sided; equal distances go to the lower triangle.
 */
export function raycastMesh(
  mesh: CollisionMesh,
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  mask: number,
): MeshRayHit | null {
  const ox = origin.x;
  const oy = origin.y;
  const oz = origin.z;
  const dx = direction.x;
  const dy = direction.y;
  const dz = direction.z;
  const ex = ox + dx * maxDistance;
  const ey = oy + dy * maxDistance;
  const ez = oz + dz * maxDistance;
  const xs = cellRange(mesh, 0, Math.min(ox, ex), Math.max(ox, ex));
  const ys = cellRange(mesh, 1, Math.min(oy, ey), Math.max(oy, ey));
  const zs = cellRange(mesh, 2, Math.min(oz, ez), Math.max(oz, ez));
  if (!xs || !ys || !zs) return null;
  const { positions: p, surfaces, cellStart, cellTris, gridDims } = mesh;
  const scratch = scratchOf(mesh);
  const q = nextQuery(scratch);
  const stamp = scratch.stamp;
  let bestT = maxDistance;
  let best = -1;
  for (let z = zs[0]; z <= zs[1]; z++)
    for (let y = ys[0]; y <= ys[1]; y++)
      for (let x = xs[0]; x <= xs[1]; x++) {
        const cell = x + gridDims[0] * (y + gridDims[1] * z);
        const end = cellStart[cell + 1] ?? 0;
        for (let k = cellStart[cell] ?? 0; k < end; k++) {
          const tri = cellTris[k] ?? 0;
          if (stamp[tri] === q) continue;
          stamp[tri] = q;
          if (((1 << (surfaces[tri] ?? 0)) & mask) === 0) continue;
          scratch.tested++;
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
          const px = dy * e2z - dz * e2y;
          const py = dz * e2x - dx * e2z;
          const pz = dx * e2y - dy * e2x;
          const det = e1x * px + e1y * py + e1z * pz;
          if (det > -PARALLEL_EPSILON && det < PARALLEL_EPSILON) continue;
          const inv = 1 / det;
          const sx = ox - ax;
          const sy = oy - ay;
          const sz = oz - az;
          const u = (sx * px + sy * py + sz * pz) * inv;
          if (u < -EDGE_EPSILON || u > 1 + EDGE_EPSILON) continue;
          const qx = sy * e1z - sz * e1y;
          const qy = sz * e1x - sx * e1z;
          const qz = sx * e1y - sy * e1x;
          const v = (dx * qx + dy * qy + dz * qz) * inv;
          if (v < -EDGE_EPSILON || u + v > 1 + EDGE_EPSILON) continue;
          const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
          if (t < 0 || t > bestT || (t === bestT && best >= 0 && tri > best)) continue;
          bestT = t;
          best = tri;
        }
      }
  if (best < 0) return null;
  const n = mesh.normals;
  let nx = n[best * 3] ?? 0;
  let ny = n[best * 3 + 1] ?? 0;
  let nz = n[best * 3 + 2] ?? 0;
  if (nx * dx + ny * dy + nz * dz > 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  return {
    distance: bestT,
    triangle: best,
    surface: MESH_SURFACES[surfaces[best] ?? 0] ?? 'road',
    point: { x: ox + dx * bestT, y: oy + dy * bestT, z: oz + dz * bestT },
    // `+ 0` turns −0 into 0, so a flipped flat normal compares equal to (0, 1, 0).
    normal: { x: nx + 0, y: ny + 0, z: nz + 0 },
  };
}

export interface MeshGround {
  /** Where the ray along −up met the ground. */
  point: Vec3;
  /** How far `position` is above that point along `up`, m (negative: sunk into it). */
  height: number;
  surface: MeshSurface;
  /** Unit face normal on the side the kart is on. */
  normal: Vec3;
  triangle: number;
}

/**
 * The ground under `position` along −`up` (unit): cast from `tuning.meshTrack.groundProbeUp`
 * above to `groundProbeDown` below. `null` when there's none in reach (in the air).
 */
export function groundAt(
  mesh: CollisionMesh,
  position: Vec3,
  up: Vec3,
  mask = GROUND_SURFACES,
): MeshGround | null {
  const { groundProbeUp, groundProbeDown } = tuning.meshTrack;
  const origin = {
    x: position.x + up.x * groundProbeUp,
    y: position.y + up.y * groundProbeUp,
    z: position.z + up.z * groundProbeUp,
  };
  const down = { x: -up.x, y: -up.y, z: -up.z };
  const hit = raycastMesh(mesh, origin, down, groundProbeUp + groundProbeDown, mask);
  if (!hit) return null;
  return {
    point: hit.point,
    height: hit.distance - groundProbeUp,
    surface: hit.surface,
    normal: hit.normal,
    triangle: hit.triangle,
  };
}

export interface WallContact {
  /** Move the position by this to stand clear of every wall touched (perpendicular to `up`). */
  push: Vec3;
  /** Unit direction of `push`: the combined wall normal, facing the kart. */
  normal: Vec3;
  /** Wall triangles touched. */
  contacts: number;
}

/** The highest corner of triangle `o` (offset into `p`) above (cx, cy, cz) along `up`, m. */
function topAlong(
  p: Float32Array,
  o: number,
  cx: number,
  cy: number,
  cz: number,
  up: Vec3,
): number {
  let top = -Infinity;
  for (let k = 0; k < 9; k += 3) {
    const h =
      ((p[o + k] ?? 0) - cx) * up.x +
      ((p[o + k + 1] ?? 0) - cy) * up.y +
      ((p[o + k + 2] ?? 0) - cz) * up.z;
    if (h > top) top = h;
  }
  return top;
}

/**
 * Walls (surfaces in `mask`) within `radius` of `position`, resolved in the road plane (walls push
 * sideways, never lift a kart off the road, so the part along `up` is dropped). Each touching
 * triangle adds only what the push so far doesn't already cover along its normal, so two triangles
 * of one flat wall push once. A wall triangle whose highest corner is more than `below` under
 * `position` along `up` doesn't push (MK-123: a step the kart rolls over, like the face under a
 * glide ramp's lip; a tall barrier always pushes, banked or not). `null` when nothing touches.
 */
export function wallContact(
  mesh: CollisionMesh,
  position: Vec3,
  radius: number,
  up: Vec3,
  mask = WALL_SURFACES,
  below = Infinity,
): WallContact | null {
  const cx = position.x;
  const cy = position.y;
  const cz = position.z;
  const xs = cellRange(mesh, 0, cx - radius, cx + radius);
  const ys = cellRange(mesh, 1, cy - radius, cy + radius);
  const zs = cellRange(mesh, 2, cz - radius, cz + radius);
  if (!xs || !ys || !zs) return null;
  const { positions: p, surfaces, cellStart, cellTris, gridDims } = mesh;
  const scratch = scratchOf(mesh);
  const q = nextQuery(scratch);
  const stamp = scratch.stamp;
  const kept = scratch.contacts;
  let contacts = 0;
  let count = 0;
  const closest: Triple = [0, 0, 0];
  for (let z = zs[0]; z <= zs[1]; z++)
    for (let y = ys[0]; y <= ys[1]; y++)
      for (let x = xs[0]; x <= xs[1]; x++) {
        const cell = x + gridDims[0] * (y + gridDims[1] * z);
        const end = cellStart[cell + 1] ?? 0;
        for (let k = cellStart[cell] ?? 0; k < end; k++) {
          const tri = cellTris[k] ?? 0;
          if (stamp[tri] === q) continue;
          stamp[tri] = q;
          if (((1 << (surfaces[tri] ?? 0)) & mask) === 0) continue;
          scratch.tested++;
          closestOnTriangle(p, tri * 9, cx, cy, cz, closest);
          let nx = cx - closest[0];
          let ny = cy - closest[1];
          let nz = cz - closest[2];
          const dist = Math.sqrt(nx * nx + ny * ny + nz * nz);
          if (dist >= radius || dist < PARALLEL_EPSILON) continue;
          // A wall whose top is more than `below` under the centre is a step the kart rolls over.
          if (below !== Infinity && topAlong(p, tri * 9, cx, cy, cz, up) < -below) continue;
          // In the road plane only.
          const along = nx * up.x + ny * up.y + nz * up.z;
          nx -= up.x * along;
          ny -= up.y * along;
          nz -= up.z * along;
          const flat = Math.sqrt(nx * nx + ny * ny + nz * nz);
          // Straight above or below a wall's edge: no sideways push.
          if (flat < radius * FLAT_EPSILON) continue;
          contacts++;
          // Keep the deepest contacts, deepest first (equal depths in visiting order).
          const depth = radius - dist;
          let slot = count;
          while (slot > 0 && (kept[(slot - 1) * 4 + 3] ?? 0) < depth) slot--;
          if (slot >= MAX_WALL_CONTACTS) continue;
          kept.copyWithin((slot + 1) * 4, slot * 4, Math.min(count, MAX_WALL_CONTACTS - 1) * 4);
          kept[slot * 4] = nx / flat;
          kept[slot * 4 + 1] = ny / flat;
          kept[slot * 4 + 2] = nz / flat;
          kept[slot * 4 + 3] = depth;
          count = Math.min(count + 1, MAX_WALL_CONTACTS);
        }
      }
  // Deepest first, each contact adds only what the push so far doesn't cover along its normal: a
  // neighbouring triangle of the same flat wall, touched at its edge, then adds nothing (for
  // penetrations up to half the radius).
  let pushX = 0;
  let pushY = 0;
  let pushZ = 0;
  for (let i = 0; i < count; i++) {
    const nx = kept[i * 4] ?? 0;
    const ny = kept[i * 4 + 1] ?? 0;
    const nz = kept[i * 4 + 2] ?? 0;
    const extra = (kept[i * 4 + 3] ?? 0) - (pushX * nx + pushY * ny + pushZ * nz);
    if (extra <= 0) continue;
    pushX += nx * extra;
    pushY += ny * extra;
    pushZ += nz * extra;
  }
  if (contacts === 0) return null;
  const l = Math.sqrt(pushX * pushX + pushY * pushY + pushZ * pushZ) || 1;
  return {
    push: { x: pushX + 0, y: pushY + 0, z: pushZ + 0 },
    normal: { x: pushX / l + 0, y: pushY / l + 0, z: pushZ / l + 0 },
    contacts,
  };
}

/**
 * Closest point on triangle `p[o..o+9]` to (px, py, pz), written to `out` (Ericson, Real-Time
 * Collision Detection 5.1.5).
 */
function closestOnTriangle(
  p: Float32Array,
  o: number,
  px: number,
  py: number,
  pz: number,
  out: Triple,
): void {
  const ax = p[o] ?? 0;
  const ay = p[o + 1] ?? 0;
  const az = p[o + 2] ?? 0;
  const bx = p[o + 3] ?? 0;
  const by = p[o + 4] ?? 0;
  const bz = p[o + 5] ?? 0;
  const cx = p[o + 6] ?? 0;
  const cy = p[o + 7] ?? 0;
  const cz = p[o + 8] ?? 0;
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  // Barycentric weights (v on ab, w on ac) of the closest point, by Voronoi region.
  let v = 0;
  let w = 0;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  const bpx = px - bx;
  const bpy = py - by;
  const bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  const cpx = px - cx;
  const cpy = py - cy;
  const cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  const vc = d1 * d4 - d3 * d2;
  const vb = d5 * d2 - d1 * d6;
  const va = d3 * d6 - d5 * d4;
  if (d1 <= 0 && d2 <= 0) {
    // Vertex a.
  } else if (d3 >= 0 && d4 <= d3) v = 1;
  else if (vc <= 0 && d1 >= 0 && d3 <= 0) v = d1 / (d1 - d3);
  else if (d6 >= 0 && d5 <= d6) w = 1;
  else if (vb <= 0 && d2 >= 0 && d6 <= 0) w = d2 / (d2 - d6);
  else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    // Edge bc.
    w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    v = 1 - w;
  } else {
    const denom = 1 / (va + vb + vc);
    v = vb * denom;
    w = vc * denom;
  }
  out[0] = ax + abx * v + acx * w;
  out[1] = ay + aby * v + acy * w;
  out[2] = az + abz * v + acz * w;
}
