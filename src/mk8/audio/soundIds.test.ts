import { describe, expect, it } from 'vitest';
import {
  COURSES,
  KART_BODIES,
  packFilePattern,
  SOUND_IDS,
  SOUND_PACKS,
  soundFile,
  soundGroup,
} from './soundIds';
import {
  VOICE_EVENTS,
  VOICE_PATTERNS,
  VOICE_RACERS,
  voiceFile,
  voiceFilesFor,
} from './voiceEvents';

describe('MK8 sound ids', () => {
  it('cover the ticket’s groups', () => {
    const ids = Object.keys(SOUND_IDS);
    const groups = new Set(ids.map(soundGroup));
    expect([...groups].sort()).toEqual([
      'course',
      'drift',
      'items',
      'kart',
      'race',
      'star',
      'terrain',
      'ui',
    ]);
    for (const id of [
      'ui/cursor',
      'ui/decide',
      'ui/back',
      'ui/course-roulette',
      'race/go',
      'race/final-lap',
    ])
      expect(SOUND_IDS[id], id).toBeDefined();
    for (const id of [
      'race/item-roulette',
      'race/item-decide',
      'race/lakitu-rescue',
      'race/finish',
      'race/rank-up',
    ])
      expect(SOUND_IDS[id], id).toBeDefined();
    for (const body of KART_BODIES)
      expect(SOUND_IDS[`kart/${body}/mini-turbo`], body).toBeDefined();
    for (const course of COURSES)
      expect(SOUND_IDS[`course/${course}/ambience`]?.stereo, course).toBe(true);
    expect(SOUND_IDS['star/music']?.stereo).toBe(true);
  });

  it('each id names a known pack and maps to its own .m4a path', () => {
    const paths = Object.keys(SOUND_IDS).map(soundFile);
    expect(new Set(paths).size).toBe(paths.length);
    for (const [id, source] of Object.entries(SOUND_IDS)) {
      expect(SOUND_PACKS, id).toContain(source.pack);
      expect(id).toMatch(/^[a-z]+(\/[a-z0-9-]+)+$/);
    }
    expect(soundFile('ui/cursor')).toBe('audio/ui/cursor.m4a');
    expect(() => soundFile('ui/nope')).toThrow(/Unknown MK8 sound/);
  });

  it('pack file patterns match names case-insensitively with * wildcards only', () => {
    expect(packFilePattern('RD_*FAL').test('rd_sfal')).toBe(true);
    expect(packFilePattern('RD_*FAL').test('RD_SFAL_00')).toBe(false);
    expect(packFilePattern('SE.(x)').test('SE.(x)')).toBe(true);
    expect(packFilePattern('SE.(x)').test('SEa(x)')).toBe(false);
  });
});

describe('MK8 voice events', () => {
  it('has patterns for every event and the ticket’s known codes', () => {
    expect(Object.keys(VOICE_PATTERNS).sort()).toEqual([...VOICE_EVENTS].sort());
    const names = ['RA_GLD_00', 'RD_SFAL_01', 'RD_CMDW_00', 'RD_CMDL_00', 'RA_JMP_00'];
    expect(voiceFilesFor('glide', names)).toEqual(['RA_GLD_00']);
    expect(voiceFilesFor('fall', names)).toEqual(['RD_SFAL_01']);
    expect(voiceFilesFor('finishWin', names)).toEqual(['RD_CMDW_00']);
    expect(voiceFilesFor('finishLose', names)).toEqual(['RD_CMDL_00']);
    expect(VOICE_RACERS).toHaveLength(12);
    expect(voiceFile('mario', 'glide', 0)).toBe('audio/voice/mario/glide-0.m4a');
  });
});
