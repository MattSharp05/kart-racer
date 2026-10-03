// MK8 Mode sound bank (MK-94, ADR 0012): every sound id the game can play → the file in a sound
// pack it is converted from. `pnpm mk8:build` converts exactly these files (raw pack files in
// `$MK8_RAW/sounds/<pack>/`) to `audio/<id>.m4a`. Packs are listed in tools/mk8/sources.json.
//
// The `file` names are placeholders until the packs are provided: correct each one to the real
// file in its pack (the build lists every file it can't find). Hooking sounds into the game is
// done by later tickets.

/** The sound-effect packs in sources.json (voice packs are mapped by voiceEvents.ts). */
export type SoundPackId =
  | 'mk8-kart'
  | 'mk8-course'
  | 'mk8-course-object'
  | 'mk8-terrain'
  | 'mk8dx-menu'
  | 'mk8dx-race'
  | 'mk8dx-common'
  | 'mkt-item';

export interface SoundSource {
  pack: SoundPackId;
  /** Path inside the pack's raw folder. */
  file: string;
  /** Kept stereo (music); everything else is converted to mono. */
  stereo?: boolean;
}

export const KART_BODIES = [
  'standard-kart',
  'pipe-frame',
  'mach-8',
  'cat-cruiser',
  'b-dasher',
  'sports-coupe',
] as const;
export const KART_SOUNDS = ['idle', 'accel', 'boost', 'mini-turbo'] as const;
export const TERRAINS = ['asphalt', 'dirt', 'grass', 'sand', 'water', 'metal', 'wood'] as const;
export const TERRAIN_SOUNDS = ['run', 'land', 'slip'] as const;
export const WALL_MATERIALS = ['concrete', 'metal', 'wood'] as const;
export const COURSES = [
  'mario-kart-stadium',
  'water-park',
  'sweet-sweet-canyon',
  'thwomp-ruins',
] as const;

type KartSoundId = `kart/${(typeof KART_BODIES)[number]}/${(typeof KART_SOUNDS)[number]}`;
type TerrainSoundId = `terrain/${(typeof TERRAINS)[number]}/${(typeof TERRAIN_SOUNDS)[number]}`;
type WallSoundId = `terrain/wall/${(typeof WALL_MATERIALS)[number]}`;
type CourseSoundId = `course/${(typeof COURSES)[number]}/ambience`;

