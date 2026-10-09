// An MK8 course's content (MK-105): what we author for it. Its model and collision are the pack's.
import type { HazardDef } from '../../../sim/hazards/types';
import type { CollisionBox, MeshMaterialSurface } from '../../../sim/meshCollision';
import type { RouteDef } from '../../../sim/route';
import type { RouteSurfaceOptions } from '../../../sim/routeSurfaces';
import type { SoundId } from '../../audio/soundIds';

export interface Mk8CourseContent {
  /** The pipeline's id: the folder under `models/courses/` and `src/mk8/content/courses/`. */
  packId: string;
  /** The track it registers as (`Mk8Course.trackId` in `cups.ts`). */
  trackId: string;
  name: string;
  route: RouteDef;
  /** Materials of the course model left out of the drawing (layers the pipeline can't draw). */
  hiddenMaterials?: readonly string[];
  /** How the route corrects the pack's guessed surfaces beyond the defaults (MK-122). */
  surfaceRules?: RouteSurfaceOptions;
  /** The course's hazards (MK-124: Thwomp Ruins' Thwomps), as on our own tracks (`sim/hazards`). */
  hazards?: HazardDef[];
  /**
   * Boxes (the pack's units) whose collision triangles are taken out when the course loads
   * (MK-128): scenery that `hazards` stand in for, so karts aren't stopped by what isn't drawn.
   */
  collisionHoles?: readonly CollisionBox[];
  /**
   * Build the collision from the full course model with this material map (its `materials.ts`)
   * instead of reading the pack's `collision.bin` (MK-123 round 2, `modelCollision.ts`): for a
   * course whose deployed `collision.bin` was built from older material guesses.
   */
  collisionFromModel?: Readonly<Record<string, MeshMaterialSurface>>;
  /** Its light, sky, post-processing, water and ambience (MK-125); the plain look when absent. */
  look?: CourseLook;
}

/**
 * A course's look and ambience (MK-125, `src/mk8/content/courses/<id>/look.ts`; drawn by
 * `src/mk8/render/look.ts`). Colours are 0xRRGGBB, distances metres.
 */
export interface CourseLook {
  /** The sun: where it shines from (towards the sun, any length), colour and strength. */
  sun: { direction: readonly [number, number, number]; colour: number; intensity: number };
  /** Sky/ground fill light. */
  fill: { sky: number; ground: number; intensity: number };
  /** Distance fog; none when absent. */
  fog?: { colour: number; near: number; far: number };
  /**
   * The sky: a gradient behind everything (top of the screen to the horizon), or the course
   * model's own sky dome (`materials`, never fogged) over a plain `colour`.
   */
  sky:
    | { top: number; middle: number; horizon: number }
    | { materials: readonly string[]; colour: number };
  /** Full quality: ACES tone mapping's exposure. */
  exposure: number;
  /** Full quality: bloom on what's brighter than `threshold` (0–1, after lighting). */
  bloom: { strength: number; radius: number; threshold: number };
  /** Full quality: how strongly the screen edges blur while the followed kart boosts (0–1). */
  boostBlur: number;
  /** Materials that light themselves (lamps, screens): their texture glows this much. */
  glow?: { materials: readonly string[]; intensity: number };
  /** Water surfaces (by material): an animated, rippling material, see-through like MK8's. */
  water?: {
    materials: readonly string[];
    colour: number;
    opacity: number;
    /** How far the ripples drift, m/s (two layers drift at right angles). */
    flow: number;
    /** Ripple size, m. */
    scale: number;
    /** How much it mirrors the sky (`sky`, 0xRRGGBB) at a glancing angle, 0–1. */
    reflection: number;
    sky: number;
  };
  /** Ambient loops (crowd, fountains): everywhere, or around `at` out to `radius`. */
  ambience: readonly CourseSound[];
}

export interface CourseSound {
  sound: SoundId;
  volume: number;
  at?: readonly [number, number, number];
  radius?: number;
}
