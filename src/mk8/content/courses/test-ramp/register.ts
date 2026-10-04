// Registers `mk8-test-ramp` as a track (MK-99), so `step` and the game can drive it: the MK8
// driving scenarios (`src/mk8/scenarioCourses.ts`) and unit tests. A test fixture, never in menus.
// Also its Thwomp copy, `mk8-test-thwomp` (MK-124).
import { tracks } from '../../../../content/tracks';
import { testRampTrack } from './index';
import { testThwompTrack } from './thwomp';

export function registerTestRamp(): void {
  const def = testRampTrack();
  if (!tracks.has(def.id))
    tracks.register({ id: def.id, name: 'MK8 Test Ramp', order: 1000, def, testOnly: true });
  const thwomp = testThwompTrack();
  if (!tracks.has(thwomp.id))
    tracks.register({
      id: thwomp.id,
      name: 'MK8 Test Thwomp',
      order: 1001,
      def: thwomp,
      testOnly: true,
    });
}
