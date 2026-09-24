# 0005 — Online races: host-authoritative snapshots with client prediction

Status: Proposed · 2026-09-24

## Context

v2 must nail smooth online races: up to 4 humans (desktop and phone together) plus AI, 8 karts. The sim is pure and deterministic within one JS engine (ADR 0001), but it uses `Math.sin/cos/atan2/hypot/exp/pow`, which aren't guaranteed to be bit-identical across V8 (Chrome/Android) and JavaScriptCore (every iPhone browser). Pure lockstep or rollback, where each peer simulates from inputs only, would drift apart between iPhone and desktop players.

## Decision

- **The host's browser is the authority.** It runs the real sim, including all AI karts and items, at 60 Hz. The room creator is the host.
- **Clients send inputs** every tick (quantized InputFrame, about 4 bytes). Each packet also repeats the last few ticks, so a lost packet doesn't lose input.
- **The host sends snapshots** at 20 Hz: a compact, quantized binary encoding of the kart and entity state, plus the last input tick it applied for each player.
- **Clients predict:** each client keeps a local copy of the sim. When a snapshot arrives, the client resets to it and re-simulates up to the present with its own unacknowledged inputs, and with the last known inputs for other karts (rollback-lite). Because every snapshot is authoritative, float differences between engines never accumulate.
- **Render smoothing:** a correction is blended out over about 100–200 ms, never snapped. Remote karts render slightly in the past if prediction proves too jumpy (decided by tuning in the polish ticket).
- **Race events** (hits, item pickups, finishes, lap times) are decided only by the host and carried in snapshots or events.

## Consequences

- There's no cross-engine determinism requirement, so iPhone and desktop can share a room.
- The host has zero latency, and other players have their own ping to the host. That's acceptable for friends.
- If the host leaves, the room ends. There is no host migration in v2.
- Re-simulation cost: at about 150 ms RTT a client re-simulates about 9 ticks per snapshot, about 180 steps/s at 1 ms each at most. The spike measures this on a phone. The fallback is to predict only the local kart.
- Bandwidth at about 400 B × 20 Hz is roughly 8 KB/s down per client, which is fine on mobile.
