import * as THREE from 'three';
import { hz } from '../../../audio/synth';
import { ItemEntityRenderer } from '../../../render/entities';
import type { ItemView } from '../views';

/** A phased kart is drawn this see-through, shimmering by ± `SHIMMER` at `SHIMMER_RATE` rad/tick. */
const GHOST_OPACITY = 0.38;
const SHIMMER = 0.12;
const SHIMMER_RATE = 0.45;

/** A faint violet haze around the phased kart (its shimmer is in `kartOpacity`). */
function haze(): THREE.Object3D {
  const group = new THREE.Group();
  group.position.y = 0.55;
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.7, 1),
    new THREE.MeshBasicMaterial({
      color: '#b8a4ff',
      transparent: true,
      opacity: 0.22,
      wireframe: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  group.add(shell);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 16, 12),
    new THREE.MeshBasicMaterial({
      color: '#7b5cff',
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  group.add(glow);
  return group;
}

/** How Phase (MK-66) looks and sounds; see `./sim.ts`. */
export default {
  id: 'phase',
  icon: '<path d="M14 54V28a18 18 0 0 1 36 0v26l-6-5-6 5-6-5-6 5-6-5z" fill="#b8a4ff" fill-opacity="0.75" stroke="#ede7ff" stroke-width="3" stroke-dasharray="6 4"/><circle cx="25" cy="28" r="4" fill="#3a2a7a"/><circle cx="39" cy="28" r="4" fill="#3a2a7a"/>',
  useSound: 'phase.use',
  renderer: ItemEntityRenderer,
  sounds: {
    // A shimmering, falling chord as the kart fades out.
    use: (synth, v) => {
      synth.tone(hz(76), 0.35, { type: 'sine', slideTo: hz(64), volume: 0.18 * v });
      synth.tone(hz(83), 0.35, { type: 'triangle', slideTo: hz(71), volume: 0.1 * v, at: 0.04 });
      synth.whoosh(0.4, { volume: 0.15 * v, from: 2500, to: 600, q: 4 });
    },
  },
  effectModel: () => haze(),
  kartOpacity: (_effect, tick) => GHOST_OPACITY + SHIMMER * Math.sin(tick * SHIMMER_RATE),
} satisfies ItemView;
