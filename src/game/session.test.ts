import { describe, expect, it, vi } from 'vitest';
import { NEUTRAL_INPUT } from '../sim/types';
import { parseLaunchParams } from './launchParams';
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
