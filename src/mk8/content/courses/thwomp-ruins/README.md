# Thwomp Ruins (MK-124)

The Mushroom Cup's fourth course: pack id `thwomp-ruins`, track id `mk8-ruins`. Like the other
courses, its model and collision come from the pack (ADR 0009) and everything here is ours:

- `route.ts`, `materials.ts`: the track editor's format (`/dev/track-editor.html?course=thwomp-ruins`).
- `thwomps.ts`: the Thwomps, `periodic` hazards (`src/sim/hazards/periodic.ts`) with `thwomp` set,
  so they're drawn as Thwomps (`src/render/hazards/thwomp.ts`). Their poses are a pure function of
  the tick; a Thwomp landing on a kart squashes it for `tuning.mk8.squashTime`
  (`src/sim/tuning/mk8/thwomp.ts`), and the AI times them (`meshCrusherSpeedLimit` in
  `src/sim/ai/hazards.ts`).

## Status: traced on the pack (MK-128)

MK-124 was built without the pack; its draft route sat nowhere near the course, so karts started
in mid-air and fell. MK-128 traced `route.ts` on the pack's collision (the start straight, the
courtyard, the temple hall, the flooded channel, the anti-gravity tunnel and spiral, the glide
board over the gap and the jump back onto the straight; the grid on the pack's starting grid).
`materials.ts` is still empty, so the pack's guessed surfaces stand, corrected at load by the
route (`index.ts`'s `surfaceRules`: the channel's road guessed as water, wall-labelled ramps,
trick ramps guessed as glide boards). The course model's own stone Thwomps (`di_DeathDossun`) are
hidden and taken out of the collision (`collisionHoles`); ours (`thwomps.ts`) slam beside the
line on the straight and in the courtyard.

Checks with the pack: `MK8_OUT=<pack> COURSE=thwomp-ruins pnpm mk8:course-check` (5 seeds:
everyone finishes, nobody stuck > 5 s), `MK8=1 MK8_OUT=<pack> pnpm ai-pass`, and
`MK8_OUT=<pack> pnpm test src/mk8/content/courses/thwomp-ruins`.

Still to do with the track editor (not needed to race): fill `materials.ts` and rebuild the pack
with it (`pnpm mk8:build`), which would make the `surfaceRules` corrections unnecessary.

## Scenarios

`mk8-ruins-race`, `mk8-ruins-free`, `mk8-ruins-thwomp` (into the hall), `mk8-ruins-wall` (the
anti-gravity wall and the sunken passage); `mk8-test-thwomp` is the test ramp's Thwomp, no pack.
