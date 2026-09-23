# Technical Design — Kart Racer

Status: Draft · PRD: https://www.notion.so/3e424983f3ca8171ad9bffbdee9cedf1

## Stack

| Choice                                                  | Why                                                                                                                                                               |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript (strict)**                                 | Types catch sim/render mismatches early; every session reads the same contracts.                                                                                  |
| **Vite 8**                                              | Fast dev server, zero-config TS, multi-page build (game + `/dev`).                                                                                                |
| **Three.js (r186)**                                     | Mature WebGL renderer, low-poly friendly, huge docs. No framework wrapper.                                                                                        |
| **No physics engine** — in-house arcade physics         | Kart feel is the #1 goal; hand-tuned arcade model beats rigid-body sims for this and stays deterministic. ([ADR 0002](decisions/0002-in-house-arcade-physics.md)) |
| **Plain DOM + CSS for UI/HUD** (no React)               | A handful of screens; HTML overlays are simpler and cheap on mobile.                                                                                              |
| **Howler.js** for audio                                 | Handles mobile audio unlock, sprites, pooling.                                                                                                                    |
| **pnpm**                                                | Fast, strict dependency resolution.                                                                                                                               |
| **Vitest** (unit), **Playwright** (e2e, mobile, visual) | Standard, fast, share TS config.                                                                                                                                  |
| **ESLint (typescript-eslint) + Prettier**               | Consistent code; lint enforces sim purity (see Conventions).                                                                                                      |
| **GitHub Actions** CI, **Vercel** hosting               | Static site on free tier; preview deploy per PR.                                                                                                                  |

## Architecture

```
 input/ (keyboard, touch) ──► InputFrame (per player, per tick)
                                          │
                                          ▼
 game/loop ── fixed 60 Hz ──► sim/  (pure, deterministic)  ── SimState ──► render/ (Three.js scene, camera, effects)
   │                           karts, track queries, race,              └► ui/ (HUD, menus – DOM)
   │                           items, AI, seeded RNG                    └► audio/ (reads events)
   └─ scenarios/ build initial SimState (seeded)          sim emits SimEvents (boost, hit, lap, finish…)
```

