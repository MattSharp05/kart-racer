// Audio conversion for the MK8 pipeline (MK-94, ADR 0009): any file ffmpeg reads (the packs are
// WAV) → AAC `.m4a`, mono unless asked for stereo, 96 kbps, leading and trailing silence trimmed.
// Uses the pinned `ffmpeg-static` binary (`FFMPEG_PATH` overrides it). Output is bit-exact: no
// encoder tag or timestamps, so the same input gives the same bytes.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';

const run = promisify(execFile);

export const AUDIO_DEFAULTS = {
  /** AAC bitrate. */
  bitrate: '96k',
  /** Below this level counts as silence when trimming the ends. */
  silenceDb: -60,
  /** Silence kept at each end after trimming, seconds (avoids clipping a soft attack). */
  keepSeconds: 0.01,
  sampleRate: 44100,
};

export interface AudioOptions {
  stereo?: boolean;
  bitrate?: string;
  silenceDb?: number;
}

export function ffmpegPath(): string {
  const path = process.env.FFMPEG_PATH || ffmpegStatic;
  if (!path) throw new Error('no ffmpeg binary: ffmpeg-static has none for this platform');
  return path;
}

/** Trims silence at the start, then (reversed) at the end. */
function trimFilter(silenceDb: number): string {
  const trim = `silenceremove=start_periods=1:start_threshold=${silenceDb}dB:start_silence=${AUDIO_DEFAULTS.keepSeconds}`;
  return `${trim},areverse,${trim},areverse`;
}

/** Converts `input` to an `.m4a` at `output` (overwritten). */
export async function convertAudio(
  input: string,
  output: string,
  options: AudioOptions = {},
): Promise<void> {
  const args = [
    '-hide_banner',
    '-nostdin',
    '-loglevel',
    'error',
    '-y',
    '-i',
    input,
    '-vn',
    '-map_metadata',
    '-1',
    '-af',
    trimFilter(options.silenceDb ?? AUDIO_DEFAULTS.silenceDb),
    '-ac',
    options.stereo ? '2' : '1',
    '-ar',
    String(AUDIO_DEFAULTS.sampleRate),
    '-c:a',
    'aac',
    '-b:a',
    options.bitrate ?? AUDIO_DEFAULTS.bitrate,
    '-fflags',
    '+bitexact',
    '-flags:a',
    '+bitexact',
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    output,
  ];
  try {
    await run(ffmpegPath(), args);
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new Error(`ffmpeg failed on ${input}${stderr ? `: ${stderr}` : ''}`, { cause: error });
  }
}

export interface AudioInfo {
  codec: string;
  channels: number;
  sampleRate: number;
  /** Stream bitrate from the header, when it states one. */
  kbps?: number;
  /** Decoded length in seconds. */
  seconds: number;
}

/** Decodes `file` with ffmpeg: codec, channels and sample rate from its header, length from the samples. */
export async function audioInfo(file: string): Promise<AudioInfo> {
  const { stdout, stderr } = await run(
    ffmpegPath(),
    ['-hide_banner', '-nostdin', '-i', file, '-f', 's16le', '-acodec', 'pcm_s16le', '-'],
    { encoding: 'buffer', maxBuffer: 1 << 28 },
  );
  const header = /Audio: (\w+)[^,]*, (\d+) Hz, (mono|stereo)/.exec(stderr.toString());
  if (!header) throw new Error(`audioInfo: no audio stream in ${file}`);
  const channels = header[3] === 'mono' ? 1 : 2;
  const kbps = /Audio: .*?, (\d+) kb\/s/.exec(stderr.toString())?.[1];
  const sampleRate = Number(header[2]);
  return {
    codec: header[1] ?? '',
    channels,
    sampleRate,
    ...(kbps ? { kbps: Number(kbps) } : {}),
    seconds: stdout.byteLength / 2 / channels / sampleRate,
  };
}
