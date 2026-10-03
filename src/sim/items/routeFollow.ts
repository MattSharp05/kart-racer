// Following the lap (MK-113): where an item flying along the track is, in metres round the lap, on
// any track with a centreline. On mesh tracks that's the route (`sim/route.ts`, a 3D centreline with
// its own `up`, so a follower loops, rolls and climbs walls with the road); on spline tracks the
// spline (up is +Y). Arenas have no lap: callers fall back to flying straight at their target.
import { WORLD_UP, type Vec3 } from '../math';
import { routeGeometry } from '../route';
import { routeProgress } from '../routes';
import { getTrack, trackGeometry, type TrackDef } from '../track';
import type { KartState, SimState } from '../types';

/** A point on the lap with its frame: the way the lap goes, road up and right. */
export interface LapFrame {
  position: Vec3;
  /** Unit driving direction. */
  tangent: Vec3;
  /** Unit road up. */
  up: Vec3;
  /** Unit right of the driving direction. */
  right: Vec3;
}

/** A track with a lap to follow (not an arena). */
type LapTrack = Exclude<TrackDef, { kind: 'arena' }>;

/** The race's track, when it has a lap to follow. */
export function lapTrack(state: SimState): LapTrack | null {
  const track = getTrack(state.trackId);
  return track.kind === 'arena' ? null : track;
}

/** The lap's length, m. */
export function lapLength(track: LapTrack): number {
  return track.kind === 'mesh' ? routeGeometry(track.route).length : trackGeometry(track).length;
}

/** Wraps `s` into [0, `length`). */
export function wrapLap(s: number, length: number): number {
  return ((s % length) + length) % length;
}

/** The signed distance from `from` to `to` round a lap of `length`, in (−length/2, length/2]. */
export function lapGap(from: number, to: number, length: number): number {
  const d = wrapLap(to - from, length);
  return d > length / 2 ? d - length : d;
}

/** The point `s` m round the lap, `lateral` m to the right of the centreline, and its frame. */
export function lapFrame(track: LapTrack, s: number, lateral = 0): LapFrame {
  const length = lapLength(track);
  const t = wrapLap(s, length) / length;
  if (track.kind === 'mesh') {
    const { position, tangent, up, right } = routeGeometry(track.route).frameAt(t, lateral);
    return { position, tangent, up, right };
  }
  const geometry = trackGeometry(track);
  const flat = geometry.tangentAt(t);
  const tangent = { x: flat.x, y: 0, z: flat.z };
  // Right of the driving direction on the XZ plane (`tangent × up`).
  const right = { x: -flat.z, y: 0, z: flat.x };
  return { position: geometry.pointAt(t, lateral), tangent, up: { ...WORLD_UP }, right };
}

/**
 * How far round the lap `position` is, m, and how far right of the centreline. `hint` (a lap
 * fraction) keeps a mesh route's projection near it where the road passes over itself.
 */
export function lapPosition(
  track: LapTrack,
  position: Vec3,
  hint?: number,
): { s: number; lateral: number } {
  if (track.kind === 'mesh') {
    const p = routeGeometry(track.route).project(position, hint);
    return { s: p.s, lateral: p.lateral };
  }
  const geometry = trackGeometry(track);
  const projection = geometry.project(position);
  // On a route off the main road (MK-61), the lap fraction it stands for.
  const t = routeProgress(geometry, position, projection)?.t ?? projection.t;
  return { s: t * geometry.length, lateral: projection.lateral };
}

/** How far round the lap a kart is, m. */
export function kartLapS(track: LapTrack, kart: KartState): number {
  const hint = kart.race.lastT >= 0 ? kart.race.lastT : undefined;
  return lapPosition(track, kart.position, hint).s;
}