- **sim/** is a pure function of `(state, inputs, dt) → state + events`. Fixed timestep 1/60 s with an accumulator; rendering interpolates between the last two states. Only `Math` + our seeded RNG (`sim/rng.ts`, mulberry32) — never `Math.random`, `Date`, DOM or Three.js scene objects. Vector math uses our small `sim/math.ts` (plain `{x,y,z}` objects) so state is plain JSON (serialisable, snapshot-able, diffable in tests). ([ADR 0001](decisions/0001-deterministic-sim.md))
- **AI** produces an `InputFrame` exactly like a human — AI karts go through the same physics.
- **render/** owns the Three.js scene; it reads `SimState` and `SimEvent`s, never writes sim state. Kart visuals come from a `KartModelFactory` so custom glTF models can replace primitives later.
- **ui/** and **audio/** are also read-only consumers of state/events; UI actions (pause, menu choices) go through `game/` commands.

## Project structure

```
src/
  main.ts            game entry (index.html)
  dev/main.ts        /dev scenario index (dev.html)
  game/              loop, app state machine (title → select → race → results), test API
  sim/               math, rng, kart physics, drift, track queries, race/laps, items, ai
  sim/data/          karts.ts, tracks/sunny-circuit.ts (pure data)
  render/            scene, track mesh builder, kart models, camera, effects
  input/             keyboard, touch → InputFrame
  ui/                hud, menus, rotate prompt (DOM + CSS)
  audio/             sound manager (Howler), event → sound mapping
  scenarios/         registry + one file per group of scenarios
public/audio/        CC0 sounds and music (credits in docs/CREDITS.md)
tests/e2e/           Playwright specs (+ visual snapshots)
docs/                TDD.md, decisions/, CREDITS.md
```

## Data & state

- `SimState`: tick, rng seed/state, race phase (`countdown | racing | finished`), karts[] (pos, vel, heading, speed, drift state, boost timer, item, lap/progress, status effects), item entities (bananas, shells, boxes), race results.
- **Track** is data: closed Catmull-Rom centreline (x,y,z points) + per-segment width, surface zones (road/offroad/boost pad), wall flags, checkpoints, jump ramp, shortcut polygon, item-box rows, grid slots, AI racing line. `sim/track.ts` answers queries: nearest centreline param `t`, lateral offset, surface type, ground height, wall contact. `render/trackMesh.ts` builds geometry from the same data, so visuals and physics never disagree.
- Race progress = `lap + t` (t ∈ [0,1) from checkpoints-validated centreline param); positions sort by progress.
- Persistence: `localStorage` only — best lap/race times per kart+cc, mute setting. Wrapped in try/catch.

## Scenario system

- `src/scenarios/registry.ts` exports `Scenario { name, description, setup(seed): { state: SimState, app?: AppScreen } }`. Groups live in files (`driving.ts`, `race.ts`, `items.ts`, `ui.ts`…).
- URL: `/?scenario=<name>[&seed=123][&paused=1]`. Unknown name → error banner listing valid names.
- `/dev` (`dev.html`) lists every scenario with description and link, grouped, plus a QR code per link for phones.
- Default seed is fixed per scenario, so the same link always produces the same state.
- Every ticket that adds a testable state adds a scenario; e2e tests load the same scenario.
- **Production:** scenarios and `/dev` stay enabled (no users, accounts or payments — nothing to protect), which also lets QA happen on production.

## Testing strategy

- **Unit (Vitest):** all of `sim/` — physics curves, drift tiers, lap counting, item odds, AI steering — run headless by stepping the sim with scripted inputs. Target: every sim module has tests; determinism test (same seed + inputs ⇒ identical state hash).
- **Test API:** `window.__game` (always present; tiny): `getState()`, `pause()`, `resume()`, `step(n)`, `setInput(playerIdx, InputFrame | null)`, `events()`. E2E tests pause, inject inputs, step N ticks, assert on state — no flaky real-time waiting.
- **E2E (Playwright):** load scenarios, drive via test API and real keyboard/touch, assert state + DOM. Projects: `desktop-chrome`, `desktop-webkit`, `iphone-landscape` (WebKit, iPhone 15), `pixel-landscape` (Chromium, Pixel 7), `ipad`.
- **Mobile:** layout fits viewport, no overflow/scroll, touch controls hit targets ≥ 44 px, rotate prompt in portrait.
- **Visual:** Playwright `toHaveScreenshot` on paused scenarios (deterministic frame), chromium only, run in the official Playwright Docker image in CI; baselines generated/updated in CI (`pnpm test:visual:update` workflow dispatch). Tolerance `maxDiffPixelRatio: 0.02`. Screenshots attached to tickets for QA.
- **Perf:** `sim.step` for 8 karts < 1 ms average (unit bench, node); render budget < 150 draw calls and < 150k triangles on the race scenario (asserted via `renderer.info` in e2e). Real-device smoothness is [Manual].
- **CI (GitHub Actions, blocks merge):** install → lint → typecheck → unit → build → e2e (all projects) → visual. Playwright report uploaded as artifact.

## Environments & deploy

- Local: `pnpm dev` (Vite, LAN-exposed so a phone on Wi-Fi can connect).
- PRs: Vercel Git integration builds a preview per PR; link appears on the PR and goes in the ticket's Preview field.
- Production: merge to `main` → Vercel production deploy.

## Conventions

- Files `camelCase.ts`; types/classes `PascalCase`; constants `SCREAMING_SNAKE`.
- All tunable numbers (speeds, drift thresholds, item odds) live in `sim/tuning.ts` or data files — no magic numbers in logic.
- Lint rule: `src/sim/**` may not import `three`, DOM globals, `input/`, `render/`, `ui/`, `audio/` (`no-restricted-imports` / `no-restricted-globals`).
- Units: metres, seconds, radians. +Y up; karts face −Z at heading 0.
- Commits: Conventional Commits with ticket ID (see dev-workflow).

## Risks & open questions

- **Kart feel is subjective** → each handling ticket ships tuning in `sim/tuning.ts` and a `?scenario=…&tune=1` debug panel (lil-gui, dev-only chunk) so the user can tweak live and report numbers.
- **Mobile GPU performance** → cap pixel ratio at 2 (1.5 on low-end), simple lambert/toon materials, merged static geometry, perf ticket before MVP.
- **WebGL in CI** → headless Chromium uses SwiftShader; slow but deterministic. If visual tests flake, fall back to sim-state assertions + manual screenshots.
- **Audio on iOS** → requires a user gesture; the title screen "Play" tap unlocks audio.
