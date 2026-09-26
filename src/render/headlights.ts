import * as THREE from 'three';

/** Headlight colour (warm white), and how bright the pool of light on the road is (0..1). */
const HEADLIGHT = { colour: 0xfff1c8, pool: 0.5 };

let material: THREE.MeshBasicMaterial | undefined;

/**
 * One texture for both parts of a headlight (MK-60): the left half is two glowing lamp blobs, the
 * right half a pool of light fading away from the lamps.
 */
function headlightMaterial(): THREE.MeshBasicMaterial {
  if (material) return material;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    for (const x of [18, 46]) {
      const blob = ctx.createRadialGradient(x, 32, 0, x, 32, 18);
      blob.addColorStop(0, 'rgba(255,255,255,1)');
      blob.addColorStop(0.3, 'rgba(255,255,255,0.7)');
      blob.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = blob;
      ctx.fillRect(0, 0, 64, 64);
    }
    // The pool: brightest at the bottom edge (next to the lamps), fading forwards and sideways.
    const pool = ctx.createRadialGradient(96, 64, 0, 96, 64, 64);
    pool.addColorStop(0, `rgba(255,255,255,${HEADLIGHT.pool})`);
    pool.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = pool;
    ctx.fillRect(64, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  material = new THREE.MeshBasicMaterial({
    color: HEADLIGHT.colour,
    map: texture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return material;
}

/**
 * Headlights as sprites (MK-60, night tracks): a glow over the two lamps and a pool of light on the
 * road ahead, in one mesh and one draw, no real light. Built at the origin facing −Z (heading 0);
 * `front` is how far forward the lamps are, `lampY` their height, `width` the vehicle's width and
 * `reach` how far ahead the pool goes, m.
 */
export function createHeadlights(front: number, lampY: number, width: number, reach: number) {
  const g = width * 0.65;
  const gy = width * 0.4;
  const z = -front - 0.05;
  const far = -front - reach;
  // prettier-ignore
  const positions = [
    // The glow: an upright quad just in front of the lamps.
    -g, lampY - gy, z,   g, lampY - gy, z,   g, lampY + gy, z,   -g, lampY + gy, z,
    // The pool: a trapezoid on the road, widening ahead.
    -width * 0.6, 0.06, z,   width * 0.6, 0.06, z,   width * 1.4, 0.06, far,   -width * 1.4, 0.06, far,
  ];
  // prettier-ignore
  const uvs = [0, 0, 0.5, 0, 0.5, 1, 0, 1,   0.5, 0, 1, 0, 1, 1, 0.5, 1];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  // The glow faces forwards (−Z) only, so it can't be seen through the kart from behind.
  geometry.setIndex([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7]);
  const mesh = new THREE.Mesh(geometry, headlightMaterial());
  mesh.name = 'headlights';
  // Drawn after the opaque scene, like the other glows.
  mesh.renderOrder = 1;
  return mesh;
}
