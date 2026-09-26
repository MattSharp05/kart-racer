import * as THREE from 'three';
import type { RacerView } from '../render';

/** Teeth round each side gear. */
const GEAR_TEETH = 8;

export default {
  id: 'sprocket',
  colours: { body: 0x16897f, accent: 0xd4a23c, driver: 0xc9d3d8 },
  alternateBodies: [0x3d5a80, 0x6a994e],
  shape: {
    chassis: [1.35, 0.55, 1.9],
    chassisY: 0.5,
    frontRadius: 0.3,
    rearRadius: 0.34,
    frontZ: -0.7,
    rearZ: 0.68,
    wheelX: 0.7,
    driverY: 1.12,
    driverZ: 0.3,
  },
  details({ body, shape, palette, lambert }) {
    // Boxy robot mechanic: brass gears on both flanks, an exhaust stack, a grille and an antenna.
    const [w, h, l] = shape.chassis;
    const top = shape.chassisY + h / 2;
    const brass = lambert(palette.accent);
    const dark = lambert(0x3a3a3a);
    for (const side of [-1, 1]) {
      const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10), brass);
      gear.rotation.z = Math.PI / 2;
      gear.position.set(side * (w / 2 + 0.03), shape.chassisY + 0.02, -0.15);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 6), dark);
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(gear.position);
      body.add(gear, hub);
      for (let i = 0; i < GEAR_TEETH; i += 1) {
        const angle = (i / GEAR_TEETH) * Math.PI * 2;
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.08), brass);
        tooth.rotation.x = angle;
        tooth.position.set(
          gear.position.x,
          gear.position.y + Math.cos(angle) * 0.23,
          gear.position.z + Math.sin(angle) * 0.23,
        );
        body.add(tooth);
      }
    }
    // Exhaust stack at the back, with a brass cap.
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.7, 8), dark);
    stack.position.set(0.42, top + 0.3, l / 2 - 0.2);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.1, 8), brass);
    cap.position.set(0.42, top + 0.68, l / 2 - 0.2);
    // Radiator grille on the nose: three brass slats.
    for (const y of [-0.12, 0, 0.12]) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.06, 0.08), brass);
      slat.position.set(0, shape.chassisY + y, -l / 2 - 0.04);
      body.add(slat);
    }
    // Antenna on the robot's head.
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4), dark);
    antenna.position.set(0, shape.driverY + 0.45, shape.driverZ);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), brass);
    bulb.position.set(0, shape.driverY + 0.62, shape.driverZ);
    body.add(stack, cap, antenna, bulb);
  },
} satisfies RacerView;
