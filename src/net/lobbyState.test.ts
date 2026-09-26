import { describe, expect, it } from 'vitest';
import { createRace } from '../sim/race/createRace';
import {
  allReady,
  defaultSettings,
  kartOf,
  KARTS_PER_RACE,
  lobbySlots,
  raceOptions,
  settingsOf,
  type LobbyContent,
  type LobbyStart,
} from './lobbyState';
import { sortMembers } from './room';
import type { RoomMember } from './roomBackend';

const CONTENT: LobbyContent = {
  trackIds: ['sunny-circuit', 'other-track'],
  racerIds: ['maple', 'boulder', 'pixie', 'swoop'],
};

function member(id: string, fields: Partial<RoomMember> = {}): RoomMember {
  return {
    id,
    nickname: id.toUpperCase(),
    colour: '#fff',
    racer: 'maple',
    ready: false,
    isHost: false,
    joinedAt: 0,
    ...fields,
  };
}

const HOST = member('h', {
  isHost: true,
  racer: 'swoop',
  lobby: { trackId: 'sunny-circuit', cc: 150, itemsOn: false },
});

describe('lobby settings', () => {
  it('everyone reads the host’s settings', () => {
    expect(settingsOf([member('a'), HOST], CONTENT)).toEqual({
      trackId: 'sunny-circuit',
      cc: 150,
      itemsOn: false,
    });
  });

  it('defaults stand in until the host’s arrive, and for anything this build lacks', () => {
    expect(settingsOf([member('a')], CONTENT)).toEqual(defaultSettings(CONTENT));
    expect(defaultSettings(CONTENT)).toEqual({ trackId: 'sunny-circuit', cc: 100, itemsOn: true });
    const odd = member('h', {
      isHost: true,
      lobby: { trackId: 'moon-base', cc: 200 as never, itemsOn: true },
    });
    expect(settingsOf([odd], CONTENT)).toEqual({
      trackId: 'sunny-circuit',
      cc: 100,
      itemsOn: true,
    });
  });
});

describe('ready', () => {
  it('the host can start once everyone else is ready (alone: at once)', () => {
    expect(allReady([HOST])).toBe(true);
    expect(allReady([HOST, member('a', { ready: true }), member('b')])).toBe(false);
    expect(allReady([HOST, member('a', { ready: true }), member('b', { ready: true })])).toBe(true);
  });
});

describe('slots', () => {
  it('follow join order, host first, whatever order presence lists them in', () => {
    const a = member('a', { joinedAt: 20 });
    const b = member('b', { joinedAt: 10, racer: 'pixie' });
    const host = { ...HOST, joinedAt: 30, seats: ['h', 'b', 'a'] };
    for (const listed of [
      [a, b, host],
      [host, a, b],
      [b, host, a],
    ]) {
      expect(lobbySlots(sortMembers(listed)).map((s) => s.id)).toEqual(['h', 'b', 'a']);
    }
    expect(lobbySlots(sortMembers([a, b, host]))).toEqual([
      { id: 'h', racer: 'swoop', nickname: 'H' },
      { id: 'b', racer: 'pixie', nickname: 'B' },
      { id: 'a', racer: 'maple', nickname: 'A' },
    ]);
  });
});

describe('race options', () => {
  const start: LobbyStart = {
    id: 'r1',
    seed: 42,
    slots: [
      { id: 'h', racer: 'swoop', nickname: 'Hosty' },
      { id: 'c', racer: 'swoop', nickname: 'Guesty' },
    ],
  };
  const settings = { trackId: 'sunny-circuit', cc: 100 as const, itemsOn: false };

  it('seat the humans on karts 0..n-1 and fill with AI to 8', () => {
    const race = raceOptions(settings, start, 'h', CONTENT);
    expect(race.racers).toHaveLength(KARTS_PER_RACE);
    expect(race.racers.map((r) => r.controller)).toEqual([
      'local',
      'remote',
      ...Array<string>(6).fill('ai'),
    ]);
    // Duplicate racers are fine; the humans carry their nicknames.
    expect(race.racers.slice(0, 2)).toEqual([
      { kartId: 'swoop', controller: 'local', name: 'Hosty' },
      { kartId: 'swoop', controller: 'remote', name: 'Guesty' },
    ]);
    expect(race.racers.slice(2).map((r) => r.kartId)).toEqual([
      'pixie',
      'swoop',
      'maple',
      'boulder',
      'pixie',
      'swoop',
    ]);
    expect(race).toMatchObject({ trackId: 'sunny-circuit', engineClass: 100, itemsOn: false });
    expect(race.seed).toBe(42);
  });

  it('each device is `local` on its own kart; the rest of the race is identical', () => {
    const host = raceOptions(settings, start, 'h', CONTENT);
    const client = raceOptions(settings, start, 'c', CONTENT);
    expect(client.racers[1]?.controller).toBe('local');
    expect(client.racers[0]?.controller).toBe('remote');
    const karts = (options: typeof host) => options.racers.map((r) => r.kartId);
    expect(karts(client)).toEqual(karts(host));
    // Same grid, same AI personalities: the same race.
    const hostState = createRace(host);
    const clientState = createRace(client);
    expect(clientState.karts.map((k) => k.position)).toEqual(
      hostState.karts.map((k) => k.position),
    );
    expect(clientState.karts.map((k) => k.ai)).toEqual(hostState.karts.map((k) => k.ai));
    expect(hostState.entities).toEqual([]);
  });

  it('a full room of 4 leaves 4 AI; an unknown racer becomes the first racer', () => {
    const four: LobbyStart = {
      ...start,
      slots: ['a', 'b', 'c', 'd'].map((id) => ({ id, racer: 'mystery', nickname: id })),
    };
    const race = raceOptions(settings, four, 'b', CONTENT);
    expect(race.racers.filter((r) => r.controller === 'ai')).toHaveLength(4);
    expect(race.racers[0]?.kartId).toBe('maple');
  });

  it('kartOf finds a member’s kart, -1 for someone who joined after the start', () => {
    expect(kartOf(start, 'h')).toBe(0);
    expect(kartOf(start, 'c')).toBe(1);
    expect(kartOf(start, 'late')).toBe(-1);
  });
});
