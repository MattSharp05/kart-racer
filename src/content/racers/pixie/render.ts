import * as THREE from 'three';
import type { RacerView } from '../render';

export default {
  id: 'pixie',
  colours: { body: 0xffc300, accent: 0xff70a6, driver: 0xffe5ec },
  alternateBodies: [0xc77dff, 0x80ed99],
  shape: {
    chassis: [1.05, 0.35, 1.8],
    chassisY: 0.38,
    frontRadius: 0.26,
    rearRadius: 0.28,
    frontZ: -0.7,
    rearZ: 0.72,
    wheelX: 0.66,
    driverY: 0.9,
    driverZ: 0.2,
  },
  details({ body, shape, palette, lambert }) {
    // Pointy nose cone and a little bow on the driver.
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 12), lambert(palette.body));
    nose.rotation.x = -Math.PI / 2;
    // Tip at −1.45 m = the physics footprint's front edge.
    nose.position.set(0, shape.chassisY, -1.05);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.05, 8, 16), lambert(palette.accent));
    bow.position.set(0, shape.driverY + 0.35, shape.driverZ);
    body.add(nose, bow);
  },
} satisfies RacerView;
