# Technical Design — Kart Racer

Status: MVP Approved · **v2 Approved** (2026-09-25) · PRD (MVP): https://www.notion.so/3e424983f3ca8171ad9bffbdee9cedf1 · PRD (v2): https://app.notion.com/p/3e524983f3ca812d85b8e778602f94e1

## Stack

| Choice                                                  | Why                                                                                                                                                               |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript (strict)**                                 | Types catch sim/render mismatches early; every session reads the same contracts.                                                                                  |
| **Vite 8**                                              | Fast dev server, zero-config TS, multi-page build (game + `/dev`).                                                                                                |
| **Three.js (r186)**                                     | Mature WebGL renderer, low-poly friendly, huge docs. No framework wrapper.                                                                                        |
| **No physics engine** — in-house arcade physics         | Kart feel is the #1 goal; hand-tuned arcade model beats rigid-body sims for this and stays deterministic. ([ADR 0002](decisions/0002-in-house-arcade-physics.md)) |
| **Plain DOM + CSS for UI/HUD** (no React)               | A handful of screens; HTML overlays are simpler and cheap on mobile.                                                                                              |
| **Web Audio API** (synthesized) for audio               | No files to download or license; see ADR 0004 (replaced the planned Howler.js).                                                                                   |
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
  audio/             synthesized SFX/music (Web Audio), event → sound mapping
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
- **CI (GitHub Actions, blocks merge):** install → lint → typecheck → unit → perf → build → bundle budget, then in parallel: e2e as one job per Playwright project (≈5 min instead of ≈20 min serially) and visual. PRs that only touch docs, `*.md` or `.claude/` skip e2e and visual; pushes to main always run everything. Playwright report uploaded per project as an artifact.

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

## v2 — Online, content and phone controls

