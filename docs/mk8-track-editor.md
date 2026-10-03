# MK8 track editor

A dev page for authoring an MK8 course's route on top of its collision mesh (MK-100, [ADR 0010](decisions/0010-mesh-tracks.md)): the centreline, the AI racing line, lap gates, respawn points, the grid, item boxes, coins and zones. It exports `src/mk8/content/courses/<id>/route.ts` (pure data, ours to commit) and the course's material overrides, `materials.ts`. Desktop only.

The real courses need the local MK8 pack (ADR 0009: never committed or deployed). `test-ramp`, the synthetic course built in code, works anywhere, including CI and production (`/dev/track-editor.html?course=test-ramp`).

## Authoring a course

1. **Build the pack and start the dev server.** `pnpm mk8:build` (or point `MK8_OUT` at an existing build), then `MK8_OUT=<pack> pnpm dev`. Open `http://localhost:5173/dev/track-editor.html?course=<id>`, e.g. `?course=mario-kart-stadium`. The editor loads `models/courses/<id>/collision.bin` and `course.glb` from `/mk8/`, plus the course's committed `route.ts` and `materials.ts` if they exist.
2. **Check the surfaces.** Tick _Collision (by surface)_ and compare it with the course model: road grey, offroad green, boost orange, wall red, water blue, anti-gravity cyan, glide purple, void black. Hovering shows the material under the pointer and the surface it maps to. Fix a wrong material in the _Materials_ list, then _Save materials.ts_ and run `pnpm mk8:build` again so `collision.bin` picks it up (the overrides win over the name guesses).
3. **Lay the route.** Layer _1 Route_. Click along the middle of the road in driving order, starting on the finish line (the first point is the start/finish, drawn white), about every 10–20 m and closer in tight turns. Points snap to the collision surface and take its normal as `up`, so walls, loops and anti-gravity sections need no extra work. Clicking with a point selected inserts after it; with nothing selected (Esc) the point goes where it falls along the lap. Drag a point to move it, drag its blue handles to set the road width, Del deletes, Ctrl+Z / Ctrl+Shift+Z undo and redo.
4. **Close the loop.** Come back round to the first point. Once there are four points the route is drawn as the spline the race will use (white centreline, blue road edges), and everything else can be placed along it.
5. **Racing line.** Layer _2_. Click beside a point to move the AI line there (or drag the selected point's yellow handle); the yellow line shows the result. Leave it on the centreline where that's fine.
6. **Gates and respawns.** Layer _3_: click across the road to add lap gates (checkpoints) in driving order; the finish line is gate 1 at t = 0. Layer _4_: click where karts should be put back after a fall, then set `from`/`to` in the side panel to the stretch of lap the respawn covers.
7. **Grid, item boxes, coins.** Layer _5_: click 8 slots, pole first, or _Auto grid_ (two by two behind the line). Layer _6_: click to drop a row of 4 item boxes across the road (edit the laterals in the panel). Layer _7_: click a coin line's start and end, then set the count or the spacing in metres.
8. **Zones.** Layer _8_, pick the kind: _Glide ramp_ and _Anti-gravity section_ take two clicks (start and end along the route), _Water volume_ two opposite corners (the box reaches `3 m` under the lower one; adjust `min`/`max` in the panel), _Boost bumper_ one click.
9. **Clear the problems list.** The side panel lists everything that would break a race: fewer than 4 points, a route that doesn't come back to the start, gates out of order or missing the finish line, respawns or grid slots not over a drivable surface, not exactly 8 grid slots, items outside the lap. Clicking a problem switches to its layer.
10. **Export and drive.** _Save to src/mk8/content/courses/<id>/route.ts_ (dev server only; formatted with Prettier) or _Download_ / _Copy_ it into place. _Test drive_ opens `?scenario=mk8-<id>-free&editorRoute=1`; the scenario reads the unsaved route with `loadEditorRoute` (`src/mk8/editorRoute.ts`). Courses with content have a free-drive scenario (MK-105: Mario Kart Stadium's is `mk8-stadium-free`); for others the link has nothing to open yet. Commit `route.ts` and `materials.ts` with the course ticket, then check the course with `pnpm mk8:course-check` (`COURSE=<id>`).

## Good to know

- `materials.ts` only takes effect when the pack is rebuilt (`pnpm mk8:build`), so the game also corrects a course's surfaces from its route when it registers the course (`src/sim/routeSurfaces.ts`): road inside an _Anti-gravity section_ zone becomes anti-gravity, level ground beside the road offroad, upright faces beside it and anything hanging low over it walls. Route widths should follow the road's real edges for that (MK-105).
- A _Glide ramp_ zone launches karts level off its lip until gliders arrive (MK-106); put it over the glide board.
- A glide that has to reach higher ground (MK-123: Sweet Sweet Canyon's, from the tunnel up to the giant cake) needs a `landing` on its glide zone: the lap fraction it is carried to (`tuning.mk8.glideAim`). The editor keeps it; set it in `route.ts` (the panel doesn't show it yet). Cover the flight with a respawn range that puts karts back past the landing.

- Unsaved work is kept per course in the browser (it survives a reload); _Discard draft_ goes back to the committed file (undoable).
- Camera: drag to orbit, right-drag to pan, wheel to zoom, WASD to fly and Q/E down/up (Shift is faster), F frames the whole course.
- The dev server only overwrites files the editor generated (they start with `// Generated by the track editor`), so `test-ramp`'s hand-written `route.ts` is download-only.
- Positions are snapped to the millimetre and lap fractions to 1e-5 when placed; the export writes numbers exactly, so loading an export and exporting again gives the same file.
- `window.__editor` is the e2e test API (`tests/e2e/trackEditor.spec.ts`).
