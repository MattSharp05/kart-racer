import * as THREE from 'three';
import { hz } from '../../../audio/synth';
import { ItemEntityRenderer } from '../../../render/entities';
import type { ItemView } from '../views';

/** One of the kit's entity models, by spec. */
function model(spec: string): THREE.Object3D {
  if (spec === 'test-kit-puddle') {
    const puddle = new THREE.Mesh(
      new THREE.CircleGeometry(2.5, 20),
      new THREE.MeshBasicMaterial({ color: '#1b1b3a', transparent: true, opacity: 0.8 }),
    );
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.y = -0.35;
    const group = new THREE.Group();
    group.add(puddle);
    return group;
  }
  const colour = spec === 'test-kit-bolt' ? '#8338ec' : '#fb8500';
  const geometry =
    spec === 'test-kit-bolt'
      ? new THREE.ConeGeometry(0.4, 1.2, 6).rotateX(-Math.PI / 2)
      : new THREE.TorusGeometry(0.6, 0.15, 6, 12, Math.PI * 1.2).rotateX(Math.PI / 2);
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.4, flatShading: true }),
  );
}

/** How the test kit (MK-52's worked example) looks and sounds; see `./sim.ts`. */
export default {
  id: 'test-kit',
  icon: '<rect x="8" y="16" width="48" height="36" rx="6" fill="#8338ec"/><rect x="24" y="10" width="16" height="10" rx="3" fill="none" stroke="#fff" stroke-width="3"/><path d="M32 24v20M22 34h20" stroke="#fff" stroke-width="5"/>',
  useSound: 'test-kit.use',
  renderer: ItemEntityRenderer,
  sounds: {
    use: (synth, v) =>
      synth.tone(hz(72), 0.15, { type: 'triangle', slideTo: hz(79), volume: 0.2 * v }),
    pop: (synth, v) => synth.whoosh(0.25, { volume: 0.35 * v, from: 3000, to: 800, q: 2 }),
    splat: (synth, v) => synth.whoosh(0.3, { volume: 0.3 * v, from: 400, to: 150, q: 0.8 }),
  },
  entityModel: (entity) => model(entity.spec),
  effectModel: (effect) => {
    if (effect.kind !== 'test-kit-shield') return new THREE.Group();
    return new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 16, 12),
      new THREE.MeshBasicMaterial({ color: '#8ecae6', transparent: true, opacity: 0.3 }),
    );
  },
  overlays: {
    // Ink blots while the inked effect lasts on your kart.
    'test-kit-ink': {
      className: 'test-kit-ink',
      html: '<svg viewBox="0 0 100 60" preserveAspectRatio="none" style="width:100%;height:100%"><g fill="#1b1b3a" opacity="0.85"><circle cx="30" cy="30" r="14"/><circle cx="62" cy="22" r="10"/><circle cx="55" cy="42" r="12"/><circle cx="78" cy="38" r="7"/></g></svg>',
    },
    // A quick blue flash when your shield blocks a hit.
    pop: {
      className: 'test-kit-pop',
      html: '<div style="position:absolute;inset:0;box-shadow:inset 0 0 80px 20px #8ecae6"></div>',
      seconds: 0.4,
    },
  },
} satisfies ItemView;
