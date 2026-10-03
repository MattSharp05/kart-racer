// The fixture pack's NPCs (MK-101): Lakitu on his cloud. Group `npcs`.
import type { Document } from '@gltf-transform/core';
import { box, glb, material, newDoc, primitive, scene, type FixtureFile } from './gltf.ts';

function lakitu(): Document {
  const doc = newDoc();
  const cloud = material(doc, [0.97, 0.97, 1]);
  const shell = material(doc, [0.3, 0.7, 0.3]);
  const mesh = doc
    .createMesh('lakitu')
    .addPrimitive(
      primitive(doc, [box([0, 0.2, 0], [1.2, 0.4, 1]), box([0, 0.35, 0], [0.8, 0.3, 1.2])], cloud),
    )
    .addPrimitive(
      primitive(
        doc,
        [box([0, 0.75, 0], [0.5, 0.6, 0.45]), box([0, 1.2, 0.05], [0.4, 0.35, 0.4])],
        shell,
      ),
    );
  scene(doc, doc.createNode('lakitu').setMesh(mesh));
  return doc;
}

const files: FixtureFile[] = [
  { path: 'models/npcs/lakitu.glb', group: 'npcs', make: () => glb(lakitu()) },
];
export default files;
