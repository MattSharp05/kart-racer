import { it } from 'vitest';
import { raceTrackIds, trackLimit, trackLimitsSql } from '../src/records/trackLimits';

/**
 * Prints the leaderboard's `track_limits` rows (MK-48): `pnpm track-limits`. Paste the output into
 * a new migration (or the Supabase SQL editor) after adding or reshaping a track; see
 * `supabase/README.md` → "Adding a track".
 */
it('prints track_limits SQL', () => {
  const limits = raceTrackIds().map((id) => trackLimit(id));
  console.log(`\n${trackLimitsSql(limits)}\n`);
}, 120_000);
