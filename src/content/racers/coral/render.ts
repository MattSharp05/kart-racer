import * as THREE from 'three';
import type { RacerView } from '../render';

/** Ridges fanning across the scallop-shell spoiler. */
const SHELL_RIBS = 5;
/** How far the shell spoiler leans back, rad. */
const SHELL_LEAN = -0.25;

export default {
  id: 'coral',
  colours: { body: 0xff7b89, accent: 0x48cae4, driver: 0xfff0e6 },
  alternateBodies: [0xe76f51, 0xffafcc],
  shape: {
    chassis: [1.15, 0.32, 1.9],
    chassisY: 0.38,
    frontRadius: 0.27,
    rearRadius: 0.3,
    frontZ: -0.72,
    rearZ: 0.72,
    wheelX: 0.68,
    driverY: 0.88,
    driverZ: 0.2,
  },
  details({ body, shape, palette, lambert }) {
    // Sea creature: a rounded nose, a dorsal fin, fins on both flanks and a scallop shell behind.
    const [w, h] = shape.chassis;
    const top = shape.chassisY + h / 2;
    const shellPaint = lambert(palette.body);
    const aqua = lambert(palette.accent);
    const pearl = lambert(0xfff5f7);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), shellPaint);
    nose.scale.set(0.55, 0.2, 0.45);
    nose.position.set(0, shape.chassisY, -0.95);
    // Dorsal fin on the front deck, swept back.
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 3), aqua);
    dorsal.scale.set(0.3, 1, 1);
    dorsal.rotation.x = 0.5;
    dorsal.position.set(0, top + 0.15, -0.5);
    body.add(nose, dorsal);
    // Pectoral fins: flat, swept back from each flank.
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 3), aqua);
      fin.scale.set(1, 1, 0.25);
      fin.rotation.set(0, side * 0.6, (-side * Math.PI) / 2);
      fin.position.set(side * (w / 2 + 0.12), shape.chassisY, -0.2);
      body.add(fin);
    }
    // Scallop shell spoiler: a half disc standing behind the driver, pearly ribs fanning out.
    const shellGeometry = new THREE.CylinderGeometry(
      0.52,
      0.52,
      0.08,
      12,
      1,
      false,
      Math.PI / 2,
      Math.PI,
    );
    shellGeometry.rotateX(Math.PI / 2);
    const shell = new THREE.Mesh(shellGeometry, shellPaint);
    shell.rotation.x = SHELL_LEAN;
    shell.position.set(0, top + 0.02, 0.72);
    body.add(shell);
    const rib = new THREE.BoxGeometry(0.05, 0.48, 0.1);
    rib.translate(0, 0.24, 0);
    for (let i = 0; i < SHELL_RIBS; i += 1) {
      const angle = ((i + 0.5) / SHELL_RIBS - 0.5) * Math.PI * 0.9;
      const ridge = new THREE.Mesh(rib, pearl);
      ridge.rotation.set(SHELL_LEAN, 0, angle);
      ridge.position.set(0, top + 0.02, 0.72);
      body.add(ridge);
    }
    // A pearl where the ribs meet.
    const pearlBall = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), pearl);
    pearlBall.position.set(0, top + 0.05, 0.72);
    body.add(pearlBall);
  },
} satisfies RacerView;
