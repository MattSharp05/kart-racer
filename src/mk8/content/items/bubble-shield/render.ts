import * as THREE from 'three';
import { gloss, glow, lifted, sparkle, unitSize, type Mk8OurLook } from '../ours/style';

/** The bubble's radius and how high its centre sits above the kart's origin, m (ours'). */
const BUBBLE_RADIUS = 1.9;
const BUBBLE_Y = 0.55;

/**
 * A glossy see-through bubble MK8-style (MK-115): a clear, iridescent shell (a soap film's
 * rainbow) with a bright rim, a white shine and MK8's star-shine sparkles, `radius` m.
 */
export function bubbleModel(radius: number): THREE.Object3D {
  const group = new THREE.Group();
  const film = gloss('#9fe3ff', {
    transparent: true,
    opacity: 0.3,
    roughness: 0.05,
    iridescence: 1,
    iridescenceIOR: 1.3,
    depthWrite: false,
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 20), film));
  // The rim: the inside faces of a slightly bigger sphere, read as an outline.
  const rim = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.03, 32, 20),
    glow('#5fc3ff', 0.35),
  );
  (rim.material as THREE.MeshBasicMaterial).side = THREE.BackSide;
  group.add(rim);
  const shine = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.17, 12, 8),
    glow('#ffffff', 0.9),
  );
  shine.scale.set(1, 0.55, 1);
  shine.position.set(-radius * 0.38, radius * 0.62, radius * 0.5);
  group.add(shine);
  for (const [x, y, z, size, colour] of [
    [0.55, 0.65, 0.45, 0.42, '#fff27a'],
    [-0.7, -0.1, 0.65, 0.24, '#ffffff'],
    [0.2, 0.2, -0.95, 0.3, '#ffffff'],
  ] as const) {
    const star = sparkle(radius * size, colour);
    star.position.set(radius * x, radius * y, radius * z);
    group.add(star);
  }
  return group;
}

/** The bubble round a shielded kart. */
function shieldModel(): THREE.Object3D {
  const bubble = bubbleModel(BUBBLE_RADIUS);
  bubble.position.y = BUBBLE_Y;
  return lifted(bubble);
}

/** How the Bubble Shield looks in MK8 races (its behaviour is ours: `content/items/bubble-shield`). */
export default {
  id: 'bubble-shield',
  effectModel: () => shieldModel(),
  held: () => unitSize(bubbleModel(0.5)),
} satisfies Mk8OurLook;
