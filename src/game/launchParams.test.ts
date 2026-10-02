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

describe('quality flag (MK-71)', () => {
  it('reads &quality=low, and leaves it out otherwise', () => {
    expect(parseLaunchParams('?scenario=track-cog-works&quality=low').lowQuality).toBe(true);
    expect(parseLaunchParams('?scenario=track-cog-works').lowQuality).toBeUndefined();
  });
});

describe('leaderboard param (MK-56)', () => {
  it('reads &lb=mock and &lb=offline, and ignores anything else', () => {
    expect(parseLaunchParams('?scenario=leaderboard&lb=mock').lb).toBe('mock');
    expect(parseLaunchParams('?lb=offline').lb).toBe('offline');
    expect(parseLaunchParams('?lb=real')).not.toHaveProperty('lb');
  });
});

describe('online params (MK-46)', () => {
  it('reads net, role, room, laps and netdebug', () => {
    expect(
      parseLaunchParams('?scenario=online-race-2p&net=local&role=client&room=r1&laps=1&netdebug=1'),
    ).toMatchObject({ net: 'local', role: 'client', room: 'r1', laps: 1, netdebug: true });
  });

  it('reads &remote=interpolate|predict (MK-74) and ignores anything else', () => {
    expect(parseLaunchParams('?room=ABCD&remote=interpolate').remote).toBe('interpolate');
    expect(parseLaunchParams('?room=ABCD&remote=predict').remote).toBe('predict');
    expect(parseLaunchParams('?room=ABCD&remote=lerp').remote).toBeUndefined();
    expect(parseLaunchParams('?room=ABCD').remote).toBeUndefined();
  });

  it('reads &relay=force (MK-75) and ignores anything else', () => {
    expect(parseLaunchParams('?room=ABCD&relay=force').relay).toBe('force');
    expect(parseLaunchParams('?room=ABCD&relay=1').relay).toBeUndefined();
    expect(parseLaunchParams('?room=ABCD').relay).toBeUndefined();
  });

  it('reads &links=webrtc|blocked (MK-73) and ignores anything else', () => {
    expect(parseLaunchParams('?net=local&links=webrtc').links).toBe('webrtc');
    expect(parseLaunchParams('?net=local&links=blocked').links).toBe('blocked');
    expect(parseLaunchParams('?net=local&links=carrier-pigeon').links).toBeUndefined();
  });

  it('turns the round-trip &netsim=<rtt>,<jitter>,<loss%> into one-way conditions', () => {
    const netsim = parseLaunchParams('?netsim=200,50,8').netsim!;
    expect(netsim).toMatchObject({ lagMs: 100, jitterMs: 25 });
    // Lost either way: 1 - (1 - loss)² = 8 %.
    expect(1 - (1 - netsim.loss) ** 2).toBeCloseTo(0.08, 10);
  });

  it('ignores unknown transports, roles and bad lap counts', () => {
    const params = parseLaunchParams('?net=webrtc&role=spectator&laps=0');
    expect(params.net).toBeUndefined();
    expect(params.role).toBeUndefined();
    expect(params.laps).toBeUndefined();
  });
});