Scope: [PRD v2](https://app.notion.com/p/3e524983f3ca812d85b8e778602f94e1). The one thing v2 must nail is **smooth online races**. Decisions: [ADR 0005](decisions/0005-online-host-authoritative-snapshots.md) (netcode), [ADR 0006](decisions/0006-supabase-and-webrtc.md) (services), [ADR 0007](decisions/0007-feature-modules-and-registries.md) (module split).

### Stack additions

| Choice                                                                                                 | Why                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Supabase** (free tier): Realtime (rooms, presence, lobby, WebRTC signaling) + Postgres (leaderboard) | Matthew's pick; one free service for rooms and data; RLS instead of our own server. `@supabase/supabase-js` is the only new runtime dependency, lazy-loaded when Online or Leaderboard opens. |
| **WebRTC data channels** (browser built-in) for race packets                                           | UDP-like (unordered, unreliable) and peer to peer, so it's off every quota. Public STUN only.                                                                                                 |
| Alternative kept ready: Cloudflare Durable Objects relay                                               | Used if the spike shows P2P fails on mobile networks (ADR 0006).                                                                                                                              |

### Architecture

```
            Supabase Realtime (room channel)            Supabase Postgres
   lobby state · presence · WebRTC offers/answers       records + submit_record()
                  ▲                                          ▲
   net/room.ts ───┘                              records/leaderboard.ts
        │ creates
        ▼
   net/transport.ts  (WebRTC | Loopback+lag | BroadcastChannel)
        │
   ┌────┴──────── host ──────────────┐        ┌──────── client ───────────────────┐
   │ game/session.ts (OnlineHost)     │ inputs │ game/session.ts (OnlineClient)     │
   │  sim.step (authoritative, AI)    │◄───────│  local sim copy: reset to snapshot │
   │  snapshot encoder (20 Hz)        │───────►│  + replay unacked inputs (predict) │
   └──────────────────────────────────┘ snaps  │  render error smoothing            │
                                               └────────────────────────────────────┘
```

- `src/net/` (new, may import `sim/` types, never `render/`/`ui/`): `transport.ts`, `protocol.ts` (binary encode/decode, quantization, versioned), `room.ts` (Supabase channel, codes, presence), `host.ts`, `client.ts`, `netsim.ts` (lag, jitter, loss).
- The **sim is unchanged in kind**: still `step(state, inputs)`. Online adds `localKartIds`, a `controller` per kart (`local | remote | ai`), and "a dropped player becomes AI" by switching that kart's controller.
- **Tick and time:** the host starts the countdown at tick 0 and clients align by tick. Clients run slightly ahead of the host by about RTT/2 plus a buffer, adjusted from snapshot acks.
- **Content registries** (ADR 0007, MK-41): `src/content/{tracks,racers,items}/<id>/` each hold a pure `sim.ts` (sim data and item behaviour, odds row) and, for racers and items, a `render.ts` (model, colours, icon, use sound, entity renderer), listed in the kind's `index.ts` / `render.ts`. Ids are plain strings validated by the registry (`src/content/registry.ts`).
- **Track hazards:** a generic `hazards[]` in the track data (moving, rotating or periodic colliders, and surface modifiers such as ice, sand and conveyors). Their motion is a pure function of `tick`, so hazards cost no network state.

### Data and state (v2 additions)

- `localStorage` (versioned `settings.ts`): nickname and colour, device id (random, for leaderboard rows), handedness, steering mode (drag or tilt), tilt sensitivity and calibration, button scale and positions, mute, records per track × cc.
- Supabase `records(id, track_id, engine_class, nickname, device_id, race_ms, best_lap_ms, created_at)`. Everyone can read (RLS). Inserts go only through `submit_record()` (security definer), which rejects times below the track's minimum (`track_limits`), lap/race combinations that don't add up, and more than N submissions a minute per device. Each device keeps one best row per board.
- Rooms aren't stored: a room is a Realtime channel `room:<CODE>`, and lobby state lives in presence plus host broadcasts. The room ends when the host leaves.

### Scenarios and testing (v2 additions)

- **Online without a server:** `?net=local&role=host|client&room=X` uses the BroadcastChannel transport, so two tabs or Playwright contexts race without Supabase. `&netsim=150,30,5` adds lag, jitter and loss. Scenarios like `online-race-2p`, `online-lobby` and `online-drop` are listed on `/dev`.
- **Unit:** protocol round-trip, quantization bounds, and a loopback test with a host and 3 clients under lag and loss, asserting that client states converge to the host's within tolerance after N ticks. Reconciliation replays exactly the unacked inputs. A dropped kart hands over to AI.
- **E2E:** two browser contexts over BroadcastChannel, driving a race start to finish. Real network behaviour (WebRTC, phones, 4G) is covered by the spike and `[Manual]` QA.
- **Perf:** re-simulation budget. Stepping 10 ticks with 8 karts stays within 4 ms on desktop in the perf suite, and phones are checked in QA. Each new track keeps the existing draw-call and triangle budgets (asserted per track).
- **Netcode tuning and soak (MK-73):** `src/net/netLab.ts` races a 4-player room over loopback under `net-good`/`net-bad` and measures what players would see (per-frame jumps, drawn-vs-host error, re-simulation, late inputs, bandwidth). CI runs 10 full races at `net-bad` in its own step (`pnpm test:netsoak`, `src/net/soak*.test.ts`: identical results, no teleports) and budget checks (`netTuning.test.ts`); `pnpm net:sweep` compares settings; `pnpm test:soak` runs the opt-in browser soak (10 races, 4 pages) and the 4×-throttled phone check on every track (`net-bad-4p-<track>` scenarios). Results: ADR 0005 → "Tuning (MK-73)".
- **Cross-engine:** a chromium vs webkit state-hash check documents how far the sim drifts between engines. It is informational: authoritative snapshots make drift harmless.

### Environments (v2 additions)

- Vercel env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Production and Preview). Matthew creates the free project, and the schema lives in `supabase/migrations/*.sql`, applied by Claude via the Supabase SQL editor instructions in the ticket or the CLI.
- A weekly GitHub Actions keep-alive query stops the free project from pausing.

### v2 risks

- **P2P on mobile networks:** the spike tests WebRTC on real phones over 4G/5G. The fallback is a Durable Objects relay (ADR 0006).
- **Feel under lag:** tuning happens in the netcode polish ticket with `netsim` presets and a real 4-player test with Matthew.
- **Phone CPU for re-simulation:** measured in the spike. Fallbacks are predicting only the local kart, or a lower snapshot rate.
- **Supabase free-tier pausing and limits:** keep-alive, and race traffic stays off Realtime.
- **Six tracks × phone perf:** per-track perf assertions, plus a final pass across all tracks.
