import { sunnyCircuit } from './data/tracks/sunnyCircuit';
import { testOval } from './data/tracks/testOval';
import { testPad } from './data/tracks/testPad';
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

const TRACKS: Record<string, TrackDef> = {
  [testPad.id]: testPad,
  [testOval.id]: testOval,
  [sunnyCircuit.id]: sunnyCircuit,
};

const geometries = new Map<string, TrackGeometry>();

export function getTrack(id: string): TrackDef {
  const track = TRACKS[id];
  if (!track) throw new Error(`Unknown track: ${id}`);
  return track;
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
}

/** Ground height and surface under a position. */
export function groundAt(track: TrackDef, position: Vec3): GroundInfo {
  if (track.kind === 'arena') return { height: track.groundHeight, surface: 'road' };
  const projection = trackGeometry(track).project(position);
  if (projection.surface !== 'out')
    return { height: projection.groundY, surface: projection.surface };
  const cut = track.shortcuts?.find((c) => insidePolygon(position.x, position.z, c.polygon));
  if (cut) return { height: cut.y, surface: 'rough' };
  return { height: VOID_HEIGHT, surface: 'out' };
}
