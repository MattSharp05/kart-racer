import * as THREE from 'three';
import type { RacerView } from '../render';

export default {
  id: 'blaze',
  colours: { body: 0xd62828, accent: 0xf77f00, driver: 0xffe8d6 },
  alternateBodies: [0x9b2226, 0x3c096c],
  shape: {
    chassis: [1.2, 0.3, 2.1],
    chassisY: 0.34,
    frontRadius: 0.27,
    rearRadius: 0.33,
    frontZ: -0.82,
    rearZ: 0.72,
    wheelX: 0.72,
    driverY: 0.84,
    driverZ: 0.35,
  },
  details({ body, shape, palette, lambert }) {
    // Sleek speedster: a wedge nose, flame decals down both flanks and twin tail fins.
    const [w, h, l] = shape.chassis;
    const top = shape.chassisY + h / 2;
    const accent = lambert(palette.accent);
    const yellow = lambert(0xfcbf49);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.4, 4), lambert(palette.body));
    nose.rotation.x = -Math.PI / 2;
    nose.scale.set(1, 1, 0.45);
    // Tip at −1.45 m = the physics footprint's front edge.
    nose.position.set(0, shape.chassisY - 0.02, -l / 2 - 0.2);
    body.add(nose);
    // Flame decals: flat tongues licking back from the front wheels, orange over yellow.
    const tongue = new THREE.ConeGeometry(0.09, 0.7, 3);
    tongue.rotateX(Math.PI / 2);
    for (const side of [-1, 1]) {
      [
        { y: 0.07, z: -0.15, length: 1, material: accent },
        { y: -0.06, z: -0.05, length: 0.8, material: yellow },
      ].forEach(({ y, z, length, material }) => {
        const flame = new THREE.Mesh(tongue, material);
        flame.scale.set(0.25, 1, length);
        flame.position.set(side * (w / 2 + 0.01), shape.chassisY + y, z);
        body.add(flame);
      });
    }
    // Twin tail fins joined by a low wing.
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.42), accent);
      fin.rotation.x = -0.35;
      fin.position.set(side * 0.45, top + 0.16, l / 2 - 0.3);
      body.add(fin);
    }
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.28), accent);
    wing.position.set(0, top + 0.3, l / 2 - 0.25);
    body.add(wing);
  },
} satisfies RacerView;
