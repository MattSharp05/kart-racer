import { deviceId, readProfile } from '../game/profile';
import type { RecordUpdate } from '../game/storage/records';
import type { KeyValueStore } from '../game/storage/store';
import { raceTime } from '../sim/raceFlow';
import type { SimState } from '../sim/types';

/**
 * The global leaderboard (MK-48, ADR 0006): one board per track × engine class in Supabase
 * Postgres (`supabase/migrations/0001_leaderboard.sql`). A finished race that set a personal best
 * is submitted through `submit_record()`, which checks the times; boards come from `get_board()`.
 *
 * It never throws and never logs: offline, unconfigured, or before the SQL is applied, a submit
 * just doesn't happen and a board reads as unavailable. Once the server says the functions don't
 * exist, the page stops asking until it is reloaded.
 */

/** A row of a board. Times in ms. */
export interface BoardRow {
  /** 1 = fastest; equal times share a rank. */
  rank: number;
  nickname: string;
  raceMs: number;
  bestLapMs: number;
  /** This device's row. */
  you: boolean;
}

export interface Board {
  /** How many rows the board has. */
  total: number;
  /** The fastest 20, fastest first. */
  top: BoardRow[];
  /** This device's row, wherever it ranks; null if it has none. */
  you: BoardRow | null;
}

/** A finished race, as the leaderboard takes it. Times in seconds, as the sim keeps them. */
export interface LeaderboardEntry {
  trackId: string;
  engineClass: number;
  nickname: string;
  deviceId: string;
  laps: number;
  raceTime: number;
  bestLap: number;
}

/**
 * What became of a submit: `saved` (a new or faster row), `kept` (the board already had a faster
 * time from this device), `rejected` (by the server's checks), `skipped` (not a personal best, or
 * no profile) or `unavailable` (offline, unconfigured, or no leaderboard on the server yet).
 */
export type SubmitOutcome = 'saved' | 'kept' | 'rejected' | 'skipped' | 'unavailable';

/** What calls a Postgres function: resolves to its result, or rejects (network, HTTP error). */
export type RpcCall = (fn: string, args: Record<string, unknown>) => Promise<unknown>;

/** An HTTP error from the server, with PostgREST's error code when it sent one. */
export class RpcError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
  ) {
    super(`rpc failed: ${status} ${code ?? ''}`);
  }
}

/**
 * Errors that mean the leaderboard isn't on the server (the SQL isn't applied yet): PostgREST's
 * "function not found", Postgres' "no such function / table", or a plain 404.
 */
const MISSING_CODES = new Set(['PGRST202', '42883', '42P01']);
const HTTP_NOT_FOUND = 404;

function isMissing(error: unknown): boolean {
  return (
    error instanceof RpcError &&
    (error.status === HTTP_NOT_FOUND || (error.code !== undefined && MISSING_CODES.has(error.code)))
  );
}

const toMs = (seconds: number) => Math.round(seconds * 1000);

export class Leaderboard {
  /** Set once the server says there's no leaderboard: nothing is sent again this page load. */
  private missing = false;

  /** `rpc` is null when the game has no Supabase settings (local builds, CI). */
  constructor(private readonly rpc: RpcCall | null) {}

  /** Whether it may talk to the server at all (configured, and not found missing). */
  get enabled(): boolean {
    return this.rpc !== null && !this.missing;
  }

  /** Submits a finished race. Never rejects. */
  async submit(entry: LeaderboardEntry): Promise<SubmitOutcome> {
    const result = await this.call('submit_record', {
      p_track_id: entry.trackId,
      p_engine_class: entry.engineClass,
      p_nickname: entry.nickname,
      p_device_id: entry.deviceId,
      p_laps: entry.laps,
      p_race_ms: toMs(entry.raceTime),
      p_best_lap_ms: toMs(entry.bestLap),
    });
    if (result === undefined) return 'unavailable';
    const status = (result as { status?: unknown } | null)?.status;
    if (status === 'new' || status === 'improved') return 'saved';
    if (status === 'kept') return 'kept';
    if (status === 'rejected') return 'rejected';
    return 'unavailable';
  }

