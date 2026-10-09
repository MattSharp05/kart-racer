# 0013 — Phone controllers: QR pairing on the online stack, `uqr` for the codes

Status: Accepted · 2026-10-09 · built in MK-146 · Matthew approved the feature (epic MKE-23, "Couch play"); the encoder choice was left to the builder

## Context

Couch play (epic MKE-23) lets up to 4 people in one room race on one desktop screen, each steering with their phone. A player pairs a phone by scanning a QR code the desktop shows. Two things were new: how a phone's controls reach the desktop, and how the desktop draws a QR code. The ticket asked to reuse the online stack (ADR 0005/0006/0008) with no server changes, and to record the QR encoder choice here rather than block on it.

## Decision

### Transport: the online race stack, unchanged

- The desktop makes a **pairing code** (a room code, `net/room.ts` alphabet) and shows one QR code per player slot: `<origin>/remote?room=<code>&slot=<1–4>`. The origin is the desktop's own, so production codes open production and `pnpm dev` codes open the dev server on the LAN.
- `/remote` is its own Vite entry (`remote.html`, `src/remote/page/`), ~25 KB of JS with no three.js, so a phone opens it fast.
- **Links** (`src/remote/links.ts`) are the online races' `RaceLinks`: in production the desktop hosts and each phone joins over a **WebRTC data channel**, signaled on a Supabase Realtime channel named `room:remote-<code>` (the online lobby's backend, kept apart from game rooms by the prefix) with ICE from `/api/turn` (ADR 0008). `?net=local` uses BroadcastChannel between tabs (tests, QA links); `&links=webrtc` keeps WebRTC with local signaling, as lobbies do (MK-73). The only `src/net/` change: the room's signaling-over-a-channel helper is exported (`channelSignaling`), so a pairing can use it without a `Room`.
- **Protocol** (`src/remote/protocol.ts`, separate from the race protocol): Hello (slot) until Welcome, then **Input packets at 60 Hz** (9 bytes: sequence number, steer, throttle, brake, button flags), Ping/Pong both ways for the RTT, and Bye. The data channel is unordered and lossy, so the desktop keeps only inputs newer than the newest seen (late and repeated packets are dropped); an input packet also says the phone is still there.
- **Drops:** a Bye, a closed link, or 1.5 s of silence marks the slot disconnected and pauses a running race; the Add Controllers panel opens over it with that slot's code. Rescanning (or reloading `/remote`) makes a new link that takes the slot back. A second phone scanning a taken slot replaces the first.
- Inputs enter the game as one more input device merged into the local player's controls (`PlayerInput`): the sim and the netcode don't know about phones. Until split-screen (MK-144) binds slots to players, slot 1 drives player 1.

### QR codes: `uqr`

We draw the codes in the browser from a tiny dependency, **`uqr` 0.1.3** (MIT, by the unjs team, no dependencies, ESM, typed). We use only its `encode()` (the module matrix) and draw our own `<svg>` path (`src/remote/qr.ts`), ECC level M.

Options weighed:

1. **`uqr`** (chosen): ~10 KB minified, lazy-loaded with the Add Controllers panel only; a port of Nayuki's well-tested QR generator.
2. `qrcode-generator` (MIT): fine, but older CommonJS and a larger package for the same job.
3. **Write one in-house**: byte mode + Reed–Solomon + masking is 300–400 lines to write and test, for no gain over a well-tested MIT port.
4. A QR image service: sends the pairing URL to a third party and needs the network at render time. No.

## Consequences

- One new runtime dependency (`uqr`), loaded only when the panel opens; the game's startup bundle doesn't grow by it.
- No new service, server code or env vars: production pairing uses the Supabase project and TURN function that online play already has. Each pairing holds one Realtime channel open for the desktop page's life (a few signaling messages per phone, as a race does).
- Phones need the site to be reachable: on production that's the public URL; locally the phone must be on the same LAN as `pnpm dev`.
- E2E covers pairing over BroadcastChannel (`tests/e2e/remote.spec.ts`); real WebRTC between a phone and a desktop is checked by hand on production (MK-146's QA).
- MK-147 replaces only the phone page's look (`src/remote/page/view.ts` + `remote.css`), adding tilt and touch steering; MK-144 binds slots to players through `remoteInput(slot)`.
