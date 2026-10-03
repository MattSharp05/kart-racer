# 0011 — Surface-frame kart physics for anti-gravity

Status: Proposed · 2026-10-02 · validated by the v3 anti-gravity spike before the course tickets

## Context

Kart physics today is yaw-only: `heading` around world +Y, gravity along −Y, and height from the track. MK8's anti-gravity sections need karts to drive up walls, along twisting ribbons and upside down, while drifting, items, collisions, AI and the camera keep working. Gliding and underwater need different gravity and drag.

## Decision

- `KartState` gains `up: Vec3` (unit; the ground normal while grounded) and `gravityDir: Vec3`. `heading` stays as the yaw _within the surface plane_, so forward = heading rotated into the plane perpendicular to `up`.
- Every existing step (steer, drift, accelerate, lateral grip, boost) runs in that local frame. With `up = +Y` the maths reduces exactly to today's (a regression test asserts identical state hashes on every v1/v2 track).
- **Gravity follows the surface** only on `antigrav` triangles: the kart sticks to the surface and `up` rotates smoothly towards the new normal (rate in `tuning`). Elsewhere, gravity is world −Y and slopes steeper than a tuning limit act as walls, so you can't drive up ordinary walls.
- **Air:** off the ground, `up` eases back to +Y, except across short anti-gravity gaps, where it holds.
- **Glide:** a `glide` state (entered at glide-ramp zones) with low gravity, lift and steerable pitch. It ends on landing.
- **Water:** inside water volumes, gravity and top speed drop and drag rises (all in `tuning.mk8`).
- **Anti-gravity spin boost:** bumping a kart or bumper while on `antigrav` gives both a short boost (MK8 rule).
- Online: snapshots add `up` (octahedral-quantized, 2 × 16 bits) and the glide/water flags. Protocol version bumps.

## Consequences

- The biggest risk in v3, so it's proved first by a spike on Mario Kart Stadium's anti-gravity section, then a checkpoint where Matthew drives it.
- Camera, kart model, drift sparks, item physics (shells following walls) and AI steering all read `up`. Shells use the same ground query.
- The original game is unaffected beyond the refactor (regression hash test).

## Amendment (MK-99, 2026-10-03): as built

The MK-92 spike showed a heading-in-the-plane state flips upside down (`src/mk8/spike/NOTES.md`,
question 4), so the build follows its proposal:

- **Mesh-track karts store `forward` and `up`** (unit vectors) with `gravityDir` and a latched
  `antigrav` flag, all optional on `KartState`: spline and arena karts never get them and keep
  today's step untouched (`step.ts` dispatches mesh tracks to `sim/surfaceKart.ts`). `heading` is
  kept in step as `forward`'s world yaw, for readers that only need a direction (HUD, minimap,
  AI later). Existing tracks are bit-identical by construction; `sim/regression.test.ts` holds
  every v1/v2 track's 30 s state hash to its value before the change. Old snapshots and the
  online protocol are unchanged (the fields are absent off mesh tracks).
- **Ground:** four wheel rays along −up from `tuning.mk8.probeLift` (2 m, so a wheel ray half-way
  round a sharp 90° corner still starts above the floor) plus a **climb ray** along the direction
  of travel. Ground ahead turned more than `climbAngle` from the kart's plane joins the plane fit
  if it can be climbed (anti-gravity ground, or any ground while in anti-gravity, or plain ground
  under `maxSlope`), which rounds concave corners like the test ramp's floor → wall → ceiling.
  Plain ground steeper than `maxSlope` ahead is a **wall** (pushed back, speed into it removed),
  not a slope the kart slides off. Speed is kept round concave transitions.
- **Anti-gravity is a mode**, as the spike proposed: set by `antigrav` ground under any wheel or
  ahead, cleared when every hit is plain road, boost or glide ground. Gravity is −up in the mode
  (and `antigravAirHold` s into the air), world −Y otherwise. In the air the ground is looked for
  along gravity, and `up` eases back to +Y (rolling about the nose if upside down).
- **Kart bumps** on mesh tracks are measured and pushed in the plane the two karts share (their
  averaged up); karts further apart than `bumpHeight` along it (floor and ceiling) don't touch.
- **Respawn** on mesh tracks: the route's respawn point (or the last safe lap fraction) with the
  route's up there; falls are air time over `fallSeconds`, a kill floor below, or dropping under
  the mesh.
- **Camera:** its up eases towards the kart's (4/s, at most 25° a frame) and it is pulled in front
  of any course surface between it and the kart.
