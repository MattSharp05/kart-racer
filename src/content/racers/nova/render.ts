import * as THREE from 'three';
import type { RacerView } from '../render';

/** Points on Nova's star-shaped hull. */
const STAR_POINTS = 5;
const STAR_OUTER = 0.8;
const STAR_INNER = 0.36;

/** A flat five-pointed star in the XZ plane, `thickness` tall, one point facing forward (−Z). */
function starGeometry(outer: number, inner: number, thickness: number): THREE.BufferGeometry {
  const star = new THREE.Shape();
  for (let i = 0; i < STAR_POINTS * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (STAR_POINTS * 2)) * Math.PI * 2;
    if (i === 0) star.moveTo(Math.sin(a) * r, Math.cos(a) * r);
    else star.lineTo(Math.sin(a) * r, Math.cos(a) * r);
  }
  const geometry = new THREE.ExtrudeGeometry(star, { depth: thickness, bevelEnabled: false });
  // Shape +Y → −Z (forward), extrusion +Z → +Y (up).
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export default {
  id: 'nova',
  colours: { body: 0x7b2cbf, accent: 0xffc300, driver: 0xf1e4ff },
  alternateBodies: [0x5a189a, 0xe0aaff],
  shape: {
    chassis: [0.85, 0.3, 1.4],
    chassisY: 0.4,
    frontRadius: 0.25,
    rearRadius: 0.27,
    frontZ: -0.62,
    rearZ: 0.62,
    wheelX: 0.64,
    driverY: 0.88,
    driverZ: 0.15,
  },
  details({ body, shape, palette, lambert }) {
    // Little space kart: a star-shaped hull, a glowing gold ring round the cockpit, a halo ring
    // behind and an antenna with a star on top.
    const [, h] = shape.chassis;
    const top = shape.chassisY + h / 2;
    const gold = lambert(palette.accent);
    const glow = lambert(0xfff3b0);
    const hull = new THREE.Mesh(starGeometry(STAR_OUTER, STAR_INNER, 0.12), lambert(palette.body));
    hull.position.y = shape.chassisY - 0.08;
    // A small gold star on the nose.
    const badge = new THREE.Mesh(starGeometry(0.16, 0.07, 0.04), gold);
    badge.position.set(0, top, -0.45);
    body.add(hull, badge);
    // Saturn ring round the cockpit, tilted a little.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 4, 20), glow);
    ring.rotation.set(Math.PI / 2 - 0.2, 0, 0);
    ring.position.set(0, shape.driverY - 0.12, shape.driverZ);
    // A standing halo ring behind the driver.
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 4, 16), gold);
    halo.position.set(0, top + 0.35, 0.55);
    body.add(ring, halo);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 4), gold);
    antenna.position.set(0.3, top + 0.17, 0.4);
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), glow);
    tip.position.set(0.3, top + 0.4, 0.4);
    body.add(antenna, tip);
  },
} satisfies RacerView;
