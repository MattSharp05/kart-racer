// Where each UI sprite comes from (MK-95): its sheet, the crop rectangle and what to do to it.
// The sheet grids were measured while building the MK8 Mode mockup; the ticket lists them.
import {
  COURSE_KEYS,
  CUP_SPRITES,
  ITEM_SPRITES,
  VEHICLE_SPRITES,
} from '../../src/mk8/ui/sprites.ts';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SpriteSpec {
  id: string;
  /** Sheet id in sources.json. */
  sheet: string;
  /** For folder sheets (extracted zips): the file's name without extension. */
  file?: string;
  /** Crop from the sheet; omitted = the whole image. */
  rect?: Rect;
  /** Trim a uniform black band (course previews). */
  trimBlack?: boolean;
  /** Make the background transparent: flood fill from the corners. */
  keyOut?: boolean;
  /** Resize after cropping: `[width, height]` (cover) or `[width]` (keep aspect). */
  resize?: [number, number] | [number];
  /** Encode lossless (bitmap digits). */
  lossless?: boolean;
}

const cell = (index: number, perRow: number, w: number, h: number, inset = 0): Rect => ({
  left: (index % perRow) * w + inset,
  top: Math.floor(index / perRow) * h + inset,
  width: w - inset * 2,
  height: h - inset * 2,
});

/** Character icons: 129 px cells, 9 per row, 128 px icons. */
const CHARACTER_INDEX: Record<string, number> = {
  c_mario: 0,
  c_luigi: 1,
  c_peach: 2,
  c_daisy: 3,
  c_yoshi: 6,
  c_toad: 15,
  c_koopa: 16,
  c_shyguy: 17,
  c_bowser: 34,
  c_dk: 35,
  c_wario: 36,
  c_waluigi: 37,
};

/** Vehicle parts: 201×142 cells, 12 per row, a 14 px label band on top of each. */
const VEHICLE_CELL: Record<(typeof VEHICLE_SPRITES)[number], [row: number, col: number]> = {
  v_b_standard: [0, 0],
  v_b_pipe: [4, 0],
  v_b_mach8: [8, 0],
  v_b_cat: [8, 2],
  v_b_coupe: [8, 10],
  v_b_bdasher: [9, 7],
  v_t_standard: [22, 3],
  v_t_monster: [22, 4],
  v_t_roller: [22, 5],
  v_t_slick: [22, 7],
  v_g_super: [24, 0],
  v_g_cloud: [28, 0],
  v_g_parasol: [28, 3],
};
const VEHICLE_LABEL = 14;

const RESULT_FILES: Record<(typeof COURSE_KEYS)[number], string> = {
  stadium: 'ym_awardbg_gu_firstcircuit',
  waterpark: 'ym_awardbg_gu_waterpark',
  canyon: 'ym_awardbg_gu_cake',
  ruins: 'ym_awardbg_gu_dossuniseki',
};

export const SPRITE_SPECS: SpriteSpec[] = [
  ...Object.entries(CHARACTER_INDEX).map(([id, i]) => ({
    id,
    sheet: 'character-icons',
    rect: { ...cell(i, 9, 129, 129), width: 128, height: 128 },
  })),
  // Items and cups: 132 px cells around a 128 px icon (2 px inset), background keyed out.
  ...ITEM_SPRITES.map((id, i) => ({
    id,
    sheet: 'items',
    rect: cell(i, 7, 132, 132, 2),
    keyOut: true,
  })),
  ...CUP_SPRITES.map((id, i) => ({
    id,
    sheet: 'cups',
    rect: cell(i, 4, 132, 132, 2),
    keyOut: true,
  })),
  // Mushroom Cup is row 0 of both course sheets.
  ...COURSE_KEYS.map((key, i) => ({
    id: `p_${key}`,
    sheet: 'course-previews',
    rect: cell(i, 4, 306, 258),
    trimBlack: true,
    resize: [304, 162] as [number, number],
  })),
  ...COURSE_KEYS.map((key, i) => ({
    id: `m_${key}`,
    sheet: 'course-maps',
    rect: cell(i, 4, 482, 482, 1),
    resize: [240, 240] as [number, number],
  })),
  ...VEHICLE_SPRITES.map((id) => {
    const [row, col] = VEHICLE_CELL[id];
    return {
      id,
      sheet: 'vehicle-parts',
      rect: { left: col * 201, top: row * 142 + VEHICLE_LABEL, width: 200, height: 128 },
    };
  }),
  { id: 'logo', sheet: 'title-screen', rect: { left: 0, top: 5690, width: 640, height: 195 } },
  ...COURSE_KEYS.map((key) => ({
    id: `bg_${key}`,
    sheet: 'result-backgrounds',
    file: RESULT_FILES[key],
    resize: [1280] as [number],
  })),
  { id: 'font_digital', sheet: 'fonts', file: 'turbo_DigitalNum_51x75', lossless: true },
  { id: 'font_point', sheet: 'fonts', file: 'turbo_PointNum_51x73', lossless: true },
];
