import * as THREE from 'three';
import type { RacerView } from '../render';

export default {
  id: 'swoop',
  colours: { body: 0x2a9d8f, accent: 0xe9c46a, driver: 0xffddd2 },
  alternateBodies: [0x06d6a0, 0x118ab2],
  shape: {
    chassis: [1.2, 0.32, 2.1],
    chassisY: 0.36,
    frontRadius: 0.29,
    rearRadius: 0.3,
    frontZ: -0.8,
    rearZ: 0.74,
    wheelX: 0.72,
    driverY: 0.88,
    driverZ: 0.3,
  },
  details({ body, shape, palette, lambert }) {
    // Rear wing on two posts, and a fin.
    const [w, h] = shape.chassis;
    const top = shape.chassisY + h / 2;
    const accent = lambert(palette.accent);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.06, 0.35), accent);
    wing.position.set(0, top + 0.45, 0.85);
    for (const x of [-0.4, 0.4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.06), accent);
      post.position.set(x, top + 0.22, 0.85);
      body.add(post);
    }
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.6), lambert(palette.body));
    nose.position.set(0, shape.chassisY - 0.05, -1.15);
    body.add(wing, nose);
  },
} satisfies RacerView;
