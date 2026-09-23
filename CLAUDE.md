# Kart Racer

A low-poly 3D arcade kart racer that runs in the browser on desktop (keyboard/gamepad) and mobile (touch, landscape), in the spirit of Mario Kart but with original characters and naming. MVP: one track, 4 karts, 1 player vs 7 AI, drift mini-turbos and 6 items (mushroom, banana, green/red shell, star, lightning). Static site on Vercel, no backend. Online multiplayer is v2.

## Workflow

Follows the `dev-workflow` skill (ticket-driven: Notion → branch → PR → QA → merge).

- Notion project page: https://www.notion.so/3e424983f3ca8171ad9bffbdee9cedf1
- Tickets data source: collection://36312bfb-9682-471e-85e4-08a7034a4ff2 (ID prefix: MK)
- Epics data source: collection://2445fc6b-0619-46c1-b0cb-59003f6b0325
- GitHub: MattSharp05/kart-racer
- Preview URLs: Vercel preview per PR (link is on the PR); production: _TBD (set by MK-4)_
- QA mode: batched (batch plan: waves 1–5 → 6–7 → 8–10 → 11–14; checkpoints MK-5, MK-10, MK-14)

## Stack

TypeScript (strict) · Vite · Three.js · in-house arcade physics (no physics engine) · plain DOM/CSS UI · Howler.js audio · pnpm · Vitest · Playwright · ESLint + Prettier · GitHub Actions · Vercel. Details and reasons: [docs/TDD.md](docs/TDD.md); decisions: [docs/decisions/](docs/decisions/).

## Commands

_Created by MK-1/MK-3/MK-4 — keep this list current._
- Setup: Node 22, `pnpm install` (`pnpm-workspace.yaml` installs native bindings for arm64 + x64, because the local pnpm may run under Rosetta)

- `pnpm dev` — dev server (LAN-exposed for phone testing)
- `pnpm build` / `pnpm preview`
- `pnpm lint` · `pnpm typecheck` · `pnpm format`
- `pnpm test` — unit (Vitest)
- `pnpm test:e2e` — Playwright (all projects) · `pnpm test:visual` — screenshot tests
- `pnpm check` — everything CI runs (lint, typecheck, unit, build, e2e)

## Structure

- `src/sim/` — pure deterministic simulation (60 Hz fixed step, seeded RNG, plain-JSON state). Tunables in `sim/tuning.ts`, data in `sim/data/`.
- `src/render/` Three.js · `src/input/` keyboard/gamepad/touch → `InputFrame` · `src/ui/` DOM HUD/menus · `src/audio/` Howler
- `src/game/` loop, app state machine, `window.__game` test API
- `src/scenarios/` scenario registry · `dev.html` + `src/dev/` = `/dev` index
- `tests/e2e/` Playwright specs · `docs/` TDD, ADRs, CREDITS

## Conventions

- `src/sim/**` must not import `three`, DOM, input/render/ui/audio, nor use `Math.random`/`Date` (lint-enforced). Use `sim/rng.ts`.
- No magic numbers in logic — tunables go in `sim/tuning.ts` or data files.
- Units: metres, seconds, radians; +Y up; heading 0 faces −Z.
- Render/UI/audio only read `SimState` and `SimEvent`s; they never mutate sim state.
- New dependency or architectural change → `/block-ticket` and record an ADR.

## Testing

- Scenario rule: every testable state reachable via `/?scenario=<name>[&seed=][&paused=1]`, listed at `/dev`. Add scenarios in `src/scenarios/`.
- E2E: load a scenario, `__game.pause()`, `__game.setInput(...)`, `__game.step(n)`, assert on `__game.getState()` — never sleep/wait on real time for gameplay.
- Every sim change gets Vitest unit tests; keep the determinism test passing.
- Playwright projects: desktop-chrome, desktop-webkit, iphone-landscape, pixel-landscape, ipad. Visual baselines are generated in CI (Docker), not locally.
- Definition of Done: see the `dev-workflow` skill.
