// Karts placed around Sunny Circuit's first item boxes, for MK8 item and loadout scenarios.
import { sunnyCircuit } from '../../../content/tracks/sunny-circuit/sim';
import type { KartSpawn } from '../../../sim/state';
import { trackGeometry } from '../../../sim/track';

export const sunny = trackGeometry(sunnyCircuit);
/** Sunny Circuit's first row of item boxes, on the main straight. */
const BOX_ROW = sunnyCircuit.itemBoxRows?.[0]?.t ?? 0.08;
/** The track position `metres` from the box row. */
export const fromBoxes = (metres: number) => BOX_ROW + metres / sunny.length;

/** A kart `metres` from the box row, `lateral` m off the centreline, facing down the straight. */
export function spawn(metres: number, lateral: number, speed = 0): KartSpawn {
  const t = fromBoxes(metres);
  return { position: sunny.pointAt(t, lateral), heading: sunny.headingAt(t), speed };
}
