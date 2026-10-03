import * as THREE from 'three';
import type { ItemView } from '../../../../content/items/views';
import { ItemEntityRenderer } from '../../../../render/entities';
import { TICK_RATE } from '../../../../sim/tuning';

/** A fireball hops this high, m, this many times a second. */
const HOP_HEIGHT = 0.6;
const HOPS_PER_SECOND = 3;

/**
 * The Fire Flower, built from simple shapes on its MK8 icon (the pack has no model, BUILD_REPORT):
 * a green stem with two leaves, and a flower head of a red-orange rim round a yellow ring and a
 * white centre with two black eyes, facing forward. Unit height.
 */
export function fireFlowerModel(): THREE.Object3D {
  const group = new THREE.Group();
  const mat = (color: string) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, flatShading: true });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.5, 6), mat('#2e9e3e'));
  stem.position.y = 0.25;
  group.add(stem);
  for (const side of [-1, 1]) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 4), mat('#3cbf4c'));
    leaf.scale.set(1.4, 0.35, 0.8);
    leaf.position.set(side * 0.17, 0.2, 0);
    leaf.rotation.z = side * -0.4;
    group.add(leaf);
  }
  const head = new THREE.Group();
  head.position.y = 0.72;
  const disc = (radius: number, color: string, z: number) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.08, 16), mat(color));
    // Its face towards −Z (forward).
    mesh.rotation.x = Math.PI / 2;
    mesh.position.z = z;
    head.add(mesh);
  };
  disc(0.28, '#e8361c', 0);
  disc(0.21, '#ff9a1f', -0.03);
  disc(0.15, '#ffe14a', -0.06);
  disc(0.1, '#fffbe8', -0.09);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.02), mat('#111111'));
    eye.position.set(side * 0.035, 0, -0.14);
    head.add(eye);
  }
  group.add(head);
  return group;
}

/** A fireball: a glowing orange-red ball. */
export function fireballModel(): THREE.Object3D {
  const group = new THREE.Group();
  group.add(
    new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.4, 1),
      new THREE.MeshBasicMaterial({ color: '#ff5a1f' }),
    ),
  );
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.25, 1),
    new THREE.MeshBasicMaterial({ color: '#ffd84a' }),
  );
  core.position.z = -0.12;
  group.add(core);
  return group;
}

/**
 * How the Fire Flower (MK-114) looks in our HUD and its fireballs, hopping as they go (from their
 * age, so a paused frame is the same every time); see `./sim.ts`.
 */
export default {
  id: 'fire-flower',
  icon: '<path d="M32 34v22" stroke="#2e9e3e" stroke-width="5"/><ellipse cx="22" cy="48" rx="9" ry="4" fill="#3cbf4c"/><ellipse cx="42" cy="48" rx="9" ry="4" fill="#3cbf4c"/><ellipse cx="32" cy="22" rx="22" ry="16" fill="#e8361c"/><ellipse cx="32" cy="22" rx="16" ry="11" fill="#ff9a1f"/><ellipse cx="32" cy="22" rx="11" ry="7" fill="#ffe14a"/><ellipse cx="32" cy="22" rx="7" ry="4.5" fill="#fffbe8"/><rect x="28" y="19" width="2.5" height="6" fill="#111"/><rect x="33.5" y="19" width="2.5" height="6" fill="#111"/>',
  useSound: 'shell',
  renderer: ItemEntityRenderer,
  entityModel: () => fireballModel(),
  animateEntity: (model, entity) => {
    const phase = (entity.age / TICK_RATE) * HOPS_PER_SECOND * Math.PI;
    model.position.y += HOP_HEIGHT * Math.abs(Math.sin(phase));
  },
} satisfies ItemView;
