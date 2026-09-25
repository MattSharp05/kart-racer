import type { TrackDef } from '../../sim/track';
import { Registry } from '../registry';
import sunnyCircuit from './sunny-circuit/sim';
import testOval from './test-oval/sim';
import testPad from './test-pad/sim';

/** A track (ADR 0007): `src/content/tracks/<id>/sim.ts` default-exports one of these. */
export interface TrackContent {
  /** Same as `def.id`, and the folder name. */
  id: string;
  name: string;
  order: number;
  def: TrackDef;
  /** Test fixtures (handling pad, oval): not offered in menus. */
  testOnly?: boolean;
}

/** Every track. `sim/track.ts` → `getTrack()` looks tracks up here. */
export const tracks = new Registry<TrackContent>('track');

// One line per track folder, alphabetical (a unit test checks none is missing).
for (const track of [sunnyCircuit, testOval, testPad]) {
  if (track.id !== track.def.id) throw new Error(`Track ${track.id}: def.id is ${track.def.id}`);
  tracks.register(track);
}
