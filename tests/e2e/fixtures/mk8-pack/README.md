# MK8 fixture pack (MK-97)

A tiny stand-in for the local-only MK8 pack (ADR 0009), in the format `pnpm mk8:build` writes
(`tools/mk8/manifest.ts`). No Nintendo files: two solid-colour 64 px WebP tiles made with `sharp`
and the synthesized sine from `../mk8-sine.m4a`. `tests/e2e/mk8.ts` serves it at `/mk8/` with
Playwright route interception, so the loader's e2e tests run in CI, which never has the real pack.

MK-103 added `models/items/*.glb`: one plain coloured shape per MK8 item model id, written by
`node tests/e2e/fixtures/mk8-pack/makeItemModels.ts` (which also updates `manifest.json`). They
copy the real pack's quirks the loader fixes: the top along −Z, the item box's glass at opacity 0,
and the red shell coloured like the green one. MK-112 added `golden-mushroom`, MK-113 `blue-shell` and `super-horn`, MK-114 `bob-omb`.

MK-136: `makeModels.ts`'s Standard Kart parts and Peach copy the real pack's quirks that
`src/mk8/render/racerModel.ts` handles (skinned, quantized meshes; the tire model as the set of four
tires, each with an overlay layer on the same geometry; physical materials; a white glow on the
tires; fully transparent paint), so `racerModel.test.ts` and the racer e2e cover them in CI.

MK-117 added `audio/voices.json` and one voice clip for Mario's select line
(`audio/voice/mario/fixture-select.m4a`, the same synthesized sine), in the layout
`pnpm mk8:build` writes for racer voices, so the character select loads its voice lines in CI.
