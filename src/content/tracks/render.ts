import type * as THREE from 'three';
import type { TrackGeometry } from '../../sim/splineTrack';
import { Registry } from '../registry';
import duneCanyon from './dune-canyon/render';
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
}

export const trackViews = new Registry<TrackView>('track view');

// One line per track folder that has a `render.ts`, alphabetical.
for (const view of [duneCanyon]) trackViews.register(view);
