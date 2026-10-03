// Registers `mk8-test-ramp` as a track (MK-99), so `step` and the game can drive it: the MK8
// driving scenarios (`src/mk8/scenarioCourses.ts`) and unit tests. A test fixture, never in menus.
import { tracks } from '../../../../content/tracks';
import { testRampTrack } from './index';

export function registerTestRamp(): void {
  const def = testRampTrack();
  if (tracks.has(def.id)) return;
  tracks.register({ id: def.id, name: 'MK8 Test Ramp', order: 1000, def, testOnly: true });
}
