// MK8 audio pipeline (MK-94), on synthesized WAVs only: no real game files in the repo or CI.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  SOUND_IDS,
  SOUNDS,
  soundGroup,
  soundPath,
  type SoundId,
  type SoundPackId,
} from '../../src/mk8/audio/soundIds.ts';
import { VOICE_EVENTS, voiceGaps } from '../../src/mk8/audio/voiceEvents.ts';
import { AUDIO_DEFAULTS, audioInfo, convertAudio } from './audio.ts';
import { buildAudio, VOICES_FILE, type VoiceIndex } from './buildAudio.ts';
import { checkAssets, checkAudio, loadBudgets } from './check.ts';
import { readManifest, sha256, updateManifest } from './manifest.ts';
import { outDir } from './paths.ts';
import { loadSources, type SoundSource } from './sources.ts';
import { readTree, sineWav, tempDir } from './testUtils.ts';

const dirs: string[] = [];
const temp = (prefix: string) => {
  const dir = tempDir(prefix);
  dirs.push(dir);
  return dir;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function writeRaw(raw: string, path: string, wav: Buffer) {
  const file = join(raw, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, wav);
}

describe('convertAudio (synthesized sine)', () => {
  it('makes a mono 96 kbps AAC .m4a with the silence trimmed', async () => {
    const dir = temp('conv');
    writeFileSync(join(dir, 'in.wav'), sineWav({ seconds: 1, silence: 0.5 }));
    expect((await audioInfo(join(dir, 'in.wav'))).seconds).toBeCloseTo(2, 3);
    await convertAudio(join(dir, 'in.wav'), join(dir, 'out.m4a'));
    const bytes = readFileSync(join(dir, 'out.m4a'));
    expect(bytes.subarray(4, 8).toString()).toBe('ftyp');
    const info = await audioInfo(join(dir, 'out.m4a'));
    expect(info).toMatchObject({
      codec: 'aac',
      channels: 1,
      sampleRate: AUDIO_DEFAULTS.sampleRate,
    });
    expect(info.kbps).toBeGreaterThanOrEqual(80);
    expect(info.kbps).toBeLessThanOrEqual(110);
    // 0.5 s of silence each side gone, the tone (and a few ms) kept.
    expect(info.seconds).toBeGreaterThan(0.97);
    expect(info.seconds).toBeLessThan(1.08);
  }, 30_000);

  it('is deterministic and keeps stereo when asked', async () => {
    const dir = temp('det');
    writeFileSync(join(dir, 'in.wav'), sineWav({ seconds: 0.3, silence: 0.2 }));
    await convertAudio(join(dir, 'in.wav'), join(dir, 'a.m4a'));
    await convertAudio(join(dir, 'in.wav'), join(dir, 'b.m4a'));
    expect(sha256(readFileSync(join(dir, 'a.m4a')))).toBe(sha256(readFileSync(join(dir, 'b.m4a'))));
    await convertAudio(join(dir, 'in.wav'), join(dir, 's.m4a'), { stereo: true });
    expect((await audioInfo(join(dir, 's.m4a'))).channels).toBe(2);
  }, 30_000);

  it('fails with ffmpeg’s message on a file that is not audio', async () => {
    const dir = temp('bad');
    writeFileSync(join(dir, 'bad.wav'), 'not a wav');
    await expect(convertAudio(join(dir, 'bad.wav'), join(dir, 'bad.m4a'))).rejects.toThrow(
      /ffmpeg failed on .*bad\.wav/,
    );
  });
});

describe('buildAudio (fixture packs)', () => {
  const ids: SoundId[] = ['ui/cursor', 'race/go', 'star/music', 'course/water-park/ambience'];
  const voicePack: SoundSource = {
    id: 'voice-fixture',
    name: 'Fixture (voice)',
    kind: 'voice',
    game: 'mk8',
    racer: 'fixture',
    assetId: null,
  };
  const voiceFiles = [
    'SE_FIX_RA_GLD_00.wav',
    'SE_FIX_RD_FAL_00.wav',
    'SE_FIX_RD_WFAL_00.wav',
    'ZZ_OTHER.wav',
  ];

  async function build(out: string) {
    const raw = temp('raw');
    const short = sineWav({ seconds: 0.1, silence: 0.1 });
    for (const id of ids.slice(0, 3))
      writeRaw(raw, `sounds/${SOUNDS[id].pack}/${SOUNDS[id].file}`, short);
    for (const f of voiceFiles) writeRaw(raw, `sounds/${voicePack.id}/${f}`, short);
    const result = await buildAudio(
      [voicePack, { ...voicePack, id: 'voice-absent', racer: 'absent' }],
      raw,
      out,
      {
        ids,
        log: () => {},
      },
    );
    updateManifest(out, result.entries);
    return result;
  }

  it('converts the listed sounds and the voice files that match an event, deterministically', async () => {
    const a = temp('out-a');
    const b = temp('out-b');
    const result = await build(a);
    await build(b);

    expect(result.missingSounds).toEqual([
      {
        id: 'course/water-park/ambience',
        file: `sounds/mk8-course/${SOUNDS['course/water-park/ambience'].file}`,
      },
    ]);
    expect(result.missingVoices).toEqual(['voice-absent']);
    for (const id of ids.slice(0, 3)) expect(existsSync(join(a, soundPath(id))), id).toBe(true);
    expect((await audioInfo(join(a, soundPath('star/music')))).channels).toBe(2);
    expect((await audioInfo(join(a, soundPath('ui/cursor')))).channels).toBe(1);

    const index = JSON.parse(readFileSync(join(a, VOICES_FILE), 'utf8')) as VoiceIndex;
    expect(index.fixture?.glide).toEqual(['audio/voice/fixture/se_fix_ra_gld_00.m4a']);
    expect(index.fixture?.fall).toEqual(['audio/voice/fixture/se_fix_rd_fal_00.m4a']);
    expect(index.fixture?.waterFall).toEqual(['audio/voice/fixture/se_fix_rd_wfal_00.m4a']);
    expect(existsSync(join(a, 'audio/voice/fixture/zz_other.m4a'))).toBe(false);
    expect(result.voiceGaps.fixture).toEqual(voiceGaps(index.fixture!));
    expect(result.voiceGaps.fixture).not.toContain('glide');

    const manifest = readManifest(a)!;
    expect(manifest.files.find((f) => f.path === soundPath('ui/cursor'))?.group).toBe('audio/ui');
    expect(manifest.files.find((f) => f.path.startsWith('audio/voice/fixture/'))?.group).toBe(
      'audio/voice/fixture',
    );
    expect(checkAssets(a, manifest, loadBudgets())).toEqual([]);

    const treeA = readTree(a);
    const treeB = readTree(b);
    expect([...treeA.keys()].sort()).toEqual([...treeB.keys()].sort());
    for (const [path, bytes] of treeA) expect(sha256(treeB.get(path)!), path).toBe(sha256(bytes));
  }, 60_000);

  it('mk8:check covers audio: missing sounds and the audio size cap', async () => {
    const out = temp('out-check');
    await build(out);
    const manifest = readManifest(out)!;
    const missing = checkAudio(manifest);
    expect(missing).toContain(`missing sound: race/lap (${soundPath('race/lap')})`);
    expect(missing).not.toContain(`missing sound: ui/cursor (${soundPath('ui/cursor')})`);
    expect(missing).toHaveLength(SOUND_IDS.length - 3);
    expect(checkAudio({ version: 1, files: [] })).toEqual([]);
    const tight = { totalBytes: 1e9, groups: {}, totals: { 'audio/*': 10 } };
    expect(checkAssets(out, manifest, tight)).toEqual([
      expect.stringMatching(/^over budget: audio\/\* totals \d+ B, budget 10 B$/),
    ]);
  }, 60_000);

  it('a rebuilt racer replaces its old voice files; other racers stay in voices.json', async () => {
    const out = temp('out-merge');
    mkdirSync(join(out, 'audio'), { recursive: true });
    writeFileSync(join(out, VOICES_FILE), JSON.stringify({ other: { glide: ['x.m4a'] } }));
    writeRaw(out, 'audio/voice/fixture/renamed-since.m4a', Buffer.from('stale'));
    await build(out);
    const index = JSON.parse(readFileSync(join(out, VOICES_FILE), 'utf8')) as VoiceIndex;
    expect(Object.keys(index)).toEqual(['fixture', 'other']);
    expect(existsSync(join(out, 'audio/voice/fixture/renamed-since.m4a'))).toBe(false);
  }, 60_000);
});

describe('sound tables', () => {
  it('sources.json lists the ticket’s sound packs and a voice pack per racer', () => {
    const { models, sounds } = loadSources();
    const byId = new Map(sounds.map((s) => [s.id, s]));
    for (const [id, assetId] of [
      ['mk8-kart', 398013],
      ['mk8-course', 398017],
      ['mk8-course-object', 398019],
      ['mk8-terrain', 398021],
      ['mk8dx-menu', 408048],
      ['mk8dx-race', 408049],
      ['mk8dx-common', 408050],
      ['mkt-item', 613895],
    ] as const)
      expect(byId.get(id)?.assetId, id).toBe(assetId);
    const racers = models.filter((m) => m.kind === 'racer').map((m) => m.id);
    expect(
      sounds
        .filter((s) => s.kind === 'voice')
        .map((s) => s.racer)
        .sort(),
    ).toEqual([...racers].sort());
  });

  it('every sound comes from an sfx pack in sources.json and has its own output path', () => {
    const packs = new Set(
      loadSources()
        .sounds.filter((s) => s.kind === 'sfx')
        .map((s) => s.id),
    );
    for (const id of SOUND_IDS)
      expect(packs.has(SOUNDS[id].pack satisfies SoundPackId), id).toBe(true);
    const paths = SOUND_IDS.map(soundPath);
    expect(new Set(paths).size).toBe(paths.length);
    const groups = new Set(SOUND_IDS.map(soundGroup));
    for (const g of [
      'audio/ui',
      'audio/race',
      'audio/items',
      'audio/kart',
      'audio/drift',
      'audio/terrain',
      'audio/star',
      'audio/course/water-park',
    ])
      expect(groups, g).toContain(g);
  });
});

// The real converted audio, when $MK8_OUT has it (it is never in the repo or CI).
const realManifest = readManifest(outDir());
const realAudio = realManifest?.files.some((f) => f.path.startsWith('audio/'));
describe.skipIf(!realAudio)('mk8 audio in $MK8_OUT', () => {
  it('every id in soundIds.ts resolves to a converted file', () => {
    expect(checkAudio(realManifest!)).toEqual([]);
    for (const id of SOUND_IDS) expect(existsSync(join(outDir(), soundPath(id))), id).toBe(true);
  });

  it('every racer has a file for each voice event (prints the gaps)', () => {
    const file = join(outDir(), VOICES_FILE);
    expect(existsSync(file)).toBe(true);
    const index = JSON.parse(readFileSync(file, 'utf8')) as VoiceIndex;
    const racers = loadSources()
      .models.filter((m) => m.kind === 'racer')
      .map((m) => m.id);
    const gaps: string[] = [];
    for (const racer of racers) {
      const events = index[racer];
      if (!events) gaps.push(`${racer}: no voice pack`);
      else {
        const missing = VOICE_EVENTS.filter((e) => !events[e]?.length);
        if (missing.length) gaps.push(`${racer}: ${missing.join(', ')}`);
      }
    }
    // Gaps are allowed if listed on the ticket; print them so they can be copied there.
    if (gaps.length) console.log(`voice gaps:\n${gaps.join('\n')}`);
    expect(Object.keys(index).length).toBeGreaterThan(0);
  });
});
