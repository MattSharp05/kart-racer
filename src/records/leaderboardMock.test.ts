import { describe, expect, it } from 'vitest';
import { saveProfile } from '../game/profile';
import { MemoryStore } from '../game/storage/store';
import { scenarios } from '../scenarios';
import { raceTime } from '../sim/raceFlow';
import type { SimState } from '../sim/types';
import { Leaderboard, submitFinish, type LeaderboardEntry } from './leaderboard';
import {
  launchLeaderboard,
  MOCK_MODE_KEY,
  MOCK_YOUR_RANK,
  MOCK_YOUR_RANK_50CC,
  mockRpc,
} from './leaderboardMock';

const DEVICE = 'a0000000-0000-4000-8000-000000000001';

const ENTRY_OF = (state: SimState): LeaderboardEntry => ({
  trackId: state.trackId,
  engineClass: state.engineClass,
  nickname: 'Ace',
  deviceId: DEVICE,
  laps: 3,
  raceTime: 0,
  bestLap: 0,
});

function mockBoard(mode?: string) {
  const store = new MemoryStore();
  if (mode) store.set(MOCK_MODE_KEY, mode);
  saveProfile(store, { nickname: 'Ace', colour: 'teal' });
  return { store, leaderboard: new Leaderboard(mockRpc(store), true) };
}

describe('mock leaderboard (MK-56)', () => {
  it('fills a board: the top 20 by time with shared ranks, your row at #37', async () => {
    const { leaderboard } = mockBoard();
    const board = await leaderboard.board('sunny-circuit', 150, DEVICE);
    expect(board?.total).toBe(48);
    expect(board?.top).toHaveLength(20);
    expect(board?.top.map((r) => r.rank)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    const times = board!.top.map((r) => r.raceMs);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(board?.top.every((r) => r.racer && r.colour && !r.you)).toBe(true);
    expect(board?.you).toMatchObject({ rank: MOCK_YOUR_RANK, nickname: 'Ace', colour: 'teal' });
  });

  it('gives each board its own rows; at 50cc your row is in the top list', async () => {
    const { leaderboard } = mockBoard();
    const sunny = await leaderboard.board('sunny-circuit', 150, DEVICE);
    const dune = await leaderboard.board('dune-canyon', 150, DEVICE);
    expect(dune?.top[0]).not.toEqual(sunny?.top[0]);
    const slow = await leaderboard.board('sunny-circuit', 50, DEVICE);
    expect(slow?.you?.rank).toBe(MOCK_YOUR_RANK_50CC);
    expect(slow?.top.find((r) => r.you)?.rank).toBe(MOCK_YOUR_RANK_50CC);
    expect(slow!.top[0]!.raceMs).toBeGreaterThan(sunny!.top[0]!.raceMs);
  });

  it('empty mode: empty boards', async () => {
    const { leaderboard } = mockBoard('empty');
    expect(await leaderboard.board('sunny-circuit', 150, DEVICE)).toEqual({
      total: 0,
      top: [],
      you: null,
    });
  });

  it('ranks a submitted race among the made-up rows; a slower one is kept', async () => {
    const { store, leaderboard } = mockBoard();
    const state = scenarios.get('race-finished')!.setup(1).state;
    expect(await submitFinish(leaderboard, store, state, 0)).toBe('saved');
    const board = await leaderboard.board(state.trackId, state.engineClass, DEVICE);
    const raceMs = Math.round(raceTime(state, state.karts[0]!.race.finishTick!) * 1000);
    expect(board?.you).toMatchObject({ raceMs, nickname: 'Ace', colour: 'teal' });
    expect(board?.total).toBe(48);
    // Ranked among the made-up rows: behind every faster one in the top list.
    const faster = board!.top.filter((r) => !r.you && r.raceMs < raceMs).length;
    expect(board?.you?.rank).toBe(faster + 1);
    expect(board?.you?.rank).toBeLessThan(20);
    // The same race again is no better: kept, the row stays.
    expect(await leaderboard.submit({ ...ENTRY_OF(state), raceTime: raceMs / 1000 + 1 })).toBe(
      'kept',
    );
  });

  it('launchLeaderboard: ?lb= wins, else the scenario mode, else the real (unconfigured) one', async () => {
    const plain = new MemoryStore();
    expect(launchLeaderboard(undefined, plain).test).toBe(false);
    expect(launchLeaderboard('mock', plain).test).toBe(true);
    const offline = launchLeaderboard('offline', plain);
    expect(await offline.board('sunny-circuit', 150, DEVICE)).toBeNull();
    const scenario = new MemoryStore();
    scenario.set(MOCK_MODE_KEY, 'offline');
    expect(await launchLeaderboard(undefined, scenario).board('sunny-circuit', 150)).toBeNull();
    scenario.set(MOCK_MODE_KEY, 'filled');
    expect(await launchLeaderboard(undefined, scenario).board('sunny-circuit', 150)).not.toBeNull();
    expect(await launchLeaderboard('offline', scenario).board('sunny-circuit', 150)).toBeNull();
  });
});
