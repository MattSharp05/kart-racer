// MK-110: racers' voice lines on race events (`RaceVoices` in ./voices.ts).
import { beforeAll, describe, expect, it } from 'vitest';
import { mk8VoicesScene } from '../../scenarios/mk8/voices';
import { createSimState } from '../../sim/state';
import { step } from '../../sim/step';
import { DT } from '../../sim/tuning';
import { NEUTRAL_INPUT, type SimEvent, type SimState } from '../../sim/types';
import { registerTestRamp } from '../content/courses/test-ramp/register';
import { MK8_RACER_VIEWS } from '../content/racers/render';
import { registerMk8Content } from '../register';
import { FINISH_WIN_PLACES, VOICE_LINE_SECONDS, VOICE_RANGE } from './config';
import { Mk8AudioPlayer } from './player';
import { VOICE_EVENTS, type VoiceEvent } from './voiceEvents';
import {
  eventVoiceLines,
  kartVoiceId,
  RaceVoices,
  voicePick,
  VOICES_PATH,
  type RaceVoicePlayer,
  type VoiceOptions,
} from './voices';

beforeAll(() => {
  registerMk8Content();
  registerTestRamp();
});

const loadout = (racer: string) => ({
  racer,
  body: 'standard-kart',
  tires: 'standard-tires',
  glider: 'paper-glider',
});

/** Racers (MK8 ids) on a line along +X, `gap` m apart; kart 0 is the player. */
function race(racers: string[], gap = 5): SimState {
  return createSimState({
    seed: 1,
    karts: racers.map((racer, i) => ({
      position: { x: i * gap, y: 0, z: 0 },
      loadout: loadout(racer),
      ...(i > 0 ? { controller: 'ai' as const } : {}),
    })),
  });
}

function recorder() {
  const said: { racer: string; line: VoiceEvent; options?: VoiceOptions }[] = [];
  const player: RaceVoicePlayer = {
    voice: (racer, line, options) => said.push({ racer, line, ...(options ? { options } : {}) }),
  };
  return { said, player };
}

const at = (state: SimState, seconds: number): SimState => ({
  ...state,
  tick: Math.round(seconds / DT),
});

/** Just enough of an AudioContext to count the clips the player starts. */
function fakeContext() {
  const log = { sources: 0 };
  const param = { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  const node = () => ({ connect: (n: unknown) => n, gain: param });
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    state: 'running',
    destination: {},
    createGain: node,
    createBuffer: () => ({}),
    createBufferSource: () => {
      log.sources += 1;
      return { ...node(), buffer: null, start() {} };
    },
    createOscillator: () => ({ ...node(), type: '', frequency: param, start() {}, stop() {} }),
    decodeAudioData: (bytes: ArrayBuffer) => Promise.resolve({ bytes }),
    resume: () => Promise.resolve(),
  };
  return { ctx: ctx as unknown as AudioContext, log };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).buffer;

