/**
 * Split-screen layouts (MK-145): one view per local player on one canvas. Rects are fractions of
 * the canvas with a top-left origin (as CSS lays out the HUD); `World` flips them for WebGL.
 */

/** Two players: one above the other (default) or side by side. */
export type SplitLayout = 'stacked' | 'side';

export const SPLIT_LAYOUTS: readonly SplitLayout[] = ['stacked', 'side'];

export function isSplitLayout(value: unknown): value is SplitLayout {
  return SPLIT_LAYOUTS.includes(value as SplitLayout);
}

/** A part of the canvas, as fractions 0–1 from its top-left corner. */
export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SplitViews {
  /** One rect per player, P1 first. */
  views: ViewRect[];
  /** The quadrant no player uses (3 players): the race overview is drawn there. */
  overview?: ViewRect;
}

const FULL: ViewRect = { x: 0, y: 0, w: 1, h: 1 };
const QUADRANTS: readonly ViewRect[] = [
  { x: 0, y: 0, w: 0.5, h: 0.5 },
  { x: 0.5, y: 0, w: 0.5, h: 0.5 },
  { x: 0, y: 0.5, w: 0.5, h: 0.5 },
  { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
];

/**
 * The views for `players` people: 1 → the whole canvas; 2 → halves (`layout`); 3 → three
 * quadrants plus the overview in the fourth (bottom right); 4 → quadrants. P1 is top (left).
 */
export function splitViews(players: number, layout: SplitLayout = 'stacked'): SplitViews {
  if (players <= 1) return { views: [FULL] };
  if (players === 2) {
    return layout === 'side'
      ? {
          views: [
            { x: 0, y: 0, w: 0.5, h: 1 },
            { x: 0.5, y: 0, w: 0.5, h: 1 },
          ],
        }
      : {
          views: [
            { x: 0, y: 0, w: 1, h: 0.5 },
            { x: 0, y: 0.5, w: 1, h: 0.5 },
          ],
        };
  }
  const views = QUADRANTS.slice(0, Math.min(players, QUADRANTS.length));
  return players === 3 ? { views, overview: QUADRANTS[3] } : { views };
}

/**
 * A rect in whole device pixels for WebGL's viewport/scissor (origin bottom left) on a canvas of
 * `width` × `height`. Neighbouring views share their edges exactly (no gaps, no overlap).
 */
export function pixelRect(
  rect: ViewRect,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } {
  const left = Math.round(rect.x * width);
  const right = Math.round((rect.x + rect.w) * width);
  const top = Math.round(rect.y * height);
  const bottom = Math.round((rect.y + rect.h) * height);
  return { x: left, y: height - bottom, w: right - left, h: bottom - top };
}

/**
 * Quality step-down with 3–4 views (MK-145): every view draws the whole scene, so a frame costs
 * about one scene draw per view. From this many views on, low-quality mode is on (a quarter of the
 * particles) and the pixel ratio is capped at 1, so on a 2× laptop screen the four quarter views
 * fill a quarter of the pixels one full-screen view would. (A nearer far plane was measured and
 * saved nothing: the scenery is a few big merged meshes, MK-145 Test report.)
 */
export const STEP_DOWN_FROM_VIEWS = 3;
/** Highest pixel ratio while stepped down. */
export const STEPPED_DOWN_PIXEL_RATIO = 1;

/**
 * Wider than this, a split view (2 players top and bottom: ~3.6:1) narrows its vertical field of
 * view so its horizontal one stays what this aspect would show, instead of a fish-eye sweep.
 */
export const MAX_VIEW_ASPECT = 2.2;

/** The vertical FOV (degrees) to draw a split view of `aspect` with, for a camera's `fov`. */
export function viewFov(fov: number, aspect: number): number {
  if (aspect <= MAX_VIEW_ASPECT) return fov;
  const half = (fov * Math.PI) / 360;
  return (Math.atan((Math.tan(half) * MAX_VIEW_ASPECT) / aspect) * 360) / Math.PI;
}
