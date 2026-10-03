// The fixture pack's item models (MK-103, MK-112): one plain coloured shape per MK8 item model id,
// in the pack's layout (`models/items/<id>.glb`, group `items`) and its quirks the loader fixes:
// the top along −Z, the item box's glass at opacity 0, the red shell coloured like the green one.
import { Document } from '@gltf-transform/core';
import * as THREE from 'three';
import { glb, type FixtureFile } from './gltf.ts';

interface Shape {
  geometry: THREE.BufferGeometry;
  colour: [number, number, number];
  /** The item box's glass: transparent at opacity 0, like the converted DAE. */
  glass?: boolean;
}

const green: [number, number, number] = [0.1, 0.6, 0.15];
const SHAPES: Record<string, () => Shape> = {
  'item-box': () => ({ geometry: new THREE.BoxGeometry(2, 2, 2), colour: [1, 1, 1], glass: true }),
  banana: () => ({
    geometry: new THREE.TorusGeometry(0.8, 0.25, 6, 12, Math.PI),
    colour: [1, 0.85, 0.1],
  }),
  'green-shell': () => ({
    geometry: new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    colour: green,
  }),
  'red-shell': () => ({
    geometry: new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    colour: green,
  }),
  mushroom: () => ({ geometry: new THREE.SphereGeometry(1, 12, 8), colour: [0.9, 0.1, 0.1] }),
  'golden-mushroom': () => ({
    geometry: new THREE.SphereGeometry(1, 12, 8),
    colour: [0.95, 0.7, 0.05],
  }),
  star: () => ({ geometry: new THREE.OctahedronGeometry(1), colour: [1, 0.9, 0.1] }),
  lightning: () => ({ geometry: new THREE.ConeGeometry(0.5, 2, 4), colour: [1, 1, 1] }),
  'boomerang-flower': () => ({
    geometry: new THREE.BoxGeometry(2, 0.3, 0.6),
    colour: [0.1, 0.3, 1],
  }),
  blooper: () => ({ geometry: new THREE.ConeGeometry(0.7, 2, 8), colour: [0.95, 0.95, 0.95] }),
};

/** One shape as a GLB, turned so its top is along −Z (as the pack's DAE conversions are). */
function itemGlb(shape: Shape): Promise<Uint8Array> {
  const rotated = shape.geometry.rotateX(-Math.PI / 2);
  const geometry = rotated.index ? rotated.toNonIndexed() : rotated;
  geometry.computeVertexNormals();
  const doc = new Document();
  const buffer = doc.createBuffer();
  const attribute = (name: string) =>
    doc
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array(geometry.getAttribute(name).array))
      .setBuffer(buffer);
  const material = doc
    .createMaterial()
    .setBaseColorFactor([...shape.colour, shape.glass ? 0 : 1])
    .setAlphaMode(shape.glass ? 'BLEND' : 'OPAQUE');
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', attribute('position'))
    .setAttribute('NORMAL', attribute('normal'))
    .setMaterial(material);
  const mesh = doc.createMesh().addPrimitive(primitive);
  doc.createScene().addChild(doc.createNode('item').setMesh(mesh));
  return glb(doc);
}

const files: FixtureFile[] = Object.entries(SHAPES).map(([id, make]) => ({
  path: `models/items/${id}.glb`,
  group: 'items',
  make: () => itemGlb(make()),
}));
export default files;
