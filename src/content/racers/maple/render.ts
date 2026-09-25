import * as THREE from 'three';
import type { RacerView } from '../render';

export default {
  id: 'maple',
  colours: { body: 0xe63946, accent: 0xf1faee, driver: 0xffd6a5 },
  alternateBodies: [0x9d0208, 0xf77f00],
  shape: {
    chassis: [1.3, 0.45, 2.1],
    chassisY: 0.45,
    frontRadius: 0.32,
    rearRadius: 0.32,
    frontZ: -0.75,
    rearZ: 0.75,
    wheelX: 0.72,
    driverY: 1.05,
    driverZ: 0.25,
  },
  details({ body, shape, palette, lambert }) {
    const [, h, l] = shape.chassis;
    const top = shape.chassisY + h / 2;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 0.5), lambert(palette.body));
    nose.position.set(0, shape.chassisY - 0.05, -1.2);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.02, l * 0.9),
      lambert(palette.accent),
    );
    stripe.position.set(0, top + 0.01, 0);
    body.add(nose, stripe);
  },
} satisfies RacerView;
