# 0002 — In-house arcade kart physics (no physics engine)

Status: Accepted · 2026-09-23

## Context
The PRD's top priority is handling feel (drift + mini-turbo). Rigid-body engines (Rapier, cannon-es) simulate realism, then need fighting to feel arcade-y, and complicate determinism.

## Decision
Write a bespoke kart model: speed along heading with acceleration/drag curves, steering rate scaled by speed, lateral grip, drift state machine, gravity + ground snapping against track height queries, and simple circle-vs-circle (kart–kart) and circle-vs-edge (walls) collisions. All constants in `sim/tuning.ts`.

## Consequences
- Full control over feel; tunable live via a dev tuning panel.
- We own collision edge cases (tunnelling at high speed → sub-step or swept checks).
- No realistic tumbling/rolling — acceptable for an arcade racer.
