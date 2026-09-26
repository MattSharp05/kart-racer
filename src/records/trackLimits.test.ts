import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { trackGeometry } from '../sim/track';
import { tracks } from '../content/tracks';
import { tuning } from '../sim/tuning';
import {
  fastestSpeed,
  raceTrackIds,
  shortestLap,
  tautLine,
  trackLimit,
  trackLimitsSql,
} from './trackLimits';

/**
 * The best 150cc AI laps measured when each track was built (MK-58–MK-62 tickets, seed 1, 3 laps).
 * A limit must sit well under what a real kart drives.
 */
const MEASURED_BEST_LAP_S: Record<string, number> = {
  'dune-canyon': 42.4,
  'frostpeak-pass': 42.7,
  'neon-harbour': 38.7,
  'canopy-rush': 38.8,
  'cog-works': 40.1,
};

function geometry(id: string) {
  const def = tracks.get(id).def;
  if (def.kind !== 'spline') throw new Error(id);
  return trackGeometry(def);
}

/** track_id → [laps, min_race_ms, min_lap_ms] from every migration, later files winning. */
function migratedLimits(): Map<string, number[]> {
  const dir = join(__dirname, '../../supabase/migrations');
  const limits = new Map<string, number[]>();
  for (const file of readdirSync(dir).sort()) {
    const sql = readFileSync(join(dir, file), 'utf8');
    for (const block of sql.split('insert into public.track_limits').slice(1)) {
      for (const m of block.matchAll(/\('([a-z0-9-]+)', (\d+), (\d+), (\d+)\)/g)) {
        limits.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4])]);
      }
    }
  }
  return limits;
}

describe('track limits (MK-48)', () => {
  it('the taut line is shorter than the centreline, but not absurdly', () => {
    for (const id of raceTrackIds()) {
      const g = geometry(id);
      const line = tautLine(g);
      expect(line.length, id).toBeLessThan(g.length);
      expect(line.length, id).toBeGreaterThan(g.length * 0.75);
      expect(shortestLap(g), id).toBeLessThanOrEqual(line.length);
    }
  });

  it('a route that skips road only shortens the lap (Canopy Rush ruins)', () => {
    const g = geometry('canopy-rush');
    expect(g.def.routes?.length).toBeGreaterThan(0);
    expect(shortestLap(g)).toBeLessThan(tautLine(g).length);
  });

  it('assumes the fastest racer boosting at 150cc', () => {
    expect(fastestSpeed()).toBeGreaterThan(tuning.topSpeed[150] * tuning.boostSpeed);
  });

  it('every limit is far below the measured AI best laps', () => {
    for (const [id, best] of Object.entries(MEASURED_BEST_LAP_S)) {
      const limit = trackLimit(id);
      expect(limit.minLapMs / 1000, id).toBeLessThan(best * 0.7);
      expect(limit.minRaceMs).toBe(limit.minLapMs * tuning.raceLaps);
    }
  });

  it('prints SQL rows for every race track', () => {
    const sql = trackLimitsSql([trackLimit('sunny-circuit')]);
    expect(sql).toMatch(/^insert into public\.track_limits/);
    expect(sql).toMatch(/\('sunny-circuit', 3, \d+, \d+\)/);
    expect(raceTrackIds()).not.toContain('test-oval');
  });

  // Adding a track, or making karts faster, needs its limits in a migration (supabase/README.md):
  // the stored limits may be looser than the estimate from today's data, never stricter.
  it('the migrations hold limits for every race track, no stricter than the data allows', () => {
    const stored = migratedLimits();
    for (const id of raceTrackIds()) {
      const limit = trackLimit(id);
      const row = stored.get(id);
      expect(row, `${id} has no track_limits row: run pnpm track-limits`).toBeDefined();
      const [laps, minRaceMs, minLapMs] = row!;
      expect(laps, id).toBe(limit.laps);
      expect(minRaceMs, id).toBeLessThanOrEqual(limit.minRaceMs);
      expect(minLapMs, id).toBeLessThanOrEqual(limit.minLapMs);
    }
  });
});
