# 0005 — Online races: host-authoritative snapshots with client prediction

Status: Accepted · 2026-09-25 · confirmed with amendments by the MK-36 spike (see Spike results)

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

## Spike results (MK-36, 2026-09-25)

Prototype: `src/net/spike/` (`?spike=net`). Host runs the sim with 2 humans + 6 AI, 20 Hz snapshots; the client runs a full RTT + 2 ticks ahead, resets to each snapshot and replays its inputs.

| Measure                                                                             | Result                                                                                                                                                           |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Snapshot size (8 karts + 12 item boxes, quantized)                                  | **426–434 B avg, 445–449 B max** (full JSON state: ~8 KB)                                                                                                        |
| Bandwidth per client, 20 Hz                                                         | **8.5 KB/s down, 1.6 KB/s up** (60 input packets/s, each with the last 6 inputs)                                                                                 |
| Own-kart prediction error vs the host                                               | 7 mm avg; max 3 cm at 0–75 ms, 14 cm at 150 ms + 30 ms jitter + 5 % loss, 28 cm at 250/50/10 %                                                                   |
| Remote human kart (predicted from last known input)                                 | 1 cm avg, ≤ 7 cm max with smooth steering. Abrupt real-player inputs will be larger: tune in the polish ticket                                                   |
| Late client inputs at the host                                                      | 0 at ≤ 40 ms; only during the first ~0.5 s (RTT estimate settling) at 150 ms                                                                                     |
| Re-simulated ticks per snapshot                                                     | ≈ RTT/16.7 ms + 3: 4 (LAN), 9 (100 ms RTT), 13 (170 ms), 23 (345 ms)                                                                                             |
| Sim cost, 8 karts incl. 6 AI                                                        | **0.43–0.46 ms per tick** (Chromium desktop and Node, cloud CPU). Linear in karts (~0.04 ms physics each) + ~30 % for AI                                         |
| Re-sim of 11 ticks (≈150 ms RTT)                                                    | desktop **4.7 ms**; CPU throttled 4× ("mid-range phone") **11.7 ms**; 6× **17.4 ms**                                                                             |
| Cross-engine (Chromium vs WebKit, seeded 600 ticks)                                 | Hashes differ **from tick 0**: kart 1's grid heading differs by 1 ULP (`atan2`). Positions agree to ~15 digits. Lockstep would drift; snapshots make it harmless |
| End-to-end, 2 Chromium pages over a real WebRTC data channel (P2P, host candidates) | 20 s race, 435 snapshots, 0 late inputs, final gap after stopping **5 mm**                                                                                       |

**Confirmed:** host authority + 20 Hz quantized snapshots + input redundancy. Bandwidth is half of the 400 B × 20 Hz estimate, iPhone/desktop mixing is safe, and prediction converges.

**Amended — re-simulation cost is the risk.** The TDD target (10 ticks ≤ 4 ms desktop) is missed slightly, and on a throttled phone CPU one snapshot's replay costs 12–17 ms: a whole 60 fps frame, 20 times a second (≈ 30–45 % of a core before rendering). The net-core ticket should therefore:

1. **Reconcile only on mismatch** (default): keep the predicted state when it matches the snapshot at that tick within tolerance (position < 5 cm, same discrete state: lap, item, drift, respawn), and replay only when it doesn't. With the prediction errors above, most snapshots need no replay; mispredictions (a remote human changing input, items) still replay.
2. **Fallback (Backlog ticket):** predict only the local kart and render the other karts interpolated between snapshots (~100 ms in the past). This cuts the replay to one kart and matches the remote-kart smoothing the polish ticket needs anyway.
3. Profile the sim step (per-kart cost is high for arcade physics); a lower snapshot rate (15 Hz) is the last resort.

## Net core (MK-39, 2026-09-25)

`src/net/` now holds the production version: `protocol.ts` (v2 wire format: Start with the race setup and AI personalities, Input, Snapshot, Event, Bye, Ping), `host.ts` (`OnlineHost`), `client.ts` (`OnlineClient`), `transport.ts` (+ `BroadcastChannelTransport`), `webrtc.ts` (moved from the spike), tunables in `config.ts`. Race events the host decides (`HOST_EVENTS`) travel in Event packets that repeat the last 0.5 s, so no acks are needed.

**Reconcile only on mismatch** is the default. The client keeps its prediction when, at the snapshot's tick, every kart is within 5 cm and 0.2 m/s, the discrete state matches (laps, items, drift, hits, timers running, entities, RNG), our input wasn't late, and no other player's input changed by more than 0.25 or pressed a different button. Loopback, host + 3 clients, 150 ms RTT / 30 ms jitter / 5 % loss, full 1-lap race (`loopback.test.ts`, `resim.perf.test.ts`, Node on a cloud CPU):

| Measure                                                       | Result                                                                                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Snapshots needing a replay                                    | ~20–35 % (the rest: nothing re-simulated)                                                                                                                    |
| Snapshot handling cost, average / max                         | **1.7–1.9 ms** / 12–13 ms (target 4 ms average)                                                                                                              |
| Raw re-simulation of 10 ticks, 8 karts                        | **4.8–5.3 ms**: still over the 4 ms target; the cost is the sim step itself (clone ≈ 16 %) → sim-step optimisation ticket                                    |
| Own-kart prediction at snapshot ticks vs host                 | ≤ 6 cm (one 29 cm case next to a hit)                                                                                                                        |
| What the player saw vs host, excluding host-decided spin-outs | P50 7 mm, P99 < 12 cm, max < 0.5 m. A hit the client didn't foresee shows up to ~5 m off until the snapshot arrives: render smoothing is the polish ticket's |
| Snapshot size, 8 karts + items                                | 454 B avg, 527 B max (lap times now sent as u16 ticks: exact)                                                                                                |
