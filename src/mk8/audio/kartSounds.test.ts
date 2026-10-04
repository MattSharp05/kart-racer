// MK-111: MK8 races' kart sounds (`./kartSounds.ts`, `./kartSoundSkin.ts`).
import { beforeAll, describe, expect, it } from 'vitest';
import { cueFor } from '../../audio/soundMap';
import { mk8TestFree } from '../../scenarios/mk8/kartSounds';
import { tuning } from '../../sim/tuning';
import type { SimEvent, SimState } from '../../sim/types';
import { registerTestRamp } from '../content/courses/test-ramp/register';
import { registerMk8Content } from '../register';
import { setSoundSkin, soundSkin } from '../../audio/skin';
import {
  installMk8KartSounds,
  KART_HEARING_RANGE,
  playKartSound,
  type KartSoundPlayer,
} from './kartSoundSkin';
import { installMk8Voices } from './voiceSkin';
import {
  engineRate,
  ENGINE_RATE,
  kartBody,
  kartCue,
  KART_EVENTS,
  KART_SAMPLES,
  kartTerrain,
  SYNTH,
} from './kartSounds';
import { SOUND_IDS, type SoundId } from './soundIds';

beforeAll(() => {
  registerMk8Content();
  registerTestRamp();
});

/** One example of each kart event, for kart 0. */
const EXAMPLES: Record<(typeof KART_EVENTS)[number], SimEvent[]> = {
  rocketStart: [{ type: 'rocketStart', kartId: 0 }],
  stall: [{ type: 'stall', kartId: 0 }],
  wallHit: [
    { type: 'wallHit', kartId: 0, strength: 2 },
    { type: 'wallHit', kartId: 0, strength: 10 },
  ],
  bump: [{ type: 'bump', a: 0, b: 1, strength: 5 }],
  hop: [{ type: 'hop', kartId: 0 }],
  driftStart: [{ type: 'driftStart', kartId: 0, direction: 1 }],
  driftTier: [1, 2, 3].map((tier) => ({ type: 'driftTier', kartId: 0, tier: tier as 1 | 2 | 3 })),
  driftCancel: [{ type: 'driftCancel', kartId: 0 }],
  miniTurbo: [{ type: 'miniTurbo', kartId: 0, tier: 2 }],
  boost: [{ type: 'boost', kartId: 0, seconds: 1 }],
  boostPad: [{ type: 'boostPad', kartId: 0 }],
  launch: [{ type: 'launch', kartId: 0 }],
  trick: [{ type: 'trick', kartId: 0 }],
  land: [
    { type: 'land', kartId: 0, airTime: 0.1 },
    { type: 'land', kartId: 0, airTime: 0.8 },
  ],
  glideOpen: [{ type: 'glideOpen', kartId: 0 }],
  glideClose: [{ type: 'glideClose', kartId: 0 }],
  coin: [{ type: 'coin', kartId: 0 }],
  waterEnter: [{ type: 'waterEnter', kartId: 0 }],
  waterExit: [{ type: 'waterExit', kartId: 0 }],
  spinBoost: [{ type: 'spinBoost', kartId: 0 }],
};

function race(): SimState {
  const state = mk8TestFree(1);
  state.karts[0]!.grounded = true;
  return state;
}

function recorder(has: (id: SoundId) => boolean = () => true) {
  const played: { id: SoundId; volume: number | undefined }[] = [];
  const player: KartSoundPlayer = {
    play: (id, volume) => played.push({ id, volume }),
    has,
    loop: () => undefined,
  };
  return { played, player };
}

