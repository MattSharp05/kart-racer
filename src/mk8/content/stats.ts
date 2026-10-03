// MK8's stat table (MK-102): Mario Kart 8 (Wii U) points for MK8 Mode's 12 racers and 13 kart
// parts. Pure data (the sim reads it through `sim/kartStats.ts`, so it follows the sim rules).
//
// Source: Super Mario Wiki, "Mario Kart 8 in-game statistics"
// (https://www.mariowiki.com/Mario_Kart_8_in-game_statistics), a transcription of the game's own
// data (version 4.1). Each racer and part has points per stat; a loadout's level in a stat is the
// sum of its four pieces' points (0–20), and the menu bar shows (level + 3) / 4: MK8's 0.75–5.75
// scale. Columns used: SL (ground speed), AC, WG, TL (ground handling), OF (traction), MT.
import type { Loadout } from '../../sim/types';

export const MK8_STATS = [
  'speed',
  'acceleration',
  'weight',
  'handling',
  'traction',
  'miniTurbo',
] as const;
export type Mk8Stat = (typeof MK8_STATS)[number];

/** A racer's or part's points per stat. */
export type StatPoints = Readonly<Record<Mk8Stat, number>>;
/** A loadout's stats on MK8's 0.75–5.75 scale. */
export type Mk8Stats = Readonly<Record<Mk8Stat, number>>;

/** Highest level a stat sums to (MK8 caps it). */
const MAX_LEVEL = 20;
/** Shown stat = (level + LEVEL_OFFSET) / LEVEL_DIVISOR. */
const LEVEL_OFFSET = 3;
const LEVEL_DIVISOR = 4;

function points(
  speed: number,
  acceleration: number,
  weight: number,
  handling: number,
  traction: number,
  miniTurbo: number,
): StatPoints {
  return { speed, acceleration, weight, handling, traction, miniTurbo };
}

// Racers come in stat groups: everyone in a group has the same points.
const LIGHT = points(2, 4, 2, 8, 4, 4); // Toad, Koopa Troopa, Shy Guy
const MEDIUM = points(4, 3, 4, 6, 3, 3); // Peach, Daisy, Yoshi
const MEDIUM_HEAVY = points(6, 2, 6, 4, 2, 2); // Mario, Luigi
const HEAVY = points(8, 1, 8, 2, 1, 1); // Donkey Kong, Waluigi
const CRUISER = points(10, 0, 10, 0, 0, 0); // Bowser, Wario

/** Racer id → points. */
export const RACER_POINTS: Readonly<Record<string, StatPoints>> = {
  'mk8-mario': MEDIUM_HEAVY,
  'mk8-luigi': MEDIUM_HEAVY,
  'mk8-peach': MEDIUM,
  'mk8-daisy': MEDIUM,
  'mk8-yoshi': MEDIUM,
  'mk8-toad': LIGHT,
  'mk8-koopa-troopa': LIGHT,
  'mk8-shy-guy': LIGHT,
  'mk8-donkey-kong': HEAVY,
  'mk8-waluigi': HEAVY,
  'mk8-bowser': CRUISER,
  'mk8-wario': CRUISER,
};

/** Body id → points. */
export const BODY_POINTS: Readonly<Record<string, StatPoints>> = {
  'standard-kart': points(3, 2, 2, 2, 5, 3),
  'pipe-frame': points(3, 3, 1, 4, 3, 4),
  'mach-8': points(5, 1, 3, 2, 1, 1),
  'cat-cruiser': points(3, 2, 2, 2, 5, 3),
  'b-dasher': points(5, 1, 3, 2, 1, 1),
  'sports-coupe': points(5, 1, 3, 2, 1, 1),
};

/** Tires id → points. */
export const TIRE_POINTS: Readonly<Record<string, StatPoints>> = {
  'standard-tires': points(2, 2, 2, 3, 4, 2),
  'monster-tires': points(2, 0, 4, 0, 7, 0),
  'slim-tires': points(3, 1, 2, 4, 2, 1),
  'slick-tires': points(4, 1, 3, 3, 0, 1),
};

/** Glider id → points. */
export const GLIDER_POINTS: Readonly<Record<string, StatPoints>> = {
  'paper-glider': points(1, 1, 2, 1, 1, 1),
  'cloud-glider': points(1, 2, 1, 1, 1, 2),
  'peach-parasol': points(1, 2, 1, 1, 1, 2),
};

function lookup(table: Readonly<Record<string, StatPoints>>, id: string, what: string) {
  const found = Object.hasOwn(table, id) ? table[id] : undefined;
  if (!found) throw new Error(`Unknown MK8 ${what}: ${id}`);
  return found;
}

/** Whether every piece of `loadout` is in the table. */
export function isKnownLoadout(loadout: Loadout): boolean {
  return (
    Object.hasOwn(RACER_POINTS, loadout.racer) &&
    Object.hasOwn(BODY_POINTS, loadout.body) &&
    Object.hasOwn(TIRE_POINTS, loadout.tires) &&
    Object.hasOwn(GLIDER_POINTS, loadout.glider)
  );
}

/** A loadout's stats on MK8's 0.75–5.75 scale; throws for an unknown racer or part. */
export function loadoutStats(loadout: Loadout): Mk8Stats {
  const pieces = [
    lookup(RACER_POINTS, loadout.racer, 'racer'),
    lookup(BODY_POINTS, loadout.body, 'body'),
    lookup(TIRE_POINTS, loadout.tires, 'tires'),
    lookup(GLIDER_POINTS, loadout.glider, 'glider'),
  ];
  const shown = (stat: Mk8Stat) => {
    const level = pieces.reduce((sum, piece) => sum + piece[stat], 0);
    return (Math.min(Math.max(level, 0), MAX_LEVEL) + LEVEL_OFFSET) / LEVEL_DIVISOR;
  };
  return {
    speed: shown('speed'),
    acceleration: shown('acceleration'),
    weight: shown('weight'),
    handling: shown('handling'),
    traction: shown('traction'),
    miniTurbo: shown('miniTurbo'),
  };
}
