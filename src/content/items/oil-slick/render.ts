import * as THREE from 'three';
import { hz } from '../../../audio/synth';
import { ItemEntityRenderer } from '../../../render/entities';
import type { ItemView } from '../views';
import { SLICK_RADIUS } from './sim';

/** The entity renderer lifts models 0.4 m; the puddle sits just above the road. */
const GROUND_OFFSET = -0.37;

/** A dark puddle with a rainbow sheen ring and a few droplets (flat on the road). */
function puddle(): THREE.Object3D {
  const group = new THREE.Group();
  const flat = (geometry: THREE.BufferGeometry, color: string, opacity: number, y: number) => {
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = GROUND_OFFSET + y;
    group.add(mesh);
    return mesh;
  };
  flat(new THREE.CircleGeometry(SLICK_RADIUS, 24), '#14121c', 0.92, 0);
  flat(new THREE.RingGeometry(SLICK_RADIUS * 0.45, SLICK_RADIUS * 0.6, 24), '#5e3c99', 0.55, 0.005);
  flat(new THREE.RingGeometry(SLICK_RADIUS * 0.6, SLICK_RADIUS * 0.72, 24), '#2a9d8f', 0.45, 0.005);
  for (const [x, z, r] of [
    [1.7, 0.4, 0.25],
    [-1.2, -1.3, 0.2],
    [-0.6, 1.8, 0.18],
  ] as const) {
    flat(new THREE.CircleGeometry(r, 10), '#14121c', 0.92, 0).position.set(x, GROUND_OFFSET, z);
  }
  return group;
}

/** How the Oil Slick (MK-65) looks and sounds; see `./sim.ts`. */
export default {
  id: 'oil-slick',
  icon: '<ellipse cx="32" cy="44" rx="26" ry="12" fill="#14121c"/><ellipse cx="30" cy="43" rx="15" ry="6" fill="none" stroke="#5e3c99" stroke-width="3"/><ellipse cx="30" cy="43" rx="10" ry="3.5" fill="none" stroke="#2a9d8f" stroke-width="2"/><path d="M32 6c-8 12-12 18-12 24a12 12 0 0 0 24 0c0-6-4-12-12-24z" fill="#1d1a2b" stroke="#8d86b5" stroke-width="2"/><ellipse cx="27" cy="27" rx="3" ry="5" fill="#8d86b5"/>',
  useSound: 'oil-slick.use',
  renderer: ItemEntityRenderer,
  sounds: {
    // A wet glug as the puddle drops.
    use: (synth, v) => {
      synth.tone(hz(48), 0.12, { type: 'sine', slideTo: hz(40), volume: 0.3 * v });
      synth.whoosh(0.2, { volume: 0.2 * v, from: 500, to: 200, q: 1.5, at: 0.05 });
    },
    // A kart hits the oil: a squelchy skid.
    slip: (synth, v) => {
      synth.whoosh(0.45, { volume: 0.3 * v, from: 1800, to: 500, q: 3 });
      synth.tone(hz(60), 0.3, { type: 'triangle', slideTo: hz(55), volume: 0.12 * v });
    },
  },
  entityModel: () => puddle(),
} satisfies ItemView;
