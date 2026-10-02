import { execFile } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import { afterAll, describe, expect, it } from 'vitest';
import { SOUND_IDS, soundFile } from '../../src/mk8/audio/soundIds.ts';
import { VOICE_EVENTS, VOICE_RACERS, voiceFile } from '../../src/mk8/audio/voiceEvents.ts';
import { buildAudio, decodePcm, encodeM4a, voiceGapReport } from './audio.ts';
import { checkAssets, loadBudgets } from './check.ts';
import { readManifest } from './manifest.ts';
import { outDir, REPO_ROOT } from './paths.ts';
import { tempDir, writeToneWav } from './testUtils.ts';

const dirs: string[] = [];
const temp = (prefix: string) => {
  const dir = tempDir(prefix);
  dirs.push(dir);
  return dir;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** ffmpeg's description of the audio stream, e.g. "aac (LC) ... 44100 Hz, mono, fltp, 96 kb/s". */
async function streamInfo(file: string): Promise<string> {
  const result = await promisify(execFile)(ffmpegPath!, ['-hide_banner', '-i', file]).catch(
    (e: { stderr: string }) => e,
  );
  return /Audio: (.*)/.exec(result.stderr)?.[1] ?? '';
}

const isM4a = (bytes: Uint8Array) =>
  Buffer.from(bytes.subarray(4, 8)).toString('latin1') === 'ftyp';

describe('m4a encoding', () => {
  it('encodes a synthesized WAV to mono AAC .m4a, trimmed of silence, deterministically', async () => {
    const dir = temp('tone');
    writeToneWav(join(dir, 'tone.wav'));
    const a = await encodeM4a(join(dir, 'tone.wav'), join(dir, 'a.m4a'));
    const b = await encodeM4a(join(dir, 'tone.wav'), join(dir, 'b.m4a'));
    expect(isM4a(a)).toBe(true);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(await streamInfo(join(dir, 'a.m4a'))).toMatch(/^aac .*mono/);
    // 0.3 s silence + 0.5 s tone + 0.3 s silence → about 0.5 s (AAC adds a frame or two).
    const seconds = (await decodePcm(join(dir, 'a.m4a'))).length / 44_100;
    expect(seconds).toBeGreaterThan(0.45);
    expect(seconds).toBeLessThan(0.6);
  });

  it('keeps stereo when asked (music)', async () => {
    const dir = temp('stereo');
    writeToneWav(join(dir, 'tone.wav'));
    await encodeM4a(join(dir, 'tone.wav'), join(dir, 's.m4a'), { bitrate: '96k', stereo: true });
    expect(await streamInfo(join(dir, 's.m4a'))).toMatch(/stereo/);
  });

  it('the WebKit decode fixture is a pipeline-encoded tone', () => {
    // tests/e2e/mk8Audio.spec.ts decodes it with decodeAudioData (MK-94: plays in Safari).
    const fixture = readFileSync(join(REPO_ROOT, 'tests/e2e/fixtures/mk8-tone.m4a'));
    expect(isM4a(fixture)).toBe(true);
    expect(fixture.byteLength).toBeLessThan(20_000);
  });
});

describe('mk8 audio build (fake packs)', () => {
  it('converts the listed sounds and every voice line matching an event, and lists the gaps', async () => {
    const raw = temp('raw');
    writeToneWav(join(raw, 'audio/mk8d-menu/SE_SYS_CURSOR_00.wav'));
    writeToneWav(join(raw, 'audio/mk8d-menu/SE_SYS_CURSOR_01.wav'));
    writeToneWav(join(raw, 'audio/mk8d-common/STRM_STAR.wav'), { lead: 0, tail: 0 });
    for (const name of ['RA_GLD_00', 'RA_GLD_01', 'RD_SFAL_00', 'RD_CMDW_00', 'XX_UNUSED'])
      writeToneWav(join(raw, `audio/voice-mario/${name}.wav`), { channels: 1 });
    const out = temp('out');
    const result = await buildAudio(raw, out, {
      sounds: {
        'ui/cursor': { pack: 'mk8d-menu', file: 'se_sys_cursor_*' },
        'ui/back': { pack: 'mk8d-menu', file: null },
        'ui/decide': { pack: 'mk8d-menu', file: 'SE_SYS_DECIDE' },
        'star/music': { pack: 'mk8d-common', file: 'STRM_STAR', stereo: true },
      },
      racers: ['mario', 'luigi'],
    });
    expect(result.entries.map((e) => [e.path, e.group])).toEqual([
      ['audio/star/music.m4a', 'audio/star'],
      ['audio/ui/cursor.m4a', 'audio/ui'],
      [voiceFile('mario', 'glide', 0), 'audio/voice/mario'],
      [voiceFile('mario', 'glide', 1), 'audio/voice/mario'],
      [voiceFile('mario', 'fall', 0), 'audio/voice/mario'],
      [voiceFile('mario', 'finishWin', 0), 'audio/voice/mario'],
    ]);
    expect(result.unresolved).toEqual(['ui/back', 'ui/decide']);
    expect(result.missingVoicePacks).toEqual(['luigi']);
    expect(result.voiceGaps.mario).toEqual(
      VOICE_EVENTS.filter((e) => !['glide', 'fall', 'finishWin'].includes(e)),
    );
    expect(voiceGapReport(result.voiceGaps)[0]).toMatch(
      /^mario: select, boost, trick, hit, waterFall/,
    );
    expect(await streamInfo(join(out, 'audio/star/music.m4a'))).toMatch(/stereo/);
    expect(await streamInfo(join(out, 'audio/ui/cursor.m4a'))).toMatch(/mono/);
  });

  it('counts all audio groups together against the audio/** budget', () => {
    const manifest = {
      version: 1 as const,
      files: [
        { path: 'a', bytes: 6, sha256: '', group: 'audio/ui' },
        { path: 'b', bytes: 6, sha256: '', group: 'audio/voice/mario' },
      ],
    };
    const problems = checkAssets(temp('none'), manifest, {
      totalBytes: 1e9,
      groups: { 'audio/**': 10 },
    });
    expect(problems).toContain('over budget: audio/** is 12 B, budget 10 B');
  });
});

// The real converted audio, when $MK8_OUT has it (never in the repo or CI).
const realAudio = (readManifest(outDir())?.files ?? []).filter((f) => f.group.startsWith('audio/'));
describe.skipIf(realAudio.length === 0)('mk8 audio in $MK8_OUT', () => {
  it('every sound id resolves to a converted file, within the budget', () => {
    const paths = new Set(realAudio.map((f) => f.path));
    const missing = Object.keys(SOUND_IDS).filter((id) => !paths.has(soundFile(id)));
    expect(missing).toEqual([]);
    expect(checkAssets(outDir(), readManifest(outDir())!, loadBudgets())).toEqual([]);
  });

  it('every racer has a line for each voice event (prints the gaps)', () => {
    const gaps = VOICE_RACERS.flatMap((racer) => {
      const events = VOICE_EVENTS.filter(
        (e) => !existsSync(join(outDir(), voiceFile(racer, e, 0))),
      );
      return events.length ? [`${racer}: ${events.join(', ')}`] : [];
    });
    if (gaps.length) console.log(`voice gaps (list them on MK-94):\n  ${gaps.join('\n  ')}`);
    expect(gaps).toEqual([]);
  });
});
