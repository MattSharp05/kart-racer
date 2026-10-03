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
