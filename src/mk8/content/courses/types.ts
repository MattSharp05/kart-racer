// An MK8 course's content (MK-105): what we author for it. Its model and collision are the pack's.
import type { HazardDef } from '../../../sim/hazards/types';
import type { RouteDef } from '../../../sim/route';
import type { RouteSurfaceOptions } from '../../../sim/routeSurfaces';

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
}
