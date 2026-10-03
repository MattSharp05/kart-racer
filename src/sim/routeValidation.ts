// Route checks (MK-100): what the track editor lists in its side panel before a route is exported,
// and what course tests can assert. Pure: the route's own shape, plus the collision mesh under the
// places karts start and respawn when one is given.
import type { Vec3 } from './math';
import { MESH_SURFACES, type CollisionMesh, type MeshSurface } from './meshCollision';
import { raycastMesh, surfaceMask } from './meshTrack';
import { RouteGeometry, type RouteDef } from './route';

/** Which part of a route an issue is about (the editor's layer names). */
export type RouteLayer = 'route' | 'gates' | 'respawn' | 'grid' | 'itemBoxes' | 'coins' | 'zones';

export interface RouteIssue {
  layer: RouteLayer;
  /** The item in that layer's list, when the issue is about one. */
  index?: number;
  message: string;
}

export const ROUTE_RULES = {
  /** Catmull-Rom needs four control points. */
  minPoints: 4,
  /**
   * The route is open when its closing segment (last point → first) is longer than this many
   * times its longest other segment: the author hasn't come back round to the start line.
   */
  maxClosingFactor: 2,
  /** Grid slots a race needs (1 player + 7 AI). */
  gridSlots: 8,
  /** Surface checks cast from this far above the route's frame, m, along −up… */
  probeHeight: 2,
  /** …for at most this far, m. */
  probeDepth: 10,
  /** Where karts may start and be put back. */
  drivable: ['road', 'boost', 'antigrav', 'glide'] as readonly MeshSurface[],
} as const;

const ALL_SURFACES = surfaceMask(...MESH_SURFACES);

const inLap = (t: number) => Number.isFinite(t) && t >= 0 && t < 1;

/** Every problem with `route` (empty when it's fine). `collision` adds the surface checks. */
export function validateRoute(route: RouteDef, collision?: CollisionMesh): RouteIssue[] {
  const issues: RouteIssue[] = [];
  const add = (layer: RouteLayer, message: string, index?: number) =>
    issues.push(index === undefined ? { layer, message } : { layer, index, message });

  const shapeOk = checkShape(route, add);
  checkGates(route.checkpoints, add);
  route.respawnPoints.forEach((r, i) => {
    if (![r.from, r.to, r.t].every(inLap)) add('respawn', `Respawn ${i + 1}: t outside 0–1`, i);
  });
  if (route.gridSlots.length !== ROUTE_RULES.gridSlots)
    add('grid', `Grid has ${route.gridSlots.length} slots, needs ${ROUTE_RULES.gridSlots}`);
  route.gridSlots.forEach((g, i) => {
    if (!inLap(g.t)) add('grid', `Grid slot ${i + 1}: t outside 0–1`, i);
  });
  route.itemBoxRows.forEach((row, i) => {
    if (!inLap(row.t)) add('itemBoxes', `Item row ${i + 1}: t outside 0–1`, i);
    if (row.laterals.length === 0) add('itemBoxes', `Item row ${i + 1} has no boxes`, i);
  });
  route.coinLines.forEach((line, i) => {
    if (!inLap(line.from) || !inLap(line.to)) add('coins', `Coin line ${i + 1}: t outside 0–1`, i);
    if (!(line.count >= 1)) add('coins', `Coin line ${i + 1} has no coins`, i);
  });
  route.zones.forEach((zone, i) => {
    if (zone.kind === 'glide' || zone.kind === 'antigrav') {
      if (!inLap(zone.from) || !inLap(zone.to))
        add('zones', `Zone ${i + 1} (${zone.kind}): t outside 0–1`, i);
    } else if (zone.kind === 'water') {
      if (zone.min.x > zone.max.x || zone.min.y > zone.max.y || zone.min.z > zone.max.z)
        add('zones', `Zone ${i + 1} (water): min is above max`, i);
    } else if (!(zone.radius > 0)) add('zones', `Zone ${i + 1} (bumper): radius must be > 0`, i);
  });

  if (shapeOk && collision) checkSurfaces(route, collision, add);
  return issues;
}

type Add = (layer: RouteLayer, message: string, index?: number) => void;

/** Point count, widths and closure; false when the route can't be sampled. */
function checkShape(route: RouteDef, add: Add): boolean {
  const { points } = route;
  if (points.length < ROUTE_RULES.minPoints) {
    add('route', `Route has ${points.length} points, needs at least ${ROUTE_RULES.minPoints}`);
    return false;
  }
  points.forEach((p, i) => {
    if (!(p.width > 0)) add('route', `Point ${i + 1}: width must be > 0`, i);
  });
  const gap = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  let longest = 0;
  for (let i = 0; i + 1 < points.length; i += 1)
    longest = Math.max(longest, gap(points[i] as Vec3, points[i + 1] as Vec3));
  const closing = gap(points.at(-1) as Vec3, points[0] as Vec3);
  if (closing > longest * ROUTE_RULES.maxClosingFactor)
    add(
      'route',
      `Route is open: last point is ${closing.toFixed(1)} m from the start (longest segment ${longest.toFixed(1)} m)`,
      points.length - 1,
    );
  return true;
}

function checkGates(checkpoints: number[], add: Add): void {
  if (checkpoints[0] !== 0) add('gates', 'The first gate must be the finish line (t = 0)', 0);
  checkpoints.forEach((t, i) => {
    if (!inLap(t)) add('gates', `Gate ${i + 1}: t outside 0–1`, i);
    else if (i > 0 && t <= (checkpoints[i - 1] ?? 0))
      add('gates', `Gate ${i + 1} is out of order (t ${t.toFixed(3)} after a later gate)`, i);
  });
}

/** Respawn points and grid slots must sit over a drivable surface. */
function checkSurfaces(route: RouteDef, collision: CollisionMesh, add: Add): void {
  const geometry = new RouteGeometry(route);
  const surfaceUnder = (t: number, lateral: number): MeshSurface | undefined => {
    const frame = geometry.frameAt(t, lateral);
    const origin = {
      x: frame.position.x + frame.up.x * ROUTE_RULES.probeHeight,
      y: frame.position.y + frame.up.y * ROUTE_RULES.probeHeight,
      z: frame.position.z + frame.up.z * ROUTE_RULES.probeHeight,
    };
    const down = { x: -frame.up.x, y: -frame.up.y, z: -frame.up.z };
    const reach = ROUTE_RULES.probeHeight + ROUTE_RULES.probeDepth;
    return raycastMesh(collision, origin, down, reach, ALL_SURFACES)?.surface;
  };
  const check = (layer: RouteLayer, label: string, i: number, t: number, lateral: number) => {
    if (!inLap(t)) return;
    const surface = surfaceUnder(t, lateral);
    if (surface === undefined) add(layer, `${label} ${i + 1} has no ground under it`, i);
    else if (!ROUTE_RULES.drivable.includes(surface))
      add(layer, `${label} ${i + 1} is on ${surface}, not road`, i);
  };
  route.respawnPoints.forEach((r, i) => check('respawn', 'Respawn', i, r.t, 0));
  route.gridSlots.forEach((g, i) => check('grid', 'Grid slot', i, g.t, g.lateral));
}
