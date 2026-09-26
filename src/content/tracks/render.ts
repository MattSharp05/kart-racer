import type * as THREE from 'three';
import type { TrackGeometry } from '../../sim/splineTrack';
import { Registry } from '../registry';
import duneCanyon from './dune-canyon/render';
import frostpeakPass from './frostpeak-pass/render';
import neonHarbour from './neon-harbour/render';
import type { TrackTheme } from './theme';

/**
 * A track's own look beyond its theme (MK-58): `src/content/tracks/<id>/render.ts` default-exports
 * one of these. Optional: tracks without one get the theme's scenery set (`render/scenery.ts`).
 */
export interface TrackView {
  /** The track id (and folder name). */
  id: string;
  /** Scenery drawn around the track, replacing the theme's scenery set. Instance it: few draws. */
  scenery?(geometry: TrackGeometry, theme: TrackTheme): THREE.Object3D;
  /**
   * Called every frame with the `scenery()` object, the tick (fractional, between ticks) and the
   * camera position, for scenery that moves (MK-59: falling snow). Drive motion from `ticks`, not
   * wall time, so screenshots stay stable.
   */
  update?(scenery: THREE.Object3D, ticks: number, camera: THREE.Vector3): void;
}

export const trackViews = new Registry<TrackView>('track view');

// One line per track folder that has a `render.ts`, alphabetical.
for (const view of [duneCanyon, frostpeakPass, neonHarbour]) trackViews.register(view);