describe('MK8 kart sounds (MK-111)', () => {
  it('every kart event maps to a bank sample, an explicit synth fallback or silence', () => {
    const state = race();
    for (const [type, events] of Object.entries(EXAMPLES)) {
      for (const event of events) {
        const cue = kartCue(event, state);
        expect(cue, type).toBeDefined();
        const sound = cue!.sound;
        if (sound === SYNTH) {
          // Our synth's own sound for it (or, glider and coin, none in the original game).
          expect(
            ['glideOpen', 'glideClose'].includes(type) || cueFor(event, 3) !== null,
            type,
          ).toBe(true);
        } else if (sound !== null) {
          expect(SOUND_IDS, `${type}: ${sound}`).toContain(sound);
        }
      }
    }
    // Every kart event is in the examples; items and race events are left to the other skins.
    expect(Object.keys(EXAMPLES).sort()).toEqual([...KART_EVENTS].sort());
    expect(kartCue({ type: 'itemUsed', kartId: 0, item: 'banana' }, state)).toBeUndefined();
    expect(kartCue({ type: 'lap', kartId: 0, lap: 2 }, state)).toBeUndefined();
  });

  it('drift sparks sound by tier colour; engines and landings by body and terrain', () => {
    const state = race();
    const sound = (event: SimEvent) => kartCue(event, state)?.sound;
    expect(
      [1, 2, 3].map((tier) => sound({ type: 'driftTier', kartId: 0, tier: tier as 1 })),
    ).toEqual(['drift/blue', 'drift/orange', 'drift/purple']);
    expect(sound({ type: 'miniTurbo', kartId: 0, tier: 1 })).toBe('kart/standard-kart/mini-turbo');
    expect(sound({ type: 'land', kartId: 0, airTime: 1 })).toBe('terrain/asphalt/land');
    state.karts[0]!.loadout = { ...state.karts[0]!.loadout!, body: 'b-dasher' };
    expect(sound({ type: 'boostPad', kartId: 0 })).toBe('kart/b-dasher/boost');
    expect(kartBody({ ...state.karts[0]!, loadout: undefined })).toBe('standard-kart');
  });

  it('wall hits by material: concrete, metal on anti-gravity', () => {
    const state = race();
    const wall: SimEvent = { type: 'wallHit', kartId: 0, strength: 10 };
    expect(kartCue(wall, state)?.sound).toBe('terrain/wall/concrete');
    state.karts[0]!.antigrav = true;
    expect(kartCue(wall, state)?.sound).toBe('terrain/wall/metal');
  });

  it('the terrain under a kart: asphalt, grass off the road, water, metal; none in the air', () => {
    const state = race();
    const kart = state.karts[0]!;
    expect(kartTerrain(state, kart)).toBe('asphalt');
    kart.position = { x: 0, y: 0, z: 9 }; // the verge
    expect(kartTerrain(state, kart)).toBe('grass');
    kart.inWater = true;
    expect(kartTerrain(state, kart)).toBe('water');
    kart.inWater = false;
    kart.antigrav = true;
    expect(kartTerrain(state, kart)).toBe('metal');
    kart.grounded = false;
    expect(kartTerrain(state, kart)).toBeUndefined();
  });

  it('engine pitch rises monotonically with speed', () => {
    const top = tuning.topSpeed[150];
    let last = -Infinity;
    for (let speed = 0; speed <= top * 1.6; speed += 0.25) {
      const rate = engineRate(speed, top);
      expect(rate).toBeGreaterThanOrEqual(last);
      last = rate;
    }
    expect(engineRate(0, top)).toBe(ENGINE_RATE.min);
    expect(engineRate(top * 2, top)).toBe(ENGINE_RATE.max);
    expect(engineRate(top / 2, top)).toBeGreaterThan(engineRate(top / 4, top));
    expect(engineRate(-top / 2, top)).toBe(engineRate(top / 2, top));
  });

  it("plays the pack's sample, falls back to our synth without it", () => {
    const state = race();
    const spark: SimEvent = { type: 'driftTier', kartId: 0, tier: 3 };
    const withPack = recorder();
    expect(playKartSound(withPack.player, spark, state, 0)).toBe(true);
    expect(withPack.played.map((p) => p.id)).toEqual(['drift/purple']);
    const noPack = recorder(() => false);
    expect(playKartSound(noPack.player, spark, state, 0)).toBe(false);
    expect(playKartSound(noPack.player, { type: 'boost', kartId: 0, seconds: 1 }, state, 0)).toBe(
      false,
    );
    expect(playKartSound(withPack.player, { type: 'hop', kartId: 0 }, state, 0)).toBe(false);
    expect(playKartSound(withPack.player, { type: 'lap', kartId: 0, lap: 2 }, state, 0)).toBe(
      undefined,
    );
  });

  it("other karts: their own sounds unheard, near ones' quieter with distance", () => {
    const state = race();
    state.karts.push({
      ...state.karts[0]!,
      id: 1,
      position: { x: KART_HEARING_RANGE / 2, y: 0, z: 0 },
    });
    const { played, player } = recorder();
    expect(playKartSound(player, { type: 'driftStart', kartId: 1, direction: 1 }, state, 0)).toBe(
      true,
    );
    playKartSound(player, { type: 'spinBoost', kartId: 1 }, state, 0);
    expect(played).toEqual([{ id: 'kart/standard-kart/mini-turbo', volume: 0.5 }]);
  });

  it('loads every kart, terrain and drift sound of the bank', () => {
    expect(KART_SAMPLES).toContain('kart/sports-coupe/accel');
    expect(KART_SAMPLES).toContain('terrain/wall/metal');
    expect(KART_SAMPLES).toContain('drift/start');
    expect(KART_SAMPLES.every((id) => !id.startsWith('items/'))).toBe(true);
  });

  it('over the voices skin: kart events still reach the voices (MK-110)', () => {
    const before = soundSkin();
    try {
      setSoundSkin(undefined);
      const said: string[] = [];
      installMk8Voices(
        () => ({ voice: (racer, line) => said.push(`${racer}/${line}`) }),
        () => Promise.resolve(),
      );
      const { played, player } = recorder();
      installMk8KartSounds(
        () => player,
        () => 0,
      );
      const skin = soundSkin()!;
      const state = race();
      expect(skin.play({ type: 'boostPad', kartId: 0 }, state, 0)).toBe(true);
      expect(played.map((p) => p.id)).toEqual(['kart/standard-kart/boost']);
      expect(said).toEqual(['mario/boost']);
    } finally {
      setSoundSkin(before);
    }
  });
});
