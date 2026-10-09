// Scaling a mesh track (MK-105 revisit, B2): MK8 courses come out of the pack about a third of the
// size our karts need ("we can barely fit the cars on the road"), so a course is scaled up once, as
// it becomes a track: its collision, its route's metres and its hazards' positions, by one factor
// (the model is scaled by the same factor where it's drawn, `src/mk8/courses.ts`). What's authored
// (`route.ts`, the track editor) stays in the pack's units. Pure.
import type { HazardDef } from './hazards/types';
import { add, normalize, scale as scaleVec, sub, type Vec3 } from './math';
import type { CollisionMesh } from './meshCollision';
import { raycastMesh, surfaceMask } from './meshTrack';
import { routeGeometry, type RouteDef, type RoutePoint, type RouteZone } from './route';
import { catmullRom, inRange } from './splineTrack';

/**
 * The collision mesh `factor` times bigger about the origin. The grid scales with it, so every
 * cell keeps its triangles (no rebuild); face normals are unchanged by a uniform scale.
 */
export function scaleCollision(mesh: CollisionMesh, factor: number): CollisionMesh {
  if (factor === 1) return mesh;
  const positions = new Float32Array(mesh.positions.length);
  for (let i = 0; i < positions.length; i += 1) positions[i] = (mesh.positions[i] ?? 0) * factor;
  return {
    ...mesh,
    positions,
    cellSize: mesh.cellSize * factor,
    gridMin: [mesh.gridMin[0] * factor, mesh.gridMin[1] * factor, mesh.gridMin[2] * factor],
  };
}

/**
 * The route `factor` times bigger: points, widths, racing line and every sideways offset (grid,
 * item boxes, coins), water volumes and bumpers. Lap fractions (`t`, checkpoints, zone ranges,
 * respawns) and the road's up stay as they are.
 */
export function scaleRoute(route: RouteDef, factor: number): RouteDef {
  if (factor === 1) return route;
  return {
    ...route,
    points: route.points.map((p) => ({
      ...p,
      x: p.x * factor,
      y: p.y * factor,
      z: p.z * factor,
      width: p.width * factor,
      ...(p.racingLine !== undefined && { racingLine: p.racingLine * factor }),
    })),
    gridSlots: route.gridSlots.map((g) => ({ ...g, lateral: g.lateral * factor })),
    itemBoxRows: route.itemBoxRows.map((r) => ({
      ...r,
      laterals: r.laterals.map((l) => l * factor),
    })),
    coinLines: route.coinLines.map((c) => ({ ...c, lateral: c.lateral * factor })),
    zones: route.zones.map((z) => scaleZone(z, factor)),
  };
}

function scaleZone(zone: RouteZone, factor: number): RouteZone {
  switch (zone.kind) {
    case 'water':
      return { ...zone, min: scaleVec(zone.min, factor), max: scaleVec(zone.max, factor) };
    case 'boostBumper':
      return { ...zone, position: scaleVec(zone.position, factor), radius: zone.radius * factor };
    default:
      return zone;
  }
}

/**
 * A course hazard moved to where it is on the scaled course. Only its place scales: its size and
 * timing are tuned to the karts, which keep theirs.
 */
export function scaleHazard(hazard: HazardDef, factor: number): HazardDef {
  if (factor === 1) return hazard;
  switch (hazard.kind) {
    case 'mover':
      return { ...hazard, path: hazard.path.map((p) => scaleVec(p, factor)) };
    case 'rotator':
    case 'periodic':
    case 'zoneEffect':
      return { ...hazard, centre: scaleVec(hazard.centre, factor) };
    default:
      // No MK8 course has a sway deck: its ends would need moving too.
      throw new Error(`scaleHazard: ${hazard.kind} can't be scaled yet`);
  }
}

/** A route point further than this from the ground mid-way between its neighbours gets one, m. */
const CONFORM_TOLERANCE = 0.3;
/**
 * The authored routes keep within this of their road in the pack's units, m: scaled, the ground
 * is looked for this × the factor either way along the road's up (a uniform scale scales the
 * curve's distance from the road by the same factor), never as far as another level of road.
 */
const CONFORM_REACH = 1.2;
/** At most this many rounds of halving (each round halves the spans still off the ground). */
const CONFORM_PASSES = 4;
/** What the route conforms to: what karts drive on (not water surfaces, walls or the void). */
const CONFORM_GROUND = surfaceMask('road', 'offroad', 'boost', 'antigrav', 'glide');

/**
 * The route with points added where its curve leaves the road between two of its points (MK-105
 * revisit): authored a few metres apart on the pack's course, scaled 3× its spans sag or bulge
 * up to ~3 m off the road (3× their ~1 m), and the coins, item boxes and grid placed on it with them. Each span
 * whose middle is more than `CONFORM_TOLERANCE` from the ground gets a point on the ground there
 * (its width, up and racing line between its neighbours'), until none is. Spans over jumps and
 * glides (a respawn range or a glide zone) fly on purpose and are left alone, as are spans with
 * no ground near them. Lap fractions are moved with the curve's length (`remapFractions`), so
 * gates, zones, rows and the grid stay where they were on the road.
 */
