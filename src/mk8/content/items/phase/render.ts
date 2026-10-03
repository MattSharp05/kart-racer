import * as THREE from 'three';
import { gloss, glow, lifted, sparkle, unitSize, type Mk8OurLook } from '../ours/style';

/**
 * A little ghost MK8-style (MK-115), facing −Z: a glossy, half see-through violet body with a
 * wavy hem, dark eyes and a shine. About 1 m tall.
 */
export function ghostModel(): THREE.Object3D {
  const group = new THREE.Group();
  const violet = gloss('#b9a1ff', {
    transparent: true,
    opacity: 0.8,
    emissive: '#6a45e0',
    emissiveIntensity: 0.35,
  });
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    violet,
  );
  head.position.y = 0.2;
  group.add(head);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.4, 20, 1, true), violet);
  group.add(skirt);
  // The wavy hem: little cones pointing down round the bottom.
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.18, 8), violet);
    tip.rotation.x = Math.PI;
    tip.position.set(Math.cos(a) * 0.32, -0.29, Math.sin(a) * 0.32);
    group.add(tip);
  }
  const dark = gloss('#2c1a66');
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), dark);
    eye.scale.set(1, 1.4, 0.6);
    eye.position.set(side * 0.13, 0.25, -0.37);
    group.add(eye);
  }
  const shine = sparkle(0.3, '#fff27a');
  shine.position.set(0.38, 0.55, -0.1);
  group.add(shine);
  return group;
}

/**
 * The haze round a phased kart MK8-style: a violet glow in a sparkling wire shell (its
 * shimmer stays ours: the kart's `kartOpacity`).
 */
function hazeModel(): THREE.Object3D {
  const group = new THREE.Group();
  group.position.y = 0.55;
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7, 1), glow('#c9b8ff', 0.18));
  (shell.material as THREE.MeshBasicMaterial).wireframe = true;
  group.add(shell);
  group.add(new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 14), glow('#7b5cff', 0.16)));
  for (const [x, y, z] of [
    [1.3, 0.9, 0.3],
    [-1.2, 0.4, -0.7],
    [0.2, 1.4, -1.1],
  ] as const) {
    const star = sparkle(0.45, '#e9e1ff');
    star.position.set(x, y, z);
    group.add(star);
  }
  return lifted(group);
}

/** How Phase looks in MK8 races (its behaviour is ours: `content/items/phase`). */
export default {
  id: 'phase',
  effectModel: () => hazeModel(),
  held: () => unitSize(ghostModel()),
} satisfies Mk8OurLook;
