import * as THREE from 'three';
import { hz } from '../../../audio/synth';
import { ItemEntityRenderer } from '../../../render/entities';
import type { ItemView } from '../views';

/** It flies this high above the road (the entity renderer already lifts models 0.4 m)… */
const FLY_HEIGHT = 0.5;
/** …drawn this much bigger than life, so it reads at racing distance… */
const SIZE = 2;
/** …leaning back this far from upright (rad), as a thrown boomerang flies, so it reads face-on… */
const TILT = 0.35;
/** …spinning this much per sim tick (rad): about 2 turns a second. */
const SPIN_PER_TICK = 0.22;
/** The name of the spinning part (`animateEntity` finds it). */
const SPINNER = 'boomerang-spinner';

/**
 * A wooden boomerang: two arms meeting at an elbow, painted stripes near the tips, spinning
 * nearly upright about its middle (`animateEntity`) so the chase camera sees its face, with a fading
 * swirl of rings behind it (the renderer turns the model so +Z trails its travel direction).
 */
function boomerang(): THREE.Object3D {
  const group = new THREE.Group();
  group.position.y = FLY_HEIGHT;
  group.scale.setScalar(SIZE);
  // Upright: the spin plane faces along the flight path (tilted back a little).
  const tilt = new THREE.Group();
  tilt.rotation.x = Math.PI / 2 - TILT;
  group.add(tilt);
  const spinner = new THREE.Group();
  spinner.name = SPINNER;
  tilt.add(spinner);
  const wood = new THREE.MeshStandardMaterial({
    color: '#c8873e',
    roughness: 0.7,
    flatShading: true,
  });
  const paint = new THREE.MeshStandardMaterial({ color: '#e63946', roughness: 0.6 });
  // Each arm runs from the elbow outwards; the elbow sits off-centre so it spins about its middle.
  for (const angle of [-0.95, 0.95]) {
    const arm = new THREE.Group();
    arm.rotation.y = angle;
    arm.position.set(0, 0, -0.18);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.7), wood);
    blade.position.z = 0.33;
    arm.add(blade);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.065, 0.1), paint);
    tip.position.z = 0.56;
    arm.add(tip);
    spinner.add(arm);
  }
  const elbow = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 10), wood);
  elbow.position.z = -0.18;
  spinner.add(elbow);
  // The trail: fading flat rings behind it, the swirl of its spin.
  [0.7, 1.15, 1.6].forEach((z, i) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.28 - i * 0.05, 0.36 - i * 0.05, 16),
      new THREE.MeshBasicMaterial({
        color: '#fff1d0',
        transparent: true,
        opacity: 0.5 - i * 0.14,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    ring.position.z = z;
    group.add(ring);
  });
  return group;
}

/** How the Boomerang (MK-69) looks and sounds; see `./sim.ts`. */
export default {
  id: 'boomerang',
  // A boomerang with red-tipped arms and a curved arrow showing it comes back.
  icon:
    '<path d="M10 50 Q20 12 32 12 Q44 12 54 50" fill="none" stroke="#5a3a1a" stroke-width="13" stroke-linecap="round"/>' +
    '<path d="M10 50 Q20 12 32 12 Q44 12 54 50" fill="none" stroke="#c8873e" stroke-width="8" stroke-linecap="round"/>' +
    '<path d="M11 48 L13 41 M53 48 L51 41" stroke="#e63946" stroke-width="7" stroke-linecap="round"/>' +
    '<path d="M22 40 Q32 30 42 40" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M22 34 L22 40 L28 40" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  useSound: 'boomerang.use',
  renderer: ItemEntityRenderer,
  sounds: {
    // Thrown: a pulsing whoosh (whup-whup-whup) as it spins away.
    use: (synth, v) => {
      for (let i = 0; i < 4; i += 1) {
        synth.whoosh(0.12, {
          volume: (0.32 - i * 0.06) * v,
          from: 500 + i * 150,
          to: 1600 - i * 200,
          q: 2,
          at: i * 0.11,
        });
      }
    },
    // Caught: a short whoosh landing in a wooden clack.
    catch: (synth, v) => {
      synth.whoosh(0.1, { volume: 0.25 * v, from: 1400, to: 500, q: 2 });
      synth.tone(hz(72), 0.06, { type: 'square', volume: 0.12 * v, at: 0.08 });
      synth.tone(hz(67), 0.08, { type: 'triangle', volume: 0.15 * v, at: 0.1 });
    },
  },
  entityModel: () => boomerang(),
  animateEntity: (model, entity) => {
    const spinner = model.getObjectByName(SPINNER);
    if (spinner) spinner.rotation.y = entity.age * SPIN_PER_TICK;
  },
} satisfies ItemView;
