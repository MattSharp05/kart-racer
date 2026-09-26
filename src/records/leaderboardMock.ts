import { racers } from '../content/racers';
import { PROFILE_COLOURS, readProfile } from '../game/profile';
import type { KeyValueStore } from '../game/storage/store';
import { Leaderboard, supabaseLeaderboard, type RpcCall } from './leaderboard';

/**
 * Stand-in leaderboard backends for tests and QA links (MK-56): `?lb=mock` answers `get_board` /
 * `submit_record` from made-up boards in memory, `?lb=offline` fails like a lost connection. Both
 * sit behind the real `Leaderboard` client (same parsing, same states), and neither ever reaches
 * the real board, so races from scenario links count with them.
 *
 * A scenario turns the mock on with the storage key below (so its dev link needs no `&lb=`), and
 * picks what it shows: `filled` boards, `empty` ones, `loading` (boards never arrive) or `offline`.
 */
export const MOCK_MODE_KEY = 'kart-racer:leaderboard-mock';

export type MockMode = 'filled' | 'empty' | 'loading' | 'offline';

export type LeaderboardMode = 'mock' | 'offline';

/** Rows on a filled board, yours included. */
const MOCK_TOTAL = 48;
/** Where your row sits on a filled board: outside the top 20, so it's pinned below the list. */
export const MOCK_YOUR_RANK = 37;
/** At 50cc your row is inside the top 20 instead, highlighted in the list. */
export const MOCK_YOUR_RANK_50CC = 4;
/** The fastest race on a board, ms, before the per-track and per-class spread (about a good 150cc race). */
const BASE_RACE_MS = 128_000;
/** Each track's boards start up to this much slower, ms. */
const TRACK_SPREAD_MS = 15_000;
/** Each class below 150cc adds this much to every time, ms. */
const CLASS_STEP_MS = 12_000;
const FASTEST_CLASS = 150;
const CLASS_GAP = 50;
/** Gap between neighbouring rows, ms (never 0, so your made-up row lands exactly at its rank). */
const ROW_GAP_MS = [640, 910, 330, 1230, 470, 1580];
/** Best lap as a share of the average lap (a best lap is a bit under the average). */
const BEST_LAP_SHARE = 0.93;
const LAPS = 3;
/** The mock answers after this long, ms, so the loading state shows for a moment. */
const MOCK_DELAY_MS = 120;
/** Your nickname on the mock boards when there's no profile. */
const DEFAULT_NAME = 'Player';

const NAMES = [
  'Zoomer',
  'Tilly',
  'Ravi K',
  'MintyFresh',
  'Bo_77',
  'Kestrel',
  'Pip',
  'Lumen',
  'Gravel Guy',
  'Nova',
  'SkidMark',
  'Jun',
  'Ollie-O',
  'Wren',
  'Turbo Tam',
  'Maz',
  'Quill',
  'DriftQueen',
  'Arlo',
  'Sprocket',
  'Fen',
  'Hattie',
  'Dash 9',
  'Ember',
];

/** A small stable hash, so each board gets its own names and times. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface MockRow {
  nickname: string;
  race_ms: number;
  best_lap_ms: number;
  racer: string;
  colour: string;
  you: boolean;
}

/** The made-up rows of a board, fastest first, without yours. */
function otherRows(trackId: string, engineClass: number): Omit<MockRow, 'you'>[] {
  const seed = hash(`${trackId}:${engineClass}`);
  const racerIds = racers.ids();
  const classesSlower = Math.max(0, (FASTEST_CLASS - engineClass) / CLASS_GAP);
  let raceMs = BASE_RACE_MS + (hash(trackId) % TRACK_SPREAD_MS) + classesSlower * CLASS_STEP_MS;
  return Array.from({ length: MOCK_TOTAL - 1 }, (_, i) => {
    raceMs += ROW_GAP_MS[(seed + i) % ROW_GAP_MS.length] ?? 0;
    return {
      nickname: NAMES[(seed + i * 7) % NAMES.length] ?? DEFAULT_NAME,
      race_ms: raceMs,
      best_lap_ms: Math.round((raceMs / LAPS) * BEST_LAP_SHARE),
      racer: racerIds[(seed + i) % racerIds.length] ?? '',
      colour: PROFILE_COLOURS[(seed + i * 3) % PROFILE_COLOURS.length]?.id ?? '',
    };
  });
}

