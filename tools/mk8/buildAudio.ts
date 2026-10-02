// The audio part of `pnpm mk8:build` (MK-94): every sound in src/mk8/audio/soundIds.ts whose
// raw file exists → `audio/<id>.m4a`, and every racer voice pack's files that match a voice
// event (voiceEvents.ts) → `audio/voice/<racer>/<name>.m4a` + `audio/voices.json`.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  SOUND_IDS,
  SOUNDS,
  soundGroup,
  soundPath,
  type SoundId,
} from '../../src/mk8/audio/soundIds.ts';
import {
  VOICE_EVENTS,
  voiceFilesByEvent,
  voiceGaps,
  type VoiceEvent,
} from '../../src/mk8/audio/voiceEvents.ts';
import { convertAudio } from './audio.ts';
import { entryFor, type ManifestEntry } from './manifest.ts';
import type { SoundSource } from './sources.ts';

export const VOICES_FILE = 'audio/voices.json';

/** racer → event → converted files (relative to the output folder). */
export type VoiceIndex = Record<string, Record<VoiceEvent, string[]>>;

export interface AudioResult {
  entries: ManifestEntry[];
  /** Sound ids whose raw file wasn't found, with the path looked for. */
  missingSounds: { id: SoundId; file: string }[];
  /** Voice packs with no raw folder. */
  missingVoices: string[];
  /** racer → events with no file. */
  voiceGaps: Record<string, VoiceEvent[]>;
}

const AUDIO_FILE = /\.(wav|ogg|mp3|flac|aiff?|m4a|opus)$/i;

function listAudio(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (AUDIO_FILE.test(e.name)) out.push(relative(dir, full).split(/[\\/]/).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/** `RD_MARIO_FAL_01.wav` → `rd_mario_fal_01` (output file name). */
export function voiceOutputName(file: string): string {
  const name = file.split('/').pop() ?? file;
  return name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-');
}

async function convertTo(input: string, outRoot: string, path: string, stereo: boolean) {
  const file = join(outRoot, path);
  mkdirSync(dirname(file), { recursive: true });
  await convertAudio(input, file, { stereo });
  return readFileSync(file);
}

export async function buildAudio(
  packs: SoundSource[],
  rawRoot: string,
  outRoot: string,
  options: { ids?: readonly SoundId[]; log?: (line: string) => void } = {},
): Promise<AudioResult> {
  const log = options.log ?? console.log;
  const result: AudioResult = { entries: [], missingSounds: [], missingVoices: [], voiceGaps: {} };

  for (const id of options.ids ?? SOUND_IDS) {
    const source = SOUNDS[id];
    const input = join(rawRoot, 'sounds', source.pack, source.file);
    if (!existsSync(input)) {
      result.missingSounds.push({ id, file: `sounds/${source.pack}/${source.file}` });
      continue;
    }
    const path = soundPath(id);
    const bytes = await convertTo(input, outRoot, path, source.stereo ?? false);
    result.entries.push(entryFor(path, bytes, soundGroup(id)));
  }
  const converted = result.entries.length;
  if (converted) log(`  sounds: ${converted} converted`);

  // Racers not rebuilt this time keep their entries.
  const indexFile = join(outRoot, VOICES_FILE);
  const index: VoiceIndex = existsSync(indexFile)
    ? (JSON.parse(readFileSync(indexFile, 'utf8')) as VoiceIndex)
    : {};
  let voicesBuilt = 0;
  for (const pack of packs.filter((p) => p.kind === 'voice')) {
    const racer = pack.racer ?? pack.id;
    const dir = join(rawRoot, 'sounds', pack.id);
    if (!existsSync(dir)) {
      result.missingVoices.push(pack.id);
      continue;
    }
    // A rebuilt racer replaces its old files, so renamed or no-longer-matching ones don't linger.
    rmSync(join(outRoot, 'audio', 'voice', racer), { recursive: true, force: true });
    const byEvent = voiceFilesByEvent(listAudio(dir));
    const outputs = {} as Record<VoiceEvent, string[]>;
    const done = new Map<string, string>();
    for (const event of VOICE_EVENTS) {
      outputs[event] = [];
      for (const file of byEvent[event]) {
        let path = done.get(file);
        if (!path) {
          path = `audio/voice/${racer}/${voiceOutputName(file)}.m4a`;
          const clash = [...done].find(([, p]) => p === path)?.[0];
          if (clash) throw new Error(`${pack.id}: ${file} and ${clash} both convert to ${path}`);
          const bytes = await convertTo(join(dir, file), outRoot, path, false);
          result.entries.push(entryFor(path, bytes, `audio/voice/${racer}`));
          done.set(file, path);
        }
        outputs[event].push(path);
      }
    }
    index[racer] = outputs;
    voicesBuilt++;
    const gaps = voiceGaps(outputs);
    if (gaps.length) result.voiceGaps[racer] = gaps;
    log(
      `  voice ${racer}: ${done.size} files${gaps.length ? `, no file for ${gaps.join(', ')}` : ''}`,
    );
  }
  if (voicesBuilt) {
    const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => (a < b ? -1 : 1)));
    const bytes = Buffer.from(`${JSON.stringify(sorted, null, 2)}\n`);
    mkdirSync(join(outRoot, 'audio'), { recursive: true });
    writeFileSync(indexFile, bytes);
    result.entries.push(entryFor(VOICES_FILE, bytes, 'audio/voice'));
  }
  return result;
}
