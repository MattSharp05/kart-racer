// The fixture pack's trophies (MK-130): the pipeline's one `trophies` model, here two block cups
// side by side, the Mushroom Cup's node named for it (the podium picks that node). Group `trophies`.
import type { Document } from '@gltf-transform/core';
import { box, glb, material, newDoc, primitive, scene, type FixtureFile } from './gltf.ts';

function trophies(): Document {
  const doc = newDoc();
  const cup = (name: string, x: number, rgb: [number, number, number]) => {
    const metal = material(doc, rgb);
    const mesh = doc
      .createMesh(name)
      .addPrimitive(
        primitive(
          doc,
          [
            box([x, 0.08, 0], [0.7, 0.16, 0.7]),
            box([x, 0.4, 0], [0.16, 0.5, 0.16]),
            box([x, 0.9, 0], [0.8, 0.6, 0.8]),
          ],
          metal,
        ),
      );
    return doc.createNode(name).setMesh(mesh);
  };
  scene(doc, cup('mushroom-cup', 0, [1, 0.8, 0.15]), cup('flower-cup', 1.5, [0.8, 0.8, 0.85]));
  return doc;
}

const files: FixtureFile[] = [
  { path: 'models/trophies/trophies.glb', group: 'trophies', make: () => glb(trophies()) },
];
export default files;
