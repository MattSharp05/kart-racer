import * as THREE from 'three';
import { Registry } from '../../content/registry';
import { hazardPose, trackHazards } from '../../sim/hazards';
import type { HazardDef } from '../../sim/hazards/types';
import type { Vec3 } from '../../sim/math';
import type { TrackDef } from '../../sim/track';
import { trackTheme } from '../theme';
import { swayView } from './sway';
import { moverView, periodicView, rotatorView, zoneEffectView, type HazardView } from './views';

/** How each hazard kind is drawn, by kind (a new kind registers its view here). */
export const hazardViews = new Registry<HazardView>('hazard view');
for (const view of [moverView, periodicView, rotatorView, swayView, zoneEffectView]) {
  hazardViews.register(view as HazardView);
}

/**
 * Whether one of `hazards` draws its own surface over the road at `point` (MK-61: a rope bridge's
 * swaying deck), so the track mesh and scenery leave the road out there.
 */
export function hazardHidesRoad(hazards: readonly HazardDef[], point: Vec3): boolean {
  return hazards.some((def) => hazardViews.get(def.kind).hidesRoad?.(def, point) ?? false);
}

/** Fog near distance while a visibility hazard thins the view, as a fraction of its far. */
const HAZE_NEAR = 0.2;

/**
 * Draws a track's hazards (MK-49). Poses come from the sim's pure pose functions at a fractional
 * tick, so hazards move smoothly between ticks with no state of their own.
 */
export class HazardRenderer {
  private readonly items: { def: HazardDef; view: HazardView; object: THREE.Object3D }[];
  private readonly baseFog: THREE.Fog | null;
  /** The fog inside a visibility hazard (one object, adjusted in place). */
  private readonly haze: THREE.Fog;

  constructor(
    private readonly scene: THREE.Scene,
    track: TrackDef,
  ) {
    const theme = trackTheme(track);
    this.baseFog = scene.fog instanceof THREE.Fog ? scene.fog : null;
    this.haze = new THREE.Fog(theme.fog?.colour ?? theme.sky.horizon);
    this.items = trackHazards(track).map((def) => {
      const view = hazardViews.get(def.kind);
      const object = view.create(def, theme.night ?? false);
      scene.add(object);
      return { def, view, object };
    });
  }

  /** Poses every hazard at `ticks` (fractional between ticks); `camera` for visibility effects. */
  sync(ticks: number, camera: THREE.Vector3): void {
    if (!this.items.length) return;
    let visibility = Infinity;
    for (const { def, view, object } of this.items) {
      const fog = view.update(object, def, hazardPose(def, ticks), camera, ticks);
      if (fog !== undefined) visibility = Math.min(visibility, fog);
    }
    if (visibility < Infinity) {
      this.haze.near = visibility * HAZE_NEAR;
      this.haze.far = visibility;
      this.scene.fog = this.haze;
    } else {
      this.scene.fog = this.baseFog;
    }
  }
}
