// The minimap's projection (MK-127): the course's centreline seen from above (+X right, −Z up:
// heading 0 points up the map), fitted into a square. Racer heads sit on the centreline at the
// kart's route progress, the lap fraction the sim keeps (`KartState.race.lastT`), so a head moves
// with the race order rather than wobbling across the road.
import { routeGeometry } from '../../../sim/route';
import { getTrack, trackGeometry, type TrackDef } from '../../../sim/track';
import type { KartState } from '../../../sim/types';
import type { Vec3 } from '../../../sim/math';

/** Centreline samples per lap for the outline and the fit. */
const SAMPLES = 160;

export interface MapProjection {
  /** The square's side, map units (the SVG's viewBox). */
  size: number;
  /** The centreline as a closed SVG path. */
  path: string;
  /** A world point on the map. */
  toMap(x: number, z: number): [number, number];
  /** The centreline at lap fraction `t` on the map. */
  at(t: number): [number, number];
}

/** The centreline at lap fraction `t` of a track with one (spline or mesh), else undefined. */
function centreline(track: TrackDef): ((t: number) => Vec3) | undefined {
  if (track.kind === 'spline') {
    const geometry = trackGeometry(track);
    return (t) => geometry.pointAt(t, 0);
  }
  if (track.kind === 'mesh') {
    const geometry = routeGeometry(track.route);
    return (t) => geometry.frameAt(t).position;
  }
  return undefined;
}

/** The projection of `trackId` into a `size` square with `pad` round it; null for an arena. */
export function mapProjection(trackId: string, size: number, pad: number): MapProjection | null {
  const point = centreline(getTrack(trackId));
  if (!point) return null;
  const points = Array.from({ length: SAMPLES }, (_, i) => point(i / SAMPLES));
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  const minX = Math.min(...xs);
  const minZ = Math.min(...zs);
  const spanX = Math.max(...xs) - minX;
  const spanZ = Math.max(...zs) - minZ;
  const scale = (size - pad * 2) / (Math.max(spanX, spanZ) || 1);
  const offX = (size - spanX * scale) / 2;
  const offZ = (size - spanZ * scale) / 2;
  const toMap = (x: number, z: number): [number, number] => [
    offX + (x - minX) * scale,
    offZ + (z - minZ) * scale,
  ];
  const path = `${points
    .map((p, i) => {
      const [x, y] = toMap(p.x, p.z);
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join('')}Z`;
  return {
    size,
    path,
    toMap,
    at: (t) => {
      const p = point(t);
      return toMap(p.x, p.z);
    },
  };
}

/** Where `kart` is along the lap, 0–1: the sim's progress, or its nearest centreline point. */
export function kartProgress(trackId: string, kart: KartState): number {
  if (kart.race.lastT >= 0) return kart.race.lastT;
  const track = getTrack(trackId);
  if (track.kind === 'mesh') return routeGeometry(track.route).project(kart.position).t;
  if (track.kind === 'spline') return trackGeometry(track).project(kart.position).t;
  return 0;
}

/** The kart's head on the map. */
export function headAt(projection: MapProjection, trackId: string, kart: KartState) {
  return projection.at(kartProgress(trackId, kart));
}
