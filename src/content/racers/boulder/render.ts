import * as THREE from 'three';
import type { RacerView } from '../render';

export default {
  id: 'boulder',
  colours: { body: 0x2b59c3, accent: 0x14213d, driver: 0xc9ada7 },
  alternateBodies: [0x6c757d, 0x3a0ca3],
  shape: {
    chassis: [1.45, 0.6, 2.0],
    chassisY: 0.55,
    frontRadius: 0.33,
    rearRadius: 0.38,
    frontZ: -0.72,
    rearZ: 0.66,
    wheelX: 0.7,
    driverY: 1.2,
    driverZ: 0.3,
  },
  details({ body, shape, palette, lambert }) {
    // Heavy front bumper and a roll cage.
    const [w, h] = shape.chassis;
    const top = shape.chassisY + h / 2;
    const accent = lambert(palette.accent);
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.25, 0.25), accent);
    bumper.position.set(0, shape.chassisY - 0.1, -1.3);
    const cage = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 16, Math.PI), accent);
    cage.position.set(0, top, shape.driverZ + 0.35);
    body.add(bumper, cage);
  },
} satisfies RacerView;
