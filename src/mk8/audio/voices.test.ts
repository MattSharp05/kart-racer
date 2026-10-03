import { describe, expect, it } from 'vitest';
import { VOICES_FILE } from '../../../tools/mk8/buildAudio';
import { parseVoiceIndex, voiceClips, voiceSoundId, VOICES_PATH } from './voices';

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).buffer;

describe('voice index (MK-117)', () => {
  it('is where the pipeline writes it', () => {
    expect(VOICES_PATH).toBe(VOICES_FILE);
  });

  it('parses racer → event → clips, dropping anything that is not a path', () => {
    const index = parseVoiceIndex(
      bytes({
        mario: { select: ['audio/voice/mario/a.m4a', 3], boost: 'nope' },
        luigi: null,
      }) as ArrayBuffer,
    );
    expect(index).toEqual({ mario: { select: ['audio/voice/mario/a.m4a'] } });
  });

  it('reads broken or non-object files as no index', () => {
    expect(parseVoiceIndex(new TextEncoder().encode('{').buffer as ArrayBuffer)).toBeUndefined();
    expect(parseVoiceIndex(bytes(['mario']) as ArrayBuffer)).toBeUndefined();
  });

  it("lists racers' clips for an event, skipping racers without any", () => {
    const index = {
      mario: { select: ['m1', 'm2'], boost: ['m3'] },
      wario: { boost: ['w1'] },
    };
    expect(voiceClips(index, ['mario', 'wario', 'toad'], 'select')).toEqual(['m1', 'm2']);
    expect(voiceSoundId('shy-guy', 'select')).toBe('voice/shy-guy/select');
  });
});
