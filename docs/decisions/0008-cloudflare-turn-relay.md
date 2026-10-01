# 0008 — Cloudflare TURN relay for race links, behind a tiny Vercel Function

Status: Accepted · 2026-10-01 · amends [0006](0006-supabase-and-webrtc.md) · Matthew chose this option on MK-73 (option 1) · built in MK-75

## Context

ADR 0006 sends race packets peer to peer over WebRTC with public STUN only. That works on one Wi-Fi and on most home networks, but phones on mobile data sit behind carrier-grade NAT, where no direct path exists: MK-36's iPhone on 5G stuck at "connecting", and MK-73's "Couldn't connect to …" fallback is all such a player gets. Racing "from anywhere" needs a relay.

The options (MK-73, "Blocked — 2026-09-29"): (1) a hosted TURN service, (2) ADR 0006's option 3, a Cloudflare Durable Objects WebSocket relay as a new `Transport`, (3) running our own TURN server.

## Decision

Option 1: **Cloudflare Realtime TURN**, with credentials handed out by a small **Vercel Function**, `api/turn.ts`.

- WebRTC stays the only race transport. ICE tries direct paths (host, STUN) first and uses the relay only when they fail, so same-network races don't change. No new `Transport` class and no TCP relay (the relay carries UDP when the network allows it).
- **Credentials:** the TURN key (`CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN`) lives only in Vercel's **Production** env vars (sensitive). `GET /api/turn` calls Cloudflare's `POST /v1/turn/keys/<id>/credentials/generate-ice-servers` with a **4-hour TTL** and returns `{ iceServers }` (Cloudflare's STUN + TURN URLs, minus port 53, which browsers block) with `Cache-Control: no-store`. The key never reaches the browser.
- **Client** (`src/net/iceConfig.ts`): each WebRTC race fetches `/api/turn` once (3 s timeout) before any peer connection, and all of that race's links share the answer. Any failure (no key on previews or locally → 503, Cloudflare down → 502, timeout, an HTML answer from `vite preview`) falls back to the public STUN list of ADR 0006, so one Wi-Fi still works.
- **Debug / QA:** `&relay=force` sets `iceTransportPolicy: 'relay'` (relay only, to prove it works on one Wi-Fi; ignored when no TURN servers came back, since a relay-only race could never connect); `&netdebug=1` shows each link's path, `P2P` or `relay`.

## Abuse limits

TURN credentials are bandwidth someone else could spend. The function:

- answers **GET only** (405 otherwise);
- answers only the game's own pages: the `Origin` header, or for same-origin GETs (which carry no `Origin`) the `Referer`'s origin, must be production (`https://kart-racer-alpha.vercel.app`), a preview of this project (`https://kart-racer-…-mattsharp05s-projects.vercel.app`) or localhost; anything else gets 403;
- hands out short-lived credentials (4 h), so a leaked one expires the same day.

A non-browser client can fake those headers; that's accepted at this scale. If abuse shows up in Cloudflare's usage graph, next steps are Vercel Firewall rate limits on `/api/turn` or tying credentials to a room membership.

## Cost

A race link is ~10 KB/s (ADR 0006: 8.5 KB/s down + 1.6 KB/s up per client). A 3-minute race through the relay is ~2 MB each way through Cloudflare, **about 4 MB per relayed player per race**, and only players without a direct path are relayed. Cloudflare Realtime includes **1,000 GB a month free**, then **$0.05/GB**: ~250,000 relayed player-races a month before any charge. The Vercel Function runs once per device per race (Hobby plan limits are far away).

## Consequences

- The site is no longer purely static: one Vercel Function (`api/`, web-standard `fetch` export, no new dependency; it reads `process.env` via the existing `@types/node`). It is self-contained (no imports from `src/`) so Vercel bundles it alone.
- Previews and local dev have no key: online races there use public STUN, exactly as before. E2E tests run this fallback path; the relay itself is checked by hand on production (MK-75's QA).
- A race's connection now waits up to 3 s for the credentials before ICE starts (well inside MK-73's 20 s connect limit).
- Rotating the key: create a new one in Cloudflare (Realtime → TURN), update both Vercel env vars, redeploy.
