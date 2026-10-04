// `mk8-test-thwomp` (MK-124): the test ramp with one Thwomp over straight E, 20 m before the start
// line, for Thwomp scenarios and e2e without the pack (`mk8-test-thwomp`). A test fixture.
import type { PeriodicHazard } from '../../../../sim/hazards/types';
import type { MeshTrackDef } from '../../../../sim/meshTrack';
import { testRampTrack } from './index';

export const TEST_THWOMP_ID = 'mk8-test-thwomp';

/** Over the middle of straight E (x = −20). Open from tick 0; it starts down 1.8 s in. */
export const TEST_THWOMP: PeriodicHazard = {
  kind: 'periodic',
  centre: { x: -20, y: 0, z: 0 },
  halfWidth: 2.6,
  halfLength: 2.6,
  heading: Math.PI / 2,
  period: 3.6,
  closedFraction: 0.3,
  thwomp: { lift: 5 },
};

let cached: MeshTrackDef | undefined;

export function testThwompTrack(): MeshTrackDef {
  cached ??= { ...testRampTrack(), id: TEST_THWOMP_ID, hazards: [TEST_THWOMP] };
  return cached;
}
