import type { TrackDef } from '../../sim/track';
import { Registry } from '../registry';
import canopyRush from './canopy-rush/sim';
import cogWorks from './cog-works/sim';
import duneCanyon from './dune-canyon/sim';
import frostpeakPass from './frostpeak-pass/sim';
import hazardTest from './hazard-test/sim';
import neonHarbour from './neon-harbour/sim';
import sunnyCircuit from './sunny-circuit/sim';
import testOval from './test-oval/sim';
import testPad from './test-pad/sim';
import type { TrackTheme } from './theme';

/** A track (ADR 0007): `src/content/tracks/<id>/sim.ts` default-exports one of these. */
export interface TrackContent {
  /** Same as `def.id`, and the folder name. */
  id: string;
  name: string;
  order: number;
  def: TrackDef;
  /** Test fixtures (handling pad, oval): not offered in menus. */
  testOnly?: boolean;
  /** Sky, light, palette and scenery (MK-49); Sunny Circuit's look when absent. */
  theme?: TrackTheme;
}

/** Every track. `sim/track.ts` → `getTrack()` looks tracks up here. */
export const tracks = new Registry<TrackContent>('track');

// One line per track folder, alphabetical (a unit test checks none is missing).
for (const track of [
  canopyRush,
  cogWorks,
  duneCanyon,
  frostpeakPass,
  hazardTest,
  neonHarbour,
  sunnyCircuit,
  testOval,
  testPad,
]) {
  if (track.id !== track.def.id) throw new Error(`Track ${track.id}: def.id is ${track.def.id}`);
  tracks.register(track);
}
