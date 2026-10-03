import * as THREE from 'three';
import { MESH_SURFACES, type CollisionMesh, type MeshSurface } from '../sim/meshTrack';

/** Colour per mesh surface: anti-gravity cyan, like the MK-92 spike page. */
const SURFACE_COLOURS: Record<MeshSurface, number> = {
  road: 0x6b6f78,
  offroad: 0x4f9a3a,
  boost: 0xff9b1a,
  wall: 0xd8d8e0,
  water: 0x2f7fd8,
  antigrav: 0x2ad4ff,
  glide: 0xc070ff,
  void: 0x101010,
};

/** Baked light: faces turned this way are brightest; any face is at least `MIN_SHADE` bright. */
const LIGHT = new THREE.Vector3(0.4, 1, 0.6).normalize();
const MIN_SHADE = 0.62;

/**
 * A mesh track's collision mesh, drawn coloured by surface (MK-99): what you drive on until the MK8
 * course renderer draws the course's own model. Shading is baked per face from either side (an
 * anti-gravity ceiling seen from below stays cyan, not lit by the sky's ground colour), and every
 * other triangle is a touch darker, so the tessellation shows. Water is see-through. Two draws.
 */
export function createCollisionMeshView(mesh: CollisionMesh): THREE.Group {
  const group = new THREE.Group();
  group.name = 'collision-mesh';
  const water = MESH_SURFACES.indexOf('water');
  for (const seeThrough of [false, true]) {
    const tris: number[] = [];
    mesh.surfaces.forEach((s, t) => {
      if ((s === water) === seeThrough) tris.push(t);
    });
    if (tris.length === 0) continue;
    const positions = new Float32Array(tris.length * 9);
    const colours = new Float32Array(tris.length * 9);
    const colour = new THREE.Color();
    tris.forEach((t, i) => {
      positions.set(mesh.positions.subarray(t * 9, t * 9 + 9), i * 9);
      colour.setHex(SURFACE_COLOURS[MESH_SURFACES[mesh.surfaces[t] ?? 0] ?? 'road']);
      const n = mesh.normals;
      const facing = Math.abs(
        (n[t * 3] ?? 0) * LIGHT.x + (n[t * 3 + 1] ?? 0) * LIGHT.y + (n[t * 3 + 2] ?? 0) * LIGHT.z,
      );
      colour.multiplyScalar((MIN_SHADE + (1 - MIN_SHADE) * facing) * (t % 2 ? 0.92 : 1));
      for (let v = 0; v < 3; v += 1) colours.set([colour.r, colour.g, colour.b], i * 9 + v * 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      ...(seeThrough ? { transparent: true, opacity: 0.45, depthWrite: false } : {}),
    });
    group.add(new THREE.Mesh(geometry, material));
  }
  return group;
}
