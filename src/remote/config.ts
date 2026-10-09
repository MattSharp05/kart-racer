/**
 * Phone controller tunables (MK-146, ADR 0013). A paired phone sends its controls this often and
 * both ends ping each other for the round-trip time shown in the debug overlay and on the
 * Add Controllers panel.
 */
export const REMOTE = {
  /** Phone slots on one desktop (one per player, epic MKE-23). */
  slots: 4,
  /** Input packets per second from a phone (a packet also says the phone is still there). */
  inputHz: 60,
  /** Each side pings the other this often, ms. */
  pingEveryMs: 500,
  /** Weight of a new RTT sample in the smoothed RTT. */
  rttSmoothing: 0.2,
  /** A phone repeats Hello this often until the desktop welcomes it, ms. */
  helloRetryMs: 250,
  /** A slot whose phone has been silent this long has dropped (the race pauses), ms. */
  dropAfterMs: 1500,
  /** A link that hasn't said which slot it is after this long is closed, ms. */
  helloTimeoutMs: 10_000,
  /** A phone that isn't welcomed within this long gives up and asks for a rescan, ms. */
  connectTimeoutMs: 25_000,
  /** How often the desktop checks its slots for silence, ms. */
  watchEveryMs: 200,
} as const;
