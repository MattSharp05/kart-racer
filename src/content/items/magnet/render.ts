import * as THREE from 'three';
import { hz } from '../../../audio/synth';
import { ItemEntityRenderer } from '../../../render/entities';
import type { ItemView } from '../views';

/** Field-line loops round the kart, how big each is (m) and how high their poles sit. */
const LOOPS = 6;
const LOOP_RADIUS = 1.2;
const POLE_Y = 0.9;

/**
 * The magnet's field: loops like a bar magnet's field lines, running from a pole above the kart
 * out round it and back (alternating red and blue, see-through), and a little horseshoe magnet
 * floating over the kart.
 */
function field(): THREE.Object3D {
  const group = new THREE.Group();
  group.position.y = POLE_Y;
  for (let i = 0; i < LOOPS; i += 1) {
    const loop = new THREE.Mesh(
      new THREE.TorusGeometry(LOOP_RADIUS, 0.035, 4, 32),
      new THREE.MeshBasicMaterial({
        color: i % 2 ? '#4cc9f0' : '#ff4d6d',
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    // A torus lies in its XY plane (upright): shift it out so it passes through the pole axis.
    loop.position.x = LOOP_RADIUS;
    loop.scale.y = 0.7;
    const spoke = new THREE.Group();
    spoke.rotation.y = (i / LOOPS) * Math.PI * 2;
    spoke.add(loop);
    group.add(spoke);
  }
  const horseshoe = new THREE.Group();
  horseshoe.position.y = 1.3;
  const red = new THREE.MeshStandardMaterial({
    color: '#e63946',
    roughness: 0.4,
    flatShading: true,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: '#dfe7ef',
    roughness: 0.3,
    metalness: 0.4,
  });
  const bend = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.1, 6, 12, Math.PI), red);
  bend.rotation.z = Math.PI;
  horseshoe.add(bend);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.25, 8), steel);
    tip.position.set(side * 0.3, 0.12, 0);
    horseshoe.add(tip);
  }
  group.add(horseshoe);
  return group;
}

/** How the Magnet (MK-68) looks and sounds; see `./sim.ts`. */
export default {
  id: 'magnet',
  // A red horseshoe magnet with steel tips and a crackle of field lines.
  icon: '<path d="M18 10v22a14 14 0 0 0 28 0V10" fill="none" stroke="#e63946" stroke-width="12"/><path d="M18 8v9M46 8v9" stroke="#dfe7ef" stroke-width="12"/><path d="M6 50q6-6 2-12M58 50q-6-6-2-12M32 62v-5" fill="none" stroke="#4cc9f0" stroke-width="3" stroke-linecap="round"/>',
  useSound: 'magnet.use',
  renderer: ItemEntityRenderer,
  sounds: {
    // An electric hum winding up.
    use: (synth, v) => {
      synth.tone(hz(40), 0.35, { type: 'sawtooth', slideTo: hz(52), volume: 0.12 * v });
      synth.tone(hz(52), 0.35, { type: 'square', slideTo: hz(64), volume: 0.06 * v, at: 0.05 });
    },
    // You take their item: a bright two-note grab.
    steal: (synth, v) => {
      synth.tone(hz(84), 0.08, { type: 'triangle', volume: 0.22 * v });
      synth.tone(hz(91), 0.14, { type: 'triangle', volume: 0.22 * v, at: 0.07 });
    },
    // Yours was taken: a falling blip.
    stolen: (synth, v) =>
      synth.tone(hz(72), 0.2, { type: 'square', slideTo: hz(60), volume: 0.1 * v }),
  },
  effectModel: () => field(),
  overlays: {
    // A quick red flash at the screen edges when someone takes your item.
    stolen: {
      className: 'magnet-stolen',
      html: '<div style="position:absolute;inset:0;box-shadow:inset 0 0 70px 16px rgb(230 57 70 / 0.65)"></div>',
      seconds: 0.4,
    },
  },
} satisfies ItemView;
