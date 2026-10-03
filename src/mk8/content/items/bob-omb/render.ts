import * as THREE from 'three';
import type { ItemView } from '../../../../content/items/views';
import { ItemEntityRenderer } from '../../../../render/entities';
import { TICK_RATE, tuning } from '../../../../sim/tuning';
import type { ItemEntity } from '../../../../sim/types';
import { animateExplosion, explosionModel } from '../looks';
import { BOBOMB_BLAST } from './sim';

/** A stand-in Bob-omb: a black ball with two white eyes, a fuse on top and a gold wind-up key. */
export function bobombModel(): THREE.Object3D {
  const group = new THREE.Group();
  const mat = (color: string) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.45, flatShading: true });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), mat('#1c1c24'));
  body.position.y = 0.5;
  group.add(body);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.05), mat('#ffffff'));
    // Heading 0 faces −Z: the eyes are on the front.
    eye.position.set(side * 0.13, 0.62, -0.48);
    group.add(eye);
  }
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 6), mat('#d8d0b0'));
  fuse.position.y = 1.08;
  group.add(fuse);
  const key = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 12), mat('#e0b020'));
  key.position.set(0, 0.55, 0.62);
  group.add(key);
  return group;
}

/** Draws a Bob-omb entity: the ball, or its blast growing and fading. */
export function bobombEntityModel(entity: ItemEntity): THREE.Object3D {
  return entity.spec === BOBOMB_BLAST ? explosionModel() : bobombModel();
}

/** Animates the blast (the Bob-omb itself sits still). */
export function animateBobomb(model: THREE.Object3D, entity: ItemEntity): void {
  if (entity.spec !== BOBOMB_BLAST) return;
  const life = Math.round(tuning.mk8.bobombBlastSeconds * TICK_RATE);
  animateExplosion(model, entity.age, life, tuning.mk8.bobombRadius);
}

/**
 * How the Bob-omb (MK-114) looks in our HUD and without a pack: a black bomb and its blast (with
 * a pack, the `mk8` item skin draws it with the pack's model); see `./sim.ts`.
 */
export default {
  id: 'bob-omb',
  icon: '<circle cx="30" cy="36" r="20" fill="#1c1c24" stroke="#000" stroke-width="2"/><rect x="21" y="28" width="5" height="11" rx="2" fill="#fff"/><rect x="33" y="28" width="5" height="11" rx="2" fill="#fff"/><path d="M30 16v-6" stroke="#d8d0b0" stroke-width="4" stroke-linecap="round"/><path d="M30 8l4-4M30 8l-4-4M30 8l5 1" stroke="#ffb02e" stroke-width="3" stroke-linecap="round"/><circle cx="54" cy="36" r="6" fill="none" stroke="#e0b020" stroke-width="4"/>',
  useSound: 'banana',
  renderer: ItemEntityRenderer,
  entityModel: bobombEntityModel,
  animateEntity: animateBobomb,
} satisfies ItemView;
