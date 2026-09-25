# 0006 — Supabase for rooms and leaderboards; WebRTC for race traffic

Status: Accepted · 2026-09-25 · confirmed by the MK-36 spike (P2P on 4G pending Matthew's phone test)

## Context

v2 needs private rooms (4-letter code and link, lobby presence), live race traffic (about 20–30 packets/s per player), and a global leaderboard. There's no backend today, free tiers only, and the site stays static on Vercel. Matthew suggested Supabase.

The Supabase free tier gives 200 concurrent Realtime connections and **2M Realtime messages a month**, with a per-second rate limit per project. A 4-player race relayed over Realtime Broadcast is roughly 100–150 delivered messages a second, about 25k per race. That's only about 70 races a month, and it would hit the rate limit.

## Options

1. **Supabase for everything.** Race packets go over Realtime Broadcast. Simplest, but it breaks the message quota and rate limit, and it relays over WebSocket (TCP head-of-line blocking).
2. **Supabase plus WebRTC (chosen).** Supabase Realtime handles rooms, presence, lobby state and WebRTC signaling (a few hundred messages per race). Postgres holds the leaderboard. Race packets travel peer to peer on WebRTC data channels, in a star around the host, unordered and unreliable (UDP-like). They cost nothing on any quota. Public STUN servers; no paid TURN.
3. **Cloudflare Durable Objects** (the alternative). One object per room relays WebSocket traffic. The free tier has 100k requests a day; incoming messages bill at 20:1 and outgoing messages are free, so a race costs about 1–2k requests. Reliable (no NAT problems), but it's a second account and service, it relays over TCP, and there's no database unless we also add D1.

## Decision

Option 2. All networking goes through a `Transport` interface (`src/net/transport.ts`), with a WebRTC implementation, an in-memory loopback (unit tests, lag simulation) and BroadcastChannel (same-machine e2e). Swapping in option 3 later is one new class.

## Consequences

- **Risk:** P2P can fail behind strict NATs, mostly on mobile carrier networks, where a TURN relay would be needed. The **spike measures this on real phones (Wi-Fi and 4G/5G)**. If it fails too often, we add option 3 as the race relay, which needs Matthew's OK for a free Cloudflare account.
- **Setup:** Matthew creates a free Supabase project and adds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to Vercel. The anon key is public by design; Row Level Security protects the data.
- Free Supabase projects pause after about a week without activity. A weekly GitHub Actions keep-alive query prevents that.
- The site stays static; there's no server code of our own apart from SQL (tables, RLS, one submit function).

## Spike results (MK-36, 2026-09-25)

| Measure                                                  | Result                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RTT, 2 browsers on one machine (WebRTC, host candidates) | ~1 ms ICE RTT, ~17 ms app-level (tick granularity)                                                                                                                                                                                                                                                                                          |
| RTT via Supabase Realtime (signaling only)               | one-way broadcast ≈ 50 ms; joining the channel ≈ 1.3 s                                                                                                                                                                                                                                                                                      |
| Snapshot size / bandwidth per client                     | 426 B avg, 449 B max · 8.5 KB/s down, 1.6 KB/s up (off every quota)                                                                                                                                                                                                                                                                         |
| Signaling messages per connection                        | 3 sent + 2–3 received on a same-machine link (host-ready/join, offer, answer, ICE). With STUN (host + srflx candidates) expect ~6–15 per side                                                                                                                                                                                               |
| Supabase messages per race                               | ≈ 100–150 for a 4-player room (signaling only; each broadcast is delivered to the other members). The 2M/month free quota covers > 10k races                                                                                                                                                                                                |
| Connection path                                          | "P2P" on the test machine. **Phone on 4G: pending** (Matthew's manual check on MK-36)                                                                                                                                                                                                                                                       |
| Real-browser Supabase signaling                          | Verified from Node (supabase-js, same project + anon key). The cloud builder's sandboxed Chromium can't open Supabase's WebSocket through its egress proxy, so the browser run is `NET_SPIKE_SIGNALING=supabase NET_SPIKE_URL=<deploy> pnpm exec playwright test netSpike -g "two browsers" --project=desktop-chrome` from a normal machine |

**Recommendation:** keep option 2 (Supabase signaling + WebRTC P2P, public STUN). The WebRTC data channel (`ordered: false, maxRetransmits: 0`) behaves as planned and costs no quota. If Matthew's 4G test can't connect, or later rooms fail often, add option 3 (Durable Objects relay) behind the same `Transport` interface; it's filed as a Backlog ticket so the decision is ready.