/** `get_board()`'s answer for these rows: ranks (ties share one), the top 20 and your row. */
export function boardJson(rows: MockRow[]) {
  const sorted = [...rows].sort((a, b) => a.race_ms - b.race_ms);
  const ranked = sorted.map((row) => ({
    rank: 1 + sorted.filter((other) => other.race_ms < row.race_ms).length,
    ...row,
  }));
  return {
    total: ranked.length,
    top: ranked.slice(0, 20),
    you: ranked.find((row) => row.you) ?? null,
  };
}

/** Resolves after the mock's delay; never, while `loading`. */
function answer<T>(value: T, loading: boolean): Promise<T> {
  return new Promise((resolve) => {
    if (!loading) setTimeout(() => resolve(value), MOCK_DELAY_MS);
  });
}

/**
 * The mock backend. Your row on a filled board is at #37 (#4 at 50cc) until you submit a race:
 * then it's that race, ranked among the made-up rows (kept per board for the page load).
 */
export function mockRpc(store: KeyValueStore): RpcCall {
  const mode = store.get(MOCK_MODE_KEY);
  const loading = mode === 'loading';
  const empty = mode === 'empty';
  /** Your submitted rows, by board. */
  const submitted = new Map<string, MockRow>();
  return (fn, args) => {
    const trackId = String(args.p_track_id);
    const engineClass = Number(args.p_engine_class);
    const board = `${trackId}:${engineClass}`;
    if (fn === 'submit_record') {
      const previous = submitted.get(board);
      const raceMs = Number(args.p_race_ms);
      if (previous && previous.race_ms <= raceMs) return answer({ status: 'kept' }, loading);
      submitted.set(board, {
        nickname: String(args.p_nickname),
        race_ms: raceMs,
        best_lap_ms: Number(args.p_best_lap_ms),
        racer: typeof args.p_racer === 'string' ? args.p_racer : '',
        colour: typeof args.p_colour === 'string' ? args.p_colour : '',
        you: true,
      });
      return answer({ status: previous ? 'improved' : 'new' }, loading);
    }
    if (empty && !submitted.has(board)) return answer(boardJson([]), loading);
    const others = empty ? [] : otherRows(trackId, engineClass);
    const rows: MockRow[] = others.map((row) => ({ ...row, you: false }));
    const mine =
      submitted.get(board) ?? (empty ? undefined : madeUpRow(store, others, engineClass));
    // No device (never, from the game): no row of yours.
    if (mine && args.p_device_id) rows.push(mine);
    return answer(boardJson(rows), loading);
  };
}

/** Your made-up row: just behind the row that sits at your mock rank. */
function madeUpRow(
  store: KeyValueStore,
  others: Omit<MockRow, 'you'>[],
  engineClass: number,
): MockRow {
  const rank = engineClass === FASTEST_CLASS - 2 * CLASS_GAP ? MOCK_YOUR_RANK_50CC : MOCK_YOUR_RANK;
  const ahead = others[rank - 2];
  const behind = others[rank - 1];
  const raceMs = ahead && behind ? Math.round((ahead.race_ms + behind.race_ms) / 2) : 0;
  const profile = readProfile(store);
  return {
    nickname: profile?.nickname ?? DEFAULT_NAME,
    race_ms: raceMs,
    best_lap_ms: Math.round((raceMs / LAPS) * BEST_LAP_SHARE),
    racer: racers.ids()[0] ?? '',
    colour: profile?.colour ?? '',
    you: true,
  };
}

/** Fails every call the way a lost connection does. */
const offlineRpc: RpcCall = () => Promise.reject(new TypeError('Failed to fetch'));

/**
 * The game's leaderboard for `?lb=`: the mock, offline, or (no `lb`) the real one, unless the
 * scenario set a mock mode.
 */
export function launchLeaderboard(
  mode: LeaderboardMode | undefined,
  store: KeyValueStore,
): Leaderboard {
  const scenarioMode = store.get(MOCK_MODE_KEY);
  const chosen =
    mode ?? (scenarioMode === null ? undefined : scenarioMode === 'offline' ? 'offline' : 'mock');
  if (chosen === 'mock') return new Leaderboard(mockRpc(store), true);
  if (chosen === 'offline') return new Leaderboard(offlineRpc, true);
  return supabaseLeaderboard();
}
