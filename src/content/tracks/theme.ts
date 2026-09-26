/**
 * A track's look (MK-49): sky, fog, light, palette and scenery. Plain data, so it lives with the
 * track's `sim.ts`; `render/theme.ts` applies it. Colours are 0xRRGGBB numbers.
 */
export interface TrackTheme {
  /** Sky gradient, top of the screen to the horizon. */
  sky: { top: number; middle: number; horizon: number };
  /** Distance fog (none when absent), m. */
  fog?: { colour: number; near: number; far: number };
  /** Sky/ground fill light and the sun. */
  light: {
    sky: number;
    ground: number;
    fillIntensity: number;
    sun: number;
    sunIntensity: number;
  };
  palette: {
    road: number;
    verge: number;
    terrain: number;
    /** Deep grass on shortcut infields. */
    infield: number;
    wallA: number;
    wallB: number;
  };
  /** Scenery set drawn around the track (`render/scenery.ts` → `SCENERY_SETS`). */
  scenery: string;
  /** Night: glowing lamps along the walls and emissive hazards. */
  night?: boolean;
}

/** Sunny Circuit's look, and the default for tracks without a theme. */
export const SUNNY_THEME: TrackTheme = {
  sky: { top: 0x4aa3e8, middle: 0xa8dcf7, horizon: 0xe8f7ff },
  light: { sky: 0xffffff, ground: 0x4a7a3a, fillIntensity: 1.2, sun: 0xffffff, sunIntensity: 1.5 },
  palette: {
    road: 0x6b6f76,
    verge: 0x6cbf52,
    terrain: 0x4f9a3d,
    infield: 0x3f7d32,
    wallA: 0xf4a261,
    wallB: 0xe76f51,
  },
  scenery: 'meadow',
};
