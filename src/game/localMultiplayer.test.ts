import { describe, expect, it, vi } from 'vitest';
import { TestSource } from '../input/sources';
import { localRace } from '../scenarios/local';
import { sunnyRace } from '../scenarios/race';
import { NEUTRAL_INPUT } from '../sim/types';
import { parseLaunchParams } from './launchParams';
import { resultLines } from './results';
import { RaceSession, resolveLaunch, slotKartsOf } from './session';

// The real controls listen on `window`; unit tests run in Node. P1 holds the throttle.
vi.mock('../input/playerInput', () => ({
  PlayerInput: class {
    readonly touch = { setActive: () => {} };
    read = () => ({ ...NEUTRAL_INPUT, throttle: 1 });
  },
}));

const GO = 4 * 60;

describe('local multiplayer (MK-144)', () => {
  it('a 4-player race has 4 local karts at the back of the grid and 4 AI', () => {
    const state = localRace(1, 4);
    expect(state.karts.map((k) => k.controller)).toEqual([
      'local',
      'local',
      'local',
      'local',
      'ai',
      'ai',
      'ai',
      'ai',
    ]);
    expect(slotKartsOf(state, 4)).toEqual([0, 1, 2, 3]);
    expect(slotKartsOf(state, 2)).toEqual([0, 1]);
  });

  it('1-player races are unchanged by the multiplayer options', () => {
    const before = sunnyRace(3, { karts: 8, ai: true, engineClass: 150 });
    const after = sunnyRace(3, { karts: 8, ai: true, engineClass: 150, otherPlayers: [] });
    expect(after).toEqual(before);
  });

  it('each slot’s source drives only its own kart', () => {
    const p2 = new TestSource();
    const p3 = new TestSource();
    const p4 = new TestSource();
    const session = new RaceSession(localRace(1, 4), 4, [new TestSource(), p2, p3, p4]);
    expect(session.slotKarts).toEqual([0, 1, 2, 3]);
    p2.set({ steer: -1 });
    p3.set({ brake: 1 });
    session.game.stepTicks(1);
    const inputs = session.inputs();
    expect(inputs[0]).toMatchObject({ throttle: 1, steer: 0 }); // P1: this device's controls
    expect(inputs[1]).toMatchObject({ throttle: 0, steer: -1 });
    expect(inputs[2]).toMatchObject({ throttle: 0, brake: 1 });
    expect(inputs[3]).toEqual(NEUTRAL_INPUT);
    expect(inputs[4]).toBeUndefined(); // AI
  });

  it('only the throttling players’ karts move off the line', () => {
    const p2 = new TestSource();
    const session = new RaceSession(localRace(1, 3), 3, [new TestSource(), p2, new TestSource()]);
    p2.set({ throttle: 1 });
    session.game.stepTicks(GO + 60);
    const [p1, p2Kart, p3] = session.game.state.karts;
    expect(p1!.speed).toBeGreaterThan(5);
    expect(p2Kart!.speed).toBeGreaterThan(5);
    expect(p3!.speed).toBeLessThan(0.5);
  });

  it('players without a controller get the Auto stand-in, which drives itself', () => {
    const session = new RaceSession(localRace(1, 2), 2);
    expect(session.slots.isStandIn(1)).toBe(true);
    session.game.stepTicks(GO + 120);
    expect(session.game.state.karts[1]!.speed).toBeGreaterThan(5);
  });

  it('startRace with other players loads them as local karts with AI filling to 8', () => {
    const session = new RaceSession(resolveLaunch(parseLaunchParams('')).state);
    session.startRace({
      seed: 2,
      engineClass: 100,
      playerKart: 'maple',
      trackId: 'sunny-circuit',
      otherPlayers: ['boulder', 'coral'],
    });
    const { karts } = session.game.state;
    expect(karts).toHaveLength(8);
    expect(karts.slice(0, 3).map((k) => [k.kartType, k.controller])).toEqual([
      ['maple', 'local'],
      ['boulder', 'local'],
      ['coral', 'local'],
    ]);
    expect(session.players).toBe(3);
    // Back to one player for the next plain race.
    session.startRace({ seed: 3, engineClass: 100, playerKart: 'maple', trackId: 'sunny-circuit' });
    expect(session.players).toBe(1);
    expect(session.slotKarts).toEqual([session.localKartId]);
  });

  it('pause from any slot reports that slot', () => {
    const p2 = new TestSource();
    const session = new RaceSession(localRace(1, 2), 2, [new TestSource(), p2]);
    expect(session.takePause()).toBe(-1);
    p2.pressPause();
    expect(session.takePause()).toBe(1);
  });

  it('the scenarios boot with their players and fake controllers', () => {
    for (const [name, players] of [
      ['local-2p', 2],
      ['local-4p', 4],
    ] as const) {
      const launch = resolveLaunch(parseLaunchParams(`?scenario=${name}`));
      expect(launch.players).toBe(players);
      expect(launch.slotSources).toHaveLength(players);
      const session = new RaceSession(launch.state, launch.players, launch.slotSources);
      expect(session.slotKarts).toHaveLength(players);
    }
  });

  it.each([2, 4])('a %i-player race runs to the finish; every player gets a result row', (n) => {
    // Every player on the autopilot (P1 too), so the race ends when they have all finished.
    const session = new RaceSession(localRace(7, n), n);
    for (let slot = 0; slot < n; slot += 1) session.game.setAutopilot(slot, true);
    for (let i = 0; i < 60 * 60 * 6 && session.game.state.phase !== 'finished'; i += 1) {
      session.game.stepTicks(60);
    }
    const { state } = session.game;
    expect(state.phase).toBe('finished');
    const rows = resultLines(state, session.slotKarts);
    const players = rows.filter((r) => r.player !== undefined);
    expect(players.map((r) => r.player).sort()).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    for (const row of players) {
      expect(row.you).toBe(true);
      expect(row.time).toBeGreaterThan(0);
    }
    expect(rows).toHaveLength(8);
  });
});

describe('resultLines', () => {
  it('marks only "you" with a single player', () => {
    const state = localRace(1, 2);
    const rows = resultLines(state, 0);
    expect(rows.filter((r) => r.you)).toHaveLength(1);
    expect(rows.some((r) => r.player !== undefined)).toBe(false);
  });
});

describe('local multiplayer in MK8 races (MK-148)', () => {
  it('a race from a field seats every local racer as a player, P1 first', () => {
    const session = new RaceSession(sunnyRace(1, { karts: 1, ai: false, engineClass: 150 }));
    const racers = [
      { kartId: 'maple' as const, controller: 'local' as const, gridSlot: 5 },
      { kartId: 'boulder' as const, controller: 'local' as const, gridSlot: 6 },
      ...[0, 1, 2, 3, 4, 7].map((gridSlot) => ({
        kartId: 'coral' as const,
        controller: 'ai' as const,
        gridSlot,
      })),
    ];
    session.startRace({
      seed: 1,
      engineClass: 150,
      playerKart: 'maple',
      trackId: 'sunny-circuit',
      racers,
    });
    expect(session.players).toBe(2);
    expect(session.slotKarts).toEqual([0, 1]);
    // A field with one local racer (a Grand Prix, Time Trial) stays one player.
    session.startRace({
      seed: 1,
      engineClass: 150,
      playerKart: 'maple',
      trackId: 'sunny-circuit',
      racers: racers.map((r, i) => (i === 1 ? { ...r, controller: 'ai' as const } : r)),
    });
    expect(session.players).toBe(1);
    expect(session.slotKarts).toEqual([0]);
  });
});
