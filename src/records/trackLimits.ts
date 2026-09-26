import { racers } from '../content/racers';
import { tracks } from '../content/tracks';
import { routeInfos } from '../sim/routes';
import { trackGeometry } from '../sim/track';
import type { TrackGeometry } from '../sim/splineTrack';
import { tuning, type EngineClass } from '../sim/tuning';

/**
 * Leaderboard time limits (MK-48): the fastest a lap could possibly be, from the track's data.
 * `submit_record()` rejects anything quicker (`supabase/migrations/*_leaderboard.sql` →
 * `track_limits`; `pnpm track-limits` prints the rows).
 *
 * The estimate is deliberately generous to the player: the shortest line round the lap (a taut
 * string through the road and its verges, taking every route that is shorter) driven entirely at
 * boosted top speed by the fastest racer in the fastest class, then another `LIMIT_MARGIN` off.
 * Nobody boosts a whole lap, so a real time can't get near it; a faked one usually does.
 */

/** The limits are this share of the estimate (the ticket's "fastest possible lap × 0.9"). */
export const LIMIT_MARGIN = 0.9;
/** The taut line is found on points this far apart along the lap, m. */
const LINE_SPACING = 4;
/** Taut-line relaxation stops when a sweep shortens the lap by less than this, m. */
const LINE_TOLERANCE = 0.001;
const LINE_MAX_SWEEPS = 20000;
const FASTEST_CLASS: EngineClass = 150;
/** Stat points are counted from this middle value (`tuning.stats`). */
const STAT_MIDDLE = 3;

export interface TrackLimit {
  trackId: string;
  laps: number;
  minLapMs: number;
  minRaceMs: number;
}

/** Top speed of the fastest racer in the fastest class, boosting, m/s. */
export function fastestSpeed(): number {
  const bestStat = Math.max(...racers.list().map((racer) => racer.stats.speed));
  const statFactor = 1 + (bestStat - STAT_MIDDLE) * tuning.stats.speedPerPoint;
  return (
    tuning.topSpeed[FASTEST_CLASS] * statFactor * Math.max(tuning.boostSpeed, tuning.starSpeed)
  );
}

/**
 * Length of the shortest closed line round the lap that keeps a kart on the road or its verges:
 * each point slides across the track towards its neighbours' midpoint until the string is taut.
 * Returns the line's segment lengths too (segment i runs from point i to i + 1).
 */
export function tautLine(geometry: TrackGeometry): {
  length: number;
  segments: number[];
  t: number[];
} {
  const step = Math.max(1, Math.round(LINE_SPACING / (geometry.length / geometry.samples.length)));
  const verge = geometry.def.offroadWidth;
  // Each point of the line: where it crosses a row of the track, `lateral` m right of centre.
  const points = geometry.samples
    .filter((_, i) => i % step === 0)
    .map((row) => ({
      row,
      reach: Math.max(0, row.width / 2 + verge - tuning.kartHalfWidth),
      lateral: 0,
      x: row.x,
      z: row.z,
    }));
  const n = points.length;
  const around = (i: number) => points[(i + n) % n] ?? points[0];
  const segmentLengths = () =>
    points.map((p, i) => {
      const q = around(i + 1);
      return q ? Math.hypot(q.x - p.x, q.z - p.z) : 0;
    });
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  let length = sum(segmentLengths());
  for (let sweep = 0; sweep < LINE_MAX_SWEEPS; sweep += 1) {
    points.forEach((p, i) => {
      const prev = around(i - 1) ?? p;
      const next = around(i + 1) ?? p;
      const mx = (prev.x + next.x) / 2 - p.row.x;
      const mz = (prev.z + next.z) / 2 - p.row.z;
      p.lateral = Math.min(p.reach, Math.max(-p.reach, mx * p.row.nx + mz * p.row.nz));
      p.x = p.row.x + p.row.nx * p.lateral;
      p.z = p.row.z + p.row.nz * p.lateral;
    });
    const shorter = sum(segmentLengths());
    const done = length - shorter < LINE_TOLERANCE;
    length = shorter;
    if (done) break;
  }
  const segments = segmentLengths();
  return { length, segments, t: points.map((p) => p.row.s / geometry.length) };
}

/** The shortest lap, m: the taut line, with every route that is shorter than the road it skips. */
export function shortestLap(geometry: TrackGeometry): number {
  const line = tautLine(geometry);
  let lap = line.length;
  for (const route of routeInfos(geometry)) {
    let skipped = 0;
    line.segments.forEach((segment, i) => {
      const along = ((((line.t[i] ?? 0) - route.from) % 1) + 1) % 1;
      if (along < route.span) skipped += segment;
    });
    lap -= Math.max(0, skipped - route.length);
  }
  return lap;
}

/** The limit for one track: its fastest possible lap and race (`laps` of them) with the margin. */
export function trackLimit(trackId: string, laps = tuning.raceLaps): TrackLimit {
  const geometry = trackGeometry(tracksDef(trackId));
  const lapSeconds = (shortestLap(geometry) / fastestSpeed()) * LIMIT_MARGIN;
  const minLapMs = Math.floor(lapSeconds * 1000);
  return { trackId, laps, minLapMs, minRaceMs: minLapMs * laps };
}

function tracksDef(trackId: string) {
  const def = tracks.get(trackId).def;
  if (def.kind !== 'spline') throw new Error(`Track ${trackId} is not a race track`);
  return def;
}

/** Every race track offered in the menus (test fixtures have no board). */
export function raceTrackIds(): string[] {
  return tracks
    .list()
    .filter((track) => !track.testOnly && track.def.kind === 'spline')
    .map((track) => track.id);
}

/** The SQL that sets every track's limits (upsert: re-running it after a track change is safe). */
export function trackLimitsSql(limits: readonly TrackLimit[]): string {
  const rows = limits.map((l) => `  ('${l.trackId}', ${l.laps}, ${l.minRaceMs}, ${l.minLapMs})`);
  return [
    'insert into public.track_limits (track_id, laps, min_race_ms, min_lap_ms) values',
    `${rows.join(',\n')}`,
    'on conflict (track_id) do update set',
    '  laps = excluded.laps, min_race_ms = excluded.min_race_ms, min_lap_ms = excluded.min_lap_ms;',
  ].join('\n');
}
