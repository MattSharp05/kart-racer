# Kart Racer

A low-poly 3D arcade kart racer that runs in the browser on desktop (keyboard) and mobile (touch, landscape), in the spirit of Mario Kart but with original characters and naming. MVP: one track, 4 karts, 1 player vs 7 AI, drift mini-turbos and 6 items (mushroom, banana, green/red shell, star, lightning). Static site on Vercel, no backend. Online multiplayer is v2.

## Workflow

Follows the `dev-workflow` skill (ticket-driven: Notion → branch → PR → QA → merge).

- Notion project page: https://www.notion.so/3e424983f3ca8171ad9bffbdee9cedf1
- Tickets data source: collection://36312bfb-9682-471e-85e4-08a7034a4ff2 (ID prefix: MK)
- Epics data source: collection://2445fc6b-0619-46c1-b0cb-59003f6b0325
- GitHub: MattSharp05/kart-racer
- Preview URLs: Vercel preview per PR (link is on the PR); production: https://kart-racer-alpha.vercel.app (scenario index at `/dev`)
- QA mode: batched, **no waves or QA stops (v2)**: the orchestrator builds in dependency order (Wave = order only) until every v2 ticket is QA Pending, then Matthew QAs on the ticket pages. Priority: the online chain (spike → net core → prediction → race flow → polish) first. _MVP history: waves 1–5 → 6–7 → 8–10 → 11–14; checkpoints MK-5, MK-10, MK-14._
- Approval: standing (the v2 plan was approved at epic level on 2026-09-25; stop only at blocks)
- Parallel builders: 2
- Before a run: the **Cloud preflight** in `dev-workflow` (Notion write test from a child session must pass). If the workflow skills aren't listed, read them from a claude-workflow clone (`plugins/workflow/skills/`) and tell builders to do the same.
- v2 scope: [PRD v2](https://app.notion.com/p/3e524983f3ca812d85b8e778602f94e1) · design: `docs/TDD.md` → "v2" + ADRs 0005–0007

## Stack

TypeScript (strict) · Vite · Three.js · in-house arcade physics (no physics engine) · plain DOM/CSS UI · Web Audio (synthesized) · pnpm · Vitest · Playwright · ESLint + Prettier · GitHub Actions · Vercel · **v2:** Supabase (Realtime for rooms/signaling, Postgres for leaderboards) + WebRTC data channels for race packets. Details and reasons: [docs/TDD.md](docs/TDD.md); decisions: [docs/decisions/](docs/decisions/).

## Commands

_Created by MK-1/MK-3/MK-4 — keep this list current._

- Setup: Node 22, `pnpm install` (`pnpm-workspace.yaml` installs native bindings for arm64 + x64, because the local pnpm may run under Rosetta)

- `pnpm dev` — dev server (LAN-exposed for phone testing)
- `pnpm build` / `pnpm preview`
- `pnpm lint` · `pnpm typecheck` · `pnpm format`
- `pnpm test` — unit (Vitest) · `pnpm test:perf` — perf budgets (`*.perf.test.ts`), run alone so timings are stable
- `pnpm test:e2e` — Playwright (all projects) · `pnpm test:visual` — screenshot tests (chromium, run in CI's Docker image) · `scripts/update-visual-baselines.sh` — regenerate baselines locally with Docker
- `pnpm test:soak` — opt-in netcode runs (MK-73): 10-race browser soak at `net-bad` + 4×-throttled phone check per track; run alone, in CI's Playwright image · `pnpm net:sweep` — netcode tuning sweep (`scripts/netSweep.lab.ts`, minutes of CPU)
- `pnpm check` — everything CI runs (lint, typecheck, unit, build, e2e)

## Structure

- `src/sim/` — pure deterministic simulation (60 Hz fixed step, seeded RNG, plain-JSON state). Tunables in `sim/tuning.ts`, data in `sim/data/`.
- `src/render/` Three.js · `src/input/` keyboard/touch → `InputFrame` · `src/ui/` DOM HUD/menus · `src/audio/` Web Audio synth
- `src/game/` loop, app state machine, `window.__game` test API
- `src/scenarios/` scenario registry · `dev.html` + `src/dev/` = `/dev` index
- `src/content/` (v2, ADR 0007) — tracks, racers and items, one folder each. **To add one:** create `src/content/<tracks|racers|items>/<id>/` (folder name = id) with `sim.ts` (pure data/logic, sim lint rules; default-exports a `TrackContent`/`RacerContent`/`ItemContent`) and, for racers and items, `render.ts` (may import three; default-exports a `RacerView`/`ItemView`: model, colours, icon, sound, renderer), then add one line to that kind's list in `index.ts` (and `render.ts`); copy an existing folder as the template. No other shared file changes; ids are plain strings checked at lookup, and `registries.test.ts` fails if a folder isn't listed. **Track looks and hazards (MK-49):** a track's `theme` (sky, fog, light, palette, scenery set, night) and its `def.hazards[]` (`mover` · `rotator` · `periodic` · `zoneEffect`, poses a pure function of tick, kinds in `src/sim/hazards/`, views in `src/render/hazards/`) and surface zones (`ice` · `sand` · `conveyor`, effects in `src/sim/surfaces.ts`); `tracks/hazard-test/` is the worked example. A track folder may also have `scenarios.ts` (default-exports `Scenario[]`; one line in `tracks/scenarios.ts`), a `render.ts` (default-exports a `TrackView` whose `scenery()` replaces the theme's scenery set; one line in `tracks/render.ts`), and a zone hazard can take `warning` (HUD text 3 s before it starts) and `dust` (MK-58); `tracks/dune-canyon/` is the full example. MK-59 added a `mover` with an open path (`activeFraction`: runs now and then, gone in between) drawn as a rolling ball (`rolling`: shadow + rumble), and `TrackView.update(scenery, ticks, camera)` for moving scenery (falling snow); `tracks/frostpeak-pass/` uses both. Items build on the item framework (MK-52): `uses`, kart `effects` (`sim/items/effects.ts`), general `entities` (`sim/items/entities.ts`: straight/homing/returning/area + collision rules), `aiUse`, and in the view `sounds`, `entityModel`/`effectModel` (`renderer: ItemEntityRenderer`) and HUD `overlays`; `items/test-kit/` is the worked example (`?scenario=item-framework-test`).
- `src/net/` (v2) transport (WebRTC · loopback · BroadcastChannel), binary protocol, rooms, host/client netcode · `supabase/migrations/` SQL schema
- `tests/e2e/` Playwright specs · `docs/` TDD, ADRs, CREDITS

## Conventions

- `src/sim/**` must not import `three`, DOM, input/render/ui/audio, nor use `Math.random`/`Date` (lint-enforced). Use `sim/rng.ts`.
- No magic numbers in logic — tunables go in `sim/tuning.ts` or data files.
- Units: metres, seconds, radians; +Y up; heading 0 faces −Z.
- Render/UI/audio only read `SimState` and `SimEvent`s; they never mutate sim state.
- `src/net/**` may import `sim/` types but never `render/`/`ui/`. Online races: the host is authoritative (ADR 0005); clients never decide hits, pickups or finishes.
- Screens live in `src/ui/screens/` with their own CSS; content (tracks, racers, items) registers itself (ADR 0007) — don't add cases to shared switches.
- New dependency or architectural change → `/block-ticket` and record an ADR.

## Testing

- Scenario rule: every testable state reachable via `/?scenario=<name>[&seed=][&paused=1]`, listed at `/dev` (`/dev.html` locally). Add scenarios in `src/scenarios/<group>.ts` and register them in `src/scenarios/index.ts`.
- Handling feel: `?tune=1` opens a live tuning panel (lil-gui, lazy-loaded) editing `src/sim/tuning.ts` values; "Copy values as JSON" to report numbers.
- E2E helpers in `tests/e2e/helpers.ts`: `loadScenario`, `pause`, `setInput`, `step`, `getState`. First run: `pnpm exec playwright install chromium webkit`.
- E2E: load a scenario, `__game.pause()`, `__game.setInput(...)`, `__game.step(n)`, assert on `__game.getState()` — never sleep/wait on real time for gameplay.
- Online (MK-46): `/?scenario=online-race-2p&net=local&role=host|client&room=<id>[&netsim=<rtt>,<jitter>,<loss%>][&laps=n]` races tabs of one browser over BroadcastChannel (no server). E2E: `openRoom(browser, n)` + `stepAll(pages, ticks)` from `tests/e2e/online.ts`, `__game.net()` for role/kart/RTT/snapshot tick; online specs run on the desktop projects only. `&netdebug=1` shows the net debug overlay (RTT, loss, re-sim, corrections); client smoothing / remote-kart mode live in `tuning.net` (`?tune=1` → Online).
- Every sim change gets Vitest unit tests; keep the determinism test passing.
- Playwright projects: desktop-chrome, desktop-webkit, iphone-landscape, pixel-landscape, ipad. Visual baselines are generated in CI (Docker), not locally.
- Definition of Done: see the `dev-workflow` skill.
