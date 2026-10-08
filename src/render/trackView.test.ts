import { describe, expect, it } from 'vitest';
import { collisionFromTriangles, type MeshTrackDef } from '../sim/meshTrack';
import { getTrack } from '../sim/track';
import { CAMERA_FAR, CAMERA_NEAR } from './scene';
import { chaseCameraRange } from './trackView';

/** A mesh track whose collision is one flat square `size` m across. */
function squareTrack(size: number): MeshTrackDef {
  const h = size / 2;
  const positions = new Float32Array([-h, 0, -h, -h, 0, h, h, 0, -h, h, 0, -h, -h, 0, h, h, 0, h]);
  return {
    id: 'square',
    kind: 'mesh',
    collision: collisionFromTriangles(positions, new Uint8Array(2), 50),
    // The camera range reads only the collision's bounds.
    route: {} as MeshTrackDef['route'],
  };
}

describe('chase camera range (MK-105 revisit: MK8 courses at 3×)', () => {
  it("keeps the scene's planes on our tracks and on small mesh tracks", () => {
    expect(chaseCameraRange(getTrack('sunny-circuit'))).toEqual({
      near: CAMERA_NEAR,
      far: CAMERA_FAR,
    });
    expect(chaseCameraRange(squareTrack(200))).toEqual({ near: CAMERA_NEAR, far: CAMERA_FAR });
  });

  it('sees all of a big course, its near plane moved out with the far one', () => {
    const { near, far } = chaseCameraRange(squareTrack(2000));
    expect(far).toBeGreaterThanOrEqual(2000 * Math.SQRT2);
    expect(near).toBeCloseTo(far / 20000, 6);
    expect(near).toBeGreaterThan(CAMERA_NEAR);
  });
});
