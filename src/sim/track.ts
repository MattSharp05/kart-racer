import { tracks } from '../content/tracks';
import type { Vec3 } from './math';
import { insidePolygon, TrackGeometry, type SplineTrackDef, type Surface } from './splineTrack';

/** Flat square arena bounded by walls, for tuning handling. */
export interface ArenaTrackDef {
  id: string;
  kind: 'arena';
  /** Walls sit at ±halfSize on X and Z. */
  halfSize: number;
  /** The arena is flat at this height, m. */
  groundHeight: number;
}

export type TrackDef = ArenaTrackDef | SplineTrackDef;

/** Height a kart falls to when off the edge of a track (respawn arrives in MK-13). */
export const VOID_HEIGHT = -1000;

const geometries = new Map<string, TrackGeometry>();

/** The track data for `id` (registered in `src/content/tracks/`); throws for an unknown id. */
export function getTrack(id: string): TrackDef {
  return tracks.get(id).def;
}

/** Precomputed geometry for a spline track (cached; tracks are immutable data). */
export function trackGeometry(track: SplineTrackDef): TrackGeometry {
  let geometry = geometries.get(track.id);
  if (!geometry) {
    geometry = new TrackGeometry(track);
    geometries.set(track.id, geometry);
  }
  return geometry;
}

export interface GroundInfo {
  height: number;
  surface: Surface;
  /** Conveyors: unit direction the belt runs (XZ). */
  flow?: { x: number; z: number };
}

/** Ground height and surface under a position. */
export function groundAt(track: TrackDef, position: Vec3): GroundInfo {
  if (track.kind === 'arena') return { height: track.groundHeight, surface: 'road' };
  const projection = trackGeometry(track).project(position);
  if (projection.surface !== 'out') {
    const ground: GroundInfo = { height: projection.groundY, surface: projection.surface };
    const angle = projection.zone?.flowAngle;
    if (projection.surface === 'conveyor') {
      // Rotate the driving direction towards the right-normal by `flowAngle`.
      const { tangent, normal } = projection;
      const cos = Math.cos(angle ?? 0);
      const sin = Math.sin(angle ?? 0);
      ground.flow = { x: tangent.x * cos + normal.x * sin, z: tangent.z * cos + normal.z * sin };
    }
    return ground;
  }
  const cut = track.shortcuts?.find((c) => insidePolygon(position.x, position.z, c.polygon));
  if (cut) return { height: cut.y, surface: 'rough' };
  return { height: VOID_HEIGHT, surface: 'out' };
}
