// MK-111: the engine and terrain loops (`./mixer.ts`).
import { beforeAll, describe, expect, it } from 'vitest';
import { mk8TestFree } from '../../scenarios/mk8/kartSounds';
import { tuning } from '../../sim/tuning';
import type { SimState } from '../../sim/types';
import { registerTestRamp } from '../content/courses/test-ramp/register';
import { registerMk8Content } from '../register';
import { FADE_SECONDS, KartSoundMixer, MIX, OTHER_RANGE, type MixerPlayer } from './mixer';
import type { SoundLoop } from './player';
import type { SoundId } from './soundIds';

beforeAll(() => {
  registerMk8Content();
  registerTestRamp();
});

const FRAME = 1 / 60;

function fakePlayer(has: (id: SoundId) => boolean = () => true) {
  const loops = new Map<SoundId, { volume: number; rate: number; stopped: boolean }>();
  const player: MixerPlayer = {
    has,
    loop: (id, volume): SoundLoop => {
      const state = { volume, rate: 1, stopped: false };
      loops.set(id, state);
      return {
        setVolume: (v) => (state.volume = v),
        setRate: (r) => (state.rate = r),
        stop: () => (state.stopped = true),
      };
    },
  };
  return { player, loops };
}

function driving(speed: number): SimState {
  const state = mk8TestFree(1);
  const kart = state.karts[0]!;
  kart.grounded = true;
  kart.speed = speed;
  return state;
}

/** Runs the mixer `seconds` of frames from `t`; returns the end time. */
function run(mixer: KartSoundMixer, state: SimState, t: number, seconds: number, active = true) {
  const frames = Math.round(seconds / FRAME);
  for (let i = 1; i <= frames; i++) mixer.update(state, 0, active, t + i * FRAME);
  return t + frames * FRAME;
}

describe('kart sound mixer (MK-111)', () => {
  it("plays the body's idle at rest, its accelerate loop and the road's running loop when moving", () => {
    const { player, loops } = fakePlayer();
    const mixer = new KartSoundMixer(() => player);
    const state = driving(0);
    const t = run(mixer, state, 0, 0.5);
    expect(mixer.volume(0, 'kart/standard-kart/idle')).toBeCloseTo(MIX.engine);
    expect(mixer.volume(0, 'terrain/asphalt/run')).toBe(0);
    state.karts[0]!.speed = tuning.topSpeed[150];
    run(mixer, state, t, 0.5);
    expect(mixer.volume(0, 'kart/standard-kart/idle')).toBe(0);
    expect(loops.get('kart/standard-kart/idle')?.stopped).toBe(true);
    expect(mixer.volume(0, 'kart/standard-kart/accel')).toBeCloseTo(MIX.engine);
    expect(loops.get('kart/standard-kart/accel')?.rate).toBeGreaterThan(1);
    expect(mixer.volume(0, 'terrain/asphalt/run')).toBeCloseTo(MIX.terrain);
  });

  it('a surface change switches the terrain loop within 0.2 s', () => {
    expect(FADE_SECONDS).toBeLessThanOrEqual(0.2);
    const { player } = fakePlayer();
    const mixer = new KartSoundMixer(() => player);
    const state = driving(tuning.topSpeed[150]);
    const t = run(mixer, state, 0, 0.5);
    expect(mixer.volume(0, 'terrain/asphalt/run')).toBeCloseTo(MIX.terrain);
    state.karts[0]!.position = { x: 0, y: 0, z: 9 }; // onto the verge's grass
    run(mixer, state, t, 0.2);
    expect(mixer.volume(0, 'terrain/asphalt/run')).toBe(0);
    expect(mixer.volume(0, 'terrain/grass/run')).toBeCloseTo(MIX.terrain);
  });

  it('drifting plays the slip loop instead of the running loop', () => {
    const { player } = fakePlayer();
    const mixer = new KartSoundMixer(() => player);
    const state = driving(tuning.topSpeed[150]);
    state.karts[0]!.drift = { direction: 1, charge: 0, tier: 0 };
    run(mixer, state, 0, 0.5);
    expect(mixer.volume(0, 'terrain/asphalt/slip')).toBeCloseTo(MIX.slip);
    expect(mixer.volume(0, 'terrain/asphalt/run')).toBe(0);
  });

  it('other karts: the nearest, quieter with distance; none beyond range', () => {
    const { player } = fakePlayer();
    const mixer = new KartSoundMixer(() => player);
    const state = driving(0);
    const near = { ...state.karts[0]!, id: 1, position: { x: OTHER_RANGE / 2, y: 0, z: 0 } };
    const far = { ...state.karts[0]!, id: 2, position: { x: OTHER_RANGE * 2, y: 0, z: 0 } };
    state.karts.push(near, far);
    run(mixer, state, 0, 0.5);
    expect(mixer.volume(1, 'kart/standard-kart/idle')).toBeCloseTo(MIX.engine * MIX.others * 0.5);
    expect(mixer.volume(2, 'kart/standard-kart/idle')).toBe(0);
  });

  it('fades everything out when not active (paused, muted, a menu), then stops the loops', () => {
    const { player, loops } = fakePlayer();
    const mixer = new KartSoundMixer(() => player);
    const state = driving(0);
    const t = run(mixer, state, 0, 0.5);
    run(mixer, state, t, 0.3, false);
    expect(mixer.volume(0, 'kart/standard-kart/idle')).toBe(0);
    expect([...loops.values()].every((l) => l.stopped)).toBe(true);
  });

  it('without the samples nothing loops, and our synth keeps the engines', () => {
    const { player, loops } = fakePlayer(() => false);
    const mixer = new KartSoundMixer(() => player);
    run(mixer, driving(10), 0, 0.5);
    expect(loops.size).toBe(0);
    expect(mixer.hasEngines()).toBe(false);
    expect(new KartSoundMixer(() => fakePlayer().player).hasEngines()).toBe(true);
  });
});
