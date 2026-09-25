import { describe, expect, it } from 'vitest';
import { parseLaunchParams } from './launchParams';

describe('parseLaunchParams', () => {
  it('reads scenario, seed and paused', () => {
    expect(parseLaunchParams('?scenario=moving&seed=42&paused=1')).toEqual({
      scenario: 'moving',
      seed: 42,
      paused: true,
      tune: false,
      reducedMotion: false,
      aiDebug: false,
      perf: false,
      netdebug: false,
    });
  });

  it('defaults to no scenario, no seed, not paused', () => {
    expect(parseLaunchParams('')).toEqual({
      paused: false,
      tune: false,
      reducedMotion: false,
      aiDebug: false,
      perf: false,
      netdebug: false,
    });
  });

  it('ignores a non-numeric seed', () => {
    expect(parseLaunchParams('?seed=abc')).toEqual({
      paused: false,
      tune: false,
      reducedMotion: false,
      aiDebug: false,
      perf: false,
      netdebug: false,
    });
  });

  it('accepts seed 0', () => {
    expect(parseLaunchParams('?seed=0').seed).toBe(0);
  });

  it('reads the tune flag', () => {
    expect(parseLaunchParams('?tune=1').tune).toBe(true);
  });

  it('reads the kart override', () => {
    expect(parseLaunchParams('?scenario=test-pad&kart=boulder').kart).toBe('boulder');
  });
});

describe('ai-debug flag (MK-15)', () => {
  it('reads &ai-debug=1', () => {
    expect(parseLaunchParams('?scenario=ai-drift-corner&ai-debug=1').aiDebug).toBe(true);
  });
});

describe('online params (MK-46)', () => {
  it('reads net, role, room, laps and netdebug', () => {
    expect(
      parseLaunchParams('?scenario=online-race-2p&net=local&role=client&room=r1&laps=1&netdebug=1'),
    ).toMatchObject({ net: 'local', role: 'client', room: 'r1', laps: 1, netdebug: true });
  });

  it('turns &netsim=<rtt>,<jitter>,<loss%> into one-way conditions', () => {
    expect(parseLaunchParams('?netsim=200,50,8').netsim).toEqual({
      lagMs: 100,
      jitterMs: 50,
      loss: 0.08,
    });
  });

  it('ignores unknown transports, roles and bad lap counts', () => {
    const params = parseLaunchParams('?net=webrtc&role=spectator&laps=0');
    expect(params.net).toBeUndefined();
    expect(params.role).toBeUndefined();
    expect(params.laps).toBeUndefined();
  });
});