  /** A board, with this device's row; null when it's unavailable ("Leaderboard unavailable"). */
  async board(trackId: string, engineClass: number, device?: string): Promise<Board | null> {
    const result = await this.call('get_board', {
      p_track_id: trackId,
      p_engine_class: engineClass,
      p_device_id: device ?? null,
    });
    return result === undefined ? null : parseBoard(result);
  }

  /** The function's result, or undefined when it couldn't be had. */
  private async call(fn: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.rpc || this.missing) return undefined;
    try {
      return await this.rpc(fn, args);
    } catch (error) {
      if (isMissing(error)) this.missing = true;
      return undefined;
    }
  }
}

function parseRow(value: unknown): BoardRow | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  const { rank, nickname, race_ms: raceMs, best_lap_ms: bestLapMs, you } = row;
  if (
    typeof rank !== 'number' ||
    typeof nickname !== 'string' ||
    typeof raceMs !== 'number' ||
    typeof bestLapMs !== 'number'
  ) {
    return null;
  }
  return { rank, nickname, raceMs, bestLapMs, you: you === true };
}

/** The board from `get_board()`'s JSON; null if it isn't one. */
export function parseBoard(value: unknown): Board | null {
  if (typeof value !== 'object' || value === null) return null;
  const { total, top, you } = value as Record<string, unknown>;
  if (typeof total !== 'number' || !Array.isArray(top)) return null;
  const rows = top.map(parseRow);
  if (rows.some((row) => row === null)) return null;
  return { total, top: rows as BoardRow[], you: you === null ? null : parseRow(you) };
}

/** Supabase settings baked in at build time (Vercel env vars; see `.env.example`). */
function supabaseConfig(): { url: string; key: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && key ? { url, key } : null;
}

/**
 * Calls Postgres functions through Supabase's REST API (PostgREST `rpc/<fn>`) with the anon key.
 * Plain `fetch`: the leaderboard needs neither supabase-js nor its auth client.
 */
export function restRpc(url: string, key: string, fetchFn: typeof fetch = fetch): RpcCall {
  return async (fn, args) => {
    const response = await fetchFn(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
      throw new RpcError(response.status, typeof body?.code === 'string' ? body.code : undefined);
    }
    return response.json();
  };
}

/** The game's leaderboard: Supabase when the build has its settings, else a disabled one. */
export function supabaseLeaderboard(): Leaderboard {
  const config = supabaseConfig();
  return new Leaderboard(config ? restRpc(config.url, config.key) : null);
}

/**
 * Submits the local kart's finished race if it set a personal best (MK-44's `update`) and the
 * player has a profile (the board shows their nickname). Races loaded from a scenario never
 * count: the caller only passes ranked races.
 */
export function submitFinish(
  leaderboard: Leaderboard,
  store: KeyValueStore,
  state: SimState,
  kartId: number,
  update: RecordUpdate | undefined,
): Promise<SubmitOutcome> {
  const kart = state.karts[kartId];
  const profile = readProfile(store);
  const finishTick = kart?.race.finishTick;
  const personalBest = update !== undefined && (update.newRace || update.newLap);
  if (
    !kart ||
    finishTick === undefined ||
    !kart.race.lapTimes.length ||
    !personalBest ||
    !profile
  ) {
    return Promise.resolve('skipped');
  }
  if (!leaderboard.enabled) return Promise.resolve('unavailable');
  return leaderboard.submit({
    trackId: state.trackId,
    engineClass: state.engineClass,
    nickname: profile.nickname,
    deviceId: deviceId(store),
    laps: state.race.laps,
    raceTime: raceTime(state, finishTick),
    bestLap: Math.min(...kart.race.lapTimes),
  });
}
