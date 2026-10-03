import * as THREE from 'three';
import { gloss, glow, lifted, unitSize, type Mk8OurLook } from '../ours/style';

/** Field-line loops round the kart, how big each is (m) and how high their poles sit (ours'). */
const LOOPS = 6;
const LOOP_RADIUS = 1.2;
const POLE_Y = 0.9;
/** The horseshoe over a magnetised kart: how high over the poles, and how big, m. */
const HORSESHOE_Y = 1.3;
const HORSESHOE_SIZE = 0.8;

/**
 * A horseshoe magnet MK8-style (MK-115), poles down: a glossy candy-red bend and shiny silver
 * poles, facing −Z. About 1 m across.
 */
export function horseshoeModel(): THREE.Object3D {
  const group = new THREE.Group();
  const red = gloss('#e3172f');
  const steel = gloss('#dfe7ef', { metalness: 0.8, roughness: 0.18 });
  const bend = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.13, 12, 24, Math.PI), red);
  group.add(bend);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 14), red);
    arm.position.set(side * 0.3, -0.15, 0);
    group.add(arm);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.22, 14), steel);
    pole.position.set(side * 0.3, -0.41, 0);
    group.add(pole);
  }
  return group;
}

/**
 * The magnet's field MK8-style: glowing field-line loops round the kart (alternating red and
 * blue) under a glossy horseshoe, poles down.
 */
function fieldModel(): THREE.Object3D {
  const group = new THREE.Group();
  group.position.y = POLE_Y;
  for (let i = 0; i < LOOPS; i += 1) {
    const loop = new THREE.Mesh(
      new THREE.TorusGeometry(LOOP_RADIUS, 0.045, 6, 40),
      glow(i % 2 ? '#36c5ff' : '#ff4d6d', 0.6),
    );
    // A torus lies in its XY plane (upright): shift it out so it passes through the pole axis.
    loop.position.x = LOOP_RADIUS;
    loop.scale.y = 0.7;
    const spoke = new THREE.Group();
    spoke.rotation.y = (i / LOOPS) * Math.PI * 2;
    spoke.add(loop);
    group.add(spoke);
  }
  const horseshoe = horseshoeModel();
  horseshoe.scale.setScalar(HORSESHOE_SIZE);
  horseshoe.position.y = HORSESHOE_Y;
  group.add(horseshoe);
  return lifted(group);
}

/** How the Magnet looks in MK8 races (its behaviour is ours: `content/items/magnet`). */
export default {
  id: 'magnet',
  effectModel: () => fieldModel(),
  held: () => unitSize(horseshoeModel()),
} satisfies Mk8OurLook;
