import { NEUTRAL_INPUT, type InputFrame } from '../../sim/types';
import type { ControllerState } from '../controller';
import './remote.css';

/**
 * The phone controller's screen (MK-146): a status line and plain hold-to-press buttons. MK-147
 * replaces this file (and `remote.css`) with the Wii-remote look and tilt/touch steering; the
 * page's wiring (`main.ts`) only needs `read()`, `setStatus()` and `setDebug()`.
 */
export interface RemoteView {
  /** The controls held right now. */
  read(): InputFrame;
  setStatus(state: ControllerState | 'invalid', player: number): void;
  /** The debug line (`&netdebug=1`), or null to hide it. */
  setDebug(text: string | null): void;
}

type Control = 'left' | 'right' | 'gas' | 'brake' | 'item' | 'drift';

const CONTROLS: { id: Control; label: string; area: string }[] = [
  { id: 'left', label: '◀', area: 'left' },
  { id: 'right', label: '▶', area: 'right' },
  { id: 'drift', label: 'Drift', area: 'drift' },
  { id: 'item', label: 'Item', area: 'item' },
  { id: 'brake', label: 'Brake', area: 'brake' },
  { id: 'gas', label: 'Gas', area: 'gas' },
];

const STATUS: Record<ControllerState | 'invalid', string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  lost: 'Disconnected. Scan the code on the game screen again.',
  failed: "Couldn't connect. Check the game is showing its codes, then scan again.",
  invalid: 'This link is missing its code. Scan the QR code on the game screen.',
};

export function createRemoteView(root: HTMLElement, onReconnect: () => void): RemoteView {
  const held = new Map<Control, Set<number>>();
  const status = document.createElement('p');
  status.className = 'remote-status';
  status.setAttribute('role', 'status');
  const reconnect = document.createElement('button');
  reconnect.type = 'button';
  reconnect.className = 'remote-reconnect';
  reconnect.textContent = 'Reconnect';
  reconnect.hidden = true;
  reconnect.addEventListener('click', onReconnect);
  const debug = document.createElement('pre');
  debug.className = 'remote-debug';
  debug.dataset.testid = 'remote-debug';
  debug.hidden = true;
  const pad = document.createElement('div');
  pad.className = 'remote-pad';
  for (const control of CONTROLS) pad.append(controlButton(control, held));
  const header = document.createElement('header');
  header.className = 'remote-header';
  header.append(status, reconnect);
  root.append(header, pad, debug);
  // No long-press menus, text selection or double-tap zoom while holding buttons.
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  // A touch the system took (Control Center, a notification, the app switcher) may never send its
  // pointerup: let go of everything rather than drive on by itself.
  const releaseAll = () => {
    for (const pointers of held.values()) pointers.clear();
    for (const el of pad.querySelectorAll('.held')) el.classList.remove('held');
  };
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', releaseAll);

  const down = (id: Control) => (held.get(id)?.size ?? 0) > 0;
  return {
    read: () => ({
      ...NEUTRAL_INPUT,
      throttle: down('gas') ? 1 : 0,
      brake: down('brake') ? 1 : 0,
      steer: (down('right') ? 1 : 0) - (down('left') ? 1 : 0),
      drift: down('drift'),
      item: down('item'),
    }),
    setStatus: (state, player) => {
      root.dataset.state = state;
      status.textContent =
        state === 'connected' || state === 'connecting'
          ? `Player ${player} · ${STATUS[state]}`
          : STATUS[state];
      reconnect.hidden = state !== 'lost' && state !== 'failed';
    },
    setDebug: (text) => {
      debug.hidden = text === null;
      if (text !== null) debug.textContent = text;
    },
  };
}

function controlButton(
  control: (typeof CONTROLS)[number],
  held: Map<Control, Set<number>>,
): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `remote-button remote-${control.id}`;
  el.style.gridArea = control.area;
  el.textContent = control.label;
  el.dataset.control = control.id;
  const pointers = new Set<number>();
  held.set(control.id, pointers);
  const press = (e: PointerEvent) => {
    e.preventDefault();
    pointers.add(e.pointerId);
    el.classList.add('held');
    // Keeps the press when the thumb slides off the button (fails for a pointer already gone).
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Released already: pointerup follows.
    }
  };
  const release = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) el.classList.remove('held');
  };
  el.addEventListener('pointerdown', press);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('lostpointercapture', release);
  return el;
}
