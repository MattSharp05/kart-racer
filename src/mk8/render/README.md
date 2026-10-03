# MK8 render

## Course look and ambience (MK-125)

Each MK8 course can have a `look.ts` next to its route (`src/mk8/content/courses/<id>/look.ts`,
default-exporting a `CourseLook`, set as `look` in the course's `index.ts`): sun, fill light, fog,
sky (a gradient, or the model's own sky dome by material), exposure, reflections, bloom, boost
motion blur, glowing materials, water materials and ambient loops. No other file changes.

- `look.ts` applies it when the world builds the course (`TrackView.look`, `render/trackLook.ts`)
  and undoes it when the track changes.
- Full quality: an HDR frame with multisampling → bloom → boost motion blur → ACES tone mapping at
  the course's exposure (`post.ts`), plus glossy reflections from a generated room environment.
  The renderer's stats count every pass, so the perf budgets see the real cost.
- Low quality (`&quality=low`, or adaptive quality on a slow device): the same light, sky, fog and
  water, drawn plainly: no tone mapping, reflections or post-processing.
- `water.ts`: the named water materials become a see-through, glossy material whose ripples (a
  generated slope texture, sampled twice in world space) drift with the tick.
- Ambience (`../audio/ambience.ts`): the loops start with the race, stop on pause and when the
  course is left; a sound placed `at` a point fades out to nothing at `radius`. Every start and
  stop is logged in `window.__mk8Ambience` for e2e tests; `window.__mk8Look()` reports the look.

Mario Kart Stadium's look needs the pack (`?scenario=mk8-stadium-race`, `&quality=low` to
compare). Without it, the look ramp (`mk8-look-ramp`: the test ramp under its own id, with
`courses/test-ramp/look.ts`) carries a look for CI: `mk8-test-look-start`, `-water`, `-boost`
(`tests/e2e/mk8Look.spec.ts`, `tests/visual/mk8Look.visual.spec.ts`).