const FIXED = {
  'ui/cursor': { pack: 'mk8dx-menu', file: 'cursor.wav' },
  'ui/decide': { pack: 'mk8dx-menu', file: 'decide.wav' },
  'ui/back': { pack: 'mk8dx-menu', file: 'back.wav' },
  'ui/name-appear': { pack: 'mk8dx-menu', file: 'name-appear.wav' },
  'ui/course-roulette': { pack: 'mk8dx-menu', file: 'course-roulette.wav' },

  'race/countdown': { pack: 'mk8dx-race', file: 'countdown-321.wav' },
  'race/go': { pack: 'mk8dx-race', file: 'go.wav' },
  'race/lap': { pack: 'mk8dx-race', file: 'lap.wav' },
  'race/final-lap': { pack: 'mk8dx-race', file: 'final-lap.wav' },
  'race/item-roulette': { pack: 'mk8dx-race', file: 'item-roulette.wav' },
  'race/item-decide': { pack: 'mk8dx-race', file: 'item-decide.wav' },
  'race/lakitu-rescue': { pack: 'mk8dx-race', file: 'lakitu-rescue.wav' },
  'race/finish': { pack: 'mk8dx-race', file: 'finish.wav' },
  'race/rank-up': { pack: 'mk8dx-race', file: 'rank-up.wav' },
  // MK-121: the pause menu opening and closing (placeholder file names, like the others).
  'race/pause': { pack: 'mk8dx-race', file: 'pause.wav' },
  'race/unpause': { pack: 'mk8dx-race', file: 'unpause.wav' },

  'items/item-box-break': { pack: 'mkt-item', file: 'item-box-break.wav' },
  'items/mushroom-use': { pack: 'mkt-item', file: 'mushroom-use.wav' },
  'items/golden-mushroom-use': { pack: 'mkt-item', file: 'golden-mushroom-use.wav' },
  'items/banana-drop': { pack: 'mkt-item', file: 'banana-drop.wav' },
  'items/banana-hit': { pack: 'mkt-item', file: 'banana-hit.wav' },
  'items/shell-throw': { pack: 'mkt-item', file: 'shell-throw.wav' },
  'items/shell-bounce': { pack: 'mkt-item', file: 'shell-bounce.wav' },
  'items/shell-hit': { pack: 'mkt-item', file: 'shell-hit.wav' },
  'items/red-shell-lock': { pack: 'mkt-item', file: 'red-shell-lock.wav' },
  'items/blue-shell-fly': { pack: 'mkt-item', file: 'blue-shell-fly.wav' },
  'items/blue-shell-explode': { pack: 'mkt-item', file: 'blue-shell-explode.wav' },
  'items/bob-omb-explode': { pack: 'mkt-item', file: 'bob-omb-explode.wav' },
  'items/star-use': { pack: 'mkt-item', file: 'star-use.wav' },
  'items/lightning-strike': { pack: 'mkt-item', file: 'lightning-strike.wav' },
  'items/blooper-ink': { pack: 'mkt-item', file: 'blooper-ink.wav' },
  'items/bullet-bill-use': { pack: 'mkt-item', file: 'bullet-bill-use.wav' },
  'items/boomerang-throw': { pack: 'mkt-item', file: 'boomerang-throw.wav' },
  'items/fire-flower-shoot': { pack: 'mkt-item', file: 'fire-flower-shoot.wav' },
  'items/piranha-plant-bite': { pack: 'mkt-item', file: 'piranha-plant-bite.wav' },
  'items/super-horn-blast': { pack: 'mkt-item', file: 'super-horn-blast.wav' },
  'items/coin-get': { pack: 'mkt-item', file: 'coin-get.wav' },

  'drift/start': { pack: 'mk8-kart', file: 'drift-start.wav' },
  'drift/blue': { pack: 'mk8-kart', file: 'drift-spark-blue.wav' },
  'drift/orange': { pack: 'mk8-kart', file: 'drift-spark-orange.wav' },
  'drift/purple': { pack: 'mk8-kart', file: 'drift-spark-purple.wav' },

  'course/thwomp-ruins/thwomp-slam': { pack: 'mk8-course-object', file: 'thwomp-slam.wav' },

  'star/music': { pack: 'mk8dx-race', file: 'star.wav', stereo: true },
} as const satisfies Record<string, SoundSource>;

export type SoundId =
  keyof typeof FIXED | KartSoundId | TerrainSoundId | WallSoundId | CourseSoundId;

function generated(): Record<
  KartSoundId | TerrainSoundId | WallSoundId | CourseSoundId,
  SoundSource
> {
  const out: Record<string, SoundSource> = {};
  for (const body of KART_BODIES)
    for (const sound of KART_SOUNDS)
      out[`kart/${body}/${sound}`] = { pack: 'mk8-kart', file: `${body}/${sound}.wav` };
  for (const terrain of TERRAINS)
    for (const sound of TERRAIN_SOUNDS)
      out[`terrain/${terrain}/${sound}`] = { pack: 'mk8-terrain', file: `${terrain}-${sound}.wav` };
  for (const material of WALL_MATERIALS)
    out[`terrain/wall/${material}`] = { pack: 'mk8-terrain', file: `wall-${material}.wav` };
  for (const course of COURSES)
    out[`course/${course}/ambience`] = { pack: 'mk8-course', file: `${course}/ambience.wav` };
  return out;
}

/** Every sound id → its source file. */
export const SOUNDS: Readonly<Record<SoundId, SoundSource>> = { ...FIXED, ...generated() };

export const SOUND_IDS = Object.keys(SOUNDS).sort() as SoundId[];

/** Where a sound's `.m4a` goes, relative to the MK8 asset root. */
export function soundPath(id: SoundId): string {
  return `audio/${id}.m4a`;
}

/** Manifest group: `audio/<first segment>`, or `audio/course/<id>` for a course's sounds. */
export function soundGroup(id: SoundId): string {
  const [first, second] = id.split('/');
  return first === 'course' ? `audio/course/${second}` : `audio/${first}`;
}
