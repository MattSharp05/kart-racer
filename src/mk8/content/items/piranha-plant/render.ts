import * as THREE from 'three';
import type { ItemView } from '../../../../content/items/views';
import type { KartEffect } from '../../../../sim/types';
import { PIRANHA_DATA } from './sim';

/** The plant (centred on its middle) sits this far ahead of the kart's centre, m, this high. */
export const PIRANHA_AHEAD = 1.7;
export const PIRANHA_HEIGHT = 0.7;
/** A lunge reaches this much further, m, and lasts this many ticks out and back. */
const LUNGE_REACH = 1.6;
const LUNGE_TICKS = 16;

/**
 * Where the plant's head is relative to its pot, from its effect: `out` m along the last lunge's
 * direction (XZ, world), 0 between lunges. From the effect's tick counter, so a paused frame is
 * the same every time.
 */
export function piranhaLunge(effect: KartEffect): { out: number; x: number; z: number } {
  const d = effect.data;
  const since = d[PIRANHA_DATA.since] ?? Infinity;
  const out = since < LUNGE_TICKS ? Math.sin((Math.PI * since) / LUNGE_TICKS) * LUNGE_REACH : 0;
  return { out, x: d[PIRANHA_DATA.dirX] ?? 0, z: d[PIRANHA_DATA.dirZ] ?? 0 };
}

/**
 * A stand-in potted Piranha Plant (when the pack has none): a blue pot, a green stem and a red
 * head with white spots and an open white-toothed mouth facing forward (−Z). Unit height, centred
 * on its middle like the pack's models (`ItemModels.instance`).
 */
export function piranhaModel(): THREE.Object3D {
  const group = new THREE.Group();
  const mat = (color: string) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, flatShading: true });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.3, 10), mat('#2f6fe4'));
  pot.position.y = 0.15;
  group.add(pot);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 6), mat('#2e9e3e'));
  stem.position.y = 0.42;
  group.add(stem);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), mat('#d8262e'));
  head.position.y = 0.72;
  head.scale.set(1, 0.9, 1.1);
  group.add(head);
  for (const [x, y] of [
    [0.18, 0.84],
    [-0.16, 0.86],
    [0, 0.97],
  ] as const) {
    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), mat('#ffffff'));
    spot.position.set(x, y, 0.05);
    group.add(spot);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.08), mat('#ffffff'));
  mouth.position.set(0, 0.68, -0.27);
  group.add(mouth);
  group.position.y = -0.5;
  const centred = new THREE.Group();
  centred.add(group);
  return centred;
}

/**
 * How the Piranha Plant (MK-126) looks in our HUD: a red-headed plant in a blue pot. In MK8 races
 * the `mk8` item skin draws it out in front of the kart, lunging; see `./sim.ts`.
 */
export default {
  id: 'piranha-plant',
  icon: '<path d="M18 46h28l-4 14H22z" fill="#2f6fe4" stroke="#14378a" stroke-width="2"/><path d="M32 46V30" stroke="#2e9e3e" stroke-width="5"/><ellipse cx="22" cy="40" rx="8" ry="3.5" fill="#3cbf4c"/><ellipse cx="42" cy="40" rx="8" ry="3.5" fill="#3cbf4c"/><circle cx="32" cy="20" r="15" fill="#d8262e" stroke="#7a0f14" stroke-width="2"/><circle cx="24" cy="13" r="3" fill="#fff"/><circle cx="40" cy="14" r="3" fill="#fff"/><path d="M21 24q11 8 22 0" fill="#fff" stroke="#7a0f14" stroke-width="2"/>',
  useSound: null,
} satisfies ItemView;
