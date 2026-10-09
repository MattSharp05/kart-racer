import type { RemoteHub, SlotInfo } from '../../remote/hub';
import type { RemoteNet } from '../../remote/links';
import { qrSvg } from '../../remote/qr';
import { remoteUrl } from '../../remote/url';
import { button, heading } from './common';
import './addControllers.css';

/**
 * Add Controllers (MK-146): a QR code per player slot that a phone scans to become that player's
 * controller, and each slot's phone as connected (with its round trip) or disconnected. Opens from
 * the title, over a paused race, and by itself when a phone drops (rescan its code to reconnect).
 * A panel over whatever is showing rather than a router screen, so it can open over any of them.
 */

/** How often the round-trip times refresh while the panel is open, ms. */
const REFRESH_MS = 500;

let open: { root: HTMLElement; close: () => void } | null = null;

export function showAddControllers(hub: RemoteHub, origin: string, net: RemoteNet): void {
  if (open?.root.isConnected) return;
  const root = document.createElement('div');
  root.className = 'add-controllers';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'add-controllers-title');
  const panel = document.createElement('div');
  panel.className = 'add-controllers-panel';
  const title = heading('h2', 'Add controllers');
  title.id = 'add-controllers-title';
  const help = document.createElement('p');
  help.className = 'add-controllers-help';
  help.textContent =
    "Scan a code with a phone's camera to use the phone as that player's controller. " +
    "Player 1's phone drives your kart; players 2–4 race once split-screen arrives.";
  const error = document.createElement('p');
  error.className = 'add-controllers-error';
  error.hidden = true;
  const list = document.createElement('ol');
  list.className = 'add-controllers-slots';
  const cards = hub
    .info()
    .map((info) => slotCard(info, remoteUrl(origin, hub.code, info.slot, net)));
  list.append(...cards.map((card) => card.el));
  const code = document.createElement('p');
  code.className = 'add-controllers-code';
  code.textContent = `Pairing code ${hub.code}`;
  const close = () => {
    clearInterval(timer);
    stopWatching();
    root.remove();
    window.removeEventListener('keydown', onKey, true);
    open = null;
  };
  const done = button('Done', close, 'primary add-controllers-done');
  panel.append(title, help, error, list, code, done);
  root.append(panel);
  document.body.append(root);

  const refresh = () => {
    error.hidden = !hub.unavailable;
    error.textContent = "Couldn't reach the pairing service. Check the connection and reload.";
    hub.info().forEach((info, i) => cards[i]?.update(info));
  };
  const stopWatching = hub.onChange(refresh);
  const timer = setInterval(refresh, REFRESH_MS);
  // Esc closes the panel and goes no further (not to the pause menu or title underneath).
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' && e.key !== 'Enter') return;
    e.stopImmediatePropagation();
    e.preventDefault();
    close();
  };
  window.addEventListener('keydown', onKey, true);
  refresh();
  done.focus();
  open = { root, close };
}

/** Closes the panel if it's open. */
export function closeAddControllers(): void {
  open?.close();
}

function slotCard(info: SlotInfo, url: string) {
  const el = document.createElement('li');
  el.className = 'add-controllers-slot';
  el.dataset.slot = String(info.slot + 1);
  const name = document.createElement('span');
  name.className = 'add-controllers-player';
  name.textContent = `Player ${info.slot + 1}`;
  const qr = qrSvg(url, `QR code for player ${info.slot + 1}'s phone`);
  qr.classList.add('add-controllers-qr');
  const phone = document.createElement('span');
  phone.className = 'add-controllers-phone';
  phone.textContent = '📱';
  phone.setAttribute('aria-hidden', 'true');
  const status = document.createElement('span');
  status.className = 'add-controllers-status';
  el.append(name, qr, phone, status);
  let shown = '';
  return {
    el,
    update(next: SlotInfo) {
      const text =
        next.state === 'connected'
          ? `Connected${next.rttMs === null ? '' : ` · ${Math.round(next.rttMs)} ms`}`
          : next.state === 'disconnected'
            ? 'Disconnected · scan to reconnect'
            : 'Scan to connect';
      if (text === shown && el.dataset.state === next.state) return;
      shown = text;
      el.dataset.state = next.state;
      status.textContent = text;
    },
  };
}
