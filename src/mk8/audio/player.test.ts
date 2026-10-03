import { describe, expect, it } from 'vitest';
import { Mk8AudioPlayer } from './player';

/** Just enough of an AudioContext to see what the player starts. */
function fakeContext() {
  const log = { oscillators: 0, sources: 0, decoded: 0, resumed: 0 };
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
    createOscillator: () => {
      log.oscillators += 1;
      return { ...node(), type: '', frequency: param, start() {}, stop() {} };
    },
    decodeAudioData: (bytes: ArrayBuffer) => {
      log.decoded += 1;
      return Promise.resolve({ bytes });
    },
    resume: () => {
      log.resumed += 1;
      return Promise.resolve();
    },
  };
  return { ctx: ctx as unknown as AudioContext, log };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Mk8AudioPlayer', () => {
  it('records every sound, and plays nothing before the first gesture', () => {
    const { ctx, log } = fakeContext();
    const player = new Mk8AudioPlayer({ createContext: () => ctx });
    player.play('ui/cursor');
    expect(player.played).toEqual(['ui/cursor']);
    expect(player.unlocked).toBe(false);
    expect(log.oscillators).toBe(0);
  });

  it('starts on a gesture (iOS silence blip) and synthesizes sounds the pack lacks', () => {
    const { ctx, log } = fakeContext();
    const gestures = new EventTarget();
    const player = new Mk8AudioPlayer({ createContext: () => ctx, gestures });
    gestures.dispatchEvent(new Event('pointerup'));
    expect(player.unlocked).toBe(true);
    expect(log.sources).toBe(1);
    expect(log.resumed).toBe(1);
    player.play('ui/decide');
    expect(log.oscillators).toBe(2);
    expect(log.decoded).toBe(0);
  });

  it("plays the pack's sound, decoded once", async () => {
    const { ctx, log } = fakeContext();
    const bytes = new ArrayBuffer(8);
    const player = new Mk8AudioPlayer({
      createContext: () => ctx,
      file: (path) => (path === 'audio/ui/back.m4a' ? bytes : undefined),
    });
    player.unlock();
    player.play('ui/back');
    player.play('ui/back');
    await flush();
    expect(log.decoded).toBe(1);
    expect(log.sources).toBe(3); // blip + two plays
    expect(log.oscillators).toBe(0);
  });

  it('stays silent when muted', () => {
    const { ctx, log } = fakeContext();
    const player = new Mk8AudioPlayer({ createContext: () => ctx, isMuted: () => true });
    player.unlock();
    player.play('ui/cursor');
    expect(player.played).toEqual(['ui/cursor']);
    expect(log.oscillators).toBe(0);
  });
});
