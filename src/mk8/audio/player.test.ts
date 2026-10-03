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

  it("plays a racer's voice clips in turn (MK-117), and stays silent without them", async () => {
    const { ctx, log } = fakeContext();
    const index = { mario: { select: ['audio/voice/mario/a.m4a', 'audio/voice/mario/b.m4a'] } };
    const files: Record<string, ArrayBuffer> = {
      'audio/voices.json': new TextEncoder().encode(JSON.stringify(index)).buffer as ArrayBuffer,
      'audio/voice/mario/a.m4a': new ArrayBuffer(4),
      'audio/voice/mario/b.m4a': new ArrayBuffer(6),
    };
    const decoded: number[] = [];
    const player = new Mk8AudioPlayer({
      createContext: () =>
        ({
          ...ctx,
          decodeAudioData: (bytes: ArrayBuffer) => {
            decoded.push(bytes.byteLength);
            return ctx.decodeAudioData(bytes);
          },
        }) as unknown as AudioContext,
      file: (path) => files[path],
    });
    player.voice('mario', 'select'); // before the first gesture: recorded only
    player.unlock();
    player.voice('mario', 'select');
    player.voice('mario', 'select');
    player.voice('mario', 'select');
    // No clip for Luigi, nor for Mario's boost: silent, and no synthesized stand-in.
    player.voice('luigi', 'select');
    player.voice('mario', 'boost');
    await flush();
    expect(player.played).toEqual([
      'voice/mario/select',
      'voice/mario/select',
      'voice/mario/select',
      'voice/mario/select',
      'voice/luigi/select',
      'voice/mario/boost',
    ]);
    expect(decoded).toEqual([4, 6]); // a, then b; the third play reuses a's buffer
    expect(log.sources).toBe(4); // blip + three plays
    expect(log.oscillators).toBe(0);
  });

  it('stays silent for voices when the pack has no voice index', () => {
    const { ctx, log } = fakeContext();
    const player = new Mk8AudioPlayer({ createContext: () => ctx });
    player.unlock();
    player.voice('mario', 'select');
    expect(log.sources).toBe(1);
    expect(log.oscillators).toBe(0);
  });
});
