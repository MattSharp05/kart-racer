# 0012 — Sampled audio in MK8 Mode

Status: Proposed · 2026-10-02 · amends [ADR 0004](0004-synthesized-audio.md) for MK8 Mode only

## Context

ADR 0004 synthesizes all audio. For MK8 Mode, Matthew wants the real sound effects wherever they exist, and our current music.

## Decision

- MK8 Mode plays recorded samples through Web Audio (`AudioBuffer` pool, no Howler). Sources: MK8 (racer voices, kart engines, terrain, course and course-object sounds), MK8 Deluxe (menu, race and common sounds, including the star theme) and MK Tour (item sounds).
- `src/mk8/audio/soundBank.ts` maps the same `SimEvent`s the synth uses (plus the new MK8 ones) to sample ids. A voice event map (`voiceEvents.ts`) picks the racer's line per event (hit, fall, glide, boost, overtake, finish position, select). Any event without a sample falls back to the synth sound.
- Music: our existing synth music in MK8 Mode, except the star theme.
- Only the files referenced by the sound bank are converted and committed (AAC `.m4a`, mono where the source allows). Per-course ambience and per-racer voices load with the course and racer.

## Consequences

- About 10–15 MB of audio in `public/mk8/audio/`, loaded on demand.
- iOS needs the existing first-tap audio unlock, which the MK8 title's "Press start" provides.
