import * as THREE from 'three';
import { SLICK_RADIUS } from '../../../../content/items/oil-slick/sim';
import { gloss, glow, lifted, sparkle, unitSize, type Mk8OurLook } from '../ours/style';

/** The entity renderer lifts models 0.4 m; the puddle sits just above the road. */
const GROUND_OFFSET = -0.38;
/** How high the puddle's middle bulges, m. */
const POOL_HEIGHT = 0.06;

/**
 * The Oil Slick MK8-style (MK-115): a glossy black puddle that mirrors the sky, with an iridescent
 * rainbow sheen, a few droplets and a glint of star-shine, flat on the road.
 */
export function puddleModel(): THREE.Object3D {
  const group = new THREE.Group();
  group.position.y = GROUND_OFFSET;
  const oil = gloss('#0d0b14', {
    roughness: 0.08,
    iridescence: 1,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [200, 600],
  });
  const flat = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    group.add(mesh);
    return mesh;
  };
  // A low dome rather than a disc, so the clear coat catches the light.
  const pool = new THREE.Mesh(
    new THREE.SphereGeometry(SLICK_RADIUS, 32, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    oil,
  );
  pool.scale.y = POOL_HEIGHT / SLICK_RADIUS;
  group.add(pool);
  for (const [inner, outer, colour] of [
    [0.3, 0.42, '#c45cff'],
    [0.46, 0.58, '#2ee6d6'],
    [0.62, 0.72, '#ffe14a'],
  ] as const) {
    flat(
      new THREE.RingGeometry(SLICK_RADIUS * inner, SLICK_RADIUS * outer, 32),
      glow(colour, 0.55),
      POOL_HEIGHT + 0.01,
    );
  }
  for (const [x, z, r] of [
    [1.75, 0.5, 0.28],
    [-1.3, -1.25, 0.22],
    [-0.5, 1.85, 0.2],
  ] as const) {
    const drop = new THREE.Mesh(
      new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      oil,
    );
    drop.scale.y = 0.35;
    drop.position.set(x, 0, z);
    group.add(drop);
  }
  const shine = sparkle(0.5);
  shine.position.set(-0.5, 0.25, -0.4);
  group.add(shine);
  return lifted(group);
}

/** The held Oil Slick: a glossy black drop with a rainbow sheen, point up. */
function dropModel(): THREE.Object3D {
  const group = new THREE.Group();
  const oil = gloss('#14101f', { roughness: 0.1, iridescence: 1, iridescenceIOR: 1.6 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), oil);
  group.add(ball);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.75, 20, 1, true), oil);
  tip.position.y = 0.6;
  group.add(tip);
  const shine = sparkle(0.35);
  shine.position.set(-0.3, 0.35, -0.42);
  group.add(shine);
  return unitSize(group);
}

/** How the Oil Slick looks in MK8 races (its behaviour is ours: `content/items/oil-slick`). */
export default {
  id: 'oil-slick',
  entityModel: () => puddleModel(),
  held: dropModel,
} satisfies Mk8OurLook;
