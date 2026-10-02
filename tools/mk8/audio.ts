// The audio part of `pnpm mk8:build` (MK-94, ADR 0012): converts exactly the files named in
// `src/mk8/audio/soundIds.ts` and `voiceEvents.ts` from the WAV packs in $MK8_RAW/audio/<pack>/
// to AAC `.m4a` (ffmpeg-static, 96 kbps, mono for effects, silence trimmed) in $MK8_OUT/audio/.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, extname, join, parse } from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import {
  packFilePattern,
  soundFile,
  soundGroup,
  SOUND_IDS,
  type SoundSource,
} from '../../src/mk8/audio/soundIds.ts';
import {
  VOICE_EVENTS,
  VOICE_RACERS,
  voiceFile,
  voiceFilesFor,
  type VoiceEvent,
  type VoiceRacer,
} from '../../src/mk8/audio/voiceEvents.ts';
import { entryFor, type ManifestEntry } from './manifest.ts';

const run = promisify(execFile);
const AUDIO_EXTENSIONS = ['.wav', '.ogg', '.flac', '.mp3', '.m4a'];
/** Silence below this level at either end is trimmed. */
const SILENCE_THRESHOLD = '-60dB';

export interface EncodeOptions {
  /** e.g. `96k` (ADR 0012); lower it if the audio budget is over. */
  bitrate: string;
  stereo: boolean;
}

export const AUDIO_DEFAULTS: EncodeOptions = { bitrate: '96k', stereo: false };

function ffmpeg(): string {
  if (!ffmpegPath) throw new Error('ffmpeg-static has no binary for this platform');
  return ffmpegPath;
}

/** Encodes `input` to AAC `.m4a` at `output`. Same input → same bytes (bitexact, no metadata). */
export async function encodeM4a(
  input: string,
  output: string,
  opts: EncodeOptions = AUDIO_DEFAULTS,
): Promise<Uint8Array> {
  mkdirSync(dirname(output), { recursive: true });
  const trim = `silenceremove=start_periods=1:start_threshold=${SILENCE_THRESHOLD}`;
  await run(ffmpeg(), [
    ...['-v', 'error', '-y', '-i', input, '-vn'],
    ...['-af', `${trim},areverse,${trim},areverse`],
    ...(opts.stereo ? [] : ['-ac', '1']),
    ...['-c:a', 'aac', '-b:a', opts.bitrate],
    ...[
      '-map_metadata',
      '-1',
      '-fflags',
      '+bitexact',
      '-flags:a',
      '+bitexact',
      '-movflags',
      '+faststart',
    ],
    output,
  ]);
  return new Uint8Array(readFileSync(output));
}

/** Decodes any audio file to mono 16-bit PCM at `rate` (for tests and duration checks). */
export async function decodePcm(input: string, rate = 44_100): Promise<Int16Array> {
  const { stdout } = await run(
    ffmpeg(),
    ['-v', 'error', '-i', input, '-f', 's16le', '-ac', '1', '-ar', `${rate}`, '-'],
    {
      encoding: 'buffer',
      maxBuffer: 1 << 30,
    },
  );
  return new Int16Array(stdout.buffer, stdout.byteOffset, stdout.byteLength / 2);
}

/** Audio files in a pack folder: name without extension → path; sorted, first one wins. */
export function packFiles(dir: string): Map<string, string> {
  const files = new Map<string, string>();
  if (!existsSync(dir)) return files;
  for (const rel of readdirSync(dir, { recursive: true, encoding: 'utf8' }).sort()) {
    if (!AUDIO_EXTENSIONS.includes(extname(rel).toLowerCase())) continue;
    const name = parse(rel).name;
    if (!files.has(name)) files.set(name, join(dir, rel));
  }
  return files;
}

export function resolveSound(source: SoundSource, files: Map<string, string>): string | undefined {
  if (!source.file) return undefined;
  const pattern = packFilePattern(source.file);
  const match = [...files.keys()].sort().find((name) => pattern.test(name));
  return match ? files.get(match) : undefined;
}

export interface AudioResult {
  entries: ManifestEntry[];
  /** Sound ids not converted: no file named yet, pack missing, or no file matches. */
  unresolved: string[];
  /** Voice packs not in $MK8_RAW. */
  missingVoicePacks: string[];
  /** Racer → events with no matching file in that racer's pack. */
  voiceGaps: Partial<Record<VoiceRacer, VoiceEvent[]>>;
}

export interface AudioSources {
  sounds?: Readonly<Record<string, SoundSource>>;
  racers?: readonly VoiceRacer[];
}

export async function buildAudio(
  rawRoot: string,
  outRoot: string,
  sources: AudioSources = {},
): Promise<AudioResult> {
  const sounds = sources.sounds ?? SOUND_IDS;
  const racers = sources.racers ?? VOICE_RACERS;
  const result: AudioResult = { entries: [], unresolved: [], missingVoicePacks: [], voiceGaps: {} };
  const packCache = new Map<string, Map<string, string>>();
  const pack = (id: string) => {
    let files = packCache.get(id);
    if (!files) packCache.set(id, (files = packFiles(join(rawRoot, 'audio', id))));
    return files;
  };

  for (const id of Object.keys(sounds).sort()) {
    const source = sounds[id];
    const input = source && resolveSound(source, pack(source.pack));
    if (!source || !input) {
      result.unresolved.push(id);
      continue;
    }
    const path = soundFile(id);
    const bytes = await encodeM4a(input, join(outRoot, path), {
      ...AUDIO_DEFAULTS,
      stereo: source.stereo ?? false,
    });
    result.entries.push(entryFor(path, bytes, `audio/${soundGroup(id)}`));
  }

  for (const racer of racers) {
    const files = pack(`voice-${racer}`);
    if (files.size === 0) {
      result.missingVoicePacks.push(racer);
      continue;
    }
    // Old variants would linger in the manifest's folder otherwise.
    rmSync(join(outRoot, 'audio', 'voice', racer), { recursive: true, force: true });
    const names = [...files.keys()];
    for (const event of VOICE_EVENTS) {
      const matches = voiceFilesFor(event, names);
      if (matches.length === 0) (result.voiceGaps[racer] ??= []).push(event);
      for (const [n, name] of matches.entries()) {
        const path = voiceFile(racer, event, n);
        const bytes = await encodeM4a(files.get(name) ?? '', join(outRoot, path));
        result.entries.push(entryFor(path, bytes, `audio/voice/${racer}`));
      }
    }
  }
  return result;
}

/** The gap list for the ticket: one line per racer with missing voice events. */
export function voiceGapReport(gaps: AudioResult['voiceGaps']): string[] {
  return Object.entries(gaps).map(([racer, events]) => `${racer}: ${events.join(', ')}`);
}
