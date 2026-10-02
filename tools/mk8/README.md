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

1. For each entry in `sources.json`, extract its files into `$MK8_RAW/models/<id>/` (the OBJ with its
   MTL and textures beside it; set `"obj"` on the entry if the folder has more than one OBJ).
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
