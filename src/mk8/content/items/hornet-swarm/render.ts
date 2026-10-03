import * as THREE from 'three';
import type { ItemEntity } from '../../../../sim/types';
import { gloss, glow, sparkle, unitSize, type Mk8OurLook } from '../ours/style';

/** Hornets fly this high above the road (the entity renderer already lifts models 0.4 m)… */
const FLY_HEIGHT = 0.6;
/** …drawn this much bigger than life, so they read at racing distance… */
const SIZE = 1.5;
/** …bobbing this high, this many times a second (from their age: a paused frame stays still). */
const BOB = 0.12;
const BOBS_PER_TICK = 0.25;
/** Their wings beat this fast, rad a tick, this far. */
const BEAT_RATE = 1.7;
const BEAT = 0.5;

/** A wing's name, so the animation can find it. */
const WING = 'wing';

/**
 * A hornet MK8-style (MK-115), facing −Z: a glossy yellow body with black bands, a big black head
 * with shiny eyes, a stinger and clear wings with a pale shine.
 */
export function hornetModel(): THREE.Object3D {
  const group = new THREE.Group();
  const yellow = gloss('#ffc21a');
  const black = gloss('#1b1530', { roughness: 0.2 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), yellow);
  body.scale.set(1, 0.95, 1.5);
  group.add(body);
  for (const z of [-0.1, 0.17]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.05, 6, 20), black);
    band.position.z = z;
    band.scale.set(1, 0.97, 1);
    group.add(band);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 10), black);
  head.position.z = -0.56;
  group.add(head);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), gloss('#ffffff'));
    eye.position.set(side * 0.12, 0.07, -0.74);
    group.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), black);
    pupil.position.set(side * 0.12, 0.08, -0.83);
    group.add(pupil);
  }
  const stinger = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 8), black);
  stinger.rotation.x = Math.PI / 2;
  stinger.position.z = 0.64;
  group.add(stinger);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.CircleGeometry(0.32, 16), glow('#dff4ff', 0.55));
    wing.name = WING;
    wing.rotation.x = -Math.PI / 2;
    wing.rotation.y = side * 0.35;
    wing.scale.set(0.6, 1.25, 1);
    wing.position.set(side * 0.3, 0.32, -0.08);
    wing.userData.side = side;
    group.add(wing);
  }
  return group;
}

/** A flying hornet: lifted, made bigger, with a glint of star-shine trailing it. */
function flyingHornet(): THREE.Object3D {
  const outer = new THREE.Group();
  const hornet = hornetModel();
  hornet.position.y = FLY_HEIGHT;
  hornet.scale.setScalar(SIZE);
  outer.add(hornet);
  const shine = sparkle(0.45, '#fff27a');
  shine.position.set(0, FLY_HEIGHT + 0.2, 1.4);
  outer.add(shine);
  return outer;
}

/** Bobs the hornet and beats its wings, from its age. */
function animate(model: THREE.Object3D, entity: ItemEntity): void {
  const hornet = model.children[0];
  if (hornet)
    hornet.position.y = FLY_HEIGHT + BOB * Math.sin(entity.age * BOBS_PER_TICK + entity.id);
  model.traverse((node) => {
    if (node.name !== WING) return;
    const side = node.userData.side as number;
    node.rotation.z = side * BEAT * Math.sin(entity.age * BEAT_RATE);
  });
}

/** The held Hornet Swarm: three hornets in a V. */
function swarmModel(): THREE.Object3D {
  const group = new THREE.Group();
  for (const [x, y, z] of [
    [0, 0.25, -0.5],
    [-0.75, 0, 0.35],
    [0.75, 0, 0.35],
  ] as const) {
    const hornet = hornetModel();
    hornet.position.set(x, y, z);
    group.add(hornet);
  }
  return unitSize(group);
}

/** How the Hornet Swarm looks in MK8 races (its behaviour is ours: `content/items/hornet-swarm`). */
export default {
  id: 'hornet-swarm',
  entityModel: () => flyingHornet(),
  animateEntity: animate,
  held: swarmModel,
} satisfies Mk8OurLook;