describe('race voices (MK-110)', () => {
  it('every voice event plays a sample for all 12 racers, or silence without errors', async () => {
    const full: Record<string, Partial<Record<VoiceEvent, string[]>>> = {};
    const files = new Map<string, ArrayBuffer>();
    for (const { model } of MK8_RACER_VIEWS) {
      full[model] = {};
      for (const event of VOICE_EVENTS) {
        const path = `audio/voice/${model}/${event}.m4a`;
        full[model][event] = [path];
        files.set(path, new ArrayBuffer(4));
      }
    }
    const play = async (index: unknown, clips: Map<string, ArrayBuffer>) => {
      const { ctx, log } = fakeContext();
      const player = new Mk8AudioPlayer({
        createContext: () => ctx,
        file: (path) => (path === VOICES_PATH ? (json(index) as ArrayBuffer) : clips.get(path)),
      });
      player.unlock();
      const before = log.sources;
      for (const { model } of MK8_RACER_VIEWS) {
        for (const event of VOICE_EVENTS) player.voice(model, event, { pick: 0.99 });
      }
      await flush();
      return log.sources - before;
    };
    expect(MK8_RACER_VIEWS).toHaveLength(12);
    expect(await play(full, files)).toBe(12 * VOICE_EVENTS.length);
    // No index, an empty one, or an index whose clips aren't loaded: silent.
    expect(await play(undefined, files)).toBe(0);
    expect(await play({}, files)).toBe(0);
    expect(await play(full, new Map())).toBe(0);
  });

  it('maps every MK8 racer to its voice id; other karts have no voice', () => {
    for (const view of MK8_RACER_VIEWS) {
      const kart = race([view.id]).karts[0];
      expect(kartVoiceId(kart)).toBe(view.model);
    }
    expect(kartVoiceId(createSimState({ seed: 1 }).karts[0])).toBeUndefined();
  });

  it('cooldown: 5 boosts in 1 s say one line', () => {
    const { said, player } = recorder();
    const voices = new RaceVoices(() => player);
    const state = race(['mk8-mario']);
    for (let i = 0; i < 5; i++) {
      voices.onEvent({ type: 'boost', kartId: 0, seconds: 1 }, at(state, 1 + i * 0.2), 0);
    }
    expect(said.map((s) => `${s.racer}/${s.line}`)).toEqual(['mario/boost']);
  });

  it('one line at a time per kart; another kart may speak meanwhile', () => {
    const { said, player } = recorder();
    const voices = new RaceVoices(() => player);
    const state = race(['mk8-mario', 'mk8-luigi']);
    voices.onEvent({ type: 'boost', kartId: 0, seconds: 1 }, at(state, 1), 0);
    voices.onEvent({ type: 'trick', kartId: 0 }, at(state, 1.1), 0);
    voices.onEvent({ type: 'trick', kartId: 1 }, at(state, 1.1), 0);
    voices.onEvent({ type: 'trick', kartId: 0 }, at(state, 1 + VOICE_LINE_SECONDS + 0.1), 0);
    expect(said.map((s) => `${s.racer}/${s.line}`)).toEqual([
      'mario/boost',
      'luigi/trick',
      'mario/trick',
    ]);
  });

  it('a hit: the kart hit cries out, the kart that threw it gloats', () => {
    expect(eventVoiceLines({ type: 'kartHit', kartId: 2, by: 5, kind: 'green' })).toEqual([
      { kartId: 2, line: 'hit' },
      { kartId: 5, line: 'itemHit' },
    ]);
    expect(eventVoiceLines({ type: 'kartHit', kartId: 2, by: -1, kind: 'banana' })).toEqual([
      { kartId: 2, line: 'hit' },
    ]);
  });

  it('only the camera kart and karts near it are heard, fading with distance', () => {
    const { said, player } = recorder();
    const voices = new RaceVoices(() => player);
    const state = race(['mk8-mario', 'mk8-luigi', 'mk8-peach'], VOICE_RANGE * 0.75);
    for (const kartId of [0, 1, 2]) voices.onEvent({ type: 'trick', kartId }, state, 0);
    expect(said.map((s) => s.racer)).toEqual(['mario', 'luigi']);
    expect(said[0]?.options?.volume).toBe(1);
    expect(said[1]?.options?.volume).toBeCloseTo(0.25);
  });

  it('a fall in water says the water fall line', () => {
    const { said, player } = recorder();
    const voices = new RaceVoices(() => player);
    const state = race(['mk8-yoshi']);
    voices.onEvent({ type: 'respawn', kartId: 0 }, at(state, 1), 0);
    voices.onEvent({ type: 'waterEnter', kartId: 0 }, at(state, 5), 0);
    voices.onEvent({ type: 'respawn', kartId: 0 }, at(state, 6), 0);
    voices.onEvent({ type: 'respawn', kartId: 0 }, at(state, 9), 0);
    expect(said.map((s) => s.line)).toEqual(['fall', 'waterFall', 'fall']);
  });

  it('the player says a line when they overtake, not when overtaken', () => {
    const { said, player } = recorder();
    const voices = new RaceVoices(() => player);
    const state = race(['mk8-toad', 'mk8-wario']);
    voices.onEvent({ type: 'positionChange', positions: [1, 0] }, at(state, 1), 0);
    voices.onEvent({ type: 'positionChange', positions: [0, 1] }, at(state, 2), 0);
    voices.onEvent({ type: 'positionChange', positions: [1, 0] }, at(state, 3), 0);
    expect(said.map((s) => `${s.racer}/${s.line}`)).toEqual(['toad/overtake']);
  });

  it('finish: the winner says the win line from anywhere; the player wins or loses by place', () => {
    const { said, player } = recorder();
    const voices = new RaceVoices(() => player);
    const state = race(['mk8-peach', 'mk8-bowser', 'mk8-daisy'], VOICE_RANGE * 2);
    const finish = (kartId: number, position: number): SimEvent => ({
      type: 'finish',
      kartId,
      position,
      time: 60,
    });
    voices.onEvent(finish(1, 1), at(state, 60), 0);
    voices.onEvent(finish(2, 2), at(state, 60.1), 0);
    voices.onEvent(finish(0, FINISH_WIN_PLACES), at(state, 60.2), 0);
    expect(said.map((s) => `${s.racer}/${s.line}`)).toEqual([
      'bowser/finishWin',
      'peach/finishWin',
    ]);
    const lose = recorder();
    new RaceVoices(() => lose.player).onEvent(finish(0, FINISH_WIN_PLACES + 1), state, 0);
    expect(lose.said.map((s) => s.line)).toEqual(['finishLose']);
  });

  it('picks clips from the tick, not Math.random', () => {
    expect(voicePick(100, 0, 'hit')).toBe(voicePick(100, 0, 'hit'));
    const picks = new Set(Array.from({ length: 50 }, (_, t) => voicePick(t, 0, 'hit')));
    expect(picks.size).toBeGreaterThan(40);
    for (const p of picks) expect(p >= 0 && p < 1).toBe(true);
  });

  it("loads the race's racers' voices once per race", () => {
    const loads: string[][] = [];
    const { player } = recorder();
    const voices = new RaceVoices(() => player, { load: (ids) => loads.push(ids) });
    const state = race(['mk8-mario', 'mk8-luigi', 'mk8-mario']);
    voices.onEvent({ type: 'trick', kartId: 0 }, at(state, 1), 0);
    voices.onEvent({ type: 'trick', kartId: 0 }, at(state, 2), 0);
    expect(loads).toEqual([['mario', 'luigi']]);
    // Time going back is a new race.
    voices.onEvent({ type: 'trick', kartId: 0 }, at(state, 0), 0);
    expect(loads).toHaveLength(2);
  });

  it('mk8-voices: boost, fall and hit lines in the first 4 s', () => {
    const { said, player } = recorder();
    const voices = new RaceVoices(() => player);
    let state = mk8VoicesScene(1);
    for (let t = 0; t < 4 / DT; t++) {
      const result = step(state, [NEUTRAL_INPUT, NEUTRAL_INPUT]);
      state = result.state;
      for (const event of result.events) voices.onEvent(event, state, 0);
    }
    expect(said.map((s) => `${s.racer}/${s.line}`)).toEqual([
      'mario/boost',
      'luigi/fall',
      'mario/hit',
    ]);
  });
});
