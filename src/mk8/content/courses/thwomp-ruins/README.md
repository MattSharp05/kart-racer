# Thwomp Ruins (MK-124)

The Mushroom Cup's fourth course: pack id `thwomp-ruins`, track id `mk8-ruins`. Like the other
courses, its model and collision come from the pack (ADR 0009) and everything here is ours:

- `route.ts`, `materials.ts`: the track editor's format (`/dev/track-editor.html?course=thwomp-ruins`).
- `thwomps.ts`: the Thwomps, `periodic` hazards (`src/sim/hazards/periodic.ts`) with `thwomp` set,
  so they're drawn as Thwomps (`src/render/hazards/thwomp.ts`). Their poses are a pure function of
  the tick; a Thwomp landing on a kart squashes it for `tuning.mk8.squashTime`
  (`src/sim/tuning/mk8/thwomp.ts`), and the AI times them (`meshCrusherSpeedLimit` in
  `src/sim/ai/hazards.ts`).

## Status: the route is a draft

MK-124 was built without the pack (the builder couldn't read it). `route.ts` lays out the lap's
parts (start straight, the Thwomp hall, the curved anti-gravity wall, the sunken passage under
water) as a plausible loop, but it isn't traced on the course's collision mesh, `materials.ts` is
empty and the Thwomps stand in the draft's hall, not at MK8's spots. Unit tests and CI drive it on
a stand-in mesh made from the route itself (`../routeRibbon.ts`).

To finish it with the pack:

1. `MK8_OUT=<pack> pnpm dev`, open `/dev/track-editor.html?course=thwomp-ruins`, trace the
   centreline, gates, grid, item boxes, coins, anti-gravity zone and water volumes on the mesh,
   fix the material map, and export over `route.ts` / `materials.ts`.
2. Move the Thwomps in `thwomps.ts` onto the real ones (positions, footprint, `lift`).
3. `pnpm mk8:build` with the new `materials.ts`, then `COURSE=thwomp-ruins pnpm mk8:course-check`
   (5 seeds: everyone finishes, nobody stuck > 5 s; the crush counts column is the AI's Thwomp
   record) and `MK8_OUT=<pack> pnpm test:e2e tests/e2e/mk8Ruins.spec.ts` (budgets, 3 laps).

## Scenarios

`mk8-ruins-race`, `mk8-ruins-free`, `mk8-ruins-thwomp` (into the hall), `mk8-ruins-wall` (the
anti-gravity wall and the sunken passage); `mk8-test-thwomp` is the test ramp's Thwomp, no pack.
