# MK8 fixture pack (MK-97)

A tiny stand-in for the local-only MK8 pack (ADR 0009), in the format `pnpm mk8:build` writes
(`tools/mk8/manifest.ts`). No Nintendo files. `tests/e2e/mk8.ts` serves it at `/mk8/` with
Playwright route interception, so the loader's e2e tests run in CI, which never has the real pack.

## Generated (MK-142)

Everything here comes from the spec files in `specs/`, one per family, and `manifest.json` is
written from all of them. Never edit the manifest by hand: change or add a spec, then run

    node tests/e2e/fixtures/mk8-pack/make.ts           # writes the models and manifest.json
    node tests/e2e/fixtures/mk8-pack/make.ts --check   # what's out of date, if anything

`tools/mk8/fixturePack.test.ts` (in `pnpm test`) fails when the committed files or manifest differ
from what the specs make.

- `specs/racers.ts` (MK-101): a block figure per MK8 racer id (two materials, a skeleton named
  like a real rig's: `Hip`, `Spine1`/`2`, `Head`, `ClavicleL`, `Arm1L`, `Arm2L`, `HandL`, `Leg1L`,
  `Leg2L`, `FootL`, …, in the T-pose the real racers come in; the game seats it, round 2); Peach
  fully transparent like the real conversion (MK-136).
- `specs/karts.ts` (MK-101, MK-102): the Standard Kart's body and tires, copying the real pack's
  quirks `src/mk8/render/racerModel.ts` handles (MK-136: skinned, quantized meshes; the tire model
  as the set of four, each with an overlay layer on the same geometry; physical materials; a white
  glow on the tires; transparent paint), then 5 bodies, 3 tires and 3 gliders.
- `specs/npcs.ts` (MK-101): Lakitu on his cloud.
- `specs/items.ts` (MK-103, MK-112, MK-113, MK-114, MK-126): one plain shape per MK8 item model id, with the real pack's
  quirks the loader fixes (top along −Z, the item box's glass at opacity 0, the red shell coloured
  like the green one).
- `specs/trophies.ts` (MK-130): the `trophies` model as two block cups, the Mushroom Cup's node
  named `mushroom-cup` (the podium picks it).
- `specs/static.ts` (MK-97, MK-117): committed files made elsewhere, listed for the manifest: two
  solid-colour 64 px WebP tiles (`sharp`), the synthesized sine from `../mk8-sine.m4a` as a menu
  sound and Mario's select voice line, and `audio/voices.json`.
- `specs/gltf.ts`: the shared shapes, materials and skins, and the `FixtureFile` type.

## Adding a family

Create `specs/<family>.ts` default-exporting its files, then run `make.ts`:

```ts
// The fixture pack's courses (MK-xxx): a flat test course. Group `course/test`.
import { box, glb, material, newDoc, primitive, scene, type FixtureFile } from './gltf.ts';

function course() {
  const doc = newDoc();
  const mesh = doc
    .createMesh('course')
    .addPrimitive(primitive(doc, [box([0, 0, 0], [40, 0.2, 40])], material(doc, [0.4, 0.4, 0.4])));
  scene(doc, doc.createNode('course').setMesh(mesh));
  return doc;
}

const files: FixtureFile[] = [
  { path: 'courses/test/model.glb', group: 'course/test', make: () => glb(course()) },
];
export default files;
```

Specs run in plain Node (type stripping), so relative imports keep their `.ts` extension. A file
made some other way goes in `static.ts` (or its own spec) without `make`.
