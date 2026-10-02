// MK8 Mode racer voices (MK-94): which voice-pack files play for which game event. The patterns
// match file names in every racer's pack, so one table serves all 12 racers. `pnpm mk8:build`
// converts each matching file to `audio/voice/<racer>/<name>.m4a` and writes `audio/voices.json`
// (racer → event → files) for the game to pick from.
//
// `RA_GLD`, `RD_*FAL` and `RD_CMDW`/`RD_CMDL` come from the ticket; the other codes are guesses
// until they are verified by listening (Mario's pack first). Correct them here when they are.

export const VOICE_EVENTS = [
  'select',
  'boost',
  'trick',
  'glide',
  'hit',
  'fall',
  'waterFall',
  'overtake',
  'itemHit',
  'finishWin',
  'finishLose',
  'horn',
] as const;
export type VoiceEvent = (typeof VOICE_EVENTS)[number];

export interface VoicePatterns {
  /**
   * File-name patterns (without extension, case-insensitive). `*` matches any run of characters;
   * a pattern may match anywhere in the name, so `RA_GLD` matches `SE_MARIO_RA_GLD_01`.
   */
  patterns: string[];
  /** Patterns of files a broader pattern above would also match but that belong elsewhere. */
  exclude?: string[];
  /** True once someone has listened to the matched files and confirmed the event. */
  verified: boolean;
}

export const VOICE_PATTERNS: Readonly<Record<VoiceEvent, VoicePatterns>> = {
  select: { patterns: ['RA_SEL', 'RD_SEL'], verified: false },
  boost: { patterns: ['RA_DASH', 'RA_BST'], verified: false },
  trick: { patterns: ['RA_JMP', 'RA_TRK'], verified: false },
  glide: { patterns: ['RA_GLD'], verified: false },
  hit: { patterns: ['RD_DMG', 'RD_SPIN'], verified: false },
  fall: { patterns: ['RD_*FAL'], exclude: ['RD_W*FAL'], verified: false },
  waterFall: { patterns: ['RD_W*FAL'], verified: false },
  overtake: { patterns: ['RA_PASS', 'RA_OVT'], verified: false },
  itemHit: { patterns: ['RA_ITMHIT', 'RA_HIT'], verified: false },
  finishWin: { patterns: ['RD_CMDW'], verified: false },
  finishLose: { patterns: ['RD_CMDL'], verified: false },
  horn: { patterns: ['RA_HORN', 'RA_HRN'], verified: false },
};

function patternRegExp(pattern: string): RegExp {
  const body = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(body, 'i');
}

function baseName(file: string): string {
  const name = file.split(/[\\/]/).pop() ?? file;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** True when `file` (a path or name) is a voice line for `event`. */
export function matchesVoiceEvent(event: VoiceEvent, file: string): boolean {
  const name = baseName(file);
  const { patterns, exclude = [] } = VOICE_PATTERNS[event];
  return (
    patterns.some((p) => patternRegExp(p).test(name)) &&
    !exclude.some((p) => patternRegExp(p).test(name))
  );
}

/** A racer's files grouped by event (sorted); files matching no event are left out. */
export function voiceFilesByEvent(files: readonly string[]): Record<VoiceEvent, string[]> {
  const sorted = [...files].sort();
  const out = {} as Record<VoiceEvent, string[]>;
  for (const event of VOICE_EVENTS) out[event] = sorted.filter((f) => matchesVoiceEvent(event, f));
  return out;
}

/** The events a racer has no file for. */
export function voiceGaps(byEvent: Record<VoiceEvent, readonly string[]>): VoiceEvent[] {
  return VOICE_EVENTS.filter((event) => byEvent[event].length === 0);
}
