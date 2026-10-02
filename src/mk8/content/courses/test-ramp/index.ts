// `mk8-test-ramp` (MK-98): the synthetic mesh track (see `layout.ts`). Built on first use and cached;
// tests and later tickets (surface-frame physics, the pack loader's fixtures) use it.
import type { MeshTrackDef } from '../../../../sim/meshTrack';
import { buildTestRampCollision } from './collision';
import { TEST_RAMP_ID } from './layout';
import { testRampRoute } from './route';

export { LAYOUT as TEST_RAMP_LAYOUT, TEST_RAMP_ID } from './layout';

let cached: MeshTrackDef | undefined;

export function testRampTrack(): MeshTrackDef {
  cached ??= {
    id: TEST_RAMP_ID,
    kind: 'mesh',
    collision: buildTestRampCollision(),
    route: testRampRoute,
  };
  return cached;
}
