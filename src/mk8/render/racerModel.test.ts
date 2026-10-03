import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import mario from '../content/racers/mario/render';
import peach from '../content/racers/peach/render';
import { STANDARD_PARTS, mk8Body, mk8Tires } from '../content/parts';
import {
  KART_BODY_PATH,
  KART_TIRE_PATH,
  Mk8RacerModel,
  parseGlb,
  racerModelPath,
  dropLayers,
  singleTire,
  uprightBody,
} from './racerModel';

// MK-136: the fixture pack's kart parts copy the real pack's quirks (`makeModels.ts`): skinned,
// quantized meshes, the tire model as the set of four with overlay layers, physical materials, a
// white glow on the tires and fully transparent paint. Parsed here as on the stage.
const KART_LENGTH = mk8Body(STANDARD_PARTS.body).length;
const TIRE_DIAMETER = mk8Tires(STANDARD_PARTS.tires).diameter;
const PACK = new URL('../../../tests/e2e/fixtures/mk8-pack/', import.meta.url);
const glb = (path: string) => {
  const bytes = readFileSync(new URL(path, PACK));
  return parseGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};

function materials(root: THREE.Object3D): THREE.Material[] {
  const out = new Set<THREE.Material>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) for (const m of [o.material].flat()) out.add(m);
  });
  return [...out];
}

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
}

async function model(view = mario): Promise<Mk8RacerModel> {
  const [racer, body, tire] = await Promise.all([
    glb(racerModelPath(view)),
    glb(KART_BODY_PATH),
    glb(KART_TIRE_PATH),
  ]);
  return new Mk8RacerModel(view, { racer, body, tire });
}

const boxOf = (o: THREE.Object3D) => {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o);
};

describe('MK8 racer model with the real pack’s quirks (MK-136)', () => {
  it('draws the converted materials as solid, unlit-by-glow standard ones', async () => {
    for (const path of [KART_BODY_PATH, KART_TIRE_PATH, racerModelPath(peach)]) {
      for (const m of materials(await glb(path))) {
        expect(m, path).toBeInstanceOf(THREE.MeshStandardMaterial);
        expect(m, path).not.toBeInstanceOf(THREE.MeshPhysicalMaterial);
        expect(m.transparent, path).toBe(false);
        expect(m.opacity, path).toBe(1);
        expect((m as THREE.MeshStandardMaterial).emissive.getHex(), path).toBe(0);
      }
    }
  });

  it('seats the racer in a kart of the right size, on four tires under its corners', async () => {
    const racer = await model();
    const kart = racer.object.getObjectByName('kart')!;
    const tires = meshes(kart).filter((m) => m.name.startsWith('TireK_'));
    // The four tires, overlay layers dropped, merged into one plain mesh.
    expect(tires).toHaveLength(1);
    expect(tires[0]).not.toBeInstanceOf(THREE.SkinnedMesh);
    const wheels = boxOf(tires[0]!);
    expect(wheels.min.y).toBeCloseTo(0, 2);
    expect(wheels.max.y).toBeCloseTo(TIRE_DIAMETER, 2);
    const body = boxOf(kart.children[0]!);
    expect(body.max.z - body.min.z).toBeCloseTo(KART_LENGTH, 2);
    // The tires stand out a little at the sides, within the body's length.
    expect(wheels.max.x).toBeGreaterThan(body.max.x * 0.8);
    expect(wheels.min.x).toBeLessThan(body.min.x * 0.8);
    expect(wheels.max.z - wheels.min.z).toBeLessThan(KART_LENGTH);
    expect(wheels.max.z - wheels.min.z).toBeGreaterThan(KART_LENGTH / 2);
    // The whole racer stays kart-sized (a skinned tire clone drew the full-size set at the origin).
    const all = boxOf(racer.object).getSize(new THREE.Vector3());
    expect(Math.max(all.x, all.z)).toBeLessThan(KART_LENGTH * 1.5);
    expect(all.y).toBeLessThan(mario.height + 1);
  });

  it('a tire model of one tire stays whole', () => {
    const tire = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    tire.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4), material));
    tire.add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05), material));
    expect(meshes(singleTire(tire))).toHaveLength(2);
  });

  it('drops overlay layers: meshes on the same geometry as an earlier one', () => {
    const body = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 0.5, 2);
    body.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ name: 'm_Body' })));
    body.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ name: 'm_Body_001' })));
    const decal = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.2));
    decal.position.set(0, 0.3, 0.8);
    body.add(decal);
    dropLayers(body);
    expect(meshes(body).map((m) => (m.material as THREE.Material).name)).toEqual(['m_Body', '']);
  });

  it('stands a Z-up body upright, nose (+Y) to glTF forward (+Z); leaves a Y-up one alone', () => {
    // Z-up: 1 wide, 2.5 long along +Y (its nose at +Y), 0.6 tall along Z.
    const zUp = new THREE.Mesh(new THREE.BoxGeometry(1, 2.5, 0.6).translate(0, 0.5, 0.3));
    const upright = boxOf(uprightBody(zUp)).getSize(new THREE.Vector3());
    expect(upright.x).toBeCloseTo(1);
    expect(upright.y).toBeCloseTo(0.6);
    expect(upright.z).toBeCloseTo(2.5);
    // Its longer end (the nose) now points +Z.
    expect(boxOf(uprightBody(zUp.clone())).max.z).toBeCloseTo(1.75);
    const yUp = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 2.5));
    expect(uprightBody(yUp)).toBe(yUp);
  });
});
