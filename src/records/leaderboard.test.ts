import { describe, expect, it, vi } from 'vitest';
import { saveProfile } from '../game/profile';
import { recordFinish } from '../game/results';
import { MemoryStore } from '../game/storage/store';
import { scenarios } from '../scenarios';
import {
  Leaderboard,
  parseBoard,
  restRpc,
  RpcError,
  submitFinish,
  type LeaderboardEntry,
  type RpcCall,
} from './leaderboard';

const ENTRY: LeaderboardEntry = {
  trackId: 'sunny-circuit',
  engineClass: 150,
  nickname: 'Ace',
  deviceId: 'a0000000-0000-4000-8000-000000000001',
  laps: 3,
  raceTime: 125.4321,
  bestLap: 40.0004,
};

const BOARD_JSON = {
  total: 2,
  top: [
    { rank: 1, nickname: 'Ace', race_ms: 125432, best_lap_ms: 40000, you: true },
    { rank: 2, nickname: 'Bee', race_ms: 130000, best_lap_ms: 42000, you: false },
  ],
  you: { rank: 1, nickname: 'Ace', race_ms: 125432, best_lap_ms: 40000, you: true },
};

/** A finished ranked race: a profile, and the local kart's finish saved to the records. */
function finishedRace() {
  const state = scenarios.get('race-finished')!.setup(1).state;
  const store = new MemoryStore();
  saveProfile(store, { nickname: 'Ace', colour: 'red' });
  const update = recordFinish(store, state, 0);
  return { state, store, update };
}

describe('Leaderboard (MK-48)', () => {
  it('submits the race in whole ms and reads the server status', async () => {
    const rpc = vi.fn<RpcCall>().mockResolvedValue({ status: 'new' });
    const outcome = await new Leaderboard(rpc).submit(ENTRY);
    expect(outcome).toBe('saved');
    expect(rpc).toHaveBeenCalledWith('submit_record', {
      p_track_id: 'sunny-circuit',
      p_engine_class: 150,
      p_nickname: 'Ace',
      p_device_id: ENTRY.deviceId,
      p_laps: 3,
      p_race_ms: 125432,
      p_best_lap_ms: 40000,
    });
  });

  it.each([
    [{ status: 'improved' }, 'saved'],
    [{ status: 'kept' }, 'kept'],
    [{ status: 'rejected', reason: 'too_fast' }, 'rejected'],
    [null, 'unavailable'],
    ['nonsense', 'unavailable'],
  ])('server answer %j → %s', async (answer, outcome) => {
    expect(await new Leaderboard(() => Promise.resolve(answer)).submit(ENTRY)).toBe(outcome);
  });

  it('is unavailable, without throwing or logging, when unconfigured, offline or failing', async () => {
    const log = vi.spyOn(console, 'error');
    const warn = vi.spyOn(console, 'warn');
    expect(await new Leaderboard(null).submit(ENTRY)).toBe('unavailable');
    expect(await new Leaderboard(null).board('sunny-circuit', 150)).toBeNull();
    const offline = new Leaderboard(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await offline.submit(ENTRY)).toBe('unavailable');
    expect(await offline.board('sunny-circuit', 150)).toBeNull();
    const failing = new Leaderboard(() => Promise.reject(new RpcError(500, undefined)));
    expect(await failing.submit(ENTRY)).toBe('unavailable');
    // A server error or being offline is worth trying again next time.
    expect(offline.enabled).toBe(true);
    expect(failing.enabled).toBe(true);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    new RpcError(404, 'PGRST202'),
    new RpcError(404, undefined),
    new RpcError(400, '42P01'),
  ])('stops asking once the SQL is missing on the server (%s)', async (error) => {
    const rpc = vi.fn<RpcCall>().mockRejectedValue(error);
    const leaderboard = new Leaderboard(rpc);
    expect(await leaderboard.submit(ENTRY)).toBe('unavailable');
    expect(leaderboard.enabled).toBe(false);
    expect(await leaderboard.board('sunny-circuit', 150)).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('fetches a board with your row', async () => {
    const rpc = vi.fn<RpcCall>().mockResolvedValue(BOARD_JSON);
    const board = await new Leaderboard(rpc).board('sunny-circuit', 150, ENTRY.deviceId);
    expect(rpc).toHaveBeenCalledWith('get_board', {
      p_track_id: 'sunny-circuit',
      p_engine_class: 150,
      p_device_id: ENTRY.deviceId,
    });
    expect(board?.total).toBe(2);
    expect(board?.top[1]).toEqual({
      rank: 2,
      nickname: 'Bee',
      raceMs: 130000,
      bestLapMs: 42000,
      you: false,
    });
    expect(board?.you?.rank).toBe(1);
  });

  it('parses an empty board, and refuses malformed ones', () => {
    expect(parseBoard({ total: 0, top: [], you: null })).toEqual({ total: 0, top: [], you: null });
    expect(parseBoard(null)).toBeNull();
    expect(parseBoard({ total: 1, top: [{ rank: 1 }], you: null })).toBeNull();
    expect(parseBoard({ top: [] })).toBeNull();
  });
});

describe('restRpc', () => {
  it('POSTs the arguments to rpc/<fn> with the anon key', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: 'new' }));
    const rpc = restRpc('https://example.supabase.co', 'anon-key', fetchFn);
    expect(await rpc('submit_record', { p_laps: 3 })).toEqual({ status: 'new' });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://example.supabase.co/rest/v1/rpc/submit_record');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ apikey: 'anon-key', Authorization: 'Bearer anon-key' });
    expect(init?.body).toBe('{"p_laps":3}');
  });

  it('rejects with the HTTP status and PostgREST code', async () => {
    const missing = Response.json({ code: 'PGRST202', message: 'Could not find' }, { status: 404 });
    const rpc = restRpc('https://x', 'k', () => Promise.resolve(missing));
    await expect(rpc('get_board', {})).rejects.toMatchObject({ status: 404, code: 'PGRST202' });
    const html = new Response('<html>', { status: 502 });
    const down = restRpc('https://x', 'k', () => Promise.resolve(html));
    await expect(down('get_board', {})).rejects.toMatchObject({ status: 502, code: undefined });
  });
});

