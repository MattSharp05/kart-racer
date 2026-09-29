import * as THREE from 'three';
import type { RacerView } from '../render';

/** Petals on the flower spoiler. */
const PETALS = 5;

export default {
  id: 'juniper',
  colours: { body: 0x52b788, accent: 0xff8fab, driver: 0xfff1e6 },
  alternateBodies: [0x90be6d, 0x2a9d8f],
  shape: {
    chassis: [1.15, 0.34, 1.9],
    chassisY: 0.4,
    frontRadius: 0.28,
    rearRadius: 0.3,
    frontZ: -0.72,
    rearZ: 0.72,
    wheelX: 0.68,
    driverY: 0.92,
    driverZ: 0.25,
  },
  details({ body, shape, palette, lambert }) {
    // Leafy forest kart: a leaf nose, leaves along the flanks and a flower for a spoiler.
    const [w, h] = shape.chassis;
    const top = shape.chassisY + h / 2;
    const leaf = lambert(0x2d6a4f);
    const petal = lambert(palette.accent);
    const leafGeometry = new THREE.SphereGeometry(1, 8, 4);
    const nose = new THREE.Mesh(leafGeometry, leaf);
    nose.scale.set(0.42, 0.12, 0.45);
    nose.position.set(0, shape.chassisY + 0.02, -0.95);
    body.add(nose);
    for (const side of [-1, 1]) {
      for (const z of [-0.15, 0.2]) {
        const sideLeaf = new THREE.Mesh(leafGeometry, leaf);
        sideLeaf.scale.set(0.05, 0.14, 0.25);
        sideLeaf.rotation.x = 0.35;
        sideLeaf.position.set(side * (w / 2 + 0.03), shape.chassisY + 0.08, z);
        body.add(sideLeaf);
      }
    }
    // Flower spoiler: a stem, petals round a yellow middle, facing backwards.
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.45, 5), leaf);
    stem.position.set(0, top + 0.22, 0.8);
    const centreY = top + 0.5;
    const middle = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), lambert(0xffd166));
    middle.position.set(0, centreY, 0.84);
    body.add(stem, middle);
    for (let i = 0; i < PETALS; i += 1) {
      const angle = (i / PETALS) * Math.PI * 2;
      const p = new THREE.Mesh(leafGeometry, petal);
      p.scale.set(0.2, 0.1, 0.04);
      p.rotation.z = angle;
      p.position.set(Math.cos(angle) * 0.2, centreY + Math.sin(angle) * 0.2, 0.8);
      body.add(p);
    }
  },
} satisfies RacerView;
