# 0009 — MK8 Mode is a lazy-loaded content pack with committed, pre-converted assets

Status: Proposed · 2026-10-02 · PRD: [Kart Racer v3 (MK8 Mode)](https://app.notion.com/p/3ed24983f3ca81eaafe9d34189a7f7c1)

## Context

v3 adds MK8 Mode: real Mario Kart 8 models, UI sprites, voices and sound effects from the Spriters Resource sites (Models, Spriters, Sounds), for MK8, MK8 Deluxe and MK Tour. The raw downloads are large (Mushroom Cup courses 56–88 MB each as OBJ + PNG, about 275 MB for the cup; racer models 2–4 MB; sound packs about 270 MB of WAV). The original game must load exactly as fast as today. Matthew decided the converted assets are committed to the public repo, knowing the takedown risk (PRD, 2026-10-02).

## Decision

- **Code:** everything MK8-specific lives in `src/mk8/` (screens, HUD, render factories, sound bank, loader) and registers into the existing content registries (ADR 0007) at runtime, after a dynamic `import('./mk8')`. Its sim data (course routes, collision, items, stats) lives in `src/mk8/content/**/sim.ts` files that stay pure (sim lint rules apply).
- **Assets:** web-ready files only, under `public/mk8/` with a generated `manifest.json` (path, bytes, hash per file, grouped by course, racer and screen). Raw downloads go to `.mk8-raw/` (gitignored) and are never committed.
- **Pipeline:** Node scripts in `tools/mk8/` (`pnpm mk8:fetch`, `pnpm mk8:build`), driven by `tools/mk8/sources.json` (every asset's page URL, id and what we take from it). Dev dependencies only: `obj2gltf`, `@gltf-transform/core|extensions|functions`, `meshoptimizer`, `sharp`, `ffmpeg-static`. Nothing new at runtime: three's `GLTFLoader` + `MeshoptDecoder` ship with three.
- **Formats:** GLB with meshopt compression and WebP textures (max 1024 px; a `-low` 512 px set for `quality=low`). Audio: AAC in `.m4a` (plays on every target browser, including iOS Safari), decoded with Web Audio.
- **Loading:** a loading screen with a progress bar loads the UI kit first, then the chosen course and racers on demand.
- **Size budgets** (measured and set by the pipeline ticket, see TDD): each course ≤ 15 MB, all of `public/mk8/` ≤ 90 MB.

## Consequences

- The original game's bundle and load time are unchanged (asserted by the existing bundle-size check).
- Builders need network access to `models.spriters-resource.com`, `www.spriters-resource.com` and `sounds.spriters-resource.com` to rebuild assets. Converted assets are committed, so other tickets don't.
- Repo and deploy grow by about 90 MB. Re-converting rewrites binaries, so the pipeline must be deterministic (same input → same bytes) to avoid history bloat.
- Copyright exposure: Nintendo assets in a public repo and on a public URL. Matthew's call; making the repo private and turning on Vercel password protection later reduces it.
