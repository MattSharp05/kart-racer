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
  /**
   * The desktop renews its pairing links this often, ms (3 h), so phones that pair hours later get
   * fresh TURN credentials (`/api/turn` hands out 4-hour ones, ADR 0008). Paired phones stay.
   */
  relinkEveryMs: 3 * 60 * 60 * 1000,
} as const;

/**
 * The phone controller page (MK-147): tilt steering held sideways like a remote in a wheel, and
 * each player's colour.
 */
export const REMOTE_PAD = {
  /** Degrees of wheel turn around the calibrated level that still steer straight. */
  tiltDeadZoneDeg: 4,
  /** Degrees of wheel turn for full lock (a Wii-Wheel-like quarter turn is ~90°; this is lighter). */
  tiltSensitivityDeg: 30,
  /** "Level" calibration keeps the neutral within ± this many degrees. */
  tiltNeutralMaxDeg: 45,
  /** Seconds after tilt starts with no motion reading before the page says there's no sensor. */
  noReadingSeconds: 2,
  /** Player 1–4's colour (the phone's lit light and accents). */
  slotColours: ['#e63946', '#3a86ff', '#2bb673', '#f4a100'],
  /** Vibration patterns, ms on/off (`navigator.vibrate`; iPhones don't vibrate from the web). */
  buzz: { hit: [90, 50, 90], turbo: [35] },
} as const;
