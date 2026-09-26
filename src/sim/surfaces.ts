import type { Surface } from './splineTrack';
import { tuning } from './tuning';

/**
 * What a surface does to a kart driving on it (MK-49). Every field is optional: a missing one
 * means "as on road". Values are read from `tuning` each call so the tuning panel edits them live.
 */
export interface SurfaceEffect {
  /** Top speed as a fraction of road top speed. A boost or a star ignores it (like grass). */
  speed?: number;
  /** Sideways grip (normal and drifting) × this. Lower = slides further. */
  grip?: number;
  /** While drifting, the yaw wobbles by up to this, rad/s, at `wobbleHz`. */
  wobble?: number;
  wobbleHz?: number;
  /** Carries grounded karts along the belt (`GroundInfo.flow`) at this speed, m/s. */
  conveyor?: number;
  /** Refreshes the boost while the kart is on it. */
  boostPad?: boolean;
}

/**
 * One entry per surface. To add a surface: add its name to `ZoneSurface` (`splineTrack.ts`), give
 * it an entry here, and a colour in `render/trackMesh.ts`; tracks then lay it with a surface zone.
 */
const SURFACES: Record<Surface, () => SurfaceEffect> = {
  road: () => ({}),
  out: () => ({}),
  offroad: () => ({ speed: tuning.offroadSpeed }),
  rough: () => ({ speed: tuning.roughSpeed }),
  boostPad: () => ({ boostPad: true }),
  ice: () => ({ grip: tuning.surfaces.iceGrip }),
  sand: () => ({
    speed: tuning.surfaces.sandSpeed,
    wobble: tuning.surfaces.sandWobble,
    wobbleHz: tuning.surfaces.sandWobbleHz,
  }),
  conveyor: () => ({ conveyor: tuning.surfaces.conveyorSpeed }),
};

/** The effect of driving on `surface`. */
export function surfaceEffect(surface: Surface): SurfaceEffect {
  return SURFACES[surface]();
}
