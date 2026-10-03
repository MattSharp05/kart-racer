// MK8 Mode's kart parts (MK-102): 6 bodies, 4 tires and 3 gliders, with their pack models and how
// a kart is put together from them. Stats are in `../stats.ts`. Pure data.
import type { Loadout } from '../../../sim/types';
import { isKnownLoadout } from '../stats';

export type PartKind = 'body' | 'tires' | 'glider';

export interface Mk8Part {
  /** Part id (the stat table's key and the pipeline's model id, `tools/mk8/sources.json`). */
  id: string;
  name: string;
  kind: PartKind;
}

/**
 * Where a body's wheels go (MK-102): each a share of the fitted body's half-width (`track`) and
 * half-length (`axle`, + is the front) from its centre. Tuned by eye per body; the real models
 * differ in shape, so these are the numbers to adjust against a local pack.
 */
export interface WheelAnchors {
  frontAxle: number;
  rearAxle: number;
  frontTrack: number;
  rearTrack: number;
}

export interface Mk8Body extends Mk8Part {
  kind: 'body';
  /** The body is scaled to this length, metres (the sim's kart is about 1.7 m long). */
  length: number;
  wheels: WheelAnchors;
}

export interface Mk8Tires extends Mk8Part {
  kind: 'tires';
  /** Each tire is scaled to this diameter, metres. */
  diameter: number;
}

export interface Mk8Glider extends Mk8Part {
  kind: 'glider';
  /** The open glider is scaled to this width, metres. */
  span: number;
}

/** The Standard Kart's anchors (MK-101's numbers, so its karts look as they did). */
const STANDARD_WHEELS: WheelAnchors = {
  frontAxle: 0.68,
  rearAxle: 0.68,
  frontTrack: 0.92,
  rearTrack: 0.92,
};

export const MK8_BODIES: readonly Mk8Body[] = [
  {
    id: 'standard-kart',
    name: 'Standard Kart',
    kind: 'body',
    length: 1.7,
    wheels: STANDARD_WHEELS,
  },
  {
    id: 'pipe-frame',
    name: 'Pipe Frame',
    kind: 'body',
    length: 1.6,
    // An open frame: wheels out at the corners.
    wheels: { frontAxle: 0.78, rearAxle: 0.74, frontTrack: 1, rearTrack: 1 },
  },
  {
    id: 'mach-8',
    name: 'Mach 8',
    kind: 'body',
    length: 1.85,
    // Long nose: the front axle sits back from it.
    wheels: { frontAxle: 0.6, rearAxle: 0.72, frontTrack: 0.86, rearTrack: 0.94 },
  },
  { id: 'cat-cruiser', name: 'Cat Cruiser', kind: 'body', length: 1.7, wheels: STANDARD_WHEELS },
  {
    id: 'b-dasher',
    name: 'B Dasher',
    kind: 'body',
    length: 1.9,
    wheels: { frontAxle: 0.62, rearAxle: 0.7, frontTrack: 0.88, rearTrack: 0.94 },
  },
  {
    id: 'sports-coupe',
    name: 'Sports Coupe',
    kind: 'body',
    length: 1.85,
    wheels: { frontAxle: 0.66, rearAxle: 0.7, frontTrack: 0.9, rearTrack: 0.92 },
  },
];

export const MK8_TIRES: readonly Mk8Tires[] = [
  { id: 'standard-tires', name: 'Standard', kind: 'tires', diameter: 0.42 },
  { id: 'monster-tires', name: 'Monster', kind: 'tires', diameter: 0.6 },
  { id: 'slim-tires', name: 'Slim', kind: 'tires', diameter: 0.44 },
  { id: 'slick-tires', name: 'Slick', kind: 'tires', diameter: 0.4 },
];

export const MK8_GLIDERS: readonly Mk8Glider[] = [
  { id: 'paper-glider', name: 'Paper Glider', kind: 'glider', span: 2.2 },
  { id: 'cloud-glider', name: 'Cloud Glider', kind: 'glider', span: 2 },
  { id: 'peach-parasol', name: 'Peach Parasol', kind: 'glider', span: 1.8 },
];

function find<T extends Mk8Part>(list: readonly T[], id: string): T {
  const part = list.find((p) => p.id === id);
  if (!part) throw new Error(`Unknown MK8 part: ${id}`);
  return part;
}

export const mk8Body = (id: string) => find(MK8_BODIES, id);
export const mk8Tires = (id: string) => find(MK8_TIRES, id);
export const mk8Glider = (id: string) => find(MK8_GLIDERS, id);

/** MK8's default kart: Standard Kart, Standard tires, and (in place of the Super Glider) Paper. */
export const STANDARD_PARTS = {
  body: 'standard-kart',
  tires: 'standard-tires',
  glider: 'paper-glider',
} as const;

/** Racers whose default kart differs from the standard one (a nod to their own style). */
const DEFAULT_PARTS: Readonly<Record<string, Partial<Omit<Loadout, 'racer'>>>> = {
  'mk8-peach': { glider: 'peach-parasol' },
  'mk8-daisy': { glider: 'peach-parasol' },
};

/** Racer `racer` in their default kart. */
export function defaultLoadout(racer: string): Loadout {
  return { racer, ...STANDARD_PARTS, ...DEFAULT_PARTS[racer] };
}

/** Racer `racer` in the standard kart (balance checks compare racers in it). */
export function standardLoadout(racer: string): Loadout {
  return { racer, ...STANDARD_PARTS };
}

/**
 * A saved loadout made safe to race with: `racer` in the saved parts, each unknown part (an old
 * save, a renamed part) replaced by the racer's default.
 */
export function resolveLoadout(racer: string, saved?: Partial<Loadout>): Loadout {
  const fallback = defaultLoadout(racer);
  const pick = <K extends 'body' | 'tires' | 'glider'>(key: K): string => {
    const value = saved?.[key];
    if (typeof value !== 'string') return fallback[key];
    return isKnownLoadout({ ...fallback, [key]: value }) ? value : fallback[key];
  };
  return { racer, body: pick('body'), tires: pick('tires'), glider: pick('glider') };
}
