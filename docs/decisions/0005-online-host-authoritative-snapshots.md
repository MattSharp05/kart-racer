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

## Tuning (MK-73, 2026-09-26)

Measured with the netcode lab (`src/net/netLab.ts`): a 4-player room (host + 3 clients + 4 AI) over loopback with a virtual clock, every client drawing through its `NetSmoother` as the game does, 30 s of racing, 2 seeds, 3 clients each. `net-good` = 80 ms RTT, 10 ms jitter, 1 % loss; `net-bad` = 200 ms, 50 ms, 8 %. "Jump" is how far a drawn kart moves in one frame beyond its own motion (what reads as a teleport or rubber band); "vs truth" is the drawn position against the host's at the same tick. Re-run with `pnpm net:sweep` (`FRAME=2` for 30 fps clients).

| `net-bad`, 60 fps         | own jump p99 / max | others' jump p99 / max | others vs truth p50 / p99     | re-sim ticks/snapshot | late inputs          | down / up           |
| ------------------------- | ------------------ | ---------------------- | ----------------------------- | --------------------- | -------------------- | ------------------- |
| **Chosen defaults**       | 4 cm / 0.29 m      | 14 cm / **0.36 m**     | 6 cm / 1.36 m                 | 4.1                   | 6.3                  | 9.3 / 1.8 KB/s      |
| Snap at 3 m (was)         | 4 cm / 0.29 m      | 13 cm / **3.21 m**     | 5 cm / 1.33 m                 | 4.1                   | 6.3                  | same                |
| Input delay 2 ticks (was) | 4 cm / 0.29 m      | 15 cm / 0.47 m         | 6 cm / 1.58 m                 | 4.4                   | 6.3                  | same                |
| Input delay 0             | 5 cm / 0.29 m      | 13 cm / 0.36 m         | 5 cm / 1.20 m                 | 3.9                   | 7.2 (12.5 at 30 fps) | same                |
| Smoothing 0.1 s / 0.25 s  | 5 / 3 cm           | 18 / 12 cm             | 1.21 / 1.67 m p99             | 4.1                   | 6.3                  | same                |
| Snapshots 30 Hz           | 4 cm / 0.29 m      | 12 cm / 0.37 m         | 5 cm / 1.23 m                 | 2.9 (×30/s)           | 7.0                  | **14.0** / 1.8 KB/s |
| Snapshots 15 Hz           | 5 cm / 0.74 m      | 21 cm / 0.71 m         | own corrections **2.3 m p99** | 4.9                   | 6.3                  | 7.0 / 1.8 KB/s      |
| Remote karts interpolated | 4 cm / 0.29 m      | 29 cm / 3.41 m         | **9.3 m / 12.5 m**            | 4.1                   | 6.3                  | same                |

**Chosen** (`sim/tuning.ts` → `net`, each with its reason in a comment):

- **Snap distance 3 m → 8 m.** At `net-bad` a predicted kart is corrected by 3–7 m now and then: another player steered while their input was on its way, or used an item no client can foresee (a lightning strike moved every kart ~5 m at once in the lab). Snapping drew those as 3–6 m teleports; blending them over the smoothing time keeps every drawn kart under 1 m per frame (max ~0.8 m) across the 10-race soak. The largest correction in 10 full races was ~6 m, so 5 m would still have snapped some. Respawns (tens of metres) still snap.
- **Input delay 2 → 1 tick.** The late inputs at the host are the same (6.3 per client in 30 s at 60 fps, 8.5 vs 8.2 at 30 fps); one tick less lead means less to re-simulate and other players' karts predicted closer to where they are (p99 1.36 m vs 1.58 m). 0 ticks raises late inputs by half on a 30 fps client (12.5; its inputs leave in pairs). Real lag spikes still add up to `NET.maxExtraLeadTicks` (4) on top: kept, 2 made own corrections spikier.
- **Kept: smoothing 0.15 s** (the middle of the trade-off: 0.1 s makes other players' karts jump ~25 % more per frame, 0.2–0.25 s draws them further off the truth for longer), **20 Hz snapshots** (30 Hz re-simulates the same ticks per second for +50 % bandwidth; 15 Hz halves bandwidth but the client's clock easing, tuned for 3-tick intervals, then corrects its own kart by metres: other rates need `NET.tickDrift*` retuned first, MK-84), and **remote karts predicted** (interpolated ones are always smooth but drawn 6 m (good) to 10 m (bad) behind where they are, which reads as lag in a race).

**Soak:** 10 full 1-lap races at `net-bad` with 4 players (`src/net/soak*.test.ts`, in CI on every push): every client ends with the host's standings, finish ticks and lap times, and no drawn kart jumps ≥ 1 m in a frame. The same in real browsers (`pnpm test:soak`, 4 pages over BroadcastChannel): see the MK-73 Test report.

**Bandwidth per client:** 9.3–9.7 KB/s down, 1.8 KB/s up at 20 Hz (4 players, items on).

**Phone CPU (`pnpm test:soak` → `onlinePhone.spec.ts`):** one client of a 4-player room at `net-bad` on a Pixel 7 landscape profile, CPU throttled 4× (DevTools "mid-range mobile"), 20 s of racing per track. A GPU-less machine draws WebGL with SwiftShader on the CPU and throttling multiplies the time the page waits for it, so the real frame rate there only measures SwiftShader (~10 fps unthrottled); the check times each part of a frame's main-thread work instead. The stepped pages ran slower than real time, so the client saw ~400 ms RTT and re-simulated more than `net-bad` needs: a pessimistic case.

| Track (4× CPU) | tick (×60/s) | snapshot (×20/s) | draw (JS, per frame) | sim + net | frame at 30 fps | CPU frame rate |
| -------------- | ------------ | ---------------- | -------------------- | --------- | --------------- | -------------- |
| Sunny Circuit  | 2.46 ms      | 13.5 ms          | 3.9 ms (p95 7.4)     | 417 ms/s  | 17.8 of 33.3 ms | 149 fps        |
| Dune Canyon    | 2.73 ms      | 10.0 ms          | 4.1 ms (p95 7.4)     | 363 ms/s  | 16.2 of 33.3 ms | 155 fps        |
| Frostpeak Pass | 2.23 ms      | 10.0 ms          | 4.9 ms (p95 8.5)     | 335 ms/s  | 16.1 of 33.3 ms | 136 fps        |

Frostpeak Pass is the heaviest to draw; every track leaves a mid-range phone's CPU about half of each 30 fps frame spare. The GPU side (fill rate, ~85 draw calls) and real Wi-Fi/4G links are checked on real devices in MK-73's QA.
