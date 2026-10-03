// MK8 course water (MK-125): the course model's water materials (by name, the course's `look.ts`)
// swapped for a glossy, see-through material whose ripples drift with the tick. The ripples are a
// small generated slope texture sampled twice in world space (so they don't depend on the model's
// UVs) and bend the surface normal: the sun's highlight and, at full quality, the reflections ripple.
import * as THREE from 'three';
import type { CourseLook } from '../content/courses/types';

type WaterLook = NonNullable<CourseLook['water']>;

/** The ripple texture's size, texels, and the waves summed into it (whole cycles across it). */
const RIPPLE_SIZE = 64;
const WAVES: readonly [number, number, number][] = [
  [1, 2, 0.3],
  [3, -1, 1.7],
  [-2, 3, 4.1],
  [5, 4, 2.6],
  [-6, 1, 5.3],
];
/** How much the ripples tilt the surface. */
const RIPPLE_STRENGTH = 0.35;
/** The second ripple layer: finer, and drifting at right angles to the first, slower. */
const SECOND_SCALE = 1.37;
const SECOND_SPEED = 0.8;
const ROUGHNESS = 0.08;

/** Drift of every water surface, in ripple tiles (one clock: all courses' water moves together). */
const waterTime = { value: 0 };
let rippleTexture: THREE.DataTexture | undefined;

/** A tileable texture of a wavy height field's slopes (x, z) packed into red and green. */
export function rippleSlopes(size = RIPPLE_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  let max = 0;
  const slopes: number[] = [];
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      let dx = 0;
      let dz = 0;
      for (const [kx, kz, phase] of WAVES) {
        const c = Math.cos((2 * Math.PI * (kx * x + kz * z)) / size + phase);
        dx += kx * c;
        dz += kz * c;
      }
      slopes.push(dx, dz);
      max = Math.max(max, Math.abs(dx), Math.abs(dz));
    }
  }
  slopes.forEach((s, i) => {
    const texel = Math.floor(i / 2);
    data[texel * 4 + (i % 2)] = Math.round(((s / max + 1) / 2) * 255);
  });
  for (let i = 0; i < size * size; i += 1) {
    data[i * 4 + 2] = 255;
    data[i * 4 + 3] = 255;
  }
  return data;
}

function ripples(): THREE.DataTexture {
  if (!rippleTexture) {
    rippleTexture = new THREE.DataTexture(rippleSlopes(), RIPPLE_SIZE, RIPPLE_SIZE);
    rippleTexture.wrapS = THREE.RepeatWrapping;
    rippleTexture.wrapT = THREE.RepeatWrapping;
    rippleTexture.magFilter = THREE.LinearFilter;
    rippleTexture.minFilter = THREE.LinearMipmapLinearFilter;
    rippleTexture.generateMipmaps = true;
    rippleTexture.needsUpdate = true;
  }
  return rippleTexture;
}

/** The water material for `source` (its texture kept), in the course's water colour. */
export function waterMaterial(
  source: THREE.Material,
  water: WaterLook,
): THREE.MeshStandardMaterial {
  const map = source instanceof THREE.MeshStandardMaterial ? source.map : null;
  const seeThrough = water.opacity < 1;
  const material = new THREE.MeshStandardMaterial({
    name: source.name,
    color: water.colour,
    map,
    roughness: ROUGHNESS,
    metalness: 0,
    transparent: seeThrough,
    opacity: water.opacity,
    depthWrite: !seeThrough,
    side: source.side,
  });
  const scale = { value: water.scale };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = waterTime;
    shader.uniforms.uWaterScale = scale;
    shader.uniforms.uWaterRipples = { value: ripples() };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec2 vWaterXZ;\nvoid main() {')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n\tvWaterXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        [
          'varying vec2 vWaterXZ;',
          'uniform float uWaterTime;',
          'uniform float uWaterScale;',
          'uniform sampler2D uWaterRipples;',
          'void main() {',
        ].join('\n'),
      )
      .replace(
        '#include <normal_fragment_maps>',
        [
          '#include <normal_fragment_maps>',
          '{',
          '\tvec2 p = vWaterXZ / uWaterScale;',
          '\tvec2 a = texture2D( uWaterRipples, p + vec2( uWaterTime, 0.0 ) ).xy * 2.0 - 1.0;',
          `\tvec2 b = texture2D( uWaterRipples, p * ${SECOND_SCALE.toFixed(2)} + vec2( 0.0, uWaterTime * ${SECOND_SPEED.toFixed(2)} ) ).xy * 2.0 - 1.0;`,
          `\tvec2 slope = ( a + b ) * ${RIPPLE_STRENGTH.toFixed(2)};`,
          '\tnormal = normalize( ( viewMatrix * vec4( normalize( vec3( - slope.x, 1.0, - slope.y ) ), 0.0 ) ).xyz );',
          '}',
        ].join('\n'),
      );
  };
  material.customProgramCacheKey = () => 'mk8-water';
  material.userData.mk8Water = true;
  return material;
}

/**
 * Swaps the water materials under `roots` for animated water (once per source material: a course
 * model's copies share it). Returns how many meshes were changed.
 */
export function applyWater(roots: readonly THREE.Object3D[], water: WaterLook): number {
  const names = new Set(water.materials);
  const made = new Map<THREE.Material, THREE.Material>();
  let count = 0;
  const swap = (material: THREE.Material): THREE.Material => {
    if (material.userData.mk8Water === true || !names.has(material.name)) return material;
    let replaced = made.get(material) ?? cached.get(material);
    if (!replaced) {
      replaced = waterMaterial(material, water);
      cached.set(material, replaced);
    }
    made.set(material, replaced);
    count += 1;
    return replaced;
  };
  for (const root of roots) {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
  }
  return count;
}

/** Water made for a course material, kept for the next race on the course (its model is too). */
const cached = new WeakMap<THREE.Material, THREE.Material>();

/** Moves every water surface's ripples to tick `ticks` (fractional): `flow` m/s over `scale` m. */
export function setWaterTime(ticks: number, water: WaterLook, ticksPerSecond: number): void {
  waterTime.value = ((ticks / ticksPerSecond) * water.flow) / water.scale;
}

/** The ripple clock (tests). */
export function waterClock(): number {
  return waterTime.value;
}
