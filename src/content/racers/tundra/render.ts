import * as THREE from 'three';
import type { RacerView } from '../render';

/** Plough blades' angle off the kart's width, rad: they meet in a V at the nose. */
const PLOUGH_ANGLE = 0.45;

export default {
  id: 'tundra',
  colours: { body: 0x8ecae6, accent: 0xf8f9fa, driver: 0xfde2e4 },
  alternateBodies: [0x219ebc, 0xadb5bd],
  shape: {
    chassis: [1.45, 0.6, 1.95],
    chassisY: 0.55,
    frontRadius: 0.33,
    rearRadius: 0.4,
    frontZ: -0.7,
    rearZ: 0.62,
    wheelX: 0.7,
    driverY: 1.2,
    driverZ: 0.3,
  },
  details({ body, shape, palette, lambert }) {
    // Heavy snowplough: a white V-plough on the nose, snow heaped on the back, icicles and a beacon.
    const [w, h, l] = shape.chassis;
    const top = shape.chassisY + h / 2;
    const snow = lambert(palette.accent);
    const dark = lambert(0x264653);
    const ice = lambert(0xcaf0f8);
    // The two blades meet at the front of the physics footprint.
    for (const side of [-1, 1]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.45, 0.08), snow);
      blade.rotation.y = -side * PLOUGH_ANGLE;
      blade.position.set(side * 0.39, shape.chassisY - 0.05, -1.2);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.3), dark);
      arm.position.set(side * 0.35, shape.chassisY - 0.05, -l / 2 - 0.1);
      body.add(blade, arm);
    }
    // A dark edge along the top of the plough.
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.06, 0.12), dark);
    edge.position.set(0, shape.chassisY + 0.2, -l / 2 - 0.02);
    body.add(edge);
    // Snow heaped on the rear deck.
    const heap = new THREE.Mesh(
      new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2),
      snow,
    );
    heap.scale.set(0.6, 0.22, 0.35);
    heap.position.set(0, top, l / 2 - 0.3);
    body.add(heap);
    // Icicles hanging off the back edge.
    const icicle = new THREE.ConeGeometry(0.05, 0.22, 4);
    icicle.rotateX(Math.PI);
    for (const x of [-0.5, -0.2, 0.15, 0.45]) {
      const drip = new THREE.Mesh(icicle, ice);
      drip.position.set(x, shape.chassisY - h / 2 - 0.08, l / 2 - 0.03);
      body.add(drip);
    }
    // Amber beacon on a post, like a real plough.
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 5), dark);
    post.position.set(-0.5, top + 0.17, 0.2);
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 0.14, 8),
      lambert(0xffb703),
    );
    beacon.position.set(-0.5, top + 0.4, 0.2);
    body.add(post, beacon);
  },
} satisfies RacerView;
