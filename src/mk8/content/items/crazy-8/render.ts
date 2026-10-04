import * as THREE from 'three';
import { itemViews, type ItemView } from '../../../../content/items/views';
import { CRAZY8_PRESSES, CRAZY8_USES } from './sim';

/** Crazy 8's icon: a glowing gold "8" in a rainbow ring (ours, after its MK8 icon's look). */
export const CRAZY8_ICON =
  '<circle cx="32" cy="32" r="27" fill="none" stroke="#ff4d6d" stroke-width="4"/><circle cx="32" cy="32" r="23" fill="none" stroke="#6ec6ff" stroke-width="4"/><circle cx="32" cy="22" r="8" fill="none" stroke="#ffb02e" stroke-width="6"/><circle cx="32" cy="41" r="10" fill="none" stroke="#ffb02e" stroke-width="6"/><circle cx="32" cy="22" r="8" fill="none" stroke="#fff275" stroke-width="2"/><circle cx="32" cy="41" r="10" fill="none" stroke="#fff275" stroke-width="2"/>';

/**
 * The icon with `uses` left: the "8" until the ring is out, then the item the next press uses
 * (its view's icon, once registered).
 */
export function crazy8IconFor(uses: number): string {
  if (uses >= CRAZY8_USES) return CRAZY8_ICON;
  const next = CRAZY8_PRESSES[CRAZY8_PRESSES.length - uses];
  return next !== undefined && itemViews.has(next) ? itemViews.get(next).icon : CRAZY8_ICON;
}

/** Glowing gold, unlit (it shines in any light). */
const glow = () => new THREE.MeshBasicMaterial({ color: '#ffc93c' });

/**
 * The held Crazy 8 (the pack has no model, BUILD_REPORT): its icon's "8" as two glowing tori, one
 * on the other, upright and facing forward. Unit height.
 */
export function crazy8Model(): THREE.Object3D {
  const group = new THREE.Group();
  for (const [y, r] of [
    [0.73, 0.2],
    [0.27, 0.24],
  ] as const) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 8, 20), glow());
    ring.position.y = y;
    group.add(ring);
  }
  return group;
}

/** The ring's glow round the kart once it's out: a flat torus, unit radius. */
export function crazy8Halo(): THREE.Object3D {
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.04, 6, 40),
    new THREE.MeshBasicMaterial({ color: '#fff3a6', transparent: true, opacity: 0.7 }),
  );
  halo.rotation.x = Math.PI / 2;
  const group = new THREE.Group();
  group.add(halo);
  return group;
}

/**
 * How Crazy 8 (MK-126) looks in our HUD: its "8", then the next item to use. In MK8 races the
 * `mk8` item skin draws the ring of items circling the kart; see `./sim.ts`.
 */
export default {
  id: 'crazy-8',
  icon: CRAZY8_ICON,
  iconFor: crazy8IconFor,
  // Each press's own item makes its sound (`itemUsed` for it).
  useSound: null,
} satisfies ItemView;
