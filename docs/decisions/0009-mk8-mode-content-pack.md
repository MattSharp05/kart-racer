# 0009 — MK8 Mode is a lazy-loaded content pack with pre-converted assets, never committed

Status: Proposed · 2026-10-02 · amended 2026-10-03 (MK-135: on the site behind a server-checked password) · PRD: [Kart Racer v3 (MK8 Mode)](https://app.notion.com/p/3ed24983f3ca81eaafe9d34189a7f7c1)

## Context

v3 adds MK8 Mode: real Mario Kart 8 models, UI sprites, voices and sound effects from the Spriters Resource sites (Models, Spriters, Sounds), for MK8, MK8 Deluxe and MK Tour. The raw downloads are large (Mushroom Cup courses 56–88 MB each as OBJ + PNG, about 275 MB for the cup; racer models 2–4 MB; sound packs about 270 MB of WAV). The original game must load exactly as fast as today. The PRD first said the converted assets would be committed to the public repo. Amended 2026-10-02 before acceptance: Nintendo assets are never committed or deployed (the orchestrator won't redistribute them; Matthew accepted local-only, and making the repo private isn't possible on the current GitHub Actions minutes). This is a personal learning project, played locally.

## Decision

- **Code:** everything MK8-specific lives in `src/mk8/` (screens, HUD, render factories, sound bank, loader) and registers into the existing content registries (ADR 0007) at runtime, after a dynamic `import('./mk8')`. Its sim data (course routes, collision, items, stats) lives in `src/mk8/content/**/sim.ts` files that stay pure (sim lint rules apply).
- **Assets (local only):** raw downloads go to `.mk8-raw/` and converted web-ready files to `.mk8-out/` with a generated `manifest.json` (path, bytes, hash per file, grouped by course, racer and screen). Both folders are gitignored: no Nintendo asset is committed, and none is in the production build. The dev server (`pnpm dev`) serves `.mk8-out/` at `/mk8/`. When the pack is missing (CI, Vercel previews and production), MK8 Mode shows a "MK8 pack not installed" screen with the commands to build it, and the original game is unaffected. Only non-Nintendo files we're allowed to ship (the OFL font M PLUS Rounded 1c) live in `public/mk8/`.
- **Pipeline:** Node scripts in `tools/mk8/` (`pnpm mk8:build`, plus a fetch step Matthew runs on his own machine), driven by `tools/mk8/sources.json` (every asset's page URL, id and what we take from it). Dev dependencies only: `obj2gltf`, `assimpjs` (WASM assimp: most models only exist as COLLADA `.dae`; it keeps the racers' skeletons, added in MK-93 on 2026-10-02), `@gltf-transform/core|extensions|functions`, `meshoptimizer`, `sharp`, `ffmpeg-static`. Nothing new at runtime: three's `GLTFLoader` + `MeshoptDecoder` ship with three.
- **Formats:** GLB with meshopt compression and WebP textures (max 1024 px; a `-low` 512 px set for `quality=low`). Audio: AAC in `.m4a` (plays on every target browser, including iOS Safari), decoded with Web Audio.
- **Loading:** a loading screen with a progress bar loads the UI kit first, then the chosen course and racers on demand.
- **Size budgets** (measured and set by the pipeline ticket once real assets are converted, see TDD): each course ≤ 15 MB, the whole pack ≤ 90 MB. They still matter for load time and phone memory, even though nothing is deployed.

## Consequences

- The original game's bundle and load time are unchanged (asserted by the existing bundle-size check).
- Getting the raw files needs Matthew: agent downloads from the rip sites are blocked by auto mode, so he fetches them locally (or explicitly allows it). Tickets build and test against synthetic fixtures (a generated test course, sine-wave audio, generated sprite sheets) and list real-asset checks as deferred.
- CI, Vercel previews and production never have the pack; MK8 e2e and visual tests run against fixtures or the "not installed" state. MK8 QA with real content happens locally with `pnpm dev`.
- No repo or deploy growth from assets. The pipeline stays deterministic so local rebuilds are reproducible.
- No redistribution of Nintendo assets from this repo or its sites.

## Amendment — 2026-10-03: on the site behind a server-checked password (MK-135)

Matthew wants the real MK8 art on the Vercel site, not only under `pnpm dev`. Decided in chat on 2026-10-03: **the assets may be on the site behind a server-checked password; they are still never committed.** The original game stays public. This replaces "none is in the production build" and "CI, Vercel previews and production never have the pack" above.

- **Where the pack lives:** the converted `out/` (manifest + files, about 55 MB) sits in the private repo `MattSharp05/kart-racer-mk8-assets`. Nothing from it is committed to kart-racer or written into git-tracked `public/`.
- **Build:** Vercel's build command is `pnpm build && node scripts/fetchMk8Pack.mjs`. When both `MK8_ASSETS_TOKEN` (a fine-grained, read-only Contents token for that repo) and `MK8_PASSWORD` are set, the script sparse-clones only `out/` (the token goes to git as an HTTP header through its environment, never in argv or logs; nothing from the repo is executed) and copies the manifest plus the files it lists into `dist/mk8/`, refusing paths that escape it or land on `fonts/`. Without them it does nothing, and the site shows "MK8 pack not installed" as before. CI runs `pnpm build` only and never has the pack.
- **Gate (server side, free Vercel features only):** Vercel Routing Middleware (`middleware.ts` at the root, matcher `/mk8/:path*`; it works for non-Next projects) runs before the static files. Every `/mk8/*` request needs a valid `mk8_session` cookie, else 401 with no body; with no `MK8_PASSWORD` it answers 404, so a pack can never be served ungated. The OFL font in `/mk8/fonts/` stays public. Passing requests get `Cache-Control: private` so no shared cache holds pack bytes.
- **Login:** `POST /api/mk8-login` (a Vercel Function like `api/turn.ts`, same-origin only) compares the password with `MK8_PASSWORD` in constant time and sets `mk8_session`: `v1.<expiry>.<HMAC-SHA256>`, signed with `MK8_COOKIE_SECRET` (or, when that's unset, a key derived from the password, so changing the password logs everyone out), HttpOnly, Secure, SameSite=Lax, 30 days. Brute-force friction: a 1 s delay on every miss and 429 after 10 misses from one address in 10 minutes (per Function instance). No password, hash or secret is in client code.
- **Client:** the loader turns a 401 into `PackLockedError`; MK8 Mode shows a password box in the MK8 UI kit and loads again after a successful login.

Consequences: the site can show MK8 Mode with real content to whoever has the password; anyone without it gets 401s and no bytes. Production and previews get the pack only where Matthew sets the env vars. Rotating the password (or the secret) invalidates every session.
