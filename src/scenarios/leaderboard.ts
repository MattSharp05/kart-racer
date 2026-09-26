import { sunnyCircuit } from '../content/tracks/sunny-circuit/sim';
import { MOCK_MODE_KEY, type MockMode } from '../records/leaderboardMock';
import { attractMode } from './menus';
import { finalStraight } from './race';
import type { Scenario } from './registry';

/** The board the leaderboard scenarios open on: Sunny Circuit at 150cc. */
const OPEN_CLASS = 150;

/**
 * The leaderboards over the title (MK-56), with the mock backend in `mode` (so no Supabase is
 * needed: `&lb=offline` still wins), opening on Sunny Circuit at 150cc.
 */
function leaderboardScenario(name: string, mode: MockMode, description: string): Scenario {
  return {
    name,
    group: 'Leaderboard',
    description,
    defaultSeed: 1,
    setup: (seed) => ({
      state: attractMode(seed),
      screen: 'leaderboard',
      storage: {
        [MOCK_MODE_KEY]: mode,
        'kart-racer:prefs': JSON.stringify({ engineClass: OPEN_CLASS, track: sunnyCircuit.id }),
      },
    }),
  };
}

export const leaderboardScenarios: Scenario[] = [
  leaderboardScenario(
    'leaderboard',
    'filled',
    'Leaderboards (made-up boards): the top 20 with your row pinned at #37. Track and class tabs load other boards (at 50cc you are #4, in the list).',
  ),
  leaderboardScenario(
    'leaderboard-empty',
    'empty',
    'Leaderboards with every board empty: "Be the first!".',
  ),
  leaderboardScenario(
    'leaderboard-offline',
    'offline',
    'Leaderboards with no connection: "Leaderboard unavailable".',
  ),
  leaderboardScenario(
    'leaderboard-loading',
    'loading',
    'Leaderboards waiting for a board that never arrives: "Loading…".',
  ),
  {
    name: 'leaderboard-submit',
    group: 'Leaderboard',
    description:
      'race-final-straight against the made-up boards: cross the line and the results say "Submitted — you\'re #N" (needs a nickname: set one on the title first).',
    defaultSeed: 1,
    setup: (seed) => ({ state: finalStraight(seed), storage: { [MOCK_MODE_KEY]: 'filled' } }),
  },
];
