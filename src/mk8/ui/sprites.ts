// MK8 Mode UI sprites (MK-95): every sprite id the UI uses, its file under the MK8 asset base and
// its pixel size. Ids match the approved mockup. The files come from `pnpm mk8:build`
// (`tools/mk8/sprites.ts`, which crops them by the specs in `tools/mk8/spriteSpecs.ts`) and are
// not in the repo; where they are served from is still open, hence the configurable base.

export type SpriteGroup =
  | 'character'
  | 'item'
  | 'cup'
  | 'course-preview'
  | 'course-map'
  | 'vehicle'
  | 'logo'
  | 'result-background'
  | 'font';

export interface Sprite {
  /** Path under the MK8 asset base, e.g. `ui/characters/c_mario.webp`. */
  file: string;
  width: number;
  height: number;
  group: SpriteGroup;
  /** Keyed-out background: the corners are transparent. */
  transparent: boolean;
}

/** Where `pnpm mk8:build`'s output is served; `/mk8/` in `pnpm dev` (vite serves `$MK8_OUT` there). */
export const MK8_ASSET_BASE = '/mk8/';

const GROUP_DIRS: Record<SpriteGroup, string> = {
  character: 'characters',
  item: 'items',
  cup: 'cups',
  'course-preview': 'courses',
  'course-map': 'maps',
  vehicle: 'vehicles',
  logo: 'title',
  'result-background': 'results',
  font: 'fonts',
};

function group(
  kind: SpriteGroup,
  ids: readonly string[],
  width: number,
  height: number,
  transparent: boolean,
): [string, Sprite][] {
  return ids.map((id) => [
    id,
    { file: `ui/${GROUP_DIRS[kind]}/${id}.webp`, width, height, group: kind, transparent },
  ]);
}

export const CHARACTER_SPRITES = [
  'c_mario',
  'c_luigi',
  'c_peach',
  'c_daisy',
  'c_yoshi',
  'c_toad',
  'c_koopa',
  'c_shyguy',
  'c_bowser',
  'c_dk',
  'c_wario',
  'c_waluigi',
] as const;

export const ITEM_SPRITES = [
  'i_green',
  'i_green3',
  'i_red',
  'i_red3',
  'i_banana',
  'i_banana3',
  'i_boomerang',
  'i_mushroom',
  'i_mushroom3',
  'i_golden',
  'i_coin',
  'i_fireflower',
  'i_bobomb',
  'i_star',
  'i_lightning',
  'i_blooper',
  'i_piranha',
  'i_bullet',
  'i_spiny',
  'i_horn',
  'i_crazy8',
] as const;

/** Engine-class shields and cup emblems (one sheet). */
export const CUP_SPRITES = [
  'u_cc50',
  'u_cc100',
  'u_cc150',
  'u_mirror',
  'u_mushroomcup',
  'u_flowercup',
  'u_starcup',
  'u_specialcup',
  'u_shellcup',
  'u_bananacup',
  'u_leafcup',
  'u_lightningcup',
  'u_cc200',
] as const;

/** Mushroom Cup courses, in cup order. */
export const COURSE_KEYS = ['stadium', 'waterpark', 'canyon', 'ruins'] as const;

export const VEHICLE_SPRITES = [
  'v_b_standard',
  'v_b_pipe',
  'v_b_mach8',
  'v_b_cat',
  'v_b_bdasher',
  'v_b_coupe',
  'v_t_standard',
  'v_t_monster',
  'v_t_roller',
  'v_t_slick',
  'v_g_super',
  'v_g_cloud',
  'v_g_parasol',
] as const;

export const FONT_SPRITES = ['font_digital', 'font_point'] as const;

export const SPRITES: Readonly<Record<string, Sprite>> = Object.fromEntries([
  ...group('character', CHARACTER_SPRITES, 128, 128, false),
  ...group('item', ITEM_SPRITES, 128, 128, true),
  ...group('cup', CUP_SPRITES, 128, 128, true),
  ...group(
    'course-preview',
    COURSE_KEYS.map((k) => `p_${k}`),
    304,
    162,
    false,
  ),
  ...group(
    'course-map',
    COURSE_KEYS.map((k) => `m_${k}`),
    240,
    240,
    false,
  ),
  ...group('vehicle', VEHICLE_SPRITES, 200, 128, false),
  ...group('logo', ['logo'], 640, 195, false),
  ...group(
    'result-background',
    COURSE_KEYS.map((k) => `bg_${k}`),
    1280,
    720,
    false,
  ),
  // Ten digits 0–9 in a row: the turbo_DigitalNum (51×75) and turbo_PointNum (51×73) cells.
  [
    'font_digital',
    {
      file: 'ui/fonts/font_digital.webp',
      width: 510,
      height: 75,
      group: 'font',
      transparent: false,
    },
  ],
  [
    'font_point',
    { file: 'ui/fonts/font_point.webp', width: 510, height: 73, group: 'font', transparent: false },
  ],
]);

export function sprite(id: string): Sprite {
  const found = SPRITES[id];
  if (!found) throw new Error(`Unknown MK8 sprite: ${id}`);
  return found;
}

export function spriteUrl(id: string, base: string = MK8_ASSET_BASE): string {
  return `${base}${sprite(id).file}`;
}
