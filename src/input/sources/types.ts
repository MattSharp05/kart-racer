import type { InputFrame } from '../../sim/types';

/**
 * One player's controller (MK-144): whatever drives a player slot's kart. The keyboard and touch
 * controls on this device (P1), a paired phone (MK-146), or a test source (scenarios, e2e).
 * Sources never see the sim; the session maps each slot to its kart.
 */
export interface InputSource {
  /** What kind of source: `controls` (this device), `test`, `phone` (MK-146)… */
  readonly kind: string;
  /** Short name for menus: "Keyboard", "Phone", "Auto". */
  readonly label: string;
  /** The controls this tick. */
  read(): InputFrame;
  /** True once for each pause press since the last call: any slot can pause the race. */
  takePause?(): boolean;
  /**
   * Whether the kart drives itself on the centreline autopilot (a stand-in for a player with no
   * controller yet, and the scenarios' fake players). Read when a race loads.
   */
  readonly autopilot?: boolean;
  /** Frees what the source holds (listeners, a connection) when its slot lets it go. */
  dispose?(): void;
}

/**
 * Hands out controllers for empty player slots when a local race starts (MK-144). The phone
 * pairing (MK-146) is one: it returns the phone paired to that slot, or null. Providers are
 * listed in `sources/index.ts`.
 */
export interface InputSourceProvider {
  readonly id: string;
  /** The source for player slot `slot` (0-based; P2 is 1), or null if it has none. */
  claim(slot: number): InputSource | null;
}
