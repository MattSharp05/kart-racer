import * as THREE from 'three';
import { hz } from '../../../audio/synth';
import { ItemEntityRenderer } from '../../../render/entities';
import type { ItemView } from '../views';

/** Hornets fly this high above the road (the entity renderer already lifts models 0.4 m). */
const FLY_HEIGHT = 0.5;

/**
 * A small striped hornet facing −Z (the renderer turns it to its travel direction): a yellow body
 * with black bands, a dark head and stinger, see-through wings, and a buzzing trail of fading
 * puffs behind it.
 */
function hornet(): THREE.Object3D {
  const group = new THREE.Group();
  group.position.y = FLY_HEIGHT;
  const solid = (geometry: THREE.BufferGeometry, color: string) =>
    new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color, roughness: 0.5, flatShading: true }),
    );
  const soft = (geometry: THREE.BufferGeometry, color: string, opacity: number) =>
    new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
    );
  const body = solid(new THREE.SphereGeometry(0.34, 12, 8), '#ffc300');
  body.scale.set(1, 0.95, 1.5);
  group.add(body);
  for (const z of [-0.12, 0.14]) {
    const band = solid(new THREE.CylinderGeometry(0.33, 0.33, 0.1, 12), '#1b1b1b');
    band.rotation.x = Math.PI / 2;
    band.position.z = z;
    band.scale.set(1, 1, 0.95);
    group.add(band);
  }
  const head = solid(new THREE.SphereGeometry(0.22, 10, 8), '#1b1b1b');
  head.position.z = -0.55;
  group.add(head);
  const stinger = solid(new THREE.ConeGeometry(0.08, 0.28, 6), '#1b1b1b');
  stinger.rotation.x = Math.PI / 2;
  stinger.position.z = 0.62;
  group.add(stinger);
  for (const side of [-1, 1]) {
    const wing = soft(new THREE.CircleGeometry(0.3, 12), '#e8f6ff', 0.6);
    wing.rotation.x = -Math.PI / 2;
    wing.rotation.z = side * 0.4;
    wing.scale.set(0.6, 1.2, 1);
    wing.position.set(side * 0.3, 0.3, -0.08);
    group.add(wing);
  }
  // The buzzing trail: fading puffs behind it.
  [0.95, 1.35, 1.75].forEach((z, i) => {
    const puff = soft(new THREE.SphereGeometry(0.16 - i * 0.03, 8, 6), '#fff3b0', 0.55 - i * 0.15);
    puff.position.set((i % 2 ? 1 : -1) * 0.12, 0.05 * i, z);
    group.add(puff);
  });
  return group;
}

/** How the Hornet Swarm (MK-67) looks and sounds; see `./sim.ts`. */
export default {
  id: 'hornet-swarm',
  // Three hornets in a V.
  icon: [
    [32, 20],
    [16, 42],
    [48, 42],
  ]
    .map(
      ([x, y]) =>
        `<g transform="translate(${x} ${y})"><ellipse cx="-4" cy="-8" rx="6" ry="4" fill="#e8f6ff" stroke="#9ab" stroke-width="1"/><ellipse cx="4" cy="-8" rx="6" ry="4" fill="#e8f6ff" stroke="#9ab" stroke-width="1"/><ellipse rx="10" ry="7" fill="#ffc300" stroke="#1b1b1b" stroke-width="2"/><path d="M-3-6.5v13M3-6.5v13" stroke="#1b1b1b" stroke-width="3"/><circle cx="-11" r="4" fill="#1b1b1b"/><path d="M10 0l5 0" stroke="#1b1b1b" stroke-width="2"/></g>`,
    )
    .join(''),
  useSound: 'hornet-swarm.use',
  renderer: ItemEntityRenderer,
  sounds: {
    // An angry buzz as the swarm sets off: rough, wavering sawtooth pulses.
    use: (synth, v) => {
      for (let i = 0; i < 6; i += 1) {
        synth.tone(hz(i % 2 ? 51 : 50), 0.09, {
          type: 'sawtooth',
          slideTo: hz(i % 2 ? 50 : 52),
          volume: (0.14 - i * 0.015) * v,
          at: i * 0.07,
        });
      }
    },
    // A hornet stings a kart: a high zip and a little thud.
    sting: (synth, v) => {
      synth.tone(hz(76), 0.08, { type: 'sawtooth', slideTo: hz(64), volume: 0.18 * v });
      synth.whoosh(0.12, { volume: 0.25 * v, from: 900, to: 300, q: 1.5, at: 0.03 });
    },
  },
  entityModel: () => hornet(),
  overlays: {
    // A quick amber flash at the screen edges when you're stung.
    sting: {
      className: 'hornet-swarm-sting',
      html: '<div style="position:absolute;inset:0;box-shadow:inset 0 0 70px 16px rgb(255 195 0 / 0.7)"></div>',
      seconds: 0.35,
    },
  },
} satisfies ItemView;
