# 0009 — MK8 Mode is a lazy-loaded content pack with local-only, pre-converted assets

Status: Proposed · 2026-10-02 · PRD: [Kart Racer v3 (MK8 Mode)](https://app.notion.com/p/3ed24983f3ca81eaafe9d34189a7f7c1)

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
