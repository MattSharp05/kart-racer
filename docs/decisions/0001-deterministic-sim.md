# 0001 — Deterministic, pure simulation separate from rendering

Status: Accepted · 2026-09-23

## Context

We need reproducible states for scenario links, reliable e2e tests without real-time waits, and a path to online multiplayer (v2) where lockstep/rollback needs determinism.

## Decision

`src/sim/` is a pure step function on plain-JSON state at a fixed 60 Hz timestep, using a seeded RNG (mulberry32) and our own small vector math. It never touches Three.js, the DOM, `Math.random` or wall-clock time. Rendering interpolates between sim states. AI and humans both feed `InputFrame`s into the same step.

## Consequences

- Same seed + inputs ⇒ same state; tests can step N ticks and assert exactly.
- Scenarios are just functions returning a `SimState`.
- Slight duplication: sim math vs Three.js math types (converted at the render boundary).
- Floating-point determinism holds within one browser/engine; cross-engine determinism (for v2 netcode) will need re-checking.
