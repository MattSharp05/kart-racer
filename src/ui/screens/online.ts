import { registerScreen } from '../router';
import { button, heading, row } from './common';
import './online.css';

export interface OnlineProps {
  onCreate: () => void;
  onJoin: () => void;
  onBack: () => void;
  /** Why we're back here (room not found, host left…). */
  message?: string;
  /** Work in progress ("Creating room…"): the buttons wait for it. */
  busy?: string;
}

declare module '../router' {
  interface ScreenProps {
    online: OnlineProps;
  }
}

/** Status line under a heading: an error (`role=alert`) or work in progress (`role=status`). */
export function statusLine(message: string | undefined, busy: string | undefined): HTMLElement {
  const line = document.createElement('p');
  line.className = busy ? 'online-status busy' : 'online-status error';
  line.setAttribute('role', busy ? 'status' : 'alert');
  line.textContent = busy ?? message ?? '';
  line.hidden = !line.textContent;
  return line;
}

/** Online (MK-40): create a room or join one with a code; Esc goes back to the title. */
registerScreen('online', (panel, { onCreate, onJoin, onBack, message, busy }) => {
  const create = button('Create room', onCreate, 'primary');
  const join = button('Join with code', onJoin);
  create.disabled = join.disabled = busy !== undefined;
  const intro = document.createElement('p');
  intro.className = 'online-intro';
  intro.textContent = 'Race up to 3 friends. AI fills the empty karts.';
  panel.append(
    heading('h2', 'Online'),
    intro,
    statusLine(message, busy),
    row('actions', create, join),
    button('Back', onBack),
  );
  if (!busy) create.focus();
  return {
    onKey: (e) => {
      if (e.key === 'Escape') onBack();
    },
  };
});
