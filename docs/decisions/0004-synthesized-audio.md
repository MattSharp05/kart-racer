# 0004 — Synthesized audio instead of sound files

Status: Proposed (needs Matthew's OK) · 2026-09-24

## Context

MK-26 planned CC0 sound files (Kenney / OpenGameArt) played with Howler.js. Building it meant downloading third-party files overnight while the owner was asleep, and our working rules require explicit permission for downloads. Files would also add ~1–3 MB and a licence list to maintain.

## Decision

All sound effects, engine hum and music are synthesized at runtime with the Web Audio API (`src/audio/`): short enveloped oscillators and filtered noise for effects, sawtooth voices for engines, and a small chiptune sequencer (I–V–vi–IV in C) for the menu, race and star loops. No audio files, no Howler dependency.

## Consequences

- Zero download size for audio, nothing to license (`docs/CREDITS.md` says so), no network requests for sound.
- Sounds are simpler / more "retro" than recorded samples. If Matthew wants richer audio, swapping in CC0 files later only touches `synth.ts` (the event → sound mapping stays the same).
- Howler.js is no longer part of the stack (TDD updated).
