// MK8 Mode racer voices (MK-94, ADR 0012): which lines a racer says for each game event. The
// racer voice packs share one naming scheme, so each event is a list of file-name patterns (no
// extension, `*` = any run of characters, case-insensitive) that works for every racer's pack.
// Every file a pattern matches becomes one variant: `audio/voice/<racer>/<event>-<n>.m4a`.
//
// Codes from the ticket (to verify by listening, Mario's pack first): `RA_GLD` glide, `RD_*FAL`
// fall, `RD_CMDW` / `RD_CMDL` win / lose. The other events are not identified yet (empty lists):
// they need the packs to listen to, and are listed on MK-94.

// With the extension: the asset pipeline (tools/mk8, plain Node) imports this file too.
import { packFilePattern } from './soundIds.ts';

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

export const VOICE_PATTERNS: Readonly<Record<VoiceEvent, readonly string[]>> = {
  select: [],
  boost: [],
  trick: [],
  glide: ['RA_GLD*'],
  hit: [],
  fall: ['RD_*FAL*'],
  waterFall: [],
  overtake: [],
  itemHit: [],
  finishWin: ['RD_CMDW*'],
  finishLose: ['RD_CMDL*'],
  horn: [],
};

/** Racers with a voice pack (model ids in tools/mk8/sources.json; pack `voice-<racer>`). */
export const VOICE_RACERS = [
  'mario',
  'luigi',
  'peach',
  'daisy',
  'yoshi',
  'toad',
  'koopa-troopa',
  'shy-guy',
  'donkey-kong',
  'bowser',
  'wario',
  'waluigi',
] as const;
export type VoiceRacer = (typeof VOICE_RACERS)[number];

/** The pack files (names without extension) that match `event`, sorted. */
export function voiceFilesFor(event: VoiceEvent, names: readonly string[]): string[] {
  const patterns = VOICE_PATTERNS[event].map(packFilePattern);
  return names.filter((n) => patterns.some((p) => p.test(n))).sort();
}

export function voiceFile(racer: VoiceRacer, event: VoiceEvent, variant: number): string {
  return `audio/voice/${racer}/${event}-${variant}.m4a`;
}
