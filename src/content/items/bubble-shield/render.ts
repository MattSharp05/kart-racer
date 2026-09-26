import * as THREE from 'three';
import { hz } from '../../../audio/synth';
import { ItemEntityRenderer } from '../../../render/entities';
import type { ItemView } from '../views';

/** The bubble's radius and how high its centre sits above the kart's origin, m. */
const BUBBLE_RADIUS = 1.9;
const BUBBLE_Y = 0.55;

/** A translucent soap bubble: a pale blue shell, a brighter rim and a white glint. */
function bubble(): THREE.Object3D {
  const group = new THREE.Group();
  group.position.y = BUBBLE_Y;
  const soft = (geometry: THREE.BufferGeometry, color: string, opacity: number) =>
    new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
    );
  group.add(soft(new THREE.SphereGeometry(BUBBLE_RADIUS, 24, 16), '#8fd8ff', 0.22));
  // The rim: the inside faces of a slightly bigger sphere, tinted, read as an outline.
  const rim = soft(new THREE.SphereGeometry(BUBBLE_RADIUS * 1.03, 24, 16), '#d4f1ff', 0.35);
  (rim.material as THREE.MeshBasicMaterial).side = THREE.BackSide;
  group.add(rim);
  // A rainbow band and a glint on the upper side.
  const band = soft(new THREE.TorusGeometry(BUBBLE_RADIUS * 0.98, 0.05, 6, 32), '#e0a8ff', 0.5);
  band.rotation.x = Math.PI / 2 - 0.35;
  group.add(band);
  const glint = soft(new THREE.SphereGeometry(0.28, 10, 8), '#ffffff', 0.85);
  glint.position.set(-0.7, 1.2, 0.9);
  glint.scale.set(1, 0.6, 1);
  group.add(glint);
  return group;
}

/** How the Bubble Shield (MK-66) looks and sounds; see `./sim.ts`. */
export default {
  id: 'bubble-shield',
  icon: '<circle cx="32" cy="32" r="25" fill="#8fd8ff" fill-opacity="0.45" stroke="#d4f1ff" stroke-width="4"/><path d="M14 36a19 19 0 0 0 30 12" fill="none" stroke="#e0a8ff" stroke-width="3" stroke-linecap="round"/><ellipse cx="23" cy="21" rx="6" ry="4" fill="#fff" transform="rotate(-35 23 21)"/><circle cx="36" cy="18" r="2.5" fill="#fff"/>',
  useSound: 'bubble-shield.use',
  renderer: ItemEntityRenderer,
  sounds: {
    // A rising, wobbly bloop as the bubble blows up.
    use: (synth, v) => {
      synth.tone(hz(60), 0.12, { type: 'sine', slideTo: hz(72), volume: 0.25 * v });
      synth.tone(hz(67), 0.15, { type: 'sine', slideTo: hz(79), volume: 0.2 * v, at: 0.08 });
    },
    // It blocks a hit and bursts.
    pop: (synth, v) => {
      synth.whoosh(0.18, { volume: 0.4 * v, from: 4000, to: 1200, q: 2 });
      synth.tone(hz(84), 0.08, { type: 'triangle', slideTo: hz(91), volume: 0.2 * v });
    },
  },
  effectModel: () => bubble(),
  overlays: {
    // A quick pale-blue flash when your bubble takes a hit.
    pop: {
      className: 'bubble-shield-pop',
      html: '<div style="position:absolute;inset:0;box-shadow:inset 0 0 90px 24px #8fd8ff"></div>',
      seconds: 0.4,
    },
  },
} satisfies ItemView;
