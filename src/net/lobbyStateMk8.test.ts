import { describe, expect, it } from 'vitest';
import type { Loadout } from '../sim/types';
import {
  defaultSettings,
  engineClassesOf,
  lobbySlots,
  packLabel,
  packWaiting,
  raceOptions,
  roomPack,
  settingsOf,
  type LobbyContent,
  type LobbyStart,
  type MemberPack,
} from './lobbyState';
import type { RoomMember } from './roomBackend';

/** MK8 rooms (MK-132): the pack, loadouts and everyone's course in the lobby. */

const MARIO: Loadout = {
  racer: 'mk8-mario',
  body: 'standard-kart',
  tires: 'standard-tires',
  glider: 'paper-glider',
};
const BOWSER: Loadout = {
  racer: 'mk8-bowser',
  body: 'b-dasher',
  tires: 'slick-tires',
  glider: 'paper-glider',
};
const TOAD: Loadout = {
  racer: 'mk8-toad',
  body: 'pipe-frame',
  tires: 'slim-tires',
  glider: 'cloud-glider',
};
const MK8: LobbyContent = {
  trackIds: ['mk8-test-ramp', 'mk8-stadium'],
  racerIds: ['mk8-mario', 'mk8-bowser', 'mk8-toad'],
  pack: 'mk8',
  aiLoadouts: [TOAD, MARIO],
};
const ORIGINAL: LobbyContent = { trackIds: ['sunny-circuit'], racerIds: ['maple', 'boulder'] };

function member(id: string, fields: Partial<RoomMember> = {}): RoomMember {
  return {
    id,
    nickname: id.toUpperCase(),
    colour: '#fff',
    racer: 'mk8-mario',
    ready: true,
    isHost: false,
    joinedAt: 0,
    ...fields,
  };
}

const ready = (course: string, hash = 'abc'): MemberPack => ({ course, state: 'ready', hash });

function mk8Room(guestPack?: MemberPack): RoomMember[] {
  return [
    member('h', {
      isHost: true,
      loadout: BOWSER,
      racer: 'mk8-bowser',
      lobby: { trackId: 'mk8-stadium', cc: 200, itemsOn: true, pack: 'mk8' },
      pack: ready('mk8-stadium'),
    }),
    member('g', { loadout: MARIO, ...(guestPack ? { pack: guestPack } : {}) }),
  ];
}

describe('MK8 rooms in the lobby (MK-132)', () => {
  it('start an MK8 room on its first course at 150cc, with 200cc on offer', () => {
    expect(defaultSettings(MK8)).toEqual({
      trackId: 'mk8-test-ramp',
      cc: 150,
      itemsOn: true,
      pack: 'mk8',
    });
    expect(defaultSettings(ORIGINAL).pack).toBeUndefined();
    expect(engineClassesOf('mk8')).toContain(200);
    expect(engineClassesOf(undefined)).not.toContain(200);
  });

  it("read the host's pack and 200cc from presence", () => {
    const members = mk8Room();
    expect(roomPack(members)).toBe('mk8');
    expect(settingsOf(members, MK8)).toEqual({
      trackId: 'mk8-stadium',
      cc: 200,
      itemsOn: true,
      pack: 'mk8',
    });
    // An original room never offers 200cc, nor turns into an MK8 one.
    const original = [
      member('h', { isHost: true, lobby: { trackId: 'sunny-circuit', cc: 200, itemsOn: true } }),
    ];
    expect(roomPack(original)).toBeUndefined();
    expect(settingsOf(original, ORIGINAL).cc).toBe(100);
  });

  it('build the race with everyone’s loadout, the AI’s, and MK8’s item set', () => {
    const members = mk8Room(ready('mk8-stadium'));
    const start: LobbyStart = { id: 's', seed: 9, slots: lobbySlots(members) };
    expect(start.slots.map((s) => s.loadout)).toEqual([BOWSER, MARIO]);
    const race = raceOptions(settingsOf(members, MK8), start, 'g', MK8);
    expect(race).toMatchObject({
      trackId: 'mk8-stadium',
      engineClass: 200,
      itemSet: 'mk8',
      seed: 9,
    });
    expect(race.racers.slice(0, 2)).toEqual([
      { kartId: 'mk8-bowser', controller: 'remote', name: 'H', loadout: BOWSER },
      { kartId: 'mk8-mario', controller: 'local', name: 'G', loadout: MARIO },
    ]);
    // AI kart i takes the AI loadouts in turn from i (here 2 → TOAD, 3 → MARIO…).
    expect(race.racers[2]).toEqual({ kartId: 'mk8-toad', controller: 'ai', loadout: TOAD });
    expect(race.racers[3]).toEqual({ kartId: 'mk8-mario', controller: 'ai', loadout: MARIO });
    expect(race.racers).toHaveLength(8);
  });

  it('keep original rooms’ races as they were: no loadouts, no item set', () => {
    const members = [
      member('h', {
        isHost: true,
        racer: 'boulder',
        loadout: MARIO,
        lobby: { trackId: 'sunny-circuit', cc: 100, itemsOn: true },
      }),
    ];
    const start: LobbyStart = { id: 's', seed: 1, slots: lobbySlots(members) };
    const race = raceOptions(settingsOf(members, ORIGINAL), start, 'h', ORIGINAL);
    expect(race.itemSet).toBeUndefined();
    expect(race.racers[0]).toEqual({ kartId: 'boulder', controller: 'local', name: 'H' });
    expect(race.racers.every((r) => r.loadout === undefined)).toBe(true);
  });

  it('wait for everyone to have the host’s course, the same version', () => {
    const ids = (members: RoomMember[]) => packWaiting(members, 'mk8-stadium').map((m) => m.id);
    expect(ids(mk8Room())).toEqual(['g']);
    expect(ids(mk8Room({ course: 'mk8-stadium', state: 'loading', progress: 0.5 }))).toEqual(['g']);
    expect(ids(mk8Room(ready('mk8-test-ramp')))).toEqual(['g']); // the previous course
    expect(ids(mk8Room(ready('mk8-stadium', 'other')))).toEqual(['g']); // another pack
    expect(ids(mk8Room(ready('mk8-stadium')))).toEqual([]);
    // Original rooms never wait.
    expect(packWaiting([member('h', { isHost: true })], 'sunny-circuit')).toEqual([]);
  });

  it('say how each player’s course stands', () => {
    const label = (pack?: MemberPack) => {
      const members = mk8Room(pack);
      return packLabel(members[1]!, 'mk8-stadium', members[0]);
    };
    expect(label()).toBe('Loading course…');
    expect(label({ course: 'mk8-stadium', state: 'loading', progress: 0.25 })).toBe(
      'Loading course 25%',
    );
    expect(label({ course: 'mk8-stadium', state: 'missing' })).toBe('MK8 pack not installed');
    expect(label({ course: 'mk8-stadium', state: 'locked' })).toBe('Needs the MK8 password');
    expect(label({ course: 'mk8-stadium', state: 'failed' })).toBe("Couldn't load the course");
    expect(label(ready('mk8-stadium', 'other'))).toBe('Different pack: reload');
    expect(label(ready('mk8-stadium'))).toBe('');
  });
});
