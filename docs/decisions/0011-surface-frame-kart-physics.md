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
