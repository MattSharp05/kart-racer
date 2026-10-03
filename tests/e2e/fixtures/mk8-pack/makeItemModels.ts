// Writes the fixture pack's item models (MK-103): one small synthetic GLB per MK8 item model id, in
// the pack's layout (`models/items/<id>.glb`, group `items`) and its quirks (top along −Z, the item
// box's glass at opacity 0, the red shell coloured like the green one), and adds them to
// `manifest.json`. No Nintendo files: plain coloured shapes. Run: `node <this file>`.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';

const PACK = import.meta.dirname;
const GROUP = 'items';

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
  // MK-113.
  'blue-shell': () => ({
    geometry: new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    colour: [0.15, 0.35, 0.95],
  }),
  'super-horn': () => ({
    geometry: new THREE.ConeGeometry(0.8, 1.6, 10),
    colour: [0.95, 0.75, 0.1],
  }),
};

/** One shape as a GLB, turned so its top is along −Z (as the pack's DAE conversions are). */
async function glb(shape: Shape): Promise<Uint8Array> {
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
  return new NodeIO().writeBinary(doc);
}

interface Entry {
  path: string;
  bytes: number;
  sha256: string;
  group: string;
}

const manifestPath = join(PACK, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version: 1; files: Entry[] };
const entries: Entry[] = [];
mkdirSync(join(PACK, 'models', 'items'), { recursive: true });
for (const [id, make] of Object.entries(SHAPES)) {
  const path = `models/items/${id}.glb`;
  const bytes = await glb(make());
  writeFileSync(join(PACK, path), bytes);
  entries.push({
    path,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    group: GROUP,
  });
}
const written = new Set(entries.map((e) => e.path));
manifest.files = [...manifest.files.filter((e) => !written.has(e.path)), ...entries].sort((a, b) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
);
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${entries.length} item models`);
