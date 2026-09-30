import { insidePolygon, type SplineTrackDef, type TrackGeometry } from '../splineTrack';
import type { Vec3 } from '../math';

/** What a flying item (a shell, an item entity) meets where it is now. */
export type ItemEdge =
  /** On a floor (the road, its verges, or a `shortcuts` floor): it sits at `y`. */
  | { kind: 'floor'; y: number }
  /** Pushed into a wall: `normal` points out of the track through it, `over` m past it. */
  | { kind: 'wall'; normal: { x: number; z: number }; over: number }
  /** Off the edge where there's no wall or floor: it falls and is gone. */
  | { kind: 'fall' };

/** How far past the wall line at its spot (its own lateral side) an item is, m (≤ 0: inside). */
function pastWallLine(geometry: TrackGeometry, position: Vec3, radius: number) {
  const p = geometry.project(position);
  return { p, over: Math.abs(p.lateral) - (geometry.wallOffset(p.width) - radius) };
}

/**
 * Where an item of `radius` m that moved from `from` to `position` this tick stands against the
 * track's walls and floors. A wall stops it only when it crosses the wall line from the road side
 * (or there's no floor beyond): an item already past the line — having left the road through a
 * wall gap onto a `shortcuts` floor such as Cog Works' catwalk or Canopy Rush's ruins — flies on
 * over that floor (MK-62 QA round 2: red shells used to break the moment they left the road).
 */
export function itemEdge(
  track: SplineTrackDef,
  geometry: TrackGeometry,
  from: Vec3,
  position: Vec3,
  radius: number,
): ItemEdge {
  const { p, over } = pastWallLine(geometry, position, radius);
  if (over <= 0) return { kind: 'floor', y: p.groundY };
  const side = p.lateral >= 0 ? 1 : -1;
  const wall = geometry.hasWall(p.t, side === 1 ? 'right' : 'left');
  const cut =
    p.surface === 'out'
      ? track.shortcuts?.find((c) => insidePolygon(position.x, position.z, c.polygon))
      : undefined;
  const floorY = p.surface !== 'out' ? p.groundY : cut?.y;
  if (wall && (floorY === undefined || pastWallLine(geometry, from, radius).over <= 0)) {
    return { kind: 'wall', normal: { x: p.normal.x * side, z: p.normal.z * side }, over };
  }
  return floorY === undefined ? { kind: 'fall' } : { kind: 'floor', y: floorY };
}
