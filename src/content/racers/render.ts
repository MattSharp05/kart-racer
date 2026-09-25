import type * as THREE from 'three';
import type { KartColours, KartShape } from '../../render/kartModels';
import { Registry } from '../registry';
import boulder from './boulder/render';
import maple from './maple/render';
import pixie from './pixie/render';
import swoop from './swoop/render';

/** What a racer's details builder gets: the kart body to add meshes to, and its paint. */
export interface KartDetailsContext {
  body: THREE.Group;
  shape: KartShape;
  palette: KartColours;
  /** A flat-shaded material in `color` (the look every kart uses). */
  lambert(color: number): THREE.Material;
}

/**
 * How a racer looks (ADR 0007): `src/content/racers/<id>/render.ts` default-exports one of these.
 * `render/kartModels.ts` builds the shared chassis, driver, wheels, sparks and flame from `shape`,
 * then calls `details` for the racer's own silhouette.
 */
export interface RacerView {
  id: string;
  colours: KartColours;
  /** Extra body paints for when the same racer appears more than once in a race. */
  alternateBodies: number[];
  shape: KartShape;
  details(ctx: KartDetailsContext): void;
}

export const racerViews = new Registry<RacerView>('racer view');

// One line per racer folder, alphabetical (a unit test checks none is missing).
for (const view of [boulder, maple, pixie, swoop]) racerViews.register(view);
