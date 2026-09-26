import { describe, expect, it, vi } from 'vitest';
import { NEUTRAL_INPUT } from '../sim/types';
import { parseLaunchParams } from './launchParams';
import { NETSIM_PRESETS } from '../scenarios/online';
import { RaceSession, resolveLaunch } from './session';

// The real controls listen on `window`; unit tests run in Node.
vi.mock('../input/playerInput', () => ({
  PlayerInput: class {
    readonly touch = { setActive: () => {} };
    read = () => ({ ...NEUTRAL_INPUT, throttle: 1 });
  },
}));

describe('resolveLaunch', () => {
  it('boots to the title screen over an attract-mode race without a scenario', () => {
    const launch = resolveLaunch(parseLaunchParams(''));
    expect(launch.screen).toBe('title');
    expect(launch.scenario).toBeUndefined();
    expect(launch.state.karts.length).toBeGreaterThan(1);
  });

  it('loads a named scenario with its view, follow target and menu screen', () => {
    const race = resolveLaunch(parseLaunchParams('?scenario=race-countdown'));
    expect(race).toMatchObject({ scenario: 'race-countdown', view: 'chase', follow: 0 });
    expect(race.state.phase).toBe('countdown');
    expect(resolveLaunch(parseLaunchParams('?scenario=menu-paused')).screen).toBe('paused');
  });

  it('applies &item= and &kart= to the player kart', () => {
    const launch = resolveLaunch(parseLaunchParams('?scenario=empty&item=star&kart=boulder'));
    expect(launch.state.karts[0]?.item.held).toBe('star');
    expect(launch.state.karts[0]?.kartType).toBe('boulder');
  });

  it('follows and equips the local kart when it is not kart 0', () => {
    const launch = resolveLaunch(parseLaunchParams('?scenario=race-local-kart-3&item=star'));
    expect(launch).toMatchObject({ localKartId: 3, follow: 3 });
    expect(launch.state.karts[3]?.item.held).toBe('star');
    expect(launch.state.karts[0]?.item.held).toBeNull();
  });

  it('is deterministic for a seed', () => {
    const a = resolveLaunch(parseLaunchParams('?scenario=race-countdown&seed=5'));
    const b = resolveLaunch(parseLaunchParams('?scenario=race-countdown&seed=5'));
    expect(a.state).toEqual(b.state);
  });
});

describe('RaceSession', () => {
  it('feeds the local controls to kart 0 and remembers the last input', () => {
    const session = new RaceSession(resolveLaunch(parseLaunchParams('?scenario=empty')).state);
    session.game.stepTicks(1);
    expect(session.playerInput.throttle).toBe(1);
    expect(session.game.state.karts[0]!.speed).toBeGreaterThan(0);
  });

  it('feeds the local controls to the local kart, whichever id it has', () => {
    const session = new RaceSession(
      resolveLaunch(parseLaunchParams('?scenario=race-local-kart-3')).state,
    );
    expect(session.localKartId).toBe(3);
    expect(session.inputs()[0]).toBeUndefined();
    session.game.stepTicks(1);
    expect(session.inputs()[3]?.throttle).toBe(1);
    expect(session.game.state.karts[3]!.race.throttleSince).toBeDefined();
    expect(session.game.state.karts[0]!.race.throttleSince).toBeUndefined();
  });

  it('startRace loads the player plus 7 AI karts at the chosen class', () => {
    const session = new RaceSession(resolveLaunch(parseLaunchParams('')).state);
    session.startRace({ seed: 2, engineClass: 150, playerKart: 'boulder' });
    const state = session.game.state;
    expect(state.karts).toHaveLength(8);
    expect(state.engineClass).toBe(150);
    expect(state.karts[0]?.kartType).toBe('boulder');
    expect(state.phase).toBe('countdown');
    expect(state.tick).toBe(0);
  });

  it('stop freezes the sim', () => {
    const session = new RaceSession(resolveLaunch(parseLaunchParams('?scenario=empty')).state);
    session.stop();
    session.game.frame(1);
    expect(session.game.state.tick).toBe(0);
  });
});

describe('online scenarios (MK-46)', () => {
  it('host the race by default, in the local room', () => {
    const launch = resolveLaunch(parseLaunchParams('?scenario=online-race-2p'));
    expect(launch).toMatchObject({ scenario: 'online-race-2p', localKartId: 0 });
    expect(launch.online).toMatchObject({ role: 'host', room: 'local' });
    expect(launch.online?.race.racers.map((r) => r.controller)).toEqual([
      'local',
      'remote',
      'ai',
      'ai',
      'ai',
      'ai',
      'ai',
      'ai',
    ]);
  });

  it('join as a client driving nothing until the host says which kart', () => {
    const launch = resolveLaunch(
      parseLaunchParams('?scenario=online-race-4p&net=local&role=client&room=r&laps=1'),
    );
    expect(launch.localKartId).toBe(-1);
    expect(launch.online).toMatchObject({ role: 'client', room: 'r', race: { laps: 1 } });
    expect(launch.state.race.laps).toBe(1);
    expect(launch.online?.race.racers.filter((r) => r.controller === 'remote')).toHaveLength(3);
  });

  it('take the preset network, unless the URL sets one', () => {
    expect(resolveLaunch(parseLaunchParams('?scenario=net-bad')).online?.netsim).toEqual(
      NETSIM_PRESETS.bad,
    );
    expect(
      resolveLaunch(parseLaunchParams('?scenario=net-bad&netsim=40,0,0')).online?.netsim,
    ).toEqual({ lagMs: 20, jitterMs: 0, loss: 0 });
    expect(resolveLaunch(parseLaunchParams('?scenario=online-race-2p')).online?.netsim).toBe(
      undefined,
    );
  });

  it('goOnline steps the game through the online race; stop goes back to the local sim', () => {
    const launch = resolveLaunch(parseLaunchParams('?scenario=online-race-2p&room=session-a'));
    const session = new RaceSession(launch.state);
    session.goOnline(launch.online!);
    expect(session.online?.info().role).toBe('host');
    session.game.stepTicks(5);
    expect(session.game.state.tick).toBe(0); // waiting for the client
    session.stop();
    expect(session.online).toBeNull();
    session.game.stepTicks(5);
    expect(session.game.state.tick).toBe(5);
  });
});

describe('room launches (MK-40)', () => {
  it('a room link joins that room, code upper-cased, over Supabase unless net=local', () => {
    const launch = resolveLaunch(parseLaunchParams('?room=k7qx'));
    expect(launch).toMatchObject({ screen: 'title', lobby: { role: 'client', code: 'K7QX' } });
    expect(launch.localRooms).toBe(false);
    expect(resolveLaunch(parseLaunchParams('?room=K7QX&net=local')).localRooms).toBe(true);
    expect(resolveLaunch(parseLaunchParams('')).lobby).toBeUndefined();
  });

  it('online-lobby creates a room by default, joins with role=client, and uses local rooms', () => {
    const host = resolveLaunch(parseLaunchParams('?scenario=online-lobby'));
    expect(host).toMatchObject({ screen: 'title', lobby: { role: 'host' }, localRooms: true });
    expect(host.lobby?.code).toBeUndefined();
    const client = resolveLaunch(parseLaunchParams('?scenario=online-lobby&role=client&room=test'));
    expect(client.lobby).toEqual({ role: 'client', code: 'TEST' });
  });

  it('an online race scenario is not a lobby', () => {
    expect(resolveLaunch(parseLaunchParams('?scenario=online-race-2p&room=r')).lobby).toBe(
      undefined,
    );
  });
});
