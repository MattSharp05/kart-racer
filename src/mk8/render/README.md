# MK8 render

## Course look and ambience (MK-125)

Each MK8 course can have a `look.ts` next to its route (`src/mk8/content/courses/<id>/look.ts`,
default-exporting a `CourseLook`, set as `look` in the course's `index.ts`): sun, fill light, fog,
sky (a gradient, or the model's own sky dome by material), exposure, bloom, boost
motion blur, glowing materials, water materials and ambient loops. No other file changes.

- `look.ts` applies it when the world builds the course (`TrackView.look`, `render/trackLook.ts`)
  and undoes it when the track changes.
- Full quality (`post.ts`): an HDR frame → bloom (a bright pass and one separable blur over three
  levels from a quarter size) → one composite with the boost motion blur, ACES tone mapping at the
  course's exposure and the output colour space. Three shader programs in all, built on the first
  full-quality frame: compiling shaders is what a course costs to open on a slow GPU or a software
  renderer (UnrealBloom, a PMREM environment and MSAA took a look scenario from 1 s to 6 s in CI's
  sweep). The renderer's stats count every pass, so the perf budgets see the real cost.
- Low quality (`&quality=low`, or adaptive quality on a slow device): the same light, sky, fog and
  water, drawn plainly: no tone mapping or post-processing (nothing for it is even built).
- `water.ts`: the named water materials become a see-through, glossy material whose ripples (a
  generated slope texture, sampled twice in world space) drift with the tick, mirroring the sky at
  a glancing angle (a Fresnel mix: no environment map).
- Ambience (`../audio/ambience.ts`): the loops start with the race, stop on pause and when the
  course is left; a sound placed `at` a point fades out to nothing at `radius`. Every start and
  stop is logged in `window.__mk8Ambience` for e2e tests; `window.__mk8Look()` reports the look.

Mario Kart Stadium, Water Park and Sweet Sweet Canyon each have a `look.ts` (a clear afternoon;
a bright day with lamps and pools; a warm sugary evening with a pink soda lake); they need the pack
(`?scenario=mk8-stadium-race`, `mk8-waterpark-race`, `mk8-canyon-race`, `&quality=low` to
compare). `look.test.ts` checks every glow and water material a look names is in its course's
`materials.ts`. Without it, the look ramp (`mk8-look-ramp`: the test ramp under its own id, with
`courses/test-ramp/look.ts`) carries a look for CI: `mk8-test-look-start`, `-water`, `-boost`
(`tests/e2e/mk8Look.spec.ts`, `tests/visual/mk8Look.visual.spec.ts`).

## Perf (MK-133)

- `courseBatch.ts`: when a course loads (`../courses.ts`), its static meshes are merged by
  material per 120 m cell (`COURSE_CELL_METRES`): a few dozen draws instead of one per GLB
  mesh, and the cells keep frustum culling working. Skinned, instanced, morphing, multi-material
  and mirrored meshes stay as they are. The loaded model's `userData.batch` holds the mesh counts
  before and after.
- The results screen starts loading the cup's next course (`preloadMk8Course`), and a load of a
  course already under way waits for it, so Next doesn't parse the model twice.
- Budgets (TDD v3: < 300 draws, < 400k triangles per frame, desktop):
  `tests/e2e/perfAllTracks.spec.ts` → "MK8 courses" runs `mk8-test-race` with the fixture pack in
  CI at full and low quality; the 4 real courses run only with `MK8_OUT=<pack>`. The throttled
  Pixel 7 check (`tests/soak/phoneAllTracks.spec.ts`, `pnpm test:soak`) has the same MK8 entries.
