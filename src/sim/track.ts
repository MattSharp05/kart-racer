import { tracks } from '../content/tracks';
import type { Vec3 } from './math';
import { groundAt as meshGroundAt, type MeshSurface, type MeshTrackDef } from './meshTrack';
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

/** Every kind of track; code that needs a centreline narrows on `kind` (mesh tracks: ADR 0010). */
export type TrackDef = ArenaTrackDef | SplineTrackDef | MeshTrackDef;

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
  /** Conveyors: the belt's speed as a multiple of `tuning.surfaces.conveyorSpeed`. */
  flowScale?: number;
  /** Mesh tracks: the ground's unit normal and its mesh surface (MK-98). */
  normal?: Vec3;
  meshSurface?: MeshSurface;
}

const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 };

/**
 * How the existing (yaw-only) kart step reads a mesh surface until surface-frame physics (ADR 0011)
 * handles mesh tracks itself: walls and the void are off the track.
 */
const MESH_GROUND_SURFACE: Record<MeshSurface, Surface> = {
  road: 'road',
  offroad: 'offroad',
  boost: 'boostPad',
  wall: 'out',
  water: 'road',
  antigrav: 'road',
  glide: 'road',
  void: 'out',
};

/** Ground height and surface under a position. */
export function groundAt(track: TrackDef, position: Vec3): GroundInfo {
  if (track.kind === 'arena') return { height: track.groundHeight, surface: 'road' };
  if (track.kind === 'mesh') {
    const hit = meshGroundAt(track.collision, position, WORLD_UP);
    if (!hit || hit.surface === 'void') return { height: VOID_HEIGHT, surface: 'out' };
    return {
      height: hit.point.y,
      surface: MESH_GROUND_SURFACE[hit.surface],
      normal: hit.normal,
      meshSurface: hit.surface,
    };
  }
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
      ground.flowScale = projection.zone?.speedScale ?? 1;
    }
    return ground;
  }
  const cut = track.shortcuts?.find((c) => insidePolygon(position.x, position.z, c.polygon));
  if (cut) return { height: cut.y, surface: cut.surface ?? 'rough' };
  return { height: VOID_HEIGHT, surface: 'out' };
}
