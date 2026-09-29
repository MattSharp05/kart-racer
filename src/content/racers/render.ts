import type * as THREE from 'three';
import type { KartColours, KartShape } from '../../render/kartModels';
import { Registry } from '../registry';
import blaze from './blaze/render';
import boulder from './boulder/render';
import coral from './coral/render';
import juniper from './juniper/render';
import maple from './maple/render';
import nova from './nova/render';
import pixie from './pixie/render';
import sprocket from './sprocket/render';
import swoop from './swoop/render';
import tundra from './tundra/render';

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
racerViews.register(blaze);
racerViews.register(boulder);
racerViews.register(coral);
racerViews.register(juniper);
racerViews.register(maple);
racerViews.register(nova);
racerViews.register(pixie);
racerViews.register(sprocket);
racerViews.register(swoop);
racerViews.register(tundra);
