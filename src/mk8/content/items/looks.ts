// Shared looks of MK8's triple items (MK-112) for our HUD and for races without a pack: SVG icons
// with one shell, banana or mushroom per use left, and the stand-in models of circling shells and
// trailing bananas (with a pack, the `mk8` item skin draws them with the pack's models).
import * as THREE from 'three';

/** Where the icon's copies sit for 1, 2 and 3 left (64 × 64 viewBox), and their scale. */
const SPOTS: readonly (readonly [number, number])[][] = [
  [],
  [[32, 32]],
  [
    [18, 32],
    [46, 32],
  ],
  [
    [18, 40],
    [46, 40],
    [32, 18],
  ],
];
const SCALE = 0.55;

/** `body` (an SVG drawn for the whole 64 × 64 box) once per use left, smaller, up to three. */
export function tripleIcon(body: string, uses: number): string {
  const spots = SPOTS[Math.max(1, Math.min(3, uses))] ?? [];
  return spots
    .map(
      ([x, y]) =>
        `<g transform="translate(${x - 32 * SCALE} ${y - 32 * SCALE}) scale(${SCALE})">${body}</g>`,
    )
    .join('');
}

/** A stand-in shell: a dome in `colour` (our shells' look). */
export function shellModel(colour: string): THREE.Object3D {
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.45, flatShading: true }),
  );
}

/** A stand-in banana: a yellow partial torus (our bananas' look). */
export function bananaModel(): THREE.Object3D {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.45, 0.16, 6, 10, Math.PI * 0.9),
    new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.6, flatShading: true }),
  );
  mesh.rotation.z = Math.PI;
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

// MK-113: the Spiny Shell, its explosion and the Super Horn's shockwave, for races without a pack
// (the explosion and shockwave are drawn this way with a pack too: the pack has no models for them).

/** A stand-in Spiny Shell: a blue dome with white spikes and a pair of white wings. */
export function spinyModel(): THREE.Object3D {
  const group = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({
    color: '#2f6fe4',
    roughness: 0.4,
    flatShading: true,
  });
  const white = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.5,
    flatShading: true,
  });
  group.add(
    new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), blue),
  );
  for (let i = 0; i < 6; i += 1) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 5), white);
    const a = (i / 6) * Math.PI * 2;
    spike.position.set(Math.cos(a) * 0.38, 0.42, Math.sin(a) * 0.38);
    spike.lookAt(Math.cos(a) * 2, 1.6, Math.sin(a) * 2);
    spike.rotateX(Math.PI / 2);
    group.add(spike);
  }
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.35), white);
    wing.position.set(side * 0.8, 0.25, 0);
    wing.rotation.z = side * 0.4;
    group.add(wing);
  }
  return group;
}

/** The Spiny Shell's explosion: an orange fireball inside a blue shock ring, unit size. */
export function explosionModel(): THREE.Object3D {
  const group = new THREE.Group();
  group.add(
    new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: '#ffb02e', transparent: true, opacity: 0.85 }),
    ),
  );
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.08, 6, 24),
    new THREE.MeshBasicMaterial({ color: '#5fa8ff', transparent: true, opacity: 0.9 }),
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  return group;
}

/** The fireball's size at its biggest, as a share of the blast's reach (the chase camera stays out). */
const FIREBALL_SHARE = 0.7;

/** Grows the explosion over `age` ticks of `life` towards `radius` m, fading as it goes. */
export function animateExplosion(model: THREE.Object3D, age: number, life: number, radius: number) {
  const k = Math.min(1, age / Math.max(1, life));
  model.scale.setScalar(radius * FIREBALL_SHARE * (0.4 + 0.6 * Math.sqrt(k)));
  model.traverse((node) => {
    if (node instanceof THREE.Mesh && node.material instanceof THREE.MeshBasicMaterial) {
      node.material.opacity = 0.9 * (1 - k * k);
    }
  });
}

/** The Super Horn's shockwave: a flat ring, unit radius. */
export function waveModel(): THREE.Object3D {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1, 32),
    new THREE.MeshBasicMaterial({
      color: '#ffe066',
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  const group = new THREE.Group();
  group.add(ring);
  return group;
}
