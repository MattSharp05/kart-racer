import { describe, expect, it } from 'vitest';
import { CourseAmbience, falloff, type LoopPlayer } from './ambience';
import { Mk8AudioPlayer, type SoundLoop } from './player';
import type { SoundId } from './soundIds';

const CROWD: SoundId = 'course/mario-kart-stadium/ambience';
const FOUNTAIN: SoundId = 'course/water-park/ambience';
const HERE = { x: 0, y: 0, z: 0 };

/** A player that records loops; `ready` false plays nothing yet (audio not started). */
function fakePlayer(ready = true) {
  const calls: string[] = [];
  const player: LoopPlayer & { ready: boolean } = {
    ready,
    loop(id, volume): SoundLoop | undefined {
      if (!this.ready) return undefined;
      calls.push(`loop ${id} ${volume.toFixed(2)}`);
      return {
        setVolume: (v) => calls.push(`volume ${id} ${v.toFixed(2)}`),
        stop: () => calls.push(`stop ${id}`),
      };
    },
  };
  return { player, calls };
}

describe('CourseAmbience (MK-125)', () => {
  it('starts its loops with the race and stops them on pause, logging both', () => {
    const { player, calls } = fakePlayer();
    const log: string[] = [];
    const ambience = new CourseAmbience([{ sound: CROWD, volume: 0.5 }], player, () => false, log);
    ambience.update(true, HERE);
    expect(log).toEqual([]);
    ambience.update(false, HERE);
    ambience.update(false, HERE);
    expect(ambience.on).toBe(true);
    expect(log).toEqual([`start ${CROWD}`]);
    expect(calls).toEqual([`loop ${CROWD} 0.50`]);
    ambience.update(true, HERE);
    expect(ambience.on).toBe(false);
    expect(log).toEqual([`start ${CROWD}`, `stop ${CROWD}`]);
    expect(calls.at(-1)).toBe(`stop ${CROWD}`);
    ambience.update(false, HERE);
    expect(log.at(-1)).toBe(`start ${CROWD}`);
  });

  it('stop() (the course is left) silences everything once', () => {
    const { player } = fakePlayer();
    const log: string[] = [];
    const ambience = new CourseAmbience([{ sound: CROWD, volume: 1 }], player, () => false, log);
    ambience.update(false, HERE);
    ambience.stop();
    ambience.stop();
    expect(log).toEqual([`start ${CROWD}`, `stop ${CROWD}`]);
  });

  it('keeps trying until audio has started (the first tap)', () => {
    const { player, calls } = fakePlayer(false);
    const ambience = new CourseAmbience([{ sound: CROWD, volume: 1 }], player, () => false, []);
    ambience.update(false, HERE);
    expect(calls).toEqual([]);
    player.ready = true;
    ambience.update(false, HERE);
    expect(calls).toEqual([`loop ${CROWD} 1.00`]);
  });

  it('is silent while the game is muted', () => {
    const { player, calls } = fakePlayer();
    const ambience = new CourseAmbience([{ sound: CROWD, volume: 1 }], player, () => true, []);
    ambience.update(false, HERE);
    expect(calls).toEqual([`loop ${CROWD} 0.00`]);
  });

  it('fades a placed sound with the distance from it', () => {
    const fountain = { sound: FOUNTAIN, volume: 1, at: [10, 0, 0] as const, radius: 20 };
    expect(falloff(fountain, { x: 10, y: 0, z: 0 })).toBe(1);
    expect(falloff(fountain, { x: 20, y: 0, z: 0 })).toBeCloseTo(0.5);
    expect(falloff(fountain, { x: 40, y: 0, z: 0 })).toBe(0);
    expect(falloff({ sound: CROWD, volume: 1 }, { x: 999, y: 0, z: 0 })).toBe(1);

    const { player, calls } = fakePlayer();
    const ambience = new CourseAmbience([fountain], player, () => false, []);
    ambience.update(false, { x: 40, y: 0, z: 0 });
    ambience.update(false, { x: 20, y: 0, z: 0 });
    ambience.update(false, { x: 20.01, y: 0, z: 0 });
    expect(calls).toEqual([`loop ${FOUNTAIN} 0.00`, `volume ${FOUNTAIN} 0.50`]);
  });
});

describe('Mk8AudioPlayer.loop (MK-125)', () => {
  function fakeContext() {
    const log = { started: 0, stopped: 0, looped: false, disconnected: 0 };
    const param = { value: 0, setTargetAtTime: (v: number) => (param.value = v) };
    const ctx = {
      currentTime: 0,
      sampleRate: 44100,
      state: 'running',
      destination: {},
      createGain: () => ({
        connect: (n: unknown) => n,
        disconnect: () => (log.disconnected += 1),
        gain: param,
      }),
      createBuffer: () => ({}),
      createBufferSource: () => {
        const source = {
          buffer: null,
          loop: false,
          connect: (n: unknown) => n,
          start: () => {
            log.started += 1;
            log.looped ||= source.loop;
          },
          stop: () => (log.stopped += 1),
        };
        return source;
      },
      decodeAudioData: () => Promise.resolve({}),
      resume: () => Promise.resolve(),
    };
    return { ctx: ctx as unknown as AudioContext, log, param };
  }
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('loops a pack sound once audio has started, until stopped', async () => {
    const { ctx, log, param } = fakeContext();
    const gestures = new EventTarget();
    const player = new Mk8AudioPlayer({
      createContext: () => ctx,
      gestures,
      file: (path) => (path === `audio/${CROWD}.m4a` ? new ArrayBuffer(8) : undefined),
    });
    expect(player.loop(CROWD, 1)).toBeUndefined();
    gestures.dispatchEvent(new Event('pointerup'));
    const started = log.started; // the iOS silence blip
    const loop = player.loop(CROWD, 1);
    await flush();
    expect(log.started).toBe(started + 1);
    expect(log.looped).toBe(true);
    loop?.setVolume(0.5);
    expect(param.value).toBeCloseTo(0.4);
    loop?.stop();
    expect(log.stopped).toBe(1);
    expect(log.disconnected).toBe(1);
  });

  it('plays nothing for a sound the pack hasn’t got', async () => {
    const { ctx, log } = fakeContext();
    const gestures = new EventTarget();
    const player = new Mk8AudioPlayer({ createContext: () => ctx, gestures });
    gestures.dispatchEvent(new Event('pointerup'));
    const started = log.started;
    player.loop(CROWD, 1)?.stop();
    await flush();
    expect(log.started).toBe(started);
  });
});
