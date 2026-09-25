# 0007 — Feature modules and content registries (split hotspot files)

Status: Accepted · 2026-09-25

## Context

In MVP wave 11, four independent features all edited `main.ts` (405 lines), `ui/menus.ts` (277), `game/storage.ts` (140) and `styles.css` (903), which caused merge conflicts. v2 runs 2 parallel builders and adds about 20 screens and content pieces. Content is also hardcoded in several places: `KartId`/`ItemId` unions, per-kart switches in `render/kartModels.ts`, the item odds table, HUD icons and `sunnyRace()`. The local player is wired to kart 0 in about 15 places.

## Decision

- `main.ts` becomes a thin bootstrap. The code moves to `game/session.ts` (building a local or online race), `game/flow.ts` (screen flow) and `render/world.ts` (the renderer bundle).
- UI screens: one module per screen in `ui/screens/`, each with its own CSS file imported by the module, behind a small screen router. `styles.css` keeps only tokens and global rules.
- Storage splits into `settings.ts` (versioned, with migration), `prefs.ts` and `records.ts`.
- **Content registries:** a track, racer or item is a folder or file that registers its sim data, render factory, icon and sounds. The id unions are derived from the registries. Adding content adds files and edits no shared switch.
- `createRace({ trackId, racers, localKartIds, engineClass, items })` replaces `sunnyRace()`, and the local player id is a parameter everywhere.

## Consequences

- Parallel tickets mostly touch disjoint files. Every ticket lists **Files touched**.
- A one-off refactor at the start of v2, covered by the existing e2e and visual suites (no behaviour change).
