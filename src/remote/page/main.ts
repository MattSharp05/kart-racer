import { REMOTE } from '../config';
import { RemoteController } from '../controller';
import { remoteLinks } from '../links';
import { parseRemoteParams } from '../url';
import { createRemoteView, type PadState } from './view';

/**
 * `/remote?room=<code>&slot=<n>` (MK-146): the page a phone opens from the desktop's QR code. It
 * links to the desktop (`remoteLinks`), says which slot it is, and sends the held controls
 * `REMOTE.inputHz` times a second; the desktop's buzzes vibrate it (MK-147). Reconnecting is
 * reloading the page (or rescanning the code).
 */

/** How often the page runs the controller, ms: once per input packet. */
const TICK_MS = 1000 / REMOTE.inputHz;

const root = document.querySelector<HTMLElement>('#remote');
if (!root) throw new Error('Missing #remote');
const params = parseRemoteParams(window.location.search);
const view = createRemoteView(root, () => window.location.reload());

if (!params) {
  view.setStatus('invalid', 0);
} else {
  const player = params.slot + 1;
  view.setStatus('connecting', player);
  document.title = `Player ${player} · Kart Racer controller`;
  const peerId = `phone-${Math.random().toString(36).slice(2, 10)}`;
  void remoteLinks(params.code, peerId, params.net).then(
    ({ links, close }) => {
      let controller: RemoteController | null = null;
      const join = links.join(() => controller?.failed());
      controller = new RemoteController(params.slot, join.transport);
      const current = controller;
      const felt: string[] = [];
      current.onBuzz((kind) => {
        felt.push(kind);
        view.buzz(kind);
      });
      const timer = setInterval(() => {
        const pad = view.read();
        current.setInput(pad.input, pad.buttons);
        current.tick();
        if (params.netdebug) {
          const rtt = current.rttMs === null ? '–' : `${Math.round(current.rttMs)} ms`;
          view.setDebug(`RTT ${rtt} · seq ${current.seq} · ${current.state}`);
        }
      }, TICK_MS);
      current.onChange(() => {
        view.setStatus(current.state, player);
        if (current.state === 'connected') join.stop();
        if (current.state === 'lost' || current.state === 'failed') {
          clearInterval(timer);
          close();
        }
      });
      window.addEventListener('pagehide', () => current.close());
      window.__remote = {
        state: () => current.state,
        seq: () => current.seq,
        rttMs: () => current.rttMs,
        pad: () => view.read(),
        steering: () => view.steering,
        buzzes: () => [...felt],
      };
    },
    () => view.setStatus('failed', player),
  );
  keepAwake();
}

/** Keeps the phone's screen on while it's a controller (a locked phone drops out). */
function keepAwake(): void {
  const request = () =>
    navigator.wakeLock?.request('screen').catch(() => undefined) ?? Promise.resolve();
  void request();
  // Some browsers grant the lock only after a tap.
  document.addEventListener('pointerdown', () => void request(), { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void request();
  });
}

declare global {
  interface Window {
    /** The phone controller's test API (MK-146). */
    __remote?: {
      state(): string;
      seq(): number;
      rttMs(): number | null;
      /** What the controls send right now (MK-147). */
      pad(): PadState;
      steering(): 'tilt' | 'touch';
      /** The buzzes the desktop sent so far (MK-147). */
      buzzes(): string[];
    };
  }
}
