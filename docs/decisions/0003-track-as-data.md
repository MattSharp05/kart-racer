# 0003 — Tracks defined as spline data; mesh generated from data

Status: Accepted · 2026-09-23

## Context

Physics, lap progress, AI and rendering all need to agree on where the road is. Hand-modelled track meshes would need a separate collision/progress representation.

## Decision

A track is a TypeScript data file: closed Catmull-Rom centreline with per-point width, surface zones, walls, checkpoints, jump, shortcut, item boxes, grid slots and AI racing line. Sim queries it directly; `render/trackMesh.ts` generates road, off-road, walls and markings from the same data. Decorative scenery may be added separately.

## Consequences

- One source of truth; new tracks are data, not art pipeline work.
- Track shapes limited to what a spline + width can express (fine for MVP; tunnels/loops later if needed).