export function conformRoute(route: RouteDef, mesh: CollisionMesh, factor: number): RouteDef {
  const reach = CONFORM_REACH * factor;
  let current = route;
  for (let pass = 0; pass < CONFORM_PASSES; pass += 1) {
    const geometry = routeGeometry(current);
    // Jumps and glides where they are on the curve so far.
    const fractions = current === route ? route : remapFractions(route, current);
    const points = current.points;
    const n = points.length;
    const out: RoutePoint[] = [];
    for (let i = 0; i < n; i += 1) {
      const p1 = points[i] as RoutePoint;
      out.push(p1);
      const sMid = ((geometry.pointS[i] ?? 0) + (geometry.pointS[i + 1] ?? geometry.length)) / 2;
      if (flies(fractions, sMid / geometry.length)) continue;
      const p0 = points[(i + n - 1) % n] as RoutePoint;
      const p2 = points[(i + 1) % n] as RoutePoint;
      const p3 = points[(i + 2) % n] as RoutePoint;
      const mid = {
        x: catmullRom(p0.x, p1.x, p2.x, p3.x, 0.5),
        y: catmullRom(p0.y, p1.y, p2.y, p3.y, 0.5),
        z: catmullRom(p0.z, p1.z, p2.z, p3.z, 0.5),
      };
      const up = normalize(add(upOf(p1), upOf(p2)));
      const ground = nearestGround(mesh, mid, up, reach);
      if (!ground || Math.hypot(...xyz(sub(ground, mid))) <= CONFORM_TOLERANCE) continue;
      out.push({
        ...ground,
        ...(p1.up || p2.up ? { up } : {}),
        width: (p1.width + p2.width) / 2,
        ...(p1.racingLine !== undefined || p2.racingLine !== undefined
          ? { racingLine: ((p1.racingLine ?? 0) + (p2.racingLine ?? 0)) / 2 }
          : {}),
      });
    }
    if (out.length === n) break;
    current = { ...current, points: out };
  }
  return current === route ? route : remapFractions(route, current);
}

/**
 * `conformed` (`original`'s points with more between them) with `original`'s lap fractions moved
 * so each stays the same share of the way between the same two original points.
 */
function remapFractions(original: RouteDef, conformed: RouteDef): RouteDef {
  const before = routeGeometry(original);
  const after = routeGeometry(conformed);
  const kept = new Map(conformed.points.map((p, i) => [p, i]));
  const sAfter = original.points.map((p) => after.pointS[kept.get(p) ?? 0] ?? 0);
  const n = original.points.length;
  const remap = (t: number): number => {
    const s = (((t % 1) + 1) % 1) * before.length;
    let i = n - 1;
    while (i > 0 && (before.pointS[i] ?? 0) > s) i -= 1;
    const from = before.pointS[i] ?? 0;
    const to = before.pointS[i + 1] ?? before.length;
    const share = to > from ? (s - from) / (to - from) : 0;
    const a = sAfter[i] ?? 0;
    const b = sAfter[i + 1] ?? after.length;
    return (a + (b - a) * share) / after.length;
  };
  const range = <R extends { from: number; to: number }>(r: R): R => ({
    ...r,
    from: remap(r.from),
    to: remap(r.to),
  });
  return {
    ...conformed,
    checkpoints: original.checkpoints.map(remap),
    respawnPoints: original.respawnPoints.map((r) => ({ ...range(r), t: remap(r.t) })),
    gridSlots: original.gridSlots.map((g) => ({ ...g, t: remap(g.t) })),
    itemBoxRows: original.itemBoxRows.map((r) => ({ ...r, t: remap(r.t) })),
    coinLines: original.coinLines.map(range),
    zones: original.zones.map((z) => {
      if (z.kind === 'antigrav') return range(z);
      if (z.kind === 'glide')
        return { ...range(z), ...(z.landing !== undefined && { landing: remap(z.landing) }) };
      return z;
    }),
  };
}

const upOf = (p: RoutePoint): Vec3 => p.up ?? { x: 0, y: 1, z: 0 };
const xyz = (v: Vec3): [number, number, number] => [v.x, v.y, v.z];

/** Whether the route flies at `t` on purpose: a jump (respawn range) or a glide. */
export function flies(route: RouteDef, t: number): boolean {
  if (route.respawnPoints.some((r) => inRange(t, r))) return true;
  return route.zones.some(
    (z) => z.kind === 'glide' && inRange(t, { from: z.from, to: z.landing ?? z.to }),
  );
}

/** The ground nearest `at` along `up`, either way, within `reach`. */
function nearestGround(mesh: CollisionMesh, at: Vec3, up: Vec3, reach: number): Vec3 | null {
  const below = raycastMesh(mesh, at, scaleVec(up, -1), reach, CONFORM_GROUND);
  const above = raycastMesh(mesh, at, up, reach, CONFORM_GROUND);
  const hit =
    below && above ? (below.distance <= above.distance ? below : above) : (below ?? above);
  return hit ? { x: hit.point.x, y: hit.point.y, z: hit.point.z } : null;
}
