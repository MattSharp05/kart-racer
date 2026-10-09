import { NEUTRAL_INPUT, type InputFrame, type SimEvent } from '../sim/types';
import { showToast } from '../ui/toast';
import { buzzesFor } from './haptics';
import { RemoteHub, type SlotInfo } from './hub';
import type { BuzzKind } from './protocol';
import { REMOTE } from './config';
import { remoteLinks, type RemoteLinks, type RemoteNet } from './links';
import { isPairingCode, newPairingCode } from './url';

/**
 * This desktop's phone controllers (MK-146): one pairing per page, started the first time the
 * Add Controllers panel opens, kept for the page's life so phones stay paired across races. Until
 * split-screen (MK-144) binds slots to players, the phone in slot 1 drives player 1
 * (`remoteInput(0)`, merged into `PlayerInput`).
 */

/**
 * Slots whose phone drives a player today: slot 1 → player 1. A drop in another slot doesn't
 * pause the race until split-screen (MK-144) gives those phones a kart.
 */
const DRIVING_SLOTS = 1;

export interface RemoteSetup extends RemoteNet {
  /** The page's query string: `&pair=<code>` fixes the pairing code (tests, QA links). */
  search: string;
  /** Pauses the race if one is running (a phone dropped, the panel opened over it, MK-147: a phone's pause). */
  pause(): void;
  /** The kart slot `slot`'s phone drives, or null (MK-147: where its buzzes come from). */
  kartOf?(slot: number): number | null;
  /** Subscribes to the sim's events each tick (MK-147: buzzes). */
  onEvents?(listener: (events: SimEvent[]) => void): void;
}

let setup: RemoteSetup | null = null;
let hub: RemoteHub | null = null;

/** Called once at boot (`main.ts`). */
export function installRemotes(next: RemoteSetup): void {
  setup = next;
  // Phones feel their own kart's hits and mini-turbos (MK-147).
  next.onEvents?.((events) => {
    if (!hub || events.length === 0) return;
    for (let slot = 0; slot < DRIVING_SLOTS; slot += 1) {
      const kart = next.kartOf?.(slot);
      if (kart === null || kart === undefined) continue;
      for (const kind of buzzesFor(events, kart)) hub.buzz(slot, kind);
    }
  });
}

/** The pairing, started on first use. */
export function remoteHub(): RemoteHub {
  if (hub) return hub;
  const current = setup ?? { local: false, search: '', pause: () => undefined };
  const fixed = (new URLSearchParams(current.search).get('pair') ?? '').toUpperCase();
  const code = isPairingCode(fixed) ? fixed : newPairingCode();
  const created = new RemoteHub(code);
  hub = created;
  const net = remoteNetOf(current);
  const peerId = `desktop-${Math.random().toString(36).slice(2, 10)}`;
  let previous: RemoteLinks | null = null;
  const link = () =>
    remoteLinks(code, peerId, net).then(
      (next) => {
        created.listen(next.links);
        previous?.close();
        previous = next;
      },
      // A renewal that fails keeps the links it has; only a first failure means no pairing.
      () => {
        if (!previous) created.markUnavailable();
      },
    );
  void link();
  setInterval(() => void link(), REMOTE.relinkEveryMs);
  created.onDrop((slot) => {
    if (slot >= DRIVING_SLOTS) {
      showToast(`Player ${slot + 1}'s phone disconnected.`);
      return;
    }
    current.pause();
    showToast(`Player ${slot + 1}'s phone disconnected. Scan its code to reconnect.`);
    void openAddControllers();
  });
  // A phone's pause button pauses the race (MK-147); Resume is on the desktop's pause menu.
  created.onPause((slot) => {
    if (slot < DRIVING_SLOTS) current.pause();
  });
  window.__remotes = {
    code,
    slots: () => created.info(),
    buzz: (slot, kind) => created.buzz(slot, kind),
  };
  return created;
}

/** The controls of the phone in `slot` (neutral before any phone pairs). */
export function remoteInput(slot: number): InputFrame {
  return hub ? hub.input(slot) : NEUTRAL_INPUT;
}

/** Opens the Add Controllers panel (starting the pairing), pausing a running race under it. */
export async function openAddControllers(): Promise<void> {
  const current = setup;
  const pairing = remoteHub();
  current?.pause();
  const { showAddControllers } = await import('../ui/screens/addControllers');
  showAddControllers(pairing, window.location.origin, remoteNetOf(current));
}

function remoteNetOf(current: RemoteSetup | null): RemoteNet {
  return {
    local: current?.local ?? false,
    ...(current?.links ? { links: current.links } : {}),
    ...(current?.relay ? { relay: current.relay } : {}),
  };
}

declare global {
  interface Window {
    /** Phone controllers' test API (MK-146): the pairing code and each slot's state. */
    __remotes?: {
      code: string;
      slots(): SlotInfo[];
      /** Sends slot `slot`'s phone a buzz, as a hit or mini-turbo would (MK-147). */
      buzz(slot: number, kind: BuzzKind): void;
    };
  }
}
