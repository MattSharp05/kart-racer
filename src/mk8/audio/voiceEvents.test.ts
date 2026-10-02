import { describe, expect, it } from 'vitest';
import {
  matchesVoiceEvent,
  VOICE_EVENTS,
  VOICE_PATTERNS,
  voiceFilesByEvent,
  voiceGaps,
} from './voiceEvents';

describe('voice events', () => {
  it('has patterns for every event', () => {
    for (const event of VOICE_EVENTS)
      expect(VOICE_PATTERNS[event].patterns.length).toBeGreaterThan(0);
  });

  it('matches codes anywhere in the name, case-insensitively, with * wildcards', () => {
    expect(matchesVoiceEvent('glide', 'SE_MARIO_RA_GLD_01.wav')).toBe(true);
    expect(matchesVoiceEvent('glide', 'voice/se_mario_ra_gld_01.WAV')).toBe(true);
    expect(matchesVoiceEvent('fall', 'RD_SFAL_00.wav')).toBe(true);
    expect(matchesVoiceEvent('fall', 'RD_FAL.wav')).toBe(true);
    expect(matchesVoiceEvent('finishWin', 'RD_CMDW_02.wav')).toBe(true);
    expect(matchesVoiceEvent('finishLose', 'RD_CMDW_02.wav')).toBe(false);
    expect(matchesVoiceEvent('glide', 'RA_GL.wav')).toBe(false);
  });

  it('keeps water falls out of plain falls', () => {
    expect(matchesVoiceEvent('waterFall', 'RD_WFAL_00.wav')).toBe(true);
    expect(matchesVoiceEvent('fall', 'RD_WFAL_00.wav')).toBe(false);
  });

  it('groups a pack by event and lists the gaps', () => {
    const byEvent = voiceFilesByEvent(['RA_GLD_01.wav', 'RA_GLD_00.wav', 'RD_FAL.wav', 'X.wav']);
    expect(byEvent.glide).toEqual(['RA_GLD_00.wav', 'RA_GLD_01.wav']);
    expect(byEvent.fall).toEqual(['RD_FAL.wav']);
    expect(voiceGaps(byEvent)).toEqual(VOICE_EVENTS.filter((e) => e !== 'glide' && e !== 'fall'));
  });
});
