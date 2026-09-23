import { testPad } from './data/tracks/testPad';

/** Flat square arena bounded by walls. The spline track system (MK-9) adds another kind. */
export interface ArenaTrackDef {
  id: string;
  kind: 'arena';
  /** Walls sit at ±halfSize on X and Z. */
  halfSize: number;
  /** The arena is flat at this height, m. */
  groundHeight: number;
}

export type TrackDef = ArenaTrackDef;

const TRACKS: Record<string, TrackDef> = { [testPad.id]: testPad };

export function getTrack(id: string): TrackDef {
  const track = TRACKS[id];
  if (!track) throw new Error(`Unknown track: ${id}`);
  return track;
}

/** Ground height under a kart. Flat for arenas; spline tracks (MK-9) will take a position too. */
export function groundHeightAt(track: TrackDef): number {
  return track.groundHeight;
}
