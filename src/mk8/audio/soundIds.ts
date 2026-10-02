// MK8 Mode sound effects (MK-94, ADR 0012): every sound id the game will play, the sound pack it
// comes from and the file inside that pack. `pnpm mk8:build` converts exactly these to AAC
// `.m4a` at `audio/<id>.m4a` under the MK8 asset base.
//
// `file` is the pack file's name without extension (`*` matches any run of characters, case
// doesn't matter). `null` = not identified yet: the packs aren't in the repo, so the names are
// filled in by listening to the provided packs; the build lists every unresolved id.

/** Sound packs (sources.json `soundPacks`; raw WAVs in `$MK8_RAW/audio/<pack>/`). */
export const SOUND_PACKS = [
  'mk8-kart',
  'mk8-course',
  'mk8-course-objects',
  'mk8-terrain',
  'mk8d-menu',
  'mk8d-race',
  'mk8d-common',
  'mktour-items',
] as const;
export type SoundPack = (typeof SOUND_PACKS)[number];

export interface SoundSource {
  pack: SoundPack;
  file: string | null;
  /** Keep stereo (music); effects are mixed down to mono. */
  stereo?: boolean;
}

/** Kart bodies and terrain surfaces with their own sounds. */
export const KART_BODIES = [
  'standard-kart',
  'pipe-frame',
  'mach-8',
  'cat-cruiser',
  'b-dasher',
  'sports-coupe',
] as const;
export const TERRAIN_SURFACES = [
  'asphalt',
  'dirt',
  'grass',
  'sand',
  'water',
  'metal',
  'antigrav',
] as const;
export const WALL_MATERIALS = ['concrete', 'metal', 'wood', 'rock'] as const;
/** Mushroom Cup courses (model ids in tools/mk8/sources.json). */
export const COURSES = [
  'mario-kart-stadium',
  'water-park',
  'sweet-sweet-canyon',
  'thwomp-ruins',
] as const;
export const ITEM_SOUNDS: Record<string, readonly string[]> = {
  'green-shell': ['throw', 'bounce', 'hit'],
  'red-shell': ['throw', 'home', 'hit'],
  'blue-shell': ['fly', 'dive', 'explode'],
  banana: ['drop', 'throw', 'slip'],
  mushroom: ['use'],
  'golden-mushroom': ['use'],
  star: ['use'],
  lightning: ['use', 'shrink', 'grow'],
  'bob-omb': ['throw', 'explode'],
  blooper: ['use', 'ink'],
  'bullet-bill': ['use', 'end'],
  'boomerang-flower': ['throw', 'return'],
  'fire-flower': ['throw'],
  'piranha-plant': ['bite'],
  'super-horn': ['blast'],
  coin: ['get'],
  'crazy-8': ['use'],
  'item-box': ['break'],
};

const unidentified = (pack: SoundPack, stereo = false): SoundSource => ({
  pack,
  file: null,
  ...(stereo ? { stereo } : {}),
});

function table(entries: [string, SoundSource][]): Readonly<Record<string, SoundSource>> {
  return Object.fromEntries(entries);
}

export const SOUND_IDS: Readonly<Record<string, SoundSource>> = table([
  ...['cursor', 'decide', 'back', 'course-roulette'].map((s): [string, SoundSource] => [
    `ui/${s}`,
    unidentified('mk8d-menu'),
  ]),
  ...[
    'countdown-3',
    'countdown-2',
    'countdown-1',
    'go',
    'lap',
    'final-lap',
    'item-roulette',
    'item-decide',
  ]
    .concat(['lakitu-rescue', 'finish', 'rank-up'])
    .map((s): [string, SoundSource] => [`race/${s}`, unidentified('mk8d-race')]),
  ...Object.entries(ITEM_SOUNDS).flatMap(([item, sounds]) =>
    sounds.map((s): [string, SoundSource] => [`items/${item}/${s}`, unidentified('mktour-items')]),
  ),
  ...KART_BODIES.flatMap((body) =>
    ['idle', 'accel', 'boost', 'mini-turbo'].map((s): [string, SoundSource] => [
      `kart/${body}/${s}`,
      unidentified('mk8-kart'),
    ]),
  ),
  ...['blue', 'orange', 'purple'].map((c): [string, SoundSource] => [
    `drift/spark-${c}`,
    unidentified('mk8-kart'),
  ]),
  ...TERRAIN_SURFACES.flatMap((surface) =>
    ['run', 'land', 'slip'].map((s): [string, SoundSource] => [
      `terrain/${surface}/${s}`,
      unidentified('mk8-terrain'),
    ]),
  ),
  ...WALL_MATERIALS.map((m): [string, SoundSource] => [
    `terrain/wall/${m}`,
    unidentified('mk8-terrain'),
  ]),
  ...COURSES.map((c): [string, SoundSource] => [
    `course/${c}/ambience`,
    unidentified('mk8-course', true),
  ]),
  ['star/music', unidentified('mk8d-common', true)],
]);

export type SoundGroup = 'ui' | 'race' | 'items' | 'kart' | 'drift' | 'terrain' | 'course' | 'star';

export function soundGroup(id: string): SoundGroup {
  return id.split('/')[0] as SoundGroup;
}

/** Path under the MK8 asset base. */
export function soundFile(id: string): string {
  if (!SOUND_IDS[id]) throw new Error(`Unknown MK8 sound: ${id}`);
  return `audio/${id}.m4a`;
}

/** A pack file pattern as a RegExp over the file name without extension. */
export function packFilePattern(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}
