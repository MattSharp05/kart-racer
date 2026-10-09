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
 * Add Controllers panel opens, kept for the page's life so phones stay paired across races. The
 * phone in slot 1 drives player 1 (`remoteInput(0)`, merged into `PlayerInput`); slots 2–4's
 * drive players 2–4 in a local multiplayer race (MK-147: `input/sources/phone.ts`).
 */

export interface RemoteSetup extends RemoteNet {
  /** The page's query string: `&pair=<code>` fixes the pairing code (tests, QA links). */
  search: string;
  /** Pauses the race if one is running (a phone dropped or pressed Pause, or the panel opened). */
  pause(): void;
  /**
   * The kart slot `slot`'s phone drives in the race now, or null (MK-147): its buzzes come from
   * that kart, and its pause or drop pauses the race.
   */
  kartOf(slot: number): number | null;
  /** A phone connected in `slot` (MK-147: it takes its player's kart over from "Auto"). */
  connected?(slot: number): void;
  /** Subscribes to the sim's events each tick (MK-147: buzzes). */
  onEvents?(listener: (events: SimEvent[]) => void): void;
}

let setup: RemoteSetup | null = null;
let hub: RemoteHub | null = null;
/** Slots whose phone pressed pause since its player's source last asked (MK-147). */
const pausePressed = new Set<number>();

function kartOf(slot: number): number | null {
  return setup?.kartOf(slot) ?? null;
}

/** Called once at boot (`main.ts`). */
export function installRemotes(next: RemoteSetup): void {
  setup = next;
  // Phones feel their own kart's hits and mini-turbos (MK-147).
  next.onEvents?.((events) => {
    if (!hub || events.length === 0) return;
    for (let slot = 0; slot < REMOTE.slots; slot += 1) {
      const kart = kartOf(slot);
      if (kart !== null) for (const kind of buzzesFor(events, kart)) hub.buzz(slot, kind);
    }
  });
}

/** The pairing, started on first use. */
export function remoteHub(): RemoteHub {
  if (hub) return hub;
  const current = setup ?? {
    local: false,
    search: '',
    pause: () => undefined,
    kartOf: () => null,
  };
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
  let wasConnected = created.info().map((info) => info.state === 'connected');
  created.onChange(() => {
    const now = created.info().map((info) => info.state === 'connected');
    now.forEach((on, slot) => {
      if (on && !wasConnected[slot]) current.connected?.(slot);
    });
    wasConnected = now;
  });
  created.onDrop((slot) => {
    if (kartOf(slot) === null) {
      showToast(`Player ${slot + 1}'s phone disconnected.`);
      return;
    }
    current.pause();
    showToast(`Player ${slot + 1}'s phone disconnected. Scan its code to reconnect.`);
    void openAddControllers();
  });
  // A phone's pause button pauses the race (MK-147); Resume is on the desktop's pause menu. P1's
  // pauses at once; P2–P4's are taken by their player's source, so the menu says who paused.
  created.onPause((slot) => {
    if (slot === 0) current.pause();
    else if (kartOf(slot) !== null) pausePressed.add(slot);
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

/** Whether a phone is connected in `slot` (MK-147: a race gives it that player's kart). */
export function remoteSlotConnected(slot: number): boolean {
  return hub?.info()[slot]?.state === 'connected';
}

/** True once for each press of `slot`'s phone's pause button (MK-147). */
export function takeRemotePause(slot: number): boolean {
  return pausePressed.delete(slot);
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
