import type { SimEvent } from '../sim/types';

/**
 * Netcode tunables (ADR 0005; the numbers come from the MK-36 spike, see ADR 0005 → Spike
 * results). Feel-related ones get retuned in the netcode polish ticket.
 */
export const NET = {
  /** The host snapshots every this many ticks: 60 / 3 = 20 Hz. */
  snapshotEveryTicks: 3,
  /** Inputs repeated in every input packet (newest first), so a lost packet loses nothing. */
  inputRedundancy: 6,
  /** The client runs this many ticks beyond a full RTT ahead of the host, so inputs arrive early. */
  inputBufferTicks: 2,
  /** Extra lead the client adds, one tick at a time, when the host reports its input was late. */
  maxExtraLeadTicks: 4,
  /** The client eases 1 tick per snapshot towards its target tick; further off than this, it jumps. */
  maxTickDrift: 4,
  /** The host repeats Start this often until the client's first input arrives, ticks (0.25 s). */
  startRepeatTicks: 15,
  /** The client pings the host this often, ticks (0.5 s). */
  pingEveryTicks: 30,
  /** RTT assumed until the first pong, ms. */
  defaultRttMs: 100,
  /** Weight of a new RTT sample in the smoothed RTT. */
  rttSmoothing: 0.2,
  /** Each event packet repeats the host's events from this many ticks back (0.5 s = 10 snapshots). */
  eventRedundancyTicks: 30,
  /**
   * Reconcile only on mismatch (ADR 0005 → Spike results): the client keeps its prediction when,
   * at the snapshot's tick, every kart is within this distance of the host's, m…
   */
  reconcilePosition: 0.05,
  /** …and its speed within this, m/s (plus the same discrete state: see `client.ts`). */
  reconcileSpeed: 0.2,
  /**
   * …and no other player's input changed by more than this (steer, throttle or brake) or pressed
   * a different button since the prediction was made. Smaller changes are left to the position
   * check at the next snapshot.
   */
  remoteInputTolerance: 0.25,
  /** Predicted states and inputs older than this many ticks behind the newest snapshot are dropped. */
  historyTicks: 120,
} as const;

/**
 * Events only the host decides (ADR 0005: hits, pickups, laps, finishes). The host sends these in
 * Event messages; clients drop the ones their own prediction produces. The rest (drift, bumps,
 * landings…) are cosmetic and predicted locally.
 */
export const HOST_EVENTS: ReadonlySet<SimEvent['type']> = new Set<SimEvent['type']>([
  'phaseChanged',
  'countdown',
  'go',
  'checkpoint',
  'lap',
  'finish',
  'positionChange',
  'rocketStart',
  'stall',
  'respawn',
  'itemBoxHit',
  'itemGranted',
  'itemUsed',
  'kartHit',
  'star',
  'lightning',
]);
