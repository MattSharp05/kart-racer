# MK8 asset pipeline (tools only)

Converts raw MK8 Mode source files into web-ready assets (ADR 0009). **It never downloads anything
and never writes into `public/`**: you provide the raw files, it writes to a gitignored folder.
Where the converted assets will be hosted is still open, so nothing it produces is committed.

| Env var   | Default     | What                                            |
| --------- | ----------- | ----------------------------------------------- |
| `MK8_RAW` | `.mk8-raw/` | Raw input you provide (gitignored)              |
| `MK8_OUT` | `.mk8-out/` | Converted output + `manifest.json` (gitignored) |

Both are relative to the repo root unless absolute. Needs Node ≥ 22.18 (runs the `.ts` files directly).

## Models (MK-93)

1. For each entry in `sources.json`, extract its files into `$MK8_RAW/models/<id>/` (the OBJ or DAE
   with its textures beside it). A single `.dae` is used before a single `.obj` (COLLADA keeps the
   skeleton; converted with `assimpjs`); set `"file"` on the entry when the folder has more than one.
   The private `kart-racer-mk8-assets` repo's `unpack.py` does this for every source.
2. `pnpm mk8:build` (`-- --only mario,water-park` for some; `-- --strict` fails if any are missing).
   Each model becomes `<id>.glb` + `<id>-low.glb` (WebP textures ≤ 1024 / 512 px, meshopt
   compression); courses become `models/courses/<id>/course.glb`, `course-low.glb` and
   `collision.bin` (format in `collision.ts`). The build prints a size report per group and
   writes `reports/models.json` (triangles, materials, bytes per model).
3. Courses also get `stubs/courses/<id>/materials.json`: every material with a guessed surface.
   Correct it into `tools/mk8/materials/<id>.json` (used for the collision export when present)
   and the course ticket's `materials.ts`.
4. `pnpm mk8:check`: every manifest file exists with the right size and sha256, and the
   budgets in `budgets.json` hold. Not in CI yet.
5. `pnpm mk8:dae-info`: skins / joints / animations in each racer's `.dae` (can racers animate?).

Builds are deterministic: the same raw files give the same bytes (`pipeline.test.ts`).

## UI sprites (MK-95)

1. Put each sheet from `sources.json` → `sheets` at `$MK8_RAW/<raw>`: an image (e.g.
   `ui/items.png`), or for the zips a folder with the extracted files (`ui/result-backgrounds/`,
   `ui/fonts/`).
2. `pnpm mk8:build` crops every sprite in `spriteSpecs.ts` (grids from the ticket), keys out the
   background of items and cups (flood fill from the corners), resizes and writes WebP to
   `$MK8_OUT/ui/**` (group `ui` in the manifest). It lists sprites whose sheet is missing and any
   whose size differs from `src/mk8/ui/sprites.ts` (the typed id → file, size table the UI uses).
3. Check them on `/dev/mk8-sprites.html` under `pnpm dev`, which serves `$MK8_OUT` at `/mk8/`
   (dev server only; `?base=` points the page elsewhere).

The UI font, M PLUS Rounded 1c (OFL), is not Nintendo's and is committed in `public/mk8/fonts/`.

## Audio (MK-94)

1. For each sound pack in `sources.json` (`"sounds"`), extract its files into
   `$MK8_RAW/sounds/<id>/` (e.g. `sounds/mk8dx-menu/`, `sounds/voice-mario/`).
2. Correct the placeholder `file` names in `src/mk8/audio/soundIds.ts` to the real files in each
   pack (the build lists every one it can't find, and writes them to `reports/audio.json`).
3. `pnpm mk8:build` (`-- --only mk8dx-menu,voice-mario` for some packs). Each sound id becomes
   `audio/<id>.m4a`: AAC, 96 kbps, mono (the star music stays stereo), leading and trailing
   silence trimmed (`tools/mk8/audio.ts`, `ffmpeg-static`; `FFMPEG_PATH` overrides the binary).
   Voice packs: every file whose name matches a voice event in `src/mk8/audio/voiceEvents.ts`
   becomes `audio/voice/<racer>/<name>.m4a`, and `audio/voices.json` maps racer → event → files.
   The build prints each racer's voice gaps (events with no file).
4. `pnpm mk8:check` also fails when a sound in `soundIds.ts` is missing (once any audio is built)
   or all audio together is over `totals["audio/*"]` in `budgets.json` (15 MB).
5. With real audio in `$MK8_OUT`, `pnpm test` checks every sound id resolves and prints the
   voice gaps (`tools/mk8/audio.test.ts`).

Same input, same bytes: the `.m4a` files are written bit-exact (`audio.test.ts`).
`tests/e2e/mk8Audio.spec.ts` decodes a pipeline `.m4a` (`tests/e2e/fixtures/mk8-sine.m4a`, a
synthesized sine) with `decodeAudioData` in every browser project, Safari included.
