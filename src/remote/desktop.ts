import { NEUTRAL_INPUT, type InputFrame } from '../sim/types';
import { showToast } from '../ui/toast';
import { RemoteHub, type SlotInfo } from './hub';
import { remoteLinks, type RemoteNet } from './links';
import { isPairingCode, newPairingCode } from './url';

/**
 * This desktop's phone controllers (MK-146): one pairing per page, started the first time the
 * Add Controllers panel opens, kept for the page's life so phones stay paired across races. Until
 * split-screen (MK-144) binds slots to players, the phone in slot 1 drives player 1
 * (`remoteInput(0)`, merged into `PlayerInput`).
 */

export interface RemoteSetup extends RemoteNet {
  /** The page's query string: `&pair=<code>` fixes the pairing code (tests, QA links). */
  search: string;
  /** Pauses the race if one is running (a phone dropped, or the panel opened over it). */
  pause(): void;
}

let setup: RemoteSetup | null = null;
let hub: RemoteHub | null = null;

/** Called once at boot (`main.ts`). */
export function installRemotes(next: RemoteSetup): void {
  setup = next;
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
  remoteLinks(code, `desktop-${Math.random().toString(36).slice(2, 10)}`, net).then(
    ({ links }) => created.listen(links),
    () => created.markUnavailable(),
  );
  created.onDrop((slot) => {
    current.pause();
    showToast(`Player ${slot + 1}'s phone disconnected. Scan its code to reconnect.`);
    void openAddControllers();
  });
  window.__remotes = { code, slots: () => created.info() };
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
    __remotes?: { code: string; slots(): SlotInfo[] };
  }
}
