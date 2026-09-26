import * as THREE from 'three';
import { tracks } from '../content/tracks';
import { SUNNY_THEME, type TrackTheme } from '../content/tracks/theme';
import type { TrackGeometry } from '../sim/splineTrack';
import type { TrackDef } from '../sim/track';
import { skyGradient } from './scenery';

/** Night lamps: one post each side of the track every this many metres. */
const LAMP_SPACING = 24;
const LAMP_HEIGHT = 4;
const LAMP_COLOUR = 0xfff1b0;

/** The theme of `track` (its `TrackContent.theme`), or Sunny Circuit's. */
export function trackTheme(track: TrackDef): TrackTheme {
  return (tracks.has(track.id) ? tracks.get(track.id).theme : undefined) ?? SUNNY_THEME;
}

/**
 * Applies a track theme (MK-49) to the scene `createScene` built: sky, fog and the two lights.
 * The track mesh and scenery take the palette and scenery set when they are built.
 */
export function applyTheme(scene: THREE.Scene, theme: TrackTheme): void {
  scene.background = skyGradient(theme.sky);
  scene.fog = theme.fog ? new THREE.Fog(theme.fog.colour, theme.fog.near, theme.fog.far) : null;
  scene.traverse((object) => {
    if (object instanceof THREE.HemisphereLight) {
      object.color.set(theme.light.sky);
      object.groundColor.set(theme.light.ground);
      object.intensity = theme.light.fillIntensity;
    } else if (object instanceof THREE.DirectionalLight) {
      object.color.set(theme.light.sun);
      object.intensity = theme.light.sunIntensity;
    }
  });
}

/** Glowing lamp posts along both walls (night themes): two instanced draws, no real lights. */
export function createNightLamps(geometry: TrackGeometry): THREE.Group {
  const group = new THREE.Group();
  const every = Math.max(1, Math.round(LAMP_SPACING / (geometry.length / geometry.samples.length)));
  const count = Math.ceil(geometry.samples.length / every) * 2;
  const posts = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.12, 0.15, LAMP_HEIGHT, 5),
    new THREE.MeshLambertMaterial({ color: 0x2b2d42 }),
    count,
  );
  const heads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.45, 8, 6),
    new THREE.MeshBasicMaterial({ color: LAMP_COLOUR }),
    count,
  );
  const dummy = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i < geometry.samples.length; i += every) {
    const s = geometry.sample(i);
    const t = s.s / geometry.length;
    for (const side of [-1, 1] as const) {
      if (!geometry.hasWall(t, side === 1 ? 'right' : 'left')) continue;
      const lateral = side * (geometry.wallOffset(s.width) + 0.8);
      const x = s.x + s.nx * lateral;
      const z = s.z + s.nz * lateral;
      dummy.position.set(x, s.y + LAMP_HEIGHT / 2, z);
      dummy.updateMatrix();
      posts.setMatrixAt(n, dummy.matrix);
      dummy.position.set(x, s.y + LAMP_HEIGHT, z);
      dummy.updateMatrix();
      heads.setMatrixAt(n, dummy.matrix);
      n += 1;
    }
  }
  posts.count = n;
  heads.count = n;
  group.add(posts, heads);
  return group;
}
