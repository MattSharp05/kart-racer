import type { TrackDef } from '../../../sim/track';
import type { TrackContent } from '..';

/** Flat 200 × 200 m pad with a wall on every side, for tuning handling (MK-5). Replaced by real tracks in MK-9. */
export const testPad: TrackDef = {
  id: 'test-pad',
  kind: 'arena',
  halfSize: 100,
  groundHeight: 0,
};

export default {
  id: testPad.id,
  name: 'Test Pad',
  order: 910,
  def: testPad,
  testOnly: true,
} satisfies TrackContent;
