# 0010 — Mesh tracks: collision from course meshes plus an authored route

Status: Proposed · 2026-10-02 · amends [ADR 0003](0003-track-as-data.md)

## Context

ADR 0003 makes a track a spline with widths: the sim asks the spline for ground height and walls, and the render mesh is generated from the same data. MK8 courses are the other way round: a detailed artist mesh (about 30–100k triangles) with loops, banked walls, anti-gravity sections, water and glide gaps, and no collision data in the download. Physics, laps, AI and respawn still need to agree on where the road is.

## Decision

A new track kind, `kind: 'mesh'`, beside `'arena'` and `'spline'`:

- **Collision mesh:** built by the asset pipeline from the course OBJ. Triangles are classified by their material into surfaces (`road`, `offroad`, `boost`, `wall`, `water`, `antigrav`, `glide`, `void`, `ignore`) using a per-course material map (`src/mk8/content/courses/<id>/materials.ts`). Decoration triangles (trees, crowd, sky) are dropped, and the rest are simplified to about 10–25k triangles. It's stored as a compact binary (`collision.bin`: Float32 positions, Uint8 surface per triangle) with a uniform 3D grid index.
- **Sim queries** (`sim/meshTrack.ts`, pure TS): `groundAt(position, up)` casts along −up and returns the hit point, surface and normal. There's also `wallContact(position, radius)` and `inWater(position)`. Same inputs, same answer (no `Math.random`, fixed iteration order).
- **Route:** a hand-authored 3D Catmull-Rom centreline with an up vector per point. It drives race progress (`lap + t`), lap gates and checkpoints, respawn points, the AI racing line, item-box rows, coin lines, the start grid, glide-ramp zones and water volumes. It reuses `splineTrack`'s parametrisation for progress only, never for ground height.
- **Authoring:** a dev-only track editor (`/dev/track-editor.html`) shows the real course mesh. You click to place route points, gates, item boxes, coins and grid slots and to paint zones. It exports `route.ts` and shows the material classification as colours so mistakes are visible.
- The render uses the course GLB. The sim never sees it.

## Consequences

- Existing spline tracks are untouched. `groundAt` and friends dispatch on `kind`.
- The collision mesh ships with the pack (about 0.5–1.5 MB per course) and is loaded before a race. Both sides of an online race load the same file (hash in the manifest; a mismatch blocks the race).
- Query cost has a budget: 8 karts × ground + wall queries < 0.3 ms per tick (perf test), so the grid size is tuned per course.
- Every MK8 course costs authoring time in the editor, about one ticket each.

## Amendment (2026-10-09, MK-123 round 2): collision from the course model

Sweet Sweet Canyon's deployed `collision.bin` was built from the material-name guesses (the soda's surface solid road, the road under it water, the "…Blight" roads dropped), and Matthew asked for a code fix instead of a pack rebuild. A course may now set `collisionFromModel` (its `materials.ts`) on its `Mk8CourseContent`: as it loads, the client builds its collision from the course GLB's triangles (`src/mk8/content/courses/modelCollision.ts`) with the pipeline's rules (map, name guesses for unlisted materials, `ignore` dropped), the same 4 m grid, then the usual route surfaces and 3× scale.

- **Deterministic and quality-free:** meshopt decoding is exact and the node transforms are applied in doubles, rounded to float32 once; the full and `-low` GLBs are encoded from one geometry, so both give the same mesh (pinned by `tools/mk8/modelCollision.test.ts`), and a page loads only the model it draws.
- **Not simplified:** meshoptimizer stays a dev dependency. The budget holds on a generated 300k-triangle course (`modelCollision.perf.test.ts`: 8 karts' 5 rays + wall ≈ 0.1 ms per tick, built in ≈ 0.4 s at load). Real courses keep fewer after their `ignore` materials.
- **Online:** a room's hash for such a course is its model's hash mixed with its material map (both decide the ground).
- Other courses keep `collision.bin`. A `materials.ts` change on a `collisionFromModel` course needs no pack rebuild.