describe('submitFinish (MK-48)', () => {
  it("submits a personal best with the profile's nickname and the device id", async () => {
    const { state, store, update } = finishedRace();
    const rpc = vi.fn<RpcCall>().mockResolvedValue({ status: 'new' });
    expect(await submitFinish(new Leaderboard(rpc), store, state, 0, update)).toBe('saved');
    const args = rpc.mock.calls[0]![1];
    const kart = state.karts[0]!;
    expect(args).toMatchObject({
      p_track_id: state.trackId,
      p_engine_class: state.engineClass,
      p_nickname: 'Ace',
      p_laps: state.race.laps,
      p_best_lap_ms: Math.round(Math.min(...kart.race.lapTimes) * 1000),
    });
    expect(args.p_device_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('skips a race that set no personal best, and a player with no profile', async () => {
    const { state, store, update } = finishedRace();
    const rpc = vi.fn<RpcCall>().mockResolvedValue({ status: 'new' });
    const leaderboard = new Leaderboard(rpc);
    // The same race again is no faster: no new record, nothing sent.
    const again = recordFinish(store, state, 0);
    expect(again?.newRace || again?.newLap).toBe(false);
    expect(await submitFinish(leaderboard, store, state, 0, again)).toBe('skipped');
    expect(await submitFinish(leaderboard, new MemoryStore(), state, 0, update)).toBe('skipped');
    expect(await submitFinish(leaderboard, store, state, 0, undefined)).toBe('skipped');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('never throws when the leaderboard is offline or missing', async () => {
    const { state, store, update } = finishedRace();
    const offline = new Leaderboard(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(submitFinish(offline, store, state, 0, update)).resolves.toBe('unavailable');
    await expect(submitFinish(new Leaderboard(null), store, state, 0, update)).resolves.toBe(
      'unavailable',
    );
  });
});
