import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import stadium from '../content/courses/mario-kart-stadium';
import { materials as stadiumMaterials } from '../content/courses/mario-kart-stadium/materials';
import testRampLook from '../content/courses/test-ramp/look';
import type { CourseLook } from '../content/courses/types';
import { LOOK_RAMP_ID as SCENARIO_LOOK_RAMP } from '../../scenarios/mk8/look';
import { createSimState } from '../../sim/state';
import { LOOK_RAMP_ID } from '../courses';
import { boosting, createCourseLook } from './look';

/** A course look with a sky dome (no gradient: that needs a canvas). */
const LOOK: CourseLook = {
  ...testRampLook,
  sky: { materials: ['sky'], colour: 0x88ccff },
  glow: { materials: ['lamp'], intensity: 0.7 },
  ambience: [],
};

/** The renderer fields a low-quality look touches (no WebGL in unit tests). */
function stubRenderer(): THREE.WebGLRenderer {
  return {
    toneMapping: THREE.LinearToneMapping,
    toneMappingExposure: 0.9,
  } as unknown as THREE.WebGLRenderer;
}

function course(): THREE.Group {
  const group = new THREE.Group();
  const box = new THREE.BoxGeometry();
  const mesh = (name: string, map?: THREE.Texture) =>
    new THREE.Mesh(box, new THREE.MeshStandardMaterial({ name, ...(map && { map }) }));
  group.add(mesh('sky'), mesh('lamp', new THREE.Texture()), mesh('road'), mesh('mesh-water'));
  return group;
}

function setUp() {
  const renderer = stubRenderer();
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight();
  const fill = new THREE.HemisphereLight();
  scene.add(sun, fill);
  const model = course();
  scene.add(model);
  const look = createCourseLook(LOOK, {
    renderer,
    scene,
    camera: new THREE.PerspectiveCamera(),
    objects: [model],
    lowQuality: true,
    reducedMotion: false,
  });
  const material = (name: string) => {
    let found: THREE.Material | undefined;
    model.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.material as THREE.Material).name === name)
        found = o.material as THREE.Material;
    });
    return found!;
  };
  return { renderer, scene, sun, fill, look, material };
}

describe('MK8 course look (MK-125)', () => {
  it('lights the scene in the course’s sun, fill, fog and sky', () => {
    const { scene, sun, fill } = setUp();
    expect(sun.color.getHex()).toBe(LOOK.sun.colour);
    expect(sun.intensity).toBe(LOOK.sun.intensity);
    expect(sun.position.clone().normalize().y).toBeGreaterThan(0.5);
    expect(fill.intensity).toBe(LOOK.fill.intensity);
    expect(scene.fog).toBeInstanceOf(THREE.Fog);
    expect((scene.background as THREE.Color).getHex()).toBe(0x88ccff);
  });

  it('keeps the sky dome out of the fog, makes lamps glow and swaps the water', () => {
    const { material } = setUp();
    expect((material('sky') as THREE.MeshStandardMaterial).fog).toBe(false);
    const lamp = material('lamp') as THREE.MeshStandardMaterial;
    expect(lamp.emissiveMap).toBe(lamp.map);
    expect(lamp.emissiveIntensity).toBe(0.7);
    expect((material('road') as THREE.MeshStandardMaterial).emissiveIntensity).toBe(1);
    const water = material('mesh-water') as THREE.MeshStandardMaterial;
    expect(water.userData.mk8Water).toBe(true);
    expect(water.transparent).toBe(true);
    expect(water.opacity).toBe(LOOK.water!.opacity);
  });

  it('draws plainly at low quality: no tone mapping, reflections or post-processing', () => {
    const { renderer, scene, look } = setUp();
    expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
    expect(renderer.toneMappingExposure).toBe(1);
    expect(scene.environment).toBeNull();
    expect(look.render?.()).toBe(false);
  });

  it('puts the renderer and the sun back when the track changes', () => {
    const { renderer, sun, look } = setUp();
    look.dispose();
    expect(sun.position.toArray()).toEqual([0, 1, 0]);
    expect(renderer.toneMapping).toBe(THREE.LinearToneMapping);
    expect(renderer.toneMappingExposure).toBe(0.9);
  });

  it('counts mushrooms, mini-turbos and spin boosts as boosting', () => {
    const [kart] = createSimState({
      seed: 1,
      trackId: 'test-pad',
      karts: [{ position: { x: 0, y: 0, z: 0 }, heading: 0 }],
    }).karts;
    expect(boosting(kart)).toBe(false);
    expect(boosting(kart && { ...kart, boostTimer: 1 })).toBe(true);
    expect(boosting(kart && { ...kart, spinBoostTimer: 1 })).toBe(true);
    expect(boosting(undefined)).toBe(false);
  });

  it('Mario Kart Stadium: its glowing materials are the course’s', () => {
    expect(stadium.look).toBeDefined();
    for (const name of stadium.look?.glow?.materials ?? [])
      expect(Object.keys(stadiumMaterials), name).toContain(name);
    expect(stadium.look?.ambience.map((a) => a.sound)).toEqual([
      'course/mario-kart-stadium/ambience',
    ]);
  });

  it('the look scenarios drive the look ramp (their copy of its id is the same)', () => {
    expect(SCENARIO_LOOK_RAMP).toBe(LOOK_RAMP_ID);
  });
});
